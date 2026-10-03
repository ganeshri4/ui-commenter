/**
 * Mode A: DOM Inspector for UI Commenter
 * Highlights elements with a 2px #18A0FB outline, locks on click,
 * generates a stable CSS selector, captures innerText and viewport_width.
 */

import { generateSelector, getCleanInnerText } from "../lib/selector.js";

export class DomInspector {
  constructor(shadowRoot, onSelectCallback) {
    this.shadowRoot = shadowRoot;
    this.onSelect = onSelectCallback;
    this.isActive = false;
    this.hoveredElement = null;
    this.lockedElement = null;

    // Create inspector elements inside Shadow DOM
    this.box = document.createElement("div");
    this.box.className = "uc-inspector-box";
    this.box.style.display = "none";

    this.badge = document.createElement("div");
    this.badge.className = "uc-inspector-badge";
    this.badge.style.display = "none";

    this.shadowRoot.appendChild(this.box);
    this.shadowRoot.appendChild(this.badge);

    // Bound listeners
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
  }

  activate() {
    if (this.isActive) return;
    this.isActive = true;
    window.addEventListener("mousemove", this.handleMouseMove, { passive: true, capture: true });
    window.addEventListener("click", this.handleClick, { capture: true });
    window.addEventListener("scroll", this.handleScroll, { passive: true });
  }

  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    window.removeEventListener("mousemove", this.handleMouseMove, { capture: true });
    window.removeEventListener("click", this.handleClick, { capture: true });
    window.removeEventListener("scroll", this.handleScroll);
    this.hide();
    this.hoveredElement = null;
    this.lockedElement = null;
  }

  handleMouseMove(e) {
    if (!this.isActive || this.lockedElement) return;

    // Ignore events originating from our own shadow host
    const host = document.getElementById("ui-commenter-host");
    if (host && (e.target === host || host.contains(e.target))) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === host || el === document.body || el === document.documentElement) {
      this.hide();
      return;
    }

    this.hoveredElement = el;
    this.updateHighlight(el);
  }

  updateHighlight(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();

    // Box position fixed to viewport
    this.box.style.display = "block";
    this.box.style.top = `${rect.top}px`;
    this.box.style.left = `${rect.left}px`;
    this.box.style.width = `${rect.width}px`;
    this.box.style.height = `${rect.height}px`;

    // Badge showing tag name and class/id
    const tagName = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const firstClass = el.classList.length > 0 ? `.${el.classList[0]}` : "";
    this.badge.textContent = `<${tagName}${id || firstClass}>`;
    this.badge.style.display = "flex";
    this.badge.style.top = `${Math.max(4, rect.top - 24)}px`;
    this.badge.style.left = `${Math.max(4, rect.left)}px`;
  }

  handleClick(e) {
    if (!this.isActive) return;

    // Check if click was inside our shadow UI (e.g. dock or popover)
    const host = document.getElementById("ui-commenter-host");
    if (e.composedPath().some(node => node === host || node === this.shadowRoot)) {
      return;
    }

    // Intercept click on the inspected webpage element
    e.preventDefault();
    e.stopPropagation();

    const target = this.hoveredElement || document.elementFromPoint(e.clientX, e.clientY);
    if (!target) return;

    this.lockedElement = target;
    const rect = target.getBoundingClientRect();
    const selector = generateSelector(target);
    const innerText = getCleanInnerText(target, 250);
    const viewportWidth = window.innerWidth;

    // Calculate document-relative coordinates for pinning
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const scrollHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);

    const pinX = rect.left + scrollX + 16;
    const pinY = rect.top + scrollY + 16;

    const payload = {
      mode: "dom",
      element: target,
      selector,
      target_text: innerText,
      viewport_width: viewportWidth,
      x_px: Math.round(pinX),
      y_px: Math.round(pinY),
      x_percent: Number(((pinX / scrollWidth) * 100).toFixed(3)),
      y_percent: Number(((pinY / scrollHeight) * 100).toFixed(3)),
      rect
    };

    if (this.onSelect) {
      this.onSelect(payload);
    }
  }

  handleScroll() {
    if (this.lockedElement) {
      this.updateHighlight(this.lockedElement);
    } else if (this.hoveredElement) {
      this.updateHighlight(this.hoveredElement);
    }
  }

  hide() {
    this.box.style.display = "none";
    this.badge.style.display = "none";
  }

  unlock() {
    this.lockedElement = null;
    this.hide();
  }
}
