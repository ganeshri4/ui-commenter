/**
 * In-Page Figma-Style Comments Side Drawer for Comments Everywhere
 * Renders an interactive sidebar inside the Shadow DOM overlay, providing
 * instant viewing of all active and resolved comment threads, deep linking/locating
 * pins on the page, replying to threads, and resolving/deleting comments.
 */

import { renderIcon } from "../lib/icons.js";

export class CommentsDrawer {
  constructor(shadowRoot, options = {}) {
    this.shadowRoot = shadowRoot;
    this.currentUrlPath = options.currentUrlPath || window.location.pathname;
    this.currentUser = options.currentUser || null;
    this.comments = [];
    this.activeTab = "active"; // 'active' | 'resolved'
    this.searchQuery = "";
    this.isOpen = false;

    this.onLocate = options.onLocate;
    this.onResolve = options.onResolve;
    this.onDelete = options.onDelete;
    this.onAddReply = options.onAddReply;
    this.onOpenStateChange = options.onOpenStateChange;

    this.container = document.createElement("div");
    this.container.className = "uc-drawer";
    this.shadowRoot.appendChild(this.container);

    this.render();
  }

  open() {
    this.isOpen = true;
    this.container.classList.add("open");
    if (this.onOpenStateChange) this.onOpenStateChange(true);
    this.render();
  }

