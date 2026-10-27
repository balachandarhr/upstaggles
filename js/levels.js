// UPSTAGGLES – World 1 Beginner Valley, levels 1–5 (handcrafted data)
// Coordinates: x right, y up, z forward is NEGATIVE z. Platform: top surface height + footprint.
const lerp = (a, b, t) => a + (b - a) * t;
function P(x, z, w, d, top, kind) { return { x, z, w, d, top, kind: kind || 'grass' }; }
// coin helpers (y given = surface height; coin floats 1 unit above)
function line(c, a, b, n) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); c.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + 1, lerp(a[2], b[2], t)]); } }
function arc(c, a, b, n, h) { for (let i = 0; i < n; i++) { const t = (i + 1) / (n + 1); c.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + 1 + 4 * h * t * (1 - t), lerp(a[2], b[2], t)]); } }
function ring(c, ctr, r, n) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; c.push([ctr[0] + Math.cos(a) * r, ctr[1] + 1, ctr[2] + Math.sin(a) * r]); } }

function L1() {
  const c = [];
  line(c, [0, 0, 1], [0, 0, -14], 7);
  ring(c, [0, 0, -21], 2.6, 8);
  line(c, [0, .8, -27.5], [0, .8, -31], 3);
  arc(c, [0, .8, -31.6], [0, .8, -34.4], 2, 1.0);
  line(c, [-1.5, .8, -36], [1.5, .8, -39.5], 4);
  arc(c, [-1, .8, -41.2], [-2.5, 1.6, -44], 2, 1.2);
  line(c, [-3, 1.6, -45], [-3, 1.6, -48], 3);
  arc(c, [-3, 1.6, -49.4], [-3, 1.6, -51.6], 1, 1.2);
  line(c, [-6, 1.6, -54], [0, 1.6, -54], 4);
  return {
    name: 'First Steps', maxReward: 100,
    hint: 'Move with the joystick (WASD / arrows). Tap JUMP (Space) to hop up ledges. Collect coins and reach the swirling portal!',
    palette: { skyTop: 0x3ea6ff, skyLow: 0xd4f1ff, grass: 0x7bd44a, dirt: 0xb07a4a },
    start: [0, 0, 3],
    platforms: [
      P(0, 0, 8, 12, 0), P(0, -11, 3, 10, 0, 'bridge'), P(0, -21, 8, 10, 0),
      P(0, -29, 6, 6, .8), P(0, -37.5, 6, 8, .8), P(-3, -46.5, 6, 6, 1.6), P(-3, -56.5, 10, 10, 1.6),
    ],
    movers: [], vines: [], enemies: [], coins: c,
    checkpoints: [[0, 0, -19], [2, .8, -35]],
    goal: [-3, 1.6, -59.5],
    trees: [[-3, 0, 4.5], [3.2, 0, 3.5], [-3.2, 0, -24.5], [3.3, 0, -17], [-7, 1.6, -60.5], [1.2, 1.6, -60.8], [2.2, .8, -40.5]],
  };
}

function L2() {
  const c = [];
  line(c, [0, 0, 2], [0, 0, -3], 3);
  arc(c, [0, 0, -5], [0, 0, -6], 1, .8); line(c, [0, 0, -8], [0, 0, -8], 1);
  arc(c, [0, 0, -10], [2, .5, -12], 1, 1.2); line(c, [2, .5, -14], [2, .5, -14], 1);
  arc(c, [2, .5, -16], [-1, 1, -18.5], 2, 1.2); line(c, [-1, 1, -20.5], [-1, 1, -20.5], 1);
  ring(c, [0, 1, -28], 2.5, 6);
  line(c, [0, 2, -34.5], [0, 2, -34.5], 1); line(c, [0, 3, -38.5], [0, 3, -38.5], 1); line(c, [0, 4, -42.5], [0, 4, -42.5], 1);
  line(c, [-2.5, 4, -48], [2.5, 4, -52], 5);
  line(c, [4, 3, -59], [4, 3, -59], 1); line(c, [8, 3, -63], [8, 3, -63], 1); line(c, [8, 2.5, -68.5], [8, 2.5, -68.5], 1);
  ring(c, [8, 2, -76], 2.4, 6);
  return {
    name: 'Hop Along', maxReward: 125,
    hint: 'Hold JUMP longer to jump higher. Stepping stones ahead – watch the gaps!',
    palette: { skyTop: 0x48a8ff, skyLow: 0xe1f5ff, grass: 0x8ddc3f, dirt: 0xa8703f },
    start: [0, 0, 2.5],
    platforms: [
      P(0, 0, 8, 10, 0), P(0, -8, 4, 4, 0, 'stone'), P(2, -14, 4, 4, .5, 'stone'), P(-1, -20.5, 4, 4, 1, 'stone'),
      P(0, -28, 8, 8, 1), P(0, -34.5, 4, 3, 2, 'stone'), P(0, -38.5, 4, 3, 3, 'stone'), P(0, -42.5, 4, 3, 4, 'stone'),
      P(0, -50, 8, 10, 4), P(4, -59, 3, 3, 3, 'stone'), P(8, -63, 3, 3, 3, 'stone'), P(8, -68.5, 3, 3, 2.5, 'stone'),
      P(8, -76, 10, 10, 2),
    ],
    movers: [], vines: [], enemies: [], coins: c,
    checkpoints: [[-2.5, 1, -25.5], [-2.5, 4, -46.5]],
    goal: [8, 2, -79],
    trees: [[-3, 0, 3.5], [3, 0, -3.5], [3.2, 1, -31], [-3.2, 4, -54], [3.2, 4, -46], [12, 2, -80], [4, 2, -72]],
  };
}

