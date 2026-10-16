// Upload photos from the phone's gallery. Each picture is resized, framed and
// re-encoded as JPEG exactly like a camera shot, then goes through the same offline-safe outbox.
import { CFG, uuid, toast } from "./util.js";
import { enqueue } from "./store.js";
import { toJpeg, makeThumb, drawFrame, editName } from "./camera.js";
import { heartBurst } from "./fx.js";

const MAX_FILES = 20;              // per selection, to keep phones responsive
const MAX_BYTES = 40 * 1024 * 1024; // skip anything absurdly large (videos picked by mistake, RAW files)

let input;
function picker() {
  if (input) return input;
  input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.hidden = true;
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = ""; // allow picking the same photo again later
    if (files.length) handle(files);
  });
  document.body.append(input);
  return input;
}

// Decode with EXIF orientation applied (browsers rotate <img> automatically).
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Unsupported image")); };
    img.src = url;
  });
}

async function prepare(file) {
  const img = await loadImage(file);
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error("Empty image");
  const scale = Math.min(1, (CFG.maxImageEdge || 2048) / Math.max(w, h));
  const W = Math.max(1, Math.round(w * scale)), H = Math.max(1, Math.round(h * scale));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, W, H);
  if (CFG.watermark !== false) await drawFrame(ctx, W, H);
  const full = await toJpeg(c, CFG.jpegQuality || 0.88);
  const thumb = await makeThumb(c, CFG.thumbEdge || 480);
  c.width = c.height = 0; // free canvas memory quickly on phones
  return { full, thumb, width: W, height: H };
}

async function handle(files) {
  if (!localStorage.getItem("eg-name-asked")) await editName(true);
  let list = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
  const skipped = files.length - list.length;
  if (list.length > MAX_FILES) {
    toast(`Uploading the first ${MAX_FILES} photos — pick the rest afterwards`, "info", 4000);
    list = list.slice(0, MAX_FILES);
  }
  if (!list.length) return toast("Please choose photos (not videos)", "err");

  const t = toast(`Preparing ${list.length} photo${list.length > 1 ? "s" : ""}…`, "info", 0);
  let ok = 0, failed = skipped;
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    t.set(list.length > 1 ? `Adding photo ${i + 1} of ${list.length}…` : "Adding your photo…");
    try {
      if (file.size > MAX_BYTES) throw new Error("Too large");
      const p = await prepare(file);
      await enqueue({
        id: uuid(), full: p.full, thumb: p.thumb,
        meta: {
          guest_name: (localStorage.getItem("eg-name") || "").slice(0, 40) || null,
          caption: null, width: p.width, height: p.height, filter: "upload",
        },
      });
      ok++;
    } catch (e) {
      console.warn("Could not add", file.name, e);
      failed++;
    }
  }
  t.close();
  if (ok) {
    heartBurst(innerWidth / 2, innerHeight * 0.7);
    const where = navigator.onLine ? "Added to the album" : "Saved — uploading when you're back online";
    toast(`${where}${ok > 1 ? ` (${ok} photos)` : ""}`, "ok", 3500);
  }
  if (failed) toast(`${failed} file${failed > 1 ? "s" : ""} couldn't be added (unsupported format)`, "err", 4500);
  if (ok && !location.hash.startsWith("#/gallery")) location.hash = "#/gallery";
}

/** Opens the phone's photo picker. Must be called from a tap/click handler. */
export function pickPhotos() { picker().click(); }
