/**
 * Mode B: Canvas Click Overlay for UI Commenter
 * Captures coordinate-based pins relative to document percentages,
 * records viewport_width and extracts context text from the element beneath the cursor.
 */

import { generateSelector, getCleanInnerText } from "../lib/selector.js";

export class CanvasOverlay {
  constructor(shadowRoot, onCanvasClickCallback) {
    this.shadowRoot = shadowRoot;
    this.onCanvasClick = onCanvasClickCallback;
    this.isActive = false;

    // Create transparent overlay layer inside Shadow DOM
    this.layer = document.createElement("div");
    this.layer.className = "uc-canvas-click-layer";
    this.layer.style.display = "none";
    this.shadowRoot.appendChild(this.layer);

    this.handleClick = this.handleClick.bind(this);
    this.layer.addEventListener("click", this.handleClick);
  }

  activate() {
    this.isActive = true;
    this.layer.style.display = "block";
  }

  deactivate() {
    this.isActive = false;
    this.layer.style.display = "none";
  }

  handleClick(e) {
    if (!this.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    const clientX = e.clientX;
    const clientY = e.clientY;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const scrollHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);

    const x_px = Math.round(clientX + scrollX);
    const y_px = Math.round(clientY + scrollY);
    const x_percent = Number(((x_px / scrollWidth) * 100).toFixed(3));
    const y_percent = Number(((y_px / scrollHeight) * 100).toFixed(3));
    const viewport_width = window.innerWidth;

    // Discover the element underlying the canvas click
    this.layer.style.display = "none";
    const host = document.getElementById("ui-commenter-host");
    const elements = document.elementsFromPoint(clientX, clientY) || [];
    this.layer.style.display = "block";

    const underlyingElement = elements.find(el => el !== host && !host?.contains(el) && el !== document.documentElement && el !== document.body) || null;

    const target_text = underlyingElement ? getCleanInnerText(underlyingElement, 250) : "";
    const selector = underlyingElement ? generateSelector(underlyingElement) : "";

    const payload = {
      mode: "canvas",
      x_px,
      y_px,
      x_percent,
      y_percent,
      viewport_width,
      target_text,
      selector
    };

    if (this.onCanvasClick) {
      this.onCanvasClick(payload);
    }
  }
}
