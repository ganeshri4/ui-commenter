/**
 * Main Content Script for Comments (Chrome Extension MV3)
 * Mounts Isolated Shadow DOM, manages overlay pointer physics,
 * watches SPA route mutations, handles Mode A/B commenting, and syncs via Supabase.
 */

import { SHADOW_STYLES } from "./shadow-styles.js";
import { DomInspector } from "./dom-inspector.js";
import { CanvasOverlay } from "./canvas-overlay.js";
import { PinManager } from "./pin-manager.js";
import { ThreadPopover } from "./thread-popover.js";
import { DockToolbar } from "./dock-toolbar.js";
import {
  normalizeUrlPath,
  fetchActiveComments,
  insertComment,
  insertReply,
  setCommentResolved,
  deleteComment,
  subscribeToPageChannel
} from "../lib/supabase.js";
import { CONFIG } from "../config.js";

class UICommenterOverlay {
  constructor() {
    this.currentUrlPath = normalizeUrlPath();
    this.currentUser = null;
    this.currentMode = "browse"; // 'browse' | 'dom' | 'canvas'
    this.realtimeChannel = null;
    this.comments = [];
    this.isInitialized = false;
    this.isEnabled = false;

    // Immediately listen for extension toggle commands
    this.setupMessageListeners();
  }

  async activate() {
    if (this.isEnabled) return;
    this.isEnabled = true;

    if (!this.isInitialized) {
      this.isInitialized = true;
      // 1. Mount Isolated Shadow DOM
      this.mountShadowDom();

      // 2. Load Auth State
      await this.loadAuthState();

      // 3. Initialize UI Components inside Shadow DOM
      this.initOverlayComponents();

      // 4. Setup SPA Route Change Detection
      this.setupSpaRouteWatcher();
    } else if (this.shadowHost) {
      this.shadowHost.style.display = "block";
    }

    // Load and subscribe to route comments
    await this.loadRouteComments(this.currentUrlPath);
  }

  deactivate(notifyBackground = false) {
    if (!this.isEnabled && !this.isInitialized) return;
    this.isEnabled = false;

    if (this.shadowHost) {
      this.shadowHost.style.display = "none";
    }

    // Reset interaction modes
    this.handleModeChange("browse");
    if (this.dockToolbar) this.dockToolbar.setMode("browse");

    if (this.threadPopover) {
      this.threadPopover.closePopover();
      this.threadPopover.closeDraft();
    }

    if (this.pinManager) {
      this.pinManager.clearActivePin();
    }

    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
    }

