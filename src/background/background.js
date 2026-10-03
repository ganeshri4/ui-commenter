/**
 * Service Worker for UI Commenter (Chrome Extension MV3)
 * Handles Google OAuth via chrome.identity.launchWebAuthFlow,
 * Supabase Background Proxy Bridge (completely immune to host page CSP/CORS),
 * side panel controls, token storage, and cross-tab broadcasts.
 */

import { CONFIG, getEffectiveConfig } from "../config.js";
import {
  fetchActiveComments,
  fetchAllComments,
  insertComment,
  insertReply,
  setCommentResolved,
  deleteComment,
  subscribeToPageChannel
} from "../lib/supabase.js";

// Tab overlay state tracking: tabId -> boolean
const activeTabOverlays = new Map();

// Active Realtime channels managed in the background worker: urlPath -> { channel, refCount }
const activeRealtimeChannels = new Map();

function setupRealtimeChannel(urlPath, currentUser) {
  if (activeRealtimeChannels.has(urlPath)) {
    const item = activeRealtimeChannels.get(urlPath);
    item.refCount++;
    return;
  }

  subscribeToPageChannel(urlPath, currentUser, {
    onCommentChange: (payload) => {
      broadcastMessage({ type: "REALTIME_COMMENT_CHANGE", urlPath, payload });
    },
    onReplyChange: (payload) => {
      broadcastMessage({ type: "REALTIME_REPLY_CHANGE", urlPath, payload });
    },
    onPresenceSync: (collaborators) => {
      broadcastMessage({ type: "REALTIME_PRESENCE_SYNC", urlPath, collaborators });
    }
  }).then((channel) => {
    activeRealtimeChannels.set(urlPath, { channel, refCount: 1 });
  }).catch((err) => console.warn("[UI Commenter] Realtime subscribe error:", err));
}

function teardownRealtimeChannel(urlPath) {
  if (activeRealtimeChannels.has(urlPath)) {
    const item = activeRealtimeChannels.get(urlPath);
    item.refCount--;
    if (item.refCount <= 0) {
      if (item.channel && item.channel.unsubscribe) {
        item.channel.unsubscribe();
      }
      activeRealtimeChannels.delete(urlPath);
    }
  }
}

/**
 * Toolbar Action Click: Toggles UI Commenter ON / OFF for active tab (FireShot style)
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://") || tab.url?.startsWith("edge://")) {
    return;
  }

  const isCurrentlyActive = !!activeTabOverlays.get(tab.id);
  const nextState = !isCurrentlyActive;
  activeTabOverlays.set(tab.id, nextState);

  if (nextState) {
    // Turn ON: Set badge and enable overlay
    await chrome.action.setBadgeText({ tabId: tab.id, text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#18A0FB" });

    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY", enabled: true });
    } catch (err) {
      // Content script was not yet injected on this tab; inject it dynamically
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["dist/content.bundle.js"]
        });
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY", enabled: true }).catch(() => {});
        }, 150);
      } catch (injectErr) {
        console.warn("[UI Commenter] Script injection error:", injectErr);
      }
    }
  } else {
    // Turn OFF: Clear badge and disable overlay
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY", enabled: false });
    } catch (err) {}
  }
});

/**
 * Initiates Google OAuth flow using chrome.identity.launchWebAuthFlow
 */
