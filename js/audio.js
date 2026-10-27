// UPSTAGGLES – procedural audio: synth SFX + an upbeat generative music loop (no audio files).
let actx = null, master = null, sfxBus = null, musicBus = null, comp = null, noiseBuf = null;
export const vol = { sfx: .8, music: .55, on: true };
export function audio() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(actx.destination);
      master = actx.createGain(); master.connect(comp);
      sfxBus = actx.createGain(); sfxBus.connect(master);
      musicBus = actx.createGain(); musicBus.connect(master);
      noiseBuf = actx.createBuffer(1, actx.sampleRate * .5, actx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolumes();
    } catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
export function applyVolumes() {
  if (!actx) return;
  master.gain.value = vol.on ? 1 : 0; sfxBus.gain.value = vol.sfx; musicBus.gain.value = vol.music * .5;
}
function tone(freq, dur, type, v, slide, delay, bus, at) {
  const a = audio(); if (!a) return;
  const t0 = (at || a.currentTime) + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v || .15, t0 + .006); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g); g.connect(bus || sfxBus); o.start(t0); o.stop(t0 + dur + .03);
}
function noise(dur, v, f0, f1, type, delay, bus, at) {
  const a = audio(); if (!a) return;
  const t0 = (at || a.currentTime) + (delay || 0);
  const s = a.createBufferSource(); s.buffer = noiseBuf;
  const f = a.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(f0, t0); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur); f.Q.value = 1.2;
  const g = a.createGain(); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t0); s.stop(t0 + dur + .02);
}
export function sfx(name, n) {
  if (!vol.on || !audio()) return;
  switch (name) {
    case 'coin': { const k = Math.pow(1.0595, Math.min(n || 0, 14)); tone(988 * k, .07, 'square', .05); tone(1319 * k, .22, 'square', .05, 0, .055); tone(2637 * k, .16, 'sine', .04, 0, .055); break; }
    case 'gem': [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, .2, 'triangle', .08, 0, i * .05)); break;
    case 'jump': tone(280, .16, 'triangle', .13, 640); noise(.08, .05, 1800, 4000, 'highpass'); break;
    case 'djump': tone(420, .2, 'triangle', .12, 980); tone(840, .14, 'sine', .05, 1600, .03); noise(.12, .05, 2500, 6000, 'highpass'); break;
    case 'land': noise(.09, .12, 500, 150, 'lowpass'); tone(110, .08, 'sine', .1, 60); break;
    case 'step': noise(.04, .025, 900, 400, 'bandpass'); break;
    case 'dash': noise(.25, .14, 600, 3500, 'bandpass'); tone(200, .18, 'sawtooth', .04, 500); break;
    case 'spin': noise(.25, .09, 1200, 5000, 'bandpass'); tone(500, .2, 'sawtooth', .04, 1300); break;
    case 'bonk': tone(220, .25, 'square', .1, 60); tone(880, .12, 'triangle', .1, 1500, .05); noise(.12, .12, 800, 200, 'lowpass'); break;
    case 'hurt': tone(220, .32, 'sawtooth', .11, 80); noise(.2, .1, 600, 200, 'lowpass'); break;
    case 'check': [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'triangle', .11, 0, i * .07)); break;
    case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => { tone(f, .26, 'triangle', .12, 0, i * .11); tone(f / 2, .26, 'square', .03, 0, i * .11); }); break;
    case 'fall': tone(700, .55, 'sine', .1, 110); break;
    case 'click': tone(700, .05, 'triangle', .07); break;
    case 'bounce': tone(180, .3, 'sine', .16, 900); tone(360, .2, 'triangle', .06, 1400, .02); break;
    case 'crumble': noise(.35, .1, 300, 120, 'lowpass'); break;
    case 'zap': tone(1400, .12, 'sawtooth', .05, 300); break;
    case 'tele': tone(300, .35, 'sine', .1, 1800); tone(450, .35, 'triangle', .05, 2400, .05); break;
    case 'switch': tone(330, .08, 'square', .08); tone(660, .15, 'square', .08, 0, .08); break;
    case 'boom': noise(.6, .25, 400, 60, 'lowpass'); tone(90, .5, 'sine', .2, 40); break;
    case 'roar': tone(120, .7, 'sawtooth', .12, 70); noise(.6, .1, 500, 200, 'bandpass'); break;
    case 'bossHit': tone(160, .3, 'square', .14, 50); noise(.3, .18, 900, 150, 'lowpass'); tone(1200, .15, 'triangle', .07, 2400, .04); break;
    case 'shoot': tone(600, .18, 'square', .05, 200); break;
    case 'combo': [784, 988, 1175, 1568].forEach((f, i) => tone(f, .12, 'square', .045, 0, i * .04)); break;
    case 'buy': [659, 880, 1319].forEach((f, i) => tone(f, .15, 'triangle', .1, 0, i * .07)); break;
    case 'deny': tone(200, .2, 'square', .08, 150); break;
    case 'splash': noise(.4, .15, 1200, 300, 'bandpass'); break;
    case 'fanfare': [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, .35, 'triangle', .1, 0, i * .13); tone(f * 1.5, .3, 'sine', .04, 0, i * .13 + .06); }); break;
  }
}

