// UPSTAGGLES – 3D adventure (Three.js). Original low-poly/PBR art built from primitives. No external assets.
import * as THREE from '../lib/three.min.js';
import { LEVELS } from './levels.js';
import { sfx, audio, vol, applyVolumes, playMusic } from './audio.js';
import { generateLevel, levelInfo, rewardFor } from './gen.js';
import { WORLDS, BOSSES, CHARACTERS, POWERUPS, DAILY } from './worlds.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- save
const SAVE_KEY = 'upstaggles.save.v2';
function defaults() { return { unlocked: 1, wallet: 0, levels: {}, char: 'hero', owned: ['hero'], inv: {}, daily: { last: '', streak: 0 }, settings: { sound: true, music: .55, sfx: .8, quality: 'auto', camSens: 1, showFps: false } }; }
function loadSave() {
  const d = defaults();
  try {
    let s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s) { const o = JSON.parse(localStorage.getItem('upstaggles.save.v1')); if (o && o.levels) s = { unlocked: o.unlocked, wallet: o.wallet, levels: o.levels, settings: { sound: o.sound !== false } }; }
    if (s && s.levels) { const r = Object.assign(d, s); r.settings = Object.assign(defaults().settings, s.settings || {}); r.inv = r.inv || {}; r.owned = r.owned || ['hero']; r.daily = r.daily || { last: '', streak: 0 }; return r; }
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
  const Q = { high: 2, medium: 1, low: 0, 2: 2, 1: 1, 0: 0 }[q]; applyQuality(Q !== undefined ? Q : (isTouch ? 1 : 2));
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
let hero = buildHero(); scene.add(hero.group);
function setHeroSkin(skin) { scene.remove(hero.group); hero.group.traverse((o) => { if (o.isMesh && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); }); hero = buildHero(skin); scene.add(hero.group); }
const heroLight = new THREE.PointLight(0xffe2b0, 0, 16, 1.4); scene.add(heroLight);
const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(.6, 1.4, 2), transparent: true, opacity: .22, depthWrite: false })); shieldBubble.visible = false; scene.add(shieldBubble);
const heroShadow = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false }));
heroShadow.renderOrder = 1; scene.add(heroShadow);
const spinRing = new THREE.Mesh(new THREE.TorusGeometry(1, .08, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.8, .6), transparent: true, opacity: 0, depthWrite: false }));
scene.add(spinRing);
const dashTrail = []; // afterimage ghosts
for (let i = 0; i < 5; i++) { const m = mesh(new THREE.CapsuleGeometry(.36, .7, 4, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 1.6, 1.5), transparent: true, opacity: 0, depthWrite: false }), scene); m.visible = false; dashTrail.push({ m, life: 0 }); }

// ---------------------------------------------------------------- particles (pooled): sparks (gravity) + puffs (dust/smoke, expand & fade)
const parts = [];
for (let i = 0; i < 200; i++) {
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

// ---------------------------------------------------------------- levels: 1–5 handcrafted, 6–250 generated (deterministic)
const TOTAL = 250;
const lvlCache = new Map();
function getLevel(i) {
  if (lvlCache.has(i)) return lvlCache.get(i);
  let L;
  if (i < LEVELS.length) L = Object.assign({ n: i + 1, world: 0, band: 0, phys: { grav: 1, jump: 1, speed: 1 }, killY: -14 }, LEVELS[i]);
  else L = generateLevel(i + 1);
  for (const k of ['hazards', 'zones', 'teleporters', 'switches', 'gates', 'arenas', 'walls', 'gems', 'links', 'trees', 'movers', 'vines', 'enemies', 'checkpoints']) L[k] = L[k] || [];
  if (lvlCache.size > 40) lvlCache.clear();
  lvlCache.set(i, L); return L;
}
const lvlLabel = (n) => `${Math.floor((n - 1) / 25) + 1}-${((n - 1) % 25) + 1}`;
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

// ---------------------------------------------------------------- world state & level building
let world = null;
const levelGroup = new THREE.Group(); scene.add(levelGroup);
const bgGroup = new THREE.Group(); scene.add(bgGroup);
// star field (child of the sky dome, so it follows the camera)
const starGeo = new THREE.BufferGeometry(); { const a = new Float32Array(900 * 3); const r = rng(99); for (let i = 0; i < 900; i++) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u); a.set([Math.cos(th) * s * 380, Math.abs(u) * 380 - 30, Math.sin(th) * s * 380], i * 3); } starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.6, 1.8), size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
sky.add(stars);

function buildBackground(L, W, rnd, cx, cz) {
  disposeGroup(bgGroup);
  const ft = W.floor.type, pr = W.props;
  const floorY = ft === 'lava' ? L.killY + 1.5 : ft === 'clouds' ? L.killY + 1 : Math.min(-26, L.killY - 12);
  if (ft === 'lava') mesh(new THREE.CircleGeometry(320, 40).rotateX(-Math.PI / 2), M(0xff4a10, { emissive: 0xff3000, emissiveIntensity: 1.1, flatShading: false, roughness: .5 }), bgGroup, cx, floorY, cz);
  else if (ft !== 'void' && ft !== 'space' && ft !== 'clouds') mesh(new THREE.CircleGeometry(320, 40).rotateX(-Math.PI / 2), M(W.floor.color), bgGroup, cx, floorY, cz);
  // keep scenery away from the playable path (long levels used to have towers/peaks right on the route)
  let ext = 0; for (const p of L.platforms) ext = Math.max(ext, Math.hypot(p.x - cx, p.z - cz));
  const clear = (x, z, m) => L.platforms.every((p) => Math.max(Math.abs(x - p.x) - p.w / 2, 0) ** 2 + Math.max(Math.abs(z - p.z) - p.d / 2, 0) ** 2 > m * m);
  const spot = (r0, r1, m) => { for (let t = 0; t < 20; t++) { const a = rnd() * TAU, r = r0 + rnd() * (r1 - r0 + ext * .7); const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (clear(x, z, m)) return [x, z]; } return null; };
  const ring = (n, r0, r1, fn, m = pr === 'city' ? 24 : 20) => { for (let i = 0; i < n; i++) { const q = spot(r0, r1, m); if (q) fn(q[0], q[1], i); } };
  if (ft === 'clouds' || pr === 'sky') for (let i = 0; i < 46; i++) { const q = spot(8, 150, 9); if (!q) continue; const s = 6 + rnd() * 10; mesh(G.ico1, M(0xffffff, { roughness: 1 }), bgGroup, q[0], floorY - 2 + rnd() * 3, q[1], s, s * .45, s); }
  const hc = W.hills;
  if (pr === 'valley') {
    mesh(new THREE.CircleGeometry(40, 24).rotateX(-Math.PI / 2), M(0x4cb8ff, { flatShading: false, roughness: .15, metalness: .1 }), bgGroup, cx + 30, floorY + .05, cz - 10);
    ring(28, 75, 155, (x, z, i) => { const hg = 14 + rnd() * 38, w = 22 + rnd() * 30; const m = mesh(G.cone7, M(hc[i % 4]), bgGroup, x, floorY + hg / 2, z, w, hg, w); m.rotation.y = rnd() * TAU; if (hg > 38) mesh(G.cone7, M(0xffffff), bgGroup, x, floorY + hg * .86, z, w * .29, hg * .28, w * .29).rotation.y = m.rotation.y; });
  } else if (pr === 'forest') {
    ring(46, 45, 150, (x, z, i) => { const hg = 30 + rnd() * 35, s = 3 + rnd() * 3; mesh(G.cyl8, M(0x4a3220), bgGroup, x, floorY + hg * .3, z, s, hg * .6, s); for (let k = 0; k < 3; k++) mesh(G.cone7, M(hc[(i + k) % 4]), bgGroup, x, floorY + hg * (.45 + k * .2), z, s * (6 - k * 1.5), hg * .35, s * (6 - k * 1.5)); });
  } else if (pr === 'desert') {
    ring(30, 60, 160, (x, z, i) => { const s = 18 + rnd() * 30; mesh(G.sphS, M(hc[i % 4]), bgGroup, x, floorY, z, s, s * .35, s * 1.4).rotation.y = rnd() * TAU; });
    for (let i = 0; i < 3; i++) { const a = -1.2 + i * .9 + rnd() * .3, r = 110 + rnd() * 40, hg = 40 + rnd() * 25; if (!clear(cx + Math.sin(a) * r, cz - Math.cos(a) * r, hg)) continue; const m = mesh(new THREE.ConeGeometry(.5, 1, 4), M(0xe8c070), bgGroup, cx + Math.sin(a) * r, floorY + hg / 2, cz - Math.cos(a) * r, hg * 1.5, hg, hg * 1.5); m.rotation.y = Math.PI / 4; }
  } else if (pr === 'snow') {
    ring(26, 70, 160, (x, z, i) => { const hg = 30 + rnd() * 60, w = 26 + rnd() * 30; const m = mesh(G.cone7, M(0x7a8fb0), bgGroup, x, floorY + hg / 2, z, w, hg, w); m.rotation.y = rnd() * TAU; mesh(G.cone7, M(0xf8fbff), bgGroup, x, floorY + hg * .78, z, w * .46, hg * .45, w * .46).rotation.y = m.rotation.y; });
  } else if (pr === 'volcano') {
    let vx = cx - 40, vz = cz - 150; if (!clear(vx, vz, 60)) { const q = spot(150, 220, 60); if (q) [vx, vz] = q; } mesh(new THREE.CylinderGeometry(9, 55, 70, 10), M(0x3a2626), bgGroup, vx, floorY + 35, vz);
    mesh(new THREE.CylinderGeometry(8, 8, 1, 10), M(0xff6a10, { emissive: 0xff4a00, emissiveIntensity: 2 }), bgGroup, vx, floorY + 70.2, vz);
    for (let i = 0; i < 8; i++) mesh(G.ico1, M(0x5a4a4a, { roughness: 1 }), bgGroup, vx + (rnd() - .5) * 10, floorY + 76 + i * 5, vz + (rnd() - .5) * 6, 5 + i * 1.4);
    ring(20, 60, 150, (x, z, i) => { const s = 8 + rnd() * 14; mesh(G.ico0, M(hc[i % 4]), bgGroup, x, floorY + s * .3, z, s, s * .8, s).rotation.y = rnd() * 3; });
  } else if (pr === 'city') {
    ring(60, 40, 160, (x, z, i) => { const hg = 30 + rnd() * 90, w = 8 + rnd() * 12; mesh(G.box, M(hc[i % 4]), bgGroup, x, floorY + hg / 2, z, w, hg, w);
      const wc = [0x00f0ff, 0xff4ad8, 0xffd23f][i % 3]; for (let y = 6; y < hg - 2; y += 7) mesh(G.box, M(wc, { emissive: wc, emissiveIntensity: 1.4 }), bgGroup, x, floorY + y, z, w + .3, .5, w + .3); });
  } else if (pr === 'ocean') {
    ring(40, 30, 140, (x, z, i) => { if (i % 2) { const hg = 20 + rnd() * 30; mesh(G.cone5, M(0x2a8a5a), bgGroup, x, floorY + hg / 2, z, 1.5, hg, 1.5); } else { const s = 6 + rnd() * 12; mesh(G.ico0, M(hc[i % 4]), bgGroup, x, floorY + s * .3, z, s, s * .7, s); } });
    for (let i = 0; i < 6; i++) { const m = mesh(new THREE.PlaneGeometry(6, 120), new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide, fog: false }), bgGroup, cx + (rnd() - .5) * 80, 20, cz - 20 - rnd() * 60); m.rotation.z = .35; m.userData.keep = true; }
  } else if (pr === 'sky') {
    ring(12, 50, 140, (x, z, i) => { const s = 5 + rnd() * 8, y = 4 + rnd() * 30; mesh(G.cone7, M(0x8a6a4a), bgGroup, x, y - s * .7, z, s * 2, s * 1.6, s * 2).rotation.x = Math.PI; mesh(G.cyl8, M(0x9ae07a), bgGroup, x, y, z, s * 2.1, .8, s * 2.1); });
  } else if (pr === 'castle') {
    ring(18, 50, 140, (x, z, i) => { const hg = 30 + rnd() * 50, s = 5 + rnd() * 5; mesh(G.cyl8, M(hc[i % 4]), bgGroup, x, floorY + hg / 2 + 10, z, s, hg, s); mesh(G.cone7, M(0x3a2050), bgGroup, x, floorY + hg + 10 + s * .8, z, s * 1.3, s * 1.8, s * 1.3);
      if (i % 3 === 0) mesh(G.box, M(0xffc04a, { emissive: 0xffa020, emissiveIntensity: 1.6 }), bgGroup, x, floorY + hg * .7 + 10, z, s + .2, 1.2, .6); });
    const moon = mesh(new THREE.CircleGeometry(14, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.7), fog: false }), bgGroup, cx - 60, 90, cz - 220); moon.lookAt(cx, 0, cz); moon.userData.keep = true;
  } else if (pr === 'space') {
    for (let i = 0; i < 6; i++) { const a = rnd() * TAU, r = 120 + rnd() * 80, s = 6 + rnd() * 18, y = -20 + rnd() * 70, c = hc[i % 4]; mesh(G.sphS, M(c, { flatShading: false, emissive: c, emissiveIntensity: .25 }), bgGroup, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, s);
      if (i % 2 === 0) { const rg = mesh(new THREE.RingGeometry(s * 1.4, s * 2, 32), M(0xffd0ff, { side: THREE.DoubleSide, emissive: 0x8a4aff, emissiveIntensity: .4 }), bgGroup, cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); rg.rotation.x = 1.2; } }
  }
  if (['valley', 'forest', 'desert', 'snow'].includes(pr)) for (let i = 0; i < 16; i++) {
    const q = spot(30, 120, 14); if (!q) continue; const cl = new THREE.Group();
    cl.position.set(q[0], 16 + rnd() * 24, q[1]);
    for (let j = 0; j < 5; j++) mesh(G.ico1, M(0xffffff, { roughness: 1 }), cl, (j - 2) * 2.2, rnd() * 1.2, rnd() * 1.5, 1.8 + rnd() * 1.6, (1.8 + rnd()) * .8, 1.8 + rnd() * 1.6);
    cl.userData.drift = .5 + rnd(); bgGroup.add(cl);
  }
}

