/**
 * Figma-style Floating Bottom Dock Toolbar for UI Commenter
 * Provides intuitive mode toggling (Browse, Mode A DOM Inspector, Mode B Canvas),
 * real-time collaborator presence avatars, Side Panel toggle, and User Auth state.
 */

import { renderIcon } from "../lib/icons.js";

export class DockToolbar {
  constructor(shadowRoot, options) {
    this.shadowRoot = shadowRoot;
    this.currentMode = options.initialMode || "browse"; // 'browse' | 'dom' | 'canvas'
    this.currentUser = options.currentUser || null;
    this.collaborators = [];

    this.onModeChange = options.onModeChange;
    this.onToggleSidePanel = options.onToggleSidePanel;
    this.onSignIn = options.onSignIn;
    this.onSignOut = options.onSignOut;
    this.onCloseOverlay = options.onCloseOverlay;
    this.isPanelOpen = false;

    this.dock = document.createElement("div");
    this.dock.className = "uc-dock";
    this.shadowRoot.appendChild(this.dock);

    this.render();
  }

  setPanelOpen(isOpen) {
    this.isPanelOpen = !!isOpen;
    const panelBtn = this.dock.querySelector(".uc-dock-panel-btn");
    if (panelBtn) {
      panelBtn.classList.toggle("active", this.isPanelOpen);
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    this.render();
    if (this.onModeChange) this.onModeChange(mode);
  }

  setCurrentUser(user) {
    this.currentUser = user;
    this.render();
  }

  setCollaborators(collaborators) {
    this.collaborators = collaborators || [];
    this.render();
  }

  render() {
    this.dock.innerHTML = "";

    // 1. Brand Logo
    const brand = document.createElement("div");
    brand.className = "uc-dock-brand";
    brand.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#18A0FB"/>
        <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/>
        <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/>
        <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/>
        <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/>
      </svg>
      <span>Comments Everywhere</span>
    `;
    this.dock.appendChild(brand);

    // 2. Modes Group (Browse, Mode A DOM Inspector, Mode B Canvas Click)
    const modesContainer = document.createElement("div");
    modesContainer.className = "uc-dock-modes";

    // Mode: Browse
    const browseBtn = this.createModeButton("browse", "cursor", "Browse", "Browse without commenting");
    // Mode A: DOM Inspector
    const domBtn = this.createModeButton("dom", "inspector", "Inspect DOM", "Mode A: Lock element & comment");
    // Mode B: Canvas Click
    const canvasBtn = this.createModeButton("canvas", "crosshair", "Canvas Pin", "Mode B: Drop coordinate pin");

    modesContainer.appendChild(browseBtn);
    modesContainer.appendChild(domBtn);
    modesContainer.appendChild(canvasBtn);
    this.dock.appendChild(modesContainer);

    // Divider
    const div1 = document.createElement("div");
    div1.className = "uc-dock-divider";
    this.dock.appendChild(div1);

    // 3. Presence Avatars (Live collaborators on this URL)
    if (this.collaborators.length > 0) {
      const presenceGroup = document.createElement("div");
      presenceGroup.className = "uc-presence-group";

      const visibleUsers = this.collaborators.slice(0, 4);
      visibleUsers.forEach(user => {
        const pAvatar = document.createElement("div");
        pAvatar.className = "uc-presence-avatar";
        const name = user.full_name || user.email || "Teammate";
        pAvatar.setAttribute("data-tooltip", `${name} (Active on this page)`);

        if (user.avatar_url) {
          pAvatar.innerHTML = `<img src="${user.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
          pAvatar.textContent = (name[0] || "U").toUpperCase();
        }
        presenceGroup.appendChild(pAvatar);
      });

      if (this.collaborators.length > 4) {
        const extra = document.createElement("div");
        extra.className = "uc-presence-avatar";
        extra.style.background = "#555555";
        extra.textContent = `+${this.collaborators.length - 4}`;
        presenceGroup.appendChild(extra);
      }

      this.dock.appendChild(presenceGroup);

      const div2 = document.createElement("div");
      div2.className = "uc-dock-divider";
      this.dock.appendChild(div2);
    }

    // 4. Side Panel Toggle Button
    const panelBtn = document.createElement("button");
    panelBtn.className = `uc-dock-btn uc-dock-panel-btn ${this.isPanelOpen ? "active" : ""}`;
    panelBtn.setAttribute("data-tooltip", "Comments Panel (All Threads)");
    panelBtn.innerHTML = renderIcon("sidebarSimple", 16);
    panelBtn.addEventListener("click", () => {
      if (this.onToggleSidePanel) this.onToggleSidePanel();
    });
    this.dock.appendChild(panelBtn);

    // 5. Auth / User Profile Button
    if (this.currentUser) {
      const profileBtn = document.createElement("div");
      profileBtn.className = "uc-profile-btn";
      const name = this.currentUser.user_metadata?.full_name || this.currentUser.email || "User";
      profileBtn.setAttribute("data-tooltip", `Signed in as ${name} (Click to Sign Out)`);

      const avatar = document.createElement("div");
      avatar.className = "uc-avatar-small";
      avatar.style.width = "20px";
      avatar.style.height = "20px";
      avatar.style.fontSize = "9px";

      if (this.currentUser.user_metadata?.avatar_url) {
        avatar.innerHTML = `<img class="uc-avatar-img" src="${this.currentUser.user_metadata.avatar_url}">`;
      } else {
        avatar.textContent = (name[0] || "U").toUpperCase();
      }

      const nameLabel = document.createElement("span");
      nameLabel.className = "uc-profile-name";
      nameLabel.textContent = name.split(" ")[0];

      profileBtn.appendChild(avatar);
      profileBtn.appendChild(nameLabel);

      profileBtn.addEventListener("click", () => {
        if (confirm(`Sign out ${name}?`)) {
          if (this.onSignOut) this.onSignOut();
        }
      });

      this.dock.appendChild(profileBtn);
    } else {
      const loginBtn = document.createElement("button");
      loginBtn.className = "uc-btn uc-btn-primary";
      loginBtn.style.padding = "5px 10px";
      loginBtn.style.fontSize = "11px";
      loginBtn.style.display = "flex";
      loginBtn.style.alignItems = "center";
      loginBtn.style.gap = "6px";
      loginBtn.innerHTML = `${renderIcon("google", 12)} <span>Sign In</span>`;
      loginBtn.addEventListener("click", () => {
        if (this.onSignIn) this.onSignIn();
      });
      this.dock.appendChild(loginBtn);
    }

    // 6. Close / Turn Off Button
    const div3 = document.createElement("div");
    div3.className = "uc-dock-divider";
    this.dock.appendChild(div3);

    const closeBtn = document.createElement("button");
    closeBtn.className = "uc-dock-btn";
    closeBtn.setAttribute("data-tooltip", "Turn off Comments Everywhere");
    closeBtn.innerHTML = renderIcon("x", 14);
    closeBtn.addEventListener("click", () => {
      if (this.onCloseOverlay) this.onCloseOverlay();
    });
    this.dock.appendChild(closeBtn);
  }

  createModeButton(mode, iconName, label, tooltip) {
    const btn = document.createElement("button");
    btn.className = `uc-mode-btn ${this.currentMode === mode ? "active" : ""}`;
    btn.setAttribute("data-tooltip", tooltip);
    btn.innerHTML = `${renderIcon(iconName, 14)} <span>${label}</span>`;
    btn.addEventListener("click", () => this.setMode(mode));
    return btn;
  }
}
