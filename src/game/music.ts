/**
 * Musique de fond procédurale : marimba, basse ronde, nappe et balais, en croches balancées à 86 BPM.
 * Tout est synthétisé à la volée (aucun fichier). Les mélodies viennent d'un générateur à graine :
 * chaque section de 8 mesures tire une grille d'accords et une tonalité, la boucle ne se répète jamais à l'identique.
 */

const BPM = 86;
const BEAT = 60 / BPM;
const SWING = 0.62; // la croche du temps faible tombe aux 62 % du temps
const LOOKAHEAD = 0.3; // secondes programmées d'avance
const TICK_MS = 60;
const LEVEL = 0.125; // ≈ −18 dB sous les effets
const SCALE = [0, 2, 4, 5, 7, 9, 11];

/** Grilles en degrés de la gamme majeure (0 = I), une mesure par accord. */
const PROGRESSIONS: number[][] = [
  [0, 5, 3, 4],
  [0, 3, 0, 4],
  [5, 3, 0, 4],
  [0, 2, 3, 4],
  [1, 4, 0, 0],
  [3, 4, 2, 5],
  [0, 4, 5, 3],
];
/** Rythmes de la mélodie sur 8 croches (1 = note). */
const RHYTHMS: number[][] = [
  [1, 0, 1, 1, 0, 1, 1, 0],
  [1, 0, 0, 1, 1, 0, 1, 0],
  [1, 1, 1, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 1, 1, 1, 0],
  [1, 0, 1, 0, 1, 0, 1, 1],
  [1, 0, 0, 0, 1, 1, 0, 1],
];
const CADENCE = [1, 0, 1, 0, 1, 0, 0, 0];
const KEYS = [65, 65, 70, 67]; // fa, fa, si bémol, sol (note MIDI de la tonique de la mélodie)

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
/** Degré de gamme (peut dépasser 7 ou être négatif) vers demi-tons. */
const semi = (d: number): number => Math.floor(d / 7) * 12 + SCALE[((d % 7) + 7) % 7]!;

export class Music {
  private ctx: AudioContext;
  private bus: GainNode;
  private duckGain: GainNode;
  private echo: GainNode;
  private pad: OscillatorNode[] = [];
  private padGain: GainNode;
  private noiseBuf: AudioBuffer;
  private rng = mulberry32(0x7ab1ef1e);
  private timer: number | null = null;
  private nextTime = 0;
  private slot = 0; // croche dans la mesure (0..7)
  private bar = 0; // mesure dans la section (0..7)
  private section = 0;
  private prog: number[] = PROGRESSIONS[0]!;
  private key = KEYS[0]!;
  private lead = 4; // degré courant de la mélodie
  private barNotes: (number | null)[] = [];
  private phraseRhythm: number[][] = [];

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.duckGain = ctx.createGain();
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    // filet de sécurité : la musique ne sature jamais, quoi qu'il arrive
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    this.bus.connect(comp).connect(this.duckGain).connect(out);

    // écho chaud et feutré, partagé par la marimba
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.35;
    const dl = ctx.createDelay(1);
    dl.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    this.echo.connect(dl).connect(lp).connect(fb).connect(dl);
    lp.connect(this.bus);