function addProp(parent, x, y, z, W, rnd) {
  const s = .8 + rnd() * .5; const t = new THREE.Group(); t.userData.static = true; t.position.set(x, y, z); parent.add(t); t.rotation.y = rnd() * TAU;
  const pr = W.props;
  if (pr === 'valley' || pr === 'forest' || pr === 'sky') {
    const cols = pr === 'forest' ? [0x2f7a3a, 0x3d8a45, 0x255c33, 0x4fae3a] : pr === 'sky' ? [0xffb0d8, 0xffd0ec, 0xb0e0ff, 0xffffff] : [0x3fae4a, 0x52c45a, 0x2f9e57, 0x6fcf4f];
    const k = pr === 'forest' ? 1.5 : 1;
    mesh(G.cyl8, M(0x8a5a33), t, 0, .6 * s * k, 0, .3 * s, 1.2 * s * k, .3 * s);
    if (pr === 'forest' || rnd() < .5) { mesh(G.cone7, M(cols[(rnd() * 4) | 0]), t, 0, 1.9 * s * k, 0, 1.8 * s, 1.8 * s * k, 1.8 * s); mesh(G.cone7, M(cols[(rnd() * 4) | 0]), t, 0, 2.7 * s * k, 0, 1.3 * s, 1.4 * s * k, 1.3 * s); }
    else { mesh(G.ico1, M(cols[(rnd() * 4) | 0]), t, 0, 2.0 * s, 0, .95 * s); mesh(G.ico1, M(cols[(rnd() * 4) | 0]), t, .3 * s, 2.6 * s, .1, .6 * s); }
  } else if (pr === 'desert') {
    const c = M(0x4a9a4a); mesh(G.cyl8, c, t, 0, 1 * s, 0, .45 * s, 2 * s, .45 * s); mesh(G.sphS, c, t, 0, 2 * s, 0, .22 * s);
    for (const d of [-1, 1]) { mesh(G.cyl8, c, t, d * .45 * s, 1.1 * s, 0, .6 * s, .25 * s, .25 * s).rotation.z = Math.PI / 2; mesh(G.cyl8, c, t, d * .7 * s, 1.45 * s, 0, .25 * s, .7 * s, .25 * s); }
  } else if (pr === 'snow') {
    mesh(G.cyl8, M(0x6a4a2e), t, 0, .4 * s, 0, .25 * s, .8 * s, .25 * s);
    for (let k = 0; k < 3; k++) { mesh(G.cone7, M(0x2f6a4a), t, 0, (1.2 + k * .7) * s, 0, (1.9 - k * .5) * s, 1.2 * s, (1.9 - k * .5) * s); mesh(G.cone7, M(0xf8fbff), t, 0, (1.45 + k * .7) * s, 0, (1.2 - k * .35) * s, .6 * s, (1.2 - k * .35) * s); }
  } else if (pr === 'volcano') {
    mesh(G.ico0, M(0x2a2020), t, 0, .5 * s, 0, .9 * s, .8 * s, .8 * s); mesh(G.oct, M(0xff6a10, { emissive: 0xff4a00, emissiveIntensity: 2.2 }), t, .1, .95 * s, 0, .3 * s);
  } else if (pr === 'city') {
    mesh(G.cyl8, M(0x3a3f5a, { metalness: .6, roughness: .4 }), t, 0, 1.5, 0, .12, 3, .12); const c = [0x00f0ff, 0xff4ad8][(rnd() * 2) | 0];
    mesh(G.box, M(c, { emissive: c, emissiveIntensity: 2 }), t, 0, 3, 0, 1.1, .5, .12);
  } else if (pr === 'ocean') {
    for (let k = 0; k < 4; k++) { const m = mesh(G.cone5, M([0x2a9a5a, 0x3ab86a][k % 2]), t, (rnd() - .5) * .8, 1.2 * s, (rnd() - .5) * .8, .3, 2.4 * s, .3); m.rotation.z = (rnd() - .5) * .3; }
    mesh(G.sphS, M(0xff7ab8, { flatShading: false }), t, .5, .15, .3, .25, .15, .25);
  } else if (pr === 'castle') {
    mesh(G.cyl8, M(0x3a3a48), t, 0, .8, 0, .16, 1.6, .16); mesh(G.cone7, M(0xffa030, { emissive: 0xff8020, emissiveIntensity: 3 }), t, 0, 1.85, 0, .25, .5, .25);
  } else {
    for (let k = 0; k < 4; k++) { const c = [0xff5ad8, 0x8a7aff, 0x3affc8][k % 3]; const m = mesh(G.oct, M(c, { emissive: c, emissiveIntensity: 1.3 }), t, (rnd() - .5), .6 + rnd() * .5, (rnd() - .5), .25, .7 + rnd() * .5, .25); m.rotation.z = (rnd() - .5) * .6; }
  }
}

function shadowAll(o) { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; }
function platformColors(kind, W) {
  switch (kind) {
    case 'stone': return [W.stone, shade(W.stone, .72)];
    case 'temple': return [0xe8c88a, 0xc99c5a];
    case 'castle': return [0x5a5a70, 0x2a2a38];
    case 'arena': return [W.stone, shade(W.body, .9)];
    case 'coral': return [0x3ac8a8, 0x2a6a7a];
    case 'sand': return [0xf2c46b, 0xc98d4a];
    case 'metal': return [0x5a6080, 0x23263a];
    case 'ice': return [0xcdefff, 0x8fb0d8];
    case 'crumble': return [shade(W.stone, .85), shade(W.body, .75)];
    case 'conveyor': return [0x2a2a34, 0x3a3f5a];
    case 'stoneblock': return [0xd9b98a, 0xa88a5a];
    default: return [W.top, W.body];
  }
}
function decorTop(g, p, W, rnd) {
  const area = p.w * p.d, n = Math.min(14, Math.floor(area / 5)), pr = W.props;
  for (let i = 0; i < n; i++) {
    const fx = (rnd() - .5) * (p.w - .6), fz = (rnd() - .5) * (p.d - .6);
    if (pr === 'valley' || pr === 'forest' || pr === 'sky') {
      const fc = pr === 'forest' ? [0xffe066, 0xff8a3d, 0xb6ff5c] : [0xff5fa2, 0xffe14d, 0xffffff, 0xb07cff, 0xff8a3d];
      if (rnd() < .5) { mesh(G.cyl8, M(0x3f9e3a), g, fx, .1, fz, .03, .2, .03); mesh(G.ico0, M(fc[(rnd() * fc.length) | 0]), g, fx, .22, fz, .1); }
      else mesh(G.cone5, M(shade(W.top, .8)), g, fx, .15, fz, .14, .3, .14);
    } else if (pr === 'desert') { if (rnd() < .5) mesh(G.ico0, M(0xc9a060), g, fx, .06, fz, .15, .1, .12); }
    else if (pr === 'snow') { if (rnd() < .5) mesh(G.ico1, M(0xffffff), g, fx, .02, fz, .3, .14, .3); }
    else if (pr === 'volcano') { if (rnd() < .4) mesh(G.box, M(0xff5a10, { emissive: 0xff3a00, emissiveIntensity: 1.6 }), g, fx, .01, fz, .08, .04, .7).rotation.y = rnd() * 3; }
    else if (pr === 'ocean') { if (rnd() < .5) mesh(G.cone5, M(0x2a9a5a), g, fx, .3, fz, .12, .6, .12); else if (rnd() < .3) mesh(G.sphS, M(0xffd0ec, { flatShading: false }), g, fx, .05, fz, .12, .06, .12); }
    else if (pr === 'space') { if (rnd() < .25) { const c = [0xff5ad8, 0x3affc8][(rnd() * 2) | 0]; mesh(G.oct, M(c, { emissive: c, emissiveIntensity: 1.2 }), g, fx, .15, fz, .1, .3, .1); } }
  }
}
function addPlatform(p, W, rnd, colliders, dyn, belts) {
  const kind = p.kind || 'grass';
  const h = kind === 'cliff' ? Math.max(1.2, p.top + 1.2) : kind === 'roof' ? 30 : kind === 'stump' ? 12 : ['stone', 'crumble', 'glass', 'mush', 'sand', 'cloud'].includes(kind) ? .9 : kind === 'flip' ? .5 : kind === 'bridge' ? .5 : 1.2;
  const col = { minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2, minY: p.top - h, maxY: p.top, p, ice: !!p.ice, conv: p.conv || null, bounce: p.bounce || 0 };
  colliders.push(col);
  const dynamic = !!(p.crumble || p.flip || p.invisible);
  const g = new THREE.Group(); g.position.set(p.x, p.top, p.z); g.userData.static = !dynamic; levelGroup.add(g);
  const [topC, bodyC] = platformColors(kind, W);
  const under = (col2) => { const hc = Math.min(7, (p.w + p.d) / 3 + 1); const c = mesh(G.cone7, M(col2), g, 0, -h - hc / 2, 0, p.w, hc, p.d); c.rotation.x = Math.PI; c.rotation.y = rnd() * TAU; };
  const slab = (tc, bc, topExtra) => { mesh(G.box, M(bc), g, 0, -(h + .3) / 2, 0, p.w, h - .3, p.d); mesh(G.box, M(tc, Object.assign({ roughness: .95 }, topExtra || {})), g, 0, -.15, 0, p.w + .16, .34, p.d + .16); };
  if (kind === 'bridge') {
    const along = p.d >= p.w; const len = along ? p.d : p.w; const n = Math.round(len / .62);
    const wood = W.props === 'city' ? [0x5a6080, 0x4a5070] : W.props === 'snow' ? [0x9ab8d8, 0x8aa8c8] : [0xc68a4f, 0xb87a42];
    for (let i = 0; i < n; i++) { const o = -len / 2 + (i + .5) * len / n; const m = mesh(G.box, M(wood[i % 2]), g, along ? 0 : o, -.12, along ? o : 0, along ? p.w : len / n * .86, .24, along ? len / n * .86 : p.d); m.rotation.y = (rnd() - .5) * .04; }
    for (const s of [-1, 1]) {
      mesh(G.box, M(0xe8c27a), g, along ? s * p.w / 2 : 0, .75, along ? 0 : s * p.d / 2, along ? .08 : p.w, .08, along ? p.d : .08);
      for (const e of [-1, 1]) mesh(G.cyl8, M(0x8a5a33), g, along ? s * p.w / 2 : e * p.w / 2, .35, along ? e * p.d / 2 : s * p.d / 2, .16, 1.0, .16);
    }
  } else if (kind === 'cloud') {
    mesh(G.box, M(0xffffff, { roughness: 1 }), g, 0, -.2, 0, p.w - .2, .4, p.d - .2);
    const n = Math.max(4, Math.round(p.w * p.d / 3));
    for (let i = 0; i < n; i++) mesh(G.ico1, M(i % 3 ? 0xffffff : 0xf0f4ff, { roughness: 1 }), g, (rnd() - .5) * (p.w - .8), -.55 - rnd() * .2, (rnd() - .5) * (p.d - .8), .7 + rnd() * .4, .55 + rnd() * .2, .7 + rnd() * .4);
  } else if (kind === 'roof') {
    mesh(G.box, M(0x262a44), g, 0, -15.3, 0, p.w, 30, p.d);
    mesh(G.box, M(0x3a3f5a), g, 0, -.15, 0, p.w + .2, .3, p.d + .2);
    const wc = [0x00f0ff, 0xff4ad8, 0xffd23f][(rnd() * 3) | 0];
    mesh(G.box, M(wc, { emissive: wc, emissiveIntensity: 2.2 }), g, 0, -.32, 0, p.w + .26, .08, p.d + .26);
    for (let y = -2.5; y > -26; y -= 2.6) for (const s of [-1, 1]) { mesh(G.box, M(0xffe9a8, { emissive: 0xffd070, emissiveIntensity: rnd() < .5 ? 1.1 : .2 }), g, 0, y, s * (p.d / 2 + .02), p.w * .8, .9, .04); mesh(G.box, M(0x9ad8ff, { emissive: 0x6ab8ff, emissiveIntensity: rnd() < .5 ? 1 : .2 }), g, s * (p.w / 2 + .02), y, 0, .04, .9, p.d * .8); }
    if (rnd() < .6) { mesh(G.box, M(0x4a4f6a), g, (rnd() - .5) * (p.w - 2), .5, (rnd() - .5) * (p.d - 2), 1.2, 1, 1.2); }
  } else if (kind === 'stump') {
    const r = Math.min(p.w, p.d) / 2; mesh(new THREE.CylinderGeometry(r * .92, r * 1.1, 12, 12), M(0x6b4a2e), g, 0, -6.1, 0, 1, 1, 1);
    mesh(new THREE.CylinderGeometry(r, r, .22, 16), M(0xd9b07a, { flatShading: false }), g, 0, -.11, 0); mesh(new THREE.TorusGeometry(r * .55, .04, 4, 20).rotateX(Math.PI / 2), M(0xa8784a), g, 0, .005, 0);
    mesh(G.box, M(0x3fae4a), g, 0, -.7, 0, p.w + .05, .5, p.d + .05);
    col.minX = p.x - r; col.maxX = p.x + r; col.minZ = p.z - r; col.maxZ = p.z + r;
  } else if (kind === 'mush') {
    mesh(G.cyl8, M(0xf4ead8), g, 0, -1.6, 0, .9, 3, .9);
    const cap = mesh(new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI / 2), M(0xff4a5a, { flatShading: false, roughness: .45 }), g, 0, -.6, 0, p.w * .62, .75, p.d * .62);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, rr2 = .35 + (i % 2) * .25; mesh(G.sphS, M(0xffffff, { flatShading: false }), g, Math.cos(a) * rr2 * p.w * .5, .08 - rr2 * .25, Math.sin(a) * rr2 * p.d * .5, .2, .08, .2); }
    col.cap = cap;
  } else if (kind === 'flip') {
    const piv = new THREE.Group(); g.add(piv); col.piv = piv; col.flipAxis = p.d >= p.w ? 'z' : 'x';
    mesh(G.box, M(W.stone), piv, 0, -.25, 0, p.w, .5, p.d); for (const s of [-1, 1]) mesh(G.box, M(W.accent, { emissive: W.accent, emissiveIntensity: .5 }), piv, p.d >= p.w ? s * (p.w / 2 - .1) : 0, .02, p.d >= p.w ? 0 : s * (p.d / 2 - .1), p.d >= p.w ? .2 : p.w, .06, p.d >= p.w ? p.d : .2);
    for (const s of [-1, 1]) mesh(G.cyl8, M(0x6a6f7a), g, p.d >= p.w ? 0 : s * (p.w / 2 + .3), -.25, p.d >= p.w ? s * (p.d / 2 + .3) : 0, .3, .5, .3).rotation[p.d >= p.w ? 'x' : 'z'] = Math.PI / 2;
  } else if (kind === 'glass') {
    const mat = new THREE.MeshStandardMaterial({ color: W.accent, emissive: W.accent, emissiveIntensity: .22, transparent: true, opacity: .05, roughness: .1, metalness: .3, depthWrite: false });
    mesh(G.box, mat, g, 0, -.45, 0, p.w, .9, p.d); col.glass = mat;
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(p.w, .9, p.d)), new THREE.LineBasicMaterial({ color: W.accent, transparent: true, opacity: .1 })); edge.position.y = -.45; g.add(edge); col.glassEdge = edge.material;
  } else {
    slab(topC, bodyC, kind === 'ice' ? { roughness: .08, metalness: .1, flatShading: false } : null);
    if (kind === 'grass' || kind === 'cliff') for (const s of [-1, 1]) { mesh(G.box, M(topC, { roughness: .95 }), g, s * (p.w / 2 + .06), -.38, 0, .1, .2, p.d * .9); mesh(G.box, M(topC, { roughness: .95 }), g, 0, -.38, s * (p.d / 2 + .06), p.w * .9, .2, .1); }
    if (kind === 'cliff') { for (let y = -h + 1.2; y < -.8; y += 1.6) mesh(G.box, M(shade(bodyC, .82)), g, 0, y, 0, p.w + .06, .25, p.d + .06); }
    else under(shade(bodyC, .82));
    if (kind === 'grass' || kind === 'coral') decorTop(g, p, W, rnd);
    if (kind === 'temple') for (const sx of [-1, 1]) for (const sz of [-1, 1]) { mesh(G.cyl8, M(0xf0d8a0), g, sx * (p.w / 2 - .4), .8, sz * (p.d / 2 - .4), .5, 1.6, .5); mesh(G.box, M(W.accent, { emissive: W.accent, emissiveIntensity: .8 }), g, sx * (p.w / 2 - .4), 1.65, sz * (p.d / 2 - .4), .6, .12, .6); }
    if (kind === 'castle' || kind === 'arena') mesh(G.box, M(W.accent, { emissive: W.accent, emissiveIntensity: 1.2 }), g, 0, -.4, 0, p.w + .22, .06, p.d + .22);
    if (kind === 'arena') for (let r = 3; r < Math.min(p.w, p.d) / 2; r += 4) mesh(new THREE.TorusGeometry(r, .08, 4, 48).rotateX(Math.PI / 2), M(W.accent, { emissive: W.accent, emissiveIntensity: .7 }), g, 0, .02, 0);
    if (kind === 'metal') for (const s of [-1, 1]) mesh(G.box, M(0xffd23f, { emissive: 0xffaa00, emissiveIntensity: .3 }), g, 0, .01, s * (p.d / 2 - .1), p.w, .03, .15);
    if (kind === 'ice') for (let i = 0; i < 5; i++) mesh(G.cone5, M(0xbfe8ff, { roughness: .1 }), g, (rnd() - .5) * p.w * .8, -h - .4, (rnd() - .5) * p.d * .8, .3, .9, .3).rotation.x = Math.PI;
    if (kind === 'crumble') for (let i = 0; i < 4; i++) mesh(G.box, M(0x2a2020), g, (rnd() - .5) * p.w * .6, .02, (rnd() - .5) * p.d * .6, .06, .02, .8 + rnd()).rotation.y = rnd() * 3;
    if (kind === 'coral') for (let i = 0; i < 3; i++) { const c = [0xff7ab8, 0xffb04a, 0xb07aff][i]; mesh(G.cone5, M(c), g, (rnd() - .5) * (p.w - 1), .4, (rnd() - .5) * (p.d - 1), .25, .8, .25); }
    if (kind === 'conveyor') {
      const along = Math.abs(p.conv[0]) > 0 ? 'x' : 'z'; const len = along === 'x' ? p.w : p.d; const chev = [];
      for (let i = 0; i < Math.floor(len / 1.2); i++) { const c = mesh(G.cone5, M(W.accent, { emissive: W.accent, emissiveIntensity: 1.3 }), levelGroup, 0, 0, 0, .5, .5, .12); c.userData.keep = true; c.rotation.x = -Math.PI / 2; c.rotation.y = 0; chev.push(c); }
      belts.push({ p, chev, along, len, v: along === 'x' ? p.conv[0] : p.conv[1] });
    }
  }
  if (p.invisible) for (let i = 0; i < 3; i++) { const s = mesh(G.oct, M(W.accent, { emissive: W.accent, emissiveIntensity: 2.5 }), levelGroup, p.x + (i - 1) * p.w * .3, p.top + .35, p.z + (rnd() - .5) * p.d * .4, .09); s.userData.keep = true; }
  if (dynamic) { shadowAll(g); dyn.push({ p, g, col, state: 'idle', t: 0 }); }
  return col;
}

