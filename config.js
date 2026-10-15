/**
 * ─────────────────────────────────────────────────────────────
 *  EVENT CONFIGURATION — the only file you need to edit.
 * ─────────────────────────────────────────────────────────────
 *  Leave supabaseUrl / supabaseAnonKey empty to run in DEMO MODE
 *  (photos stay on this device only — great for trying it out).
 */
window.APP_CONFIG = {
  // Branding
  coupleNames: "Alex & Jordan",
  eventTitle: "Our Engagement",
  eventDate: "2026-11-21",          // YYYY-MM-DD (shown on the home page and the photo frame)
  welcomeMessage: "Capture the moments you see tonight — every photo appears instantly in our shared album.",

  // Add the couple's names + date as an elegant frame along the bottom of every photo
  watermark: true,

  // Supabase (free tier) — Project Settings → API
  supabaseUrl: "",                   // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",               // the "anon" / "publishable" public key — safe to expose
  bucket: "photos",

  // URL guests should open (used for the QR code). Leave empty to use the current page URL.
  publicUrl: "",

  // Image quality
  maxImageEdge: 2048,                // longest side of the stored photo, in pixels
  jpegQuality: 0.88,
  thumbEdge: 480,

  // Live wall (big screen) — seconds per photo
  wallInterval: 6,

  // Demo mode only: host PIN for removing photos
  demoAdminPin: "1234",
};
