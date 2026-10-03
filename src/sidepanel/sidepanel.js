/**
 * Side Panel Controller for UI Commenter (Chrome MV3)
 * Lists all active and resolved comments for the active browser tab,
 * supports nested replies, real-time sync, deep linking to page pins, and settings.
 */

import { renderIcon } from "../lib/icons.js";
import { CONFIG } from "../config.js";
import {
  normalizeUrlPath,
  fetchAllComments,
  insertReply,
  setCommentResolved,
  deleteComment
} from "../lib/supabase.js";

class SidePanelController {
  constructor() {
    this.currentUrlPath = "";
    this.currentTabId = null;
    this.currentUser = null;
    this.allComments = [];
    this.activeTab = "active"; // 'active' | 'resolved'
    this.searchQuery = "";

    // DOM Elements
    this.elCurrentUrl = document.getElementById("current-url");
    this.elAuthBanner = document.getElementById("auth-banner");
    this.elCommentsList = document.getElementById("comments-list");
    this.elEmptyState = document.getElementById("empty-state");
    this.elTabActive = document.getElementById("tab-active");
    this.elTabResolved = document.getElementById("tab-resolved");
    this.elCountActive = document.getElementById("count-active");
    this.elCountResolved = document.getElementById("count-resolved");
    this.elFilterInput = document.getElementById("filter-input");
    this.elRefreshBtn = document.getElementById("refresh-btn");
    this.elSettingsBtn = document.getElementById("settings-btn");
    this.elSettingsModal = document.getElementById("settings-modal");
    this.elCloseSettingsBtn = document.getElementById("close-settings-btn");
    this.elSaveSettingsBtn = document.getElementById("save-settings-btn");
    this.elCopyRedirectBtn = document.getElementById("copy-redirect-btn");
    this.elSettingUrl = document.getElementById("setting-supabase-url");
    this.elSettingKey = document.getElementById("setting-supabase-key");
    this.elSettingRedirect = document.getElementById("setting-redirect-uri");

    this.init();
  }

  async init() {
    this.setupIcons();
    this.setupEventListeners();
    await this.loadAuthUser();
    await this.detectActiveTab();
    await this.loadComments();
    this.listenToTabChanges();
  }

  setupIcons() {
    this.elRefreshBtn.innerHTML = renderIcon("arrowsClockwise", 16);
    this.elSettingsBtn.innerHTML = renderIcon("gear", 16);
  }

