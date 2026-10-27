// UPSTAGGLES – 3D adventure (Three.js). Original low-poly/PBR art built from primitives. No external assets.
import * as THREE from '../lib/three.min.js';
import { LEVELS } from './levels.js';
import { sfx, audio, vol, applyVolumes, playMusic } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- save
const SAVE_KEY = 'upstaggles.save.v2';
function defaults() { return { unlocked: 1, wallet: 0, levels: {}, settings: { sound: true, music: .55, sfx: .8, quality: 'auto' } }; }
function loadSave() {
  const d = defaults();
  try {
    let s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s) { const o = JSON.parse(localStorage.getItem('upstaggles.save.v1')); if (o && o.levels) s = { unlocked: o.unlocked, wallet: o.wallet, levels: o.levels, settings: { sound: o.sound !== false } }; }
    if (s && s.levels) { const r = Object.assign(d, s); r.settings = Object.assign(defaults().settings, s.settings || {}); return r; }
  } catch (e) { /* ignore */ }
  return d;
}
const save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } }
const totalStars = () => Object.values(save.levels).reduce((s, l) => s + (l.stars || 0), 0);
function syncAudio() { vol.on = save.settings.sound; vol.music = save.settings.music; vol.sfx = save.settings.sfx; applyVolumes(); }
syncAudio();

// ---------------------------------------------------------------- renderer / scene / post-processing
const canvas = $('game');
const DPR = window.devicePixelRatio || 1;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), .04).texture; scene.environmentIntensity = .3;
const hemi = new THREE.HemisphereLight(0xdff2ff, 0x4f7a32, .85); scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffeccc, 3.0); sunLight.position.set(18, 30, 12); scene.add(sunLight); scene.add(sunLight.target);
sunLight.shadow.camera.left = -22; sunLight.shadow.camera.right = 22; sunLight.shadow.camera.top = 22; sunLight.shadow.camera.bottom = -22;
sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 90; sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = .03; sunLight.shadow.radius = 3;
scene.fog = new THREE.Fog(0xcfeeff, 55, 210);

// quality tiers: 2 high (shadows 2048 + bloom + MSAA), 1 medium (shadows 1024 + half-res bloom), 0 low (no shadows / bloom)
let tier = 1, autoQ = true, pixelRatio = 1, composer = null, bloom = null;
const QDPR = [1, 1.5, 2];
function applyQuality(t, keepRatio) {
  tier = clamp(t, 0, 2);
  if (!keepRatio) pixelRatio = Math.min(DPR, QDPR[tier]);
  renderer.setPixelRatio(pixelRatio);
  sunLight.castShadow = tier > 0;
  const ms = tier === 2 ? 2048 : 1024;
  if (sunLight.shadow.mapSize.x !== ms) { sunLight.shadow.mapSize.set(ms, ms); if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; } }
  if (composer) { composer.dispose(); composer = null; bloom = null; }
  if (tier > 0) {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: tier === 2 ? 4 : (DPR < 2 ? 2 : 0) });
    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), .5, .4, 1.0); composer.addPass(bloom);
    composer.addPass(new THREE.OutputPass());
  }
  resize();
}
function pickQuality() {
  const q = params.get('q') || save.settings.quality;
  autoQ = q === 'auto';
  applyQuality(q === 'high' ? 2 : q === 'medium' ? 1 : q === 'low' ? 0 : (isTouch ? 1 : 2));
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; baseFov = w < h ? 78 : 62; camera.fov = baseFov; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(w, h); if (bloom) bloom.resolution.set(w * pixelRatio * (tier === 2 ? .5 : .35), h * pixelRatio * (tier === 2 ? .5 : .35)); }
}
let baseFov = 62;
window.addEventListener('resize', resize);

// shared geometry & materials
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cone7: new THREE.ConeGeometry(.5, 1, 7), cone5: new THREE.ConeGeometry(.5, 1, 5),
  ico0: new THREE.IcosahedronGeometry(1, 0), ico1: new THREE.IcosahedronGeometry(1, 1), cyl8: new THREE.CylinderGeometry(.5, .5, 1, 8),
  coin: new THREE.CylinderGeometry(.38, .38, .1, 24).rotateX(Math.PI / 2), coinRim: new THREE.TorusGeometry(.38, .05, 6, 24),
  sph: new THREE.SphereGeometry(1, 12, 10), sphS: new THREE.SphereGeometry(1, 20, 16),
  oct: new THREE.OctahedronGeometry(1, 0), shadow: new THREE.CircleGeometry(.5, 20).rotateX(-Math.PI / 2), puff: new THREE.IcosahedronGeometry(1, 0),
};
const matCache = new Map();
function M(color, extra) {
  const k = color + '|' + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: .82, metalness: 0 }, extra || {})));
  return matCache.get(k);
}
const SM = (color, extra) => M(color, Object.assign({ flatShading: false, roughness: .55 }, extra || {})); // smooth (hero / creatures)
function mesh(geo, mat, parent, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
  if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  (parent || scene).add(m); return m;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const castAll = (o) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; } }); return o; };

// ---------------------------------------------------------------- sky dome (vertex gradient + sun glow)
const skyGeo = new THREE.SphereGeometry(400, 24, 14);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -1; scene.add(sky);
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(12, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.5), fog: false }));
scene.add(sunDisc);
function paintSky(top, low) {
  const ct = new THREE.Color(top), cl = new THREE.Color(low), c = new THREE.Color();
  const pos = skyGeo.attributes.position, col = skyGeo.attributes.color;
  for (let i = 0; i < pos.count; i++) { const t = clamp(pos.getY(i) / 400, -0.2, 1); c.copy(cl).lerp(ct, clamp(Math.pow(Math.max(t, 0) * 1.5, .8), 0, 1)); col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true; scene.fog.color.copy(cl); renderer.setClearColor(cl);
  hemi.color.copy(ct).lerp(new THREE.Color(0xffffff), .6);
}

// ---------------------------------------------------------------- hero (original "Staggle Hero": smooth two-segment limbs)
function buildHero(skin) {
  const C = Object.assign({ body: 0x22b8b0, belly: 0xbff5ee, scarf: 0xffd23f, skin: 0xffd6a5, hood: 0xff7f3f, pants: 0x34407a, boots: 0xff7f3f, glove: 0xffffff, eye: 0x1b1b2f }, skin || {});
  const g = new THREE.Group();
  const rig = new THREE.Group(); g.add(rig);                 // squash & stretch (feet anchored)
  const pivot = new THREE.Group(); pivot.position.y = .8; rig.add(pivot); // flips / rolls around the centre
  const root = new THREE.Group(); root.position.y = -.8; pivot.add(root);
  const torso = new THREE.Group(); torso.position.y = .62; root.add(torso);
  const body = mesh(new THREE.CapsuleGeometry(.34, .38, 6, 16), SM(C.body), torso, 0, .22, 0);
  mesh(G.sphS, SM(C.belly), torso, 0, .17, -.22, .23, .25, .14);
  mesh(new THREE.TorusGeometry(.29, .09, 10, 20).rotateX(Math.PI / 2), SM(C.scarf), torso, 0, .56, 0);
  const scarfA = new THREE.Group(); scarfA.position.set(.12, .55, .27); torso.add(scarfA);
  mesh(G.box, SM(C.scarf), scarfA, 0, -.18, 0, .16, .38, .06);
  const scarfB = new THREE.Group(); scarfB.position.set(0, -.36, 0); scarfA.add(scarfB);
  mesh(G.box, SM(C.scarf), scarfB, 0, -.15, 0, .14, .32, .05);
  mesh(new THREE.CapsuleGeometry(.17, .16, 4, 10), SM(0xc0773a), torso, 0, .3, .33, 1, 1, .8); // backpack
  const head = new THREE.Group(); head.position.set(0, .92, 0); torso.add(head);
  mesh(G.sphS, SM(C.skin), head, 0, 0, 0, .41, .39, .39);
  const hood = mesh(new THREE.SphereGeometry(.44, 20, 12, 0, TAU, 0, Math.PI * .52), SM(C.hood), head, 0, .03, .04); hood.rotation.x = -.28;
  for (const s of [-1, 1]) { const ear = mesh(new THREE.ConeGeometry(.12, .26, 10), SM(C.hood), head, s * .27, .36, .06); ear.rotation.z = -s * .45; }
  mesh(G.cone5, SM(0x55d04a), head, 0, .5, .05, .07, .26, .07);
  const leaf = mesh(G.sphS, SM(0x55d04a), head, .1, .64, .05, .14, .04, .08); leaf.rotation.z = .5;
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * .15, .03, -.33); head.add(e); eyes.push(e);
    mesh(G.sphS, SM(0xffffff, { roughness: .2 }), e, 0, 0, 0, .11, .14, .06);
    mesh(G.sphS, SM(C.eye, { roughness: .2 }), e, 0, -.01, -.04, .065, .085, .04);
    mesh(G.sphS, M(0xffffff, { emissive: 0xffffff, emissiveIntensity: .6 }), e, .025, .035, -.075, .022);
    mesh(G.sphS, SM(0xff9aa2), head, s * .26, -.13, -.28, .07, .045, .03);
  }
  mesh(new THREE.TorusGeometry(.06, .018, 6, 12, Math.PI), SM(0x8a3a2a), head, 0, -.14, -.37).rotation.z = Math.PI;
  const limb = (parent, x, y, r, l1, l2, col1, col2, endFn) => {
    const sh = new THREE.Group(); sh.position.set(x, y, 0); parent.add(sh);
    mesh(new THREE.CapsuleGeometry(r, l1, 4, 10), SM(col1), sh, 0, -l1 / 2 - r * .3, 0);
    const el = new THREE.Group(); el.position.y = -l1 - r * .4; sh.add(el);
    mesh(new THREE.CapsuleGeometry(r * .92, l2, 4, 10), SM(col2), el, 0, -l2 / 2 - r * .2, 0);
    endFn(el, -l2 - r * .6); return { sh, el };
  };
  const armL = limb(torso, -.44, .46, .095, .2, .18, C.body, C.body, (el, y) => mesh(G.sphS, SM(C.glove), el, 0, y, 0, .12));
  const armR = limb(torso, .44, .46, .095, .2, .18, C.body, C.body, (el, y) => mesh(G.sphS, SM(C.glove), el, 0, y, 0, .12));
  const legL = limb(root, -.17, .62, .11, .14, .12, C.pants, C.pants, (el, y) => mesh(new THREE.CapsuleGeometry(.12, .16, 4, 10).rotateX(Math.PI / 2), SM(C.boots), el, 0, y + .04, -.06));
  const legR = limb(root, .17, .62, .11, .14, .12, C.pants, C.pants, (el, y) => mesh(new THREE.CapsuleGeometry(.12, .16, 4, 10).rotateX(Math.PI / 2), SM(C.boots), el, 0, y + .04, -.06));
  castAll(g);
  return { group: g, rig, pivot, root, torso, body, head, armL, armR, legL, legR, scarfA, scarfB, eyes };
}
const hero = buildHero(); scene.add(hero.group);
const heroShadow = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false }));
heroShadow.renderOrder = 1; scene.add(heroShadow);
const spinRing = new THREE.Mesh(new THREE.TorusGeometry(1, .08, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.8, .6), transparent: true, opacity: 0, depthWrite: false }));
scene.add(spinRing);
const dashTrail = []; // afterimage ghosts
for (let i = 0; i < 5; i++) { const m = mesh(new THREE.CapsuleGeometry(.36, .7, 4, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 1.6, 1.5), transparent: true, opacity: 0, depthWrite: false }), scene); m.visible = false; dashTrail.push({ m, life: 0 }); }