function L3() {
  const c = [];
  line(c, [0, 0, 2], [0, 0, -12], 6);
  line(c, [0, .6, -13.6], [0, 3.6, -13.6], 4); // up the vine
  line(c, [-2, 5, -18], [2, 5, -18], 3);
  line(c, [4, 5.5, -26], [4, 5.5, -26], 1); line(c, [0, 6, -31], [0, 6, -31], 1); line(c, [-4, 6.5, -36], [-4, 6.5, -36], 1);
  arc(c, [4, 5, -22], [4, 5.5, -24.5], 1, 1.2); arc(c, [3, 5.5, -27.5], [1, 6, -29.5], 1, 1.2); arc(c, [-1, 6, -32.5], [-3, 6.5, -34.5], 1, 1.2);
  line(c, [-2, 6.5, -41], [2, 6.5, -41], 3);
  line(c, [0, 7, -44.6], [0, 9.2, -44.6], 3); // second vine
  line(c, [0, 10, -48], [0, 10, -52], 3);
  line(c, [-6.3, 11, -57.4], [-5.7, 11, -56.6], 3); // bonus perch
  line(c, [0, 10, -56], [0, 10, -60], 3);
  ring(c, [0, 9, -67], 3, 6);
  return {
    name: 'Vine Climb', maxReward: 150,
    hint: 'Walk into the green vines to CLIMB. Press JUMP to leap off. Look for the hidden bonus perch!',
    palette: { skyTop: 0x5aa8ff, skyLow: 0xfff0d6, grass: 0x5fcf6a, dirt: 0x9a6a44 },
    start: [0, 0, 2.5],
    platforms: [
      P(0, 0, 8, 10, 0), P(0, -10, 6, 8, 0), P(0, -18, 8, 8, 5, 'cliff'),
      P(4, -26, 3, 3, 5.5, 'stone'), P(0, -31, 3, 3, 6, 'stone'), P(-4, -36, 3, 3, 6.5, 'stone'),
      P(0, -42, 8, 6, 6.5), P(0, -49, 8, 8, 10, 'cliff'), P(-6, -57, 2.5, 2.5, 11, 'stone'),
      P(0, -58, 3, 6, 10, 'bridge'), P(0, -67, 10, 10, 9),
    ],
    movers: [],
    vines: [{ x: 0, z: -14, w: 3, y0: 0, y1: 5 }, { x: 0, z: -45, w: 3, y0: 6.5, y1: 10 }],
    enemies: [], coins: c,
    checkpoints: [[2.8, 5, -16], [2.8, 6.5, -40]],
    goal: [0, 9, -70],
    trees: [[-3, 0, 3.5], [2.5, 0, -8], [-3, 5, -21], [3.2, 6.5, -44], [-3.2, 10, -51.5], [4, 9, -71], [-4, 9, -63]],
  };
}

