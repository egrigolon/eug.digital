const SVG_NS = "http://www.w3.org/2000/svg";
const COLORS = [
  { color: "#bfc4c0", alpha: 0.3 },
  { color: "#c8cec9", alpha: 0.28 },
  { color: "#95e6cb", alpha: 0.25 },
  { color: "#ffb454", alpha: 0.2 },
];
const CLEARANCE = 9;
const randomBetween = (min, max, random) => min + random() * (max - min);

function distanceConflict(first, second, clearance = CLEARANCE) {
  const firstHorizontal = first.y1 === first.y2;
  const secondHorizontal = second.y1 === second.y2;
  let dx;
  let dy;

  if (firstHorizontal && secondHorizontal) {
    dx = Math.max(Math.min(second.x1, second.x2) - Math.max(first.x1, first.x2),
      Math.min(first.x1, first.x2) - Math.max(second.x1, second.x2), 0);
    dy = Math.abs(first.y1 - second.y1);
  } else if (!firstHorizontal && !secondHorizontal) {
    dx = Math.abs(first.x1 - second.x1);
    dy = Math.max(Math.min(second.y1, second.y2) - Math.max(first.y1, first.y2),
      Math.min(first.y1, first.y2) - Math.max(second.y1, second.y2), 0);
  } else {
    const horizontal = firstHorizontal ? first : second;
    const vertical = firstHorizontal ? second : first;
    dx = Math.max(Math.min(horizontal.x1, horizontal.x2) - vertical.x1,
      vertical.x1 - Math.max(horizontal.x1, horizontal.x2), 0);
    dy = Math.max(Math.min(vertical.y1, vertical.y2) - horizontal.y1,
      horizontal.y1 - Math.max(vertical.y1, vertical.y2), 0);
  }
  return Math.hypot(dx, dy) < clearance;
}

function segmentLength(segment) { return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1); }

function routeToPath(segments) {
  const first = segments[0];
  let path = `M${first.x1.toFixed(1)} ${first.y1.toFixed(1)}`;
  for (const segment of segments) path += `L${segment.x2.toFixed(1)} ${segment.y2.toFixed(1)}`;
  return path;
}

