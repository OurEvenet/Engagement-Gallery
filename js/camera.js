// Camera: live preview, capture via canvas (camera-only — no file inputs anywhere), filters, timer, frame.
import { $, CFG, uuid, toast, ask, dateShort } from "./util.js";
import { enqueue, on, outbox, state } from "./store.js";
import { heartBurst } from "./fx.js";

/* Filters are defined once as a list of ops; used both as a CSS filter (live preview)
   and as pixel maths (for browsers like iOS Safari without canvas ctx.filter). */
const FILTERS = [
  { id: "none", label: "Original", ops: [] },
  { id: "glow", label: "Glow", ops: [["brightness", 1.08], ["contrast", 1.04], ["saturate", 1.12]] },
  { id: "warm", label: "Warm", ops: [["sepia", 0.22], ["saturate", 1.18], ["brightness", 1.04]] },
  { id: "rose", label: "Rosé", ops: [["sepia", 0.18], ["hue-rotate", -12], ["saturate", 1.2], ["brightness", 1.05]] },
  { id: "film", label: "Film", ops: [["sepia", 0.42], ["contrast", 0.92], ["brightness", 1.06], ["saturate", 0.9]] },
  { id: "mono", label: "B&W", ops: [["grayscale", 1], ["contrast", 1.12], ["brightness", 1.03]] },
];
const cssOf = (ops) => ops.map(([k, v]) => (k === "hue-rotate" ? `${k}(${v}deg)` : `${k}(${v})`)).join(" ") || "none";

function matrixOf(ops) {
  // 3x3 colour matrix + additive offset (contrast) composed in order — mirrors the Filter Effects spec.
  let M = [1, 0, 0, 0, 1, 0, 0, 0, 1], add = [0, 0, 0];
  const mul = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
  const apply = (A, off = [0, 0, 0]) => {
    const nAdd = [0, 1, 2].map((r) => A[r * 3] * add[0] + A[r * 3 + 1] * add[1] + A[r * 3 + 2] * add[2] + off[r]);
    M = mul(A, M); add = nAdd;
  };
  for (const [k, v] of ops) {
    if (k === "brightness") apply([v, 0, 0, 0, v, 0, 0, 0, v]);
    else if (k === "contrast") apply([v, 0, 0, 0, v, 0, 0, 0, v], [0, 1, 2].map(() => (0.5 - 0.5 * v) * 255));
    else if (k === "saturate") apply([0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v]);
    else if (k === "grayscale") { const a = 1 - v; apply([0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a]); }
    else if (k === "sepia") { const a = 1 - v; apply([0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a]); }
    else if (k === "hue-rotate") {
      const r = (v * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      apply([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]);
    }
  }
  return { M, add };
}
function applyPixels(ctx, w, h, ops) {
  if (!ops.length) return;
  const { M, add } = matrixOf(ops);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = M[0] * r + M[1] * g + M[2] * b + add[0];
    d[i + 1] = M[3] * r + M[4] * g + M[5] * b + add[1];
    d[i + 2] = M[6] * r + M[7] * g + M[8] * b + add[2];
  }
  ctx.putImageData(img, 0, 0);
}
const canvasFilterSupported = (() => {
  try { const c = document.createElement("canvas").getContext("2d"); c.filter = "grayscale(1)"; return c.filter === "grayscale(1)"; } catch { return false; }
})();

/* ───────────── State ───────────── */
const S = {
  stream: null, facing: "user", timer: 0, filter: FILTERS[0], multiCam: false,
  busy: false, captured: null, active: false, starting: null,
};
const video = () => $("#cam-video");

function setMsg(title, body, btn = "Try again") {
  const m = $("#cam-msg");
  if (!title) { m.hidden = true; return; }
  $("#cam-msg-title").textContent = title;
  $("#cam-msg-body").textContent = body;
  $("#btn-cam-retry").textContent = btn;
  $("#btn-cam-retry").hidden = !btn;
  m.hidden = false;
}

async function startStream() {
  stopStream();
  $("#btn-shutter").disabled = true;
  if (!window.isSecureContext) return setMsg("Secure connection needed", "The camera only works over https://. Open the album from its https link.", null);
  if (!navigator.mediaDevices?.getUserMedia) return setMsg("Camera not supported", "This browser can't use the camera. Please open the link in Safari (iPhone) or Chrome (Android).", null);

  const want = { facingMode: { ideal: S.facing }, width: { ideal: 2560 }, height: { ideal: 1920 } };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
  } catch (e) {
    if (e.name === "OverconstrainedError") {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch (e2) { e = e2; }
    }
    if (!stream) return showCamError(e);
  }
  if (!S.active) { stream.getTracks().forEach((t) => t.stop()); return; }
  S.stream = stream;
  const v = video();
  v.srcObject = stream;
  try { await v.play(); } catch {}
  await new Promise((r) => (v.readyState >= 2 && v.videoWidth ? r() : v.addEventListener("loadeddata", r, { once: true })));

  const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
  const isFront = settings.facingMode ? settings.facingMode === "user" : S.facing === "user";
  $("#viewfinder").classList.toggle("mirror", isFront);
  setMsg(null);
  $("#btn-shutter").disabled = false;

  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    S.multiCam = devs.filter((d) => d.kind === "videoinput").length > 1;
  } catch { S.multiCam = false; }
  $("#btn-flip").hidden = !S.multiCam;
  $("#flip-spacer").hidden = S.multiCam;
}