function L4() {
  const c = [];
  line(c, [0, 0, 2], [0, 0, -3], 3);
  line(c, [0, 0, -8], [0, 0, -16], 4); // over moving platform
  line(c, [-2.5, 0, -21], [2.5, 0, -21], 3);
  line(c, [0, 0, -27], [0, 0, -31], 3);
  line(c, [4, 0, -29], [8, 0, -29], 3);
  line(c, [12, 1, -34], [12, 1, -41], 4);
  line(c, [12, 2, -46], [12, 2, -46], 1);
  line(c, [12, 3, -51], [12, 5.5, -51], 3); // lift column
  ring(c, [12, 6, -58], 2.5, 6);
  return {
    name: 'Drifting Meadow', maxReward: 175,
    hint: 'Ride the moving platforms! A grumpy Grumble blocks the way – press SPIN (E/J) to bonk it, DASH (Shift) through it, or stomp on it.',
    palette: { skyTop: 0x2f9cff, skyLow: 0xdaf6ff, grass: 0x9be05a, dirt: 0xb07a4a },
    start: [0, 0, 2.5],
    platforms: [
      P(0, 0, 8, 10, 0), P(0, -22, 8, 8, 0), P(0, -29, 4, 6, 0), P(12, -29, 4, 6, 0),
      P(12, -37, 6, 10, 1), P(12, -46, 3, 3, 2, 'stone'), P(12, -58, 8, 8, 6),
    ],
    movers: [
      { w: 3, d: 3, from: [0, 0, -6.5], to: [0, 0, -16.5], period: 6 },
      { w: 3, d: 3, from: [3.5, 0, -29], to: [8.5, 0, -29], period: 5 },
      { w: 3, d: 3, from: [12, 2, -51], to: [12, 6, -51], period: 6 },
    ],
    vines: [],
    enemies: [{ a: [-3, -23.5], b: [3, -23.5], y: 0, speed: 1.4 }, { a: [9.8, -38.5], b: [14.2, -38.5], y: 1, speed: 1.6 }],
    coins: c,
    checkpoints: [[-3, 0, -19], [9.8, 1, -33]],
    goal: [12, 6, -60.5],
    trees: [[-3, 0, 3.5], [3, 0, 3.8], [3.2, 0, -25.2], [14.3, 0, -27], [14.5, 1, -41.2], [8.6, 6, -61.3], [15.4, 6, -55]],
  };
}

function L5() {
  const c = [];
  line(c, [0, 0, 2], [0, 0, -3], 3);
  line(c, [0, .5, -9], [0, .5, -9], 1); line(c, [0, 1.2, -15], [0, 1.2, -15], 1);
  arc(c, [0, 0, -5], [0, .5, -7], 1, 1); arc(c, [0, .5, -11], [0, 1.2, -13], 1, 1);
  line(c, [-2.5, 1.2, -20], [2.5, 1.2, -20], 3);
  line(c, [0, 1.8, -25.6], [0, 4, -25.6], 3); // vine
  line(c, [0, 5, -35], [0, 5, -41], 3); // mover
  line(c, [-3, 5, -44.5], [3, 5, -44.5], 4);
  line(c, [0, 5.5, -54.5], [0, 8, -54.5], 3); // lift
  line(c, [0, 9, -60], [0, 9, -62], 2);
  line(c, [4, 9.5, -67], [4, 9.5, -67], 1); line(c, [0, 10, -72], [0, 10, -72], 1);
  arc(c, [3, 9.5, -68.5], [1, 10, -70.5], 1, 1.2);
  ring(c, [0, 10.5, -78.5], 3.2, 8);
  return {
    name: 'Valley Summit', maxReward: 200,
    hint: 'Everything you learned: hop, climb, ride and bonk your way to the summit portal!',
    palette: { skyTop: 0x6a7dff, skyLow: 0xffd8b0, grass: 0x6cc24a, dirt: 0xa0683e },
    start: [0, 0, 2.5],
    platforms: [
      P(0, 0, 10, 10, 0), P(0, -9, 4, 4, .5, 'stone'), P(0, -15, 4, 4, 1.2, 'stone'), P(0, -22, 8, 8, 1.2),
      P(0, -29.5, 8, 7, 5, 'cliff'), P(0, -47, 8, 8, 5), P(0, -61, 6, 6, 9), P(4, -67, 3, 3, 9.5, 'stone'),
      P(0, -72, 3, 3, 10, 'stone'), P(0, -79, 10, 10, 10.5),
    ],
    movers: [
      { w: 3, d: 3, from: [0, 5, -34.5], to: [0, 5, -41.5], period: 6 },
      { w: 3, d: 3, from: [0, 5, -54.5], to: [0, 9, -54.5], period: 6 },
    ],
    vines: [{ x: 0, z: -26, w: 3, y0: 1.2, y1: 5 }],
    enemies: [
      { a: [-2.5, -23.8], b: [2.5, -23.8], y: 1.2, speed: 1.5 },
      { a: [-3, -47], b: [3, -47], y: 5, speed: 1.8 },
      { a: [3, -49.5], b: [-3, -49.5], y: 5, speed: 1.4 },
      { a: [-3.5, -76.5], b: [3.5, -76.5], y: 10.5, speed: 2.0 },
    ],
    coins: c,
    checkpoints: [[-3, 1.2, -19], [-3, 5, -44], [2.3, 9, -59]],
    goal: [0, 10.5, -82],
    trees: [[-4, 0, 3.5], [4, 0, -3.5], [3.2, 1.2, -25], [-3.2, 5, -50.5], [-2.3, 9, -63.3], [-4.2, 10.5, -83.5], [4.2, 10.5, -83.2]],
  };
}

export const LEVELS = [L1(), L2(), L3(), L4(), L5()];