// ---------------------------------------------------------------- particles (pooled): sparks (gravity) + puffs (dust/smoke, expand & fade)
const parts = [];
for (let i = 0; i < 160; i++) {
  const m = new THREE.Mesh(G.oct, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })); m.visible = false; scene.add(m);
  parts.push({ m, v: new THREE.Vector3(), life: 0, max: 1, kind: 0, size: .12, grav: 14 });
}
let partIdx = 0;
function getPart() { for (let k = 0; k < parts.length; k++) { const p = parts[(partIdx + k) % parts.length]; if (p.life <= 0) { partIdx = (partIdx + k + 1) % parts.length; return p; } } const p = parts[partIdx]; partIdx = (partIdx + 1) % parts.length; return p; }
const tmpC = new THREE.Color();
function burst(x, y, z, color, n, spd, glow) {
  for (let i = 0; i < n; i++) {
    const p = getPart(); p.kind = 0; p.m.geometry = G.oct; p.m.visible = true;
    tmpC.setHex(color); if (glow !== false) tmpC.multiplyScalar(1.8); p.m.material.color.copy(tmpC); p.m.material.opacity = 1;
    p.m.position.set(x, y, z); const a = Math.random() * TAU, u = Math.random();
    p.v.set(Math.cos(a) * spd * (.4 + u), spd * (.5 + Math.random()), Math.sin(a) * spd * (.4 + u)); p.life = p.max = .5 + Math.random() * .4; p.size = .1 + Math.random() * .07; p.grav = 14;
  }
}
function puff(x, y, z, color, n, spd, size, up) {
  for (let i = 0; i < n; i++) {
    const p = getPart(); p.kind = 1; p.m.geometry = G.puff; p.m.visible = true; p.m.material.color.setHex(color); p.m.material.opacity = .7;
    p.m.position.set(x + (Math.random() - .5) * .3, y + Math.random() * .1, z + (Math.random() - .5) * .3);
    const a = (n > 1 ? i / n : Math.random()) * TAU + Math.random() * .4;
    p.v.set(Math.cos(a) * spd, (up || .6) * (.5 + Math.random()), Math.sin(a) * spd); p.life = p.max = .45 + Math.random() * .25; p.size = (size || .22) * (.7 + Math.random() * .6); p.grav = -.5;
  }
}
function updateParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue; p.life -= dt; const k = clamp(p.life / p.max, 0, 1);
    p.v.y -= p.grav * dt; p.m.position.addScaledVector(p.v, dt);
    if (p.kind === 0) { p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6; p.m.scale.setScalar(p.size * clamp(k * 2, 0, 1)); }
    else { p.v.multiplyScalar(1 - dt * 4); p.m.scale.setScalar(p.size * (1 + (1 - k) * 1.6)); p.m.material.opacity = .65 * k; }
    if (p.life <= 0) p.m.visible = false;
  }
}

// floating score popups (DOM, projected from 3D)
const popLayer = $('pops'); const pops = [];
function popup(text, x, y, z, cls) {
  let el = pops.find((p) => p.life <= 0);
  if (!el) { if (pops.length > 24) el = pops[0]; else { const d = document.createElement('div'); d.className = 'pop'; popLayer.appendChild(d); el = { d, life: 0 }; pops.push(el); } }
  el.d.textContent = text; el.d.className = 'pop ' + (cls || ''); el.pos = new THREE.Vector3(x, y, z); el.life = el.max = cls === 'big' ? 1.2 : .8; el.d.style.display = 'block';
}
const projV = new THREE.Vector3();
function updatePops(dt) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const p of pops) {
    if (p.life <= 0) continue; p.life -= dt; p.pos.y += dt * 1.6;
    projV.copy(p.pos).project(camera);
    if (p.life <= 0 || projV.z > 1) { p.d.style.display = 'none'; continue; }
    const k = p.life / p.max, s = k > .8 ? 1 + (k - .8) * 3 : 1;
    p.d.style.transform = `translate(${(projV.x * .5 + .5) * w}px,${(-projV.y * .5 + .5) * h}px) translate(-50%,-50%) scale(${s})`;
    p.d.style.opacity = Math.min(1, k * 2.5);
  }
}

// ---------------------------------------------------------------- world state & level building
let world = null;
const levelGroup = new THREE.Group(); scene.add(levelGroup);
const bgGroup = new THREE.Group(); scene.add(bgGroup);

function buildBackground(L, rnd, cx, cz) {
  disposeGroup(bgGroup);
  const floorY = -26;
  mesh(new THREE.CircleGeometry(300, 32).rotateX(-Math.PI / 2), M(0x8fcf6a), bgGroup, cx, floorY, cz);
  mesh(new THREE.CircleGeometry(40, 24).rotateX(-Math.PI / 2), M(0x4cb8ff, { flatShading: false, roughness: .15, metalness: .1 }), bgGroup, cx + 30, floorY + .05, cz - 10);
  const hillCols = [0x6cbf4f, 0x82cf5a, 0x5aae4a, 0x9ad66a, 0x7fb6e8];
  for (let i = 0; i < 28; i++) {
    const a = rnd() * TAU, r = 75 + rnd() * 80, hgt = 14 + rnd() * 38, w = 22 + rnd() * 30;
    const m = mesh(G.cone7, M(hillCols[i % hillCols.length]), bgGroup, cx + Math.cos(a) * r, floorY + hgt / 2, cz + Math.sin(a) * r, w, hgt, w);
    m.rotation.y = rnd() * TAU;
    if (hgt > 38) mesh(G.cone7, M(0xffffff), bgGroup, m.position.x, floorY + hgt * .86, m.position.z, w * .29, hgt * .28, w * .29).rotation.y = m.rotation.y;
  }
  for (let i = 0; i < 16; i++) {
    const cl = new THREE.Group(); const a = rnd() * TAU, r = 30 + rnd() * 90;
    cl.position.set(cx + Math.cos(a) * r, 16 + rnd() * 24, cz + Math.sin(a) * r);
    for (let j = 0; j < 5; j++) mesh(G.ico1, M(0xffffff, { roughness: 1 }), cl, (j - 2) * 2.2, rnd() * 1.2, rnd() * 1.5, 1.8 + rnd() * 1.6, (1.8 + rnd()) * .8, 1.8 + rnd() * 1.6);
    cl.userData.drift = .5 + rnd(); bgGroup.add(cl);
  }
}

