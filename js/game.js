// UPSTAGGLES – browser prototype (World 1: Beginner Valley, levels 1–5)
// Original low-poly art built from Three.js primitives. No external assets.
import * as THREE from '../lib/three.min.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---------------------------------------------------------------- save
const SAVE_KEY = 'upstaggles.save.v1';
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.levels) return Object.assign({ unlocked: 1, wallet: 0, levels: {}, sound: true }, s); } catch (e) { /* ignore */ }
  return { unlocked: 1, wallet: 0, levels: {}, sound: true };
}
const save = loadSave();
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } }
const totalStars = () => Object.values(save.levels).reduce((s, l) => s + (l.stars || 0), 0);

// ---------------------------------------------------------------- audio (tiny synth, no files)
let actx = null;
function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
function tone(freq, dur, type, vol, slide, delay) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(vol || 0.15, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function sfx(name) {
  if (!save.sound) return;
  switch (name) {
    case 'coin': tone(988, .08, 'square', .06); tone(1319, .18, 'square', .06, 0, .07); break;
    case 'jump': tone(300, .18, 'triangle', .14, 620); break;
    case 'land': tone(140, .06, 'sine', .08); break;
    case 'spin': tone(500, .2, 'sawtooth', .05, 1200); break;
    case 'bonk': tone(220, .25, 'square', .12, 60); tone(880, .12, 'triangle', .1, 1500, .05); break;
    case 'hurt': tone(200, .3, 'sawtooth', .12, 90); break;
    case 'check': [523, 659, 784].forEach((f, i) => tone(f, .16, 'triangle', .12, 0, i * .09)); break;
    case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .22, 'triangle', .13, 0, i * .12)); break;
    case 'fall': tone(600, .5, 'sine', .1, 120); break;
    case 'click': tone(660, .05, 'triangle', .08); break;
  }
}

// ---------------------------------------------------------------- renderer / scene
const canvas = $('game');
const DPR = window.devicePixelRatio || 1;
let pixelRatio = Math.min(DPR, isTouch ? 1.5 : 2);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: DPR < 1.5, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xe6f6ff, 0x5b7f3a, 2.0));
const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.2); sunLight.position.set(30, 50, 25); scene.add(sunLight);
scene.fog = new THREE.Fog(0xcfeeff, 50, 190);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w < h ? 78 : 62; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// shared geometry & materials
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cone7: new THREE.ConeGeometry(.5, 1, 7), cone5: new THREE.ConeGeometry(.5, 1, 5),
  ico0: new THREE.IcosahedronGeometry(1, 0), ico1: new THREE.IcosahedronGeometry(1, 1), cyl8: new THREE.CylinderGeometry(.5, .5, 1, 8),
  coin: new THREE.CylinderGeometry(.36, .36, .1, 14).rotateX(Math.PI / 2), sph: new THREE.SphereGeometry(1, 10, 8),
  oct: new THREE.OctahedronGeometry(1, 0), shadow: new THREE.CircleGeometry(.5, 16).rotateX(-Math.PI / 2),
};
const matCache = new Map();
function M(color, extra) {
  const k = color + '|' + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {})));
  return matCache.get(k);
}
function mesh(geo, mat, parent, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
  if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  (parent || scene).add(m); return m;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- sky dome (vertex-coloured gradient)
const skyGeo = new THREE.SphereGeometry(300, 20, 12);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -1; scene.add(sky);
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(14, 20), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
scene.add(sunDisc);
function paintSky(top, low) {
  const ct = new THREE.Color(top), cl = new THREE.Color(low), c = new THREE.Color();
  const pos = skyGeo.attributes.position, col = skyGeo.attributes.color;
  for (let i = 0; i < pos.count; i++) { const t = clamp(pos.getY(i) / 300, -0.2, 1); c.copy(cl).lerp(ct, clamp(t * 1.6, 0, 1)); col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true; scene.fog.color.copy(cl); renderer.setClearColor(cl);
}

// ---------------------------------------------------------------- hero (original low-poly "Staggle Hero")
function buildHero() {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(.36, .42, 3, 8), M(0x22b8b0), g, 0, .82, 0);
  mesh(G.sph, M(0xbff5ee), g, 0, .78, -.24, .24, .26, .14); // belly patch
  mesh(new THREE.TorusGeometry(.3, .09, 6, 12).rotateX(Math.PI / 2), M(0xffd23f), g, 0, 1.17, 0); // scarf
  const tail = mesh(G.box, M(0xffd23f), g, .12, 1.05, .34, .16, .42, .08); tail.rotation.x = .5;
  const head = new THREE.Group(); head.position.set(0, 1.5, 0); g.add(head);
  mesh(G.ico1, M(0xffd6a5), head, 0, 0, 0, .4);
  const hood = mesh(new THREE.SphereGeometry(.43, 10, 6, 0, TAU, 0, Math.PI * .5), M(0xff7f3f), head, 0, .04, .03); hood.rotation.x = -.25;
  mesh(G.cone5, M(0x55d04a), head, 0, .5, .05, .1, .3, .1); // sprout
  const leaf = mesh(G.sph, M(0x55d04a), head, .12, .66, .05, .14, .05, .08); leaf.rotation.z = .5;
  for (const s of [-1, 1]) {
    mesh(G.sph, M(0xffffff), head, s * .15, .02, -.34, .11, .13, .06);
    mesh(G.sph, M(0x1b1b2f), head, s * .15, .01, -.39, .06, .08, .04);
    mesh(G.sph, M(0xff9aa2), head, s * .26, -.12, -.29, .07, .05, .03); // cheeks
  }
  const mk = (x, y, len, col, r) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); mesh(new THREE.CapsuleGeometry(r, len, 2, 6), M(col), p, 0, -len / 2 - r * .5, 0); return p; };
  const armL = mk(-.45, 1.08, .32, 0x22b8b0, .1), armR = mk(.45, 1.08, .32, 0x22b8b0, .1);
  mesh(G.sph, M(0xffd6a5), armL, 0, -.52, 0, .11); mesh(G.sph, M(0xffd6a5), armR, 0, -.52, 0, .11);
  const legL = mk(-.17, .5, .22, 0x34407a, .12), legR = mk(.17, .5, .22, 0x34407a, .12);
  mesh(G.box, M(0xff7f3f), legL, 0, -.44, -.06, .22, .14, .32); mesh(G.box, M(0xff7f3f), legR, 0, -.44, -.06, .22, .14, .32);
  return { group: g, body, head, armL, armR, legL, legR, tail };
}
const hero = buildHero(); scene.add(hero.group);
const heroShadow = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false }));
heroShadow.renderOrder = 1; scene.add(heroShadow);
const spinRing = new THREE.Mesh(new THREE.TorusGeometry(1, .08, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0 }));
scene.add(spinRing);

