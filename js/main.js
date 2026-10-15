import { $, $$, CFG, dateLong, dateShort, toast, renderQR, appUrl } from "./util.js";
import { init, state, on, isLive } from "./store.js";
import * as camera from "./camera.js";
import * as gallery from "./gallery.js";
import * as wall from "./wall.js";

/* ── Bind config text ── */
const binds = {
  coupleNames: CFG.coupleNames || "Our Engagement",
  eventTitle: CFG.eventTitle || "",
  eventDateLong: dateLong(),
  eventDateShort: dateShort(),
  welcomeMessage: CFG.welcomeMessage || "",
};
for (const el of $$("[data-bind]")) {
  const k = el.dataset.bind;
  if (k in binds) { el.textContent = binds[k]; if (!binds[k]) el.hidden = true; }
}
document.title = `${CFG.coupleNames || "Engagement"} · Live Album`;
$("#demo-banner").hidden = isLive;

/* ── Router ── */
const views = { home: null, camera, gallery, wall };
let current = null;
function route() {
  const name = (location.hash.replace(/^#\/?/, "").split("/")[0]) || "home";
  const next = name in views ? name : "home";
  if (next === current) return;
  if (current) views[current]?.leave?.();
  $$(".view").forEach((v) => (v.hidden = v.dataset.view !== next));
  document.body.className = `route-${next}`;
  current = next;
  if (next === "home") enterHome();
  else views[next].enter();
  if (next !== "camera" && next !== "wall") scrollTo(0, 0);
}
addEventListener("hashchange", route);

/* ── Home ── */
let homeWired = false;
function enterHome() {
  renderHome();
  if (homeWired) return; homeWired = true;
  renderQR($("#home-qr"), appUrl()).catch(() => ($("#home-qr").closest(".invite").hidden = true));
  $("#btn-copy-link").onclick = async () => {
    try {
      if (navigator.share && matchMedia("(hover: none)").matches) await navigator.share({ title: CFG.coupleNames, url: appUrl() });
      else { await navigator.clipboard.writeText(appUrl()); toast("Link copied", "ok"); }
    } catch (e) { if (e.name !== "AbortError") toast(appUrl(), "info", 6000); }
  };
}
function renderHome() {
  if (current !== "home") return;
  const list = state.sorted.filter((p) => !p.pending || p.localThumb || p.thumbUrl);
  const strip = $("#latest-strip");
  const top = list.slice(0, 12);
  const have = [...strip.children].map((c) => c.dataset.id).join();
  if (have !== top.map((p) => p.id).join()) {
    strip.replaceChildren(...top.map((p) => {
      const b = document.createElement("button");
      b.dataset.id = p.id;
      b.setAttribute("aria-label", p.guest_name ? `Photo by ${p.guest_name}` : "Guest photo");
      const img = document.createElement("img");
      img.src = p.localThumb || p.thumbUrl; img.alt = ""; img.loading = "lazy";
      b.append(img);
      b.onclick = () => { location.hash = "#/gallery"; setTimeout(() => gallery.openLightbox(p.id), 50); };
      return b;
    }));
  }
  $("#latest-empty").hidden = !state.ready || list.length > 0;
  const n = state.sorted.filter((p) => !p.pending).length;
  const pill = $('[data-bind="photoCount"]');
  pill.hidden = !n; pill.textContent = n;
  $(".latest h2 .live-dot").classList.toggle("on", state.live);
}
on((type) => { if (type !== "outbox") renderHome(); });

/* ── Global upload feedback ── */
let lastErr = 0;
on((type) => {
  if (type === "upload-error" && Date.now() - lastErr > 30000) {
    lastErr = Date.now();
    toast(navigator.onLine ? "Upload paused — retrying shortly" : "You're offline — photos will upload automatically", "err", 3500);
  }
});

/* ── PWA ── */
let installEvt;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("#btn-install").hidden = false; });
$("#btn-install").onclick = async () => { installEvt?.prompt(); installEvt = null; $("#btn-install").hidden = true; };
if ("serviceWorker" in navigator && location.protocol === "https:") {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

/* ── Go ── */
gallery.initGallery();
route();
init();
