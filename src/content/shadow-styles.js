/**
 * Shadow DOM Isolated CSS Stylesheet for UI Commenter
 * Implements the Figma Design System:
 * - Typography: Inter font family
 * - Palette: #18A0FB (Figma Blue), #FFFFFF (Surfaces), #E5E5E5 (Borders), #333333 (Text), #888888 (Timestamps)
 * - Micro-interactions: circular avatar pins, floating thread popover, dock toolbar, DOM inspector box
 */

export const SHADOW_STYLES = `
/* ==========================================================================
   RESET & ISOLATION
   ========================================================================== */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:host {
  all: initial;
  display: block;
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2147483647;
  pointer-events: none;
  color-scheme: light !important;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: inherit;
}

/* ==========================================================================
   CANVAS CLICK OVERLAY (MODE B)
   ========================================================================== */
.uc-canvas-click-layer {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh;
  cursor: crosshair !important;
  pointer-events: auto;
  z-index: 10;
  background: transparent;
}

/* ==========================================================================
   DOM INSPECTOR HIGHLIGHT (MODE A)
   ========================================================================== */
.uc-inspector-box {
  position: absolute;
  pointer-events: none;
  outline: 2px solid #18A0FB;
  background-color: rgba(24, 160, 251, 0.08);
  border-radius: 2px;
  z-index: 20;
  transition: all 0.05s ease-out;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.uc-inspector-badge {
  position: absolute;
  top: -24px;
  left: 0;
  background: #18A0FB;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 21;
}

/* ==========================================================================
   PINS CONTAINER & FIGMA CIRCULAR PINS
   ========================================================================== */
.uc-pins-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 30;
}

.uc-pin {
  position: absolute;
  width: 30px;
  height: 30px;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  cursor: pointer;
  transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.15s ease;
  user-select: none;
}

.uc-pin:hover {
  transform: translate(-50%, -50%) scale(1.18);
  z-index: 35;
}

.uc-pin.active {
  transform: translate(-50%, -50%) scale(1.22);
  z-index: 40;
}

.uc-pin-circle {
  width: 100%;
  height: 100%;
  border-radius: 50% 50% 50% 4px;
  background: #FFFFFF;
  border: 2px solid #18A0FB;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.uc-pin.mode-dom .uc-pin-circle {
  border-color: #18A0FB;
}

.uc-pin.mode-canvas .uc-pin-circle {
  border-color: #7B61FF; /* Figma Purple for canvas pins */
}

.uc-pin-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.uc-pin-initials {
  font-size: 11px;
  font-weight: 700;
  color: #18A0FB;
  text-transform: uppercase;
}

.uc-pin.mode-canvas .uc-pin-initials {
  color: #7B61FF;
}

.uc-pin-number {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: #18A0FB;
  color: #FFFFFF;
  font-size: 9px;
  font-weight: 700;
  min-width: 15px;
  height: 15px;
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #FFFFFF;
}

.uc-pin.mode-canvas .uc-pin-number {
  background: #7B61FF;
}

/* ==========================================================================
   FLOATING THREAD POPOVER (FIGMA STYLE)
   ========================================================================== */
.uc-popover {
  position: absolute;
  width: 320px;
  max-width: calc(100vw - 32px);
  background: #FFFFFF;
  border: 1px solid #E5E5E5;
  border-radius: 12px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.06);
  pointer-events: auto;
  z-index: 50;
  transform: translate(16px, 16px);
  animation: ucPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}

@keyframes ucPopIn {
  from {
    opacity: 0;
    transform: translate(16px, 24px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(16px, 16px) scale(1);
  }
}

.uc-popover-header {
  padding: 12px 14px;
  border-bottom: 1px solid #F0F0F0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #FAFAFA;
  border-radius: 12px 12px 0 0;
}

.uc-author-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.uc-avatar-small {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #18A0FB;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.uc-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.uc-author-name {
  font-size: 13px;
  font-weight: 600;
  color: #333333;
}

.uc-timestamp {
  font-size: 11px;
  color: #888888;
}

.uc-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.uc-icon-btn {
  background: none;
  border: none;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.uc-icon-btn:hover {
  background: #EEEEEE;
  color: #111111;
}

.uc-icon-btn.resolve-btn:hover {
  background: #E8F8F0;
  color: #1BC47D;
}

.uc-context-snippet {
  margin: 10px 14px 4px 14px;
  padding: 6px 10px;
  background: #F8F9FA;
  border-left: 2px solid #18A0FB;
  border-radius: 0 4px 4px 0;
  font-size: 11px;
  color: #555555;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 60px;
  overflow-y: auto;
}

.uc-context-selector {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: #888888;
  margin-top: 2px;
}

.uc-popover-body {
  padding: 12px 14px;
  font-size: 13px;
  color: #333333;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.uc-replies-list {
  max-height: 180px;
  overflow-y: auto;
  border-top: 1px solid #F0F0F0;
  background: #FCFCFC;
}

.uc-reply-item {
  padding: 10px 14px;
  border-bottom: 1px solid #F5F5F5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.uc-reply-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.uc-reply-content {
  font-size: 12px;
  color: #333333;
  line-height: 1.4;
  margin-left: 32px;
}

.uc-reply-input-box {
  padding: 10px 14px;
  border-top: 1px solid #EEEEEE;
  display: flex;
  gap: 8px;
  background: #FFFFFF;
  border-radius: 0 0 12px 12px;
}

.uc-reply-input {
  flex: 1;
  background: #FFFFFF !important;
  background-color: #FFFFFF !important;
  color: #111111 !important;
  border: 1px solid #E5E5E5 !important;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 12px;
  outline: none;
  resize: none;
  height: 36px;
  line-height: 1.4;
  box-shadow: none !important;
  color-scheme: light !important;
  caret-color: #18A0FB;
  transition: border-color 0.15s ease;
}

.uc-reply-input::placeholder {
  color: #888888 !important;
  opacity: 1 !important;
}

.uc-reply-input:focus {
  background: #FFFFFF !important;
  background-color: #FFFFFF !important;
  color: #111111 !important;
  border-color: #18A0FB !important;
  box-shadow: 0 0 0 2px rgba(24, 160, 251, 0.15) !important;
}

.uc-send-btn {
  background: #18A0FB;
  color: #FFFFFF;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.uc-send-btn:hover {
  background: #0C8CE9;
}

/* ==========================================================================
   NEW COMMENT DRAFT CARD
   ========================================================================== */
.uc-draft-card {
  position: absolute;
  width: 290px;
  background: #FFFFFF !important;
  background-color: #FFFFFF !important;
  color: #333333 !important;
  border: 1px solid #E5E5E5 !important;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
  z-index: 55;
  padding: 12px;
  transform: translate(16px, 16px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: ucPopIn 0.15s ease-out;
}

.uc-draft-textarea {
  width: 100%;
  height: 72px;
  background: #FFFFFF !important;
  background-color: #FFFFFF !important;
  color: #111111 !important;
  border: 1px solid #E5E5E5 !important;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.4;
  outline: none;
  resize: none;
  box-shadow: none !important;
  color-scheme: light !important;
  caret-color: #18A0FB;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.uc-draft-textarea::placeholder {
  color: #888888 !important;
  opacity: 1 !important;
}

.uc-draft-textarea:focus {
  background: #FFFFFF !important;
  background-color: #FFFFFF !important;
  color: #111111 !important;
  border-color: #18A0FB !important;
  box-shadow: 0 0 0 2px rgba(24, 160, 251, 0.18) !important;
}

.uc-draft-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.uc-btn {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.uc-btn-secondary {
  background: #F0F0F0;
  color: #555555;
}

.uc-btn-secondary:hover {
  background: #E5E5E5;
  color: #222222;
}

.uc-btn-primary {
  background: #18A0FB;
  color: #FFFFFF;
}

.uc-btn-primary:hover {
  background: #0C8CE9;
}

/* ==========================================================================
   FIGMA FLOATING BOTTOM DOCK TOOLBAR
   ========================================================================== */
.uc-dock {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #FFFFFF;
  border: 1px solid #E5E5E5;
  border-radius: 9999px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14), 0 1px 4px rgba(0, 0, 0, 0.05);
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
  z-index: 100;
  user-select: none;
}

.uc-dock-brand {
  font-size: 12px;
  font-weight: 700;
  color: #18A0FB;
  padding: 0 8px 0 4px;
  border-right: 1px solid #E5E5E5;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.uc-dock-modes {
  display: flex;
  align-items: center;
  background: #F5F5F5;
  border-radius: 9999px;
  padding: 3px;
  gap: 2px;
}

.uc-mode-btn {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  color: #666666;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.uc-mode-btn:hover {
  color: #222222;
}

.uc-mode-btn.active {
  background: #FFFFFF;
  color: #18A0FB;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  font-weight: 600;
}

.uc-dock-divider {
  width: 1px;
  height: 20px;
  background: #E5E5E5;
  margin: 0 4px;
}

/* Collaborative Presence Avatars */
.uc-presence-group {
  display: flex;
  align-items: center;
  margin-left: 2px;
}

.uc-presence-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #FFFFFF;
  margin-left: -6px;
  background: #18A0FB;
  color: #FFFFFF;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  position: relative;
  cursor: default;
}

.uc-presence-avatar:first-child {
  margin-left: 0;
}

.uc-dock-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.uc-dock-btn {
  border: none;
  background: transparent;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555555;
  cursor: pointer;
  transition: all 0.15s ease;
}

.uc-dock-btn:hover {
  background: #F0F0F0;
  color: #111111;
}

.uc-dock-btn.active {
  background: rgba(24, 160, 251, 0.15);
  color: #18A0FB;
}

/* Auth / Profile badge */
.uc-profile-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #F8F9FA;
  border: 1px solid #E5E5E5;
  border-radius: 9999px;
  padding: 3px 8px 3px 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.uc-profile-btn:hover {
  background: #EEEEEE;
}

.uc-profile-name {
  font-size: 11px;
  font-weight: 600;
  color: #333333;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Tooltip */
[data-tooltip] {
  position: relative;
}

[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: #222222;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
  z-index: 1000;
}

[data-tooltip]:hover::after {
  opacity: 1;
}

/* ==========================================================================
   FIGMA COMMENTS SIDE DRAWER (IN-PAGE COMMENTS PANEL)
   ========================================================================== */
.uc-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  max-width: 92vw;
  height: 100vh;
  background: #FFFFFF;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12), -1px 0 0 rgba(0, 0, 0, 0.08);
  z-index: 2000;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  color-scheme: light !important;
  color: #333333;
  font-size: 13px;
  user-select: auto;
}

.uc-drawer.open {
  transform: translateX(0);
}

.uc-drawer-header {
  background: #FFFFFF;
  border-bottom: 1px solid #EAEAEA;
  padding: 14px 16px 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.uc-drawer-brand-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.uc-drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #111111;
  letter-spacing: -0.2px;
}

.uc-drawer-close-btn {
  background: transparent;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.uc-drawer-close-btn:hover {
  background: #F0F0F0;
  color: #111111;
}

.uc-drawer-route-bar {
  background: #F5F5F5;
  border-radius: 6px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.uc-drawer-route-label {
  font-size: 10px;
  font-weight: 700;
  color: #888888;
  text-transform: uppercase;
}

.uc-drawer-route-value {
  font-size: 11px;
  color: #555555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.uc-drawer-tabs-row {
  display: flex;
  border-bottom: 1px solid #EEEEEE;
  gap: 12px;
}

.uc-drawer-tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 6px 4px;
  font-size: 12px;
  font-weight: 600;
  color: #777777;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.uc-drawer-tab-btn:hover {
  color: #111111;
}

.uc-drawer-tab-btn.active {
  color: #18A0FB;
  border-bottom-color: #18A0FB;
}

.uc-drawer-badge {
  background: #EEEEEE;
  color: #555555;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 9999px;
}

.uc-drawer-tab-btn.active .uc-drawer-badge {
  background: rgba(24, 160, 251, 0.15);
  color: #18A0FB;
}

.uc-drawer-search-box {
  position: relative;
}

.uc-drawer-search-input {
  width: 100%;
  background: #F9F9F9;
  border: 1px solid #E5E5E5;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: #222222;
  outline: none;
  box-sizing: border-box;
}

.uc-drawer-search-input:focus {
  border-color: #18A0FB;
  background: #FFFFFF;
}

.uc-drawer-body {
  flex: 1;
  overflow-y: auto;
  background: #FAFAFA;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.uc-drawer-card {
  background: #FFFFFF;
  border: 1px solid #EAEAEA;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.15s ease;
}

.uc-drawer-card:hover {
  border-color: #D0D0D0;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.uc-drawer-card.resolved {
  opacity: 0.75;
  background: #FDFDFD;
}

.uc-drawer-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.uc-drawer-author {
  display: flex;
  align-items: center;
  gap: 8px;
}

.uc-drawer-author-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #18A0FB;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.uc-drawer-author-name {
  font-size: 12px;
  font-weight: 600;
  color: #222222;
}

.uc-drawer-time {
  font-size: 10px;
  color: #888888;
}

.uc-drawer-quote {
  font-size: 11px;
  font-style: italic;
  color: #555555;
  background: #F5F5F5;
  border-left: 2px solid #18A0FB;
  padding: 4px 8px;
  border-radius: 0 4px 4px 0;
}

.uc-drawer-comment-text {
  font-size: 13px;
  color: #222222;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
}

.uc-drawer-replies-list {
  background: #F9F9F9;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #EEEEEE;
}

.uc-drawer-reply-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.uc-drawer-reply-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.uc-drawer-reply-author {
  font-weight: 600;
  color: #333333;
  font-size: 11px;
}

.uc-drawer-reply-text {
  color: #444444;
  font-size: 12px;
  line-height: 1.35;
}

.uc-drawer-reply-form {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.uc-drawer-reply-input {
  flex: 1;
  background: #FFFFFF !important;
  color: #222222 !important;
  border: 1px solid #D5D5D5 !important;
  border-radius: 4px !important;
  padding: 6px 8px !important;
  font-size: 12px !important;
  resize: none;
  height: 32px;
  outline: none;
  font-family: inherit;
}

.uc-drawer-reply-input:focus {
  border-color: #18A0FB !important;
}

.uc-drawer-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid #F0F0F0;
  font-size: 11px;
}

.uc-drawer-action-btn {
  background: transparent;
  border: none;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: #666666;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.12s ease;
}

.uc-drawer-action-btn:hover {
  background: #F0F0F0;
  color: #111111;
}

.uc-drawer-action-btn.locate {
  color: #18A0FB;
}

.uc-drawer-action-btn.resolve {
  color: #0ACF83;
}

.uc-drawer-action-btn.delete {
  color: #FF5252;
}

.uc-drawer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: #888888;
  gap: 8px;
}
`;
