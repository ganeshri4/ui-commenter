# UI Commenter 🎨💬

> Production-ready Google Chrome Extension (Manifest V3) acting as a Figma-style collaborative commenting and inspection overlay for live web pages, staging prototypes, and SPAs.

---

## 📁 File Structure

```
comments/
├── manifest.json                  # Chrome Manifest V3 configuration
├── package.json                   # Build dependencies & scripts
├── build.mjs                      # esbuild bundler for Content Script, Background Worker, & Side Panel
├── assets/
│   ├── icon-16.png                # Extension icons (Figma Blue)
│   ├── icon-48.png
│   └── icon-128.png
├── supabase/
│   └── migrations/
│       └── 01_schema.sql          # Complete Supabase SQL migration (profiles, comments, replies, RLS, pg_cron)
├── src/
│   ├── config.js                  # Global configuration (Supabase URL, Anon Key, Expiry)
│   ├── background/
│   │   └── background.js          # Service Worker (Google OAuth, launchWebAuthFlow, tab monitoring)
│   ├── content/
│   │   ├── content.js             # Main Content Script & SPA route detection
│   │   ├── shadow-styles.js       # Figma design tokens & isolated Shadow DOM CSS
│   │   ├── dom-inspector.js       # Mode A: 2px #18A0FB outline, element lock, stable selector generator
│   │   ├── canvas-overlay.js      # Mode B: Document-relative coordinate pin placement
│   │   ├── pin-manager.js         # Circular Figma avatar pins, sequence numbers, responsive re-anchoring
│   │   ├── thread-popover.js      # Floating thread cards, replies, resolve/delete actions
│   │   └── dock-toolbar.js        # Floating bottom dock: Mode switch, live presence avatars, auth
│   ├── sidepanel/
│   │   ├── index.html             # Figma-styled Side Panel UI
│   │   ├── sidepanel.js           # Comment listing, search, active/resolved tabs, locate pin
│   │   └── sidepanel.css          # Figma Side Panel styles (Inter, #18A0FB, #E5E5E5)
│   └── lib/
│       ├── icons.js               # Phosphor Icons SVG dictionary (100% CSP safe)
│       ├── selector.js            # Stable CSS selector engine (ID > data-testid > classes > nth-child)
│       └── supabase.js            # Supabase client with Chrome storage adapter & Realtime Presence
├── test/
│   └── index.html                 # Interactive staging prototype test page
└── dist/                          # Production bundled extension (Ready to load unpacked)
    ├── background.bundle.js
    ├── content.bundle.js
    └── sidepanel/
        ├── index.html
        ├── sidepanel.bundle.js
        └── sidepanel.css
```

---

## 🚀 Quick Start: Loading Unpacked in Chrome

1. **Install dependencies and build the extension**:
   ```bash
   cd /Users/ganesh/Desktop/comments
   npm install
   npm run build
   ```
2. **Open Google Chrome**:
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in the top-right corner).
   - Click **Load unpacked** in the top-left.
   - Select the project root folder: `/Users/ganesh/Desktop/comments`.
3. **Pin the Extension**:
   - Click the Extensions puzzle icon in Chrome's toolbar and pin **UI Commenter**.
   - Note down the **Extension ID** displayed on the extension card (e.g. `abcdefghijklmnop...`).
4. **FireShot-Style Toolbar Toggle (ON / OFF)**:
   - **Click 1 on Toolbar Icon**: Turns the extension **ON** for the active tab (badge shows `ON` in Figma Blue), mounts the overlay, loads comments, and displays the Figma dock.
   - **Click 2 on Toolbar Icon** (or click **✕** in the dock): Turns the extension **OFF** entirely. The overlay completely unmounts, realtime disconnects, and the page returns 100% to its original state.

---

## 🔐 Google OAuth & Supabase Configuration

UI Commenter uses `chrome.identity.launchWebAuthFlow` to authenticate with Google through Supabase Auth. Follow these exact configuration steps:

### Step 1: Obtain your Chrome Extension Redirect URI
Your extension redirect URI follows this exact format:
```
https://<YOUR_EXTENSION_ID>.chromiumapp.org/
```
*(You can also open the extension Side Panel -> Settings (⚙️) -> click "Copy" next to Redirect URI).*

