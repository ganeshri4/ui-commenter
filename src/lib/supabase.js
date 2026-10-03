/**
 * Supabase Client Wrapper with Chrome Background Proxy Bridge.
 * Bypasses web page CSP/CORS: All database and Realtime operations in Content Scripts
 * and UI components are automatically routed through the background service worker
 * (which possesses unrestricted host_permissions: ["<all_urls>"]).
 */

import { createClient } from "@supabase/supabase-js";
import { CONFIG, getEffectiveConfig } from "../config.js";

// Check if currently executing in the background service worker context
const isBackgroundWorker = typeof window === "undefined" || !window.document;

// Storage adapter compatible with Chrome Extension MV3
const chromeStorageAdapter = {
  getItem: async (key) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve(result[key] || null);
        });
      });
    }
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  },
  setItem: async (key, value) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  },
  removeItem: async (key) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.remove([key], () => resolve());
      });
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  }
};

let supabaseInstance = null;

/**
 * Initializes or returns the cached Supabase client (used in background service worker)
 */
export async function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  const config = await getEffectiveConfig();
  const url = config.SUPABASE_URL;
  const key = config.SUPABASE_ANON_KEY;

  supabaseInstance = createClient(url, key, {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });

  return supabaseInstance;
}

/**
 * Helper to dispatch API requests to background service worker
 */
async function sendBackgroundApi(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!response) {
        return reject(new Error("No response from background worker"));
      }
      if (!response.success) {
        return reject(new Error(response.error || "Background API request failed"));
      }
      resolve(response.data);
    });
  });
}

/**
 * Normalizes URL paths for consistent cross-session commenting
 * Strips hash fragments and trailing slashes for standard pages
 */
export function normalizeUrlPath(url = window?.location?.href || "") {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "file:") {
      return `file://${parsed.pathname}`;
    }
    let path = parsed.origin + parsed.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return path;
  } catch (e) {
    return url;
  }
}

/**
 * Computes ISO timestamp for 5 days ago (120 hours auto-expiration filter)
 */
export function getFiveDaysAgoIso() {
  const cutoff = new Date(Date.now() - CONFIG.COMMENT_EXPIRATION_MS);
  return cutoff.toISOString();
}

/**
 * Fetches active (unresolved) comments for the current URL path created within last 5 days
 */
export async function fetchActiveComments(urlPath) {
  if (!isBackgroundWorker) {
    try {
      return await sendBackgroundApi("API_FETCH_ACTIVE_COMMENTS", { urlPath });
    } catch (err) {
      console.warn("[UI Commenter] Error fetching comments via background:", err.message);
      return [];
    }
  }

  const supabase = await getSupabase();
  const cutoff = getFiveDaysAgoIso();

  const { data, error } = await supabase
    .from("comments")
    .select(`
      *,
      profiles:user_id (id, full_name, email, avatar_url),
      replies (
        id,
        comment_id,
        user_id,
        content,
        created_at,
        profiles:user_id (id, full_name, email, avatar_url)
      )
    `)
    .eq("url_path", urlPath)
    .eq("is_resolved", false)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[UI Commenter] Supabase fetch error:", error.message);
    throw error;
  }

  return data || [];
}

/**
 * Fetches all comments (including resolved) for Side Panel view within last 5 days
 */
export async function fetchAllComments(urlPath) {
  if (!isBackgroundWorker) {
    try {
      return await sendBackgroundApi("API_FETCH_ALL_COMMENTS", { urlPath });
    } catch (err) {
      console.warn("[UI Commenter] Error fetching all comments via background:", err.message);
      return [];
    }
  }

  const supabase = await getSupabase();
  const cutoff = getFiveDaysAgoIso();

  const { data, error } = await supabase
    .from("comments")
    .select(`
      *,
      profiles:user_id (id, full_name, email, avatar_url),
      replies (
        id,
        comment_id,
        user_id,
        content,
        created_at,
        profiles:user_id (id, full_name, email, avatar_url)
      )
    `)
    .eq("url_path", urlPath)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[UI Commenter] Supabase fetchAll error:", error.message);
    throw error;
  }

  return data || [];
}