function addTree(parent, x, y, z, rnd) {
  const s = .8 + rnd() * .5; const t = new THREE.Group(); t.userData.static = true; t.position.set(x, y, z); parent.add(t);
  mesh(G.cyl8, M(0x8a5a33), t, 0, .6 * s, 0, .3 * s, 1.2 * s, .3 * s);
  const cols = [0x3fae4a, 0x52c45a, 0x2f9e57, 0x6fcf4f];
  if (rnd() < .5) { mesh(G.cone7, M(cols[(rnd() * 4) | 0]), t, 0, 1.9 * s, 0, 1.8 * s, 1.8 * s, 1.8 * s); mesh(G.cone7, M(cols[(rnd() * 4) | 0]), t, 0, 2.7 * s, 0, 1.3 * s, 1.4 * s, 1.3 * s); }
  else { mesh(G.ico1, M(cols[(rnd() * 4) | 0]), t, 0, 2.0 * s, 0, .95 * s); mesh(G.ico1, M(cols[(rnd() * 4) | 0]), t, .3 * s, 2.6 * s, .1, .6 * s); }
  t.rotation.y = rnd() * TAU;
}

function addPlatform(p, pal, rnd, colliders) {
  const kind = p.kind;
  const h = kind === 'cliff' ? p.top + 1.2 : kind === 'stone' ? .9 : kind === 'bridge' ? .5 : 1.2;
  const minY = p.top - h;
  colliders.push({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2, minY, maxY: p.top });
  if (kind === 'bridge') {
    const along = p.d >= p.w; const len = along ? p.d : p.w; const n = Math.round(len / .62);
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + .5) * len / n;
      const m = mesh(G.box, M(i % 2 ? 0xc68a4f : 0xb87a42), levelGroup, p.x + (along ? 0 : o), p.top - .12, p.z + (along ? o : 0), along ? p.w : len / n * .86, .24, along ? len / n * .86 : p.d);
      m.rotation.y = (rnd() - .5) * .04;
    }
    for (const s of [-1, 1]) {
      mesh(G.box, M(0xe8c27a), levelGroup, p.x + (along ? s * p.w / 2 : 0), p.top + .75, p.z + (along ? 0 : s * p.d / 2), along ? .08 : p.w, .08, along ? p.d : .08);
      for (const e of [-1, 1]) mesh(G.cyl8, M(0x8a5a33), levelGroup, p.x + (along ? s * p.w / 2 : e * p.w / 2), p.top + .35, p.z + (along ? e * p.d / 2 : s * p.d / 2), .16, 1.0, .16);
    }
    return;
  }
  const bodyCol = kind === 'stone' ? 0x9aa3b5 : kind === 'cliff' ? 0xa77b52 : pal.dirt;
  const topCol = kind === 'stone' ? 0x9ee07a : pal.grass;
  mesh(G.box, M(bodyCol), levelGroup, p.x, minY + (h - .3) / 2, p.z, p.w, h - .3, p.d);
  mesh(G.box, M(topCol, { roughness: .95 }), levelGroup, p.x, p.top - .15, p.z, p.w + .16, .34, p.d + .16);
  // grass lip
  for (const s of [-1, 1]) { mesh(G.box, M(topCol, { roughness: .95 }), levelGroup, p.x + s * (p.w / 2 + .06), p.top - .38, p.z, .1, .2, p.d * .9); mesh(G.box, M(topCol, { roughness: .95 }), levelGroup, p.x, p.top - .38, p.z + s * (p.d / 2 + .06), p.w * .9, .2, .1); }
  if (kind === 'cliff') {
    for (let y = minY + 1.2; y < p.top - .8; y += 1.6) mesh(G.box, M(0x8f6542), levelGroup, p.x, y, p.z, p.w + .06, .25, p.d + .06);
  } else {
    const hc = Math.min(7, (p.w + p.d) / 3 + 1);
    const cone = mesh(G.cone7, M(kind === 'stone' ? 0x7d869a : 0x8f6542), levelGroup, p.x, minY - hc / 2, p.z, p.w * 1.0, hc, p.d * 1.0);
    cone.rotation.x = Math.PI; cone.rotation.y = rnd() * TAU;
  }
  const area = p.w * p.d, nf = kind === 'stone' ? 1 : Math.min(14, Math.floor(area / 5));
  const fc = [0xff5fa2, 0xffe14d, 0xffffff, 0xb07cff, 0xff8a3d];
  for (let i = 0; i < nf; i++) {
    const fx = p.x + (rnd() - .5) * (p.w - .6), fz = p.z + (rnd() - .5) * (p.d - .6);
    if (rnd() < .5) { mesh(G.cyl8, M(0x3f9e3a), levelGroup, fx, p.top + .1, fz, .03, .2, .03); mesh(G.ico0, M(fc[(rnd() * 5) | 0]), levelGroup, fx, p.top + .22, fz, .1); }
    else mesh(G.cone5, M(0x4fb83f), levelGroup, fx, p.top + .15, fz, .14, .3, .14);
  }
  if (kind !== 'stone' && area > 30 && rnd() < .7) { const rx = p.x + (rnd() - .5) * (p.w - 1.4), rz = p.z + (rnd() - .5) * (p.d - 1.4); mesh(G.ico0, M(0xa3a9b8), levelGroup, rx, p.top + .12, rz, .35, .25, .3).rotation.y = rnd() * 3; }
}

const sharedGeos = new Set(Object.values(G));
function disposeGroup(group) {
  const mats = new Set(matCache.values());
  group.traverse((o) => { if (!o.isMesh) return; if (!sharedGeos.has(o.geometry)) o.geometry.dispose(); if (!mats.has(o.material)) o.material.dispose(); });
  group.clear();
}
// Merge every static mesh into one mesh per material -> far fewer draw calls on phones.
function mergeStatic(group, shadows) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    for (let p = o.parent; p && p !== group; p = p.parent) if (!p.userData.static) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g); remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [mat, geos] of buckets) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let off = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, off * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    bg.computeBoundingSphere(); const m = new THREE.Mesh(bg, mat); m.castShadow = m.receiveShadow = !!shadows; group.add(m);
  }
}

const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: .85, roughness: .28, emissive: 0xc77d00, emissiveIntensity: .55 });
const coinRimMat = new THREE.MeshStandardMaterial({ color: 0xffe27a, metalness: .9, roughness: .2, emissive: 0xffa000, emissiveIntensity: .9 });
function makeCoin(parent, x, y, z) {
  const m = new THREE.Group(); m.position.set(x, y, z); parent.add(m);
  mesh(G.coin, coinMat, m); mesh(G.coinRim, coinRimMat, m);
  mesh(G.box, coinRimMat, m, 0, 0, 0, .1, .34, .13); // embossed bar
  return m;
}

