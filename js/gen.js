// UPSTAGGLES – deterministic level generator for levels 6–250 (levels 1–5 are handcrafted in levels.js).
// Every jump gap is derived from the hero's real jump physics (single jump, no double jump / dash needed),
// and each level records its "links" so the automated test can replay every connection in the real engine.
import { WORLDS, BOSSES } from './worlds.js';

export const PHYS = { JUMP: 12, GRAV: 32, SPEED: 7.5, BOUNCE: 19 };
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function physFor(w, band) {
  if (w === 6) return { grav: .45, jump: .78, speed: .85, water: true };
  if (w === 9 && band === 0) return { grav: .62, jump: .9, speed: 1, low: true };
  return { grav: 1, jump: 1, speed: 1 };
}
// horizontal reach of a full single jump that lands dh higher (negative = lower)
export function reach(dh, ph, v0) {
  const g = PHYS.GRAV * ph.grav, v = (v0 || PHYS.JUMP) * ph.jump, s = PHYS.SPEED * ph.speed;
  const disc = v * v - 2 * g * dh; if (disc <= 0) return 0;
  return s * (v + Math.sqrt(disc)) / g;
}
export function maxRise(ph, v0) { const v = (v0 || PHYS.JUMP) * ph.jump; return v * v / (2 * PHYS.GRAV * ph.grav); }

const SUFFIX = [['Steps', 'Path', 'Trail', 'Hop', 'Run'], ['Ride', 'Drift', 'Crossing', 'Glide', 'Lift'], ['Tumble', 'Roll', 'Spin', 'Twist', 'Rumble'], ['Hideout', 'Secret', 'Den', 'Treasure', 'Lair'], ['Escape', 'Gauntlet', 'Challenge', 'Rush', 'Trial']];

export function levelInfo(n) { const w = Math.floor((n - 1) / 25), k = (n - 1) % 25; return { w, k, band: Math.min(4, Math.floor(k / 5)), boss: k === 24, D: (n - 1) / 249 }; }
export function rewardFor(n) { return Math.round(55 + 145 * (n - 1) / 249); }