// particles (pooled)
const parts = [];
for (let i = 0; i < 40; i++) { const m = mesh(G.oct, new THREE.MeshBasicMaterial({ color: 0xffffff }), scene, 0, -999, 0, .12); m.visible = false; parts.push({ m, v: new THREE.Vector3(), life: 0 }); }
function burst(x, y, z, color, n, spd) {
  let k = 0;
  for (const p of parts) {
    if (p.life > 0) continue; if (k++ >= n) break;
    p.m.visible = true; p.m.material.color.setHex(color); p.m.position.set(x, y, z);
    const a = Math.random() * TAU, u = Math.random();
    p.v.set(Math.cos(a) * spd * (.4 + u), spd * (.6 + Math.random()), Math.sin(a) * spd * (.4 + u)); p.life = .6 + Math.random() * .3;
  }
}
function updateParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue; p.life -= dt; p.v.y -= 14 * dt; p.m.position.addScaledVector(p.v, dt);
    p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6; p.m.scale.setScalar(.14 * clamp(p.life * 2, 0, 1));
    if (p.life <= 0) p.m.visible = false;
  }
}

// ---------------------------------------------------------------- world state
let world = null; // current level runtime
const levelGroup = new THREE.Group(); scene.add(levelGroup);
const bgGroup = new THREE.Group(); scene.add(bgGroup);

function buildBackground(L, rnd, cx, cz) {
  disposeGroup(bgGroup);
  const floorY = -26;
  mesh(new THREE.CircleGeometry(260, 24).rotateX(-Math.PI / 2), M(0x8fcf6a), bgGroup, cx, floorY, cz);
  // lake
  mesh(new THREE.CircleGeometry(40, 18).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5cc8ff }), bgGroup, cx + 30, floorY + .05, cz - 10);
  const hillCols = [0x6cbf4f, 0x82cf5a, 0x5aae4a, 0x9ad66a, 0x7fb6e8];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU, r = 70 + rnd() * 70, hgt = 14 + rnd() * 34, w = 22 + rnd() * 30;
    const m = mesh(G.cone7, M(hillCols[i % hillCols.length]), bgGroup, cx + Math.cos(a) * r, floorY + hgt / 2, cz + Math.sin(a) * r, w, hgt, w);
    m.rotation.y = rnd() * TAU;
    if (hgt > 36) mesh(G.cone7, M(0xffffff), bgGroup, m.position.x, floorY + hgt * .86, m.position.z, w * .29, hgt * .28, w * .29).rotation.y = m.rotation.y;
  }
  for (let i = 0; i < 14; i++) {
    const cl = new THREE.Group(); const a = rnd() * TAU, r = 30 + rnd() * 80;
    cl.position.set(cx + Math.cos(a) * r, 16 + rnd() * 22, cz + Math.sin(a) * r);
    for (let j = 0; j < 4; j++) mesh(G.ico0, M(0xffffff), cl, (j - 1.5) * 2.4, rnd() * 1.2, rnd() * 1.5, 2 + rnd() * 1.6);
    cl.userData.drift = .5 + rnd(); bgGroup.add(cl);
  }
}