function loadLevel(idx) {
  const L = LEVELS[idx];
  disposeGroup(levelGroup);
  const rnd = rng(1234 + idx * 77);
  paintSky(L.palette.skyTop, L.palette.skyLow);
  const colliders = [];
  for (const p of L.platforms) addPlatform(p, L.palette, rnd, colliders);
  let cx = 0, cz = 0; for (const p of L.platforms) { cx += p.x; cz += p.z; } cx /= L.platforms.length; cz /= L.platforms.length;
  buildBackground(L, rnd, cx, cz);
  for (const t of L.trees) addTree(levelGroup, t[0], t[1], t[2], rnd);

  const movers = L.movers.map((m) => {
    const g = new THREE.Group(); levelGroup.add(g);
    mesh(G.box, M(0xffa53d), g, 0, -.3, 0, m.w, .6, m.d).receiveShadow = true;
    mesh(G.box, M(0xfff1a8), g, 0, -.02, 0, m.w + .1, .08, m.d + .1).receiveShadow = true;
    for (const s of [-1, 1]) mesh(G.oct, M(0xff5fa2, { emissive: 0xff2266, emissiveIntensity: 1.5 }), g, s * (m.w / 2 + .15), -.3, 0, .18);
    castAll(g);
    const box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 0, mover: true };
    colliders.push(box);
    return Object.assign({}, m, { g, box, x: m.from[0], y: m.from[1], z: m.from[2], dx: 0, dy: 0, dz: 0 });
  });

  const vines = L.vines.map((v) => {
    const g = new THREE.Group(); g.userData.static = true; levelGroup.add(g);
    const hgt = v.y1 - v.y0;
    mesh(G.box, M(0x2f8f3a), g, v.x, v.y0 + hgt / 2, v.z + .06, v.w, hgt, .1);
    for (let i = 0; i < v.w * hgt * 2.2; i++) mesh(G.ico0, M([0x4fcf4a, 0x3fae4a, 0x7ee05a][i % 3]), g, v.x + (rnd() - .5) * v.w, v.y0 + rnd() * hgt, v.z + .14, .16 + rnd() * .12);
    for (let x = -v.w / 2 + .3; x < v.w / 2; x += .75) mesh(G.box, M(0x5a3d22), g, v.x + x, v.y0 + hgt / 2, v.z + .12, .07, hgt, .07);
    return v;
  });

  const coins = L.coins.map(([x, y, z], i) => { const m = makeCoin(levelGroup, x, y, z); m.rotation.y = i * .5; return { m, x, y, z, x0: x, y0: y, z0: z, taken: false, t: 0 }; });

  const checkpoints = L.checkpoints.map(([x, y, z]) => {
    const g = new THREE.Group(); g.position.set(x, y, z); levelGroup.add(g);
    mesh(G.cyl8, M(0x9aa3b5), g, 0, .1, 0, .8, .2, .8);
    mesh(G.cyl8, M(0xffffff, { metalness: .6, roughness: .3 }), g, 0, 1.15, 0, .1, 2.1, .1);
    const orb = mesh(G.sphS, M(0xffd23f, { emissive: 0xffaa00, emissiveIntensity: .4 }), g, 0, 2.25, 0, .14);
    const flag = mesh(G.box, M(0xbfc6d4), g, .45, 1.9, 0, .8, .5, .05);
    castAll(g);
    return { g, flag, orb, x, y, z, on: false };
  });

  const goalG = new THREE.Group(); goalG.position.set(L.goal[0], L.goal[1], L.goal[2]); levelGroup.add(goalG);
  mesh(G.cyl8, M(0x9aa3b5), goalG, 0, .15, 0, 2.6, .3, 2.6).receiveShadow = true;
  const torus = mesh(new THREE.TorusGeometry(1.2, .2, 10, 32), M(0xff5fa2, { emissive: 0xff2a8a, emissiveIntensity: 1.2 }), goalG, 0, 1.75, 0);
  const portalMat = new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: .8, side: THREE.DoubleSide });
  const disc = mesh(new THREE.CircleGeometry(1.05, 32), portalMat, goalG, 0, 1.75, 0);
  const swirl = mesh(new THREE.RingGeometry(.35, .6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), transparent: true, opacity: .6, side: THREE.DoubleSide }), goalG, 0, 1.75, .02);
  const sparks = []; for (let i = 0; i < 8; i++) sparks.push(mesh(G.oct, M(0xffe14d, { emissive: 0xffcc00, emissiveIntensity: 1.6 }), goalG, 0, 1.75, 0, .12));
  for (const s of [-1, 1]) mesh(G.cyl8, M(0xffd23f, { metalness: .7, roughness: .3 }), goalG, s * 1.45, .8, 0, .16, 1.4, .16).castShadow = true;

  const enemies = L.enemies.map((e) => {
    const g = new THREE.Group(); levelGroup.add(g);
    const body = mesh(G.sphS, SM(0x9b59b6, { roughness: .4 }), g, 0, .55, 0, .58, .5, .58);
    mesh(G.sphS, SM(0xc39bd3), g, 0, .45, -.3, .3, .22, .2);
    for (const s of [-1, 1]) {
      mesh(G.sphS, SM(0xffffff, { roughness: .2 }), g, s * .2, .72, -.45, .14, .16, .08);
      mesh(G.sphS, SM(0x1b1b2f), g, s * .2, .7, -.52, .06, .08, .04);
      const brow = mesh(G.box, SM(0x3b1f4a), g, s * .2, .9, -.48, .2, .05, .05); brow.rotation.z = s * -.4;
      mesh(G.cone5, SM(0xffe066), g, s * .3, 1.08, 0, .14, .32, .14).rotation.z = s * -.3;
      mesh(G.sphS, SM(0x3b1f4a), g, s * .25, .1, -.05, .14, .1, .2);
    }
    castAll(g);
    const t0 = rnd(); g.position.set(lerp(e.a[0], e.b[0], t0), e.y, lerp(e.a[1], e.b[1], t0));
    return { g, body, a: e.a, b: e.b, y: e.y, speed: e.speed, t: t0, dir: 1, x: g.position.x, z: g.position.z, alive: true, dieT: 0 };
  });

  mergeStatic(levelGroup, true); mergeStatic(bgGroup, false);
  world = {
    idx, L, colliders, movers, vines, coins, checkpoints, enemies,
    goal: { x: L.goal[0], y: L.goal[1], z: L.goal[2], g: goalG, torus, disc, swirl, sparks, portalMat },
    t: 0, got: 0, total: coins.length + enemies.length * 3, foes: 0, done: false, score: 0, combo: 0, comboT: 0, bestCombo: 0,
  };
  resetPlayer(true);
  updateHUD(true);
}

// ---------------------------------------------------------------- player
const R = .35, H = 1.5, SPEED = 7.5, JUMP = 12, JUMP2 = 10.5, GRAV = 32, DASH_V = 17, DASH_T = .2;
const P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: false, ground: null, coyote: 0, jumpBuf: 0,
  facing: 0, hearts: 3, invuln: 0, attackT: 0, attackCD: 0, climbing: false, walk: 0, knock: 0,
  respawn: new THREE.Vector3(), landT: 0, airJumps: 1, flipT: 0, dashT: 0, dashCD: 0, airDash: 1, dashDir: new THREE.Vector2(),
  sq: 1, sqV: 0, dustT: 0, stepT: 0, lean: 0, fallV: 0,
};
function resetPlayer(full) {
  const s = world.L.start;
  if (full) { P.respawn.set(s[0], s[1], s[2]); P.hearts = 3; }
  P.pos.copy(P.respawn); P.pos.y += .05; P.vel.set(0, 0, 0); P.facing = 0; P.climbing = false; P.knock = 0; P.attackT = 0; P.dashT = 0; P.flipT = 0; P.dashCD = 0; P.attackCD = 0;
  P.invuln = full ? 0 : 1.0;
  if (full) { camYaw = 0; camPitch = .38; }
  snapCamera();
}
function overlaps(b) {
  return P.pos.x + R > b.minX && P.pos.x - R < b.maxX && P.pos.z + R > b.minZ && P.pos.z - R < b.maxZ && P.pos.y + H > b.minY + 1e-4 && P.pos.y < b.maxY - 1e-4;
}
function moveAndCollide(dt) {
  const cs = world.colliders;
  P.pos.x += P.vel.x * dt;
  for (const b of cs) if (overlaps(b)) { if (P.pos.x < (b.minX + b.maxX) / 2) P.pos.x = b.minX - R - 1e-3; else P.pos.x = b.maxX + R + 1e-3; P.vel.x = 0; }
  P.pos.z += P.vel.z * dt;
  for (const b of cs) if (overlaps(b)) { if (P.pos.z < (b.minZ + b.maxZ) / 2) P.pos.z = b.minZ - R - 1e-3; else P.pos.z = b.maxZ + R + 1e-3; P.vel.z = 0; }
  P.pos.y += P.vel.y * dt;
  const wasGrounded = P.grounded; P.grounded = false;
  for (const b of cs) if (overlaps(b)) {
    if (P.vel.y <= 0 || P.pos.y > (b.minY + b.maxY) / 2) { if (!wasGrounded) onLand(P.vel.y); P.pos.y = b.maxY; P.vel.y = 0; P.grounded = true; P.ground = b; }
    else { P.pos.y = b.minY - H - 1e-3; P.vel.y = 0; }
  }
  if (!P.grounded && P.vel.y <= 0) for (const b of cs) {
    if (Math.abs(P.pos.y - b.maxY) < .02 && P.pos.x + R > b.minX && P.pos.x - R < b.maxX && P.pos.z + R > b.minZ && P.pos.z - R < b.maxZ) { P.grounded = true; P.ground = b; P.pos.y = b.maxY; break; }
  }
  if (!P.grounded) P.ground = null;
}
function onLand(vy) {
  P.airJumps = 1; P.airDash = 1;
  if (vy < -6) {
    const k = clamp(-vy / 25, .25, 1);
    sfx('land'); P.landT = .15; P.sqV -= 9 * k; puff(P.pos.x, P.pos.y + .05, P.pos.z, 0xe9e2d0, 8, 2.6 * k + 1, .2, .4);
    if (vy < -20) shake(.18);
  }
}
function inVine() {
  for (const v of world.vines) if (Math.abs(P.pos.x - v.x) < v.w / 2 && P.pos.z > v.z - .05 && P.pos.z < v.z + R + .55 && P.pos.y > v.y0 - .15 && P.pos.y < v.y1 + .05) return v;
  return null;
}

