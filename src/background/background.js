/**
 * Service Worker for Comments (Chrome Extension MV3)
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
  }).catch((err) => console.warn("[Comments] Realtime subscribe error:", err));
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
 * Restore saved session on service worker startup / wake-up.
 * Broadcasts AUTH_STATE_CHANGED to all open tabs so the dock and sidepanel
 * show the correct user without forcing a sign-in after every extension reload.
 */
async function restoreSessionIfAvailable() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG.STORAGE_KEYS.AUTH_SESSION, CONFIG.STORAGE_KEYS.USER_PROFILE], (result) => {
      const session = result[CONFIG.STORAGE_KEYS.AUTH_SESSION] || null;
      const user = result[CONFIG.STORAGE_KEYS.USER_PROFILE] || null;
      if (session && user) {
        // Check if token is still valid (expires_at in epoch seconds)
        const nowSec = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < nowSec) {
          // Session expired — clear it
          chrome.storage.local.remove([CONFIG.STORAGE_KEYS.AUTH_SESSION, CONFIG.STORAGE_KEYS.USER_PROFILE]);
          broadcastMessage({ type: "AUTH_STATE_CHANGED", user: null, session: null });
        } else {
          // Valid session — restore
          broadcastMessage({ type: "AUTH_STATE_CHANGED", user, session });
        }
      }
      resolve();
    });
  });
}

// Restore session when service worker wakes up
chrome.runtime.onInstalled.addListener(() => restoreSessionIfAvailable());
chrome.runtime.onStartup.addListener(() => restoreSessionIfAvailable());

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

    // Fetch saved session and send it to this tab after overlay activates
    chrome.storage.local.get([CONFIG.STORAGE_KEYS.AUTH_SESSION, CONFIG.STORAGE_KEYS.USER_PROFILE], (result) => {
      const savedUser = result[CONFIG.STORAGE_KEYS.USER_PROFILE] || null;
      const savedSession = result[CONFIG.STORAGE_KEYS.AUTH_SESSION] || null;
      if (savedUser && savedSession) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (!savedSession.expires_at || savedSession.expires_at >= nowSec) {
          // Send auth state to this specific tab (with delay to let content script mount)
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
              type: "AUTH_STATE_CHANGED",
              user: savedUser,
              session: savedSession
            }).catch(() => {});
          }, 300);
        }
      }
    });

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
        console.warn("[Comments] Script injection error:", injectErr);
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

  console.log("[Comments] Launching Google OAuth with redirectUri:", redirectUri);

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
          console.error("[Comments] Auth error:", chrome.runtime.lastError.message);
          return reject(new Error(chrome.runtime.lastError.message));
        }

        if (!redirectUrl) {
          return reject(new Error("Authentication cancelled or returned empty URL"));
        }

        try {
          // Parse hash and search fragment tokens
          const parsedUrl = new URL(redirectUrl);
          const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
          const queryParams = new URLSearchParams(parsedUrl.search);

          // Check if an error was returned in redirect
          const errorDesc = hashParams.get("error_description") || queryParams.get("error_description") || hashParams.get("error") || queryParams.get("error");
          if (errorDesc) {
            return reject(new Error(errorDesc));
          }

          let accessToken = hashParams.get("access_token") || queryParams.get("access_token");
          let refreshToken = hashParams.get("refresh_token") || queryParams.get("refresh_token");
          let expiresIn = hashParams.get("expires_in") || queryParams.get("expires_in");
          let user = null;

          // If code is returned instead of access_token, exchange code for session
          if (!accessToken) {
            const code = queryParams.get("code") || hashParams.get("code");
            if (code) {
              const supabase = await getSupabase();
              const { data: exchangeData, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
              if (exchangeErr) throw exchangeErr;
              accessToken = exchangeData.session?.access_token;
              refreshToken = exchangeData.session?.refresh_token;
              expiresIn = exchangeData.session?.expires_in;
              user = exchangeData.user;
            }
          }

          if (!accessToken) {
            return reject(new Error("No access token found in redirect URL"));
          }

          // Fetch user details from Supabase if not already fetched
          if (!user) {
            const userResp = await fetch(`${config.SUPABASE_URL}/auth/v1/user`, {
              headers: {
                apikey: config.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${accessToken}`
              }
            });

            if (!userResp.ok) {
              throw new Error(`Failed to fetch user profile: ${userResp.statusText}`);
            }

            user = await userResp.json();
          }

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
            console.warn("[Comments] Profile sync notice:", syncErr);
          }

          // Broadcast state to all tabs
          broadcastMessage({
            type: "AUTH_STATE_CHANGED",
            user,
            session
          });

          resolve({ session, user });
        } catch (err) {
          console.error("[Comments] Token parse error:", err);
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
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch((err) => {
        console.warn("[Comments] Failed to open side panel by tabId:", err.message);
        if (windowId) {
          chrome.sidePanel.open({ windowId }).catch((wErr) => {
            console.warn("[Comments] Failed to open side panel by windowId:", wErr.message);
          });
        }
      });
    } else if (windowId) {
      chrome.sidePanel.open({ windowId }).catch(console.warn);
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

  if (message.type === "GET_SESSION") {
    chrome.storage.local.get([CONFIG.STORAGE_KEYS.AUTH_SESSION, CONFIG.STORAGE_KEYS.USER_PROFILE], (result) => {
      const session = result[CONFIG.STORAGE_KEYS.AUTH_SESSION] || null;
      const user = result[CONFIG.STORAGE_KEYS.USER_PROFILE] || null;
      // Validate token expiry
      if (session && session.expires_at) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (session.expires_at < nowSec) {
          chrome.storage.local.remove([CONFIG.STORAGE_KEYS.AUTH_SESSION, CONFIG.STORAGE_KEYS.USER_PROFILE]);
          sendResponse({ success: true, user: null, session: null });
          return;
        }
      }
      sendResponse({ success: true, user, session });
    });
    return true;
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
