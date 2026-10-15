// Gallery grid, lightbox, downloads, host tools.
import { $, CFG, toast, ask, timeAgo, slug, downloadBlob, loadScript } from "./util.js";
import { state, on, isLive, checkPin, removePhoto } from "./store.js";

const tiles = new Map(); // id -> element
let active = false, unseen = 0;
const hostPin = () => sessionStorage.getItem("eg-host-pin");

/* ───────────── Grid ───────────── */
function tile(p) {
  let el = tiles.get(p.id);
  if (!el) {
    el = document.createElement("button");
    el.className = "tile";
    el.dataset.id = p.id;
    el.innerHTML = `<img alt="" loading="lazy" decoding="async"><span class="tile-name"></span>`;
    const img = el.firstChild;
    img.onload = () => img.classList.add("loaded");
    img.onerror = () => { if (p.thumbUrl && img.src !== p.url) img.src = p.url; };
    el.onclick = () => openLightbox(el.dataset.id);
    tiles.set(p.id, el);
  }
  const img = el.firstChild;
  const src = p.localThumb || p.thumbUrl;
  if (img.getAttribute("src") !== src) img.src = src;
  img.alt = p.caption || (p.guest_name ? `Photo by ${p.guest_name}` : "Guest photo");
  el.querySelector(".tile-name").textContent = p.guest_name || "";
  el.classList.toggle("pending", !!p.pending);
  el.setAttribute("aria-label", img.alt);
  return el;
}

function renderGrid(newIds = new Set()) {
  const grid = $("#grid");
  const list = state.sorted;
  const keep = new Set(list.map((p) => p.id));
  for (const [id, el] of tiles) if (!keep.has(id)) { el.remove(); tiles.delete(id); }
  let prev = null;
  for (const p of list) {
    const el = tile(p);
    if (newIds.has(p.id)) el.classList.add("new");
    const want = prev ? prev.nextSibling : grid.firstChild;
    if (want !== el) grid.insertBefore(el, want);
    prev = el;
  }
  $("#skeleton").hidden = state.ready;
  $("#gallery-empty").hidden = !state.ready || list.length > 0;
  renderMeta();
}

function renderMeta() {
  const n = state.sorted.filter((p) => !p.pending).length;
  const guests = new Set(state.sorted.map((p) => p.guest_name).filter(Boolean)).size;
  $("#gallery-meta").textContent = !state.ready ? "Loading…" :
    `${n} photo${n === 1 ? "" : "s"}${guests ? ` · ${guests} guest${guests === 1 ? "" : "s"}` : ""}${state.live ? " · live" : ""}`;
  $("#live-dot").classList.toggle("on", state.live);
  $("#btn-zip").disabled = n === 0;
  $("#host-label").textContent = hostPin() ? "Host mode on · exit" : "Host tools";
}

/* ───────────── Lightbox ───────────── */
const LB = { open: false, id: null, drag: null };
const lbIdx = () => state.sorted.findIndex((p) => p.id === LB.id);

function slide(p) {
  const s = document.createElement("div");
  s.className = "lb-slide";
  if (!p) return s;
  const t = document.createElement("img");
  t.src = p.localThumb || p.thumbUrl; t.alt = ""; t.draggable = false;
  const f = document.createElement("img");
  f.className = "full"; f.alt = p.caption || "Guest photo"; f.draggable = false;
  f.onload = () => { f.classList.add("loaded"); t.style.visibility = "hidden"; };
  f.src = p.localUrl || p.url;
  s.append(t, f);
  return s;
}

function renderLB() {
  const i = lbIdx();
  if (i < 0) return closeLightbox();
  const L = state.sorted;
  const p = L[i];
  const track = $("#lb-track");
  track.style.transition = "none";
  track.style.transform = "translateX(-100%)";
  track.replaceChildren(slide(L[i - 1]), slide(p), slide(L[i + 1]));
  $("#lb-index").textContent = `${i + 1} / ${L.length}`;
  $("#lb-caption").textContent = p.caption || "";
  $("#lb-meta").textContent = [p.guest_name ? `by ${p.guest_name}` : null, p.pending ? "uploading…" : timeAgo(p.created_at)].filter(Boolean).join(" · ");
  $("#lb-prev").style.visibility = i > 0 ? "" : "hidden";
  $("#lb-next").style.visibility = i < L.length - 1 ? "" : "hidden";
  $("#lb-share").hidden = !navigator.share;
  $("#lb-delete").hidden = !hostPin() || p.pending;
}