export function generateLevel(n) {
  const { w, k, band, boss, D } = levelInfo(n);
  if (boss) return bossLevel(n, w);
  const W = WORLDS[w], r = rng(n * 9973 + 17), ph = physFor(w, band);
  const pick = (a) => a[(r() * a.length) | 0], rr = (a, b) => a + (b - a) * r();
  const L = {
    n, world: w, band, name: `${pick(W.words)} ${pick(SUFFIX[band])}`, maxReward: rewardFor(n),
    hint: `${W.name} · ${W.bands[band]}`, start: null, platforms: [], movers: [], vines: [], enemies: [], coins: [], gems: [],
    checkpoints: [], hazards: [], zones: [], teleporters: [], switches: [], gates: [], arenas: [], links: [], trees: [], walls: [],
    timer: 0, phys: ph, dark: !!W.dark, generated: true,
  };
  const f = .5 + .3 * D + .03 * band;             // fraction of the physical jump reach used (≤ .83)
  const gapFor = (dh, v0) => Math.max(1, reach(dh, ph, v0) * f - .4);
  const P = L.platforms;
  const rectOf = (p) => ({ minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minZ: p.z - p.d / 2, maxZ: p.z + p.d / 2 });
  const free = (c, ignore) => { const a = rectOf(c); for (let i = 0; i < P.length; i++) { if (ignore && ignore.includes(i)) continue; const b = rectOf(P[i]); if (a.minX < b.maxX + .7 && a.maxX > b.minX - .7 && a.minZ < b.maxZ + .7 && a.maxZ > b.minZ - .7) return false; } return true; };
  const add = (p) => { P.push(Object.assign({ kind: 'grass' }, p)); return P.length - 1; };
  // place a rect next to platform `from` in direction dir ('N' = -z, 'E' = +x, 'W' = -x, 'S' = +z)
  const near = (from, dir, gap, len, wid, lat, top) => {
    const p = P[from], R = rectOf(p);
    if (dir === 'N') return { x: p.x + lat, z: R.minZ - gap - len / 2, w: wid, d: len, top };
    if (dir === 'S') return { x: p.x + lat, z: R.maxZ + gap + len / 2, w: wid, d: len, top };
    if (dir === 'E') return { x: R.maxX + gap + len / 2, z: p.z + lat, w: len, d: wid, top };
    return { x: R.minX - gap - len / 2, z: p.z + lat, w: len, d: wid, top };
  };
  const alongLen = (i, dir) => (dir === 'N' || dir === 'S') ? P[i].d : P[i].w;
  const acrossLen = (i, dir) => (dir === 'N' || dir === 'S') ? P[i].w : P[i].d;
  let cur = 0, dir = 'N', run = 0, topNow = 0;
  // try to place next platform; shrinks / recentres on collision, falls back to a narrow straight piece
  function next(gap, dh, len, wid, kind, extra, opts) {
    const o = opts || {};
    const top = clamp(P[cur].top + dh, -1, 40);
    const dirs = [dir, ...['N', 'E', 'W'].filter((d) => d !== dir)];
    for (const d of dirs) {
      if (o.keepDir && d !== dir) break;
      const across = acrossLen(cur, d);
      for (let tr = 0; tr < 7; tr++) {
        if (o.exact && tr >= 3) break; const wd = tr < 3 ? wid : Math.max(2.5, Math.min(wid, 3));
        const maxLat = Math.max(0, (across + wd) / 2 - 1.6);
        const lat = tr === 0 && !o.straight ? (r() - .5) * 2 * Math.min(maxLat, 2) : tr < 2 ? 0 : ((tr % 2) ? 1 : -1) * Math.min(maxLat, (tr - 1) * .9);
        const c = near(cur, d, gap, len, wd, lat, top);
        if (free(c, [cur])) { if (d !== dir) { dir = d; run = 1; } return add(Object.assign(c, { kind: kind || 'grass' }, extra || {})); }
      }
    }
    return -1;
  }
  function link(t, a, b, extra) { L.links.push(Object.assign({ t, a, b }, extra || {})); }
  function jumpTo(gap, dh, len, wid, kind, extra, opts) {
    const from = cur; const i = next(gap, dh, len, wid, kind, extra, opts); if (i < 0) return -1;
    link('jump', from, i); arcCoins(from, i); cur = i; return i;
  }
  // coins: arc over each jump, lines across bigger platforms
  function arcCoins(a, b) {
    const A = P[a], B = P[b]; const n = 2 + ((r() * 2) | 0);
    const ax = clamp(B.x, A.x - A.w / 2, A.x + A.w / 2), az = clamp(B.z, A.z - A.d / 2, A.z + A.d / 2);
    const bx = clamp(A.x, B.x - B.w / 2, B.x + B.w / 2), bz = clamp(A.z, B.z - B.d / 2, B.z + B.d / 2);
    for (let i = 0; i < n; i++) { const t = (i + 1) / (n + 1); L.coins.push([lerp(ax, bx, t), lerp(A.top, B.top, t) + 1.1 + 4 * 1.0 * t * (1 - t), lerp(az, bz, t)]); }
  }
  function lineCoins(i, n) {
    const p = P[i], along = (dir === 'N' || dir === 'S'); const len = along ? p.d : p.w; const m = n || Math.max(2, Math.min(5, Math.floor(len / 1.6)));
    for (let j = 0; j < m; j++) { const o = (j + .5) / m - .5; L.coins.push([p.x + (along ? 0 : o * (len - 1)), p.top + 1, p.z + (along ? o * (len - 1) : 0)]); }
  }
  const small = () => [rr(4.6 - 1.6 * D, 6 - 2 * D), rr(3.6 - D, 5.5 - 1.5 * D)];
  const kindStone = w === 5 ? 'metal' : w === 7 ? 'cloud' : 'stone';
  const vanishMode = w === 2 ? 'sink' : (w === 7 || w === 8 || w === 9) ? 'vanish' : 'fall';

  // ---------------------------------------------------------------- segments
  const S = {
    hop() { const dh = rr(-1, .3 + 1.1 * Math.min(1, .4 + D)); const [l, wd] = small(); if (jumpTo(rr(.55, 1) * gapFor(dh), dh, l, wd, r() < .5 ? kindStone : 'grass') >= 0) lineCoins(cur, 2); },
    stairs() { for (let i = 0; i < 3; i++) { const dh = rr(.7, Math.min(1.3, maxRise(ph) * .6)); jumpTo(rr(.5, .9) * gapFor(dh), dh, rr(2.6, 3.4), rr(2.6, 3.4), kindStone); } },
    bridge() { const l = rr(6, 10); if (jumpTo(0, 0, l, rr(2.2, 3), 'bridge', null, { straight: true }) >= 0) { lineCoins(cur, 4); jumpTo(0, 0, rr(5, 7), rr(5, 7), 'grass', null, { straight: true }); } },
    stump() { for (let i = 0; i < 3; i++) { const dh = rr(-.5, 1); jumpTo(rr(.55, .95) * gapFor(dh), dh, rr(2.4, 3.2), rr(2.4, 3.2), 'stump'); } },
    roof() { const dh = rr(-1.5, .8); const [l, wd] = [rr(6, 9), rr(5, 8)]; if (jumpTo(rr(.7, 1) * gapFor(dh), dh, l, wd, 'roof') >= 0) lineCoins(cur, 3); },
    mover(vertical) {
      const from = cur; const g1 = Math.min(1.5, gapFor(0) * .6), travel = rr(5, 8 + 3 * D), g2 = Math.min(1.5, gapFor(0) * .6);
      const ml = 3, startC = near(cur, dir, g1, ml, 3, 0, P[cur].top), endC = near(cur, dir, g1 + travel, ml, 3, 0, P[cur].top);
      const t = next(g1 + travel + ml + g2, 0, rr(4, 6), rr(4, 6), 'grass', null, { straight: true, keepDir: true }); if (t < 0) return;
      const m = { w: 3, d: 3, from: [startC.x, P[from].top, startC.z], to: [endC.x, P[from].top, endC.z], period: (travel / (1.8 + 1.4 * D)) * 2, kind: w === 2 ? 'stoneblock' : 'mover' };
      L.movers.push(m); const mi = L.movers.length - 1;
      link('moverA', from, t, { m: mi }); link('moverB', from, t, { m: mi });
      for (let i = 0; i < 4; i++) { const u = (i + .5) / 4; L.coins.push([lerp(m.from[0], m.to[0], u), m.from[1] + 1.1, lerp(m.from[2], m.to[2], u)]); }
      cur = t;
    },
    lift() {
      const from = cur; const H = rr(3, 5 + 2 * D); const mC = near(cur, dir, .8, 3, 3, 0, P[cur].top);
      const t = next(.8 + 3 + .8, H, rr(4, 6), rr(4, 6), 'grass', null, { straight: true, keepDir: true }); if (t < 0) return;
      const m = { w: 3, d: 3, from: [mC.x, P[from].top, mC.z], to: [mC.x, P[from].top + H, mC.z], period: (H / (1.3 + D)) * 2, kind: 'lift' };
      L.movers.push(m); const mi = L.movers.length - 1; link('moverA', from, t, { m: mi }); link('moverB', from, t, { m: mi });
      for (let i = 0; i < 3; i++) L.coins.push([mC.x, P[from].top + 1.1 + i * H / 3, mC.z]);
      cur = t;
    },
    vine() {
      if (dir !== 'N') return S.hop();
      const from = cur, H = rr(3.5, 5); const c = P[cur];
      const t = next(0, H, rr(5, 7), Math.min(c.w, rr(5, 7)), 'cliff', null, { straight: true, keepDir: true }); if (t < 0) return;
      const T = P[t]; const v = { x: c.x, z: T.z + T.d / 2, w: 3, y0: c.top, y1: T.top }; L.vines.push(v);
      link('vine', from, t, { v: L.vines.length - 1 });
      for (let i = 0; i < 3; i++) L.coins.push([v.x, v.y0 + 1 + i * (H - .5) / 3, v.z + .6]);
      lineCoins(t, 3);
    },
    enemy(type) {
      const dh = rr(-.5, .8); const i = jumpTo(rr(.55, .9) * gapFor(dh), dh, rr(8, 11), rr(6, 8), 'grass'); if (i < 0) return;
      const p = P[i], nE = 1 + (r() < .3 + D * .6 ? 1 : 0);
      for (let e = 0; e < nE; e++) {
        const along = (dir === 'N' || dir === 'S'); const off = (e - (nE - 1) / 2) * 3;
        const a = along ? [p.x - p.w / 2 + 1, p.z + off] : [p.x + off, p.z - p.d / 2 + 1], b = along ? [p.x + p.w / 2 - 1, p.z + off] : [p.x + off, p.z + p.d / 2 - 1];
        L.enemies.push({ a, b, y: p.top, speed: 1.4 + 1.8 * D + r() * .5, type: type || (w === 5 ? 'robot' : w === 8 ? 'shadow' : 'walker') });
      }
      lineCoins(i, 3);
    },
    roller() {
      const dh = rr(-.3, .5); const i = jumpTo(rr(.55, .9) * gapFor(dh), dh, rr(12, 16), rr(3, 4), 'grass', null, { straight: true }); if (i < 0) return;
      const p = P[i], along = dir === 'N' || dir === 'S', sgn = dir === 'N' || dir === 'W' ? -1 : 1, len = along ? p.d : p.w;
      const far = along ? [p.x, p.z + sgn * (len / 2 - .6)] : [p.x + sgn * (len / 2 - .6), p.z], nearP = along ? [p.x, p.z - sgn * (len / 2 + .5)] : [p.x - sgn * (len / 2 + .5), p.z];
      L.hazards.push({ type: 'roller', a: far, b: nearP, y: p.top, r: .55, speed: 4 + 3 * D, gapT: 2.2 - D, skin: w === 3 ? 'snow' : w === 1 ? 'log' : 'rock' });
      lineCoins(i, 4);
    },
    flip() {
      const dh = rr(-.3, .4); const i = jumpTo(rr(.55, .85) * gapFor(dh), dh, rr(5, 7), rr(2.6, 3.2), 'flip', { flip: { period: 4.6 - 1.2 * D, on: .62 } }, { straight: true }); if (i < 0) return;
      lineCoins(i, 3); jumpTo(rr(.55, .85) * gapFor(0), 0, rr(4, 6), rr(4, 6), 'grass');
    },
    gem() {
      const c = cur; if (P[c].w * P[c].d < 20) return S.hop();
      const side = r() < .5 ? (dir === 'N' ? 'E' : 'N') : (dir === 'N' ? 'W' : 'N'); if (side === 'N' && dir === 'N') return;
      const dh = rr(.5, 1.3); const g = rr(.6, .9) * gapFor(dh);
      for (let tr = 0; tr < 3; tr++) {
        const cand = near(c, side, g, 2.6, 2.6, (r() - .5) * 2, P[c].top + dh);
        if (free(cand, [c])) { const i = add(Object.assign(cand, { kind: kindStone, perch: true })); link('jump', c, i); link('jump', i, c); L.gems.push([cand.x, cand.top + 1.1, cand.z]); arcCoins(c, i); return; }
      }
    },
    mush() {
      const dh0 = rr(-.5, .2); const m = jumpTo(rr(.55, .85) * gapFor(dh0), dh0, 2.8, 2.8, 'mush', { bounce: PHYS.BOUNCE }); if (m < 0) return;
      const dh = rr(2.5, Math.min(4.5, maxRise(ph, PHYS.BOUNCE) * .75)); const from = cur;
      const i = next(rr(.5, .8) * Math.max(1, reach(dh, ph, PHYS.BOUNCE) * f - .6), dh, rr(4, 6), rr(4, 6), 'grass'); if (i < 0) return;
      link('bounce', from, i); arcCoins(from, i); cur = i;
    },
    crumble() {
      const n = 2 + ((r() * (2 + D * 2)) | 0);
      for (let j = 0; j < n; j++) { const dh = rr(-.4, .5); jumpTo(rr(.5, .8) * gapFor(dh), dh, rr(2.6, 3.2), rr(2.6, 3.2), vanishMode === 'vanish' && w === 7 ? 'cloud' : vanishMode === 'sink' ? 'sand' : 'crumble', { crumble: { mode: vanishMode, delay: Math.max(.6, 1 - .4 * D) } }); }
      jumpTo(rr(.5, .8) * gapFor(0), 0, rr(4, 6), rr(4, 6), 'grass');
    },
    spikes(fire) {
      const dh = rr(-.3, .5); const i = jumpTo(rr(.55, .85) * gapFor(dh), dh, rr(9, 12), rr(3.5, 5), fire ? 'stone' : 'grass', null, { straight: true }); if (i < 0) return;
      const p = P[i], along = dir === 'N' || dir === 'S', len = along ? p.d : p.w, nS = 2;
      for (let s = 0; s < nS; s++) { const o = (s - .5) * len * .4; L.hazards.push({ type: 'spikes', x: p.x + (along ? 0 : o), z: p.z + (along ? o : 0), y: p.top, w: along ? p.w : 1.6, d: along ? 1.6 : p.d, period: 2.8 - .6 * D, on: .42, off: s * .5, fire: !!fire }); }
      lineCoins(i, 4);
    },
    erupt() { S.spikes(true); },
    ice() { const n = 1 + ((r() * 2) | 0); for (let j = 0; j < n; j++) { const dh = rr(-.4, .3); jumpTo(rr(.5, .8) * gapFor(dh), dh, rr(7, 10), rr(4, 6), 'ice', { ice: true }); lineCoins(cur, 3); } },
    lake() { const dh = rr(-.2, .2); if (jumpTo(rr(.5, .8) * gapFor(dh), dh, rr(12, 16), rr(8, 11), 'ice', { ice: true }) >= 0) { lineCoins(cur, 5); const p = P[cur]; L.hazards.push({ type: 'roller', a: dir === 'N' ? [p.x - p.w / 2 + .6, p.z] : [p.x, p.z - p.d / 2 + .6], b: dir === 'N' ? [p.x + p.w / 2 + .5, p.z] : [p.x, p.z + p.d / 2 + .5], y: p.top, r: .5, speed: 3.5 + 2 * D, gapT: 2.5, skin: 'snow' }); } },
    conveyor() {
      const dh = rr(-.3, .3); const i = jumpTo(rr(.55, .85) * gapFor(dh), dh, rr(8, 11), rr(3, 4), 'conveyor', null, { straight: true }); if (i < 0) return;
      const sgnF = r() < .5 ? 1 : -1, sp = (1.8 + 1.7 * D) * sgnF, v = dir === 'N' ? [0, -sp] : dir === 'E' ? [sp, 0] : [-sp, 0];
      P[i].conv = v; lineCoins(i, 4);
    },
    wind(updraft) {
      const from = cur; const dh = rr(-.3, .3); const g = rr(.55, .8) * gapFor(dh);
      const i = next(g, dh, rr(5, 7), rr(7, 9), w === 7 ? 'cloud' : 'grass', null, { straight: true }); if (i < 0) return;
      const A = P[from], B = P[i];
      // the wind blows only in the gap between the two platforms
      const span = (a0, a1, b0, b1) => a1 < b0 ? [a1, b0] : b1 < a0 ? [b1, a0] : [Math.min(a0, b0) - 1, Math.max(a1, b1) + 1];
      const [minX, maxX] = span(A.x - A.w / 2, A.x + A.w / 2, B.x - B.w / 2, B.x + B.w / 2), [minZ, maxZ] = span(A.z - A.d / 2, A.z + A.d / 2, B.z - B.d / 2, B.z + B.d / 2);
      const s = (r() < .5 ? 1 : -1) * (4 + 3 * D); const force = dir === 'N' ? [s, 0] : [0, s];
      L.zones.push({ type: 'wind', minX, maxX, minZ, maxZ, minY: Math.min(A.top, B.top) - 3, maxY: Math.max(A.top, B.top) + 6, force });
      link('jump', from, i); arcCoins(from, i); cur = i;
    },
    laser() {
      const dh = rr(-.3, .4); const i = jumpTo(rr(.55, .85) * gapFor(dh), dh, rr(11, 14), rr(3.5, 4.5), w === 5 ? 'metal' : 'grass', null, { straight: true }); if (i < 0) return;
      const p = P[i], along = dir === 'N' || dir === 'S', len = along ? p.d : p.w, n = 2 + (D > .5 ? 1 : 0);
      for (let s = 0; s < n; s++) { const o = ((s + 1) / (n + 1) - .5) * len; const curtain = s % 2 === 1;
        L.hazards.push({ type: 'laser', x: p.x + (along ? 0 : o), z: p.z + (along ? o : 0), y: p.top, len: (along ? p.w : p.d) + .4, axis: along ? 'x' : 'z', h: curtain ? 2.6 : .55, period: curtain ? 3.2 - .6 * D : 0, on: .45, off: s * .7 }); }
      lineCoins(i, 4);
    },
    fireball() {
      const from = cur; const dh = rr(-.3, .5); const i = jumpTo(rr(.6, .9) * gapFor(dh), dh, rr(3.5, 5), rr(3.5, 5), 'stone'); if (i < 0) return;
      const A = P[from], B = P[i]; const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
      L.hazards.push({ type: 'fireball', x: mx + (dir === 'N' ? (r() < .5 ? -1 : 1) * .8 : 0), z: mz + (dir !== 'N' ? (r() < .5 ? -1 : 1) * .8 : 0), y0: Math.min(A.top, B.top) - 4, h: Math.max(A.top, B.top) + 3.5, period: 2.6 - .6 * D, off: r() * 2 });
    },
    sweeper() {
      const dh = rr(-.3, .4); const i = jumpTo(rr(.55, .85) * gapFor(dh), dh, 8.5, 8.5, 'stone', null, { straight: true }); if (i < 0) return;
      const p = P[i]; L.hazards.push({ type: 'sweeper', x: p.x, z: p.z, y: p.top, len: 3.8, h: .5, speed: (1.2 + D) * (r() < .5 ? 1 : -1) }); lineCoins(i, 4);
    },
    invisible() {
      const n = 2 + ((r() * 2) | 0);
      for (let j = 0; j < n; j++) { const dh = rr(-.3, .6); jumpTo(rr(.5, .8) * gapFor(dh), dh, rr(2.8, 3.6), rr(2.8, 3.6), 'glass', { invisible: true }); }
      jumpTo(rr(.5, .8) * gapFor(0), 0, rr(4, 6), rr(4, 6), 'stone');
    },
    tele() {
      const from = cur; const c = P[cur]; if (c.w * c.d < 16) S.hop();
      const a = cur, gap = rr(10, 16), dh = rr(-2, 4);
      const i = next(gap, dh, rr(5, 7), rr(5, 7), 'stone', null, { straight: true }); if (i < 0) return;
      const A = P[a], B = P[i]; const ax = dir === 'N' ? A.x : A.x + (A.w / 2 - 1.2) * (dir === 'E' ? 1 : -1), az = dir === 'N' ? A.z - A.d / 2 + 1.2 : A.z;
      L.teleporters.push({ a: [ax, A.top, az], b: [B.x, B.top, B.z] }); link('tele', a, i, { k: L.teleporters.length - 1 });
      cur = i; lineCoins(i, 2);
    },
    gravlift() {
      const from = cur; const H = rr(5.5, 8.5); const col = near(cur, dir, .6, 3, 3, 0, P[cur].top);
      const i = next(.6 + 3 + .6, H, rr(4.5, 6), rr(4.5, 6), 'stone', null, { straight: true, keepDir: true }); if (i < 0) return;
      L.zones.push({ type: 'lift', minX: col.x - 1.5, maxX: col.x + 1.5, minZ: col.z - 1.5, maxZ: col.z + 1.5, minY: P[from].top - 2, maxY: P[i].top + 1.6 });
      link('lift', from, i, { z: L.zones.length - 1 }); for (let j = 0; j < 4; j++) L.coins.push([col.x, P[from].top + 1.5 + j * H / 4, col.z]);
      cur = i;
    },
    gate() {
      const dh = rr(-.3, .4); const g = jumpTo(rr(.55, .85) * gapFor(dh), dh, 8, 8, 'temple', null, { straight: true }); if (g < 0) return;
      const G = P[g]; const side = r() < .5 ? 1 : -1; const sd = dir === 'N' ? (side > 0 ? 'E' : 'W') : 'N';
      let perch = -1; const dh2 = rr(.4, 1.2);
      for (let tr = 0; tr < 4 && perch < 0; tr++) { const cand = near(g, sd, rr(.55, .8) * gapFor(dh2), 3, 3, (r() - .5) * 2, G.top + dh2); if (free(cand, [g])) perch = add(Object.assign(cand, { kind: kindStone, perch: true })); }
      if (perch < 0) { L.switches.push({ x: G.x - (dir === 'N' ? 2.5 : 0), y: G.top, z: G.z + (dir === 'N' ? 0 : 2.5), gate: L.gates.length }); }
      else { const pp = P[perch]; L.switches.push({ x: pp.x, y: pp.top, z: pp.z, gate: L.gates.length }); link('jump', g, perch); link('jump', perch, g); arcCoins(g, perch); }
      const along = dir === 'N'; const gx = along ? G.x : G.x + (G.w / 2 - .4) * (dir === 'E' ? 1 : -1), gz = along ? G.z - G.d / 2 + .4 : G.z;
      L.gates.push({ x: gx, z: gz, w: along ? G.w + 8 : .6, d: along ? .6 : G.d + 8, y: G.top, h: 5 });
      link('gate', g, g, { s: L.switches.length - 1, g: L.gates.length - 1 }); run = Math.max(run, 1);
    },
    arena() {
      const dh = rr(-.3, .3); const g = jumpTo(rr(.55, .85) * gapFor(dh), dh, 12, 12, 'temple', null, { straight: true }); if (g < 0) return;
      const G = P[g]; const first = L.enemies.length, nE = 3 + Math.round(2 * D);
      for (let e = 0; e < nE; e++) { const a = (e / nE) * Math.PI * 2; const cx = G.x + Math.cos(a) * 3, cz = G.z + Math.sin(a) * 3; L.enemies.push({ a: [cx - 1.8, cz], b: [cx + 1.8, cz + (e % 2 ? 1.5 : -1.5)], y: G.top, speed: 1.8 + 1.6 * D, type: w === 9 ? 'alien' : 'walker' }); }
      const along = dir === 'N'; const gx = along ? G.x : G.x + (G.w / 2 - .4) * (dir === 'E' ? 1 : -1), gz = along ? G.z - G.d / 2 + .4 : G.z;
      L.gates.push({ x: gx, z: gz, w: along ? G.w + 8 : .6, d: along ? .6 : G.d + 8, y: G.top, h: 5 });
      L.arenas.push({ gate: L.gates.length - 1, enemies: Array.from({ length: nE }, (_, j) => first + j) });
      link('arena', g, g, { ar: L.arenas.length - 1 }); lineCoins(g, 4); run = Math.max(run, 1);
    },
    flyer() {
      const from = cur; const dh = rr(-.3, .5); const i = jumpTo(rr(.55, .85) * gapFor(dh), dh, rr(6, 8), rr(5, 7), w === 7 ? 'cloud' : 'grass'); if (i < 0) return;
      const p = P[i], along = dir === 'N';
      L.enemies.push({ a: along ? [p.x - p.w / 2, p.z] : [p.x, p.z - p.d / 2], b: along ? [p.x + p.w / 2, p.z] : [p.x, p.z + p.d / 2], y: p.top + 1.6, speed: 2 + 2 * D, type: 'flyer' });
    },
    jelly() {
      const from = cur; const dh = rr(-.3, .6); const i = jumpTo(rr(.6, .9) * gapFor(dh), dh, rr(4, 5.5), rr(4, 5.5), 'coral'); if (i < 0) return;
      const A = P[from], B = P[i]; const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, lo = Math.min(A.top, B.top) - 3, hi = Math.max(A.top, B.top) + 4;
      const off = dir === 'N' ? [1.6, 0] : [0, 1.6]; const s = r() < .5 ? 1 : -1;
      L.enemies.push({ a: [mx + off[0] * s, mz + off[1] * s], b: [mx + off[0] * s, mz + off[1] * s], y: lo, y2: hi, speed: 1.2 + D, type: 'jelly' });
    },
    maze() {
      const dh = rr(-.2, .2); const g = jumpTo(rr(.55, .8) * gapFor(dh), dh, 17, 14, 'castle', null, { straight: true, keepDir: true, exact: true }); if (g < 0) return;
      const G = P[g], N = 3, cs = 14 / N; // perfect maze (DFS spanning tree) in the north 14 units, 3-unit foyer to the south
      const x0 = G.x - 7, z0 = G.z - G.d / 2, wallH = 4.5, entry = N * (N - 1) + 1;
      const vis = new Set([entry]), open = new Set(); const key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
      const stack = [entry];
      while (stack.length) { const c = stack[stack.length - 1], cx = c % N, cy = (c / N) | 0; const nb = []; if (cx > 0) nb.push(c - 1); if (cx < N - 1) nb.push(c + 1); if (cy > 0) nb.push(c - N); if (cy < N - 1) nb.push(c + N);
        const un = nb.filter((q) => !vis.has(q)); if (!un.length) { stack.pop(); continue; } const q = un[(r() * un.length) | 0]; open.add(key(c, q)); vis.add(q); stack.push(q); }
      const W_ = (x, z, w2, d2) => L.walls.push({ x, z, w: w2, d: d2, y: G.top, h: wallH });
      for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) { const c = cy * N + cx;
        if (cx < N - 1 && !open.has(key(c, c + 1))) W_(x0 + (cx + 1) * cs, z0 + (cy + .5) * cs, .5, cs + .5);
        if (cy < N - 1 && !open.has(key(c, c + N))) W_(x0 + (cx + .5) * cs, z0 + (cy + 1) * cs, cs + .5, .5); }
      const exitC = (r() * N) | 0;
      W_(x0 + .25, z0 + 7, .5, 14); W_(x0 + 13.75, z0 + 7, .5, 14); // outer east/west
      for (let cx = 0; cx < N; cx++) { if (cx !== exitC) W_(x0 + (cx + .5) * cs, z0 + .25, cs + .5, .5); if (cx !== 1) W_(x0 + (cx + .5) * cs, z0 + 14, cs + .5, .5); }
      const prev = new Map([[entry, -1]]); const q = [entry];
      while (q.length) { const c = q.shift(); const cx = c % N; for (const d of [-1, 1, -N, N]) { const nb = c + d; if (nb < 0 || nb >= N * N) continue; if ((d === -1 && cx === 0) || (d === 1 && cx === N - 1)) continue; if (!open.has(key(c, nb)) || prev.has(nb)) continue; prev.set(nb, c); q.push(nb); } }
      const pts = [[x0 + 1.5 * cs, z0 + 15.5]]; const cells = []; for (let c = exitC; c !== -1; c = prev.get(c)) cells.unshift(c);
      for (const c of cells) pts.push([x0 + (c % N + .5) * cs, z0 + (((c / N) | 0) + .5) * cs]);
      pts.push([x0 + (exitC + .5) * cs, z0 + .9]);
      for (const pt of pts.slice(1, -1)) L.coins.push([pt[0], G.top + 1, pt[1]]);
      link('path', g, g, { pts });
      G.exitX = x0 + (exitC + .5) * cs; G.exitZ = z0 + .9;
    },
  };
  // world/band pools (primary mechanic first: it is guaranteed to appear)
  const POOLS = [
    [['hop', 'stairs', 'bridge'], ['mover', 'lift', 'hop'], ['roller', 'flip', 'hop'], ['enemy', 'gem', 'hop'], ['mover', 'roller', 'flip', 'enemy', 'lift', 'stairs', 'gem']],
    [['stump', 'bridge', 'hop'], ['mush', 'stump', 'hop'], ['vine', 'roller', 'lift'], ['enemy', 'gem', 'flyer'], ['mush', 'roller', 'stump', 'vine', 'enemy', 'crumble']],
    [['crumble', 'hop', 'bridge'], ['gate', 'stairs', 'hop'], ['wind', 'spikes', 'hop'], ['mover', 'lift', 'hop'], ['spikes', 'crumble', 'mover', 'gate', 'roller']],
    [['ice', 'hop'], ['roller', 'ice', 'hop'], ['lake', 'crumble', 'ice'], ['gate', 'ice', 'hop'], ['roller', 'ice', 'crumble', 'mover', 'lake']],
    [['fireball', 'hop', 'stairs'], ['erupt', 'hop', 'fireball'], ['fireball', 'hop', 'mover'], ['crumble', 'fireball', 'hop'], ['fireball', 'erupt', 'crumble', 'lift', 'mover']],
    [['roof', 'hop'], ['laser', 'roof'], ['enemy', 'roof', 'laser'], ['lift', 'conveyor', 'mover'], ['lift', 'laser', 'conveyor', 'enemy', 'roof']],
    [['hop', 'stairs'], ['wind', 'hop'], ['jelly', 'hop'], ['gate', 'jelly', 'hop'], ['wind', 'jelly', 'gate', 'mover']],
    [['hop', 'mover', 'roof'], ['wind', 'gravlift', 'hop'], ['crumble', 'hop'], ['flyer', 'hop'], ['wind', 'crumble', 'flyer', 'laser', 'enemy']],
    [['maze', 'hop'], ['invisible', 'hop'], ['enemy', 'hop'], ['sweeper', 'hop'], ['maze', 'invisible', 'sweeper', 'enemy', 'crumble']],
    [['gravlift', 'hop'], ['tele', 'hop'], ['roller', 'flip', 'mush', 'ice', 'laser', 'fireball', 'sweeper', 'invisible', 'crumble', 'conveyor'], ['arena', 'hop'], ['arena', 'tele', 'gravlift', 'laser', 'sweeper', 'invisible', 'fireball', 'crumble', 'flyer']],
  ];
  // start
  add({ x: 0, z: 0, w: 8, d: 10, top: 0, kind: 'grass' }); L.start = [0, 0, 3];
  if (L.dark) L.trees.push([-3, 0, 3.5]);
  const pool = POOLS[w][band]; const older = w > 0 ? POOLS[w - 1][4] : [];
  const nSeg = 6 + Math.round(5 * D) + (band === 4 ? 2 : 0) + (w === 9 && band === 4 ? 3 : 0);
  const cpEvery = band === 4 && w === 9 ? 3 : 4;
  let segs = 0;
  for (let s = 0; s < nSeg; s++) {
    // turn sometimes (keeps levels from being straight lines)
    if (run <= 0 && r() < .35 && s > 0 && s < nSeg - 1) { dir = dir === 'N' ? (r() < .5 ? 'E' : 'W') : 'N'; run = dir === 'N' ? 2 : 1 + ((r() * 2) | 0); }
    let name = s === 0 ? pool[0] : (r() < .15 + .1 * D && older.length ? pick(older) : pick(pool));
    if (name === 'maze' || name === 'vine') { dir = 'N'; run = 2; }
    const before = cur; if (globalThis.__GDBG) console.log(n, s, name, dir, cur);
    // a maze exit must lead north from the exit cell
    S[name]();
    if (P[cur].exitX !== undefined) { const G = P[cur]; dir = 'N'; const T = next(rr(.55, .8) * gapFor(0), 0, rr(4, 5), 3, 'stone', null, { straight: true, keepDir: true }); if (T >= 0) { P[T].x = G.exitX; link('jump', cur, T, { sx: G.exitX, sz: G.exitZ }); cur = T; } }
    run--; segs++;
    if (segs % cpEvery === 0 && s < nSeg - 1) { const p = P[cur]; if (!p.crumble && !p.flip && !p.invisible && p.kind !== 'mush' && p.kind !== 'castle') L.checkpoints.push([p.x, p.top, p.z]); }
    if (cur === before) { S.hop(); }
  }
  // goal
  dir = 'N'; const gi = jumpTo(rr(.55, .8) * gapFor(0), rr(-.2, .5), 8, 8, 'grass', null, { straight: true });
  const G = P[cur]; L.goal = [G.x, G.top, G.z - 2.5];
  // scenery on big platforms
  for (const p of P) { if (p.w * p.d < 30 || p.kind === 'ice' || p.kind === 'mush' || p.kind === 'castle' || p.kind === 'temple' || p.perch) continue; const c = r() < .5 ? -1 : 1; L.trees.push([p.x + c * (p.w / 2 - .8), p.top, p.z + (r() - .5) * (p.d - 1.6)]); }
  // escape levels get a generous timer (estimated route time x 2.2 + 20 s)
  if (band === 4 && w > 0) { const est = L.links.length * 2.6 + 20; L.timer = Math.round(est * (2.2 - .5 * D) / 5) * 5; L.hint += ' · Beat the clock!'; }
  let minTop = 0; for (const p of P) minTop = Math.min(minTop, p.top);
  L.killY = minTop - 10;
  if (L.dark) L.hint += ' · Follow the glowing clues.';
  return L;
}

function bossLevel(n, w) {
  const B = BOSSES[w], W = WORLDS[w];
  const L = { n, world: w, band: 4, boss: Object.assign({}, B, { idx: w }), name: B.name, maxReward: rewardFor(n), hint: `BOSS: ${B.name}! Dodge its attacks, then hit it with SPIN, DASH or a STOMP while it is dizzy.`,
    start: [0, 0, 11], platforms: [{ x: 0, z: 0, w: 28, d: 28, top: 0, kind: 'arena' }, { x: 0, z: 18, w: 8, d: 8, top: 0, kind: 'grass' }], movers: [], vines: [], enemies: [], coins: [], gems: [], checkpoints: [], hazards: [], zones: [], teleporters: [], switches: [], gates: [], arenas: [], links: [], trees: [], walls: [],
    goal: [0, 0, -9], timer: 0, phys: physFor(w, 0), dark: !!W.dark, killY: -10, generated: true };
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; L.coins.push([Math.cos(a) * 11, 1, Math.sin(a) * 11]); }
  return L;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