function addTree(parent, x, y, z, rnd) {
  const s = .8 + rnd() * .5; const t = new THREE.Group(); t.userData.static = true; t.position.set(x, y, z); parent.add(t);
  mesh(G.cyl8, M(0x8a5a33), t, 0, .6 * s, 0, .3 * s, 1.2 * s, .3 * s);
  const cols = [0x3fae4a, 0x52c45a, 0x2f9e57, 0x6fcf4f];
  if (rnd() < .5) { mesh(G.cone7, M(cols[(rnd() * 4) | 0]), t, 0, 1.9 * s, 0, 1.8 * s, 1.8 * s, 1.8 * s); mesh(G.cone7, M(cols[(rnd() * 4) | 0]), t, 0, 2.7 * s, 0, 1.3 * s, 1.4 * s, 1.3 * s); }
  else { mesh(G.ico0, M(cols[(rnd() * 4) | 0]), t, 0, 2.0 * s, 0, .95 * s); mesh(G.ico0, M(cols[(rnd() * 4) | 0]), t, .3 * s, 2.6 * s, .1, .6 * s); }
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
  mesh(G.box, M(topCol), levelGroup, p.x, p.top - .15, p.z, p.w + .16, .34, p.d + .16);
  if (kind === 'cliff') { // rocky strata stripes
    for (let y = minY + 1.2; y < p.top - .8; y += 1.6) mesh(G.box, M(0x8f6542), levelGroup, p.x, y, p.z, p.w + .06, .25, p.d + .06);
  } else {
    const hc = Math.min(7, (p.w + p.d) / 3 + 1);
    const cone = mesh(G.cone7, M(kind === 'stone' ? 0x7d869a : 0x8f6542), levelGroup, p.x, minY - hc / 2, p.z, p.w * 1.0, hc, p.d * 1.0);
    cone.rotation.x = Math.PI; cone.rotation.y = rnd() * TAU;
  }
  // flowers & tufts
  const area = p.w * p.d, nf = kind === 'stone' ? 1 : Math.min(10, Math.floor(area / 7));
  const fc = [0xff5fa2, 0xffe14d, 0xffffff, 0xb07cff, 0xff8a3d];
  for (let i = 0; i < nf; i++) {
    const fx = p.x + (rnd() - .5) * (p.w - .6), fz = p.z + (rnd() - .5) * (p.d - .6);
    if (rnd() < .5) mesh(G.ico0, M(fc[(rnd() * 5) | 0]), levelGroup, fx, p.top + .12, fz, .12);
    else mesh(G.cone5, M(0x4fb83f), levelGroup, fx, p.top + .15, fz, .14, .3, .14);
  }
}

const sharedGeos = new Set(Object.values(G));
function disposeGroup(group) {
  const mats = new Set(matCache.values());
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!sharedGeos.has(o.geometry)) o.geometry.dispose();
    if (!mats.has(o.material)) o.material.dispose();
  });
  group.clear();
}
// Merge every static mesh (no animated ancestor) into one mesh per material -> far fewer draw calls on phones.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map(), remove = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (let p = o.parent; p && p !== group; p = p.parent) if (!p.userData.static) return;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(g); remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const [mat, geos] of buckets) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let off = 0;
    for (const g of geos) { pos.set(g.attributes.position.array, off * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    bg.computeBoundingSphere(); group.add(new THREE.Mesh(bg, mat));
  }
}

