/**
 * Floating Thread Popover & Comment Draft Card for UI Commenter
 * Mimics Figma's collaborative commenting popover with micro-interactions,
 * replies, resolution, and outside-click dismissal.
 */

import { renderIcon } from "../lib/icons.js";

export class ThreadPopover {
  constructor(shadowRoot, options) {
    this.shadowRoot = shadowRoot;
    this.onAddReply = options.onAddReply;
    this.onResolve = options.onResolve;
    this.onDelete = options.onDelete;
    this.onSaveDraft = options.onSaveDraft;
    this.onClose = options.onClose;
    this.currentUser = options.currentUser;

    this.activePopover = null;
    this.activeDraftCard = null;

    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    window.addEventListener("click", this.handleDocumentClick, true);
  }

  setCurrentUser(user) {
    this.currentUser = user;
  }

  handleDocumentClick(e) {
    const host = document.getElementById("ui-commenter-host");
    const path = e.composedPath();

    // If click is outside both popover and draft card, close them
    if (this.activePopover) {
      const isInsidePopover = path.some(el => el === this.activePopover);
      const isInsidePin = path.some(el => el.classList && el.classList.contains("uc-pin"));
      if (!isInsidePopover && !isInsidePin) {
        this.closePopover();
      }
    }

    if (this.activeDraftCard) {
      const isInsideDraft = path.some(el => el === this.activeDraftCard);
      if (!isInsideDraft) {
        this.closeDraft();
      }
    }
  }