function showCamError(e) {
  console.warn("Camera error", e);
  const n = e?.name;
  if (n === "NotAllowedError" || n === "SecurityError")
    setMsg("Camera access is off", "Allow camera access for this site in your browser settings (tap the “aA” or 🔒 icon by the address), then try again.", "Try again");
  else if (n === "NotFoundError" || n === "DevicesNotFoundError") setMsg("No camera found", "We couldn't find a camera on this device.", "Try again");
  else if (n === "NotReadableError" || n === "TrackStartError") setMsg("Camera is busy", "Another app is using the camera. Close it and try again.", "Try again");
  else setMsg("Couldn't start the camera", "Please try again, or reopen this page in your phone's main browser.", "Try again");
}

function stopStream() {
  S.stream?.getTracks().forEach((t) => t.stop());
  S.stream = null;
  const v = video(); if (v) v.srcObject = null;
}

/* ───────────── Capture ───────────── */
async function capture() {
  if (S.busy || !S.stream) return;
  S.busy = true;
  $("#btn-shutter").classList.add("busy");
  try {
    if (S.timer) await countdown(S.timer);
    if (!S.stream) return;
    $("#flash").classList.remove("go"); void $("#flash").offsetWidth; $("#flash").classList.add("go");
    navigator.vibrate?.(30);

    const v = video();
    const vw = v.videoWidth, vh = v.videoHeight;
    const box = $("#viewfinder").getBoundingClientRect();
    const A = box.width / box.height;                 // what the guest sees (object-fit: cover)
    let sw, sh;
    if (vw / vh > A) { sh = vh; sw = vh * A; } else { sw = vw; sh = vw / A; }
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const scale = Math.min(1, (CFG.maxImageEdge || 2048) / Math.max(sw, sh));
    const W = Math.round(sw * scale), H = Math.round(sh * scale);

    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const mirror = $("#viewfinder").classList.contains("mirror");
    if (canvasFilterSupported && S.filter.ops.length) ctx.filter = cssOf(S.filter.ops);
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H);
    ctx.restore();
    ctx.filter = "none";
    if (!canvasFilterSupported) applyPixels(ctx, W, H, S.filter.ops);
    if (CFG.watermark !== false) await drawFrame(ctx, W, H);

    const full = await toJpeg(c, CFG.jpegQuality || 0.88);
    const thumb = await makeThumb(c, CFG.thumbEdge || 480);
    S.captured = { full, thumb, width: W, height: H, filter: S.filter.id };
    openReview(full);
  } catch (e) {
    console.error(e);
    toast("Couldn't capture that photo — please try again.", "err");
  } finally {
    S.busy = false;
    $("#btn-shutter").classList.remove("busy");
  }
}