const input = { kx: 0, ky: 0, jx: 0, jy: 0, jumpHeld: false, jumpPressed: false, actionPressed: false, dashPressed: false, camKeys: 0 };
let camYaw = 0, camPitch = .38, camDist = 7.5, shakeAmt = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

function updatePlayer(dt) {
  let mx = input.kx + input.jx, my = input.ky + input.jy;
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const dx = rx * mx + fx * my, dz = rz * mx + fz * my, dl = Math.hypot(dx, dz);

  if (input.jumpPressed) P.jumpBuf = .15; else P.jumpBuf -= dt;
  input.jumpPressed = false;
  if (input.actionPressed && P.attackCD <= 0) { P.attackT = .38; P.attackCD = .5; sfx('spin'); spinRing.material.opacity = .9; spinRing.scale.setScalar(.4); }
  input.actionPressed = false;
  if (input.dashPressed && P.dashCD <= 0 && (P.grounded || P.airDash > 0) && !P.climbing) {
    let ddx = dl > .1 ? dx / dl : -Math.sin(P.facing), ddz = dl > .1 ? dz / dl : -Math.cos(P.facing);
    P.dashDir.set(ddx, ddz); P.dashT = DASH_T; P.dashCD = .55; if (!P.grounded) P.airDash--; P.knock = 0;
    sfx('dash'); shake(.06); puff(P.pos.x, P.pos.y + .3, P.pos.z, 0xffffff, 6, 2, .2, .3);
  }
  input.dashPressed = false;
  P.attackT -= dt; P.attackCD -= dt; P.invuln -= dt; P.knock -= dt; P.landT -= dt; P.dashCD -= dt; P.flipT -= dt;

  if (P.dashT > 0) {
    P.dashT -= dt; P.vel.x = P.dashDir.x * DASH_V; P.vel.z = P.dashDir.y * DASH_V; if (!P.grounded) P.vel.y = Math.max(P.vel.y, 0) * .5;
    P.facing = Math.atan2(-P.dashDir.x, -P.dashDir.y);
    if (P.dashT <= 0) { P.vel.x *= .5; P.vel.z *= .5; }
  } else if (P.knock <= 0) {
    const has = dl > .05;
    const acc = (P.grounded ? (has ? 95 : 70) : 42) * dt;
    const tx = dx * SPEED, tz = dz * SPEED;
    const ddx = tx - P.vel.x, ddz = tz - P.vel.z, dd = Math.hypot(ddx, ddz);
    if (dd <= acc) { P.vel.x = tx; P.vel.z = tz; } else { P.vel.x += ddx / dd * acc; P.vel.z += ddz / dd * acc; }
  }
  if (dl > .1 && P.knock <= 0 && P.dashT <= 0) { const tf = Math.atan2(-dx, -dz); let d = tf - P.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); P.facing += d * Math.min(1, dt * 16); }

  const v = inVine(); const into = -dz; const wasClimbing = P.climbing;
  P.climbing = !!v && !P.grounded && (into > .3 || (wasClimbing && dl < .15)) || (!!v && P.grounded && into > .3);
  if (P.climbing) { P.vel.y = into > .3 ? 4.6 : 0; P.facing = lerp(P.facing, 0, Math.min(1, dt * 12)); P.airJumps = 1; P.airDash = 1; }

  if (P.grounded) P.coyote = .12; else P.coyote -= dt;
  if (P.jumpBuf > 0) {
    if (P.coyote > 0 || P.climbing) {
      P.vel.y = JUMP; if (P.climbing) { P.vel.z += 5; P.climbing = false; }
      P.jumpBuf = 0; P.coyote = 0; P.grounded = false; sfx('jump'); P.sqV += 7; puff(P.pos.x, P.pos.y + .05, P.pos.z, 0xe9e2d0, 4, 1.6, .16, .2);
    } else if (P.airJumps > 0 && !world.noDouble) {
      P.vel.y = JUMP2; P.airJumps--; P.jumpBuf = 0; P.flipT = .42; sfx('djump'); P.sqV += 6;
      burst(P.pos.x, P.pos.y + .2, P.pos.z, 0x9ff7ff, 8, 3); puff(P.pos.x, P.pos.y, P.pos.z, 0xffffff, 6, 2.4, .18, -.3);
    }
  }
  if (!P.climbing && P.dashT <= 0) {
    P.vel.y -= GRAV * dt * (P.vel.y > 0 && !input.jumpHeld ? 2.2 : 1);
    if (P.vel.y < -30) P.vel.y = -30;
  }
  if (P.ground && P.ground.mover) { const m = world.movers.find((mm) => mm.box === P.ground); if (m) { P.pos.x += m.dx; P.pos.y += m.dy; P.pos.z += m.dz; } }

  const steps = dt > 1 / 70 ? 2 : 1;
  for (let i = 0; i < steps; i++) moveAndCollide(dt / steps);

  // run dust & footsteps
  const spd = Math.hypot(P.vel.x, P.vel.z);
  if (P.grounded && spd > 4.5) {
    P.dustT -= dt; if (P.dustT <= 0) { P.dustT = P.dashT > 0 ? .02 : .09; puff(P.pos.x - P.vel.x * .03, P.pos.y + .05, P.pos.z - P.vel.z * .03, 0xece4d2, 1, .6, P.dashT > 0 ? .26 : .17, .5); }
    P.stepT -= dt * spd; if (P.stepT <= 0) { P.stepT = 2.6; sfx('step'); }
  }
  if (P.dashT > 0) trailT -= dt;
  if (P.pos.y < -14) { sfx('fall'); toast('Whoops!'); shake(.2); resetPlayer(false); }
}
let trailT = 0;

function hurt(fromX, fromZ) {
  if (P.invuln > 0 || P.dashT > 0) return;
  P.hearts--; sfx('hurt'); P.invuln = 1.3; P.knock = .35; shake(.35); world.combo = 0;
  const ax = P.pos.x - fromX, az = P.pos.z - fromZ, al = Math.hypot(ax, az) || 1;
  P.vel.set(ax / al * 8, 7, az / al * 8);
  burst(P.pos.x, P.pos.y + 1, P.pos.z, 0xff4d6d, 10, 5);
  if (P.hearts <= 0) { toast('Try again!'); P.hearts = 3; setTimeout(() => { if (world) resetPlayer(false); }, 50); }
  updateHUD();
}

