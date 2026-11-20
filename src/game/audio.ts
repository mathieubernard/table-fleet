/** Petits sons de synthèse et musique de fond : aucun fichier à charger. */
import { Music } from "./music";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: Music | null = null;
let muted = false;

/** À appeler à chaque geste : crée le contexte au premier, le relance ensuite (Safari le suspend volontiers). */
export function audioUnlock(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    // limiteur en sortie : rien ne sature, même quand les effets s'empilent
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -2;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.003;
    limit.release.value = 0.15;
    master.connect(limit).connect(ctx.destination);
    music = new Music(ctx, master);
    if (!muted && !document.hidden) music.play();
  }
  if (ctx.state !== "running" && !document.hidden) void ctx.resume();
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  if (music) { if (muted) music.pause(); else if (!document.hidden) music.play(); }
  return muted;
}

// onglet caché : tout s'arrête (contexte suspendu, plus de minuterie), puis reprend au retour
document.addEventListener("visibilitychange", () => {
  if (!ctx || !music) return;
  if (document.hidden) { music.pause(); void ctx.suspend(); }
  else { void ctx.resume(); if (!muted) music.play(); }
});

function noise(dur: number, freq: number, q: number, gain: number, sweep = 1, type: BiquadFilterType = "lowpass"): void {
  if (!ctx || !master) return;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, ctx.currentTime);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * sweep), ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(master);
  src.start();
}

function tone(freq: number, dur: number, gain: number, end = freq, type: OscillatorType = "sine", delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  place: () => { tone(180, 0.1, 0.25, 90, "triangle"); noise(0.2, 1400, 1, 0.12, 0.4); },
  tick: () => tone(1400, 0.03, 0.04, 1200, "square"),
  deny: () => tone(150, 0.14, 0.2, 110, "square"),
  launch: () => { noise(0.28, 900, 0.8, 0.5, 0.25); tone(90, 0.35, 0.5, 40); noise(1.5, 500, 3, 0.1, 5, "bandpass"); },
  splash: () => { noise(0.9, 2400, 0.7, 0.42, 0.18); tone(320, 0.2, 0.14, 90); },
  boom: () => { music?.duck(); noise(1.1, 1500, 0.6, 0.9, 0.08); tone(85, 0.8, 0.8, 26); },
  sunk: () => { music?.duck(); noise(2.2, 800, 0.6, 0.8, 0.06); tone(60, 1.8, 0.7, 22); tone(330, 1.1, 0.1, 110, "sawtooth", 0.3); },
  peg: () => { tone(900, 0.04, 0.18, 500, "square"); tone(240, 0.08, 0.2, 160, "triangle", 0.03); },
  sonar: () => { tone(1040, 0.9, 0.16, 1000); tone(1040, 0.9, 0.05, 1000, "sine", 0.32); },
  scramble: () => { noise(0.5, 300, 4, 0.22, 10, "bandpass"); },
  ready: () => { tone(440, 0.12, 0.14, 440, "triangle"); tone(660, 0.18, 0.14, 660, "triangle", 0.11); },
  victory: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 0.2, f, "triangle", i * 0.13)),
  defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.45, 0.17, f, "triangle", i * 0.2)),
  firework: () => { noise(0.5, 3000, 0.7, 0.14, 0.2); },
};