export function openLightbox(id) {
  LB.id = id;
  if (!LB.open) {
    LB.open = true;
    $("#lightbox").hidden = false;
    document.body.classList.add("no-scroll");
    history.pushState({ lb: 1 }, "", location.hash);
  }
  renderLB();
}
function closeLightbox(fromPop = false) {
  if (!LB.open) return;
  LB.open = false;
  $("#lightbox").hidden = true;
  document.body.classList.remove("no-scroll");
  $("#lb-track").replaceChildren();
  if (!fromPop && history.state?.lb) history.back();
}
function go(dir) {
  const i = lbIdx(), L = state.sorted;
  const j = i + dir;
  const track = $("#lb-track");
  if (j < 0 || j >= L.length) {
    track.style.transition = "transform .25s ease"; track.style.transform = "translateX(-100%)";
    return;
  }
  track.style.transition = "transform .28s cubic-bezier(.2,.8,.3,1)";
  track.style.transform = `translateX(${-100 - dir * 100}%)`;
  LB.id = L[j].id;
  setTimeout(renderLB, 280);
}

function wireLightbox() {
  const lb = $("#lightbox"), track = $("#lb-track");
  $("#lb-close").onclick = () => closeLightbox();
  $("#lb-prev").onclick = () => go(-1);
  $("#lb-next").onclick = () => go(1);
  $("#lb-download").onclick = () => savePhoto(state.photos.get(LB.id));
  $("#lb-share").onclick = () => sharePhoto(state.photos.get(LB.id));
  $("#lb-delete").onclick = () => deletePhoto(state.photos.get(LB.id));
  addEventListener("popstate", () => LB.open && closeLightbox(true));
  addEventListener("keydown", (e) => {
    if (!LB.open || $("#dialog").open) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  });
  lb.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    LB.drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, axis: null };
    track.style.transition = "none";
  });
  lb.addEventListener("pointermove", (e) => {
    const d = LB.drag; if (!d) return;
    d.dx = e.clientX - d.x; d.dy = e.clientY - d.y;
    d.axis ||= Math.abs(d.dx) > 8 ? "x" : Math.abs(d.dy) > 8 ? "y" : null;
    if (d.axis === "x") track.style.transform = `translateX(calc(-100% + ${d.dx}px))`;
    else if (d.axis === "y" && d.dy > 0) {
      track.style.transform = `translateX(-100%) translateY(${d.dy}px) scale(${1 - Math.min(d.dy, 300) / 1500})`;
      lb.style.background = `rgba(5,4,4,${1 - Math.min(d.dy, 300) / 400})`;
    }
  });
  const end = () => {
    const d = LB.drag; LB.drag = null; if (!d) return;
    lb.style.background = "";
    if (d.axis === "x" && Math.abs(d.dx) > Math.min(80, innerWidth * 0.18)) go(d.dx < 0 ? 1 : -1);
    else if (d.axis === "y" && d.dy > 110) closeLightbox();
    else { track.style.transition = "transform .25s ease"; track.style.transform = "translateX(-100%)"; }
  };
  lb.addEventListener("pointerup", end);
  lb.addEventListener("pointercancel", end);
}