// ---------------------------------------------------------------- world update
function updateWorld(dt) {
  const w = world; w.t += dt;
  for (const m of w.movers) {
    const k = .5 - .5 * Math.cos((w.t / m.period) * TAU);
    const nx = lerp(m.from[0], m.to[0], k), ny = lerp(m.from[1], m.to[1], k), nz = lerp(m.from[2], m.to[2], k);
    m.dx = nx - m.x; m.dy = ny - m.y; m.dz = nz - m.z; m.x = nx; m.y = ny; m.z = nz;
    Object.assign(m.box, { minX: nx - m.w / 2, maxX: nx + m.w / 2, minZ: nz - m.d / 2, maxZ: nz + m.d / 2, minY: ny - .6, maxY: ny });
    m.g.position.set(nx, ny, nz);
  }
}
function addScore(pts, x, y, z, label) {
  world.score += pts; popup(label || `+${pts}`, x, y, z, pts >= 100 ? 'big' : ''); updateHUD();
}
function collectCoin(c) {
  const w = world; c.taken = true; w.got++;
  w.combo = w.comboT > 0 ? w.combo + 1 : 1; w.comboT = 1.2; w.bestCombo = Math.max(w.bestCombo, w.combo);
  const mult = Math.min(5, 1 + Math.floor((w.combo - 1) / 5));
  sfx('coin', w.combo - 1); burst(c.x, c.y, c.z, 0xffd23f, 9, 4); burst(c.x, c.y, c.z, 0xffffff, 4, 2.5);
  addScore(10 * mult, c.x, c.y + .5, c.z, mult > 1 ? `+${10 * mult}` : '+10');
  if (w.combo >= 5 && w.combo % 5 === 0) { sfx('combo'); popup(`COMBO x${mult + (w.combo % 5 === 0 && mult < 5 ? 1 : 0)}!`, P.pos.x, P.pos.y + 2.6, P.pos.z, 'big combo'); }
  pulseCoinHUD();
}
function updateEntities(dt) {
  const w = world; const pc = P.pos.y + .75;
  w.comboT -= dt; if (w.comboT <= 0 && w.combo) { w.combo = 0; }
  for (const c of w.coins) {
    if (c.taken) { if (c.t < .3) { c.t += dt; const k = c.t / .3; c.m.position.set(lerp(c.x, P.pos.x, k), lerp(c.y, P.pos.y + 1.6, k) + Math.sin(k * Math.PI) * .6, lerp(c.z, P.pos.z, k)); c.m.scale.setScalar(Math.max(.01, k < .3 ? 1 + k * 2 : 1.6 * (1 - k))); c.m.rotation.y += dt * 30; if (c.t >= .3) c.m.visible = false; } continue; }
    c.m.rotation.y += dt * 3; c.m.position.y = c.y + Math.sin(w.t * 3 + c.x) * .08;
    let dx = c.x - P.pos.x, dy = c.y - pc, dz = c.z - P.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 3.6 * 3.6 || c.mag) { // magnet
      c.mag = true; c.mv = Math.min(30, (c.mv || 4) + dt * 40);
      const d = Math.sqrt(d2) || 1, step = Math.min(d, c.mv * dt);
      c.x -= dx / d * step; c.y -= dy / d * step; c.z -= dz / d * step; c.m.position.set(c.x, c.y, c.z); c.m.rotation.y += dt * 12;
      dx = c.x - P.pos.x; dy = c.y - pc; dz = c.z - P.pos.z;
    }
    if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(dy) < 2.0) collectCoin(c);
  }
  for (const cp of w.checkpoints) {
    if (cp.on) { cp.flag.rotation.y = Math.sin(w.t * 4) * .25; cp.orb.rotation.y += dt * 3; continue; }
    if (Math.hypot(cp.x - P.pos.x, cp.z - P.pos.z) < 1.6 && Math.abs(cp.y - P.pos.y) < 2.2) {
      cp.on = true; cp.flag.material = M(0x34d058, { emissive: 0x22aa44, emissiveIntensity: .8 }); cp.orb.material = M(0x7dff9a, { emissive: 0x33ff77, emissiveIntensity: 2 });
      P.respawn.set(cp.x, cp.y, cp.z); sfx('check'); toast('Checkpoint!'); burst(cp.x, cp.y + 2, cp.z, 0x34d058, 14, 5); addScore(50, cp.x, cp.y + 2.8, cp.z);
    }
  }
  for (const e of w.enemies) {
    if (!e.alive) { if (e.dieT < .5) { e.dieT += dt; e.g.scale.set(1 + e.dieT * 2, Math.max(.05, 1 - e.dieT * 3), 1 + e.dieT * 2); if (e.dieT >= .5) e.g.visible = false; } continue; }
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    e.t += dt * e.speed / len * e.dir; if (e.t > 1) { e.t = 1; e.dir = -1; } if (e.t < 0) { e.t = 0; e.dir = 1; }
    e.x = lerp(e.a[0], e.b[0], e.t); e.z = lerp(e.a[1], e.b[1], e.t);
    const hx = (e.b[0] - e.a[0]) * e.dir, hz = (e.b[1] - e.a[1]) * e.dir;
    e.g.position.set(e.x, e.y + Math.abs(Math.sin(w.t * 9)) * .14, e.z); e.g.rotation.y = Math.atan2(-hx, -hz);
    e.body.scale.set(.58 - Math.sin(w.t * 18) * .03, .5 + Math.sin(w.t * 18) * .05, .58);
    const dx = P.pos.x - e.x, dz = P.pos.z - e.z, dh = Math.hypot(dx, dz), dy = P.pos.y - e.y;
    if ((P.attackT > 0 && dh < 2.0 && Math.abs(dy) < 1.6) || (P.dashT > 0 && dh < 1.3 && Math.abs(dy) < 1.4)) defeat(e, P.dashT > 0 ? 'dash' : 'spin');
    else if (dh < .85 && dy > -.8 && dy < 1.2) {
      if (P.vel.y < 0 && dy > .45) { defeat(e, 'stomp'); P.vel.y = 11; P.airJumps = 1; P.airDash = 1; P.sqV += 6; }
      else hurt(e.x, e.z);
    }
  }
  const g = w.goal;
  g.torus.rotation.z += dt * 1.5; g.swirl.rotation.z -= dt * 3;
  g.portalMat.color.setHSL((w.t * .15) % 1, .85, .62);
  g.sparks.forEach((s, i) => { const a = w.t * 2 + i / g.sparks.length * TAU; s.position.set(Math.cos(a) * 1.5, 1.75 + Math.sin(a * 1.3) * .6, Math.sin(a) * .4); s.rotation.y += dt * 4; });
  if (!w.done && Math.hypot(g.x - P.pos.x, g.z - P.pos.z) < 1.4 && Math.abs(g.y - P.pos.y) < 2.2) winLevel();
}
function defeat(e, how) {
  e.alive = false; e.dieT = 0; world.got += 3; world.foes++; sfx('bonk'); shake(.15); hitstop = .06;
  burst(e.x, e.y + .6, e.z, 0xc39bd3, 12, 6); burst(e.x, e.y + 1, e.z, 0xffd23f, 8, 4); puff(e.x, e.y + .3, e.z, 0xffffff, 8, 3, .25, .4);
  addScore(100, e.x, e.y + 1.8, e.z, how === 'stomp' ? 'STOMP! +100' : how === 'dash' ? 'DASH! +100' : 'BONK! +100');
}
let hitstop = 0;