function loadLevel(idx) {
  const L = LEVELS[idx];
  disposeGroup(levelGroup);
  const rnd = rng(1234 + idx * 77);
  paintSky(L.palette.skyTop, L.palette.skyLow);
  const colliders = [];
  for (const p of L.platforms) addPlatform(p, L.palette, rnd, colliders);
  // bounds for background
  let cx = 0, cz = 0; for (const p of L.platforms) { cx += p.x; cz += p.z; } cx /= L.platforms.length; cz /= L.platforms.length;
  buildBackground(L, rnd, cx, cz);
  for (const t of L.trees) addTree(levelGroup, t[0], t[1], t[2], rnd);

  const movers = L.movers.map((m) => {
    const g = new THREE.Group(); levelGroup.add(g);
    mesh(G.box, M(0xffa53d), g, 0, -.3, 0, m.w, .6, m.d);
    mesh(G.box, M(0xfff1a8), g, 0, -.02, 0, m.w + .1, .08, m.d + .1);
    for (const s of [-1, 1]) mesh(G.oct, M(0xff5fa2, { emissive: 0x551133 }), g, s * (m.w / 2 + .15), -.3, 0, .18);
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

  const coins = L.coins.map(([x, y, z], i) => { const m = mesh(G.coin, M(0xffc93c, { emissive: 0x6a4000 }), levelGroup, x, y, z); m.rotation.y = i * .5; return { m, x, y, z, taken: false, t: 0 }; });

  const checkpoints = L.checkpoints.map(([x, y, z]) => {
    const g = new THREE.Group(); g.position.set(x, y, z); levelGroup.add(g);
    mesh(G.cyl8, M(0x9aa3b5), g, 0, .1, 0, .8, .2, .8);
    mesh(G.cyl8, M(0xffffff), g, 0, 1.15, 0, .1, 2.1, .1);
    mesh(G.ico0, M(0xffd23f), g, 0, 2.25, 0, .12);
    const flag = mesh(G.box, M(0xbfc6d4), g, .45, 1.9, 0, .8, .5, .05);
    return { g, flag, x, y, z, on: false };
  });

  const goalG = new THREE.Group(); goalG.position.set(L.goal[0], L.goal[1], L.goal[2]); levelGroup.add(goalG);
  mesh(G.cyl8, M(0x9aa3b5), goalG, 0, .15, 0, 2.6, .3, 2.6);
  const torus = mesh(new THREE.TorusGeometry(1.2, .2, 8, 24), M(0xff5fa2, { emissive: 0x551133 }), goalG, 0, 1.75, 0);
  const portalMat = new THREE.MeshBasicMaterial({ color: 0x9b5cff, transparent: true, opacity: .75, side: THREE.DoubleSide });
  const disc = mesh(new THREE.CircleGeometry(1.05, 24), portalMat, goalG, 0, 1.75, 0);
  const swirl = mesh(new THREE.RingGeometry(.35, .6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .6, side: THREE.DoubleSide }), goalG, 0, 1.75, .02);
  const sparks = []; for (let i = 0; i < 6; i++) sparks.push(mesh(G.oct, M(0xffe14d, { emissive: 0x665500 }), goalG, 0, 1.75, 0, .12));
  for (const s of [-1, 1]) mesh(G.cyl8, M(0xffd23f), goalG, s * 1.45, .8, 0, .16, 1.4, .16);

  const enemies = L.enemies.map((e) => {
    const g = new THREE.Group(); levelGroup.add(g);
    const body = mesh(G.ico0, M(0x9b59b6), g, 0, .55, 0, .58, .5, .58);
    mesh(G.ico0, M(0xc39bd3), g, 0, .45, -.3, .3, .22, .2);
    for (const s of [-1, 1]) {
      mesh(G.sph, M(0xffffff), g, s * .2, .72, -.45, .14, .16, .08);
      mesh(G.sph, M(0x1b1b2f), g, s * .2, .7, -.52, .06, .08, .04);
      const brow = mesh(G.box, M(0x3b1f4a), g, s * .2, .9, -.48, .2, .05, .05); brow.rotation.z = s * -.4;
      mesh(G.cone5, M(0xffe066), g, s * .3, 1.08, 0, .14, .32, .14).rotation.z = s * -.3;
      mesh(G.box, M(0x3b1f4a), g, s * .25, .08, -.05, .22, .16, .34);
    }
    const t0 = rnd(); g.position.set(lerp(e.a[0], e.b[0], t0), e.y, lerp(e.a[1], e.b[1], t0));
    return { g, body, a: e.a, b: e.b, y: e.y, speed: e.speed, t: t0, dir: 1, x: g.position.x, z: g.position.z, alive: true, dieT: 0 };
  });

  mergeStatic(levelGroup); mergeStatic(bgGroup);
  world = {
    idx, L, colliders, movers, vines, coins, checkpoints, enemies,
    goal: { x: L.goal[0], y: L.goal[1], z: L.goal[2], g: goalG, torus, disc, swirl, sparks, portalMat },
    t: 0, got: 0, total: coins.length + enemies.length * 3, foes: 0, done: false,
  };
  resetPlayer(true);
  updateHUD(true);
}

// ---------------------------------------------------------------- player
const R = .35, H = 1.5, SPEED = 7, JUMP = 12, GRAV = 32;
const P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: false, ground: null, coyote: 0, jumpBuf: 0,
  facing: 0, hearts: 3, invuln: 0, attackT: 0, attackCD: 0, climbing: false, walk: 0, knock: 0,
  respawn: new THREE.Vector3(), respawnFacing: 0, landT: 0,
};
function resetPlayer(full) {
  const s = world.L.start;
  if (full) { P.respawn.set(s[0], s[1], s[2]); P.hearts = 3; }
  P.pos.copy(P.respawn); P.pos.y += .05; P.vel.set(0, 0, 0); P.facing = 0; P.climbing = false; P.knock = 0; P.attackT = 0;
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
    if (P.vel.y <= 0 || P.pos.y > (b.minY + b.maxY) / 2) { if (!wasGrounded && P.vel.y < -6) { sfx('land'); P.landT = .15; } P.pos.y = b.maxY; P.vel.y = 0; P.grounded = true; P.ground = b; }
    else { P.pos.y = b.minY - H - 1e-3; P.vel.y = 0; }
  }
  // stand-on check (resting exactly on top doesn't count as overlap)
  if (!P.grounded && P.vel.y <= 0) for (const b of cs) {
    if (Math.abs(P.pos.y - b.maxY) < .02 && P.pos.x + R > b.minX && P.pos.x - R < b.maxX && P.pos.z + R > b.minZ && P.pos.z - R < b.maxZ) { P.grounded = true; P.ground = b; P.pos.y = b.maxY; break; }
  }
  if (!P.grounded) P.ground = null;
}

