/**
 * TRENDARYO — 3D HERO SCENE
 * ---------------------------------------------------------------------------
 * Loaded as an ES module (needs the importmap in index.html). Builds the
 * hanging-product stage behind the hero copy: a chrome/iridescent TRENDARYO
 * wordmark with seven product models swinging on ropes.
 *
 * Design rules for this build:
 *   · The canvas is TRANSPARENT so the site's own background shows through.
 *   · Everything is sized to the hero CONTAINER, not the viewport, because
 *     the hero is `calc(100svh - 112px)` — not full-bleed.
 *   · Rendering pauses when the hero scrolls out of view or the tab is hidden.
 *   · Bloom + PMREM reflections are skipped on low-power/coarse-pointer
 *     devices; pixel ratio is capped at 1.5.
 *   · Touch devices get `pointer-events: none` on the canvas so page scrolling
 *     is never swallowed by drag-to-swing.
 *   · If three.js or WebGL is unavailable, hero-3d-fallback.js flips the hero
 *     into its CSS fallback (is-fallback) — this file never has to run.
 * ---------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const container = document.getElementById('tr-hero-scene');
const hero = document.getElementById('hero');
if (container && hero) {

/* ── Header offset sync ─────────────────────────────────────────────────────
   The fixed header (announcement bar + logo row + nav row) is reserved with
   hard-coded paddings (--tr-hero-offset / .page-offset padding-top). Those
   magic numbers only match ONE header layout: different viewport widths and
   browser zoom levels wrap the header differently (search bar shown/hidden,
   rows stacked), so at 100% zoom the real header is taller than 156px and
   the wordmark's top edge slides behind it. Measure the REAL header height
   and feed it to both offsets so the hero always starts below the header,
   whatever the viewport or zoom. */
let _hdrObserved = false;
function syncHeaderOffset() {
  const hdr = document.querySelector('.store-header');
  if (!hdr) return false;
  const h = Math.ceil(hdr.getBoundingClientRect().height) || 0;
  if (!h) return false;
  document.documentElement.style.setProperty('--tr-hero-offset', h + 'px');
  const main = document.querySelector('main.page-offset');
  if (main) {
    main.style.setProperty('padding-top', h + 'px', 'important');
  }
  if (!_hdrObserved && 'ResizeObserver' in window) {
    _hdrObserved = true;
    /* The header can reflow later (fonts, menu open, breakpoint changes)
       — keep following it. */
    new ResizeObserver(syncHeaderOffset).observe(hdr);
  }
  return true;
}
/* The header is injected asynchronously by components.js, so poll briefly
   until it renders; the ResizeObserver then takes over. */
if (!syncHeaderOffset()) {
  let tries = 0;
  const poll = setInterval(() => {
    if (syncHeaderOffset() || ++tries > 120) clearInterval(poll);
  }, 50);
}
addEventListener('load', () => syncHeaderOffset());

/* ── Device gating ──────────────────────────────────────────────────────── */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CAN_HOVER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const CORES = navigator.hardwareConcurrency || 4;
const LOW_POWER = CORES <= 4;
const NARROW = window.matchMedia('(max-width: 900px)').matches;
const BIG_SCENE = CAN_HOVER && !LOW_POWER && !NARROW; // bloom + PMREM budget

/* ── Wordmark palette — one rainbow hue per letter (T → O).
   Applied per letter in the vertex-colour bake below: bright saturated
   faces, darker walls of the same hue so the extrusion still reads as
   depth. ── */

const scene = new THREE.Scene();

/* Size the camera/renderer to the HERO CONTAINER, not the window. */
function size() {
  return { w: Math.max(1, container.clientWidth), h: Math.max(1, container.clientHeight) };
}
let { w, h } = size();

const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
camera.position.set(0, 0.6, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(w, h);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
container.appendChild(renderer.domElement);

/* The canvas is draggable everywhere. On touch devices `touch-action: none`
   on the canvas stops a swipe inside the 3D band from scrolling the page, so
   products can be dragged — but because the scene is a bounded band (never
   full-screen), the page still scrolls from any touch outside the canvas. */
container.style.pointerEvents = 'auto';
renderer.domElement.style.touchAction = 'none';

/* ── Studio environment — a hand-built luxury light rig for reflections ────
   Three softboxes (cool key low-left, warm top, magenta fill low-right) on a
   dark floor. This is what makes chrome and lacquer read as expensive: real
   environmental reflections instead of ambient guesswork. One small canvas →
   PMREM, so it costs almost nothing and runs on every device. */
function studioEnv() {
  const build = (pmrem) => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const x = c.getContext('2d');

    /* Dark studio base with a subtle vertical floor bounce */
    const base = x.createLinearGradient(0, 0, 0, 128);
    base.addColorStop(0.00, '#070a16');
    base.addColorStop(0.38, '#151c33');
    base.addColorStop(0.52, '#080b18');
    base.addColorStop(0.78, '#04050c');
    base.addColorStop(1.00, '#01020a');
    x.fillStyle = base;
    x.fillRect(0, 0, 256, 128);

    /* Elliptical softbox helper — gradients defined at unit radius, then the
       context is scaled into an ellipse, so each light reads as a broad
       studio strip rather than a dot. */
    const softbox = (cx, cy, rx, ry, col, a) => {
      const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0.00, col.replace('A', a.toFixed(3)));
      g.addColorStop(0.35, col.replace('A', (a * 0.55).toFixed(3)));
      g.addColorStop(0.70, col.replace('A', (a * 0.16).toFixed(3)));
      g.addColorStop(1.00, col.replace('A', '0'));
      x.save();
      x.translate(cx, cy);
      x.scale(rx, ry);
      x.fillStyle = g;
      x.beginPath();
      x.arc(0, 0, 1, 0, Math.PI * 2);
      x.fill();
      x.restore();
    };

    /* key strip — cool white, upper-left (the main reflection) */
    softbox(70, 26, 62, 26, 'rgba(210,238,255,A)', 1.00);
    /* warm top kicker — the specular streak across chrome */
    softbox(140, 14, 46, 14, 'rgba(255,240,214,A)', 0.85);
    /* magenta fill, low-right */
    softbox(196, 84, 52, 22, 'rgba(255,120,190,A)', 0.60);
    /* cyan bounce, low-left */
    softbox(46, 92, 48, 20, 'rgba(110,240,255,A)', 0.55);
    /* faint horizon band so edges catch a thin light line */
    const horizon = x.createLinearGradient(0, 62, 0, 70);
    horizon.addColorStop(0, 'rgba(255,255,255,0)');
    horizon.addColorStop(0.5, 'rgba(210,230,255,0.30)');
    horizon.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = horizon;
    x.fillRect(0, 62, 256, 8);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const out = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    return out;
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  try {
    scene.environment = build(pmrem);
  } catch (e) {
    /* A failed env probe must never blank the hero — the light rig below
       still carries the scene. */
  }
  pmrem.dispose();
}
studioEnv();

/* ── Soft, even lighting rig ──────────────────────────────────────────────
   Toned down from the old "dark mids, bright edges" cinematic rig: the rim
   spots no longer carve harsh shadows or blow out the letter edges, and the
   higher ambient keeps the mids open so nothing reads as an abnormal shadow. */
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4.5, 7.5, 6);
scene.add(key);

/* Gentle rim lights — define the silhouette without hard, dramatic contrast */
const rimL = new THREE.SpotLight(0x00e5ff, 18, 30, Math.PI / 5, 0.55, 1.25);
rimL.position.set(-7.5, 4.5, -5);
scene.add(rimL, rimL.target);

const rimR = new THREE.SpotLight(0xff3da6, 16, 30, Math.PI / 5, 0.55, 1.25);
rimR.position.set(8, 3.5, -5);
scene.add(rimR, rimR.target);