  /**
   * Opens a comment thread popover anchored to a pin
   */
  openThread(comment, pinEl) {
    this.closePopover();
    this.closeDraft();

    const popover = document.createElement("div");
    popover.className = "uc-popover";

    const profile = comment.profiles || {};
    const authorName = profile.full_name || profile.email || "Anonymous";
    const timeAgo = this.formatTimeAgo(comment.created_at);

    // Header
    const header = document.createElement("div");
    header.className = "uc-popover-header";

    const authorGroup = document.createElement("div");
    authorGroup.className = "uc-author-info";

    const avatar = document.createElement("div");
    avatar.className = "uc-avatar-small";
    if (profile.avatar_url) {
      avatar.innerHTML = `<img class="uc-avatar-img" src="${profile.avatar_url}" alt="${authorName}">`;
    } else {
      avatar.textContent = this.getInitials(authorName);
    }

    const nameCol = document.createElement("div");
    nameCol.innerHTML = `
      <div class="uc-author-name">${this.escapeHtml(authorName)}</div>
      <div class="uc-timestamp">${timeAgo}</div>
    `;

    authorGroup.appendChild(avatar);
    authorGroup.appendChild(nameCol);

    // Actions (Resolve, Delete, Close)
    const actions = document.createElement("div");
    actions.className = "uc-header-actions";

    const resolveBtn = document.createElement("button");
    resolveBtn.className = "uc-icon-btn resolve-btn";
    resolveBtn.title = "Resolve comment";
    resolveBtn.innerHTML = renderIcon("check", 16);
    resolveBtn.addEventListener("click", () => {
      if (this.onResolve) this.onResolve(comment.id, true);
      this.closePopover();
    });

    actions.appendChild(resolveBtn);

    // Delete button if current user is author
    if (this.currentUser && (this.currentUser.id === comment.user_id)) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "uc-icon-btn";
      deleteBtn.title = "Delete comment";
      deleteBtn.innerHTML = renderIcon("trash", 14);
      deleteBtn.addEventListener("click", () => {
        if (confirm("Delete this comment permanently?")) {
          if (this.onDelete) this.onDelete(comment.id);
          this.closePopover();
        }
      });
      actions.appendChild(deleteBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "uc-icon-btn";
    closeBtn.title = "Close";
    closeBtn.innerHTML = renderIcon("x", 14);
    closeBtn.addEventListener("click", () => this.closePopover());
    actions.appendChild(closeBtn);

    header.appendChild(authorGroup);
    header.appendChild(actions);
    popover.appendChild(header);

    // Target Text / Context Snippet
    if (comment.target_text || comment.selector) {
      const snippet = document.createElement("div");
      snippet.className = "uc-context-snippet";
      if (comment.target_text) {
        snippet.textContent = `“${comment.target_text}”`;
      }
      if (comment.selector) {
        const selEl = document.createElement("div");
        selEl.className = "uc-context-selector";
        selEl.textContent = comment.selector;
        snippet.appendChild(selEl);
      }
      popover.appendChild(snippet);
    }

    // Body
    const body = document.createElement("div");
    body.className = "uc-popover-body";
    body.textContent = comment.content;
    popover.appendChild(body);

    // Replies List
    const repliesContainer = document.createElement("div");
    repliesContainer.className = "uc-replies-list";
    const replies = comment.replies || [];
    replies.forEach(reply => {
      repliesContainer.appendChild(this.createReplyElement(reply));
    });
    popover.appendChild(repliesContainer);

    // Reply Input Box
    const inputBox = document.createElement("div");
    inputBox.className = "uc-reply-input-box";

    const textarea = document.createElement("textarea");
    textarea.className = "uc-reply-input";
    textarea.placeholder = "Reply to thread…";
    textarea.rows = 1;

    const sendBtn = document.createElement("button");
    sendBtn.className = "uc-send-btn";
    sendBtn.innerHTML = renderIcon("paperPlaneTilt", 14);

    const submitReply = () => {
      const val = textarea.value.trim();
      if (!val) return;
      if (this.onAddReply) {
        this.onAddReply(comment.id, val);
      }
      textarea.value = "";
    };

    sendBtn.addEventListener("click", submitReply);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitReply();
      }
    });

    inputBox.appendChild(textarea);
    inputBox.appendChild(sendBtn);
    popover.appendChild(inputBox);

    // Anchor position next to pin
    this.anchorElement(popover, pinEl);

    this.shadowRoot.appendChild(popover);
    this.activePopover = popover;

    setTimeout(() => textarea.focus(), 50);
  }

  createReplyElement(reply) {
    const item = document.createElement("div");
    item.className = "uc-reply-item";

    const rProfile = reply.profiles || {};
    const rName = rProfile.full_name || rProfile.email || "Anonymous";
    const rTime = this.formatTimeAgo(reply.created_at);

    item.innerHTML = `
      <div class="uc-reply-header">
        <div style="display: flex; align-items: center; gap: 6px;">
          <div class="uc-avatar-small" style="width: 20px; height: 20px; font-size: 8px;">
            ${rProfile.avatar_url ? `<img class="uc-avatar-img" src="${rProfile.avatar_url}">` : this.getInitials(rName)}
          </div>
          <span style="font-size: 12px; font-weight: 600; color: #333333;">${this.escapeHtml(rName)}</span>
        </div>
        <span class="uc-timestamp" style="font-size: 10px;">${rTime}</span>
      </div>
      <div class="uc-reply-content">${this.escapeHtml(reply.content)}</div>
    `;
    return item;
  }

  /**
   * Opens the draft card when user drops a new pin (Mode A or Mode B)
   */
  openDraft(payload, onDone) {
    this.closePopover();
    this.closeDraft();

    const card = document.createElement("div");
    card.className = "uc-draft-card";

    // Text context badge if available
    if (payload.target_text) {
      const quote = document.createElement("div");
      quote.className = "uc-context-snippet";
      quote.style.margin = "0 0 6px 0";
      quote.textContent = `“${payload.target_text}”`;
      card.appendChild(quote);
    }

    const textarea = document.createElement("textarea");
    textarea.className = "uc-draft-textarea";
    textarea.placeholder = payload.mode === "dom" 
      ? `Comment on <${payload.selector?.split(" ")[0] || "element"}>…`
      : "Leave a comment…";

    const actions = document.createElement("div");
    actions.className = "uc-draft-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "uc-btn uc-btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      this.closeDraft();
      if (onDone) onDone(null);
    });

    const submitBtn = document.createElement("button");
    submitBtn.className = "uc-btn uc-btn-primary";
    submitBtn.textContent = "Post Comment";

    const postComment = () => {
      const content = textarea.value.trim();
      if (!content) return;
      this.closeDraft();
      if (this.onSaveDraft) {
        this.onSaveDraft({ ...payload, content });
      }
      if (onDone) onDone(content);
    };

    submitBtn.addEventListener("click", postComment);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        postComment();
      } else if (e.key === "Escape") {
        this.closeDraft();
        if (onDone) onDone(null);
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);

    card.appendChild(textarea);
    card.appendChild(actions);

    // Anchor position based on click coordinates
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const clientX = payload.x_px - scrollX;
    const clientY = payload.y_px - scrollY;

    card.style.left = `${Math.min(window.innerWidth - 310, Math.max(16, clientX + 8))}px`;
    card.style.top = `${Math.min(window.innerHeight - 200, Math.max(16, clientY + 8))}px`;

    this.shadowRoot.appendChild(card);
    this.activeDraftCard = card;

    setTimeout(() => textarea.focus(), 50);
  }

  anchorElement(popover, pinEl) {
    if (!pinEl) return;
    const pinRect = pinEl.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 300;

    let left = pinRect.right + 12;
    let top = pinRect.top - 8;

    // Flip horizontally if out of viewport
    if (left + popoverWidth > window.innerWidth - 16) {
      left = pinRect.left - popoverWidth - 12;
    }
    // Clamp to viewport
    left = Math.max(16, Math.min(left, window.innerWidth - popoverWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - popoverHeight - 16));

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  closePopover() {
    if (this.activePopover) {
      this.activePopover.remove();
      this.activePopover = null;
      if (this.onClose) this.onClose();
    }
  }

  closeDraft() {
    if (this.activeDraftCard) {
      this.activeDraftCard.remove();
      this.activeDraftCard = null;
    }
  }

  formatTimeAgo(isoString) {
    if (!isoString) return "just now";
    const date = new Date(isoString);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
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

  destroy() {
    window.removeEventListener("click", this.handleDocumentClick, true);
    this.closePopover();
    this.closeDraft();
  }
}
