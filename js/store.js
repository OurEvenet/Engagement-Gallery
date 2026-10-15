// Data layer: Supabase (live) or Demo (this device only), plus an offline upload queue.
import { CFG, idb, loadScript, toast } from "./util.js";

export const isLive = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);

/* ───────────── Shared photo state + events ───────────── */
const listeners = new Set();
export const state = {
  photos: new Map(),   // id -> photo {id, url, thumbUrl, guest_name, caption, width, height, created_at, pending?}
  ready: false,
  live: false,         // realtime connected
  sorted: [],
};
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(type, payload) {
  state.sorted = [...state.photos.values()].sort((a, b) => (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : 0));
  listeners.forEach((fn) => { try { fn(type, payload); } catch (e) { console.error(e); } });
}
function upsert(p, { quiet = false } = {}) {
  const existed = state.photos.get(p.id);
  if (existed && !existed.pending) return;
  state.photos.set(p.id, p);
  if (!quiet) emit(existed ? "replace" : "add", p);
}
function drop(id) {
  if (state.photos.delete(id)) emit("remove", { id });
}
function setLive(v) { if (state.live !== v) { state.live = v; emit("status", { live: v }); } }

/* ───────────── Adapters ───────────── */
let api;

function demoAdapter() {
  const chan = "BroadcastChannel" in window ? new BroadcastChannel("eg-demo") : null;
  const urls = new Map();
  const toPhoto = (r) => {
    if (!urls.has(r.id)) urls.set(r.id, { url: URL.createObjectURL(r.full), thumbUrl: URL.createObjectURL(r.thumb) });
    const { full, thumb, ...meta } = r;
    return { ...meta, ...urls.get(r.id) };
  };
  return {
    async list() {
      const rows = await idb("demo", "readonly", (s) => s.getAll());
      return rows.map(toPhoto);
    },
    async upload({ id, full, thumb, meta }) {
      const row = { id, full, thumb, ...meta, created_at: new Date().toISOString() };
      await idb("demo", "readwrite", (s) => s.put(row));
      chan?.postMessage({ type: "add", id });
      return toPhoto(row);
    },
    subscribe(onAdd, onRemove) {
      if (chan) chan.onmessage = async ({ data }) => {
        if (data.type === "add") {
          const row = await idb("demo", "readonly", (s) => s.get(data.id));
          if (row) onAdd(toPhoto(row));
        } else if (data.type === "remove") onRemove(data.id);
      };
      setLive(true);
    },
    async checkPin(pin) { return pin === String(CFG.demoAdminPin ?? "1234"); },
    async remove(id, pin) {
      if (!(await this.checkPin(pin))) throw new Error("Incorrect host PIN");
      await idb("demo", "readwrite", (s) => s.delete(id));
      chan?.postMessage({ type: "remove", id });
    },
  };
}

async function supabaseAdapter() {
  if (!window.supabase) await loadScript("vendor/supabase.min.js");
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  const bucket = CFG.bucket || "photos";
  const pub = (path) => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const toPhoto = (r) => ({ ...r, url: pub(r.path), thumbUrl: pub(r.thumb_path) });

  return {
    async list() {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from("photos").select("*").order("created_at", { ascending: false }).range(from, from + 999);
        if (error) throw error;
        out.push(...data);
        if (data.length < 1000) break;
      }
      return out.map(toPhoto);
    },
    async upload({ id, full, thumb, meta }) {
      const path = `full/${id}.jpg`, thumb_path = `thumb/${id}.jpg`;
      for (const [p, blob] of [[thumb_path, thumb], [path, full]]) {
        const { error } = await sb.storage.from(bucket).upload(p, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        // A retry after a dropped connection may find the file already there — that's fine.
        if (error && !/exist|duplicate/i.test(error.message) && String(error.statusCode) !== "409") throw error;
      }
      const row = { id, path, thumb_path, ...meta };
      const { error } = await sb.from("photos").insert(row);
      if (error && error.code !== "23505") throw error;
      return toPhoto({ ...row, created_at: new Date().toISOString() });
    },
    subscribe(onAdd, onRemove) {
      let poll = null;
      const startPolling = () => { poll ||= setInterval(resync, 15000); };
      const stopPolling = () => { clearInterval(poll); poll = null; };
      sb.channel("photos-live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "photos" }, ({ new: r }) => onAdd(toPhoto(r)))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "photos" }, ({ old }) => old?.id && onRemove(old.id))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") { setLive(true); stopPolling(); resync(); }
          else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) { setLive(false); startPolling(); }
        });
      setTimeout(() => { if (!state.live) startPolling(); }, 10000);
    },
    async checkPin(pin) {
      const { data, error } = await sb.rpc("admin_check_pin", { p_pin: pin });
      if (error) throw error;
      return !!data;
    },
    async remove(id, pin) {
      const { error } = await sb.rpc("admin_delete_photo", { p_id: id, p_pin: pin });
      if (error) throw new Error(/pin/i.test(error.message) ? "Incorrect host PIN" : error.message);
    },
  };
}

