// Live wall: big-screen slideshow. New photos jump the queue and are shown immediately.
import { $, CFG, renderQR, appUrl, timeAgo } from "./util.js";
import { state, on } from "./store.js";
import { petals } from "./fx.js";

let active = false, timer = null, cursorTimer = null, wakeLock = null;
let pos = -1;               // index into state.sorted for the normal rotation
const priority = [];        // ids of brand-new photos to show next
let showing = null, wired = false;

function preload(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src; });
}

async function show(p, isNew = false) {
  if (!p || !active) return;
  const src = p.localUrl || p.url;
  if (!(await preload(src)) || !active) return;
  const stage = $("#wall-stage");
  const el = document.createElement("div");
  el.className = "wall-slide";
  el.innerHTML = `<div class="bg"></div><figure><img alt=""><figcaption></figcaption></figure>${isNew ? '<div class="wall-new">Just in</div>' : ""}`;
  el.querySelector(".bg").style.backgroundImage = `url("${p.thumbUrl || src}")`;
  el.querySelector("img").src = src;
  const cap = el.querySelector("figcaption");
  cap.textContent = p.caption || (p.guest_name ? `📸 ${p.guest_name}` : "");
  const small = document.createElement("small");
  small.textContent = [p.caption && p.guest_name ? p.guest_name : null, timeAgo(p.created_at)].filter(Boolean).join(" · ");
  cap.append(small);
  stage.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("on")));
  const old = [...stage.children].filter((c) => c !== el);
  setTimeout(() => old.forEach((o) => o.remove()), 1400);
  showing = p.id;
}

const setCount = (n) => ($("#wall-count").textContent = `${n} photo${n === 1 ? "" : "s"}`);

function next() {
  clearTimeout(timer);
  if (!active) return;
  const L = state.sorted.filter((p) => !p.pending);
  $("#wall-empty").hidden = L.length > 0;
  setCount(L.length);
  if (!L.length) { $("#wall-stage").replaceChildren(); return; }
  let p, isNew = false;
  while (priority.length && !p) { p = state.photos.get(priority.shift()); isNew = !!p; }
  if (!p) {
    pos = (pos + 1) % L.length;
    p = L[pos];
    if (L.length > 1 && p.id === showing) { pos = (pos + 1) % L.length; p = L[pos]; }
  }
  show(p, isNew);
  timer = setTimeout(next, (CFG.wallInterval || 6) * 1000 * (isNew ? 1.4 : 1));
}

async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
}

function wire() {
  if (wired) return; wired = true;
  on((type, p) => {
    if (!active) return;
    setCount(state.sorted.filter((x) => !x.pending).length);
    $(".wall-count .live-dot").classList.toggle("on", state.live);
    if (type === "add" || (type === "replace" && !p.pending && !priority.includes(p.id) && p.id !== showing && Date.now() - new Date(p.created_at) < 60000)) {
      if (p.pending) return;
      priority.push(p.id);
      if (priority.length === 1) next(); // interrupt the rotation for the newest photo
    } else if (type === "reset" && !showing) next();
    else if (type === "remove" && p.id === showing) next();
  });
  const view = $("#view-wall");
  view.addEventListener("pointermove", () => {
    view.classList.add("show-cursor");
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => view.classList.remove("show-cursor"), 2500);
  });
  $("#btn-fullscreen").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  document.addEventListener("visibilitychange", () => { if (active && document.visibilityState === "visible") keepAwake(); });
}

export function enter() {
  wire();
  active = true;
  petals($("#wall-petals"), 18);
  renderQR($("#wall-qr"), appUrl()).catch(() => {});
  $(".wall-count .live-dot").classList.toggle("on", state.live);
  pos = -1; showing = null; priority.length = 0;
  next();
  keepAwake();
}
export function leave() {
  active = false;
  clearTimeout(timer);
  $("#wall-stage").replaceChildren();
  wakeLock?.release?.().catch(() => {}); wakeLock = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}