// ---------------------------------------------------------------- hero animation, camera
const tmpV = new THREE.Vector3();
function animateHero(dt, t) {
  const g = hero.group; g.position.copy(P.pos);
  const spd = Math.hypot(P.vel.x, P.vel.z), run = Math.min(1, spd / SPEED);
  let rotY = P.facing; if (P.attackT > 0) rotY += (1 - P.attackT / .38) * TAU;
  g.rotation.y = rotY;
  g.visible = !(P.invuln > 0 && Math.floor(t * 16) % 2 === 0 && mode === 'play');
  // squash & stretch spring (feet anchored)
  P.sqV += (1 - P.sq) * 180 * dt; P.sqV *= Math.exp(-dt * 11); P.sq += P.sqV * dt; P.sq = clamp(P.sq, .6, 1.45);
  const airStretch = !P.grounded && !P.climbing ? clamp(1 + Math.abs(P.vel.y) * .008, 1, 1.12) : 1;
  const sy = P.sq * airStretch; hero.rig.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
  // flips (double jump) / roll (dash)
  if (P.flipT > 0) hero.pivot.rotation.x = -(1 - P.flipT / .42) * TAU;
  else if (P.dashT > 0 && P.grounded) hero.pivot.rotation.x = -(1 - P.dashT / DASH_T) * TAU;
  else hero.pivot.rotation.x = 0;
  P.lean = lerp(P.lean, P.dashT > 0 ? .5 : run * .22, Math.min(1, dt * 10));
  hero.torso.rotation.x = -P.lean;
  const A = hero, L = A.legL, Rr = A.legR, aL = A.armL, aR = A.armR;
  const set = (o, x, z) => { o.rotation.x = lerp(o.rotation.x, x, Math.min(1, dt * 18)); o.rotation.z = lerp(o.rotation.z, z || 0, Math.min(1, dt * 18)); };
  if (P.climbing) {
    const s = Math.sin(t * 12);
    set(aL.sh, -2.7 + s * .4, -.2); set(aR.sh, -2.7 - s * .4, .2); set(aL.el, -.3); set(aR.el, -.3);
    set(L.sh, -.5 + s * .5); set(Rr.sh, -.5 - s * .5); set(L.el, .8); set(Rr.el, .8);
    hero.root.position.y = -.8;
  } else if (P.dashT > 0) {
    set(aL.sh, .9, -.5); set(aR.sh, .9, .5); set(aL.el, -.2); set(aR.el, -.2); set(L.sh, -.9); set(Rr.sh, .4); set(L.el, 1.4); set(Rr.el, .4);
  } else if (!P.grounded) {
    const up = P.vel.y > 0;
    set(aL.sh, up ? -2.6 : -1.6, -.4); set(aR.sh, up ? -2.6 : -1.6, .4); set(aL.el, -.4); set(aR.el, -.4);
    set(L.sh, up ? -1.0 : -.3); set(Rr.sh, up ? .25 : .1); set(L.el, up ? 1.5 : .5); set(Rr.el, up ? .4 : .3);
  } else if (spd > .5) {
    P.walk += dt * spd * 1.55; const s = Math.sin(P.walk) * run, c = Math.cos(P.walk);
    L.sh.rotation.x = s * 1.05; Rr.sh.rotation.x = -s * 1.05;
    L.el.rotation.x = Math.max(0, -Math.sin(P.walk - .9)) * 1.5 * run + .1; Rr.el.rotation.x = Math.max(0, Math.sin(P.walk - .9)) * 1.5 * run + .1;
    aL.sh.rotation.set(-s * 1.0, 0, -.12); aR.sh.rotation.set(s * 1.0, 0, .12); aL.el.rotation.x = -.7 - run * .4; aR.el.rotation.x = -.7 - run * .4;
    hero.torso.position.y = .62 + Math.abs(c) * .07 * run; hero.torso.rotation.y = s * .18;
  } else {
    const b = Math.sin(t * 2.4) * .06;
    set(L.sh, 0); set(Rr.sh, 0); set(L.el, .05); set(Rr.el, .05); set(aL.sh, b, -.15); set(aR.sh, -b, .15); set(aL.el, -.25); set(aR.el, -.25);
    hero.torso.position.y = .62 + Math.sin(t * 2.4) * .015; hero.torso.rotation.y = lerp(hero.torso.rotation.y, 0, dt * 8);
  }
  if (P.attackT > 0) { aL.sh.rotation.set(0, 0, -1.5); aR.sh.rotation.set(0, 0, 1.5); aL.el.rotation.x = 0; aR.el.rotation.x = 0; }
  hero.head.rotation.x = P.grounded ? -P.lean * .5 : clamp(-P.vel.y * .02, -.25, .25);
  hero.scarfA.rotation.x = .4 + Math.min(1.2, spd * .13) + Math.sin(t * 11) * .12; hero.scarfB.rotation.x = .2 + Math.sin(t * 11 + 1) * .25 + Math.min(.6, spd * .05);
  const blink = (t % 3.7) < .12 ? .1 : 1; for (const e of hero.eyes) e.scale.y = blink;
  if (spinRing.material.opacity > 0) { spinRing.material.opacity = Math.max(0, spinRing.material.opacity - dt * 2.5); spinRing.scale.multiplyScalar(1 + dt * 5); spinRing.position.set(P.pos.x, P.pos.y + .7, P.pos.z); }
  // dash afterimages
  if (P.dashT > 0 && trailT <= 0) { trailT = .035; const d = dashTrail.find((q) => q.life <= 0) || dashTrail[0]; d.life = .25; d.m.visible = true; d.m.position.set(P.pos.x, P.pos.y + .8, P.pos.z); }
  for (const d of dashTrail) if (d.life > 0) { d.life -= dt; d.m.material.opacity = Math.max(0, d.life * 2); if (d.life <= 0) d.m.visible = false; }
  let syy = -999;
  for (const b of world.colliders) if (P.pos.x > b.minX && P.pos.x < b.maxX && P.pos.z > b.minZ && P.pos.z < b.maxZ && b.maxY <= P.pos.y + .05 && b.maxY > syy) syy = b.maxY;
  heroShadow.visible = syy > -999 && tier === 0;
  if (heroShadow.visible) { const hgt = P.pos.y - syy; heroShadow.position.set(P.pos.x, syy + .045, P.pos.z); heroShadow.scale.setScalar(clamp(1.3 - hgt * .08, .5, 1.3)); heroShadow.material.opacity = clamp(.3 - hgt * .02, .08, .3); }
}
function camTarget(out) {
  const cp = Math.cos(camPitch);
  return out.set(P.pos.x + Math.sin(camYaw) * cp * camDist, P.pos.y + 1.2 + Math.sin(camPitch) * camDist, P.pos.z + Math.cos(camYaw) * cp * camDist);
}
const lookAt = new THREE.Vector3();
function snapCamera() { camTarget(camera.position); lookAt.set(P.pos.x, P.pos.y + 1.3, P.pos.z); camera.lookAt(lookAt); }
function updateCamera(dt) {
  if (input.camKeys) camYaw += input.camKeys * dt * 2.2;
  camTarget(tmpV);
  camera.position.lerp(tmpV, 1 - Math.exp(-dt * 9));
  lookAt.lerp(tmpV.set(P.pos.x, P.pos.y + 1.3, P.pos.z), 1 - Math.exp(-dt * 14));
  camera.lookAt(lookAt);
  if (shakeAmt > .001) { camera.position.x += (Math.random() - .5) * shakeAmt; camera.position.y += (Math.random() - .5) * shakeAmt; camera.rotation.z += (Math.random() - .5) * shakeAmt * .15; shakeAmt *= Math.exp(-dt * 9); }
  const tf = baseFov + (P.dashT > 0 ? 7 : 0) + Math.min(4, Math.hypot(P.vel.x, P.vel.z) * .3);
  if (Math.abs(camera.fov - tf) > .05) { camera.fov = lerp(camera.fov, tf, Math.min(1, dt * 8)); camera.updateProjectionMatrix(); }
}
function placeSky() {
  sky.position.copy(camera.position);
  sunDisc.position.set(camera.position.x + 140, camera.position.y + 150, camera.position.z - 260); sunDisc.lookAt(camera.position);
  // shadow camera follows the hero (texel-snapped to avoid shimmer)
  const s = 44 / sunLight.shadow.mapSize.x;
  const tx = Math.round(P.pos.x / s) * s, tz = Math.round(P.pos.z / s) * s;
  sunLight.target.position.set(tx, P.pos.y, tz); sunLight.position.set(tx + 18, P.pos.y + 30, tz + 12);
}

// ---------------------------------------------------------------- UI
const screens = ['splash', 'home', 'levels', 'howto', 'pause', 'win'];
let mode = 'splash';
function show(id) { for (const s of screens) $(s).classList.toggle('show', s === id); }
function setPlayUI(on) { if (!on) { $('hint').classList.remove('on'); $('toast').classList.remove('on'); for (const p of pops) { p.life = 0; p.d.style.display = 'none'; } } $('hud').classList.toggle('hidden', !on); $('touch').classList.toggle('hidden', !(on && isTouch)); }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 1100); }
let hintTimer = 0;
function hint(msg, ms) { const el = $('hint'); el.textContent = msg; el.classList.add('on'); clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove('on'), ms || 5000); }
let hudCache = '';
function pulseCoinHUD() { const el = $('hudCoins').parentElement; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
function updateHUD(force) {
  if (!world) return;
  const s = `${world.got}/${world.total}|${P.hearts}|${world.score}`;
  if (s === hudCache && !force) return; hudCache = s;
  $('hudCoins').textContent = `${world.got}/${world.total}`;
  $('hudScore').textContent = world.score;
  $('hudHearts').innerHTML = [0, 1, 2].map((i) => `<span class="${i < P.hearts ? '' : 'off'}">♥</span>`).join('');
  $('hudLevel').textContent = `1-${world.idx + 1} ${world.L.name}`;
}
function refreshHome() {
  $('walletTxt').textContent = save.wallet; $('starTxt').textContent = `${totalStars()}/15`;
  $('btnSound').textContent = `Sound: ${save.settings.sound ? 'On' : 'Off'}`;
}
function buildLevelGrid() {
  const grid = $('levelGrid'); grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const locked = i + 1 > save.unlocked; const st = (save.levels[i + 1] || {}).stars || 0;
    const b = document.createElement('button'); b.className = 'lvlTile' + (locked ? ' locked' : '');
    b.innerHTML = `<span class="n">${locked ? '🔒' : i + 1}</span><span class="nm">${L.name}</span><span class="st">${[0, 1, 2].map((k) => k < st ? '★' : '<i>★</i>').join('')}</span>`;
    b.addEventListener('click', () => { if (locked) { sfx('deny'); return; } sfx('click'); startLevel(i); });
    grid.appendChild(b);
  });
}
function goHome() { mode = 'menu'; setPlayUI(false); refreshHome(); show('home'); menuBackdrop(); }
function goLevels() { mode = 'menu'; setPlayUI(false); buildLevelGrid(); show('levels'); menuBackdrop(); }
function menuBackdrop() { const i = Math.min(save.unlocked, LEVELS.length) - 1; if (!world || world.idx !== i || world.t > 0) loadLevel(i); }
function startLevel(i) {
  loadLevel(i); mode = 'play'; show(null); setPlayUI(true); hint(LEVELS[i].hint, 6500); toast(`1-${i + 1} ${LEVELS[i].name}`);
  playMusic({ root: 60, scale: 'major', bpm: 132, seed: 7 + i, mood: 'bright' });
}
function pauseGame() { if (mode !== 'play') return; mode = 'paused'; show('pause'); }
function resumeGame() { if (mode !== 'paused') return; mode = 'play'; show(null); }
function winLevel() {
  const w = world; w.done = true; mode = 'win'; sfx('win'); shake(.12);
  const frac = w.got / w.total;
  const stars = 1 + (frac >= .6 ? 1 : 0) + (w.got >= w.total ? 1 : 0);
  const n = w.idx + 1; const prev = save.levels[n] || {};
  const full = Math.round(50 + (w.L.maxReward - 50) * frac);
  const reward = prev.clears ? Math.max(10, Math.round(full * .2)) : full; // replays pay 20% (anti-farming)
  save.levels[n] = { stars: Math.max(prev.stars || 0, stars), best: Math.max(prev.best || 0, w.got), score: Math.max(prev.score || 0, w.score), clears: (prev.clears || 0) + 1 };
  save.wallet += reward; save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, n + 1)); writeSave();
  $('winTitle').textContent = n === LEVELS.length ? 'Valley Conquered!' : 'Level Clear!';
  $('winCoins').textContent = `${w.got}/${w.total}`; $('winFoes').textContent = w.foes; $('winScore').textContent = w.score + (w.score > (prev.score || 0) && prev.score ? ' (best!)' : '');
  $('winReward').textContent = `+${reward}` + (prev.clears ? ' (replay)' : '');
  const spans = $('winStars').children; for (let k = 0; k < 3; k++) { spans[k].classList.remove('on'); if (k < stars) setTimeout(() => spans[k].classList.add('on'), 250 + k * 280); }
  $('btnNext').textContent = n < LEVELS.length ? 'Next level ▶' : 'Back to levels';
  setPlayUI(false); setTimeout(() => show('win'), 450);
  for (let i = 0; i < 3; i++) setTimeout(() => burst(w.goal.x + (Math.random() - .5) * 3, w.goal.y + 2 + Math.random() * 2, w.goal.z, [0xff5fa2, 0xffd23f, 0x5cf0ff][i], 24, 7), i * 160);
}

