// Decorative effects: drifting petals and a heart burst. Skipped when the guest prefers reduced motion.
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const SHAPES = ["petal", "petal", "petal", "heart", "sparkle"];

// Fill a container with petals that drift down forever (pure CSS animation after creation).
export function petals(container, count = 14) {
  if (!container || container.childElementCount || reduced()) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    el.className = `petal ${SHAPES[i % SHAPES.length]}`;
    const size = 8 + Math.random() * 12;
    el.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;` +
      `--dur:${11 + Math.random() * 10}s;--delay:${-Math.random() * 20}s;` +
      `--sway:${(Math.random() * 80 - 40).toFixed(0)}px;--spin:${(Math.random() * 540 - 270).toFixed(0)}deg;` +
      `opacity:${(0.35 + Math.random() * 0.45).toFixed(2)}`;
    container.append(el);
  }
}

// A short burst of hearts rising from a point on screen (e.g. the "Add to album" button).
export function heartBurst(x = innerWidth / 2, y = innerHeight * 0.7, count = 14) {
  if (reduced()) return;
  const layer = document.getElementById("fx-layer");
  if (!layer) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    el.className = "burst-heart";
    const a = (Math.random() - 0.5) * Math.PI * 0.9;      // spread around straight up
    const dist = 90 + Math.random() * 140;
    el.style.cssText = `left:${x}px;top:${y}px;--tx:${(Math.sin(a) * dist).toFixed(0)}px;` +
      `--ty:${(-Math.cos(a) * dist - 40).toFixed(0)}px;--s:${(0.6 + Math.random() * 0.8).toFixed(2)};` +
      `animation-delay:${(Math.random() * 120).toFixed(0)}ms`;
    el.addEventListener("animationend", () => el.remove(), { once: true });
    layer.append(el);
  }
}