/* ───────────── Sync ───────────── */
const CACHE_KEY = "eg-cache-v1";

async function resync() {
  try {
    const rows = await api.list();
    const ids = new Set(rows.map((r) => r.id));
    let changed = false;
    for (const r of rows) if (!state.photos.has(r.id) || state.photos.get(r.id).pending) { upsert(r, { quiet: true }); changed = true; }
    for (const [id, p] of state.photos) if (!p.pending && !ids.has(id)) { state.photos.delete(id); changed = true; }
    if (changed || !state.ready) { state.ready = true; emit("reset"); }
    if (isLive) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows.slice(0, 300))); } catch {}
    }
  } catch (e) {
    console.warn("Sync failed", e);
    if (!state.ready) { state.ready = true; emit("reset"); }
  }
}

export async function init() {
  if (isLive) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
      cached.forEach((r) => upsert(r, { quiet: true }));
      if (cached.length) { state.ready = true; emit("reset"); }
    } catch {}
  }
  try {
    api = isLive ? await supabaseAdapter() : demoAdapter();
  } catch (e) {
    console.error(e);
    toast("Couldn't connect to the album. Check your connection.", "err", 5000);
    state.ready = true; emit("reset");
    return;
  }
  await loadPending();
  const slow = setTimeout(() => {
    if (state.ready) return;
    state.ready = true; emit("reset");
    toast("Slow connection — still loading the album…", "info", 4000);
  }, 8000);
  await resync();
  clearTimeout(slow);
  api.subscribe((p) => upsert(p), (id) => drop(id));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && resync());
  addEventListener("online", () => { resync(); processOutbox(); });
  processOutbox();
  setInterval(processOutbox, 20000);
}

export const checkPin = (pin) => api.checkPin(pin);
export async function removePhoto(id, pin) {
  await api.remove(id, pin);
  drop(id);
}

/* ───────────── Outbox (offline-safe uploads) ───────────── */
const pendingUrls = new Map();
export const outbox = { count: 0, busy: false };

function pendingPhoto(item) {
  if (!pendingUrls.has(item.id)) pendingUrls.set(item.id, { url: URL.createObjectURL(item.full), thumbUrl: URL.createObjectURL(item.thumb) });
  return { id: item.id, ...item.meta, ...pendingUrls.get(item.id), created_at: item.created_at, pending: true };
}

async function loadPending() {
  const items = await idb("outbox", "readonly", (s) => s.getAll());
  outbox.count = items.length;
  items.forEach((it) => upsert(pendingPhoto(it), { quiet: true }));
  emit("outbox", outbox);
}

export async function enqueue({ id, full, thumb, meta }) {
  const item = { id, full, thumb, meta, created_at: new Date().toISOString(), attempts: 0 };
  await idb("outbox", "readwrite", (s) => s.put(item));
  outbox.count++;
  upsert(pendingPhoto(item));
  emit("outbox", outbox);
  processOutbox();
}

export async function processOutbox() {
  if (outbox.busy || !api) return;
  outbox.busy = true; emit("outbox", outbox);
  try {
    const items = await idb("outbox", "readonly", (s) => s.getAll());
    items.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    for (const it of items) {
      if (!navigator.onLine && isLive) break;
      try {
        const photo = await api.upload(it);
        await idb("outbox", "readwrite", (s) => s.delete(it.id));
        outbox.count = Math.max(0, outbox.count - 1);
        // keep the local blob URLs for a smooth swap; real URLs load in the background
        const local = pendingUrls.get(it.id);
        state.photos.set(it.id, { ...photo, localThumb: local?.thumbUrl, localUrl: local?.url });
        emit("replace", state.photos.get(it.id));
        emit("uploaded", photo);
      } catch (e) {
        console.warn("Upload failed, will retry", e);
        it.attempts++;
        await idb("outbox", "readwrite", (s) => s.put(it));
        emit("upload-error", e);
        break;
      }
    }
  } finally {
    outbox.busy = false; emit("outbox", outbox);
  }
}