$('btnPlay').onclick = () => { sfx('click'); let i = 0; while (i < LEVELS.length - 1 && i + 1 < save.unlocked && save.levels[i + 1]) i++; startLevel(Math.min(i, save.unlocked - 1)); };
$('btnLevels').onclick = () => { sfx('click'); goLevels(); };
$('btnHow').onclick = () => { sfx('click'); show('howto'); };
$('btnHowBack').onclick = () => { sfx('click'); show('home'); };
$('btnSound').onclick = () => { save.settings.sound = !save.settings.sound; writeSave(); syncAudio(); refreshHome(); sfx('click'); };
$('btnLevelsBack').onclick = () => { sfx('click'); goHome(); };
$('btnPause').onclick = () => { sfx('click'); pauseGame(); };
$('btnResume').onclick = () => { sfx('click'); resumeGame(); };
$('btnRetry').onclick = () => { sfx('click'); startLevel(world.idx); };
$('btnPauseLevels').onclick = () => { sfx('click'); goLevels(); };
$('btnPauseHome').onclick = () => { sfx('click'); goHome(); };
$('btnNext').onclick = () => { sfx('click'); if (world.idx + 1 < LEVELS.length) startLevel(world.idx + 1); else goLevels(); };
$('btnWinRetry').onclick = () => { sfx('click'); startLevel(world.idx); };
$('btnWinLevels').onclick = () => { sfx('click'); goLevels(); };
$('splash').addEventListener('click', () => {
  if (mode !== 'splash' || !ready) return; audio(); sfx('click');
  playMusic({ root: 62, scale: 'major', bpm: 124, seed: 3, mood: 'bright' });
  if (isTouch && document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } }).catch(() => {}); }
  goHome();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// ---------------------------------------------------------------- input
const keys = new Set();
function syncKeys() {
  input.kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  input.ky = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  input.camKeys = (keys.has('KeyZ') ? 1 : 0) - (keys.has('KeyX') ? 1 : 0);
}
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code); syncKeys();
  if (e.code === 'Space') { input.jumpPressed = true; input.jumpHeld = true; }
  if (e.code === 'KeyE' || e.code === 'KeyJ') input.actionPressed = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') input.dashPressed = true;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') pauseGame(); else if (mode === 'paused') resumeGame(); }
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'splash' && ready) $('splash').click();
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); syncKeys(); if (e.code === 'Space') input.jumpHeld = false; });
window.addEventListener('blur', () => { keys.clear(); syncKeys(); input.jumpHeld = false; });

const joyBase = $('joyBase'), joyKnob = $('joyKnob');
const JOY_R = 55; let joyId = null, joyCx = 0, joyCy = 0; const camPtrs = new Map();
function joyHome() { joyBase.style.left = '110px'; joyBase.style.top = (window.innerHeight - 110) + 'px'; joyBase.style.bottom = 'auto'; joyKnob.style.transform = ''; }
joyHome(); window.addEventListener('resize', joyHome);
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play') return;
  if (e.pointerType !== 'mouse' && e.clientX < window.innerWidth * .45 && joyId === null) {
    joyId = e.pointerId; joyCx = e.clientX; joyCy = e.clientY;
    joyBase.style.left = joyCx + 'px'; joyBase.style.top = joyCy + 'px'; joyBase.style.opacity = '1';
  } else camPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId === joyId) {
    let dx = e.clientX - joyCx, dy = e.clientY - joyCy; const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
    joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
    const m = Math.min(1, d / JOY_R), dead = .12, mag = m < dead ? 0 : (m - dead) / (1 - dead), inv = 1 / Math.max(d, 1);
    input.jx = dx * inv * mag; input.jy = -dy * inv * mag;
  } else if (camPtrs.has(e.pointerId)) {
    const p = camPtrs.get(e.pointerId);
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { p.x = e.clientX; p.y = e.clientY; return; }
    camYaw -= (e.clientX - p.x) * .006; camPitch = clamp(camPitch + (e.clientY - p.y) * .004, .08, 1.0);
    p.x = e.clientX; p.y = e.clientY;
  }
});
function endPtr(e) {
  if (e.pointerId === joyId) { joyId = null; input.jx = 0; input.jy = 0; joyHome(); joyBase.style.opacity = ''; }
  camPtrs.delete(e.pointerId);
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
function holdButton(el, down, up) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); down(); });
  const rel = (e) => { e.preventDefault(); el.classList.remove('down'); if (up) up(); };
  el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel); el.addEventListener('pointerleave', rel);
}
holdButton($('btnJump'), () => { input.jumpPressed = true; input.jumpHeld = true; }, () => { input.jumpHeld = false; });
holdButton($('btnAction'), () => { input.actionPressed = true; });
holdButton($('btnDash'), () => { input.dashPressed = true; });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------------------------------------------------------- main loop
let last = performance.now(), ready = false, fpsAcc = 0, fpsN = 0, fps = 60;
function render() { if (composer) composer.render(); else renderer.render(scene, camera); }
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; if (dt > .05) dt = .05; if (dt <= 0) dt = .001;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { // auto quality: drop resolution, then effects, when a phone struggles
    fps = fpsN / fpsAcc;
    if (autoQ && fps < 40 && mode === 'play') {
      if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - .25); applyQuality(tier, true); }
      else if (tier > 0) applyQuality(tier - 1);
      else if (pixelRatio > .75) { pixelRatio -= .125; applyQuality(0, true); }
    }
    fpsAcc = 0; fpsN = 0;
  }
  const t = now / 1000;
  if (world) {
    let sdt = dt; if (hitstop > 0) { hitstop -= dt; sdt = dt * .1; }
    if (mode === 'play') { updateWorld(sdt); updatePlayer(sdt); updateEntities(sdt); updateCamera(dt); }
    else if (mode === 'win') { updateEntities(dt); P.facing += dt * 4; P.vel.set(0, 0, 0); updateCamera(dt); }
    else if (mode === 'menu' || mode === 'splash') {
      const a = t * .12;
      camera.position.set(P.pos.x + Math.sin(a) * 9, P.pos.y + 3.2, P.pos.z + Math.cos(a) * 9); camera.lookAt(P.pos.x, P.pos.y + 1.2, P.pos.z - 3);
      P.facing = Math.atan2(-(camera.position.x - P.pos.x), -(camera.position.z - P.pos.z)) + Math.PI;
      world.goal.torus.rotation.z += dt; for (const c of world.coins) c.m.rotation.y += dt * 3;
    }
    animateHero(dt, t); updateParts(dt); updatePops(dt);
    for (const c of bgGroup.children) if (c.userData.drift) c.position.x += dt * c.userData.drift;
  }
  placeSky();
  render();
}

// boot
try {
  pickQuality();
  loadLevel(Math.min(save.unlocked, LEVELS.length) - 1);
  ready = true; $('tapStart').textContent = isTouch ? 'Tap to start' : 'Click to start';
} catch (err) { $('tapStart').textContent = 'Could not start: ' + err.message; console.error(err); }
requestAnimationFrame(frame);

// test / debug hook (harmless in production)
window.__ups = {
  get mode() { return mode; }, get world() { return world; }, P, input, LEVELS, save, startLevel, goHome, goLevels, winLevel,
  get fps() { return fps; }, get tier() { return tier; }, get calls() { return renderer.info.render.calls; }, get tris() { return renderer.info.render.triangles; },
  teleport(x, y, z) { P.pos.set(x, y, z); P.vel.set(0, 0, 0); snapCamera(); },
  setMode(m) { mode = m; }, sim(dt) { updateWorld(dt); updatePlayer(dt); updateEntities(dt); }, applyQuality,
};
