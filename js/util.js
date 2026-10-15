// Small shared helpers
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const CFG = window.APP_CONFIG || {};

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function eventDate() {
  if (!CFG.eventDate) return null;
  const d = new Date(CFG.eventDate + "T12:00:00");
  return isNaN(d) ? null : d;
}
export const dateLong = () => eventDate()?.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) || "";
export const dateShort = () => eventDate()?.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, " · ") || "";

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function slug(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "photo";
}

// ── Toasts ──
const ICONS = { ok: "i-check", err: "i-close", info: "i-sparkle" };
export function toast(msg, type = "info", ms = 2600) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<svg><use href="#${ICONS[type] || ICONS.info}"/></svg><span></span>`;
  el.querySelector("span").textContent = msg;
  $("#toasts").append(el);
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 260); };
  if (ms) setTimeout(close, ms);
  return { el, close, set: (t) => (el.querySelector("span").textContent = t) };
}

// ── Dialog (prompt / confirm) ──
export function ask({ title, text = "", input = false, value = "", placeholder = "", type = "text", ok = "OK", cancel = "Cancel", danger = false, maxlength = 60 }) {
  const dlg = $("#dialog");
  $("#dialog-title").textContent = title;
  $("#dialog-text").textContent = text;
  const inp = $("#dialog-input");
  inp.hidden = !input;
  inp.type = type; inp.value = value; inp.placeholder = placeholder; inp.maxLength = maxlength;
  $("#dialog-ok").textContent = ok;
  $("#dialog-ok").style.background = danger ? "var(--danger)" : "";
  $("#dialog-cancel").textContent = cancel;
  return new Promise((resolve) => {
    const done = () => {
      dlg.removeEventListener("close", done);
      if (dlg.returnValue !== "ok") return resolve(null);
      resolve(input ? inp.value.trim() : true);
    };
    dlg.returnValue = "";
    dlg.addEventListener("close", done);
    dlg.showModal();
    if (input) setTimeout(() => inp.focus(), 50);
  });
}

// ── IndexedDB (tiny promise wrapper) ──
let dbp;
export function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open("engagement-gallery", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("outbox", { keyPath: "id" });
      r.result.createObjectStore("demo", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function idb(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src));
    document.head.append(s);
  });
}

export function appUrl() {
  return CFG.publicUrl || location.href.split("#")[0];
}

export async function renderQR(el, text) {
  const { default: qrcode } = await import("../vendor/qrcode.mjs");
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  el.querySelector("svg")?.setAttribute("aria-hidden", "true");
}

export async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