/** Random orthogonal board routes with strict clearance between distinct paths. */
export function generateCircuitRoutes(width, height, random = Math.random) {
  const target = Math.min(132, Math.max(18, Math.round((width * height) / 8200)));
  const routes = [];
  const occupied = [];
  const inset = 5;

  for (let index = 0; index < target; index += 1) {
    let accepted = null;
    for (let attempt = 0; attempt < 75 && !accepted; attempt += 1) {
      const start = { x: randomBetween(inset, width - inset, random), y: randomBetween(inset, height - inset, random) };
      const segmentCount = 2 + Math.floor(random() * 3);
      const longIndex = random() < 0.38 ? Math.floor(random() * segmentCount) : -1;
      const segments = [];
      let point = start;
      let horizontal = random() < 0.5;
      let valid = true;

      for (let part = 0; part < segmentCount; part += 1) {
        const dimension = horizontal ? width : height;
        const long = part === longIndex;
        const shortMin = Math.min(22, dimension * .14);
        const shortMax = Math.max(shortMin, Math.min(116, dimension * .4));
        const length = long
          ? randomBetween(dimension * 0.3, dimension * 0.52, random)
          : randomBetween(shortMin, shortMax, random);
        const direction = random() < 0.5 ? -1 : 1;
        const next = horizontal
          ? { x: point.x + direction * length, y: point.y }
          : { x: point.x, y: point.y + direction * length };
        if (next.x < inset || next.x > width - inset || next.y < inset || next.y > height - inset) {
          valid = false;
          break;
        }
        const segment = { x1: point.x, y1: point.y, x2: next.x, y2: next.y };
        if (occupied.some((other) => distanceConflict(segment, other))) { valid = false; break; }
        if (segments.slice(0, -1).some((other) => distanceConflict(segment, other))) { valid = false; break; }
        segments.push(segment);
        point = next;
        horizontal = !horizontal;
      }
      if (valid) accepted = { d: routeToPath(segments), segments, via: point, long: segments.some((segment) => segmentLength(segment) >= Math.max(width, height) * 0.25) };
    }
    if (accepted) {
      routes.push(accepted);
      occupied.push(...accepted.segments);
    }
  }
  return routes;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function initPulse() {
  const stage = document.querySelector(".stage");
  const svg = stage?.querySelector(".circuit");
  const layer = svg?.querySelector(".trace-layer");
  const wrapper = stage?.querySelector(".word-wrap");
  const word = stage?.querySelector(".word");
  if (!stage || !svg || !layer || !wrapper || !word) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const timers = new Set();
  const animations = new Set();
  let activeCurrents = [];
  let tabHidden = document.hidden;
  let resizeTimer = 0;

  const running = () => !tabHidden && !reduced.matches;
  function schedule(callback, delay) {
    const timer = window.setTimeout(() => { timers.delete(timer); callback(); }, delay);
    timers.add(timer);
  }
  function clearTimers() {
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
  }
  function clearEffects() {
    clearTimers();
    for (const animation of animations) animation.cancel();
    animations.clear();
    for (const current of activeCurrents) current.remove();
    activeCurrents = [];
    wrapper.querySelectorAll(".damage-slice").forEach((slice) => slice.remove());
  }
  function rebuild() {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    const routes = generateCircuitRoutes(bounds.width, bounds.height);
    layer.replaceChildren();
    routes.forEach((route, index) => {
      layer.append(svgElement("path", { class: route.long ? "trace trace-long" : "trace", d: route.d }));
      if (index % 8 === 3) layer.append(svgElement("circle", { class: "trace-via", cx: route.via.x.toFixed(1), cy: route.via.y.toFixed(1), r: 2.2 }));
    });
  }
  function emitCurrent() {
    if (!running()) return;
    const paths = layer.querySelectorAll(".trace");
    if (activeCurrents.length < 7 && paths.length) {
      const source = paths[Math.floor(Math.random() * paths.length)];
      const current = svgElement("path", { class: "current", d: source.getAttribute("d") });
      const palette = COLORS[Math.floor(Math.random() * COLORS.length)];
      current.style.stroke = palette.color;
      current.style.opacity = String(randomBetween(palette.alpha * .65, palette.alpha, Math.random));
      layer.append(current);
      activeCurrents.push(current);
      const length = current.getTotalLength();
      const dash = Math.min(randomBetween(25, 105, Math.random), length * .72);
      current.style.strokeDasharray = `${dash} ${length}`;
      current.style.strokeDashoffset = String(length + dash);
      const animation = current.animate([
        { strokeDashoffset: length + dash, opacity: 0 },
        { strokeDashoffset: length * .45, opacity: palette.alpha },
        { strokeDashoffset: -dash, opacity: 0 },
      ], { duration: randomBetween(750, 2600, Math.random), easing: "linear", fill: "forwards" });
      animations.add(animation);
      animation.onfinish = () => {
        animations.delete(animation);
        activeCurrents = activeCurrents.filter((item) => item !== current);
        current.remove();
      };
    }
    schedule(emitCurrent, randomBetween(220, 1150, Math.random));
  }
  function damageWord() {
    if (!running()) return;
    const count = 3 + Math.floor(Math.random() * 3);
    for (let index = 0; index < count; index += 1) {
      const slice = document.createElement("span");
      const top = randomBetween(4, 82, Math.random);
      const height = randomBetween(7, 17, Math.random);
      const direction = Math.random() < .5 ? -1 : 1;
      slice.className = "damage-slice";
      slice.setAttribute("aria-hidden", "true");
      slice.textContent = "digital";
      slice.style.setProperty("--slice-top", `${top}%`);
      slice.style.setProperty("--slice-bottom", `${Math.min(99, top + height)}%`);
      slice.style.setProperty("--slice-color", ["#a0f5ad", "#91d8cb", "#c6ab9a"][Math.floor(Math.random() * 3)]);
      wrapper.append(slice);
      const animation = slice.animate([
        { transform: "translateX(0) skewX(0deg)" },
        { transform: `translateX(${direction * randomBetween(8, 14, Math.random)}px) skewX(${direction * randomBetween(1.2, 2.8, Math.random)}deg)` },
        { transform: `translateX(${direction * randomBetween(4, 8, Math.random)}px) skewX(${direction * randomBetween(.4, 1.2, Math.random)}deg)` },
      ], { duration: randomBetween(180, 340, Math.random), easing: "steps(3, end)" });
      animations.add(animation);
      animation.onfinish = () => { animations.delete(animation); slice.remove(); };
    }
    schedule(damageWord, randomBetween(1000, 5000, Math.random));
  }
  function start() {
    if (!running()) return;
    emitCurrent();
    schedule(damageWord, randomBetween(1000, 5000, Math.random));
  }

  document.addEventListener("visibilitychange", () => {
    tabHidden = document.hidden;
    clearEffects();
    if (running()) start();
  });
  reduced.addEventListener("change", () => {
    clearEffects();
    if (running()) start();
  });
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      clearEffects();
      rebuild();
      if (running()) start();
    }, 180);
  }, { passive: true });

  rebuild();
  if (running()) start();
}

if (typeof document !== "undefined") initPulse();