const sharedGeos = new Set(Object.values(G));
function disposeGroup(group) {
  const mats = new Set(matCache.values());
  group.traverse((o) => { if (!o.isMesh) return; if (!sharedGeos.has(o.geometry)) o.geometry.dispose(); if (!mats.has(o.material) && o.material !== coinMat && o.material !== coinRimMat) o.material.dispose(); });
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

function buildEnemy(e, W, rnd) {
  const g = new THREE.Group(); levelGroup.add(g); const [c1, c2] = W.enemy; let body, wings = null, extra = null;
  const eyes = (y, z, col, glow) => { for (const s of [-1, 1]) { if (glow) mesh(G.sphS, M(col, { emissive: col, emissiveIntensity: 2.5 }), g, s * .2, y, z, .09, .07, .05); else { mesh(G.sphS, SM(0xffffff, { roughness: .2 }), g, s * .2, y, z, .14, .16, .08); mesh(G.sphS, SM(0x1b1b2f), g, s * .2, y - .02, z - .07, .06, .08, .04); } } };
  if (e.type === 'robot') {
    body = mesh(G.box, SM(0xb8c0d0, { metalness: .6, roughness: .35 }), g, 0, .62, 0, .8, .7, .7);
    mesh(G.box, M(0xff3a6a, { emissive: 0xff2050, emissiveIntensity: 2.2 }), g, 0, .75, -.36, .62, .14, .04);
    mesh(G.cyl8, SM(0x3a3f5a), g, 0, 1.1, 0, .04, .3, .04); mesh(G.sphS, M(0x00f0ff, { emissive: 0x00f0ff, emissiveIntensity: 2 }), g, 0, 1.28, 0, .08);
    for (const s of [-1, 1]) mesh(G.cyl8, SM(0x2a2d40), g, s * .32, .18, 0, .3, .2, .3).rotation.z = Math.PI / 2;
  } else if (e.type === 'shadow') {
    body = mesh(G.sphS, SM(0x1a1028, { roughness: .3 }), g, 0, .6, 0, .55, .62, .55);
    mesh(G.cone7, SM(0x1a1028), g, 0, .1, 0, 1.1, .4, 1.1).rotation.x = Math.PI; eyes(.75, -.48, 0xb06aff, true);
    for (const s of [-1, 1]) mesh(G.cone5, SM(0x2a1a3a), g, s * .3, 1.15, 0, .12, .4, .12).rotation.z = s * -.4;
  } else if (e.type === 'flyer') {
    body = mesh(G.sphS, SM(c1, { roughness: .4 }), g, 0, .45, 0, .42, .38, .5); eyes(.55, -.38);
    mesh(G.cone5, SM(0xffb03a), g, 0, .42, -.55, .1, .22, .1).rotation.x = -Math.PI / 2;
    wings = []; for (const s of [-1, 1]) { const wg = new THREE.Group(); wg.position.set(s * .35, .55, 0); g.add(wg); mesh(G.box, SM(c2), wg, s * .45, 0, 0, .9, .06, .45); wings.push(wg); }
  } else if (e.type === 'jelly') {
    const jm = M(0xff7ab8, { flatShading: false, transparent: true, opacity: .75, emissive: 0xff4aa8, emissiveIntensity: .7, roughness: .2 });
    body = mesh(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2), jm, g, 0, .6, 0, .6, .5, .6);
    extra = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; extra.push(mesh(G.cyl8, jm, g, Math.cos(a) * .35, .25, Math.sin(a) * .35, .06, .7, .06)); }
  } else if (e.type === 'alien') {
    body = mesh(G.sphS, SM(0x3affc8, { roughness: .35 }), g, 0, .55, 0, .55, .5, .55); mesh(G.sphS, M(0x111122, { roughness: .1 }), g, 0, .72, -.4, .3, .14, .1);
    for (const s of [-1, 1]) { mesh(G.cyl8, SM(0x3affc8), g, s * .2, 1.05, 0, .04, .4, .04); mesh(G.sphS, M(0xff5ad8, { emissive: 0xff5ad8, emissiveIntensity: 2 }), g, s * .2, 1.27, 0, .08); }
  } else {
    body = mesh(G.sphS, SM(c1, { roughness: .4 }), g, 0, .55, 0, .58, .5, .58);
    mesh(G.sphS, SM(c2), g, 0, .45, -.3, .3, .22, .2);
    eyes(.72, -.45);
    for (const s of [-1, 1]) { const brow = mesh(G.box, SM(0x3b1f4a), g, s * .2, .9, -.48, .2, .05, .05); brow.rotation.z = s * -.4; mesh(G.cone5, SM(0xffe066), g, s * .3, 1.08, 0, .14, .32, .14).rotation.z = s * -.3; mesh(G.sphS, SM(shade(c1, .5)), g, s * .25, .1, -.05, .14, .1, .2); }
  }
  castAll(g);
  const t0 = rnd(); g.position.set(lerp(e.a[0], e.b[0], t0), e.y, lerp(e.a[1], e.b[1], t0));
  return { g, body, wings, extra, type: e.type || 'walker', a: e.a, b: e.b, y: e.y, y2: e.y2, cy: e.y, speed: e.speed, t: t0, dir: 1, x: g.position.x, z: g.position.z, alive: true, dieT: 0, col: c1 };
}

function buildHazard(hz, W, rnd) {
  const g = new THREE.Group(); levelGroup.add(g); const o = Object.assign({ g, on: true }, hz);
  if (hz.type === 'roller') {
    o.roll = new THREE.Group(); g.add(o.roll);
    if (hz.skin === 'log') { const lg = mesh(G.cyl8, M(0x7a4a2a), o.roll, 0, 0, 0, hz.r * 2, 2.6, hz.r * 2); lg.rotation.z = Math.PI / 2; }
    else o.ball = mesh(G.ico1, M(hz.skin === 'snow' ? 0xf4fbff : 0x8a7a6a, { roughness: .9 }), o.roll, 0, 0, 0, hz.r);
    o.k = 0; o.wait = 0; const dx = hz.b[0] - hz.a[0], dz = hz.b[1] - hz.a[1]; o.len = Math.hypot(dx, dz); o.ux = dx / o.len; o.uz = dz / o.len;
    g.rotation.y = Math.atan2(o.ux, o.uz);
  } else if (hz.type === 'spikes') {
    g.position.set(hz.x, hz.y, hz.z); o.inner = new THREE.Group(); g.add(o.inner);
    mesh(G.box, M(0x3a3a44), g, 0, .02, 0, hz.w, .05, hz.d);
    const mat = hz.fire ? M(0xff6a10, { emissive: 0xff4a00, emissiveIntensity: 2.4 }) : M(0xd8dde8, { metalness: .7, roughness: .3 });
    for (let x = -hz.w / 2 + .3; x < hz.w / 2; x += .55) for (let z = -hz.d / 2 + .3; z < hz.d / 2; z += .55) mesh(hz.fire ? G.cone5 : G.cone5, mat, o.inner, x, .35, z, .22, hz.fire ? 1.0 : .7, .22);
    if (!hz.fire) mesh(G.box, M(0xff3a3a, { emissive: 0xff2020, emissiveIntensity: .6 }), g, 0, .03, 0, hz.w + .1, .02, hz.d + .1);
  } else if (hz.type === 'laser') {
    g.position.set(hz.x, hz.y, hz.z); if (hz.axis === 'z') g.rotation.y = Math.PI / 2;
    const beamM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .3, .5), transparent: true, opacity: .95 });
    o.beams = []; const rows = hz.h > 1 ? [ .4, 1.0, 1.6, 2.2 ] : [hz.h];
    for (const y of rows) o.beams.push(mesh(G.cyl8, beamM, g, 0, y, 0, .07, hz.len, .07)); for (const b of o.beams) b.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) mesh(G.box, M(0x3a3f5a, { metalness: .6 }), g, s * hz.len / 2, (rows[rows.length - 1] + .3) / 2, 0, .3, rows[rows.length - 1] + .5, .3);
    o.mat = beamM;
  } else if (hz.type === 'fireball') {
    o.ball = mesh(G.ico1, M(0xff6a10, { emissive: 0xff5a00, emissiveIntensity: 3 }), g, 0, 0, 0, .45); g.position.set(hz.x, hz.y0, hz.z);
  } else if (hz.type === 'sweeper') {
    g.position.set(hz.x, hz.y, hz.z); mesh(G.cyl8, M(0x5a5a70, { metalness: .5 }), g, 0, .45, 0, .6, .9, .6);
    o.arm = new THREE.Group(); g.add(o.arm); mesh(G.box, M(0xff3a3a, { emissive: 0xff2020, emissiveIntensity: 1.6 }), o.arm, hz.len / 2, hz.h, 0, hz.len, .22, .22); o.ang = 0;
  }
  castAll(g); return o;
}

function loadLevel(idx) {
  const L = getLevel(idx); const W = WORLDS[L.world || 0];
  disposeGroup(levelGroup);
  const rnd = rng(1234 + idx * 77);
  paintSky(W.sky[0], W.sky[1]);
  scene.fog.near = W.fog[0]; scene.fog.far = W.fog[1];
  sunLight.color.setHex(W.sun); sunLight.intensity = W.dark ? .7 : W.props === 'space' ? 1.6 : W.props === 'city' ? 1.3 : W.props === 'ocean' ? 1.8 : W.props === 'volcano' ? 2.2 : (W.props === 'snow' || W.props === 'sky') ? 1.6 : 3.0;
  hemi.intensity = W.dark ? .55 : (W.props === 'snow' || W.props === 'sky') ? .6 : .85; hemi.groundColor.setHex(W.hills[0]);
  heroLight.intensity = W.dark ? 30 : (W.props === 'city' || W.props === 'space') ? 10 : 0;
  stars.visible = !!(W.dark || W.props === 'space' || W.props === 'city');
  sunDisc.visible = !W.dark; sunDisc.material.color.setHex(W.sun).multiplyScalar(2);
  const colliders = [], dyn = [], belts = [];
  for (const p of L.platforms) addPlatform(p, W, rnd, colliders, dyn, belts);
  let cx = 0, cz = 0; for (const p of L.platforms) { cx += p.x; cz += p.z; } cx /= L.platforms.length; cz /= L.platforms.length;
  buildBackground(L, W, rnd, cx, cz);
  for (const t of L.trees) addProp(levelGroup, t[0], t[1], t[2], W, rnd);

  const movers = L.movers.map((m) => {
    const g = new THREE.Group(); levelGroup.add(g);
    const base = m.kind === 'stoneblock' ? 0xd9b98a : m.kind === 'lift' ? 0x8a9ab8 : W.props === 'city' ? 0x5a6080 : 0xffa53d;
    mesh(G.box, M(base), g, 0, -.3, 0, m.w, .6, m.d).receiveShadow = true;
    mesh(G.box, M(m.kind === 'stoneblock' ? 0xe8d0a0 : 0xfff1a8), g, 0, -.02, 0, m.w + .1, .08, m.d + .1).receiveShadow = true;
    for (const s of [-1, 1]) mesh(G.oct, M(W.accent, { emissive: W.accent, emissiveIntensity: 1.5 }), g, s * (m.w / 2 + .15), -.3, 0, .18);
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
  for (const wl of L.walls) {
    colliders.push({ minX: wl.x - wl.w / 2, maxX: wl.x + wl.w / 2, minZ: wl.z - wl.d / 2, maxZ: wl.z + wl.d / 2, minY: wl.y, maxY: wl.y + wl.h });
    mesh(G.box, M(0x3a3a4e), levelGroup, wl.x, wl.y + wl.h / 2, wl.z, wl.w, wl.h, wl.d);
    mesh(G.box, M(W.accent, { emissive: W.accent, emissiveIntensity: 1.4 }), levelGroup, wl.x, wl.y + wl.h + .03, wl.z, wl.w + .05, .06, wl.d + .05);
  }
  const gates = L.gates.map((gt) => {
    const g = new THREE.Group(); g.position.set(gt.x, gt.y, gt.z); levelGroup.add(g);
    mesh(G.box, M(0x6a5a4a), g, 0, gt.h / 2, 0, gt.w, gt.h, gt.d);
    const along = gt.w > gt.d; const len = along ? gt.w : gt.d;
    for (let o = -len / 2 + .6; o < len / 2; o += 1.2) mesh(G.box, M(W.accent, { emissive: W.accent, emissiveIntensity: 1.2 }), g, along ? o : 0, gt.h / 2, along ? 0 : o, along ? .12 : gt.d + .06, gt.h * .9, along ? gt.d + .06 : .12);
    castAll(g);
    const col = { minX: gt.x - gt.w / 2, maxX: gt.x + gt.w / 2, minZ: gt.z - gt.d / 2, maxZ: gt.z + gt.d / 2, minY: gt.y, maxY: gt.y + gt.h, gate: true }; colliders.push(col);
    return { g, col, open: false, k: 0, h: gt.h };
  });
  const switches = L.switches.map((s) => {
    const g = new THREE.Group(); g.position.set(s.x, s.y, s.z); levelGroup.add(g);
    mesh(G.cyl8, M(0x5a5a6a), g, 0, .08, 0, 1.4, .16, 1.4); const btn = mesh(G.cyl8, M(0xff3a3a, { emissive: 0xff2020, emissiveIntensity: 1.2 }), g, 0, .22, 0, 1, .16, 1);
    castAll(g); return Object.assign({ g, btn, on: false }, s);
  });
  const teles = L.teleporters.map((t) => {
    const mk = (pt, out) => { const g = new THREE.Group(); g.position.set(pt[0], pt[1], pt[2]); levelGroup.add(g); mesh(G.cyl8, M(0x3a3a5a), g, 0, .06, 0, 2, .12, 2);
      const ring2 = mesh(new THREE.TorusGeometry(.8, .08, 6, 24).rotateX(Math.PI / 2), M(out ? 0x3affc8 : 0xff5ad8, { emissive: out ? 0x3affc8 : 0xff5ad8, emissiveIntensity: 2 }), g, 0, .2, 0);
      const beam = mesh(new THREE.CylinderGeometry(.75, .75, 2.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: out ? new THREE.Color(.3, 1.4, 1.1) : new THREE.Color(1.4, .4, 1.2), transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide }), g, 0, 1.3, 0);
      return { g, ring2, beam }; };
    return { a: t.a, b: t.b, A: mk(t.a, false), B: mk(t.b, true) };
  });

  const coins = L.coins.map(([x, y, z], i) => { const m = makeCoin(levelGroup, x, y, z); m.rotation.y = i * .5; return { m, x, y, z, x0: x, y0: y, z0: z, taken: false, t: 0 }; });
  const gems = L.gems.map(([x, y, z]) => { const m = mesh(G.oct, M(0xb06aff, { emissive: 0x9a4aff, emissiveIntensity: 1.4, metalness: .3, roughness: .2 }), levelGroup, x, y, z, .38, .55, .38); return { m, x, y, z, taken: false }; });

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

  const enemies = L.enemies.map((e) => buildEnemy(e, W, rnd));
  const hazards = L.hazards.map((h) => buildHazard(h, W, rnd));

  mergeStatic(levelGroup, true); mergeStatic(bgGroup, false);
  world = {
    idx, L, W, colliders, movers, vines, coins, gems, checkpoints, enemies, hazards, dyn, belts, gates, switches, teles, zones: L.zones, arenas: L.arenas,
    goal: { x: L.goal[0], y: L.goal[1], z: L.goal[2], g: goalG, torus, disc, swirl, sparks, portalMat, active: !L.boss },
    t: 0, got: 0, total: coins.length + enemies.length * 3 + gems.length * 5, gemsGot: 0, foes: 0, done: false, score: 0, combo: 0, comboT: 0, bestCombo: 0,
    timeLeft: L.timer || 0, phys: L.phys || { grav: 1, jump: 1, speed: 1 }, killY: L.killY !== undefined ? L.killY : -14, boss: null, teleCD: 0, freeze: false, safe: false, god: false, hits: 0,
  };
  goalG.visible = world.goal.active;
  if (L.boss) initBoss(L);
  resetPlayer(true);
  updateHUD(true);
}
// ---------------------------------------------------------------- player
const R = .35, H = 1.5, SPEED = 7.5, JUMP = 12, JUMP2 = 10.5, GRAV = 32, DASH_V = 17, DASH_T = .2;
const P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: false, ground: null, coyote: 0, jumpBuf: 0,
  facing: 0, hearts: 3, maxHearts: 3, invuln: 0, attackT: 0, attackCD: 0, climbing: false, walk: 0, knock: 0,
  respawn: new THREE.Vector3(), landT: 0, airJumps: 1, flipT: 0, dashT: 0, dashCD: 0, airDash: 1, dashDir: new THREE.Vector2(),
  sq: 1, sqV: 0, dustT: 0, stepT: 0, lean: 0, fallV: 0, shield: 0, shieldT: 0, magnet: 3.6, doubler: false,
};
let CH = CHARACTERS[0];
function charStats() { CH = CHARACTERS.find((c) => c.id === save.char) || CHARACTERS[0]; }
function resetPlayer(full) {
  const s = world.L.start;
  if (full) { P.respawn.set(s[0], s[1], s[2]); P.hearts = P.maxHearts; }
  P.pos.copy(P.respawn); P.pos.y += .05; P.vel.set(0, 0, 0); P.facing = 0; P.climbing = false; P.knock = 0; P.attackT = 0; P.dashT = 0; P.flipT = 0; P.dashCD = 0; P.attackCD = 0; P.ground = null; P.grounded = false;
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
  for (const b of cs) if (!b.off && overlaps(b)) { if (P.pos.x < (b.minX + b.maxX) / 2) P.pos.x = b.minX - R - 1e-3; else P.pos.x = b.maxX + R + 1e-3; P.vel.x = 0; }
  P.pos.z += P.vel.z * dt;
  for (const b of cs) if (!b.off && overlaps(b)) { if (P.pos.z < (b.minZ + b.maxZ) / 2) P.pos.z = b.minZ - R - 1e-3; else P.pos.z = b.maxZ + R + 1e-3; P.vel.z = 0; }
  P.pos.y += P.vel.y * dt;
  const wasGrounded = P.grounded; P.grounded = false; let landV = 0, landed = false;
  for (const b of cs) if (!b.off && overlaps(b)) {
    if (P.vel.y <= 0 || P.pos.y > (b.minY + b.maxY) / 2) { if (!wasGrounded) { landed = true; landV = P.vel.y; } P.pos.y = b.maxY; P.vel.y = 0; P.grounded = true; P.ground = b; }
    else { P.pos.y = b.minY - H - 1e-3; P.vel.y = 0; }
  }
  if (!P.grounded && P.vel.y <= 0) for (const b of cs) {
    if (!b.off && Math.abs(P.pos.y - b.maxY) < .02 && P.pos.x + R > b.minX && P.pos.x - R < b.maxX && P.pos.z + R > b.minZ && P.pos.z - R < b.maxZ) { P.grounded = true; P.ground = b; P.pos.y = b.maxY; break; }
  }
  if (!P.grounded) P.ground = null;
  if (landed && P.ground) onLand(landV, P.ground);
}
function onLand(vy, b) {
  P.airJumps = world.phys.water ? 2 : 1; P.airDash = CH.airDash || 1;
  if (b && b.bounce) {
    P.vel.y = b.bounce * world.phys.jump; P.grounded = false; P.ground = null; P.coyote = 0; sfx('bounce'); P.sqV += 9; b.squash = .35;
    burst(P.pos.x, P.pos.y + .1, P.pos.z, 0xff4a5a, 8, 4); return;
  }
  if (vy < -6) {
    const k = clamp(-vy / 25, .25, 1);
    sfx('land'); P.landT = .15; P.sqV -= 9 * k; puff(P.pos.x, P.pos.y + .05, P.pos.z, world.W.props === 'snow' ? 0xffffff : 0xe9e2d0, 8, 2.6 * k + 1, .2, .4);
    if (vy < -20) shake(.18);
  }
}
function inVine() {
  for (const v of world.vines) if (Math.abs(P.pos.x - v.x) < v.w / 2 && P.pos.z > v.z - .05 && P.pos.z < v.z + R + .55 && P.pos.y > v.y0 - .15 && P.pos.y < v.y1 + .05) return v;
  return null;
}
const inZone = (z, x, y, zz) => x > z.minX && x < z.maxX && zz > z.minZ && zz < z.maxZ && y > z.minY && y < z.maxY;