### Step 2: Configure Supabase Dashboard
1. Go to your **[Supabase Project Dashboard](https://supabase.com/dashboard)**.
2. In the left sidebar, navigate to **Authentication** ➔ **URL Configuration**.
3. Under **Redirect URLs**, click **Add URL** and paste your extension redirect URI:
   ```
   https://<YOUR_EXTENSION_ID>.chromiumapp.org/
   ```
4. Click **Save**.

### Step 3: Configure Google Cloud Console
1. Go to **[Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)**.
2. Click your OAuth 2.0 Client ID (Web application).
3. Under **Authorized redirect URIs**, add your Supabase Auth callback URI:
   ```
   https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
   ```
4. Click **Save**.
5. Back in **Supabase Dashboard** ➔ **Authentication** ➔ **Providers** ➔ enable **Google** and supply your Google Client ID & Client Secret.

### Step 4: Configure Extension Credentials
You can provide your credentials in two ways:
- **Option A (In Code)**: Edit `src/config.js` and set `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then run `npm run build`.
- **Option B (In UI)**: Open the Extension Side Panel, click the **Settings (⚙️)** icon, paste your `Supabase URL` and `Anon Key`, and click **Save Settings**.

---

## 🗄️ Supabase Database Migration

1. Open **Supabase Dashboard** ➔ **SQL Editor**.
2. Open `supabase/migrations/01_schema.sql` from this repository.
3. Paste the entire SQL script and click **Run**.

### Key SQL Architecture Highlights:
- **`profiles` table**: Synchronized automatically with `auth.users` via database trigger.
- **`comments` table**: Stores URL paths, mode (`dom` vs `canvas`), stable CSS selector, coordinates (`x_percent`, `y_percent`, `x_px`, `y_px`), `viewport_width`, and `target_text`.
- **`replies` table**: Nested comment discussion with cascade deletion.
- **Row Level Security (RLS)**: Enforces access control and allows guest commenting or authenticated reviews.
- **Realtime Publication**: `ALTER PUBLICATION supabase_realtime ADD TABLE comments, replies;` enables instant cross-client updates.
- **5-Day Auto-Expiration Purge Routine**:
  - `public.purge_expired_comments()` removes records older than 120 hours.
  - Automatically scheduled via `pg_cron` extension hourly job (`0 * * * *`).

---

## 🎯 Features & Usage

### 1. Two Commenting Modes
- **Mode A (DOM Inspector)**:
  - Highlights elements under your cursor with a **2px `#18A0FB` blue outline** and a tag badge (`<button#primary>`).
  - Clicking locks the element, generates a resilient CSS selector (`#id` > `data-testid` > hierarchy), captures `innerText` context, and prompts a comment card.
  - Pins anchor dynamically to the target DOM element even as page content reflows.
- **Mode B (Canvas Click)**:
  - Switches cursor to a crosshair.
  - Clicking anywhere on the page places a coordinate pin calculated relative to document percentage (`x_percent`, `y_percent`), capturing the `viewport_width` and underlying element text.
- **Browse Mode**:
  - Sets overlay `pointer-events: none` so you can click links, submit forms, and interact with the page normally while existing pins stay visible.

### 2. Figma Design System & Micro-Interactions
- Built using **Inter** typography and **Phosphor Icons**.
- Circular pins display user avatars or initials badges with sequential numbers (`#1`, `#2`, `#3`).
- Clicking any pin smoothly opens the floating thread card; clicking outside dismisses it.
- Resolving a comment hides the pin from the canvas while preserving it in the Side Panel under the **Resolved** tab.

### 3. SPA Route Navigation
- Automatically monitors Single Page Application routing across Next.js, React, and Vue:
  - Hooks `history.pushState` and `history.replaceState`.
  - Listens to `popstate` and `hashchange`.
  - Observes `<title>` DOM mutations.
- Instantly cleans up canvas pins and fetches comments and presence channels specific to the new route without full page reloads.

### 4. Real-Time Collaboration & Presence
- Uses Supabase Realtime WebSockets to sync pins and replies across all reviewers live.
- Supabase Presence shows real-time avatar badges of team members currently on the same URL path.

---

## 🧪 Testing the Extension

1. After loading the unpacked extension in Chrome, open `test/index.html`:
   - Open Chrome and press `Cmd+O` (macOS) or `Ctrl+O` (Windows/Linux) and select `/Users/ganesh/Desktop/comments/test/index.html`.
2. Notice the floating bottom dock toolbar appear.
3. Click **Inspect DOM** and hover over buttons and cards: observe the 2px blue outline.
4. Click an element, write a comment, and press **Post Comment**.
5. Click **Canvas Pin** and click anywhere on the canvas.
6. Click the navigation buttons (**Dashboard**, **Projects**, **Settings**) to test SPA route transitions—observe the route indicator and clean comment isolation.
7. Click the **Side Panel** icon to review active comments, filter by keyword, resolve items, or reply to threads.