    // nappe : trois voix permanentes, on ne change que leur hauteur
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.11;
    const padLp = ctx.createBiquadFilter();
    padLp.type = "lowpass";
    padLp.frequency.value = 900;
    padLp.Q.value = 0.5;
    this.padGain.connect(padLp).connect(this.bus);
    const wobble = ctx.createOscillator(); // léger pleurage de cassette
    wobble.frequency.value = 0.35;
    const wobbleAmt = ctx.createGain();
    wobbleAmt.gain.value = 6;
    wobble.connect(wobbleAmt);
    wobble.start();
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.detune.value = (i - 1) * 5;
      o.frequency.value = hz(KEYS[0]! - 12 + semi(PROGRESSIONS[0]![0]! + i * 2));
      wobbleAmt.connect(o.detune);
      o.connect(this.padGain);
      o.start();
      this.pad.push(o);
    }

    const len = Math.ceil(ctx.sampleRate * 0.25);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startSection();
  }

  /** Lance (ou relance) la programmation des notes, avec un fondu d'entrée. */
  play(): void {
    if (this.timer !== null) return;
    const now = this.ctx.currentTime;
    if (this.nextTime < now + 0.05) this.nextTime = now + 0.1;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(LEVEL, now + 2.5);
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  pause(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + 0.1);
  }

  /** Baisse la musique de 6 dB pendant environ une seconde. */
  duck(): void {
    const g = this.duckGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.5, now + 0.06);
    g.setValueAtTime(0.5, now + 0.9);
    g.linearRampToValueAtTime(1, now + 1.6);
  }

  private tick(): void {
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.05; // minuterie bridée : on se recale
    while (this.nextTime < now + LOOKAHEAD) {
      const swing = this.slot % 2 ? (SWING - 0.5) * BEAT : 0;
      this.step(this.nextTime + swing);
      this.nextTime += BEAT / 2;
      if (++this.slot === 8) {
        this.slot = 0;
        if (++this.bar === 8) { this.bar = 0; this.section++; this.startSection(); }
      }
    }
  }

  private startSection(): void {
    let p = this.prog;
    while (p === this.prog && this.section > 0) p = PROGRESSIONS[Math.floor(this.rng() * PROGRESSIONS.length)]!;
    this.prog = p;
    this.key = KEYS[Math.floor(this.section / 2) % KEYS.length]!;
    this.phraseRhythm = [];
  }

  /** Section 3 sur 4 : pause de la mélodie, la nappe et la basse respirent. */
  private get breakSection(): boolean { return this.section % 4 === 3; }

  private chordDeg(): number { return this.prog[this.bar % 4]!; }

  private newBar(): void {
    const chord = this.chordDeg();
    const tones = [chord, chord + 2, chord + 4];
    // phrase de 4 mesures : A, B, A' (rythme de A), cadence
    const inPhrase = this.bar % 4;
    if (inPhrase === 0) this.phraseRhythm = [];
    let r: number[];
    if (inPhrase === 3) r = this.rng() < 0.5 ? CADENCE : [1, 0, 0, 1, 1, 0, 0, 0];
    else if (inPhrase === 2) r = this.phraseRhythm[0]!;
    else r = RHYTHMS[Math.floor(this.rng() * RHYTHMS.length)]!;
    this.phraseRhythm.push(r);
    const sparse = this.section % 4 === 2 ? 0.3 : 0.08;
    this.barNotes = r.map((on, i) => {
      if (!on || (i > 0 && this.rng() < sparse)) return null;
      if (i === 0 || i === 4) {
        // temps fort : note de l'accord la plus proche
        let best = this.lead, dist = 99;
        for (const t of tones) for (const o of [-7, 0, 7]) {
          const d = Math.abs(t + o - this.lead) + this.rng() * 1.5;
          if (d < dist) { dist = d; best = t + o; }
        }
        this.lead = best;
      } else {
        const moves = [-2, -1, -1, 1, 1, 2, 0];
        this.lead += moves[Math.floor(this.rng() * moves.length)]!;
        if (((this.lead % 7) + 7) % 7 === 3 || ((this.lead % 7) + 7) % 7 === 6) this.lead += this.rng() < 0.5 ? 1 : -1;
      }
      this.lead = Math.max(0, Math.min(9, this.lead));
      if (inPhrase === 3 && i === 4) this.lead = tones[0]! >= 3 ? tones[0]! : tones[0]! + 7; // finit sur la fondamentale
      return this.lead;
    });
  }

  private step(t: number): void {
    const chord = this.chordDeg();
    const root = this.key - 24 + semi(chord); // basse deux octaves sous la mélodie
    if (this.slot === 0) {
      this.newBar();
      // nappe : tierce et quinte autour du do central, glissement doux
      const pads = [chord, chord + 2, chord + 4].map((d) => this.key - 12 + semi(d));
      pads.forEach((m, i) => this.pad[i]!.frequency.setTargetAtTime(hz(m), t, 0.12));
      this.bass(root, t, BEAT * 1.6);
      if (!this.breakSection) this.kick(t);
    }
    if (this.slot === 4) this.bass(root + (this.rng() < 0.6 ? 7 : 12), t, BEAT * 1.4);
    if (this.slot === 7 && this.rng() < 0.4) {
      const next = this.prog[(this.bar + 1) % 4]!;
      this.bass(this.key - 24 + semi(next) + (this.rng() < 0.5 ? 2 : -1), t, BEAT * 0.4);
    }
    if (this.slot === 5 && !this.breakSection && this.rng() < 0.5) this.kick(t, 0.5);
    if (this.slot === 2 || this.slot === 6) this.brush(t, 0.07);
    else this.brush(t, this.slot % 2 ? 0.035 : 0.02);
    const n = this.breakSection ? null : this.barNotes[this.slot];
    if (n != null) this.marimba(this.key + semi(n), t, 0.3 + this.rng() * 0.12);
    // pendant la pause, une cloche de temps en temps
    if (this.breakSection && this.slot === 0 && this.bar % 2 === 0) this.marimba(this.key + 12 + semi(chord + 4), t, 0.12);
  }

  private marimba(m: number, t: number, gain: number): void {
    const ctx = this.ctx;
    const f = hz(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const o2 = ctx.createOscillator(); // partiel aigu de la lame, très bref
    o2.frequency.value = f * 3.93;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(gain * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.bus);
    g.connect(this.echo);
    o.start(t); o2.start(t);
    o.stop(t + 0.95); o2.stop(t + 0.1);
  }

  private bass(m: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = hz(m);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.2, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number, k = 1): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * k, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.24);
  }

  private brush(t: number, gain: number): void {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + this.rng() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 5000;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t);
    s.stop(t + 0.14);
  }
}