const toJpeg = (canvas, q) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/jpeg", q));
function makeThumb(src, edge) {
  const s = Math.min(1, edge / Math.min(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return toJpeg(c, 0.8);
}

async function drawFrame(ctx, W, H) {
  const names = CFG.coupleNames || "";
  const date = dateShort();
  try { await document.fonts?.load(`600 40px "Cormorant Garamond"`); } catch {}
  const u = Math.min(W, H) / 100;
  const band = u * 22;
  const g = ctx.createLinearGradient(0, H - band, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.5)");
  ctx.fillStyle = g; ctx.fillRect(0, H - band, W, band);
  ctx.textAlign = "center"; ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = u;
  ctx.font = `600 ${u * 6.4}px "Cormorant Garamond", Georgia, serif`;
  ctx.fillText(names, W / 2, H - u * (date ? 7.2 : 4.5));
  if (date) {
    ctx.font = `600 ${u * 2.3}px Manrope, system-ui, sans-serif`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${u * 0.55}px`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(date.toUpperCase(), W / 2, H - u * 3.4);
    ctx.globalAlpha = 1;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }
  ctx.shadowBlur = 0;
}

function countdown(n) {
  const el = $("#countdown");
  return new Promise((res) => {
    const tick = () => {
      if (!S.stream) { el.innerHTML = ""; return res(); }
      if (n === 0) { el.innerHTML = ""; return res(); }
      el.innerHTML = `<span>${n}</span>`;
      navigator.vibrate?.(10);
      n--; setTimeout(tick, 1000);
    };
    tick();
  });
}

/* ───────────── Review & post ───────────── */
let reviewUrl;
function openReview(blob) {
  reviewUrl && URL.revokeObjectURL(reviewUrl);
  reviewUrl = URL.createObjectURL(blob);
  $("#review-img").src = reviewUrl;
  $("#review-caption").value = "";
  $("#review").hidden = false;
}
function closeReview() {
  $("#review").hidden = true;
  S.captured = null;
}
async function post() {
  if (!S.captured) return;
  const { full, thumb, width, height, filter } = S.captured;
  const id = uuid();
  const meta = {
    guest_name: (localStorage.getItem("eg-name") || "").slice(0, 40) || null,
    caption: $("#review-caption").value.trim().slice(0, 140) || null,
    width, height, filter,
  };
  $("#btn-post").disabled = true;
  try {
    await enqueue({ id, full, thumb, meta });
    setLastShot(URL.createObjectURL(thumb));
    const r = $("#btn-post").getBoundingClientRect();
    heartBurst(r.left + r.width / 2, r.top);
    toast(navigator.onLine ? "Added to the album" : "Saved — it will upload when you're back online", "ok");
    closeReview();
  } catch (e) {
    console.error(e);
    toast("Couldn't save that photo. Please try again.", "err");
  } finally {
    $("#btn-post").disabled = false;
  }
}

function setLastShot(src) {
  const el = $("#last-shot");
  let img = el.querySelector("img");
  if (!img) { img = document.createElement("img"); img.alt = ""; el.prepend(img); }
  img.src = src;
  el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
}

/* ───────────── Name ───────────── */
function renderName() {
  const n = localStorage.getItem("eg-name");
  $("#name-label").textContent = n || "Add your name";
}
async function editName(first = false) {
  const v = await ask({
    title: first ? "Who's taking photos?" : "Your name",
    text: "Your name appears with the photos you share. You can skip this.",
    input: true, value: localStorage.getItem("eg-name") || "", placeholder: "e.g. Aunty Malini", maxlength: 40,
    ok: "Save", cancel: first ? "Skip" : "Cancel",
  });
  if (v !== null) { v ? localStorage.setItem("eg-name", v) : localStorage.removeItem("eg-name"); }
  localStorage.setItem("eg-name-asked", "1");
  renderName();
}

/* ───────────── Public API ───────────── */
let wired = false;
function wire() {
  if (wired) return; wired = true;
  const fl = $("#filters");
  fl.innerHTML = "";
  for (const f of FILTERS) {
    const b = document.createElement("button");
    b.textContent = f.label; b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", f === S.filter);
    b.onclick = () => {
      S.filter = f;
      [...fl.children].forEach((x) => x.setAttribute("aria-checked", x === b));
      video().style.filter = cssOf(f.ops);
    };
    fl.append(b);
  }
  $("#btn-shutter").onclick = capture;
  $("#btn-flip").onclick = () => { S.facing = S.facing === "user" ? "environment" : "user"; startStream(); };
  $("#btn-cam-retry").onclick = startStream;
  $("#btn-timer").onclick = () => {
    S.timer = S.timer === 0 ? 3 : S.timer === 3 ? 10 : 0;
    $("#timer-badge").hidden = !S.timer;
    $("#timer-badge").textContent = S.timer + "s";
    $("#btn-timer").setAttribute("aria-label", `Self-timer: ${S.timer ? S.timer + " seconds" : "off"}`);
  };
  $("#btn-retake").onclick = closeReview;
  $("#btn-post").onclick = post;
  $("#review-caption").addEventListener("keydown", (e) => e.key === "Enter" && post());
  $("#btn-name").onclick = () => editName(false);
  $("#vf-frame").hidden = CFG.watermark === false;

  // volume / space key as shutter on desktop & some Android devices
  addEventListener("keydown", (e) => {
    if (!S.active || !$("#review").hidden || $("#dialog").open) return;
    if (e.code === "Space" || e.key === "AudioVolumeUp" || e.key === "AudioVolumeDown") { e.preventDefault(); capture(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (!S.active) return;
    if (document.visibilityState === "hidden") stopStream(); else startStream();
  });
  on((type) => { if (type === "outbox") renderQueue(); });
}

function renderQueue() {
  const b = $("#queue-badge");
  b.hidden = !outbox.count;
  b.textContent = outbox.count;
  b.classList.toggle("spin", outbox.busy && outbox.count > 0);
}

export function enter() {
  wire();
  S.active = true;
  renderName(); renderQueue();
  const latest = state.sorted[0];
  if (latest && !$("#last-shot img")) setLastShot(latest.localThumb || latest.thumbUrl);
  startStream();
  if (!localStorage.getItem("eg-name-asked")) setTimeout(() => S.active && editName(true), 600);
}
export function leave() {
  S.active = false;
  stopStream();
  closeReview();
  $("#countdown").innerHTML = "";
}