  close() {
    this.isOpen = false;
    this.container.classList.remove("open");
    if (this.onOpenStateChange) this.onOpenStateChange(false);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  setRoute(urlPath) {
    this.currentUrlPath = urlPath;
    if (this.isOpen) {
      this.render();
    }
  }

  setCurrentUser(user) {
    this.currentUser = user;
    if (this.isOpen) {
      this.render();
    }
  }

  setComments(allComments) {
    this.comments = allComments || [];
    if (this.isOpen) {
      this.render();
    }
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  render() {
    this.container.innerHTML = "";

    // 1. Header
    const header = document.createElement("div");
    header.className = "uc-drawer-header";

    // Brand row
    const brandRow = document.createElement("div");
    brandRow.className = "uc-drawer-brand-row";

    const titleEl = document.createElement("div");
    titleEl.className = "uc-drawer-title";
    titleEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#18A0FB"/>
        <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/>
        <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/>
        <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/>
        <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/>
      </svg>
      <span>Comments Everywhere</span>
    `;

    const closeBtn = document.createElement("button");
    closeBtn.className = "uc-drawer-close-btn";
    closeBtn.setAttribute("data-tooltip", "Close Panel");
    closeBtn.innerHTML = renderIcon("x", 16);
    closeBtn.addEventListener("click", () => this.close());

    brandRow.appendChild(titleEl);
    brandRow.appendChild(closeBtn);
    header.appendChild(brandRow);

    // Route bar
    const routeBar = document.createElement("div");
    routeBar.className = "uc-drawer-route-bar";
    routeBar.innerHTML = `
      <span class="uc-drawer-route-label">ROUTE</span>
      <span class="uc-drawer-route-value" title="${this.currentUrlPath}">${this.escapeHtml(this.currentUrlPath)}</span>
    `;
    header.appendChild(routeBar);

    // Tabs: Active vs Resolved
    const activeComments = this.comments.filter(c => !c.is_resolved);
    const resolvedComments = this.comments.filter(c => c.is_resolved);

    const tabsRow = document.createElement("div");
    tabsRow.className = "uc-drawer-tabs-row";

    const activeTabBtn = document.createElement("button");
    activeTabBtn.className = `uc-drawer-tab-btn ${this.activeTab === "active" ? "active" : ""}`;
    activeTabBtn.innerHTML = `Active <span class="uc-drawer-badge">${activeComments.length}</span>`;
    activeTabBtn.addEventListener("click", () => this.switchTab("active"));

    const resolvedTabBtn = document.createElement("button");
    resolvedTabBtn.className = `uc-drawer-tab-btn ${this.activeTab === "resolved" ? "active" : ""}`;
    resolvedTabBtn.innerHTML = `Resolved <span class="uc-drawer-badge">${resolvedComments.length}</span>`;
    resolvedTabBtn.addEventListener("click", () => this.switchTab("resolved"));

    tabsRow.appendChild(activeTabBtn);
    tabsRow.appendChild(resolvedTabBtn);
    header.appendChild(tabsRow);

    // Search filter
    const searchBox = document.createElement("div");
    searchBox.className = "uc-drawer-search-box";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "uc-drawer-search-input";
    searchInput.placeholder = "Filter comments or author…";
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderBody(bodyEl);
    });
    searchBox.appendChild(searchInput);
    header.appendChild(searchBox);

    this.container.appendChild(header);

    // 2. Body List
    const bodyEl = document.createElement("div");
    bodyEl.className = "uc-drawer-body";
    this.renderBody(bodyEl);
    this.container.appendChild(bodyEl);
  }

  renderBody(bodyEl) {
    bodyEl.innerHTML = "";

    const activeComments = this.comments.filter(c => !c.is_resolved);
    const resolvedComments = this.comments.filter(c => c.is_resolved);
    let targetList = this.activeTab === "active" ? activeComments : resolvedComments;

    if (this.searchQuery) {
      targetList = targetList.filter(c => {
        const contentMatch = (c.content || "").toLowerCase().includes(this.searchQuery);
        const textMatch = (c.target_text || "").toLowerCase().includes(this.searchQuery);
        const authorMatch = (c.profiles?.full_name || "").toLowerCase().includes(this.searchQuery) ||
                            (c.profiles?.email || "").toLowerCase().includes(this.searchQuery);
        return contentMatch || textMatch || authorMatch;
      });
    }

    if (targetList.length === 0) {
      const empty = document.createElement("div");
      empty.className = "uc-drawer-empty";
      empty.innerHTML = `
        <div style="font-size: 28px;">💬</div>
        <div style="font-weight: 600; color: #444444; font-size: 13px;">No ${this.activeTab} comments</div>
        <div style="font-size: 11px; color: #888888; max-width: 220px;">Use the DOM Inspector or Canvas Pin tools in the bottom dock to leave feedback.</div>
      `;
      bodyEl.appendChild(empty);
      return;
    }

    targetList.forEach(comment => {
      const card = this.createCommentCard(comment);
      bodyEl.appendChild(card);
    });
  }

  createCommentCard(comment) {
    const card = document.createElement("div");
    card.className = `uc-drawer-card ${comment.is_resolved ? "resolved" : ""}`;

    const profile = comment.profiles || {};
    const name = profile.full_name || profile.email || "Teammate";
    const timeAgo = this.formatTimeAgo(comment.created_at);
    const isAuthor = this.currentUser && this.currentUser.id === comment.user_id;

    // Card Header
    const cardHeader = document.createElement("div");
    cardHeader.className = "uc-drawer-card-header";

    const authorEl = document.createElement("div");
    authorEl.className = "uc-drawer-author";

    const avatar = document.createElement("div");
    avatar.className = "uc-drawer-author-avatar";
    if (profile.avatar_url) {
      avatar.innerHTML = `<img src="${profile.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      avatar.textContent = (name[0] || "U").toUpperCase();
    }

    const meta = document.createElement("div");
    meta.innerHTML = `
      <div class="uc-drawer-author-name">${this.escapeHtml(name)}</div>
      <div class="uc-drawer-time">${timeAgo}</div>
    `;

    authorEl.appendChild(avatar);
    authorEl.appendChild(meta);
    cardHeader.appendChild(authorEl);

    // Mode badge
    const modeBadge = document.createElement("span");
    modeBadge.style.cssText = "font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 4px; text-transform: uppercase;";
    if (comment.mode === "dom") {
      modeBadge.style.background = "rgba(24, 160, 251, 0.12)";
      modeBadge.style.color = "#18A0FB";
      modeBadge.textContent = "DOM";
    } else {
      modeBadge.style.background = "rgba(10, 207, 131, 0.12)";
      modeBadge.style.color = "#0ACF83";
      modeBadge.textContent = "CANVAS";
    }
    cardHeader.appendChild(modeBadge);
    card.appendChild(cardHeader);

    // Target text quote
    if (comment.target_text) {
      const quote = document.createElement("div");
      quote.className = "uc-drawer-quote";
      quote.textContent = `“${comment.target_text}”`;
      card.appendChild(quote);
    }

    // Comment text
    const commentBody = document.createElement("div");
    commentBody.className = "uc-drawer-comment-text";
    commentBody.textContent = comment.content;
    card.appendChild(commentBody);

    // Replies list
    const replies = comment.replies || [];
    if (replies.length > 0) {
      const repliesList = document.createElement("div");
      repliesList.className = "uc-drawer-replies-list";

      replies.forEach(r => {
        const rProfile = r.profiles || {};
        const rName = rProfile.full_name || rProfile.email || "Teammate";
        const rItem = document.createElement("div");
        rItem.className = "uc-drawer-reply-item";
        rItem.innerHTML = `
          <div class="uc-drawer-reply-meta">
            <span class="uc-drawer-reply-author">${this.escapeHtml(rName)}</span>
            <span class="uc-drawer-time">${this.formatTimeAgo(r.created_at)}</span>
          </div>
          <div class="uc-drawer-reply-text">${this.escapeHtml(r.content)}</div>
        `;
        repliesList.appendChild(rItem);
      });

      card.appendChild(repliesList);
    }

    // Inline Reply Input
    const replyForm = document.createElement("div");
    replyForm.className = "uc-drawer-reply-form";

    const replyInput = document.createElement("input");
    replyInput.type = "text";
    replyInput.className = "uc-drawer-reply-input";
    replyInput.placeholder = "Reply to thread…";

    const replyBtn = document.createElement("button");
    replyBtn.className = "uc-drawer-action-btn locate";
    replyBtn.style.padding = "4px 8px";
    replyBtn.style.fontSize = "11px";
    replyBtn.innerHTML = `${renderIcon("paperPlaneTilt", 12)} Reply`;

    const handleSendReply = async () => {
      const text = replyInput.value.trim();
      if (!text) return;
      replyInput.value = "";
      if (this.onAddReply) {
        await this.onAddReply(comment.id, text);
      }
    };

    replyBtn.addEventListener("click", handleSendReply);
    replyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendReply();
      }
    });

    replyForm.appendChild(replyInput);
    replyForm.appendChild(replyBtn);
    card.appendChild(replyForm);

    // Actions footer
    const actions = document.createElement("div");
    actions.className = "uc-drawer-card-actions";

    // Locate Pin button
    const locateBtn = document.createElement("button");
    locateBtn.className = "uc-drawer-action-btn locate";
    locateBtn.innerHTML = `${renderIcon("arrowUpRight", 12)} Locate Pin`;
    locateBtn.addEventListener("click", () => {
      if (this.onLocate) this.onLocate(comment.id);
    });
    actions.appendChild(locateBtn);

    const rightActions = document.createElement("div");
    rightActions.style.display = "flex";
    rightActions.style.alignItems = "center";
    rightActions.style.gap = "6px";

    // Resolve / Reopen toggle button
    const resolveBtn = document.createElement("button");
    resolveBtn.className = "uc-drawer-action-btn resolve";
    resolveBtn.innerHTML = comment.is_resolved
      ? `${renderIcon("arrowsClockwise", 12)} Reopen`
      : `${renderIcon("check", 12)} Resolve`;
    resolveBtn.addEventListener("click", async () => {
      if (this.onResolve) {
        await this.onResolve(comment.id, !comment.is_resolved);
      }
    });
    rightActions.appendChild(resolveBtn);

    // Delete button
    if (isAuthor) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "uc-drawer-action-btn delete";
      deleteBtn.innerHTML = `${renderIcon("trash", 12)} Delete`;
      deleteBtn.addEventListener("click", async () => {
        if (confirm("Delete this comment permanently?")) {
          if (this.onDelete) {
            await this.onDelete(comment.id);
          }
        }
      });
      rightActions.appendChild(deleteBtn);
    }

    actions.appendChild(rightActions);
    card.appendChild(actions);

    return card;
  }

  formatTimeAgo(isoString) {
    if (!isoString) return "just now";
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