/* ───────────── Actions ───────────── */
const fileName = (p) => `${slug(CFG.coupleNames)}-${p.guest_name ? slug(p.guest_name) + "-" : ""}${p.id.slice(0, 8)}.jpg`;
async function fetchBlob(p) {
  const r = await fetch(p.localUrl || p.url, { mode: "cors" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.blob();
}

async function savePhoto(p) {
  if (!p) return;
  const t = toast("Preparing download…", "info", 0);
  try {
    await downloadBlob(await fetchBlob(p), fileName(p));
    t.close(); toast("Photo saved", "ok");
  } catch (e) {
    t.close();
    window.open(p.url, "_blank", "noopener"); // fallback: open full image (long-press to save)
  }
}

async function sharePhoto(p) {
  if (!p) return;
  try {
    const blob = await fetchBlob(p);
    const file = new File([blob], fileName(p), { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: CFG.coupleNames });
    else await navigator.share({ title: CFG.coupleNames, url: p.url });
  } catch (e) {
    if (e.name !== "AbortError") toast("Sharing isn't available here — try Save instead.", "err");
  }
}

async function deletePhoto(p) {
  if (!p || !hostPin()) return;
  const ok = await ask({ title: "Remove this photo?", text: "It will disappear from the album for everyone.", ok: "Remove", danger: true });
  if (!ok) return;
  try {
    await removePhoto(p.id, hostPin());
    toast("Photo removed", "ok");
  } catch (e) {
    if (/pin/i.test(e.message)) sessionStorage.removeItem("eg-host-pin");
    toast(e.message || "Couldn't remove photo", "err");
    renderMeta();
  }
}

async function hostTools() {
  if (hostPin()) {
    sessionStorage.removeItem("eg-host-pin");
    toast("Host mode off"); renderMeta(); return;
  }
  const pin = await ask({
    title: "Host tools", text: isLive ? "Enter the host PIN to moderate photos." : `Demo mode — the host PIN is set in config.js (default ${CFG.demoAdminPin ?? "1234"}).`,
    input: true, type: "password", placeholder: "Host PIN", ok: "Unlock", maxlength: 200,
  });
  if (!pin) return;
  try {
    if (!(await checkPin(pin))) return toast("Incorrect PIN", "err");
    sessionStorage.setItem("eg-host-pin", pin);
    toast("Host mode on — open a photo to remove it", "ok", 3500);
    renderMeta();
  } catch (e) {
    toast("Couldn't verify PIN: " + (e.message || e), "err");
  }
}

async function downloadAll() {
  const list = state.sorted.filter((p) => !p.pending);
  if (!list.length) return;
  const mb = Math.round(list.length * 0.45);
  const ok = await ask({ title: `Download all ${list.length} photos?`, text: `They'll be saved as one .zip file (about ${mb || 1} MB). Best done on Wi-Fi or a computer.`, ok: "Download" });
  if (!ok) return;
  const t = toast("Preparing…", "info", 0);
  try {
    if (!window.JSZip) await loadScript("vendor/jszip.min.js");
    const zip = new window.JSZip();
    let done = 0, failed = 0, i = 0;
    const worker = async () => {
      while (i < list.length) {
        const p = list[i++];
        try { zip.file(fileName(p), await fetchBlob(p), { binary: true, date: new Date(p.created_at) }); }
        catch { failed++; }
        t.set(`Downloading ${++done} of ${list.length}…`);
      }
    };
    await Promise.all([1, 2, 3, 4].map(worker));
    t.set("Creating zip…");
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    await downloadBlob(blob, `${slug(CFG.coupleNames)}-album.zip`);
    t.close();
    toast(failed ? `Saved — ${failed} photo(s) couldn't be fetched` : "Album downloaded", failed ? "err" : "ok", 4000);
  } catch (e) {
    console.error(e); t.close();
    toast("Download failed. Please try again on Wi-Fi.", "err");
  }
}

/* ───────────── Lifecycle ───────────── */
let wired = false;
export function initGallery() {
  if (wired) return; wired = true;
  wireLightbox();
  $("#btn-zip").onclick = downloadAll;
  $("#btn-host").onclick = hostTools;
  $("#new-pill button").onclick = () => { scrollTo({ top: 0, behavior: "smooth" }); };
  addEventListener("scroll", () => { if (scrollY < 80) { unseen = 0; $("#new-pill").hidden = true; } }, { passive: true });

  on((type, p) => {
    if (type === "status") return renderMeta();
    if (type === "outbox" || type === "uploaded" || type === "upload-error") return;
    const fresh = new Set(type === "add" ? [p.id] : []);
    if (active) {
      renderGrid(fresh);
      if (type === "add" && scrollY > 300) { unseen++; $("#new-pill").hidden = false; $("#new-pill button").textContent = `${unseen} new photo${unseen > 1 ? "s" : ""} ↑`; }
    }
    if (LB.open) {
      if (type === "remove" && p.id === LB.id) { toast("That photo was removed"); closeLightbox(); }
      else if (type !== "add") renderLB();
      else $("#lb-index").textContent = `${lbIdx() + 1} / ${state.sorted.length}`;
    }
  });
}

export function enter() {
  initGallery();
  active = true;
  renderGrid();
}
export function leave() { active = false; closeLightbox(); }