  setupEventListeners() {
    this.elTabActive.addEventListener("click", () => this.switchTab("active"));
    this.elTabResolved.addEventListener("click", () => this.switchTab("resolved"));

    this.elFilterInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.render();
    });

    this.elRefreshBtn.addEventListener("click", () => {
      this.loadComments();
      if (this.currentTabId) {
        chrome.tabs.sendMessage(this.currentTabId, { type: "REFRESH_COMMENTS" }).catch(() => {});
      }
    });

    // Settings Modal
    this.elSettingsBtn.addEventListener("click", () => this.openSettings());
    this.elCloseSettingsBtn.addEventListener("click", () => this.closeSettings());
    this.elSaveSettingsBtn.addEventListener("click", () => this.saveSettings());
    this.elCopyRedirectBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(this.elSettingRedirect.value);
      this.elCopyRedirectBtn.textContent = "Copied!";
      setTimeout(() => (this.elCopyRedirectBtn.textContent = "Copy"), 1500);
    });

    // Runtime messages
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "AUTH_STATE_CHANGED") {
        this.currentUser = msg.user;
        this.renderAuthBanner();
        this.loadComments();
      }
    });
  }

  async loadAuthUser() {
    // Use GET_SESSION for reliable session state (validates expiry)
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_SESSION" }, (res) => {
        if (chrome.runtime.lastError) {
          // Background not responding — fall back to local storage
          chrome.storage.local.get([CONFIG.STORAGE_KEYS.USER_PROFILE], (result) => {
            this.currentUser = result[CONFIG.STORAGE_KEYS.USER_PROFILE] || null;
            this.renderAuthBanner();
            resolve();
          });
          return;
        }
        this.currentUser = (res && res.user) || null;
        this.renderAuthBanner();
        resolve();
      });
    });
  }

  renderAuthBanner(state = "idle") {
    if (state === "loading") {
      this.elAuthBanner.innerHTML = `
        <span style="color: #666666;">Signing in…</span>
        <span style="font-size: 11px; color: #18A0FB; display: flex; align-items: center; gap: 4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10" stroke="#18A0FB" stroke-width="3" stroke-dasharray="31 10" stroke-linecap="round"/>
          </svg>
          Opening Google…
        </span>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      `;
      return;
    }

    if (this.currentUser) {
      const name = this.currentUser.user_metadata?.full_name || this.currentUser.email || "User";
      const avatarUrl = this.currentUser.user_metadata?.avatar_url;
      this.elAuthBanner.innerHTML = `
        <div class="auth-user-info">
          <div class="auth-avatar">
            ${avatarUrl ? `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : name[0].toUpperCase()}
          </div>
          <span style="font-weight: 600; color: #222222;">${this.escapeHtml(name)}</span>
        </div>
        <button id="auth-signout-btn" class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;">Sign Out</button>
      `;

      document.getElementById("auth-signout-btn")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "TRIGGER_SIGN_OUT" });
      });
    } else {
      this.elAuthBanner.innerHTML = `
        <span style="color: #666666;">Guest Reviewer</span>
        <button id="auth-signin-btn" class="btn btn-primary" style="padding: 4px 10px; font-size: 11px; display: flex; align-items: center; gap: 4px;">
          ${renderIcon("google", 12)} Sign In with Google
        </button>
      `;

      document.getElementById("auth-signin-btn")?.addEventListener("click", () => {
        this.renderAuthBanner("loading");
        chrome.runtime.sendMessage({ type: "TRIGGER_GOOGLE_AUTH" }, (res) => {
          if (chrome.runtime.lastError || !res) {
            this.renderAuthBanner(); // reset to guest state
            return;
          }
          if (!res.success) {
            // Show error briefly then restore sign-in button
            this.elAuthBanner.innerHTML = `
              <span style="color: #F24822; font-size: 11px;">⚠ Sign-in failed: ${this.escapeHtml(res.error || "Unknown error")}</span>
              <button id="auth-retry-btn" class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;">Retry</button>
            `;
            document.getElementById("auth-retry-btn")?.addEventListener("click", () => {
              this.renderAuthBanner(); // let AUTH_STATE_CHANGED handle it, or re-render guest
            });
          }
          // On success, AUTH_STATE_CHANGED broadcast will call renderAuthBanner with the user
        });
      });
    }
  }

  async detectActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      this.currentTabId = tab.id;
      this.currentUrlPath = normalizeUrlPath(tab.url);
      this.elCurrentUrl.textContent = this.currentUrlPath;
      this.elCurrentUrl.title = tab.url;
    }
  }

  listenToTabChanges() {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      this.currentTabId = activeInfo.tabId;
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab && tab.url) {
        const normalized = normalizeUrlPath(tab.url);
        if (normalized !== this.currentUrlPath) {
          this.currentUrlPath = normalized;
          this.elCurrentUrl.textContent = normalized;
          this.elCurrentUrl.title = tab.url;
          this.loadComments();
        }
      }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tabId === this.currentTabId && changeInfo.url) {
        const normalized = normalizeUrlPath(changeInfo.url);
        if (normalized !== this.currentUrlPath) {
          this.currentUrlPath = normalized;
          this.elCurrentUrl.textContent = normalized;
          this.elCurrentUrl.title = tab.url;
          this.loadComments();
        }
      }
    });
  }

  async loadComments() {
    if (!this.currentUrlPath) return;
    this.allComments = await fetchAllComments(this.currentUrlPath);
    this.render();
  }

  switchTab(tab) {
    this.activeTab = tab;
    if (tab === "active") {
      this.elTabActive.classList.add("active");
      this.elTabResolved.classList.remove("active");
    } else {
      this.elTabResolved.classList.add("active");
      this.elTabActive.classList.remove("active");
    }
    this.render();
  }

  render() {
    const activeComments = this.allComments.filter((c) => !c.is_resolved);
    const resolvedComments = this.allComments.filter((c) => c.is_resolved);

    this.elCountActive.textContent = activeComments.length;
    this.elCountResolved.textContent = resolvedComments.length;

    let targetList = this.activeTab === "active" ? activeComments : resolvedComments;

    // Filter by search query
    if (this.searchQuery) {
      targetList = targetList.filter((c) => {
        const contentMatch = c.content.toLowerCase().includes(this.searchQuery);
        const textMatch = c.target_text && c.target_text.toLowerCase().includes(this.searchQuery);
        const authorMatch = c.profiles?.full_name?.toLowerCase().includes(this.searchQuery) ||
                            c.profiles?.email?.toLowerCase().includes(this.searchQuery);
        return contentMatch || textMatch || authorMatch;
      });
    }

    this.elCommentsList.innerHTML = "";

    if (targetList.length === 0) {
      this.elEmptyState.style.display = "flex";
      this.elCommentsList.style.display = "none";
    } else {
      this.elEmptyState.style.display = "none";
      this.elCommentsList.style.display = "flex";

      targetList.forEach((comment) => {
        const card = this.createCommentCard(comment);
        this.elCommentsList.appendChild(card);
      });
    }
  }

  createCommentCard(comment) {
    const card = document.createElement("div");
    card.className = `thread-card ${comment.is_resolved ? "resolved" : ""}`;
    card.dataset.commentId = comment.id;

    const profile = comment.profiles || {};
    const name = profile.full_name || profile.email || "Anonymous";
    const timeAgo = this.formatTimeAgo(comment.created_at);
    const isAuthor = this.currentUser && this.currentUser.id === comment.user_id;

    // Header
    const header = document.createElement("div");
    header.className = "card-header";
    header.innerHTML = `
      <div class="author-meta">
        <div class="author-avatar">
          ${profile.avatar_url ? `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;">` : name[0].toUpperCase()}
        </div>
        <div>
          <div class="author-name">${this.escapeHtml(name)}</div>
          <div class="time-ago">${timeAgo}</div>
        </div>
      </div>
      <div class="card-badges">
        <span class="mode-badge ${comment.mode || "dom"}">${comment.mode === "dom" ? "DOM" : "Canvas"}</span>
      </div>
    `;
    card.appendChild(header);

    // Target Text Quote
    if (comment.target_text) {
      const quote = document.createElement("div");
      quote.className = "target-quote";
      quote.textContent = `“${comment.target_text}”`;
      card.appendChild(quote);
    }

    // Body
    const body = document.createElement("div");
    body.className = "card-body";
    body.textContent = comment.content;
    card.appendChild(body);

    // Replies list
    const replies = comment.replies || [];
    if (replies.length > 0) {
      const repliesBox = document.createElement("div");
      repliesBox.className = "replies-box";

      replies.forEach((r) => {
        const rProfile = r.profiles || {};
        const rName = rProfile.full_name || rProfile.email || "Anonymous";
        const row = document.createElement("div");
        row.className = "reply-row";
        row.innerHTML = `
          <div class="reply-meta">
            <span class="reply-user">${this.escapeHtml(rName)}</span>
            <span class="time-ago">${this.formatTimeAgo(r.created_at)}</span>
          </div>
          <div class="reply-text">${this.escapeHtml(r.content)}</div>
        `;
        repliesBox.appendChild(row);
      });

      card.appendChild(repliesBox);
    }

    // Inline Reply Input
    const replyInputRow = document.createElement("div");
    replyInputRow.className = "sidepanel-reply-input";
    replyInputRow.style.padding = "6px 12px";

    const replyInput = document.createElement("input");
    replyInput.placeholder = "Write a reply…";

    const replyBtn = document.createElement("button");
    replyBtn.className = "btn btn-secondary";
    replyBtn.style.padding = "4px 8px";
    replyBtn.innerHTML = renderIcon("paperPlaneTilt", 12);

    const submitReply = async () => {
      const val = replyInput.value.trim();
      if (!val) return;
      if (!this.currentUser) {
        alert("Please sign in to reply.");
        return;
      }
      try {
        await insertReply(comment.id, this.currentUser.id, val);
        replyInput.value = "";
        await this.loadComments();
        // Refresh tab
        if (this.currentTabId) {
          chrome.tabs.sendMessage(this.currentTabId, { type: "REFRESH_COMMENTS" }).catch(() => {});
        }
      } catch (e) {
        console.error("Reply error:", e);
      }
    };

    replyBtn.addEventListener("click", submitReply);
    replyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitReply();
    });

    replyInputRow.appendChild(replyInput);
    replyInputRow.appendChild(replyBtn);
    card.appendChild(replyInputRow);

    // Card Actions Footer
    const footer = document.createElement("div");
    footer.className = "card-actions";

    const links = document.createElement("div");
    links.className = "action-links";

    // Locate on page button
    const locateBtn = document.createElement("button");
    locateBtn.className = "text-btn";
    locateBtn.innerHTML = `${renderIcon("arrowUpRight", 12)} Locate Pin`;
    locateBtn.addEventListener("click", () => {
      if (this.currentTabId) {
        chrome.tabs.sendMessage(this.currentTabId, {
          type: "SCROLL_TO_COMMENT",
          commentId: comment.id
        }).catch(() => {});
      }
    });
    links.appendChild(locateBtn);

    // Resolve / Unresolve toggle
    const resolveBtn = document.createElement("button");
    resolveBtn.className = "text-btn resolve";
    resolveBtn.innerHTML = comment.is_resolved
      ? `${renderIcon("arrowsClockwise", 12)} Reopen`
      : `${renderIcon("check", 12)} Resolve`;

    resolveBtn.addEventListener("click", async () => {
      await setCommentResolved(comment.id, !comment.is_resolved);
      await this.loadComments();
      if (this.currentTabId) {
        chrome.tabs.sendMessage(this.currentTabId, { type: "REFRESH_COMMENTS" }).catch(() => {});
      }
    });
    links.appendChild(resolveBtn);

    // Delete button
    if (isAuthor) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "text-btn delete";
      deleteBtn.innerHTML = `${renderIcon("trash", 12)} Delete`;
      deleteBtn.addEventListener("click", async () => {
        if (confirm("Delete this comment permanently?")) {
          await deleteComment(comment.id);
          await this.loadComments();
          if (this.currentTabId) {
            chrome.tabs.sendMessage(this.currentTabId, { type: "REFRESH_COMMENTS" }).catch(() => {});
          }
        }
      });
      links.appendChild(deleteBtn);
    }

    footer.appendChild(links);
    card.appendChild(footer);

    return card;
  }

  async openSettings() {
    chrome.storage.local.get([CONFIG.STORAGE_KEYS.CUSTOM_CONFIG], (res) => {
      const custom = res[CONFIG.STORAGE_KEYS.CUSTOM_CONFIG] || {};
      this.elSettingUrl.value = custom.supabaseUrl || CONFIG.SUPABASE_URL;
      this.elSettingKey.value = custom.supabaseAnonKey || CONFIG.SUPABASE_ANON_KEY;
    });

    this.elSettingRedirect.value = chrome.identity.getRedirectURL();
    this.elSettingsModal.style.display = "flex";
  }

  closeSettings() {
    this.elSettingsModal.style.display = "none";
  }

  async saveSettings() {
    const supabaseUrl = this.elSettingUrl.value.trim();
    const supabaseAnonKey = this.elSettingKey.value.trim();

    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.CUSTOM_CONFIG]: { supabaseUrl, supabaseAnonKey }
    });

    this.closeSettings();
    alert("Settings saved! Reloading comments…");
    this.loadComments();
  }

  formatTimeAgo(isoString) {
    if (!isoString) return "just now";
    const date = new Date(isoString);
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Start side panel
document.addEventListener("DOMContentLoaded", () => {
  new SidePanelController();
});