/**
 * Inserts a new comment
 */
export async function insertComment(commentData) {
  if (!isBackgroundWorker) {
    return await sendBackgroundApi("API_INSERT_COMMENT", { commentData });
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("comments")
    .insert([commentData])
    .select(`
      *,
      profiles:user_id (id, full_name, email, avatar_url),
      replies ()
    `)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Adds a reply to an existing comment
 */
export async function insertReply(commentId, userId, content) {
  if (!isBackgroundWorker) {
    return await sendBackgroundApi("API_INSERT_REPLY", { commentId, userId, content });
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("replies")
    .insert([{
      comment_id: commentId,
      user_id: userId,
      content
    }])
    .select(`
      *,
      profiles:user_id (id, full_name, email, avatar_url)
    `)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Resolves or unresolves a comment
 */
export async function setCommentResolved(commentId, isResolved) {
  if (!isBackgroundWorker) {
    return await sendBackgroundApi("API_SET_RESOLVED", { commentId, isResolved });
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("comments")
    .update({ is_resolved: isResolved, updated_at: new Date().toISOString() })
    .eq("id", commentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Permanently deletes a comment
 */
export async function deleteComment(commentId) {
  if (!isBackgroundWorker) {
    return await sendBackgroundApi("API_DELETE_COMMENT", { commentId });
  }

  const supabase = await getSupabase();
  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) throw error;
  return true;
}

/**
 * Sets up a Realtime Channel for comments and collaborative Presence on a specific URL
 */
export async function subscribeToPageChannel(urlPath, currentUser, callbacks) {
  if (!isBackgroundWorker) {
    // Content script / sidepanel: request background worker to maintain the channel
    chrome.runtime.sendMessage({
      type: "API_SUBSCRIBE_CHANNEL",
      urlPath,
      currentUser
    }).catch(() => {});

    const listener = (msg) => {
      if (msg.type === "REALTIME_COMMENT_CHANGE" && msg.urlPath === urlPath) {
        if (callbacks.onCommentChange) callbacks.onCommentChange(msg.payload);
      }
      if (msg.type === "REALTIME_REPLY_CHANGE" && msg.urlPath === urlPath) {
        if (callbacks.onReplyChange) callbacks.onReplyChange(msg.payload);
      }
      if (msg.type === "REALTIME_PRESENCE_SYNC" && msg.urlPath === urlPath) {
        if (callbacks.onPresenceSync) callbacks.onPresenceSync(msg.collaborators);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    return {
      unsubscribe: () => {
        chrome.runtime.onMessage.removeListener(listener);
        chrome.runtime.sendMessage({
          type: "API_UNSUBSCRIBE_CHANNEL",
          urlPath
        }).catch(() => {});
      }
    };
  }

  // Executing in background service worker context:
  const supabase = await getSupabase();
  const sanitizedPath = encodeURIComponent(urlPath).slice(0, 64);
  const channelName = `ui-comments:${sanitizedPath}`;

  const channel = supabase.channel(channelName, {
    config: {
      presence: { key: currentUser?.id || "guest-" + Math.random().toString(36).slice(2, 8) }
    }
  });

  channel
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, (payload) => {
      const itemUrl = payload.new?.url_path || payload.old?.url_path;
      if ((!itemUrl || itemUrl === urlPath) && callbacks.onCommentChange) {
        callbacks.onCommentChange(payload);
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "replies" }, (payload) => {
      if (callbacks.onReplyChange) callbacks.onReplyChange(payload);
    })
    .on("presence", { event: "sync" }, () => {
      const presenceState = channel.presenceState();
      const collaborators = [];
      Object.keys(presenceState).forEach((key) => {
        presenceState[key].forEach((p) => collaborators.push(p));
      });
      if (callbacks.onPresenceSync) callbacks.onPresenceSync(collaborators);
    });

  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && currentUser) {
      await channel.track({
        user_id: currentUser.id,
        full_name: currentUser.user_metadata?.full_name || currentUser.email || "Anonymous",
        avatar_url: currentUser.user_metadata?.avatar_url || null,
        email: currentUser.email,
        online_at: new Date().toISOString()
      });
    }
  });

  return channel;
}
