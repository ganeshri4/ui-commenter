/**
 * Figma-style Circular Pin Manager for UI Commenter
 * Renders avatar/initials badges, handles responsive re-anchoring,
 * pin sequence indicators, and click interactions.
 */

import { findElement } from "../lib/selector.js";

export class PinManager {
  constructor(shadowRoot, onPinClickCallback) {
    this.shadowRoot = shadowRoot;
    this.onPinClick = onPinClickCallback;
    this.comments = [];
    this.activePinId = null;

    this.container = document.createElement("div");
    this.container.className = "uc-pins-container";
    this.shadowRoot.appendChild(this.container);

    this.repositionAll = this.repositionAll.bind(this);
    window.addEventListener("resize", this.repositionAll, { passive: true });
    window.addEventListener("scroll", this.repositionAll, { passive: true });
  }

  setComments(comments) {
    // Canvas only renders unresolved comments
    this.comments = (comments || []).filter(c => !c.is_resolved);
    this.render();
  }

  setActivePin(commentId) {
    this.activePinId = commentId;
    const pinEls = this.container.querySelectorAll(".uc-pin");
    pinEls.forEach(el => {
      if (el.dataset.commentId === commentId) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  clearActivePin() {
    this.activePinId = null;
    const pinEls = this.container.querySelectorAll(".uc-pin");
    pinEls.forEach(el => el.classList.remove("active"));
  }

  render() {
    this.container.innerHTML = "";

    this.comments.forEach((comment, index) => {
      const pin = this.createPinElement(comment, index + 1);
      this.container.appendChild(pin);
      this.positionPin(pin, comment);
    });
  }

  createPinElement(comment, sequenceNumber) {
    const pin = document.createElement("div");
    pin.className = `uc-pin mode-${comment.mode || "dom"}`;
    pin.dataset.commentId = comment.id;

    if (this.activePinId === comment.id) {
      pin.classList.add("active");
    }

    const circle = document.createElement("div");
    circle.className = "uc-pin-circle";

    // User profile avatar or initials
    const profile = comment.profiles || {};
    const authorName = profile.full_name || profile.email || "Anonymous";
    pin.setAttribute("data-tooltip", `${authorName} (#${sequenceNumber})`);

    if (profile.avatar_url) {
      const img = document.createElement("img");
      img.className = "uc-pin-avatar";
      img.src = profile.avatar_url;
      img.alt = authorName;
      circle.appendChild(img);
    } else {
      const initials = document.createElement("span");
      initials.className = "uc-pin-initials";
      initials.textContent = this.getInitials(authorName);
      circle.appendChild(initials);
    }

    // Sequence number badge
    const badge = document.createElement("span");
    badge.className = "uc-pin-number";
    badge.textContent = sequenceNumber;
    circle.appendChild(badge);

    pin.appendChild(circle);

    // Click handler
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setActivePin(comment.id);
      if (this.onPinClick) {
        this.onPinClick(comment, pin);
      }
    });

    return pin;
  }

  positionPin(pinEl, comment) {
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    let targetX = null;
    let targetY = null;

    // Mode A: Try attaching to live DOM element if selector exists
    if (comment.mode === "dom" && comment.selector) {
      const element = findElement(comment.selector);
      if (element) {
        const rect = element.getBoundingClientRect();
        targetX = rect.left + scrollX + 16;
        targetY = rect.top + scrollY + 16;
      }
    }

    // Fallback or Mode B: Responsive percentage or stored px coordinates
    if (targetX === null || targetY === null) {
      const scrollWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
      const scrollHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);

      if (comment.x_percent && comment.y_percent) {
        targetX = (comment.x_percent / 100) * scrollWidth;
        targetY = (comment.y_percent / 100) * scrollHeight;
      } else {
        targetX = comment.x_px || 100;
        targetY = comment.y_px || 100;
      }
    }

    // Convert document coordinates to fixed viewport coordinates for Shadow Host
    const viewportX = targetX - scrollX;
    const viewportY = targetY - scrollY;

    pinEl.style.left = `${viewportX}px`;
    pinEl.style.top = `${viewportY}px`;
  }

  repositionAll() {
    const pinEls = this.container.querySelectorAll(".uc-pin");
    pinEls.forEach(pinEl => {
      const commentId = pinEl.dataset.commentId;
      const comment = this.comments.find(c => c.id === commentId);
      if (comment) {
        this.positionPin(pinEl, comment);
      }
    });
  }

  getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }

  destroy() {
    window.removeEventListener("resize", this.repositionAll);
    window.removeEventListener("scroll", this.repositionAll);
    this.container.remove();
  }
}