function inVine() {
  for (const v of world.vines) {
    if (Math.abs(P.pos.x - v.x) < v.w / 2 && P.pos.z > v.z - .05 && P.pos.z < v.z + R + .55 && P.pos.y > v.y0 - .15 && P.pos.y < v.y1 + .05) return v;
  }
  return null;
}

const input = { kx: 0, ky: 0, jx: 0, jy: 0, jumpHeld: false, jumpPressed: false, actionPressed: false };
let camYaw = 0, camPitch = .38, camDist = 7.5;

function updatePlayer(dt) {
  // input vector (x = right, y = forward)
  let mx = input.kx + input.jx, my = input.ky + input.jy;
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const dx = rx * mx + fx * my, dz = rz * mx + fz * my, dl = Math.hypot(dx, dz);

  if (input.jumpPressed) P.jumpBuf = .15; else P.jumpBuf -= dt;
  input.jumpPressed = false;
  if (input.actionPressed && P.attackCD <= 0) { P.attackT = .38; P.attackCD = .55; sfx('spin'); spinRing.material.opacity = .9; spinRing.scale.setScalar(.4); }
  input.actionPressed = false;
  P.attackT -= dt; P.attackCD -= dt; P.invuln -= dt; P.knock -= dt; P.landT -= dt;

  // horizontal velocity
  if (P.knock <= 0) {
    const acc = (P.grounded ? 60 : 32) * dt;
    const tx = dx * SPEED, tz = dz * SPEED;
    const ddx = tx - P.vel.x, ddz = tz - P.vel.z, dd = Math.hypot(ddx, ddz);
    if (dd <= acc) { P.vel.x = tx; P.vel.z = tz; } else { P.vel.x += ddx / dd * acc; P.vel.z += ddz / dd * acc; }
  }
  if (dl > .1 && P.knock <= 0) { const tf = Math.atan2(-dx, -dz); let d = tf - P.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); P.facing += d * Math.min(1, dt * 14); }

  // climbing
  const v = inVine();
  const into = -dz; // vines face +z, so "into wall" is -z
  const wasClimbing = P.climbing;
  P.climbing = !!v && !P.grounded && (into > .3 || (wasClimbing && dl < .15)) || (!!v && P.grounded && into > .3);
  if (P.climbing) { P.vel.y = into > .3 ? 4.6 : 0; P.facing = lerp(P.facing, 0, Math.min(1, dt * 12)); }

  // jump
  if (P.grounded) P.coyote = .12; else P.coyote -= dt;
  if (P.jumpBuf > 0 && (P.coyote > 0 || P.climbing)) {
    P.vel.y = JUMP; if (P.climbing) { P.vel.z += 5; P.climbing = false; }
    P.jumpBuf = 0; P.coyote = 0; P.grounded = false; sfx('jump');
  }
  if (!P.climbing) {
    P.vel.y -= GRAV * dt * (P.vel.y > 0 && !input.jumpHeld ? 2.2 : 1);
    if (P.vel.y < -30) P.vel.y = -30;
  }

  // ride moving platforms
  if (P.ground && P.ground.mover) { const m = world.movers.find((mm) => mm.box === P.ground); if (m) { P.pos.x += m.dx; P.pos.y += m.dy; P.pos.z += m.dz; } }

  const steps = dt > 1 / 70 ? 2 : 1;
  for (let i = 0; i < steps; i++) moveAndCollide(dt / steps);

  if (P.pos.y < -14) { sfx('fall'); toast('Whoops!'); resetPlayer(false); }
}

