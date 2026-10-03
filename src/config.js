/**
 * UI Commenter - Global Configuration
 * 
 * Replace these placeholders with your actual Supabase project credentials,
 * or configure them dynamically via the Side Panel Settings.
 */
export const CONFIG = {
  // Supabase Project Settings
  SUPABASE_URL: "https://mfphwmxbvnajymxfmrjg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_s8UvyBMR2LVAR3OPEJynrw_jkT6KomO",

  // 5-day expiration interval in milliseconds (120 hours)
  COMMENT_EXPIRATION_MS: 5 * 24 * 60 * 60 * 1000,

  // UI Theme Constants (Figma Aesthetic)
  THEME: {
    accentColor: "#18A0FB",       // Figma Blue
    accentHover: "#0C8CE9",
    accentLight: "rgba(24, 160, 251, 0.12)",
    surface: "#FFFFFF",
    surfaceAlt: "#F5F5F5",
    border: "#E5E5E5",
    borderStrong: "#D1D1D1",
    textPrimary: "#333333",
    textSecondary: "#666666",
    textMuted: "#888888",
    danger: "#F24822",
    success: "#1BC47D",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  },

  // Extension metadata
  APP_NAME: "Comments",
  STORAGE_KEYS: {
    AUTH_SESSION: "ui_commenter_auth_session",
    USER_PROFILE: "ui_commenter_user_profile",
    CUSTOM_CONFIG: "ui_commenter_custom_config",
    ACTIVE_MODE: "ui_commenter_active_mode"
  }
};

/**
 * Loads configured or overridden Supabase credentials from storage
 */
export async function getEffectiveConfig() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([CONFIG.STORAGE_KEYS.CUSTOM_CONFIG], (result) => {
        const custom = result[CONFIG.STORAGE_KEYS.CUSTOM_CONFIG] || {};
        resolve({
          ...CONFIG,
          SUPABASE_URL: custom.supabaseUrl || CONFIG.SUPABASE_URL,
          SUPABASE_ANON_KEY: custom.supabaseAnonKey || CONFIG.SUPABASE_ANON_KEY
        });
      });
    } else {
      resolve(CONFIG);
    }
  });
}