const input = { kx: 0, ky: 0, jx: 0, jy: 0, jumpHeld: false, jumpPressed: false, actionPressed: false, dashPressed: false, camKeys: 0 };
let camYaw = 0, camPitch = .38, camDist = 7.5, shakeAmt = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

function updatePlayer(dt) {
  const ph = world.phys;
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
    P.dashDir.set(ddx, ddz); P.dashT = DASH_T; P.dashCD = CH.dashCD; if (!P.grounded) P.airDash--; P.knock = 0;
    sfx('dash'); shake(.06); puff(P.pos.x, P.pos.y + .3, P.pos.z, 0xffffff, 6, 2, .2, .3);
  }
  input.dashPressed = false;
  P.attackT -= dt; P.attackCD -= dt; P.invuln -= dt; P.knock -= dt; P.landT -= dt; P.dashCD -= dt; P.flipT -= dt;
  if (CH.shield && P.shield <= 0) { P.shieldT -= dt; if (P.shieldT <= 0) { P.shield = 1; sfx('check'); } }

  const spdMax = SPEED * ph.speed * CH.speed;
  const ice = P.grounded && P.ground && P.ground.ice;
  if (P.dashT > 0) {
    P.dashT -= dt; P.vel.x = P.dashDir.x * DASH_V; P.vel.z = P.dashDir.y * DASH_V; if (!P.grounded) P.vel.y = Math.max(P.vel.y, 0) * .5;
    P.facing = Math.atan2(-P.dashDir.x, -P.dashDir.y);
    if (P.dashT <= 0) { P.vel.x *= .5; P.vel.z *= .5; }
  } else if (P.knock <= 0) {
    const has = dl > .05;
    const acc = (P.grounded ? (ice ? (has ? 11 : 2.5) : (has ? 95 : 70)) : 42) * dt;
    const tx = dx * spdMax, tz = dz * spdMax;
    const ddx = tx - P.vel.x, ddz = tz - P.vel.z, dd = Math.hypot(ddx, ddz);
    if (dd <= acc) { P.vel.x = tx; P.vel.z = tz; } else { P.vel.x += ddx / dd * acc; P.vel.z += ddz / dd * acc; }
  }
  if (dl > .1 && P.knock <= 0 && P.dashT <= 0) { const tf = Math.atan2(-dx, -dz); let d = tf - P.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); P.facing += d * Math.min(1, dt * 16); }

  const v = inVine(); const into = -dz; const wasClimbing = P.climbing;
  P.climbing = !!v && !P.grounded && (into > .3 || (wasClimbing && dl < .15)) || (!!v && P.grounded && into > .3);
  if (P.climbing) { P.vel.y = into > .3 ? 4.6 : 0; P.facing = lerp(P.facing, 0, Math.min(1, dt * 12)); P.airJumps = 1; P.airDash = CH.airDash || 1; }

  if (P.grounded) P.coyote = .12; else P.coyote -= dt;
  if (P.jumpBuf > 0) {
    if (P.coyote > 0 || P.climbing) {
      P.vel.y = JUMP * ph.jump; if (P.climbing) { P.vel.z += 5; P.climbing = false; }
      P.jumpBuf = 0; P.coyote = 0; P.grounded = false; P.ground = null; sfx('jump'); P.sqV += 7; puff(P.pos.x, P.pos.y + .05, P.pos.z, 0xe9e2d0, 4, 1.6, .16, .2);
    } else if (P.airJumps > 0 && !world.noDouble) {
      P.vel.y = JUMP2 * ph.jump; P.airJumps--; P.jumpBuf = 0; P.flipT = .42; sfx('djump'); P.sqV += 6;
      burst(P.pos.x, P.pos.y + .2, P.pos.z, 0x9ff7ff, 8, 3); puff(P.pos.x, P.pos.y, P.pos.z, 0xffffff, 6, 2.4, .18, -.3);
    }
  }
  // zones: wind pushes (as a drift velocity), lift columns carry you up
  let lift = false, blown = false;
  for (const z of world.zones) if (inZone(z, P.pos.x, P.pos.y + .7, P.pos.z)) {
    if (z.type === 'wind') { if (blown) continue; blown = true; const k = P.grounded ? .35 : .55; P.pos.x += z.force[0] * k * dt; P.pos.z += z.force[1] * k * dt; }
    else if (z.type === 'lift') lift = true;
  }
  if (lift && !P.climbing) { P.vel.y = Math.min(P.vel.y + 48 * dt, 8.5); P.airJumps = 1; if (Math.random() < .3) burst(P.pos.x, P.pos.y, P.pos.z, 0x9ff7ff, 1, 2); }
  else if (!P.climbing && P.dashT <= 0) {
    P.vel.y -= GRAV * ph.grav * dt * (P.vel.y > 0 && !input.jumpHeld ? 2.2 : 1);
    const term = ph.water ? -9 : -30; if (P.vel.y < term) P.vel.y = term;
  }
  if (P.ground && P.ground.mover) { const m = world.movers.find((mm) => mm.box === P.ground); if (m) { P.pos.x += m.dx; P.pos.y += m.dy; P.pos.z += m.dz; } }
  if (P.grounded && P.ground && P.ground.conv) { P.pos.x += P.ground.conv[0] * dt; P.pos.z += P.ground.conv[1] * dt; }

  const steps = dt > 1 / 70 ? 2 : 1;
  for (let i = 0; i < steps; i++) moveAndCollide(dt / steps);

  const spd = Math.hypot(P.vel.x, P.vel.z);
  if (P.grounded && spd > 4.5) {
    P.dustT -= dt; if (P.dustT <= 0) { P.dustT = P.dashT > 0 ? .02 : .09; puff(P.pos.x - P.vel.x * .03, P.pos.y + .05, P.pos.z - P.vel.z * .03, ice ? 0xdff6ff : 0xece4d2, 1, .6, P.dashT > 0 ? .26 : .17, .5); }
    P.stepT -= dt * spd; if (P.stepT <= 0) { P.stepT = 2.6; sfx('step'); }
  }
  if (ph.water && Math.random() < dt * 3) puff(P.pos.x, P.pos.y + 1.4, P.pos.z, 0xbff8ff, 1, .2, .08, 1.5);
  if (P.dashT > 0) trailT -= dt;
  if (P.pos.y < world.killY) {
    sfx('fall'); shake(.2);
    if (world.god) { world.hits++; resetPlayer(false); return; }
    P.hearts--; updateHUD();
    if (P.hearts <= 0) { failLevel('hearts'); return; }
    toast('Whoops!'); resetPlayer(false);
  }
}
let trailT = 0;

function hurt(fromX, fromZ) {
  if (P.invuln > 0 || P.dashT > 0 || world.safe || world.done) return;
  if (P.shield > 0) { P.shield--; P.shieldT = 20; P.invuln = 1; sfx('bossHit'); burst(P.pos.x, P.pos.y + 1, P.pos.z, 0x9ff7ff, 14, 5); toast('Shield!'); updateHUD(); return; }
  sfx('hurt'); P.invuln = 1.3; P.knock = .35; shake(.35); world.combo = 0;
  const ax = P.pos.x - fromX, az = P.pos.z - fromZ, al = Math.hypot(ax, az) || 1;
  P.vel.set(ax / al * 8, 7, az / al * 8);
  burst(P.pos.x, P.pos.y + 1, P.pos.z, 0xff4d6d, 10, 5);
  if (world.god) { world.hits++; return; }
  P.hearts--;
  if (P.hearts <= 0) failLevel('hearts');
  updateHUD();
}