function hurt(fromX, fromZ) {
  if (P.invuln > 0) return;
  P.hearts--; sfx('hurt'); P.invuln = 1.3; P.knock = .35;
  const ax = P.pos.x - fromX, az = P.pos.z - fromZ, al = Math.hypot(ax, az) || 1;
  P.vel.set(ax / al * 8, 7, az / al * 8);
  burst(P.pos.x, P.pos.y + 1, P.pos.z, 0xff4d6d, 8, 5);
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
function updateEntities(dt) {
  const w = world; const pc = P.pos.y + .75;
  // coins
  for (const c of w.coins) {
    if (c.taken) { if (c.t < .35) { c.t += dt; c.m.position.y += dt * 5; c.m.scale.setScalar(Math.max(.01, 1 - c.t * 2.8)); c.m.rotation.y += dt * 25; if (c.t >= .35) c.m.visible = false; } continue; }
    c.m.rotation.y += dt * 3;
    const dx = c.x - P.pos.x, dy = c.y - pc, dz = c.z - P.pos.z;
    if (dx * dx + dz * dz < .9 && Math.abs(dy) < 1.15) { c.taken = true; w.got++; sfx('coin'); burst(c.x, c.y, c.z, 0xffd23f, 5, 3); updateHUD(); }
  }
  // checkpoints
  for (const cp of w.checkpoints) {
    if (cp.on) { cp.flag.rotation.y = Math.sin(w.t * 4) * .25; continue; }
    if (Math.hypot(cp.x - P.pos.x, cp.z - P.pos.z) < 1.5 && Math.abs(cp.y - P.pos.y) < 2) {
      cp.on = true; cp.flag.material = M(0x34d058); P.respawn.set(cp.x, cp.y, cp.z); sfx('check'); toast('Checkpoint!'); burst(cp.x, cp.y + 2, cp.z, 0x34d058, 10, 4);
    }
  }
  // enemies
  for (const e of w.enemies) {
    if (!e.alive) { if (e.dieT < .5) { e.dieT += dt; e.g.scale.set(1 + e.dieT * 2, Math.max(.05, 1 - e.dieT * 3), 1 + e.dieT * 2); if (e.dieT >= .5) e.g.visible = false; } continue; }
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    e.t += dt * e.speed / len * e.dir; if (e.t > 1) { e.t = 1; e.dir = -1; } if (e.t < 0) { e.t = 0; e.dir = 1; }
    e.x = lerp(e.a[0], e.b[0], e.t); e.z = lerp(e.a[1], e.b[1], e.t);
    const hx = (e.b[0] - e.a[0]) * e.dir, hz = (e.b[1] - e.a[1]) * e.dir;
    e.g.position.set(e.x, e.y + Math.abs(Math.sin(w.t * 9)) * .12, e.z); e.g.rotation.y = Math.atan2(-hx, -hz);
    e.body.scale.y = .5 + Math.sin(w.t * 9) * .04;
    const dx = P.pos.x - e.x, dz = P.pos.z - e.z, dh = Math.hypot(dx, dz), dy = P.pos.y - e.y;
    if (P.attackT > 0 && dh < 2.0 && Math.abs(dy) < 1.6) defeat(e, false);
    else if (dh < .85 && dy > -.8 && dy < 1.2) {
      if (P.vel.y < 0 && dy > .45) { defeat(e, true); P.vel.y = 10; }
      else hurt(e.x, e.z);
    }
  }
  // goal
  const g = w.goal;
  g.torus.rotation.z += dt * 1.5; g.swirl.rotation.z -= dt * 3;
  g.portalMat.color.setHSL((w.t * .15) % 1, .8, .62);
  g.sparks.forEach((s, i) => { const a = w.t * 2 + i / 6 * TAU; s.position.set(Math.cos(a) * 1.5, 1.75 + Math.sin(a * 1.3) * .6, Math.sin(a) * .4); s.rotation.y += dt * 4; });
  if (!w.done && Math.hypot(g.x - P.pos.x, g.z - P.pos.z) < 1.4 && Math.abs(g.y - P.pos.y) < 2.2) winLevel();
}
function defeat(e, stomp) {
  e.alive = false; e.dieT = 0; world.got += 3; world.foes++; sfx('bonk');
  burst(e.x, e.y + .6, e.z, 0xc39bd3, 10, 6); burst(e.x, e.y + 1, e.z, 0xffd23f, 6, 4);
  toast(stomp ? 'Stomp! +3' : 'Bonk! +3'); updateHUD();
}

// ---------------------------------------------------------------- hero animation, camera
const tmpV = new THREE.Vector3();
function animateHero(dt, t) {
  const g = hero.group; g.position.copy(P.pos);
  const spd = Math.hypot(P.vel.x, P.vel.z);
  let rotY = P.facing;
  if (P.attackT > 0) rotY += (1 - P.attackT / .38) * TAU;
  g.rotation.y = rotY;
  g.visible = !(P.invuln > 0 && Math.floor(t * 16) % 2 === 0 && mode === 'play');
  if (P.climbing) {
    const s = Math.sin(t * 12);
    hero.armL.rotation.set(-2.6 + s * .4, 0, 0); hero.armR.rotation.set(-2.6 - s * .4, 0, 0);
    hero.legL.rotation.x = s * .5; hero.legR.rotation.x = -s * .5;
  } else if (!P.grounded) {
    hero.armL.rotation.set(-2.3, 0, -.3); hero.armR.rotation.set(-2.3, 0, .3); hero.legL.rotation.x = -.6; hero.legR.rotation.x = .3;
  } else if (spd > .5) {
    P.walk += dt * spd * 1.7; const s = Math.sin(P.walk) * Math.min(1, spd / SPEED);
    hero.legL.rotation.x = s * .9; hero.legR.rotation.x = -s * .9; hero.armL.rotation.set(-s * .8, 0, -.1); hero.armR.rotation.set(s * .8, 0, .1);
  } else {
    const b = Math.sin(t * 2.5) * .06;
    hero.legL.rotation.x = 0; hero.legR.rotation.x = 0; hero.armL.rotation.set(b, 0, -.12); hero.armR.rotation.set(-b, 0, .12);
  }
  if (P.attackT > 0) { hero.armL.rotation.set(0, 0, -1.4); hero.armR.rotation.set(0, 0, 1.4); }
  const squash = P.landT > 0 ? 1 - P.landT * 1.2 : 1;
  hero.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  hero.head.position.y = 1.5 + (P.grounded && spd < .5 ? Math.sin(t * 2.5) * .03 : 0);
  hero.tail.rotation.x = .5 + Math.min(1.1, spd * .12) + Math.sin(t * 10) * .1;
  // spin ring
  if (spinRing.material.opacity > 0) { spinRing.material.opacity = Math.max(0, spinRing.material.opacity - dt * 2.5); spinRing.scale.multiplyScalar(1 + dt * 5); spinRing.position.set(P.pos.x, P.pos.y + .7, P.pos.z); }
  // blob shadow
  let sy = -999;
  for (const b of world.colliders) if (P.pos.x > b.minX && P.pos.x < b.maxX && P.pos.z > b.minZ && P.pos.z < b.maxZ && b.maxY <= P.pos.y + .05 && b.maxY > sy) sy = b.maxY;
  heroShadow.visible = sy > -999;
  if (heroShadow.visible) { const hgt = P.pos.y - sy; heroShadow.position.set(P.pos.x, sy + .045, P.pos.z); heroShadow.scale.setScalar(clamp(1.3 - hgt * .08, .5, 1.3)); heroShadow.material.opacity = clamp(.3 - hgt * .02, .08, .3); }
}
function camTarget(out) {
  const cp = Math.cos(camPitch);
  return out.set(P.pos.x + Math.sin(camYaw) * cp * camDist, P.pos.y + 1.2 + Math.sin(camPitch) * camDist, P.pos.z + Math.cos(camYaw) * cp * camDist);
}
function snapCamera() { camTarget(camera.position); camera.lookAt(P.pos.x, P.pos.y + 1.3, P.pos.z); }
function updateCamera(dt) {
  if (input.camKeys) camYaw += input.camKeys * dt * 2.2;
  camTarget(tmpV);
  camera.position.lerp(tmpV, 1 - Math.exp(-dt * 9));
  camera.lookAt(P.pos.x, P.pos.y + 1.3, P.pos.z);
}
function placeSky() {
  sky.position.copy(camera.position);
  sunDisc.position.set(camera.position.x + 120, camera.position.y + 110, camera.position.z - 200); sunDisc.lookAt(camera.position);
}

// ---------------------------------------------------------------- UI
const screens = ['splash', 'home', 'levels', 'howto', 'pause', 'win'];
let mode = 'splash';
function show(id) { for (const s of screens) $(s).classList.toggle('show', s === id); }
function setPlayUI(on) { if (!on) { $('hint').classList.remove('on'); $('toast').classList.remove('on'); } $('hud').classList.toggle('hidden', !on); $('touch').classList.toggle('hidden', !(on && isTouch)); }
let toastTimer = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 1100); }
let hintTimer = 0;
function hint(msg, ms) { const el = $('hint'); el.textContent = msg; el.classList.add('on'); clearTimeout(hintTimer); hintTimer = setTimeout(() => el.classList.remove('on'), ms || 5000); }
let hudCache = '';
function updateHUD(force) {
  if (!world) return;
  const s = `${world.got}/${world.total}|${P.hearts}`;
  if (s === hudCache && !force) return; hudCache = s;
  $('hudCoins').textContent = `${world.got}/${world.total}`;
  $('hudHearts').innerHTML = [0, 1, 2].map((i) => `<span class="${i < P.hearts ? '' : 'off'}">♥</span>`).join('');
  $('hudLevel').textContent = `1-${world.idx + 1} ${world.L.name}`;
}
function refreshHome() {
  $('walletTxt').textContent = save.wallet; $('starTxt').textContent = `${totalStars()}/15`;
  $('btnSound').textContent = `Sound: ${save.sound ? 'On' : 'Off'}`;
}
function buildLevelGrid() {
  const grid = $('levelGrid'); grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const locked = i + 1 > save.unlocked; const st = (save.levels[i + 1] || {}).stars || 0;
    const b = document.createElement('button'); b.className = 'lvlTile' + (locked ? ' locked' : '');
    b.innerHTML = `<span class="n">${locked ? '🔒' : i + 1}</span><span class="nm">${L.name}</span><span class="st">${[0, 1, 2].map((k) => k < st ? '★' : '<i>★</i>').join('')}</span>`;
    b.addEventListener('click', () => { if (locked) { sfx('hurt'); return; } sfx('click'); startLevel(i); });
    grid.appendChild(b);
  });
}
function goHome() { mode = 'menu'; setPlayUI(false); refreshHome(); show('home'); menuBackdrop(); }
function goLevels() { mode = 'menu'; setPlayUI(false); buildLevelGrid(); show('levels'); menuBackdrop(); }
function menuBackdrop() { const i = Math.min(save.unlocked, LEVELS.length) - 1; if (!world || world.idx !== i || world.t > 0) loadLevel(i); }
function startLevel(i) {
  loadLevel(i); mode = 'play'; show(null); setPlayUI(true); hint(LEVELS[i].hint, 6500); toast(`1-${i + 1} ${LEVELS[i].name}`);
}
function pauseGame() { if (mode !== 'play') return; mode = 'paused'; show('pause'); }
function resumeGame() { if (mode !== 'paused') return; mode = 'play'; show(null); }
function winLevel() {
  const w = world; w.done = true; mode = 'win'; sfx('win');
  const frac = w.got / w.total;
  const stars = 1 + (frac >= .6 ? 1 : 0) + (w.got >= w.total ? 1 : 0);
  const reward = Math.round(50 + (w.L.maxReward - 50) * frac);
  const n = w.idx + 1; const prev = save.levels[n] || {};
  save.levels[n] = { stars: Math.max(prev.stars || 0, stars), best: Math.max(prev.best || 0, w.got) };
  save.wallet += reward; save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, n + 1)); writeSave();
  $('winTitle').textContent = n === LEVELS.length ? 'Valley Conquered!' : 'Level Clear!';
  $('winCoins').textContent = `${w.got}/${w.total}`; $('winFoes').textContent = w.foes; $('winReward').textContent = `+${reward}`;
  const spans = $('winStars').children; for (let k = 0; k < 3; k++) { spans[k].classList.remove('on'); if (k < stars) setTimeout(() => spans[k].classList.add('on'), 250 + k * 280); }
  $('btnNext').textContent = n < LEVELS.length ? 'Next level ▶' : 'Back to levels';
  setPlayUI(false); setTimeout(() => show('win'), 350);
  burst(w.goal.x, w.goal.y + 2, w.goal.z, 0xff5fa2, 20, 7);
}