// ------------------------------------------------------------ music: generative upbeat loop per world
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], phryg: [0, 1, 3, 5, 7, 8, 10] };
let song = null, timer = 0, nextT = 0, step = 0;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function playMusic(cfg) { // cfg: {root (midi), scale, bpm, seed, mood}
  const key = JSON.stringify(cfg);
  if (song && song.key === key) return;
  song = Object.assign({ key }, cfg); step = 0;
  let a = (cfg.seed || 1) >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const sc = SCALES[cfg.scale] || SCALES.major;
  // chord progression (scale degrees) and a 16-step lead motif
  const progs = [[0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 4, 5, 3], [0, 6, 5, 4]];
  song.prog = progs[(r() * progs.length) | 0];
  song.motif = []; for (let i = 0; i < 16; i++) song.motif.push(r() < .72 ? ((r() * 7) | 0) + (r() < .3 ? 7 : 0) : -1);
  song.motif2 = song.motif.map((d) => (d < 0 || r() < .3) ? d : d + ((r() * 3) | 0) - 1);
  song.sc = sc;
  if (!timer) timer = setInterval(tick, 50);
  if (actx) nextT = actx.currentTime + .05;
}
export function stopMusic() { song = null; }
function deg(d, oct) { const sc = song.sc; const o = Math.floor(d / 7); return song.root + oct * 12 + o * 12 + sc[((d % 7) + 7) % 7]; }
function tick() {
  if (!song || !actx || !vol.on || vol.music <= 0 || actx.state !== 'running') { if (actx) nextT = actx.currentTime + .05; return; }
  const spb = 60 / song.bpm / 4; // 16th note
  if (nextT < actx.currentTime) nextT = actx.currentTime + .02;
  while (nextT < actx.currentTime + .2) {
    const s = step % 16, bar = Math.floor(step / 16) % 4, chord = song.prog[bar], t = nextT;
    // drums
    if (s % 4 === 0) { tone(150, .16, 'sine', .32, 45, 0, musicBus, t); }
    if (s % 8 === 4) noise(.14, .16, 1800, 900, 'bandpass', 0, musicBus, t);
    if (s % 2 === 1) noise(.035, .05, 8000, 0, 'highpass', 0, musicBus, t);
    // bass (offbeat pump)
    if (s % 4 === 2 || s === 0) tone(midi(deg(chord, -2)), spb * 1.6, 'square', .07, 0, 0, musicBus, t);
    // chord stabs
    if (s === 0 || s === 6 || s === 10) for (const k of [0, 2, 4]) tone(midi(deg(chord + k, 0)), spb * 1.8, 'triangle', .028, 0, 0, musicBus, t);
    // lead
    const m = (Math.floor(step / 64) % 2 ? song.motif2 : song.motif)[s];
    if (m >= 0 && bar !== 3) tone(midi(deg(m + chord, 1)), spb * 1.4, song.mood === 'dark' ? 'sawtooth' : 'square', .03, 0, 0, musicBus, t);
    if (bar === 3 && s % 2 === 0) tone(midi(deg(chord + (s / 2) % 5, 1)), spb * 1.1, 'triangle', .035, 0, 0, musicBus, t); // fill arpeggio
    step++; nextT += spb;
  }
}