// ---------------------------------------------------------------- world update (movers, crumbling / flipping / invisible floors, hazards, gates)
function updateWorld(dt) {
  const w = world; w.t += dt; w.teleCD -= dt;
  for (const m of w.movers) {
    const k = w.freeze ? (m.freezeK || 0) : .5 - .5 * Math.cos((w.t / m.period) * TAU);
    const nx = lerp(m.from[0], m.to[0], k), ny = lerp(m.from[1], m.to[1], k), nz = lerp(m.from[2], m.to[2], k);
    m.dx = nx - m.x; m.dy = ny - m.y; m.dz = nz - m.z; m.x = nx; m.y = ny; m.z = nz;
    Object.assign(m.box, { minX: nx - m.w / 2, maxX: nx + m.w / 2, minZ: nz - m.d / 2, maxZ: nz + m.d / 2, minY: ny - .6, maxY: ny });
    m.g.position.set(nx, ny, nz);
  }
  for (const d of w.dyn) {
    const p = d.p, c = d.col;
    if (p.crumble) {
      const mode = p.crumble.mode;
      if (d.state === 'idle') { if (P.ground === c) { d.state = 'shake'; d.t = p.crumble.delay; sfx('crumble'); } }
      else if (d.state === 'shake') {
        d.t -= dt; d.g.position.set(p.x + (Math.random() - .5) * .08, p.top - (mode === 'sink' ? (1 - d.t / p.crumble.delay) * .25 : 0), p.z + (Math.random() - .5) * .08);
        if (d.t <= 0) { d.state = 'gone'; d.t = 3.2; d.vy = 0; c.off = true; puff(p.x, p.top, p.z, mode === 'sink' ? 0xf2c46b : mode === 'vanish' ? 0xffffff : 0x8a7a6a, 10, 2.5, .35, .3); }
      } else if (d.state === 'gone') {
        d.t -= dt;
        if (mode === 'fall') { d.vy -= 25 * dt; d.g.position.y += d.vy * dt; d.g.rotation.z += dt * .6; }
        else if (mode === 'sink') { d.g.position.y -= dt * 1.5; }
        else d.g.scale.setScalar(Math.max(.01, d.g.scale.x - dt * 4));
        if (d.t <= 0) { d.state = 'idle'; c.off = false; d.g.position.set(p.x, p.top, p.z); d.g.rotation.set(0, 0, 0); d.g.scale.setScalar(1); }
      }
    }
    if (p.flip) {
      let ang = 0;
      if (!w.freeze) { const u = ((w.t / p.flip.period) + (p.x * .01)) % 1, on = p.flip.on;
        if (u < on) ang = 0; else if (u < on + .08) ang = (u - on) / .08; else if (u < .92) ang = 1; else ang = 1 - (u - .92) / .08;
        if (u > on - .12 && u < on) c.piv.position.y = Math.sin(w.t * 60) * .03; else c.piv.position.y = 0; }
      c.piv.rotation[c.flipAxis] = ang * Math.PI / 2; c.off = ang > .25;
    }
    if (p.invisible) { const dd = Math.hypot(P.pos.x - p.x, P.pos.z - p.z); c.glass.opacity = clamp(.85 - dd / 6, .05, .38); c.glassEdge.opacity = clamp(1.2 - dd / 8, .12, .9); }
  }
  for (const b of w.belts) for (let i = 0; i < b.chev.length; i++) {
    const c = b.chev[i], u = ((i / b.chev.length) + w.t * b.v / b.len) % 1, o = ((u + 1) % 1 - .5) * (b.len - .6), p = b.p;
    c.position.set(p.x + (b.along === 'x' ? o : 0), p.top + .04, p.z + (b.along === 'z' ? o : 0));
    c.rotation.set(-Math.PI / 2, 0, b.along === 'x' ? (b.v > 0 ? -Math.PI / 2 : Math.PI / 2) : (b.v > 0 ? Math.PI : 0));
  }
  for (const c of w.colliders) if (c.cap && c.squash > 0) { c.squash -= dt; const k = 1 - Math.sin(c.squash / .35 * Math.PI) * .25; c.cap.scale.y = .75 * k; }
  // hazards
  const pc = P.pos.y + .75;
  for (const h of w.hazards) {
    if (h.type === 'roller') {
      if (h.wait > 0) { h.wait -= dt; h.g.visible = false; continue; }
      h.g.visible = true; h.k += dt * h.speed;
      const x = h.a[0] + h.ux * h.k, z = h.a[1] + h.uz * h.k; let y = h.y + h.r;
      if (h.k > h.len) { y -= (h.k - h.len) * 4; if (h.k > h.len + 3) { h.k = 0; h.wait = h.gapT; } }
      h.g.position.set(x, y, z); h.roll.rotation.x += dt * h.speed / h.r;
      if (!w.freeze && Math.hypot(P.pos.x - x, P.pos.z - z) < h.r + .4 && pc > y - h.r - .7 && pc < y + h.r + .7) hurt(x, z);
    } else if (h.type === 'spikes') {
      const u = (((w.t + h.off) / h.period) % 1 + 1) % 1, up = !w.freeze && u < h.on;
      const k = up ? Math.min(1, u / .06) : 0; h.inner.position.y = lerp(-.75, 0, k);
      if (k > .5 && Math.abs(P.pos.x - h.x) < h.w / 2 + R * .5 && Math.abs(P.pos.z - h.z) < h.d / 2 + R * .5 && P.pos.y < h.y + .7) hurt(P.pos.x - P.vel.x, P.pos.z - P.vel.z);
      if (h.fire && up && Math.random() < dt * 20) burst(h.x + (Math.random() - .5) * h.w, h.y + .8, h.z + (Math.random() - .5) * h.d, 0xff6a10, 1, 3);
    } else if (h.type === 'laser') {
      const on = !w.freeze && (!h.period || ((((w.t + h.off) / h.period) % 1) < h.on || (((w.t + h.off) / h.period) % 1) > .95));
      const warn = h.period && ((((w.t + h.off) / h.period) % 1) > .9);
      for (const b of h.beams) b.visible = on || (warn && Math.floor(w.t * 20) % 2 === 0);
      if (on) { const along = h.axis === 'x'; const off = along ? Math.abs(P.pos.z - h.z) : Math.abs(P.pos.x - h.x), span = along ? Math.abs(P.pos.x - h.x) : Math.abs(P.pos.z - h.z);
        if (off < .3 + R * .5 && span < h.len / 2) for (const b of h.beams) { const by = h.y + b.position.y; if (P.pos.y < by && P.pos.y + H > by) { hurt(P.pos.x - P.vel.x * .1, P.pos.z - P.vel.z * .1); break; } } }
    } else if (h.type === 'fireball') {
      const u = (((w.t + h.off) % h.period) + h.period) % h.period / h.period;
      let y = h.y0; if (!w.freeze && u < .6) y = h.y0 + (h.h - h.y0) * Math.sin(Math.PI * u / .6);
      h.g.position.y = y; h.ball.rotation.x += dt * 5; h.g.visible = y > h.y0 + .1;
      if (h.g.visible && Math.random() < dt * 25) burst(h.x, y, h.z, 0xff8a10, 1, 1.5);
      if (h.g.visible && Math.hypot(P.pos.x - h.x, P.pos.z - h.z, pc - y) < 1.0) hurt(h.x, h.z);
    } else if (h.type === 'sweeper') {
      if (!w.freeze) h.ang += dt * h.speed; h.arm.rotation.y = h.ang;
      const ex = Math.cos(h.ang), ez = -Math.sin(h.ang); const rx2 = P.pos.x - h.x, rz2 = P.pos.z - h.z; const t = clamp(rx2 * ex + rz2 * ez, 0, h.len);
      if (!w.freeze && Math.hypot(rx2 - ex * t, rz2 - ez * t) < .4 + R && P.pos.y < h.y + h.h + .2) hurt(h.x, h.z);
    }
  }
  // teleporters, switches, gates, arenas
  for (const t of w.teles) {
    t.A.ring2.rotation.y += dt * 3; t.B.ring2.rotation.y -= dt * 2; t.A.beam.material.opacity = .14 + Math.sin(w.t * 5) * .06;
    if (w.teleCD <= 0 && Math.hypot(P.pos.x - t.a[0], P.pos.z - t.a[2]) < .9 && Math.abs(P.pos.y - t.a[1]) < .6) {
      burst(P.pos.x, P.pos.y + 1, P.pos.z, 0xff5ad8, 16, 5); P.pos.set(t.b[0], t.b[1] + .05, t.b[2]); P.vel.set(0, 0, 0); w.teleCD = 1.2; sfx('tele'); burst(P.pos.x, P.pos.y + 1, P.pos.z, 0x3affc8, 16, 5); snapCamera();
    }
  }
  for (const s of w.switches) if (!s.on && Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < 1.1 && Math.abs(P.pos.y - s.y) < 1) {
    s.on = true; s.btn.material = M(0x3ccf5a, { emissive: 0x22aa44, emissiveIntensity: 1.2 }); s.btn.position.y = .12; sfx('switch'); toast('Gate opened!'); openGate(s.gate);
  }
  for (const a of w.arenas) if (!a.cleared && a.enemies.every((i) => !w.enemies[i].alive)) { a.cleared = true; toast('Arena cleared!'); openGate(a.gate); }
  for (const g of w.gates) if (g.open && g.k < 1) { g.k = Math.min(1, g.k + dt * 1.2); g.g.position.y = g.col.minY - g.h * g.k; }
}
function openGate(i) { const g = world.gates[i]; if (!g || g.open) return; g.open = true; g.col.off = true; sfx('boom'); shake(.15); }

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
  const magR = P.magnet;
  for (const c of w.coins) {
    if (c.taken) { if (c.t < .3) { c.t += dt; const k = c.t / .3; c.m.position.set(lerp(c.x, P.pos.x, k), lerp(c.y, P.pos.y + 1.6, k) + Math.sin(k * Math.PI) * .6, lerp(c.z, P.pos.z, k)); c.m.scale.setScalar(Math.max(.01, k < .3 ? 1 + k * 2 : 1.6 * (1 - k))); c.m.rotation.y += dt * 30; if (c.t >= .3) c.m.visible = false; } continue; }
    c.m.rotation.y += dt * 3; c.m.position.y = c.y + Math.sin(w.t * 3 + c.x) * .08;
    let dx = c.x - P.pos.x, dy = c.y - pc, dz = c.z - P.pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < magR * magR || c.mag) {
      c.mag = true; c.mv = Math.min(30, (c.mv || 4) + dt * 40);
      const d = Math.sqrt(d2) || 1, step = Math.min(d, c.mv * dt);
      c.x -= dx / d * step; c.y -= dy / d * step; c.z -= dz / d * step; c.m.position.set(c.x, c.y, c.z); c.m.rotation.y += dt * 12;
      dx = c.x - P.pos.x; dy = c.y - pc; dz = c.z - P.pos.z;
    }
    if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(dy) < 2.0) collectCoin(c);
  }
  for (const g of w.gems) {
    if (g.taken) continue; g.m.rotation.y += dt * 2; g.m.position.y = g.y + Math.sin(w.t * 2.5) * .15;
    if (Math.hypot(g.x - P.pos.x, g.z - P.pos.z) < 1.4 && Math.abs(g.y - pc) < 2) { g.taken = true; g.m.visible = false; w.got += 5; w.gemsGot++; sfx('gem'); burst(g.x, g.y, g.z, 0xb06aff, 20, 6); addScore(250, g.x, g.y + .6, g.z, 'GEM! +250'); toast('Hidden gem!'); }
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
    if (e.spawnT > 0) { e.spawnT -= dt; e.g.scale.setScalar(1 - e.spawnT); continue; }
    let hx = 0, hz = 0;
    if (e.type === 'jelly') { e.t += dt * e.speed * .5; e.x = e.a[0]; e.z = e.a[1]; e.cy = lerp(e.y, e.y2, .5 + .5 * Math.sin(e.t * 2)); e.g.position.set(e.x, e.cy, e.z); for (const t of e.extra) t.rotation.x = Math.sin(w.t * 4 + t.position.x * 5) * .3; e.body.scale.y = .5 + Math.sin(w.t * 4) * .06; }
    else {
      const len = Math.max(.01, Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]));
      e.t += dt * e.speed / len * e.dir; if (e.t > 1) { e.t = 1; e.dir = -1; } if (e.t < 0) { e.t = 0; e.dir = 1; }
      if (e.chase) { const ddx = P.pos.x - e.x, ddz = P.pos.z - e.z, dd = Math.hypot(ddx, ddz) || 1; e.x += ddx / dd * e.speed * dt; e.z += ddz / dd * e.speed * dt; hx = ddx; hz = ddz; }
      else { e.x = lerp(e.a[0], e.b[0], e.t); e.z = lerp(e.a[1], e.b[1], e.t); hx = (e.b[0] - e.a[0]) * e.dir; hz = (e.b[1] - e.a[1]) * e.dir; }
      e.cy = e.type === 'flyer' ? e.y + Math.sin(w.t * 3 + e.x) * .25 : e.y;
      e.g.position.set(e.x, e.cy + (e.type === 'flyer' ? 0 : Math.abs(Math.sin(w.t * 9)) * .14), e.z); e.g.rotation.y = Math.atan2(-hx, -hz);
      if (e.wings) { const f = Math.sin(w.t * 20) * .7; e.wings[0].rotation.z = f; e.wings[1].rotation.z = -f; }
      else if (e.type !== 'robot') e.body.scale.set(e.body.scale.x, e.body.scale.y * (1 + Math.sin(w.t * 18) * .004), e.body.scale.z);
    }
    const dx = P.pos.x - e.x, dz = P.pos.z - e.z, dh = Math.hypot(dx, dz), dy = P.pos.y - e.cy;
    if ((P.attackT > 0 && dh < 2.0 && Math.abs(dy) < 1.6) || (P.dashT > 0 && dh < 1.3 && Math.abs(dy) < 1.4)) defeat(e, P.dashT > 0 ? 'dash' : 'spin');
    else if (dh < .85 && P.pos.y < e.cy + 1.0 && P.pos.y + H > e.cy + .1) {
      if (P.vel.y < 0 && dy > .45) { defeat(e, 'stomp'); P.vel.y = 11; P.airJumps = 1; P.airDash = CH.airDash || 1; P.sqV += 6; }
      else hurt(e.x, e.z);
    }
  }
  if (w.boss) updateBoss(dt);
  const g = w.goal;
  g.torus.rotation.z += dt * 1.5; g.swirl.rotation.z -= dt * 3;
  g.portalMat.color.setHSL((w.t * .15) % 1, .85, .62);
  g.sparks.forEach((s, i) => { const a = w.t * 2 + i / g.sparks.length * TAU; s.position.set(Math.cos(a) * 1.5, 1.75 + Math.sin(a * 1.3) * .6, Math.sin(a) * .4); s.rotation.y += dt * 4; });
  if (!w.done && g.active && Math.hypot(g.x - P.pos.x, g.z - P.pos.z) < 1.4 && Math.abs(g.y - P.pos.y) < 2.2) winLevel();
  if (w.timeLeft > 0 && mode === 'play' && !w.done) { w.timeLeft -= dt; if (w.timeLeft <= 0) { w.timeLeft = 0; failLevel('time'); } }
}
function defeat(e, how) {
  if (!e.alive) return;
  e.alive = false; e.dieT = 0; if (!e.minion) { world.got += 3; } world.foes++; sfx('bonk'); shake(.15); hitstop = .06;
  burst(e.x, e.cy + .6, e.z, e.col || 0xc39bd3, 12, 6); burst(e.x, e.cy + 1, e.z, 0xffd23f, 8, 4); puff(e.x, e.cy + .3, e.z, 0xffffff, 8, 3, .25, .4);
  addScore(100, e.x, e.cy + 1.8, e.z, how === 'stomp' ? 'STOMP! +100' : how === 'dash' ? 'DASH! +100' : 'BONK! +100');
}
let hitstop = 0;
// ---------------------------------------------------------------- bosses (every 25th level): health bar, telegraphed attack patterns, dizzy window
function buildBossModel(B) {
  const g = new THREE.Group(); levelGroup.add(g); const [c1, c2, c3] = B.col; const limbs = []; let R2 = 2.0, Hh = 4.2;
  const eye = M(c3, { emissive: c3, emissiveIntensity: 2.6 });
  const S = (c, ex) => SM(c, Object.assign({ roughness: .6 }, ex || {}));
  const arm = (x, y, len, r, col, parent) => { const a = new THREE.Group(); a.position.set(x, y, 0); (parent || g).add(a); mesh(G.ico1, M(col), a, 0, -len / 2, 0, r, len / 2, r); mesh(G.ico0, M(col), a, 0, -len, 0, r * 1.3); limbs.push(a); return a; };
  switch (B.model) {
    case 'golem': mesh(G.ico1, M(c1), g, 0, 2.6, 0, 1.9, 2.0, 1.6); mesh(G.ico0, M(c2), g, 0, 4.5, -.2, 1.0, .9, .9); for (const s of [-1, 1]) { mesh(G.box, eye, g, s * .4, 4.6, -1.0, .3, .16, .1); arm(s * 2.2, 3.6, 2.6, .8, c2); mesh(G.ico1, M(c2), g, s * .9, .7, 0, .8, .9, .8); }
      for (let i = 0; i < 5; i++) mesh(G.oct, M(0x7dff9a, { emissive: 0x33ff77, emissiveIntensity: 1.6 }), g, (i - 2) * .6, 2.6 + Math.sin(i) * .6, -1.75, .15); break;
    case 'treant': mesh(G.cyl8, M(c1), g, 0, 2.2, 0, 2.2, 4.4, 2.2); for (let k = 0; k < 4; k++) mesh(G.ico1, M(k % 2 ? c2 : shade(c2, .8)), g, Math.cos(k * 1.6) * 1.2, 5.2 + (k % 2) * .6, Math.sin(k * 1.6) * 1.2, 1.8); for (const s of [-1, 1]) { mesh(G.sphS, eye, g, s * .5, 3.3, -1.1, .22); arm(s * 1.4, 3.6, 2.8, .45, c1).rotation.z = s * .5; } R2 = 1.8; Hh = 6; break;
    case 'scorpion': mesh(G.sphS, S(c1), g, 0, 1.1, 0, 1.8, .9, 2.4); for (const s of [-1, 1]) { mesh(G.sphS, eye, g, s * .4, 1.6, -2.1, .16); const p = arm(s * 1.4, 1.2, 1.6, .45, c2); p.rotation.x = -1.3; for (let k = 0; k < 3; k++) mesh(G.cyl8, M(c2), g, s * 1.8, .5, -.8 + k * .8, .14, 1, .14).rotation.z = s * .8; }
      { const tail = new THREE.Group(); tail.position.set(0, 1.4, 2); g.add(tail); for (let k = 0; k < 5; k++) mesh(G.sphS, S(c1), tail, 0, k * .7, k * .35 - (k > 3 ? 1 : 0), .5 - k * .05); mesh(G.cone5, eye, tail, 0, 3.4, -.8, .3, .8, .3).rotation.x = -2; limbs.push(tail); } R2 = 2.2; Hh = 3; break;
    case 'dragon': mesh(G.sphS, S(c1), g, 0, 2.2, .4, 1.6, 1.5, 2.2); mesh(G.cyl8, S(c1), g, 0, 3.6, -1.4, .8, 2.4, .8).rotation.x = .6; mesh(G.sphS, S(c1), g, 0, 4.7, -2.3, .9, .7, 1.1); for (const s of [-1, 1]) { mesh(G.sphS, eye, g, s * .4, 4.9, -3.1, .14); mesh(G.cone5, S(c2), g, s * .4, 5.5, -2.0, .2, .8, .2).rotation.x = .5;
      const wg = new THREE.Group(); wg.position.set(s * 1.2, 3.0, .4); g.add(wg); mesh(G.box, M(c2, { transparent: true, opacity: .85 }), wg, s * 2.0, 0, 0, 4, .1, 2.2); limbs.push(wg); mesh(G.cyl8, S(c1), g, s * .9, .6, 0, .5, 1.2, .5); }
      mesh(G.cone7, S(c1), g, 0, 1.6, 3.2, .8, 3, .8).rotation.x = 1.4; R2 = 2.0; Hh = 5.2; break;
    case 'titan': mesh(G.ico1, M(c1), g, 0, 3, 0, 2.0, 2.2, 1.6); mesh(G.ico0, M(c1), g, 0, 5.3, 0, 1, 1, 1); for (let i = 0; i < 8; i++) mesh(G.box, M(c2, { emissive: c2, emissiveIntensity: 2.2 }), g, Math.cos(i) * 1.4, 2.2 + (i % 4) * .6, -1.2 + Math.sin(i) * .2, .1, .9, .08).rotation.z = i;
      for (const s of [-1, 1]) { mesh(G.box, M(c3, { emissive: c3, emissiveIntensity: 3 }), g, s * .38, 5.4, -.9, .3, .14, .1); arm(s * 2.4, 4.2, 3, .9, c1); mesh(G.ico1, M(c1), g, s * 1, .9, 0, .9, 1.1, .9); } Hh = 6.2; R2 = 2.2; break;
    case 'robot': mesh(G.box, S(c1, { metalness: .6, roughness: .3 }), g, 0, 2.8, 0, 3, 2.4, 2); mesh(G.box, S(c2, { metalness: .5 }), g, 0, 4.6, 0, 1.8, 1.2, 1.5); mesh(G.box, eye, g, 0, 4.7, -.78, 1.4, .3, .06);
      for (const s of [-1, 1]) { arm(s * 1.9, 3.8, 2.4, .5, c2); mesh(G.box, S(c2), g, s * .8, .8, 0, .9, 1.6, 1); mesh(G.cyl8, eye, g, s * 1.9, 1.3, -.4, .5, .3, .5).rotation.x = Math.PI / 2; } mesh(G.cyl8, S(0x3a3f5a), g, 0, 5.6, 0, .08, .8, .08); Hh = 5.3; R2 = 1.9; break;
    case 'serpent': for (let k = 0; k < 7; k++) { const s = mesh(G.sphS, S(k % 2 ? c1 : shade(c1, .85)), g, 0, .6 + k * .7, Math.sin(k * .9) * 1.2, 1.1 - k * .05); if (k > 3) limbs.push(s); } mesh(G.sphS, S(c1), g, 0, 5.6, -.8, 1.1, .9, 1.5); for (const s of [-1, 1]) { mesh(G.sphS, eye, g, s * .5, 5.9, -2.0, .18); mesh(G.box, M(c3), g, s * .9, 6.2, -.4, .1, 1, .6).rotation.z = s * .4; } Hh = 6.5; R2 = 1.6; break;
    case 'eagle': mesh(G.sphS, S(c1), g, 0, 3.0, 0, 1.4, 1.6, 1.6); mesh(G.sphS, S(c2), g, 0, 4.6, -.6, .9); mesh(G.cone5, M(c3), g, 0, 4.4, -1.6, .3, .9, .3).rotation.x = -Math.PI / 2; for (const s of [-1, 1]) { mesh(G.sphS, M(0x111111), g, s * .4, 4.8, -1.3, .12);
      const wg = new THREE.Group(); wg.position.set(s * 1.2, 3.4, 0); g.add(wg); for (let k = 0; k < 4; k++) mesh(G.box, M(k % 2 ? c1 : c2), wg, s * (1 + k * .9), -k * .1, k * .15, 1.2, .12, 1.6 - k * .2); limbs.push(wg); mesh(G.cyl8, M(c3), g, s * .5, .8, 0, .2, 1.6, .2); }
      for (let i = 0; i < 4; i++) mesh(G.oct, M(0xffe066, { emissive: 0xffd000, emissiveIntensity: 2 }), g, (i - 1.5) * .6, 2.6, -1.5, .12, .4, .12); Hh = 5.2; R2 = 1.6; break;
    case 'king': mesh(G.cone7, S(c1), g, 0, 2, 0, 3.2, 4, 3.2); mesh(G.sphS, S(0x1a1028), g, 0, 4.6, 0, .9); for (let k = 0; k < 5; k++) mesh(G.cone5, M(c3, { metalness: .8, roughness: .2 }), g, Math.cos(k / 5 * TAU) * .6, 5.6, Math.sin(k / 5 * TAU) * .6, .2, .6, .2);
      for (const s of [-1, 1]) mesh(G.sphS, eye, g, s * .3, 4.7, -.8, .12); { const a = arm(1.6, 3.6, 2, .35, c1); mesh(G.box, M(c2, { emissive: c2, emissiveIntensity: 2.4 }), a, 0, -2.6, -1, .15, .15, 2.6); } arm(-1.6, 3.6, 2, .35, c1); Hh = 6; R2 = 1.7; break;
    default: { const b = mesh(G.sphS, S(c2), g, 0, 3, 0, 2.1, 2.2, 2.1); b.userData.keep = true; mesh(G.sphS, S(0xffd6a5), g, 0, 4.8, -.4, 1.1); for (let k = 0; k < 6; k++) mesh(G.cone5, M(c1, { metalness: .9, roughness: .2, emissive: c1, emissiveIntensity: .4 }), g, Math.cos(k / 6 * TAU) * .8, 6.1, -.4 + Math.sin(k / 6 * TAU) * .8, .25, .8, .25);
      for (const s of [-1, 1]) { mesh(G.sphS, eye, g, s * .38, 4.9, -1.4, .16); arm(s * 2.3, 4, 2.6, .55, c2); mesh(G.sphS, S(c2), g, s * .9, .8, 0, .7); }
      const orbs = new THREE.Group(); orbs.position.y = 3; g.add(orbs); for (let k = 0; k < 4; k++) mesh(G.ico1, M(c3, { emissive: c3, emissiveIntensity: 2.4 }), orbs, Math.cos(k / 4 * TAU) * 3.2, 0, Math.sin(k / 4 * TAU) * 3.2, .35); limbs.push(orbs); Hh = 6.6; R2 = 2.2; }
  }
  castAll(g);
  const dizzy = new THREE.Group(); g.add(dizzy); dizzy.position.y = Hh + .6; dizzy.visible = false;
  for (let k = 0; k < 4; k++) mesh(G.oct, M(0xffe066, { emissive: 0xffd000, emissiveIntensity: 2 }), dizzy, Math.cos(k / 4 * TAU) * 1.1, 0, Math.sin(k / 4 * TAU) * 1.1, .2);
  return { g, limbs, R: R2, Hh, dizzy };
}
const projPool = [];
function initBoss(L) {
  const B = BOSSES[L.boss.idx]; const m = buildBossModel(B);
  const beam = mesh(G.box, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .5, .4) }), levelGroup, 0, 0, 0, 13, .3, .3); beam.visible = false;
  const projs = []; for (let i = 0; i < 24; i++) { const p = mesh(G.ico1, M(B.col[2], { emissive: B.col[2], emissiveIntensity: 2.6 }), levelGroup, 0, -50, 0, .38); p.visible = false; projs.push({ m: p, life: 0, vx: 0, vz: 0 }); }
  const rings = []; for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(1, .14, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.4, .4), transparent: true, opacity: .9 }), levelGroup, 0, .25, 0); r.visible = false; rings.push({ m: r, r: 0, life: 0 }); }
  const marks = []; for (let i = 0; i < 12; i++) { const mk = mesh(new THREE.RingGeometry(.9, 1.25, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, .3, .3), transparent: true, opacity: .8, depthWrite: false }), levelGroup, 0, .04, 0); mk.visible = false;
    const rock = mesh(G.ico0, M(B.col[0]), levelGroup, 0, 0, 0, .7); rock.visible = false; marks.push({ m: mk, rock, t: 0, x: 0, z: 0, life: 0 }); }
  world.boss = Object.assign(m, { B, idx: L.boss.idx, x: 0, z: -5, y: 0, vy: 0, hp: B.hp, max: B.hp, state: 'intro', t: 2.2, rot: 0, atkI: 0, since: 0, beam, beamA: 0, projs, rings, marks, flash: 0, sx: 0, sz: 0, tx: 0, tz: 0, wave: 0, rnd: rng(777 + L.boss.idx), dead: false, need: L.boss.idx < 4 ? 1 : 2 });
  m.g.position.set(0, 0, -5);
  $('bossName').textContent = B.name; $('bossBar').classList.remove('hidden'); updateBossBar();
}
function updateBossBar() { const b = world && world.boss; if (!b) return; $('bossFill').style.width = `${(b.hp / b.max) * 100}%`; }
function bossNext() {
  const b = world.boss; const atks = b.B.attacks;
  const a = atks[b.atkI % atks.length]; b.atkI++; b.cur = a;
  const fast = 1 - .25 * (1 - b.hp / b.max) - .03 * b.idx;
  b.state = 'tele'; b.t = .75 * fast; sfx('roar');
}
function bossStart() {
  const b = world.boss, a = b.cur;
  if (a === 'charge') { const dx = P.pos.x - b.x, dz = P.pos.z - b.z, d = Math.hypot(dx, dz) || 1; b.sx = dx / d; b.sz = dz / d; b.state = 'charge'; b.t = 1.3; }
  else if (a === 'slam') { b.state = 'slam'; b.t = .9; b.tx = clamp(P.pos.x, -11, 11); b.tz = clamp(P.pos.z, -11, 11); b.fx = b.x; b.fz = b.z; }
  else if (a === 'volley') { b.state = 'volley'; b.t = 1.8; b.wave = 0; }
  else if (a === 'rain') { b.state = 'rain'; b.t = 1.8; const n = 6 + Math.min(6, b.idx); for (let i = 0; i < n; i++) { const mk = b.marks[i]; const r = i === 0 ? 0 : 1.5 + b.rnd() * 5, a2 = b.rnd() * TAU; mk.x = clamp(P.pos.x + Math.cos(a2) * r, -12.5, 12.5); mk.z = clamp(P.pos.z + Math.sin(a2) * r, -12.5, 12.5); mk.t = 1.1 + i * .04; mk.life = mk.t + .5; mk.m.visible = true; mk.m.position.set(mk.x, .04, mk.z); } }
  else if (a === 'sweep') { b.state = 'sweep'; b.t = 3.4; b.beamA = Math.atan2(-(P.pos.z - b.z), P.pos.x - b.x) + Math.PI * .6; b.beam.visible = true; sfx('zap'); }
  else if (a === 'minions') { b.state = 'minions'; b.t = 1.0; const n = 2 + (b.idx > 6 ? 1 : 0); for (let i = 0; i < n; i++) { const a2 = i / n * TAU + b.rnd(); const e = buildEnemy({ a: [b.x + Math.cos(a2) * 3.5, b.z + Math.sin(a2) * 3.5], b: [b.x + Math.cos(a2) * 3.5, b.z + Math.sin(a2) * 3.5], y: 0, speed: 1.6 + b.idx * .1, type: world.W.props === 'city' ? 'robot' : world.W.props === 'castle' ? 'shadow' : 'walker' }, world.W, b.rnd); e.chase = true; e.minion = true; e.spawnT = .6; e.g.scale.setScalar(.01); world.enemies.push(e); } puff(b.x, 1, b.z, 0xffffff, 14, 4, .4, .5); }
}
function bossEnd() { const b = world.boss; b.since++; b.beam.visible = false; if (b.since >= b.need) { b.since = 0; b.state = 'tired'; b.t = b.B.tired; b.dizzy.visible = true; sfx('fanfare'); popup('DIZZY! Hit it!', b.x, b.Hh + 1.5, b.z, 'big'); } else { b.state = 'idle'; b.t = .55; } }
function shootProj(b, ang, spd) { const p = b.projs.find((q) => q.life <= 0); if (!p) return; p.life = 3; p.vx = Math.cos(ang) * spd; p.vz = Math.sin(ang) * spd; p.m.position.set(b.x + Math.cos(ang) * b.R, 1.1, b.z + Math.sin(ang) * b.R); p.m.visible = true; }
function updateBoss(dt) {
  const b = world.boss; b.t -= dt; b.flash -= dt;
  const dx = P.pos.x - b.x, dz = P.pos.z - b.z, dist = Math.hypot(dx, dz);
  const face = Math.atan2(-dx, -dz);
  const turn = (k) => { let d = face - b.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); b.rot += d * Math.min(1, dt * k); };
  const tt = world.t;
  for (const l of b.limbs) l.rotation.x = Math.sin(tt * (b.state === 'tired' ? 2 : 4) + l.position.x) * .35;
  switch (b.state) {
    case 'intro': turn(3); if (b.t <= 0) { b.state = 'idle'; b.t = .6; } break;
    case 'idle': turn(6); if (dist > 7) { b.x += dx / dist * 2.6 * dt; b.z += dz / dist * 2.6 * dt; } if (b.t <= 0) bossNext(); break;
    case 'tele': turn(8); b.g.position.y = Math.abs(Math.sin(tt * 30)) * .15; if (b.t <= 0) { b.g.position.y = 0; bossStart(); } break;
    case 'charge': b.x += b.sx * (15 + b.idx * .6) * dt; b.z += b.sz * (15 + b.idx * .6) * dt; b.rot = Math.atan2(-b.sx, -b.sz); if (Math.random() < .5) puff(b.x, .2, b.z, 0xe9e2d0, 1, 1.5, .5, .5);
      if (Math.abs(b.x) > 11.5 || Math.abs(b.z) > 11.5 || b.t <= 0) { b.x = clamp(b.x, -11.5, 11.5); b.z = clamp(b.z, -11.5, 11.5); shake(.3); sfx('boom'); puff(b.x, 1, b.z, 0xffffff, 10, 4, .5, .4); bossEnd(); } break;
    case 'slam': { const k = 1 - Math.max(0, b.t) / .9; b.x = lerp(b.fx, b.tx, k); b.z = lerp(b.fz, b.tz, k); b.y = Math.sin(Math.PI * k) * 7;
      if (b.t <= 0) { b.y = 0; shake(.45); sfx('boom'); puff(b.x, .3, b.z, 0xe9e2d0, 16, 6, .6, .4); const r = b.rings.find((q) => q.life <= 0) || b.rings[0]; r.r = b.R; r.life = 1.5; r.x = b.x; r.z = b.z; r.m.visible = true; bossEnd(); } } break;
    case 'volley': turn(8); if (b.t < 1.8 - b.wave * .55 && b.wave < 3) { const n = 5 + Math.min(2, b.idx >> 2), base = Math.atan2(dz, dx); for (let i = 0; i < n; i++) shootProj(b, base + (i - (n - 1) / 2) * .27 + (b.wave % 2) * .135, 7.5 + b.idx * .3); b.wave++; sfx('shoot'); } if (b.t <= 0) bossEnd(); break;
    case 'rain': turn(4); if (b.t <= 0) bossEnd(); break;
    case 'sweep': b.beamA -= dt * (TAU / 3.2) * (b.idx % 2 ? -1 : 1); b.rot = Math.atan2(-Math.cos(b.beamA), Math.sin(b.beamA));
      b.beam.position.set(b.x + Math.cos(b.beamA) * 6.5 + Math.cos(b.beamA) * b.R * .5, .6, b.z - Math.sin(b.beamA) * (6.5 + b.R * .5)); b.beam.rotation.y = b.beamA;
      { const ex = Math.cos(b.beamA), ez = -Math.sin(b.beamA); const t2 = clamp(dx * ex + dz * ez, 0, 13 + b.R); if (Math.hypot(dx - ex * t2, dz - ez * t2) < .55 + R && P.pos.y < .9) hurt(b.x, b.z); }
      if (b.t <= 0) bossEnd(); break;
    case 'minions': turn(4); if (b.t <= 0) bossEnd(); break;
    case 'tired': b.dizzy.rotation.y += dt * 4; b.g.rotation.z = Math.sin(tt * 3) * .08; if (b.t <= 0) { b.dizzy.visible = false; b.g.rotation.z = 0; b.state = 'idle'; b.t = .8; sfx('roar'); } break;
    case 'hurt': b.g.rotation.z = 0; if (b.t <= 0) { if (b.hp <= 0) { b.state = 'dying'; b.t = 2.2; sfx('boom'); for (const p of b.projs) { p.life = 0; p.m.visible = false; } for (const r of b.rings) { r.life = 0; r.m.visible = false; } for (const mk of b.marks) { mk.life = 0; mk.m.visible = false; mk.rock.visible = false; mk.hit = false; } } else { b.state = 'idle'; b.t = .7; } } break;
    case 'dying': b.g.rotation.y += dt * 8; b.g.scale.setScalar(Math.max(.01, b.t / 2.2)); if (Math.random() < .5) burst(b.x + (Math.random() - .5) * 3, 1 + Math.random() * 4, b.z + (Math.random() - .5) * 3, [0xffd23f, 0xff5fa2, b.B.col[2]][(Math.random() * 3) | 0], 6, 7);
      if (b.t <= 0) { b.state = 'dead'; b.dead = true; b.g.visible = false; world.goal.active = true; world.goal.g.visible = true; world.goal.g.position.set(world.goal.x, world.goal.y, world.goal.z); sfx('fanfare'); toast(`${b.B.name} defeated!`); addScore(1000, b.x, 3, b.z, 'BOSS +1000');
        for (const e of world.enemies) if (e.minion && e.alive) defeat(e, 'spin'); } break;
  }
  if (b.state !== 'dying' && b.state !== 'dead') b.g.rotation.y = b.rot;
  b.g.position.x = b.x; b.g.position.z = b.z; if (b.state === 'slam') b.g.position.y = b.y; else if (b.state !== 'tele') b.g.position.y = 0;
  if (b.flash > 0) b.g.visible = Math.floor(b.flash * 20) % 2 === 0; else if (!b.dead) b.g.visible = true;
  // projectiles, shockwave rings, falling rocks
  for (const p of b.projs) if (p.life > 0) { p.life -= dt; p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.rotation.y += dt * 6;
    if (Math.abs(p.m.position.x) > 15 || Math.abs(p.m.position.z) > 15) p.life = 0;
    if (Math.hypot(P.pos.x - p.m.position.x, P.pos.z - p.m.position.z) < .62 && P.pos.y < 1.5 && P.pos.y + H > .6) { hurt(p.m.position.x, p.m.position.z); p.life = 0; }
    if (p.life <= 0) p.m.visible = false; }
  for (const r of b.rings) if (r.life > 0) { r.life -= dt; r.r += dt * 10; r.m.scale.set(r.r, 1, r.r); r.m.position.set(r.x, .25, r.z); r.m.material.opacity = Math.min(.9, r.life);
    const d = Math.hypot(P.pos.x - r.x, P.pos.z - r.z); if (Math.abs(d - r.r) < .55 && P.pos.y < .6) hurt(r.x, r.z); if (r.life <= 0 || r.r > 20) { r.life = 0; r.m.visible = false; } }
  for (const mk of b.marks) if (mk.life > 0) { mk.life -= dt; mk.t -= dt; mk.m.material.opacity = .5 + Math.sin(world.t * 20) * .3;
    if (mk.t > 0 && mk.t < .45) { mk.rock.visible = true; mk.rock.position.set(mk.x, mk.t / .45 * 14, mk.z); }
    if (mk.t <= 0 && !mk.hit) { mk.hit = true; mk.rock.visible = false; puff(mk.x, .3, mk.z, 0xd8d0c0, 8, 3, .35, .4); sfx('crumble'); if (Math.hypot(P.pos.x - mk.x, P.pos.z - mk.z) < 1.35 && P.pos.y < 2) hurt(mk.x, mk.z); }
    if (mk.life <= 0) { mk.m.visible = false; mk.rock.visible = false; mk.hit = false; } }
  // hero vs boss
  if (b.state === 'dying' || b.state === 'dead') return;
  const vulnerable = b.state === 'tired';
  const top = b.y + b.Hh;
  if (vulnerable) {
    const hitSpin = P.attackT > 0 && dist < b.R + 1.7 && P.pos.y < top;
    const hitDash = P.dashT > 0 && dist < b.R + .9 && P.pos.y < top;
    const hitStomp = P.vel.y < 0 && P.pos.y > top - 1.2 && P.pos.y < top + .6 && dist < b.R + .4;
    if (hitSpin || hitDash || hitStomp) {
      b.hp--; b.state = 'hurt'; b.t = .8; b.flash = .6; b.dizzy.visible = false; hitstop = .12; shake(.4); sfx('bossHit');
      burst(b.x, 2.5, b.z, b.B.col[2], 24, 8); burst(b.x, 3, b.z, 0xffffff, 12, 6); addScore(300, b.x, b.Hh + 1, b.z, hitStomp ? 'STOMP! +300' : 'HIT! +300'); updateBossBar();
      const d = dist || 1; P.vel.set(dx / d * 10, 9, dz / d * 10); P.knock = .3; P.invuln = Math.max(P.invuln, .6);
    } else if (dist < b.R + R && P.pos.y < top - .3) { const d = dist || 1; P.pos.x = b.x + dx / d * (b.R + R); P.pos.z = b.z + dz / d * (b.R + R); }
  } else if (b.state !== 'hurt' && b.state !== 'intro' && dist < b.R + .35 && P.pos.y < b.y + b.Hh - .3 && P.pos.y + H > b.y) hurt(b.x, b.z);
}
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
  for (const b of world.colliders) if (!b.off && P.pos.x > b.minX && P.pos.x < b.maxX && P.pos.z > b.minZ && P.pos.z < b.maxZ && b.maxY <= P.pos.y + .05 && b.maxY > syy) syy = b.maxY;
  heroShadow.visible = syy > -999 && tier === 0;
  heroLight.position.set(P.pos.x, P.pos.y + 2.4, P.pos.z + .5);
  shieldBubble.visible = P.shield > 0 && mode === 'play'; if (shieldBubble.visible) { shieldBubble.position.set(P.pos.x, P.pos.y + .8, P.pos.z); shieldBubble.scale.setScalar(1 + Math.sin(t * 6) * .04); }
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
const screens = ['splash', 'home', 'map', 'levels', 'chars', 'shop', 'daily', 'settings', 'howto', 'pause', 'win', 'fail', 'final', 'confirm'];
let mode = 'splash', curWorld = 0, prevScreen = 'home';
function show(id) { for (const s of screens) $(s).classList.toggle('show', s === id); }
function setPlayUI(on) {
  if (!on) { $('hint').classList.remove('on'); $('toast').classList.remove('on'); for (const p of pops) { p.life = 0; p.d.style.display = 'none'; } $('bossBar').classList.add('hidden'); }
  else if (world && world.boss) $('bossBar').classList.remove('hidden');
  $('hud').classList.toggle('hidden', !on); $('touch').classList.toggle('hidden', !(on && isTouch));
}
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 1100); }
let hintTimer = 0;
function hint(msg, ms) { const el = $('hint'); el.textContent = msg; el.classList.add('on'); clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove('on'), ms || 5000); }
let hudCache = '';
function pulseCoinHUD() { const el = $('hudCoins').parentElement; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
function updateHUD(force) {
  if (!world) return;
  const tl = Math.ceil(world.timeLeft);
  const s = `${world.got}/${world.total}|${P.hearts}|${P.maxHearts}|${world.score}|${tl}|${P.shield}`;
  if (s === hudCache && !force) return; hudCache = s;
  $('hudCoins').textContent = `${world.got}/${world.total}`;
  $('hudScore').textContent = world.score;
  $('hudHearts').innerHTML = Array.from({ length: P.maxHearts }, (_, i) => `<span class="${i < P.hearts ? '' : 'off'}">♥</span>`).join('') + (P.shield > 0 ? '<b class="sh">🛡</b>' : '');
  $('hudLevel').textContent = `${lvlLabel(world.L.n)} ${world.L.name}`;
  $('hudTimer').classList.toggle('hidden', !world.L.timer); $('hudTimer').classList.toggle('low', tl <= 15);
  if (world.L.timer) $('hudTimerTxt').textContent = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
}
const worldStars = (w) => { let s = 0; for (let n = w * 25 + 1; n <= w * 25 + 25; n++) s += (save.levels[n] || {}).stars || 0; return s; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const canClaim = () => save.daily.last !== today();
function refreshHome() {
  $('walletTxt').textContent = save.wallet; $('starTxt').textContent = `${totalStars()}/750`;
  const n = Math.min(TOTAL, save.unlocked); $('btnPlay').textContent = save.levels[TOTAL] && n === TOTAL ? '▶ Play (all clear!)' : `▶ Play ${lvlLabel(n)}`;
  $('btnDaily').classList.toggle('badge', canClaim());
}
function walletUI() { for (const id of ['walletTxt', 'shopWallet', 'charWallet']) if ($(id)) $(id).textContent = save.wallet; }
function buildMap() {
  const grid = $('worldGrid'); grid.innerHTML = '';
  WORLDS.forEach((W, w) => {
    const locked = save.unlocked <= w * 25; const st = worldStars(w); const bossDone = !!save.levels[w * 25 + 25];
    const b = document.createElement('button'); b.className = 'worldCard' + (locked ? ' locked' : '');
    const c1 = '#' + new THREE.Color(W.sky[0]).getHexString(), c2 = '#' + new THREE.Color(W.sky[1]).getHexString(), c3 = '#' + new THREE.Color(W.top).getHexString();
    b.style.background = locked ? '' : `linear-gradient(160deg, ${c1}, ${c2} 60%, ${c3})`;
    b.innerHTML = `<span class="wn">${locked ? '🔒' : 'World ' + (w + 1)}</span><span class="wt">${W.name}</span><span class="wd">${W.diff} · Levels ${w * 25 + 1}–${w * 25 + 25}</span><span class="ws">★ ${st}/75 ${bossDone ? '· 👑 ' + W.boss + ' defeated' : '· Boss: ' + W.boss}</span>`;
    b.addEventListener('click', () => { if (locked) { sfx('deny'); toast(`Clear World ${w} first!`); return; } sfx('click'); goWorld(w); });
    grid.appendChild(b);
  });
}
function buildLevelGrid(w) {
  const W = WORLDS[w]; $('worldTitle').textContent = `World ${w + 1} · ${W.name}`; $('worldSub').textContent = `${W.diff} · ★ ${worldStars(w)}/75`;
  $('btnPrevW').disabled = w === 0; $('btnNextW').disabled = w === 9 || save.unlocked <= (w + 1) * 25;
  const grid = $('levelGrid'); grid.innerHTML = '';
  for (let k = 0; k < 25; k++) {
    const n = w * 25 + k + 1, i = n - 1; const locked = n > save.unlocked; const rec = save.levels[n] || {}; const st = rec.stars || 0; const boss = k === 24;
    const b = document.createElement('button'); b.className = 'lvlTile' + (locked ? ' locked' : '') + (boss ? ' boss' : '') + (rec.clears || rec.skipped ? ' done' : '');
    const nm = boss ? BOSSES[w].name : (i < LEVELS.length ? LEVELS[i].name : '');
    b.innerHTML = `<span class="n">${locked ? '🔒' : boss ? '👑' : k + 1}</span><span class="nm">${locked ? lvlLabel(n) : (nm || lvlLabel(n))}</span><span class="st">${rec.skipped && !st ? '<em>skipped</em>' : [0, 1, 2].map((q) => q < st ? '★' : '<i>★</i>').join('')}</span>`;
    b.addEventListener('click', () => { if (locked) { sfx('deny'); return; } sfx('click'); startLevel(i); });
    grid.appendChild(b);
  }
}
function buildChars() {
  walletUI(); const grid = $('charGrid'); grid.innerHTML = '';
  for (const c of CHARACTERS) {
    const owned = save.owned.includes(c.id), sel = save.char === c.id; const sk = Object.assign({ body: 0x22b8b0, scarf: 0xffd23f, hood: 0xff7f3f }, c.skin);
    const hx = (v) => '#' + new THREE.Color(v).getHexString();
    const d = document.createElement('div'); d.className = 'charCard' + (sel ? ' sel' : '');
    d.innerHTML = `<div class="av" style="background:radial-gradient(circle at 50% 38%, ${hx(sk.hood)} 0 30%, transparent 31%), radial-gradient(circle at 50% 75%, ${hx(sk.body)} 0 34%, transparent 35%), linear-gradient(${hx(sk.scarf)}22, #fff0)"></div><b>${c.name}</b><small>${c.desc}</small>`;
    const btn = document.createElement('button'); btn.className = sel ? 'ghost2' : owned ? '' : 'buy';
    btn.innerHTML = sel ? 'Selected ✓' : owned ? 'Select' : `<span class="coin-ico"></span> ${c.cost}`;
    btn.onclick = () => {
      if (sel) return;
      if (!owned) { if (save.wallet < c.cost) { sfx('deny'); toast(`Need ${c.cost - save.wallet} more coins`); return; } save.wallet -= c.cost; save.owned.push(c.id); sfx('buy'); toast(`${c.name} unlocked!`); }
      else sfx('click');
      save.char = c.id; writeSave(); charStats(); setHeroSkin(CH.skin); buildChars();
    };
    d.appendChild(btn); grid.appendChild(d);
  }
}
function buildShop() {
  walletUI(); const grid = $('shopGrid'); grid.innerHTML = '';
  for (const p of POWERUPS) {
    const d = document.createElement('div'); d.className = 'shopItem';
    d.innerHTML = `<span class="ic">${p.icon}</span><div class="tx"><b>${p.name}</b><small>${p.desc} Owned: ${save.inv[p.id] || 0}</small></div>`;
    const btn = document.createElement('button'); btn.className = 'buy'; btn.innerHTML = `<span class="coin-ico"></span> ${p.cost}`;
    btn.onclick = () => { if (save.wallet < p.cost) { sfx('deny'); toast('Not enough coins'); return; } save.wallet -= p.cost; save.inv[p.id] = (save.inv[p.id] || 0) + 1; writeSave(); sfx('buy'); toast(`${p.name} +1`); buildShop(); };
    d.appendChild(btn); grid.appendChild(d);
  }
}
function buildDaily() {
  const grid = $('dailyGrid'); grid.innerHTML = ''; const can = canClaim();
  const y = new Date(); y.setDate(y.getDate() - 1); const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  const streak = can ? (save.daily.last === ys ? save.daily.streak : 0) : save.daily.streak - 1; const nextDay = ((streak % 7) + 7) % 7;
  DAILY.forEach((amt, i) => { const d = document.createElement('div'); d.className = 'day' + (i < nextDay ? ' got' : '') + (i === nextDay && can ? ' now' : ''); d.innerHTML = `<small>Day ${i + 1}</small><span class="coin-ico"></span><b>${amt}</b>`; grid.appendChild(d); });
  $('btnClaim').disabled = !can; $('btnClaim').textContent = can ? `Claim ${DAILY[nextDay]} coins` : 'Come back tomorrow!';
  $('btnClaim').onclick = () => { if (!canClaim()) return; const amt = DAILY[nextDay]; save.wallet += amt; save.daily = { last: today(), streak: streak + 1 }; writeSave(); sfx('fanfare'); toast(`+${amt} coins!`); buildDaily(); refreshHome(); };
}
function buildSettings() {
  const s = save.settings;
  $('setSound').checked = s.sound; $('setMusic').value = s.music; $('setSfx').value = s.sfx; $('setQuality').value = s.quality; $('setCam').value = s.camSens; $('setFps').checked = s.showFps;
}
function bindSettings() {
  const s = save.settings, upd = () => { writeSave(); syncAudio(); };
  $('setSound').onchange = (e) => { s.sound = e.target.checked; upd(); sfx('click'); };
  $('setMusic').oninput = (e) => { s.music = +e.target.value; upd(); };
  $('setSfx').oninput = (e) => { s.sfx = +e.target.value; upd(); sfx('coin'); };
  $('setQuality').onchange = (e) => { s.quality = e.target.value; writeSave(); pickQuality(); };
  $('setCam').oninput = (e) => { s.camSens = +e.target.value; writeSave(); };
  $('setFps').onchange = (e) => { s.showFps = e.target.checked; writeSave(); $('fpsTxt').classList.toggle('hidden', !s.showFps); };
  $('btnReset').onclick = () => { sfx('click'); show('confirm'); };
  $('btnConfirmNo').onclick = () => { sfx('click'); show('settings'); };
  $('btnConfirmYes').onclick = () => { const keep = save.settings; Object.keys(save).forEach((k) => delete save[k]); Object.assign(save, defaults(), { settings: keep }); writeSave(); charStats(); setHeroSkin(CH.skin); sfx('deny'); toast('Progress reset'); goHome(); };
}
function menu(id, backdropIdx) { mode = 'menu'; setPlayUI(false); show(id); if (backdropIdx !== undefined) menuBackdrop(backdropIdx); }
function goHome() { refreshHome(); menu('home', Math.min(save.unlocked, TOTAL) - 1); menuMusic(); }
function goMap() { buildMap(); menu('map', Math.min(save.unlocked, TOTAL) - 1); }
function goWorld(w) { curWorld = w; buildLevelGrid(w); menu('levels', Math.min(w * 25 + 1, save.unlocked) - 1); }
function goLevels() { goWorld(world ? world.L.world || 0 : 0); }
function menuBackdrop(i) { if (!world || world.idx !== i || world.t > 0 || world.done) { loadLevel(i); } }
let lastMusic = '';
function menuMusic() { const W = WORLDS[world ? world.L.world || 0 : 0]; const key = 'm' + W.name; if (lastMusic === key) return; lastMusic = key; playMusic(Object.assign({ seed: 3, mood: 'bright' }, W.music, { bpm: W.music.bpm - 8 })); }
function startLevel(i) {
  charStats(); setHeroSkinIfNeeded();
  const used = [];
  P.maxHearts = CH.hearts; P.shield = CH.shield ? 1 : 0; P.shieldT = 0; P.magnet = 3.6; P.doubler = false;
  if (save.inv.heart > 0) { save.inv.heart--; P.maxHearts++; used.push('❤'); }
  if (save.inv.shield > 0) { save.inv.shield--; P.shield++; used.push('🛡'); }
  if (save.inv.magnet > 0) { save.inv.magnet--; P.magnet = 7.2; used.push('🧲'); }
  if (save.inv.doubler > 0 && !(save.levels[i + 1] || {}).clears) { save.inv.doubler--; P.doubler = true; used.push('✖2'); }
  if (used.length) writeSave();
  loadLevel(i); mode = 'play'; show(null); $('bossBar').classList.toggle('hidden', !world.boss); setPlayUI(true);
  const L = world.L, W = world.W;
  camDist = L.boss ? 10.5 : 7.5;
  hint(L.hint, 6500); toast(`${lvlLabel(L.n)} ${L.name}`); if (used.length) setTimeout(() => toast(`Power-ups: ${used.join(' ')}`), 1300);
  lastMusic = 'l' + i;
  playMusic(Object.assign({ seed: 7 + i, mood: 'bright' }, W.music, L.boss ? { bpm: W.music.bpm + 10, mood: 'dark' } : {}));
}
let skinId = 'hero';
function setHeroSkinIfNeeded() { if (skinId !== CH.id) { skinId = CH.id; setHeroSkin(CH.skin); } }
function pauseGame() { if (mode !== 'play') return; mode = 'paused'; show('pause'); }
function resumeGame() { if (mode !== 'paused') return; mode = 'play'; show(null); }
function failLevel(reason) {
  if (mode !== 'play' || world.done) { if (world && world.god) return; if (mode !== 'play') return; }
  mode = 'fail'; sfx('fall');
  $('failTitle').textContent = reason === 'time' ? "Time's up!" : 'Out of hearts!';
  $('failText').textContent = reason === 'time' ? 'Continue from your last checkpoint with +30 seconds, or try again.' : 'Continue from your last checkpoint with full hearts, or try again.';
  $('btnSkip').disabled = false; $('btnSkip').innerHTML = `Skip level (<span class="coin-ico"></span> 500)`;
  failReason = reason; setTimeout(() => { if (mode === 'fail') show('fail'); }, 350);
}
let failReason = '';
function continueLevel() { if (mode !== 'fail') return; P.hearts = P.maxHearts; if (failReason === 'time') world.timeLeft += 30; resetPlayer(false); mode = 'play'; show(null); updateHUD(true); }
function skipLevel() {
  const n = world.L.n;
  if (save.wallet < 500) { sfx('deny'); toast('Skipping costs 500 coins'); return; }
  save.wallet -= 500; const prev = save.levels[n] || {}; save.levels[n] = Object.assign({ stars: 0, best: 0, score: 0, clears: 0 }, prev, { skipped: true });
  save.unlocked = Math.max(save.unlocked, Math.min(TOTAL, n + 1)); writeSave(); sfx('buy'); toast('Level skipped');
  if (n >= TOTAL) showFinal(); else startLevel(n);
}
function winLevel() {
  const w = world; w.done = true; mode = 'win'; sfx('win'); shake(.12);
  const frac = w.total ? w.got / w.total : 1;
  const stars = 1 + (frac >= .6 ? 1 : 0) + (w.got >= w.total ? 1 : 0);
  const n = w.L.n; const prev = save.levels[n] || {};
  let full = Math.round(50 + ((w.L.maxReward || rewardFor(n)) - 50) * frac);
  if (w.L.boss) full += 300;
  if (P.doubler && !prev.clears) full *= 2;
  const reward = prev.clears ? Math.max(10, Math.round(full * .2)) : full; // replays pay 20% (anti-farming)
  save.levels[n] = { stars: Math.max(prev.stars || 0, stars), best: Math.max(prev.best || 0, w.got), score: Math.max(prev.score || 0, w.score), clears: (prev.clears || 0) + 1 };
  save.wallet += reward; save.unlocked = Math.max(save.unlocked, Math.min(TOTAL, n + 1)); writeSave();
  $('winTitle').textContent = n === TOTAL ? 'UNIVERSE SAVED!' : w.L.boss ? 'World Conquered!' : 'Level Clear!';
  $('winCoins').textContent = `${w.got}/${w.total}`; $('winFoes').textContent = w.foes; $('winScore').textContent = w.score + (w.score > (prev.score || 0) && prev.score ? ' (best!)' : '');
  $('winReward').textContent = `+${reward}` + (prev.clears ? ' (replay)' : '') + (P.doubler && !prev.clears ? ' (x2)' : '');
  const spans = $('winStars').children; for (let k = 0; k < 3; k++) { spans[k].classList.remove('on'); if (k < stars) setTimeout(() => spans[k].classList.add('on'), 250 + k * 280); }
  $('btnNext').textContent = n === TOTAL ? 'Finale ▶' : w.L.boss ? `Enter World ${Math.floor(n / 25) + 1} ▶` : 'Next level ▶';
  setPlayUI(false); setTimeout(() => show('win'), 450); sfx('fanfare');
  for (let i = 0; i < 3; i++) setTimeout(() => burst(w.goal.x + (Math.random() - .5) * 3, w.goal.y + 2 + Math.random() * 2, w.goal.z, [0xff5fa2, 0xffd23f, 0x5cf0ff][i], 24, 7), i * 160);
}
function showFinal() {
  mode = 'menu'; setPlayUI(false);
  const cleared = Object.values(save.levels).filter((l) => l.clears).length;
  $('finalStats').innerHTML = `Levels cleared: <b>${cleared}/250</b><br>Stars: <b>${totalStars()}/750</b><br>Bosses defeated: <b>${[...Array(10)].filter((_, w) => (save.levels[w * 25 + 25] || {}).clears).length}/10</b><br>Coins in wallet: <b>${save.wallet}</b>`;
  show('final'); sfx('fanfare'); playMusic({ root: 60, scale: 'major', bpm: 140, seed: 250, mood: 'bright' });
  finaleT = 6;
}
let finaleT = 0;

$('btnPlay').onclick = () => { sfx('click'); const n = Math.min(TOTAL, save.unlocked); startLevel(n - 1); };
$('btnMap').onclick = () => { sfx('click'); goMap(); };
$('btnChars').onclick = () => { sfx('click'); buildChars(); show('chars'); };
$('btnShop').onclick = () => { sfx('click'); buildShop(); show('shop'); };
$('btnDaily').onclick = () => { sfx('click'); buildDaily(); show('daily'); };
$('btnSettings').onclick = () => { sfx('click'); prevScreen = 'home'; buildSettings(); show('settings'); };
$('btnHow').onclick = () => { sfx('click'); show('howto'); };
$('btnHowBack').onclick = () => { sfx('click'); show('home'); };
for (const id of ['btnMapBack', 'btnCharsBack', 'btnShopBack', 'btnDailyBack']) $(id).onclick = () => { sfx('click'); goHome(); };
$('btnSettingsBack').onclick = () => { sfx('click'); if (prevScreen === 'pause') show('pause'); else goHome(); };
$('btnLevelsBack').onclick = () => { sfx('click'); goMap(); };
$('btnPrevW').onclick = () => { if (curWorld > 0) { sfx('click'); goWorld(curWorld - 1); } };
$('btnNextW').onclick = () => { if (curWorld < 9 && save.unlocked > (curWorld + 1) * 25) { sfx('click'); goWorld(curWorld + 1); } };
$('btnPause').onclick = () => { sfx('click'); pauseGame(); };
$('btnResume').onclick = () => { sfx('click'); resumeGame(); };
$('btnRetry').onclick = () => { sfx('click'); startLevel(world.idx); };
$('btnPauseSkip').onclick = () => { sfx('click'); skipLevel(); };
$('btnPauseSettings').onclick = () => { sfx('click'); prevScreen = 'pause'; buildSettings(); show('settings'); };
$('btnPauseLevels').onclick = () => { sfx('click'); goLevels(); };
$('btnPauseHome').onclick = () => { sfx('click'); goHome(); };
$('btnNext').onclick = () => { sfx('click'); const n = world.L.n; if (n >= TOTAL) showFinal(); else startLevel(n); };
$('btnWinRetry').onclick = () => { sfx('click'); startLevel(world.idx); };
$('btnWinLevels').onclick = () => { sfx('click'); goLevels(); };
$('btnContinue').onclick = () => { sfx('click'); continueLevel(); };
$('btnRestart').onclick = () => { sfx('click'); startLevel(world.idx); };
$('btnSkip').onclick = () => { sfx('click'); skipLevel(); };
$('btnFailLevels').onclick = () => { sfx('click'); goLevels(); };
$('btnFinalHome').onclick = () => { sfx('click'); goMap(); };
bindSettings();
$('splash').addEventListener('click', () => {
  if (mode !== 'splash' || !ready) return; audio(); sfx('click');
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
  if (e.code === 'KeyR' && mode === 'fail') continueLevel();
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
    const cs = save.settings.camSens || 1; camYaw -= (e.clientX - p.x) * .006 * cs; camPitch = clamp(camPitch + (e.clientY - p.y) * .004 * cs, .08, 1.0);
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
let last = performance.now(), ready = false, fpsAcc = 0, fpsN = 0, fps = 60, fpsShow = 0;
function render() { if (composer) composer.render(); else renderer.render(scene, camera); }
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; if (dt > .05) dt = .05; if (dt <= 0) dt = .001;
  fpsAcc += dt; fpsN++; fpsShow += dt;
  if (fpsAcc > 2) { // auto quality: drop resolution, then effects, when a phone struggles
    fps = fpsN / fpsAcc;
    if (autoQ && fps < 40 && mode === 'play') {
      if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - .25); applyQuality(tier, true); }
      else if (tier > 0) applyQuality(tier - 1);
      else if (pixelRatio > .75) { pixelRatio -= .125; applyQuality(0, true); }
    }
    if (save.settings.showFps) $('fpsTxt').textContent = `${Math.round(fps)} fps · Q${tier}`;
    fpsAcc = 0; fpsN = 0;
  }
  const t = now / 1000;
  if (world) {
    let sdt = dt; if (hitstop > 0) { hitstop -= dt; sdt = dt * .1; }
    if (mode === 'play') { updateWorld(sdt); updatePlayer(sdt); updateEntities(sdt); updateCamera(dt); updateHUD(); }
    else if (mode === 'win') { updateEntities(dt); P.facing += dt * 4; P.vel.set(0, 0, 0); updateCamera(dt); }
    else if (mode === 'fail') { updateCamera(dt); }
    else if (mode === 'menu' || mode === 'splash') {
      const a = t * .12;
      camera.position.set(P.pos.x + Math.sin(a) * 9, P.pos.y + 3.2, P.pos.z + Math.cos(a) * 9); camera.lookAt(P.pos.x, P.pos.y + 1.2, P.pos.z - 3);
      P.facing = Math.atan2(-(camera.position.x - P.pos.x), -(camera.position.z - P.pos.z)) + Math.PI;
      world.goal.torus.rotation.z += dt; for (const c of world.coins) c.m.rotation.y += dt * 3;
      if (finaleT > 0 && $('final').classList.contains('show') && Math.random() < .25) burst(P.pos.x + (Math.random() - .5) * 8, P.pos.y + 2 + Math.random() * 4, P.pos.z - 2 - Math.random() * 4, [0xff5fa2, 0xffd23f, 0x5cf0ff, 0x8dff6a][(Math.random() * 4) | 0], 16, 7);
    }
    animateHero(dt, t); updateParts(dt); updatePops(dt);
    for (const c of bgGroup.children) if (c.userData.drift) c.position.x += dt * c.userData.drift;
  }
  placeSky();
  render();
}

// boot
try {
  pickQuality(); charStats(); skinId = CH.id; if (CH.id !== 'hero') setHeroSkin(CH.skin);
  $('fpsTxt').classList.toggle('hidden', !save.settings.showFps);
  loadLevel(Math.min(save.unlocked, TOTAL) - 1);
  ready = true; $('tapStart').textContent = isTouch ? 'Tap to start' : 'Click to start';
} catch (err) { $('tapStart').textContent = 'Could not start: ' + err.message; console.error(err); }
requestAnimationFrame(frame);

// test / debug hook (harmless in production)
window.__ups = {
  get mode() { return mode; }, get world() { return world; }, P, input, LEVELS, save, TOTAL, WORLDS, BOSSES, startLevel, loadLevel, getLevel, goHome, goMap, goWorld, goLevels, winLevel, failLevel, skipLevel, showFinal, continueLevel, defeat, writeSave, charStats, setHeroSkin,
  get fps() { return fps; }, get tier() { return tier; }, get calls() { return renderer.info.render.calls; }, get tris() { return renderer.info.render.triangles; },
  teleport(x, y, z) { P.pos.set(x, y, z); P.vel.set(0, 0, 0); snapCamera(); },
  setMode(m) { mode = m; }, sim(dt) { updateWorld(dt); updatePlayer(dt); updateEntities(dt); }, applyQuality, render() { updateCamera(.016); animateHero(.016, performance.now() / 1000); placeSky(); render(); },
  get camYaw() { return camYaw; }, set camYaw(v) { camYaw = v; }, snapCamera, scene, camera,
};