async function handleGoogleOAuth() {
  const config = await getEffectiveConfig();
  const redirectUri = chrome.identity.getRedirectURL();

  console.log("[UI Commenter] Launching Google OAuth with redirectUri:", redirectUri);

  // Supabase Google Auth URL
  const authUrl = `${config.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          console.error("[UI Commenter] Auth error:", chrome.runtime.lastError.message);
          return reject(new Error(chrome.runtime.lastError.message));
        }

        if (!redirectUrl) {
          return reject(new Error("Authentication cancelled or returned empty URL"));
        }

        try {
          // Parse hash fragment tokens
          const parsedUrl = new URL(redirectUrl);
          const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const expiresIn = hashParams.get("expires_in");

          if (!accessToken) {
            const queryParams = new URLSearchParams(parsedUrl.search);
            const err = queryParams.get("error_description") || "No access token found in redirect URL";
            return reject(new Error(err));
          }

          // Fetch user details from Supabase using access token
          const userResp = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
            headers: {
              apikey: config.SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`
            }
          });

          if (!userResp.ok) {
            throw new Error(`Failed to fetch user profile: ${userResp.statusText}`);
          }

          const user = await userResp.json();

          // Construct and store session
          const session = {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: expiresIn,
            expires_at: Math.floor(Date.now() / 1000) + parseInt(expiresIn || "3600", 10),
            user
          };

          await chrome.storage.local.set({
            [CONFIG.STORAGE_KEYS.AUTH_SESSION]: session,
            [CONFIG.STORAGE_KEYS.USER_PROFILE]: user
          });

          // Sync / upsert profile record in Supabase profiles table
          try {
            await fetch(`${config.SUPABASE_URL}/rest/v1/profiles`, {
              method: "POST",
              headers: {
                apikey: config.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates"
              },
              body: JSON.stringify({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.email,
                avatar_url: user.user_metadata?.avatar_url || null,
                updated_at: new Date().toISOString()
              })
            });
          } catch (syncErr) {
            console.warn("[UI Commenter] Profile sync notice:", syncErr);
          }

          // Broadcast state to all tabs
          broadcastMessage({
            type: "AUTH_STATE_CHANGED",
            user,
            session
          });

          resolve({ session, user });
        } catch (err) {
          console.error("[UI Commenter] Token parse error:", err);
          reject(err);
        }
      }
    );
  });
}

/**
 * Signs out current user and clears local storage
 */
async function handleSignOut() {
  await chrome.storage.local.remove([
    CONFIG.STORAGE_KEYS.AUTH_SESSION,
    CONFIG.STORAGE_KEYS.USER_PROFILE
  ]);

  broadcastMessage({
    type: "AUTH_STATE_CHANGED",
    user: null,
    session: null
  });
}

/**
 * Broadcasts message to all tabs
 */
function broadcastMessage(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    });
  });
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- Supabase Background Network Bridge ---
  if (message.type === "API_FETCH_ACTIVE_COMMENTS") {
    fetchActiveComments(message.urlPath)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "API_FETCH_ALL_COMMENTS") {
    fetchAllComments(message.urlPath)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "API_INSERT_COMMENT") {
    insertComment(message.commentData)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "API_INSERT_REPLY") {
    insertReply(message.commentId, message.userId, message.content)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "API_SET_RESOLVED") {
    setCommentResolved(message.commentId, message.isResolved)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "API_DELETE_COMMENT") {
    deleteComment(message.commentId)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "API_SUBSCRIBE_CHANNEL") {
    setupRealtimeChannel(message.urlPath, message.currentUser);
    sendResponse({ success: true });
    return;
  }

  if (message.type === "API_UNSUBSCRIBE_CHANNEL") {
    teardownRealtimeChannel(message.urlPath);
    sendResponse({ success: true });
    return;
  }

  // --- Auth & Side Panel Handlers ---
  if (message.type === "TRIGGER_GOOGLE_AUTH") {
    handleGoogleOAuth()
      .then((res) => sendResponse({ success: true, user: res.user }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "TRIGGER_SIGN_OUT") {
    handleSignOut()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "OPEN_SIDE_PANEL") {
    if (sender.tab?.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(console.error);
    }
    sendResponse({ success: true });
  }

  if (message.type === "OVERLAY_TURNED_OFF") {
    const tabId = sender.tab?.id;
    if (tabId) {
      activeTabOverlays.set(tabId, false);
      chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }
    sendResponse({ success: true });
  }

  if (message.type === "GET_REDIRECT_URI") {
    sendResponse({ redirectUri: chrome.identity.getRedirectURL() });
  }
});

// Watch tab updates for SPA navigation fallback and state cleanup
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    activeTabOverlays.set(tabId, false);
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  }
  if (changeInfo.url) {
    chrome.tabs.sendMessage(tabId, {
      type: "TAB_URL_UPDATED",
      url: changeInfo.url
    }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabOverlays.delete(tabId);
});