    if (notifyBackground) {
      chrome.runtime.sendMessage({ type: "OVERLAY_TURNED_OFF" }).catch(() => {});
    }
  }

  mountShadowDom() {
    // Clean up any stale host from previous extension reload
    const existingHost = document.getElementById("ui-commenter-host");
    if (existingHost) {
      existingHost.remove();
    }

    const host = document.createElement("div");
    host.id = "ui-commenter-host";
    // Ensure host sits above any staging modal/banner
    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "100vw";
    host.style.height = "100vh";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "none";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "none";

    (document.body || document.documentElement).appendChild(host);

    this.shadowHost = host;
    this.shadowRoot = host.attachShadow({ mode: "open" });

    // Inject isolated styles
    const styleEl = document.createElement("style");
    styleEl.textContent = SHADOW_STYLES;
    this.shadowRoot.appendChild(styleEl);
  }

  async loadAuthState() {
    return new Promise((resolve) => {
      // Request validated session from background service worker
      chrome.runtime.sendMessage({ type: "GET_SESSION" }, (res) => {
        if (chrome.runtime.lastError) {
          // Background not ready — fall back to local storage
          chrome.storage.local.get([CONFIG.STORAGE_KEYS.USER_PROFILE], (result) => {
            this.currentUser = result[CONFIG.STORAGE_KEYS.USER_PROFILE] || null;
            resolve(this.currentUser);
          });
          return;
        }
        this.currentUser = (res && res.user) || null;
        resolve(this.currentUser);
      });
    });
  }

  initOverlayComponents() {
    // Thread Popover & Draft Card
    this.threadPopover = new ThreadPopover(this.shadowRoot, {
      currentUser: this.currentUser,
      onSaveDraft: (payload) => this.handleSaveComment(payload),
      onAddReply: (commentId, content) => this.handleAddReply(commentId, content),
      onResolve: (commentId, isResolved) => this.handleResolveComment(commentId, isResolved),
      onDelete: (commentId) => this.handleDeleteComment(commentId),
      onClose: () => this.pinManager.clearActivePin()
    });

    // Pin Manager
    this.pinManager = new PinManager(this.shadowRoot, (comment, pinEl) => {
      this.threadPopover.openThread(comment, pinEl);
    });

    // Mode A: DOM Inspector
    this.domInspector = new DomInspector(this.shadowRoot, (payload) => {
      this.promptDraft(payload);
    });

    // Mode B: Canvas Overlay
    this.canvasOverlay = new CanvasOverlay(this.shadowRoot, (payload) => {
      this.promptDraft(payload);
    });

    // Figma Floating Dock
    this.dockToolbar = new DockToolbar(this.shadowRoot, {
      initialMode: this.currentMode,
      currentUser: this.currentUser,
      onModeChange: (mode) => this.handleModeChange(mode),
      onToggleSidePanel: () => this.toggleSidePanel(),
      onSignIn: () => this.triggerSignIn(),
      onSignOut: () => this.triggerSignOut(),
      onCloseOverlay: () => this.deactivate(true)
    });
  }

  handleModeChange(mode) {
    this.currentMode = mode;

    if (mode === "dom") {
      this.domInspector.activate();
      this.canvasOverlay.deactivate();
    } else if (mode === "canvas") {
      this.domInspector.deactivate();
      this.canvasOverlay.activate();
    } else {
      // Browse mode
      this.domInspector.deactivate();
      this.canvasOverlay.deactivate();
    }
  }

  promptDraft(payload) {
    // Check if user is authenticated; if not, prompt sign in or proceed as guest
    if (!this.currentUser) {
      const wantLogin = confirm("You are currently reviewing as Guest. Would you like to sign in with Google first?");
      if (wantLogin) {
        this.triggerSignIn();
        return;
      }
    }

    this.threadPopover.openDraft(payload, () => {
      if (this.domInspector) this.domInspector.unlock();
      // Reset back to browse mode after pin drop
      this.dockToolbar.setMode("browse");
    });
  }

  async handleSaveComment(payload) {
    const commentRecord = {
      url_path: this.currentUrlPath,
      user_id: this.currentUser?.id || null,
      mode: payload.mode,
      selector: payload.selector || null,
      x_percent: payload.x_percent,
      y_percent: payload.y_percent,
      x_px: payload.x_px,
      y_px: payload.y_px,
      viewport_width: payload.viewport_width,
      target_text: payload.target_text || null,
      content: payload.content,
      is_resolved: false,
      created_at: new Date().toISOString()
    };

    try {
      const saved = await insertComment(commentRecord);
      // Immediately add locally if realtime takes a moment
      this.upsertCommentLocally(saved);
    } catch (err) {
      console.error("[Comments] Failed to insert comment:", err);
      // Local fallback for offline/preview
      commentRecord.id = "local-" + Date.now();
      commentRecord.profiles = {
        full_name: this.currentUser?.user_metadata?.full_name || "Guest",
        avatar_url: this.currentUser?.user_metadata?.avatar_url || null
      };
      this.upsertCommentLocally(commentRecord);
    }
  }

  async handleAddReply(commentId, content) {
    if (!this.currentUser) {
      alert("Please sign in to reply.");
      this.triggerSignIn();
      return;
    }

    try {
      const reply = await insertReply(commentId, this.currentUser.id, content);
      const target = this.comments.find(c => c.id === commentId);
      if (target) {
        if (!target.replies) target.replies = [];
        target.replies.push(reply);
        // Refresh popover if open
        const activePin = this.shadowRoot.querySelector(`.uc-pin[data-comment-id="${commentId}"]`);
        if (activePin) this.threadPopover.openThread(target, activePin);
      }
    } catch (err) {
      console.error("[Comments] Failed to add reply:", err);
    }
  }

  async handleResolveComment(commentId, isResolved) {
    try {
      await setCommentResolved(commentId, isResolved);
      // Remove from canvas pins locally
      this.comments = this.comments.filter(c => c.id !== commentId);
      this.pinManager.setComments(this.comments);
    } catch (err) {
      console.error("[Comments] Failed to resolve comment:", err);
      this.comments = this.comments.filter(c => c.id !== commentId);
      this.pinManager.setComments(this.comments);
    }
  }

  async handleDeleteComment(commentId) {
    try {
      await deleteComment(commentId);
      this.comments = this.comments.filter(c => c.id !== commentId);
      this.pinManager.setComments(this.comments);
    } catch (err) {
      console.error("[Comments] Failed to delete comment:", err);
    }
  }

  upsertCommentLocally(comment) {
    const idx = this.comments.findIndex(c => c.id === comment.id);
    if (idx >= 0) {
      this.comments[idx] = comment;
    } else {
      this.comments.push(comment);
    }
    this.pinManager.setComments(this.comments);
  }

  async loadRouteComments(urlPath) {
    this.currentUrlPath = urlPath;
    this.comments = await fetchActiveComments(urlPath);
    this.pinManager.setComments(this.comments);

    // Subscribe to Realtime & Presence
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe();
    }

    this.realtimeChannel = await subscribeToPageChannel(urlPath, this.currentUser, {
      onCommentChange: (payload) => {
        if (payload.eventType === "INSERT") {
          this.loadRouteComments(this.currentUrlPath);
        } else if (payload.eventType === "UPDATE") {
          if (payload.new.is_resolved) {
            this.comments = this.comments.filter(c => c.id !== payload.new.id);
            this.pinManager.setComments(this.comments);
          } else {
            this.loadRouteComments(this.currentUrlPath);
          }
        } else if (payload.eventType === "DELETE") {
          this.comments = this.comments.filter(c => c.id !== payload.old.id);
          this.pinManager.setComments(this.comments);
        }
      },
      onReplyChange: () => {
        this.loadRouteComments(this.currentUrlPath);
      },
      onPresenceSync: (collaborators) => {
        this.dockToolbar.setCollaborators(collaborators);
      }
    });
  }

  /**
   * SPA Route Change Detection:
   * Handles Next.js, Vue, React SPA navigation without full page reloads.
   */
  setupSpaRouteWatcher() {
    let lastUrl = window.location.href;

    const checkRoute = () => {
      if (!this.isEnabled) return;
      const currUrl = window.location.href;
      if (currUrl !== lastUrl) {
        lastUrl = currUrl;
        const normalized = normalizeUrlPath(currUrl);
        if (normalized !== this.currentUrlPath) {
          console.log("[Comments] SPA Route change detected:", normalized);
          this.threadPopover?.closePopover();
          this.threadPopover?.closeDraft();
          this.loadRouteComments(normalized);
        }
      }
    };

    // 1. Monkey patch pushState and replaceState
    const originalPush = history.pushState;
    history.pushState = function (...args) {
      const res = originalPush.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
      return res;
    };

    const originalReplace = history.replaceState;
    history.replaceState = function (...args) {
      const res = originalReplace.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
      return res;
    };

    window.addEventListener("popstate", checkRoute);
    window.addEventListener("hashchange", checkRoute);
    window.addEventListener("locationchange", checkRoute);

    // 2. MutationObserver on document.title as additional trigger
    const titleEl = document.querySelector("title");
    if (titleEl) {
      const titleObserver = new MutationObserver(() => checkRoute());
      titleObserver.observe(titleEl, { childList: true, subtree: true, characterData: true });
    }

    // 3. Fallback heartbeat poller (every 800ms)
    setInterval(checkRoute, 800);
  }

  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "TOGGLE_OVERLAY") {
        if (message.enabled) {
          this.activate();
        } else {
          this.deactivate(false);
        }
        sendResponse({ success: true, isEnabled: this.isEnabled });
        return;
      }

      if (message.type === "AUTH_STATE_CHANGED") {
        this.currentUser = message.user;
        if (this.dockToolbar) this.dockToolbar.setCurrentUser(this.currentUser);
        if (this.threadPopover) this.threadPopover.setCurrentUser(this.currentUser);
        if (this.isEnabled) this.loadRouteComments(this.currentUrlPath);
        sendResponse({ success: true });
        return;
      }

      if (message.type === "SCROLL_TO_COMMENT") {
        if (this.isEnabled) {
          this.scrollToCommentPin(message.commentId);
        }
        sendResponse({ success: true });
        return;
      }

      if (message.type === "REFRESH_COMMENTS") {
        if (this.isEnabled) {
          this.loadRouteComments(this.currentUrlPath);
        }
        sendResponse({ success: true });
        return;
      }
    });
  }

  scrollToCommentPin(commentId) {
    if (!this.shadowRoot) return;
    const pinEl = this.shadowRoot.querySelector(`.uc-pin[data-comment-id="${commentId}"]`);
    const comment = this.comments.find(c => c.id === commentId);

    if (comment) {
      const scrollY = (comment.y_percent / 100) * document.documentElement.scrollHeight;
      window.scrollTo({ top: Math.max(0, scrollY - 200), behavior: "smooth" });

      if (pinEl) {
        this.pinManager.setActivePin(commentId);
        this.threadPopover.openThread(comment, pinEl);
      }
    }
  }

  toggleSidePanel() {
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  }

  triggerSignIn() {
    // The background will broadcast AUTH_STATE_CHANGED on success,
    // which is caught by the message listener below and updates dockToolbar.
    chrome.runtime.sendMessage({ type: "TRIGGER_GOOGLE_AUTH" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && !res.success) {
        console.warn("[Comments] Sign-in failed:", res.error);
      }
      // On success AUTH_STATE_CHANGED broadcast handles dock re-render
    });
  }

  triggerSignOut() {
    chrome.runtime.sendMessage({ type: "TRIGGER_SIGN_OUT" });
  }
}

// Global instance guard (ensures single listener across re-injections)
if (!window.__UI_COMMENTER_INSTANCE__) {
  window.__UI_COMMENTER_INSTANCE__ = new UICommenterOverlay();
}