$('btnPlay').onclick = () => { sfx('click'); let i = 0; while (i < LEVELS.length - 1 && i + 1 < save.unlocked && save.levels[i + 1]) i++; startLevel(Math.min(i, save.unlocked - 1)); };
$('btnLevels').onclick = () => { sfx('click'); goLevels(); };
$('btnHow').onclick = () => { sfx('click'); show('howto'); };
$('btnHowBack').onclick = () => { sfx('click'); show('home'); };
$('btnSound').onclick = () => { save.sound = !save.sound; writeSave(); refreshHome(); sfx('click'); };
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
  if (e.code === 'Escape' || e.code === 'KeyP') { if (mode === 'play') pauseGame(); else if (mode === 'paused') resumeGame(); }
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'splash' && ready) goHome();
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); syncKeys(); if (e.code === 'Space') input.jumpHeld = false; });
window.addEventListener('blur', () => { keys.clear(); syncKeys(); input.jumpHeld = false; });

// touch / pointer: joystick (left side), camera drag (elsewhere), buttons
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
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------------------------------------------------------------- main loop
let last = performance.now(), ready = false, fpsAcc = 0, fpsN = 0, fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; if (dt > .05) dt = .05; if (dt <= 0) dt = .001;
  // adaptive resolution for slower phones
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2) { fps = fpsN / fpsAcc; if (fps < 40 && pixelRatio > .8) { pixelRatio = Math.max(.8, pixelRatio - .25); renderer.setPixelRatio(pixelRatio); resize(); } fpsAcc = 0; fpsN = 0; }
  const t = now / 1000;
  if (world) {
    if (mode === 'play') { updateWorld(dt); updatePlayer(dt); updateEntities(dt); updateCamera(dt); }
    else if (mode === 'win') { updateEntities(dt); P.facing += dt * 4; P.vel.set(0, 0, 0); updateCamera(dt); }
    else if (mode === 'menu' || mode === 'splash') {
      updateWorld(dt * 0); const a = t * .12;
      camera.position.set(P.pos.x + Math.sin(a) * 11, P.pos.y + 5, P.pos.z + Math.cos(a) * 11); camera.lookAt(P.pos.x, P.pos.y + 1, P.pos.z - 4);
      P.facing = Math.atan2(-(camera.position.x - P.pos.x), -(camera.position.z - P.pos.z)) + Math.PI;
      world.goal.torus.rotation.z += dt; for (const c of world.coins) c.m.rotation.y += dt * 3;
    }
    animateHero(dt, t); updateParts(dt);
    for (const c of bgGroup.children) if (c.userData.drift) c.position.x += dt * c.userData.drift;
  }
  placeSky();
  renderer.render(scene, camera);
}

// boot
try {
  loadLevel(Math.min(save.unlocked, LEVELS.length) - 1);
  ready = true; $('tapStart').textContent = isTouch ? 'Tap to start' : 'Click to start';
} catch (err) { $('tapStart').textContent = 'Could not start: ' + err.message; console.error(err); }
requestAnimationFrame(frame);

// test / debug hook (harmless in production)
window.__ups = {
  get mode() { return mode; }, get world() { return world; }, P, input, LEVELS, save, startLevel, goHome, goLevels, winLevel,
  get fps() { return fps; }, get calls() { return renderer.info.render.calls; }, get tris() { return renderer.info.render.triangles; }, teleport(x, y, z) { P.pos.set(x, y, z); P.vel.set(0, 0, 0); snapCamera(); },
  setMode(m) { mode = m; }, sim(dt) { updateWorld(dt); updatePlayer(dt); updateEntities(dt); },
};