/* Warm top kicker — a soft fill instead of a single hot specular streak */
const kicker = new THREE.SpotLight(0xffe9c4, 14, 26, Math.PI / 6, 0.6, 1.25);
kicker.position.set(0.5, 9, 3.5);
scene.add(kicker, kicker.target);

/* Cool bounce from below keeps metal from going flat black */
const bounce = new THREE.PointLight(0x2ee6a8, 8, 20);
bounce.position.set(0, -3.5, 3.5);
scene.add(bounce);

/* Higher ambient — lifts the shadows so the scene reads clean, not dramatic */
const ambient = new THREE.AmbientLight(0x2a3550, 0.85);
scene.add(ambient);

/* ── Wordmark ─────────────────────────────────────────────────────────────
   Clean, solid finish: a smooth metallic surface tinted by the baked brand
   gradient (vertex colors). No iridescence, no clearcoat, no sheen and no
   emissive core — the letters read as crisp coloured metal rather than a
   glowing, oil-slick collectible. */
const faceMat = new THREE.MeshPhysicalMaterial({
  vertexColors: true, metalness: 0.9, roughness: 0.3,
  envMapIntensity: 1.1
});
const sideMat = new THREE.MeshPhysicalMaterial({
  /* White base — the per-letter hue (and its darker walls) now comes purely
     from the vertex colours, so nothing desaturates the rainbow. */
  vertexColors: true, color: 0xffffff, metalness: 0.85, roughness: 0.38,
  envMapIntensity: 1.0
});

/* ── Holographic highlight shell — REMOVED ──────────────────────────────────
   The additive fresnel edge-glow / hue-shift / specular-sweep shell that used
   to wrap every letter has been removed. It was the main source of the "too
   cinematic" glow on the wordmark. The letters are now just the clean chrome
   face + tinted side material above. */

const titleGroup = new THREE.Group();
scene.add(titleGroup);
const letters = [];
let titleWidth = 8.5; // sensible default before the font resolves

/* ── Atmosphere textures ───────────────────────────────────────────────────
   Three procedurally-painted canvases that give the scene its depth cues:
   a brand-gradient bloom behind the wordmark, a soft contact shadow under
   every product, and the grain of the floating dust. */

/* Logo backlight bloom — REMOVED ───────────────────────────────────────────
   The brand-gradient glow sprite that bloomed out from behind the wordmark
   has been removed (see buildHalo below). It made the text read as a light
   source rather than solid coloured metal. */

/* Contact shadow — tight dark falloff, the trick that makes a floating object
   read as having weight and volume. */
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 62);
  g.addColorStop(0.00, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.30, 'rgba(0,0,0,0.34)');
  g.addColorStop(0.62, 'rgba(0,0,0,0.12)');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

/* Dust grain — a soft bokeh dot with a bright core, so particles catch the
   light like real motes instead of looking like flat squares. */
const dustTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.60, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(32, 32, 30, 0, Math.PI * 2);
  x.fill();
  return new THREE.CanvasTexture(c);
})();

/* Hover glow sprite */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.35, 'rgba(150,130,255,0.13)');
  g.addColorStop(1, 'rgba(140,120,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

/* ── Curated exhibition layout ─────────────────────────────────────────────
   Small offsets applied ON TOP of the responsive layout so the products form
   a gentle arc with mixed distances from the camera, instead of a flat
   horizontal row. Every rope still ties to the bottom edge of the wordmark —
   the only per-product variety is rope length (vertical stagger) and camera
   depth. centreX / spread / scale are untouched — these only add character
   to what the layout already solved. */
const EXHIBITION = {
  /* middle products ride a little higher — a gentle composition arc. Kept
     small so every eyelet stays on the lower part of the letters and the
     cords read as tied to the wordmark, not floating up above it. */
  arc: 0.10,
  /* per-product distance from camera (+ toward, − away) for depth layering.
     Spread widened so the +65% larger models separate in depth instead of
     overlapping face-on. */
  depth:   [0.7, -0.6, 0.9, -0.85, 0.6, -1.0, 0.35],
  /* per-product rope length (metres) — ~25-30% shorter than the original
     hang, tuned with the copy overlap so the products land just above the
     headline, framing it without crowding. */
  rope:    [2.95, 2.60, 3.40, 2.70, 2.45, 2.80, 2.55],
  /* per-product spin rate and bob pace so no two move alike */
  spin:    [0.0050, 0.0035, 0.0062, 0.0042, 0.0058, 0.0030, 0.0048],
  bob:     [0.0009, 0.0013, 0.0011, 0.0007, 0.0015, 0.0009, 0.0012],
};
const exh = (arr, i) => arr[i % arr.length];
/* Small screens get a gentler boost — the stage is a short band with the
   copy stacked below, so full-size models would crowd it. */
const NARROW_STAGE = window.matchMedia('(max-width: 900px)').matches;
/* Visual size boost for the hanging products — applied to the RENDERED mesh
   only (not the layout footprint), so the equal-gap fitter cannot cancel it
   out. Values below 1 shrink the rendered models below their fitted slot size.
   ~0.75 on desktop (~25% smaller than slot), ~1.0 on small screens. */
const MODEL_BOOST = NARROW_STAGE ? 1.1 : 0.95;

/* ── Hanging products ───────────────────────────────────────────────────── */
const models = [
  'AntiqueCamera.glb', 'BoomBox.glb', 'IridescenceLamp.glb',
  'MaterialsVariantsShoe.glb', 'WaterBottle.glb',
  'GlamVelvetSofa.glb', 'DamagedHelmet.glb'
];
const hangers = [];
const bobs = [];
/* Diagnostic counter — lets tests confirm the models really arrived
   instead of assuming it. Not used by any runtime behaviour. */
window.__heroModelCount = 0;

/* ── Stage layout ─────────────────────────────────────────────────────────
   The composition is laid out in PIXELS for the region the hero copy leaves
   free, then converted to world units. Hardcoded world offsets looked fine
   on a 1440px screen but bunched everything into the middle once the copy
   column was sized for a narrower viewport. */
const CAMERA_DIST = 11;
const FOV = 45;
const stage = { w: w, h: h, scale: 0.5, centerX: 0, topY: 3.0, spread: 6, span: 8.5, slots: null };
/* ── Letter anchor positions ──
   Populated after the font loads and letters are centred (see fontLoader callback).
   letterPositions[i] = world-space X of the i-th letter's centre in "TRENDARYO".
   anchorFor() uses these so model 0 hangs from T (letter 0), model n-1 from O
   (letter 8), and intermediates from interior letters with even spacing. */
const letterLocalX = [];   // local X within titleGroup, set after centering
let letterPositions = null; // world X = centerX + letterLocalX, set in layoutStage()

/** World-space height/width visible at the models' z-plane. */
function visibleExtent() {
  const hh = 2 * CAMERA_DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  return { h: hh, w: hh * (stage.w / stage.h) };
}

/**
 * The copy column now stacks BELOW the 3D scene on ALL viewports (the scene
 * takes the top band, copy flows underneath in document order). It claims no
 * horizontal band next to the scene, so the 3D exhibition always uses the
 * full hero width. Returns { left: 0, right: 0 } to signal "stacked".
 */
function copyColumnPx() {
  return { left: 0, right: 0 };
}

/**
 * Projected on-screen size (px) of an object — MEASURED, not estimated.
 * The camera is frozen at its base pose during measurement.
 */
function measurePx(scale) {
  const keepScale = titleGroup.scale.x;
  const keepPos = titleGroup.position.clone();
  const keepCam = camera.position.clone();

  camera.position.set(0, 0.6, CAMERA_DIST);
  camera.updateMatrixWorld(true);
  titleGroup.scale.setScalar(scale);
  titleGroup.position.set(0, 0, 0);
  titleGroup.updateWorldMatrix(true, true);

  const b = new THREE.Box3().setFromObject(titleGroup);
  let w = 0, h = 0;
  if (isFinite(b.min.x) && isFinite(b.max.x) && b.max.x > b.min.x) {
    const lo = b.min.clone().project(camera);
    const hi = b.max.clone().project(camera);
    w = (Math.max(lo.x, hi.x) - Math.min(lo.x, hi.x)) / 2 * stage.w;
    h = (Math.max(lo.y, hi.y) - Math.min(lo.y, hi.y)) / 2 * stage.h;
  }

  titleGroup.scale.setScalar(keepScale);
  titleGroup.position.copy(keepPos);
  camera.position.copy(keepCam);
  camera.updateMatrixWorld(true);
  return { w: w, h: h };
}

/**
 * Fully responsive layout — every value is a PROPORTION of the container,
 * so it works on any screen with no breakpoint-specific tuning.
 *
 *   · The copy stacks below the scene everywhere — the 3D region uses the
 *     full hero width edge to edge.
 *   · Insets are small percentages of container width.
 *   · Vertical placement is a percentage of container height.
 *   · Wordmark scale fills the region proportionally.
 */
function layoutStage() {
  stage.w = w; stage.h = h;
  const vis = visibleExtent();

  /* The copy stacks below the scene everywhere, so the 3D region always
     spans the FULL hero width (edge to edge), just below the header. */
  const insetPx = Math.max(4, Math.min(20, stage.w * 0.015));
  const regionLeftPx = 0;
  const regionRightPx = stage.w;
  const regionWpx = regionRightPx - regionLeftPx;
  const regionCenterPx = stage.w / 2;

  const natural = measurePx(1);
  if (natural.w < 2) { stage.ready = false; return; }

  /* Wordmark size: 0.62 of the region width (~13% smaller than the old
     0.71) — the wordmark supports the hero rather than dominating it, and
     the shorter ropes bring the products up to frame it. */
  const FILL = 0.62;
  const scale = Math.max(0.1, (regionWpx * FILL) / natural.w);
  const wordPx = natural.w * scale;

  /* Centre in the full-width region. */
  let leftPx = regionCenterPx - wordPx / 2;

  const pxToWorld = (px) => (px / stage.w - 0.5) * vis.w;
  const worldPerPx = vis.w / stage.w;
  const centerX = pxToWorld(leftPx + wordPx / 2);

  /* Rope anchors inset to 80% of wordmark width so they sit under letters. */
  const spreadPx = wordPx * 0.80;
  const spread = spreadPx * worldPerPx;

  /* Vertical: wordmark centre sits at 30% down the visible scene — higher
     than the old 36%, so the whole composition rides up toward the header
     and leaves more room for the products + copy below. The header is
     measured by syncHeaderOffset, so the scene band always starts below the
     real header and the letters keep a clear gap at every canvas height. */
  const topWorld = 1.1 + (0.5 - 0.30) * vis.h;

  /* Measure real letter bottom after positioning. */
  titleGroup.scale.setScalar(scale);
  titleGroup.position.set(centerX, topWorld, 0);
  titleGroup.updateWorldMatrix(true, true);
  const titleBox = new THREE.Box3().setFromObject(titleGroup);
  const letterBottomWorld = isFinite(titleBox.min.y) ? titleBox.min.y : topWorld - 0.5;
  const anchorY = letterBottomWorld + 0.02;

  /* Keep products above the frustum floor. The deepest possible hang is the
     longest curated rope (moved here from the hardcoded 3.8 so the guard
     always matches EXHIBITION), plus headroom for the product body itself. */
  const floor = 1.1 - 0.5 * vis.h + 0.3;
  const maxDrop = Math.max.apply(null, EXHIBITION.rope) + 0.35;
  const lift = (anchorY - maxDrop) < floor ? floor - (anchorY - maxDrop) : 0;

  stage.ready = true;
  stage.scale = scale;
  stage.centerX = centerX;
  /* World-space X of each letter's centre, for letter-accurate anchoring.
     model 0 → letter 0 (T), model n-1 → letter 8 (O), intermediates evenly spaced. */
  if (letterLocalX.length > 0) {
    /* letterLocalX is in titleGroup LOCAL units (intrinsic text size) —
       world X = group position + local X * group scale. Without the scale
       the anchors only span the middle half of the word and the models
       cluster at the centre. */
    letterPositions = letterLocalX.map(lx => centerX + lx * scale);
  }
  stage.topY = topWorld + lift;
  stage.anchorY = anchorY + lift;
  stage.spread = spread;
  stage.span = natural.w;

  /* Baseline framing bound from the visible region. fitModels() tightens this
     to the real model widths once they arrive, but setting it here means a
     product can never swing out of frame even if a GLB fails to load and
     fitModels() never runs. */
  {
    const visW = visibleExtent().w;
    const padW = insetPx * 0.5 * (visW / stage.w);
    stage.bounds = {
      min: ((insetPx / stage.w) - 0.5) * visW + padW,
      max: (((stage.w - insetPx) / stage.w) - 0.5) * visW - padW,
    };
  }

  titleGroup.scale.setScalar(scale);
  titleGroup.position.set(centerX, stage.topY, 0);
  reanchor();
  layoutAtmosphere();
}

/**
 * Screen-space anchor slots with EQUAL visual gaps between neighbouring
 * products — the fix for the old uneven spacing.
 *
 * Evenly spaced ANCHORS are not evenly spaced products on screen: the models
 * have very different footprints (a sofa vs a water bottle) and sit at
 * slightly different depths (EXHIBITION.depth), and perspective magnifies the
 * nearer ones. So this lays the models out in SCREEN pixels instead — equal
 * edge-to-edge gaps across the wordmark — then converts each centre back to a
 * world X at that product's own depth (undoing the magnification), so the
 * gaps stay equal on screen whatever each model's size or depth.
 *
 * The run spans min(free region, 92% of the wordmark) so every eyelet still
 * sits under the letters, and is centred on the wordmark's screen centre.
 * Returns null before the wordmark/models exist — callers fall back to the
 * uniform spread.
 */
function computeSlots(n) {
  if (n < 1) return null;
  const worldPerPx = visibleExtent().w / stage.w;
  if (!isFinite(worldPerPx) || worldPerPx <= 0) return null;
  const insetPx = Math.max(4, Math.min(20, stage.w * 0.015));
  const padPx = insetPx * 0.5;                    /* must match stage.bounds */
  const leftLimit = insetPx + padPx;
  const rightLimit = stage.w - insetPx - padPx;
  const regionPx = Math.max(80, rightLimit - leftLimit);
  const d = CAMERA_DIST;

  /* Eyelets must stay under the letters: cap the run at 92% of the wordmark. */
  const wordPx = stage.span * stage.scale;
  const extent = Math.min(regionPx, wordPx > 4 ? wordPx * 0.98 : regionPx);

  /* Rotation-INVARIANT footprints: the models spin on their ropes, so an
     instantaneous Box3 would design the gaps for this frame's angle and then
     drift (or overlap) as each model turns. h.w is the load-time x/z
     diagonal — the widest the model can ever present — so gaps designed
     against it stay equal AND never collide at any angle. The analytic
     projection then adds the term the old estimate missed: a model's far
     edge sits deeper than its near edge, so its projected width grows with
     its distance from the screen centre. */
  const W = [], zc = [];
  for (let i = 0; i < n; i++) {
    W.push(Math.max(1e-3, (hangers[i].w || 60) * worldPerPx));
    zc.push(isFinite(hangers[i].anchor.z) ? hangers[i].anchor.z : exh(EXHIBITION.depth, i));
  }

  /* Screen width of model i hung with its centre at screen x `cPx`. */
  const f = (z) => d / Math.max(0.5, d - z);
  const screenW = (i, cPx) => {
    /* screen px (absolute) -> world x offset from the optical axis */
    const x = ((cPx - stage.w / 2) * worldPerPx) / f(zc[i]);
    const half = W[i] / 2;
    return ((x + half) * f(zc[i] + half) -
            ((x - half) * f(zc[i] - half))) / worldPerPx;
  };

  const centrePx = stage.w / 2 + (stage.centerX || 0) / worldPerPx;

  /* Widths depend on placement and placement depends on widths (the term
     above grows with |c|), so solve them together. Three passes converge —
     the dependency is weak: a 50px move shifts a width by only a few px. */
  const c = [];
  for (let i = 0; i < n; i++) c.push(centrePx + (i - (n - 1) / 2) * (extent / n));
  for (let pass = 0; pass < 3; pass++) {
    const w = [];
    let total = 0;
    for (let i = 0; i < n; i++) { w.push(screenW(i, c[i])); total += w[i]; }
    /* One gap per neighbouring pair; models + gaps exactly fill the extent,
       so every on-screen gap is identical. 6px floor — never touch. */
    let gap = n > 1 ? (extent - total) / (n - 1) : 0;
    if (gap < 6) gap = 6;
    const runW = total + gap * (n - 1);
    let cursor = centrePx - runW / 2;
    for (let i = 0; i < n; i++) { c[i] = cursor + w[i] / 2; cursor += w[i] + gap; }
  }

  /* Screen centres -> world anchors at each model's own depth. */
  /* diagnostic snapshot for __heroDebug */
  {
    const wLast = c.map((cc, i) => Math.round(screenW(i, cc)));
    let tLast = 0; wLast.forEach(v => tLast += v);
    stage._slotDiag = { extent: Math.round(extent), centrePx: Math.round(centrePx), runW: Math.round(c[n - 1] - c[0]), totalW: Math.round(tLast), pred: wLast, regionPx: Math.round(regionPx), gap: Math.round((extent - tLast) / Math.max(1, n - 1)) };
  }
  return c.map((cc, i) => ((cc - stage.w / 2) * worldPerPx) * ((d - zc[i]) / d));
}

/**
 * Anchor position for the i-th of n models, from the current layout, plus the
 * curated exhibition offsets (arc height, staggered drop, camera distance).
 * X comes from the equal-gap slots when they exist (all normal operation);
 * the uniform spread is only the pre-model fallback used while the wordmark
 * and models are still loading.
 */
function anchorFor(i, n) {
  const t = (n === 1) ? 0.5 : i / (n - 1);
  let x;
  if (letterPositions && letterPositions.length >= 2) {
    /* Evenly space models from the first letter (T) to the last letter (O).
       Equal gaps between every model regardless of individual letter widths.
       Model 0 anchors at T, model n-1 anchors at O. */
    x = letterPositions[0] + (letterPositions[letterPositions.length - 1] - letterPositions[0]) * t;
  } else {
    /* Fallback: equal-gap slots while fonts/models are still loading. */
    const slots = stage.slots;
    x = (slots && slots.length === n)
      ? slots[i]
      : ((n === 1)
        ? stage.centerX
        : stage.centerX - stage.spread / 2 + stage.spread * (i / (n - 1)));
  }
  /* Gentle arc — REMOVED: middle anchors were lifted above the baseline
     (arc 0.10 > embed 0.06) creating visible gaps between ropes and letters.
     All anchors now sit at the same baseline so every cord reads as tied
     to the wordmark. Depth variety stays on the product side only. */
  const arc = 0;
  /* stage.anchorY is the bottom edge of the letters. Lift the anchor a hair
     INTO the letter base so the eyelet reads as bolted to the wordmark and
     the cord visibly emerges from the type rather than from thin air. */
  const embed = 0.10;
  const y = stage.anchorY + embed;
  /* Anchors sit at Z=0 — exactly at the letter surface — so eyelets lock
     onto the brand. Depth layering is applied to products, not anchors. */
  const z = 0;
  return new THREE.Vector3(x, y, z);
}

/** Move every rope's anchor to the current layout. Only the anchor moves —
    the rope constraint then swings each product to its new rest position,
    so resizing animates instead of teleporting. Drift bookkeeping resets
    here too, so the brand's float picks up cleanly from the new layout.
    Recomputes the equal-gap slots first, because the model widths and the
    free region both change on every layout pass. */
function reanchor() {
  const n = hangers.length;
  if (!n) return;
  stage.slots = computeSlots(n);
  for (let i = 0; i < n; i++) {
    hangers[i].anchor.copy(anchorFor(i, n));
    hangers[i]._driftY = stage._driftY || 0;
    hangers[i]._driftX = stage._driftX || 0;
  }
}

/**
 * Fit the products to the REAL geometry. Seven 3D meshes cannot occupy a
 * narrow hero at full size — they would have to overlap and the collision
 * solver would push the outer ones off the edge (which is exactly what used
 * to scramble the spacing). So:
 *   1. scale every model down so models + EQUAL gaps fill the run under the
 *      wordmark (extent = min(free region, 92% of the wordmark) — the same
 *      extent computeSlots() lays the anchor slots out on)
 *   2. re-anchor from those slots, then clamp the swing bounds to the region
 */
function fitModels() {
  const n = hangers.length;
  if (n < 2) return;
  /* The copy stacks below the scene everywhere, so the product run uses the
     full hero width — same inset as layoutStage() and computeSlots(). */
  const insetPx = Math.max(4, Math.min(20, stage.w * 0.015));
  const padPx = insetPx * 0.5;                 /* must match stage.bounds */
  const leftLimit = insetPx;
  const rightLimit = stage.w - insetPx;
  /* Free region minus the bounds pads — identical to computeSlots' region. */
  const regionPx = Math.max(80, (rightLimit - leftLimit) - insetPx);
  const wordPx = stage.span * stage.scale;
  const extentPx = Math.min(regionPx, wordPx > 4 ? wordPx * 1.0 : regionPx);

  /* 1 — uniform scale so all models + equal gaps fit the run. Initial guess:
     each pair gets 7% of the run as its gap in load-time-diagonal terms. */
  let total = 0;
  for (const h of hangers) total += h.wBase || 0;
  const gapPx = extentPx * 0.03 * (n - 1);
  stage.modelScale = Math.max(0.18, total > 0 ? (extentPx - gapPx) / total : 1);

  const applyScale = () => {
    for (const h of hangers) {
      h.obj.scale.setScalar(h.baseScale * stage.modelScale * MODEL_BOOST);
      h.w = h.wBase * stage.modelScale;
      h.radius = h.radiusBase * stage.modelScale;
    }
  };
  applyScale();

  /* 2 — equal-gap anchor slots, then RE-SCALE to the projected run. The slot
     layout works in projected widths (~1.4× the diagonals, because outer
     models sit far off the optical axis — and which model lands where
     depends on load order). reanchor() records that projected total in
     stage._slotDiag, so iterate until the run leaves its full gap share:
     this keeps the gap comfortably above its floor on EVERY load order —
     when the floor engaged, the layout could run past the region and the
     outer gaps collapsed (the old uneven spacing). */
  const gapTargetPx = Math.max(6, extentPx * 0.012);
  const wantPx = extentPx - gapTargetPx * (n - 1);
  for (let it = 0; it < 6; it++) {
    reanchor();
    const diag = stage._slotDiag;
    if (!diag || !diag.totalW) break;
    const err = (diag.totalW - wantPx) / wantPx;
    if (Math.abs(err) <= 0.03) break;
    const next = Math.min(2.2, Math.max(0.15, stage.modelScale * (wantPx / diag.totalW)));
    if (Math.abs(next - stage.modelScale) < 1e-4) break;
    stage.modelScale = next;
    applyScale();
  }
  reanchor();

  const worldPerPx = visibleExtent().w / stage.w;
  const padWorld = padPx * worldPerPx;
  stage.worldPerPx = worldPerPx;
  stage.spread = extentPx * worldPerPx;
  let maxHalf = 0;
  for (const h of hangers) maxHalf = Math.max(maxHalf, h.w / 2);
  const inset = maxHalf * worldPerPx;
  const vis = visibleExtent();
  stage.bounds = {
    min: Math.max((((leftLimit) / stage.w - 0.5) * vis.w) + padWorld, (-vis.w / 2) + inset),
    max: Math.min((((rightLimit) / stage.w - 0.5) * vis.w) - padWorld, (vis.w / 2) - inset),
  };
}

/* ── Depth layers ───────────────────────────────────────────────────────────
   Three distinct planes so the scene reads as space, not a flat card:
     L1 · dust — foreground motes drifting closest to the camera
     L2 · products — mid-plane, the exhibition
     L3 · wordmark + its bloom — the anchor plane behind
   The dust is one seeded particle field so it is identical every load. */
let haloGroup = null;
let dustMesh = null;
let dustTime = { value: 0 };

/* Deterministic PRNG — a fixed seed means the showroom looks the same on every
   visit instead of re-rolling the composition each page load. */
function seedRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Build the dust field. Count scales with the device tier — fewer, larger,
   more intentional particles as requested, never a snowstorm. */
function buildDust() {
  const COUNT = BIG_SCENE ? 130 : 80;
  const rnd = seedRandom(0x7EA9D);
  const pos = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  const size = new Float32Array(COUNT);
  const tint = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    /* Bias toward the middle band so the field supports the composition
       instead of scattering uniformly and competing with it. */
    const spreadX = (rnd() - 0.5) * 2;
    const bias = 1 - Math.pow(Math.abs(spreadX), 2.2);   // 0..1, peaks centre
    pos[i * 3 + 0] = spreadX * 7.5;
    pos[i * 3 + 1] = (rnd() - 0.5) * 8.5;
    /* Near motes cluster closer, far ones recede — that spread is the depth. */
    pos[i * 3 + 2] = -2.4 + rnd() * 7.5 + bias * 0.6;

    /* Foreground particles are rarer and much larger — bokeh, not dust. */
    const near = pos[i * 3 + 2] > 3.2;
    size[i] = near ? 26 + rnd() * 34 : 5 + rnd() * 12;
    phase[i] = rnd() * Math.PI * 2;
    tint[i] = rnd();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: dustTime,
      uPix: { value: renderer.getPixelRatio() * 0.5 },
      uC1: { value: new THREE.Color(0x9beeff) },
      uC2: { value: new THREE.Color(0xffb8e6) },
      uC3: { value: new THREE.Color(0x8affd8) }
    },
    vertexShader: `
      attribute float aPhase; attribute float aSize; attribute float aTint;
      uniform float uTime; uniform float uPix;
      varying float vA; varying float vT; varying float vNear;
      void main(){
        vec3 p = position;
        /* slow independent drift — no particle shares a rhythm */
        p.y += sin(uTime * 0.28 + aPhase) * 0.22;
        p.x += cos(uTime * 0.19 + aPhase * 1.37) * 0.16;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = max(0.1, -mv.z);
        gl_PointSize = min(88.0, aSize * uPix * (9.0 / dist));
        gl_Position = projectionMatrix * mv;
        /* Fade the closest bokeh out again so it never muddies the hero copy.
           1.0 at z<=4.2, 0.0 beyond z 6.5 — edges kept ascending for spec. */
        vNear = 1.0 - smoothstep(4.2, 6.5, dist);
        vA = (0.30 + 0.30 * sin(uTime * 0.45 + aPhase)) * vNear;
        vT = aTint;
      }`,
    fragmentShader: `
      uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
      varying float vA; varying float vT; varying float vNear;
      void main(){
        /* soft radial falloff — a lit mote, never a hard pixel */
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float falloff = pow(1.0 - d * 2.0, 2.2);
        vec3 c = mix(uC1, mix(uC2, uC3, step(0.66, vT)), step(0.33, vT));
        gl_FragColor = vec4(c * falloff, falloff * vA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });

  dustMesh = new THREE.Points(geo, mat);
  dustMesh.frustumCulled = false;
  scene.add(dustMesh);
}
buildDust();

/* Volumetric bloom behind the wordmark — REMOVED.
   The glow sprite has been disabled (see the haloTex note above). haloGroup
   stays null and every `if (haloGroup)` guard simply skips, so the wordmark
   renders as clean coloured metal with no bloom behind it. */
function buildHalo() {
  /* intentionally empty — halo disabled */
}
buildHalo();

/**
 * Position the atmosphere layers around the current layout. Called from
 * layoutStage with NO input of its own — it only reads the layout that was
 * already computed, so the responsive architecture is untouched.
 */
function layoutAtmosphere() {
  if (haloGroup) {
    /* Bloom sits behind the letters, scaled to the wordmark's own footprint. */
    const wordPx = stage.span * stage.scale;
    const w = Math.max(2, wordPx * 1.05 / stage.w * visibleExtent().w);
    haloGroup.scale.set(w, w * 0.30, 1);
    haloGroup.position.set(stage.centerX, stage.topY + 0.15, -1.9);
  }
  if (dustMesh) {
    /* Dust field widens with the composition so it always frames the scene. */
    const sp = stage.spread || 6;
    dustMesh.position.set(stage.centerX, stage.topY * 0.55, 0);
    dustMesh.scale.set(Math.max(0.6, sp / 6), Math.max(0.7, sp / 6), 1);
  }
}

/* ── Hanging rig materials ──────────────────────────────────────────────────
   A braided cord with a slight metallic sheen, and a polished steel eyelet
   that bolts the cord to the underside of the wordmark. Without the fitting
   the rope just intersects the letters and reads as CG. */
const ropeMat = new THREE.MeshPhysicalMaterial({
  color: 0xe6dcc4, roughness: 0.42, metalness: 0.45,
  envMapIntensity: 1.4, clearcoat: 0.3, clearcoatRoughness: 0.4
});
const eyeletMat = new THREE.MeshPhysicalMaterial({
  color: 0xd8dae4, roughness: 0.18, metalness: 1, envMapIntensity: 2.2,
  clearcoat: 1, clearcoatRoughness: 0.08
});

function buildHangers(span) {
  const loader = new GLTFLoader();
  const n = models.length;
  models.forEach((file, i) => {
    loader.load('assets/models/' + file, gltf => {
      const obj = gltf.scene;
      const box = new THREE.Box3().setFromObject(obj);
      const maxDim = Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z);
      obj.scale.setScalar(1.1 / maxDim);
      const box2 = new THREE.Box3().setFromObject(obj);
      obj.position.sub(box2.getCenter(new THREE.Vector3()));

      /* ── Showroom finish for the product itself ──────────────────────────
         Lift the environment reflection and shave a little roughness so every
         model reads as a studio-lit collectible. Kept gentle — a fabric sofa
         must not turn into plastic. */
      obj.traverse(m => {
        if (!m.isMesh) return;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) {
          if (!mm) continue;
          if (mm.envMapIntensity !== undefined) mm.envMapIntensity = Math.max(mm.envMapIntensity, 1.5);
          if (mm.roughness !== undefined) mm.roughness = Math.max(0.05, Math.min(0.92, mm.roughness * 0.9));
          if (mm.metalness !== undefined) mm.metalness = Math.min(1, mm.metalness * 1.05);
          mm.needsUpdate = true;
        }
      });

      const root = new THREE.Group();
      root.add(obj);
      obj.rotation.y = Math.random() * Math.PI * 2;
      scene.add(root);

      /* Anchor comes from the current layout; reanchor() re-seats it on resize. */
      const anchor = anchorFor(i, n);
      const ropeLen = exh(EXHIBITION.rope, i);
      const rest = anchor.clone().add(new THREE.Vector3(0, -ropeLen, 0));
      /* Depth layering applies to products only — anchors stay at Z=0 so
         eyelets lock exactly onto the letter surface. */
      rest.z += exh(EXHIBITION.depth, i);
      root.position.copy(rest);

      /* ── Cord — slight taper with per-product thickness variation, so the
            rig reads as real cordage under tension rather than one cloned rod.
            Tapered upward (thicker at the anchor) because that is where a
            loaded cord is thickest. */
      const cord = 0.019 + (i % 3) * 0.0055;
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(cord * 1.5, cord, 1, 6, 1, true),
        ropeMat
      );
      scene.add(rope);

      /* ── Eyelet — the physical attachment point on the brand itself ────── */
      const eyelet = new THREE.Mesh(new THREE.TorusGeometry(cord * 3.1, cord * 0.95, 6, 14), eyeletMat);
      eyelet.rotation.x = Math.PI / 2;
      scene.add(eyelet);

      /* Collision radius = visual half-width only (not the 3D diagonal,
         which was ~2× too large and caused constant overlap fighting). */
      const sz = box2.getSize(new THREE.Vector3());
      const radius = Math.max(sz.x, sz.z) / 2 * 0.65;

      /* ── Contact shadow — a soft blob that grounds each floating object and
            gives it weight. Follows the product, never the world. sz is the
            NORMALISED footprint (max edge = 1.1), so this stays correct for
            every model regardless of its original scale. */
      const contact = new THREE.Sprite(new THREE.SpriteMaterial({
        map: shadowTex, transparent: true, opacity: 0.5,
        depthWrite: false, color: 0x000000
      }));
      const foot = Math.max(sz.x, sz.z);
      contact.scale.set(foot * 2.0 * MODEL_BOOST, foot * 2.0 * MODEL_BOOST, 1);
      contact.position.set(0, -sz.y * 0.5 * MODEL_BOOST - foot * 0.28, -0.3);
      root.add(contact);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      glow.scale.setScalar(2.1 * MODEL_BOOST);
      root.add(glow);

      const bob = {
        root, rope, eyelet, contact, anchor, ropeLen, radius, radiusBase: radius, glow, obj,
        pos: rest.clone(), prev: rest.clone(), vel: new THREE.Vector3(),
        held: false, hovered: false, w: 0,
        spin: exh(EXHIBITION.spin, i),
        bobSpeed: exh(EXHIBITION.bob, i),
        bobPhase: (i * 1.7) % (Math.PI * 2),
        contactBase: null,
        /* Brand drift applied to this anchor; starts at zero so the first
           frame's delta is a no-op rather than NaN. */
        _driftY: 0, _driftX: 0
      };
      root.traverse(o => { o.userData.hanger = bob; });
      hangers.push(bob);
      bobs.push(root);
      window.__heroModelCount = hangers.length;

      /* Rotation-safe footprint: models spin, so their x-extent varies up to
         the x/z diagonal. Using the diagonal keeps the fit stable. */
      bob.baseScale = 1.1 / maxDim;
      bob.wBase = (Math.hypot(sz.x, sz.z) * 1.06) / visibleExtent().w * stage.w;
      bob.w = bob.wBase;
      if (hangers.length === models.length) fitModels();
    }, undefined, () => { /* one missing model must not break the stage */ });
  });
}

const fontLoader = new FontLoader();
fontLoader.load(
  'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
  font => {
    const word = 'TRENDARYO';
    const tracking = 0.18;
    let x = 0;
    const meshes = [];
    for (let i = 0; i < word.length; i++) {
      /* Deeper extrusion + a wider bevel gives every letter real mass and a
         broad polished facet that catches the rim lights — the difference
         between flat 3D text and an object you could hold. */
      const g = new TextGeometry(word[i], {
        font, size: 1.05, height: 0.55, depth: 0.55,
        curveSegments: 14, bevelEnabled: true,
        bevelThickness: 0.07, bevelSize: 0.062, bevelOffset: 0, bevelSegments: 6
      });
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const gw = bb.max.x - bb.min.x;
      const midX = (bb.min.x + bb.max.x) / 2;
      const midY = (bb.min.y + bb.max.y) / 2;
      /* Extrusion depth captured here, while the geometry is still in scope —
         the shell scale below needs it and forEach cannot see this `g`. */
      const extrude = Math.max(bb.max.z - bb.min.z, 0.001);
      g.translate(-midX, -midY, 0);
      const mesh = new THREE.Mesh(g, [faceMat, sideMat]);
      mesh.position.set(x + gw / 2, midY, 0);
      mesh.userData.extrude = extrude;
      titleGroup.add(mesh);
      meshes.push(mesh);
      x += gw + tracking;
    }
    const totalW = x - tracking;
    const halfW = totalW / 2;
    titleWidth = totalW;
    stage.span = totalW;

    /* Centre the wordmark on the group's own origin. Without this the glyphs
       run 0 → totalW, so every layout calculation that assumes a centred box
       lands off by half the wordmark. Must run BEFORE the gradient bake so
       the gradient's t still spans 0 → 1 across the wordmark. */
    meshes.forEach(m => { m.position.x -= halfW; });

    /* Record each letter's local X so anchorFor() can hang models from
       specific letters (T → O) instead of equal-gap slots. */
    letterLocalX.length = 0;
    meshes.forEach(m => letterLocalX.push(m.position.x));

    /* One rainbow hue per letter, baked into every vertex. Front-facing
       geometry (z in the front half of the extrusion) gets the bright face
       colour; walls get the same hue darkened, keeping 3D depth readable. */
    const tmp = new THREE.Color();
    const sideC = new THREE.Color();
    meshes.forEach((m, mi) => {
      const pos = m.geometry.attributes.position;
      const col = new Float32Array(pos.count * 3);
      const gr = new Float32Array(pos.count);
      const hue = mi / meshes.length;          /* red → orange → … → magenta */
      tmp.setHSL(hue, 0.92, 0.60);
      sideC.setHSL(hue, 0.85, 0.36);
      for (let i = 0; i < pos.count; i++) {
        const c = pos.getZ(i) >= m.userData.extrude / 2 ? tmp : sideC;
        gr[i] = (m.position.x + pos.getX(i)) / totalW + 0.5;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      m.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      m.geometry.setAttribute('aGrad', new THREE.BufferAttribute(gr, 1));
      letters.push({ mesh: m, baseY: m.position.y, phase: Math.random() * Math.PI * 2 });
    });

    layoutStage();
    buildHangers();
  },
  undefined,
  () => { /* font failed — letters simply never appear, models still hang */ }
);

/* ── Interaction (desktop only) ─────────────────────────────────────────── */
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let drag = null, hovered = null;
const dragPlane = new THREE.Plane(), dragOffset = new THREE.Vector3();

function setPtr(e) {
  /* Convert client coords to CANVAS-relative NDC. The canvas is a bounded
     band inside the hero, so window coords are wrong — this must use the
     canvas box, otherwise hit-testing is offset and nothing is pickable. */
  const r = renderer.domElement.getBoundingClientRect();
  ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}
/* Pointer handling runs on hover AND touch devices. Because the canvas is
   never full-screen, a touch on the copy below still scrolls the page. */
{
  const el = renderer.domElement;
  el.style.cursor = 'default';
  el.addEventListener('pointerdown', e => {
    setPtr(e); ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(bobs, true);
    if (hits.length) {
      const bob = hits[0].object.userData.hanger;
      if (bob) {
        drag = bob; bob.held = true;
        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), bob.pos);
        const p = new THREE.Vector3();
        ray.ray.intersectPlane(dragPlane, p);
        dragOffset.copy(bob.pos).sub(p);
        el.style.cursor = 'grabbing';
      }
    }
  });
  el.addEventListener('pointermove', e => {
    setPtr(e);
    if (drag) {
      ray.setFromCamera(ptr, camera);
      const p = new THREE.Vector3();
      if (ray.ray.intersectPlane(dragPlane, p)) {
        drag.prev.copy(drag.pos);
        drag.pos.copy(p).add(dragOffset);
      }
    } else {
      ray.setFromCamera(ptr, camera);
      const hits = ray.intersectObjects(bobs, true);
      const bob = hits.length ? hits[0].object.userData.hanger : null;
      if (hovered && hovered !== bob) hovered.hovered = false;
      hovered = bob;
      if (hovered) hovered.hovered = true;
      el.style.cursor = hits.length ? 'grab' : 'default';
    }
  });
  addEventListener('pointerup', () => {
    if (drag) {
      drag.held = false;
      drag.vel.subVectors(drag.pos, drag.prev).multiplyScalar(0.6);
      drag = null;
      renderer.domElement.style.cursor = 'default';
    }
  });
}

/* ── Physics: verlet + rope/collision constraints ───────────────────────── */
const gravity = new THREE.Vector3(0, -0.012, 0);
const damping = 0.94;
const _dir = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion();
const _t = new THREE.Vector3(1, 1, 1);

function constrain(h) {
  if (!isFinite(h.pos.x) || !isFinite(h.pos.y) || !isFinite(h.pos.z)) {
    h.pos.copy(h.anchor).add(new THREE.Vector3(0, -h.ropeLen, 0));
    h.prev.copy(h.pos);
    return;
  }
  _dir.subVectors(h.pos, h.anchor);
  const len = _dir.length();
  if (len > h.ropeLen && len > 1e-4) {
    h.pos.copy(h.anchor).addScaledVector(_dir.divideScalar(len), h.ropeLen);
  }
}

function step() {
  /* 1 — Verlet integration */
  hangers.forEach(h => {
    if (!h.held) {
      /* Pure verlet — pos-prev already encodes velocity. No extra h.vel add. */
      _dir.subVectors(h.pos, h.prev).multiplyScalar(damping);
      h.prev.copy(h.pos);
      h.pos.add(_dir).add(gravity);
      /* Decay the drag-release impulse into verlet memory smoothly. */
      if (h.vel.lengthSq() > 1e-6) {
        h.pos.add(h.vel);
        h.vel.multiplyScalar(0.75);
      } else {
        h.vel.set(0, 0, 0);
      }
    }
  });

  /* 2 — Rope constraints only (no collision inside this loop) */
  for (let k = 0; k < 4; k++) {
    hangers.forEach(constrain);
  }

  /* 3 — Horizontal tether — clamp x so nothing leaves the hero edge */
  const b = stage.bounds;
  if (b) hangers.forEach(h => {
    if (h.held) return;
    const half = (h.w || 60) / 2 * stage.worldPerPx;
    h.pos.x = Math.max(b.min + half, Math.min(b.max - half, h.pos.x));
  });

  /* 4 — Collision resolution — runs ONCE after rope constraints settle */
  for (let i = 0; i < hangers.length; i++) {
    for (let j = i + 1; j < hangers.length; j++) {
      const a = hangers[i], b = hangers[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz, min = a.radius + b.radius;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d, overlap = min - d;
        const wa = a.held ? 0 : 1, wb = b.held ? 0 : 1, ws = (wa + wb) || 1;
        const pushX = nx * overlap, pushY = ny * overlap, pushZ = nz * overlap;
        if (!a.held) {
          a.pos.x -= pushX * (wa / ws); a.pos.y -= pushY * (wa / ws); a.pos.z -= pushZ * (wa / ws);
          a.prev.x -= pushX * (wa / ws); a.prev.y -= pushY * (wa / ws); a.prev.z -= pushZ * (wa / ws);
        }
        if (!b.held) {
          b.pos.x += pushX * (wb / ws); b.pos.y += pushY * (wb / ws); b.pos.z += pushZ * (wb / ws);
          b.prev.x += pushX * (wb / ws); b.prev.y += pushY * (wb / ws); b.prev.z += pushZ * (wb / ws);
        }
      }
    }
  }

  /* 5 — Final rope clamp so collision push can't stretch past max */
  hangers.forEach(constrain);
}

function updateRope(h) {
  _dir.subVectors(h.pos, h.anchor);
  const len = _dir.length();

  /* Rope geometry spans anchor → product. The cord thins slightly as it takes
     load, which reads as genuine tension instead of a static cylinder. */
  const load = Math.min(1, (h.pos.distanceTo(h.prev) || 0) * 14);
  const thin = 1 - load * 0.16;
  h.rope.position.copy(h.anchor).addScaledVector(_dir, 0.5);
  h.rope.scale.set(thin, Math.max(len, 0.001), thin);
  h.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _dir.clone().normalize());

  /* The eyelet rides with the rope it holds, so the fitting stays locked to
     the top of the cord — the cord and the brand share one point in space. */
  if (h.eyelet) {
    h.eyelet.position.copy(h.anchor);
    h.eyelet.quaternion.copy(h.rope.quaternion);
    h.eyelet.rotateX(Math.PI / 2);
  }

  /* Contact shadow tightens and fades as the product lifts away, and densifies
     when it settles — a cheap but convincing depth cue. */
  if (h.contact) {
    const sway = Math.min(1, (h.pos.distanceTo(h.prev) || 0) * 10);
    h.contact.material.opacity = 0.5 - sway * 0.18;
  }
}

/* ── Render loop with visibility gating ────────────────────────────────── */
let t = 0, raf = 0, visible = true, announced = false;

function draw() {
  hangers.forEach(h => {
    /* Physics position is sacred — the micro-float is layered on top so the
       rope constraint never sees it. */
    h.root.position.copy(h.pos);
    h.root.position.y += Math.sin(t * (h.bobSpeed * 1000) + h.bobPhase) * 0.035;
    h.root.position.x += Math.cos(t * (h.bobSpeed * 720) + h.bobPhase) * 0.018;

    /* Each product turns at its own pace — no two items move in lockstep. */
    h.obj.rotation.y += h.spin;
    h.obj.rotation.z = Math.sin(t * 0.6 + h.bobPhase) * 0.03;

    updateRope(h);

    _up.subVectors(h.anchor, h.pos).normalize();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _up);
    h.root.quaternion.slerp(_q, 0.12);

    /* Hover elevates the object slightly and opens its glow — the "picked up
       for a closer look" beat. */
    const target = h.held ? 1.15 : (h.hovered ? 1.1 : 1);
    _t.set(target, target, target);
    h.root.scale.lerp(_t, 0.15);

    /* Contact shadow tracks the hover scale so the drop-off grows and softens
       as the object is lifted toward the viewer. */
    if (h.contact) {
      const base = h.contactBase || (h.contactBase = new THREE.Vector2().copy(h.contact.scale));
      const s = 0.9 + (target - 1) * 0.35;
      h.contact.scale.set(base.x * s, base.y * s, 1);
    }
    h.glow.material.opacity += (((h.held || h.hovered) ? 0.4 : 0) - h.glow.material.opacity) * 0.12;
  });
}

function frame() {
  raf = requestAnimationFrame(frame);
  if (!visible) return;               // hero off-screen or tab hidden
  t += 0.01;
  step(); draw();

  /* ── The brand breathes ───────────────────────────────────────────────────
     Very slow vertical float and a small rotational drift, exactly like a
     suspended object in a showroom. The rope anchors carry the SAME offsets,
     so the entire exhibition is physically hung from the drifting brand —
     nothing ever detaches. */
  const driftY = Math.sin(t * 0.12) * 0.075;
  const driftX = Math.cos(t * 0.09) * 0.045;
  stage._driftY = driftY;
  stage._driftX = driftX;
  titleGroup.position.y = stage.topY + driftY;
  titleGroup.position.x = stage.centerX + driftX;
  titleGroup.rotation.y = Math.sin(t * 0.07) * 0.045 + (ptr.x * 0.04);
  titleGroup.rotation.x = Math.sin(t * 0.05) * 0.014 - (ptr.y * 0.02);
  titleGroup.rotation.z = Math.sin(t * 0.045) * 0.008;

  /* Anchors inherit the drift so every cord stays tied to the moving brand. */
  for (let i = 0; i < hangers.length; i++) {
    const h = hangers[i];
    h.anchor.y += driftY - h._driftY;
    h.anchor.x += driftX - h._driftX;
    h._driftY = driftY;
    h._driftX = driftX;
  }

  for (let i = 0; i < letters.length; i++) {
    const L = letters[i];
    /* Letters stay locked vertically — ropes must look tied to them. */
    L.mesh.position.y = L.baseY;
    L.mesh.rotation.z = Math.sin(t * 0.85 + L.phase * 0.7) * 0.014;
  }
  dustTime.value = t;
  if (dustMesh) {
    /* The whole field turns with the brand's drift, at a fraction of the
       speed, so parallax between the layers is always readable. */
    dustMesh.position.x = stage.centerX + driftX * 0.5;
    dustMesh.position.y = stage.topY * 0.55 + driftY * 0.5;
  }

  /* Light intensities are held steady now — the old per-frame "breathing"
     pulse was a cinematic effect and has been removed for a calmer look. */

  /* Gentle parallax — keeps the composition fully framed on hover. */
  camera.position.x += (ptr.x * 0.6 - camera.position.x) * 0.05;
  camera.position.y += (0.6 + ptr.y * 0.4 - camera.position.y) * 0.05;
  camera.lookAt(0, 1.1, 0);
  renderer.render(scene, camera);

  if (!announced) {
    announced = true;
    hero.classList.add('is-3d-ready');
    hero.dispatchEvent(new CustomEvent('hero-3d-ready'));
  }
}

/* Reduced motion: settle the physics once and paint a single still frame. */
function staticFrame() {
  for (let i = 0; i < 60; i++) step();
  dustTime.value = 0;
  draw();
  camera.lookAt(0, 1.1, 0);
  renderer.render(scene, camera);
  hero.classList.add('is-3d-ready');
  hero.dispatchEvent(new CustomEvent('hero-3d-ready'));
}

/* ── Pause when the hero leaves the viewport ────────────────────────────── */
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
  }, { threshold: 0 }).observe(hero);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { visible = false; }
  else if ('IntersectionObserver' in window) {
    const r = hero.getBoundingClientRect();
    visible = r.bottom > 0 && r.top < innerHeight;
  } else { visible = true; }
});

/* ── Resize: re-measure the container, not the window ───────────────────── */
function onResizeTick() {
  const s = size();
  if (s.w === w && s.h === h) return;         /* no actual change */
  w = s.w; h = s.h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  /* Match backing-store resolution to the current devicePixelRatio so the
     3D content stays crisp and correctly scaled at any browser zoom level. */
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(w, h);
  /* Particle screen-size follows the backing-store ratio. */
  if (dustMesh) dustMesh.material.uniforms.uPix.value = renderer.getPixelRatio() * 0.5;
  layoutStage();
  fitModels();
}

let resizeRaf = 0;
function scheduleResize() {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(onResizeTick);
}
addEventListener('resize', scheduleResize);

/* ResizeObserver catches container size changes that window resize misses
   (CSS media queries switching layout, orientation change, dev-tools). */
if ('ResizeObserver' in window) {
  new ResizeObserver(scheduleResize).observe(container);
}

/* Kick off once the models have had a chance to arrive. */
setTimeout(() => {
  if (REDUCED) staticFrame();
  else frame();
}, 60);

/* Diagnostics for tests/debugging — exposes the scene's real state, including
   the projected screen boxes of the wordmark and the hanging models. */
window.__heroDebug = function () {
  const raw = titleGroup ? new THREE.Box3().setFromObject(titleGroup) : null;
  return {
    models: hangers.length,
    letters: letters.length,
    titleChildren: titleGroup.children.length,
    stage: { scale: stage.scale, centerX: stage.centerX, topY: stage.topY, anchorY: stage.anchorY, spread: stage.spread, span: stage.span, modelScale: stage.modelScale },
    slots: stage.slots ? stage.slots.map(v => Math.round(v * 100) / 100) : null,
    slotDiag: stage._slotDiag || null,
    anchors: hangers.map(h => [Math.round(h.anchor.x * 100) / 100, Math.round(h.anchor.y * 100) / 100]),
    restX: hangers.map(h => Math.round(h.pos.x * 100) / 100),
    /* diagnostic: assumed px width vs real world x-extent of each model */
    widths: hangers.map(h => {
      const b = new THREE.Box3().setFromObject(h.obj);
      const worldW = isFinite(b.min.x) ? (b.max.x - b.min.x) : 0;
      return {
        w: Math.round(h.w * 10) / 10, wBase: Math.round(h.wBase * 10) / 10,
        worldW: Math.round(worldW * 1000) / 1000,
        expectPx: Math.round(worldW / visibleExtent().w * stage.w * 10) / 10,
        z: Math.round((h.anchor.z || 0) * 100) / 100,
      };
    }),
    bigScene: BIG_SCENE,
    reduced: REDUCED,
    canHover: CAN_HOVER,
    geom: {
      stageW: stage.w, stageH: stage.h,
      visW: +(visibleExtent().w).toFixed(2), visH: +(visibleExtent().h).toFixed(2),
      rawW: raw ? +((raw.max.x - raw.min.x)).toFixed(2) : null,
      groupScale: titleGroup ? +titleGroup.scale.x.toFixed(3) : null,
      groupPosX: titleGroup ? +titleGroup.position.x.toFixed(2) : null,
      camAspect: +camera.aspect.toFixed(3), camFov: camera.fov, camZ: camera.position.z,
    },
  };
};

/** Projected screen-space boxes of the composition (px, relative to hero). */
window.__heroBoxes = function () {
  if (!hangers.length) return null;
  const boxOf = (obj) => {
    const b = new THREE.Box3().setFromObject(obj);
    if (!isFinite(b.min.x) || b.max.x <= b.min.x) return null;
    const lo = b.min.clone().project(camera);
    const hi = b.max.clone().project(camera);
    const toX = (v) => Math.round((v + 1) / 2 * stage.w);
    const toY = (v) => Math.round((-v + 1) / 2 * stage.h);
    const left = toX(Math.min(lo.x, hi.x));
    const right = toX(Math.max(lo.x, hi.x));
    const top = toY(Math.max(lo.y, hi.y));
    const bottom = toY(Math.min(lo.y, hi.y));
    return { left, right, width: right - left, top, bottom, height: bottom - top };
  };
  const word = boxOf(titleGroup);
  let prodLo = Infinity, prodHi = -Infinity, prodTop = Infinity, prodBot = -Infinity;
  let glowLo = Infinity, glowHi = -Infinity;
  const perModel = [];
  hangers.forEach(h => {
    const p = boxOf(h.obj);            // the product itself (no glow sprite)
    if (p) {
      prodLo = Math.min(prodLo, p.left); prodHi = Math.max(prodHi, p.right);
      prodTop = Math.min(prodTop, p.top); prodBot = Math.max(prodBot, p.bottom);
      perModel.push(p);
    }
    const g = boxOf(h.root);           // product + rope + glow
    if (g) { glowLo = Math.min(glowLo, g.left); glowHi = Math.max(glowHi, g.right); }
  });
  perModel.sort((a, b) => a.left - b.left);
  const products = { left: prodLo, right: prodHi, width: prodHi - prodLo, top: prodTop, bottom: prodBot, height: prodBot - prodTop };
  const withGlow = { left: glowLo, right: glowHi, width: glowHi - glowLo };
  return {
    word, products, withGlow, perModel,
    productOverflow: Math.max(0, -prodLo, prodHi - stage.w),
    glowOverflow: Math.max(0, -glowLo, glowHi - stage.w),
  };
};

}






