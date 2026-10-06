/**
 * Procedural audio with the Web Audio API: no sound files, so nothing to
 * license and nothing extra to download on a small data bundle.
 *
 *  - engine: two detuned oscillators + noise, pitched by "RPM" with gear changes
 *  - horn (and an emergency siren), tyre skid, rain, market ambience, NPC honks
 *  - UI blips, coin, level-up, crash, near-miss whoosh, police whistle
 *  - an original Singeli / Bongo-flava-inspired loop sequenced in real time
 */

type Bus = "music" | "sfx";

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private engine: { a: OscillatorNode; b: OscillatorNode; lfo: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private loops: Record<"skid" | "rain" | "crowd", { gain: GainNode } | null> = { skid: null, rain: null, crowd: null };
  private musicTimer = 0;
  private nextBeat = 0;
  private beat = 0;
  private bar = 0;
  private musicOn = false;
  /** Which radio station's sound the music sequencer plays. */
  style: MusicStyle = "singeli";
  private volumes = { master: 0.8, music: 0.6, sfx: 0.9 };

  /** Create (or resume) the context. Must be called from a user gesture. */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.buses = { music: this.ctx.createGain(), sfx: this.ctx.createGain() };
      this.buses.music.connect(this.master);
      this.buses.sfx.connect(this.master);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready() {
    return Boolean(this.ctx);
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.buses.music.gain.setTargetAtTime(this.volumes.music * 0.35, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  suspend() {
    void this.ctx?.suspend();
  }

  resume() {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  private noiseSource(loop = true) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  // ── Continuous layers ────────────────────────────────────────────────────

  private ensureEngine() {
    if (this.engine || !this.ctx) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 2;
    // The 4-stroke "putt-putt": amplitude modulation at the firing rate.
    const thump = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 12;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth).connect(thump.gain);
    thump.gain.value = 0.6;
    const a = ctx.createOscillator();
    a.type = "sawtooth";
    const b = ctx.createOscillator();
    b.type = "square";
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    const n = this.noiseSource();
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = "bandpass";
    nFilter.frequency.value = 420;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.18;
    a.connect(filter);
    b.connect(bGain).connect(filter);
    n.connect(nFilter).connect(nGain).connect(filter);
    filter.connect(thump).connect(gain).connect(this.buses.sfx);
    a.start();
    b.start();
    n.start();
    lfo.start();
    this.engine = { a, b, lfo, gain, filter };
  }

  private ensureLoop(name: "skid" | "rain" | "crowd") {
    if (this.loops[name] || !this.ctx) return this.loops[name];
    const ctx = this.ctx;
    const src = this.noiseSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    if (name === "skid") {
      filter.type = "bandpass";
      filter.frequency.value = 1700;
      filter.Q.value = 6;
    } else if (name === "rain") {
      filter.type = "highpass";
      filter.frequency.value = 900;
    } else {
      filter.type = "bandpass";
      filter.frequency.value = 650;
      filter.Q.value = 0.8;
    }
    src.connect(filter).connect(gain).connect(this.buses.sfx);
    src.start();
    this.loops[name] = { gain };
    return this.loops[name];
  }

  /**
   * Per-frame update of the continuous layers.
   * @param speed m/s, throttle 0..1, skid 0..1, rain 0..1, crowd 0..1
   */
  update(speed: number, throttle: number, skid: number, rain: number, crowd: number, running: boolean) {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.ensureEngine();
    const t = this.ctx.currentTime;
    const e = this.engine!;
    // Fake gearbox: RPM climbs within each gear, then drops on the shift.
    const v = Math.abs(speed);
    const gears = [0, 4, 8.5, 13, 18, 30];
    let g = 1;
    while (g < gears.length - 1 && v > gears[g]!) g++;
    const lo = gears[g - 1]!, hi = gears[g]!;
    const rpm = running ? 0.18 + 0.82 * Math.min(1, (v - lo) / (hi - lo)) * (g === 1 ? 0.8 : 1) : 0;
    const base = 46 + rpm * 70 + throttle * 8;
    e.a.frequency.setTargetAtTime(base, t, 0.04);
    e.b.frequency.setTargetAtTime(base * 0.5, t, 0.04);
    e.filter.frequency.setTargetAtTime(500 + rpm * 1400 + throttle * 600, t, 0.05);
    e.lfo.frequency.setTargetAtTime(base / 4, t, 0.05);
    e.gain.gain.setTargetAtTime(running ? 0.07 + throttle * 0.06 + rpm * 0.03 : 0, t, 0.08);

    this.ensureLoop("skid")!.gain.gain.setTargetAtTime(skid * 0.12, t, 0.05);
    this.ensureLoop("rain")!.gain.gain.setTargetAtTime(rain * 0.1, t, 0.3);
    this.ensureLoop("crowd")!.gain.gain.setTargetAtTime(crowd * 0.05, t, 0.5);
    if (crowd > 0.2 && Math.random() < crowd * 0.04) this.chatter();
  }

  stopContinuous() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engine?.gain.gain.setTargetAtTime(0, t, 0.1);
    for (const l of Object.values(this.loops)) l?.gain.gain.setTargetAtTime(0, t, 0.1);
  }

  // ── One-shots ────────────────────────────────────────────────────────────

  private tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; attack?: number; slideTo?: number; delay?: number; bus?: Bus; pan?: number; lowpass?: number; sustain?: boolean } = {},
  ) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.008));
    // Horns hold their level and cut off; everything else decays.
    if (opts.sustain) g.gain.setValueAtTime(peak, t + Math.max(0.02, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o.connect(g);
    if (opts.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = opts.lowpass;
      node = node.connect(f);
    }
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = node.connect(p);
    }
    node.connect(this.buses[opts.bus ?? "sfx"]);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, gain: number, opts: { type?: BiquadFilterType; delay?: number; bus?: Bus; q?: number } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = this.noiseSource(false);
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.value = freq;
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.buses[opts.bus ?? "sfx"]);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  horn(siren = false) {
    if (siren) {
      this.tone(640, 0.6, { type: "square", gain: 0.06, slideTo: 980 });
      this.tone(980, 0.6, { type: "square", gain: 0.06, slideTo: 640, delay: 0.6 });
      return;
    }
    this.tone(415, 0.32, { type: "square", gain: 0.07 });
    this.tone(523, 0.32, { type: "square", gain: 0.05 });
  }

  /**
   * An NPC horn, panned and quieter with distance. Each vehicle has its own
   * voice: two-tone car horns, the daladala's musical air horn, a truck's
   * low blare, the bajaji's nasal squeak and the boda's quick "pipi".
   */
  honk(distance: number, kind: "car" | "suv" | "daladala" | "bajaji" | "truck" | "boda" = "car", mood: "nudge" | "angry" | "friendly" = "nudge", pan = 0) {
    const level = Math.max(0, 1 - distance / 140);
    if (level < 0.06) return;
    const g = (v: number) => v * level;
    const long = mood === "angry";
    const hold = (base: number) => (long ? base * 2.6 : base) * (0.9 + Math.random() * 0.2);
    switch (kind) {
      case "car":
      case "suv": {
        const d = hold(0.22);
        const pitch = 0.9 + Math.random() * 0.2;
        const beeps = long ? 1 : 2;
        for (let i = 0; i < beeps; i++) {
          this.tone(392 * pitch, d, { type: "square", gain: g(0.045), delay: i * 0.28, pan, lowpass: 1800, sustain: true });
          this.tone(494 * pitch, d, { type: "square", gain: g(0.035), delay: i * 0.28, pan, lowpass: 1800, sustain: true });
        }
        break;
      }
      case "daladala": {
        // A musical air horn: a quick original rising run, or one long blast when angry.
        const notes = long ? [62] : [62, 66, 69, 74, 69];
        notes.forEach((n, i) => this.tone(midi(n), long ? 1.1 : 0.15, { type: "sawtooth", gain: g(0.04), delay: i * 0.13, pan, lowpass: 2400, sustain: true }));
        break;
      }
      case "truck":
        this.tone(165, hold(0.55), { type: "sawtooth", gain: g(0.06), pan, lowpass: 900, sustain: true });
        this.tone(208, hold(0.55), { type: "sawtooth", gain: g(0.045), pan, lowpass: 900, sustain: true });
        break;
      case "bajaji":
        for (let i = 0; i < (long ? 3 : 2); i++) this.tone(720, 0.11, { type: "square", gain: g(0.035), delay: i * 0.16, pan, lowpass: 3200, slideTo: 690 });
        break;
      case "boda":
        for (let i = 0; i < 2; i++) {
          this.tone(1040, mood === "friendly" ? 0.09 : hold(0.12), { type: "square", gain: g(0.035), delay: i * 0.14, pan, lowpass: 3600, sustain: true });
          this.tone(1310, mood === "friendly" ? 0.09 : hold(0.12), { type: "square", gain: g(0.025), delay: i * 0.14, pan, lowpass: 3600, sustain: true });
        }
        break;
    }
  }

  private sirenNodes: { a: OscillatorNode; gain: GainNode; pan: StereoPannerNode } | null = null;

  /** The police pickup's two-tone siren, by distance and side. Infinity silences it. */
  siren(distance: number, pan: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const level = Number.isFinite(distance) ? Math.max(0, 1 - distance / 220) * 0.07 : 0;
    if (!this.sirenNodes) {
      if (level <= 0) return;
      const a = ctx.createOscillator();
      a.type = "square";
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const p = ctx.createStereoPanner();
      a.connect(lp).connect(gain).connect(p).connect(this.buses.sfx);
      a.start();
      this.sirenNodes = { a, gain, pan: p };
    }
    const t = ctx.currentTime;
    const { a, gain, pan: p } = this.sirenNodes;
    // Hi-lo every 0.55 s.
    a.frequency.setTargetAtTime(Math.floor(t / 0.55) % 2 ? 960 : 720, t, 0.02);
    gain.gain.setTargetAtTime(level, t, 0.08);
    p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.1);
    if (level <= 0) {
      const nodes = this.sirenNodes;
      this.sirenNodes = null;
      window.setTimeout(() => nodes.a.stop(), 400);
    }
  }

  // ── The boda phone ───────────────────────────────────────────────────────

  private ringTimer = 0;

  /** A cheerful original ringtone, repeating until answered. */
  ring(on: boolean) {
    window.clearInterval(this.ringTimer);
    if (!on || !this.ctx) return;
    const phrase = () => [76, 79, 83, 79, 81, 76].forEach((n, i) => this.tone(midi(n), 0.13, { type: "triangle", gain: 0.07, delay: i * 0.12 }));
    phrase();
    this.ringTimer = window.setInterval(phrase, 1700);
  }

  /** A short two-note chime for a text or mobile-money alert. */
  chime() {
    this.tone(midi(84), 0.12, { type: "sine", gain: 0.07 });
    this.tone(midi(91), 0.22, { type: "sine", gain: 0.06, delay: 0.1 });
  }

  // ── Recorded voices ──────────────────────────────────────────────────────

  private voiceCache = new Map<string, Promise<AudioBuffer | null>>();
  private voiceUntil = 0;

  /** Fetch and decode a recording once; null if it's missing or unreadable. */
  private loadVoice(url: string): Promise<AudioBuffer | null> {
    let p = this.voiceCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data) => this.ctx!.decodeAudioData(data))
        .catch(() => null);
      this.voiceCache.set(url, p);
    }
    return p;
  }

  /** Play a recorded line over the mix, ducking the music while it speaks. Skips if someone is already talking. */
  async voice(url: string, gain = 1): Promise<boolean> {
    if (!this.ctx) return false;
    const ctx = this.ctx;
    if (ctx.currentTime < this.voiceUntil) return false;
    const buffer = await this.loadVoice(url);
    if (!buffer || ctx.currentTime < this.voiceUntil) return false;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.buses.sfx);
    const t = ctx.currentTime;
    this.voiceUntil = t + buffer.duration;
    const music = this.buses.music.gain;
    music.setTargetAtTime(this.volumes.music * 0.12, t, 0.08);
    music.setTargetAtTime(this.volumes.music * 0.35, t + buffer.duration, 0.3);
    src.start(t);
    return true;
  }

  crash(strength: number) {
    this.burst(0.35, 180, 0.35 * Math.min(1, strength), { type: "lowpass" });
    this.tone(120, 0.3, { type: "triangle", gain: 0.25 * Math.min(1, strength), slideTo: 45 });
  }

  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = this.noiseSource(false);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(f).connect(g).connect(this.buses.sfx);
    src.start(t);
    src.stop(t + 0.45);
  }

  coin() {
    this.tone(1318, 0.12, { type: "triangle", gain: 0.12 });
    this.tone(1976, 0.3, { type: "triangle", gain: 0.12, delay: 0.08 });
  }

  click() {
    this.tone(880, 0.05, { type: "triangle", gain: 0.06 });
  }

  levelUp() {
    [67, 71, 74, 79].forEach((n, i) => this.tone(midi(n), 0.3, { type: "triangle", gain: 0.12, delay: i * 0.09 }));
  }

  whistle() {
    this.tone(2800, 0.5, { type: "sine", gain: 0.08 });
    this.tone(2950, 0.25, { type: "sine", gain: 0.05, delay: 0.55 });
  }

  fail() {
    this.tone(330, 0.25, { type: "triangle", gain: 0.12, slideTo: 220 });
    this.tone(220, 0.4, { type: "triangle", gain: 0.12, slideTo: 140, delay: 0.22 });
  }

  private chatter() {
    // Snatches of market voices: short formant-ish chirps.
    const f = 180 + Math.random() * 220;
    this.tone(f, 0.08 + Math.random() * 0.12, { type: "sawtooth", gain: 0.012, slideTo: f * (0.8 + Math.random() * 0.5) });
  }

  // ── Music ────────────────────────────────────────────────────────────────

  /**
   * An original groove: 4-on-the-floor kick, offbeat claps, 16th shakers,
   * a pentatonic bass and a marimba-like lead in the spirit of Singeli and
   * Bongo flava. Scheduled with a small look-ahead.
   */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beat = 0;
    this.bar = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 30);
  }

  stopMusic() {
    this.musicOn = false;
    window.clearInterval(this.musicTimer);
  }

  /** Switch station sound; the groove restarts on the next bar. */
  setStyle(style: MusicStyle) {
    if (style === this.style) return;
    this.style = style;
    if (this.ctx) this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.15);
    this.beat = 0;
  }

  private schedule() {
    if (!this.ctx || !this.musicOn) return;
    if (this.style === "bongo") return this.scheduleBongo();
    if (this.style === "taarab") return this.scheduleTaarab();
    const bpm = 140;
    const sixteenth = 60 / bpm / 4;
    // A minor pentatonic around A2 / A4.
    const bass = [45, 45, 48, 50, 52, 50, 48, 43];
    const scale = [69, 72, 74, 76, 79, 81, 84];
    while (this.nextBeat < this.ctx.currentTime + 0.12) {
      const step = this.beat % 16;
      const at = this.nextBeat - this.ctx.currentTime;
      if (step % 4 === 0) this.tone(150, 0.18, { type: "sine", gain: 0.55, slideTo: 45, delay: at, bus: "music" });
      if (step === 4 || step === 12) this.burst(0.12, 1500, 0.28, { delay: at, bus: "music", q: 0.7 });
      this.burst(0.03, 7000, step % 2 ? 0.05 : 0.09, { type: "highpass", delay: at, bus: "music" });
      if (step % 2 === 0) {
        const note = bass[(this.bar * 2 + Math.floor(step / 8)) % bass.length]!;
        this.tone(midi(note + (step % 8 === 6 ? 12 : 0)), sixteenth * 1.8, { type: "triangle", gain: 0.28, delay: at, bus: "music" });
      }
      // Marimba lead: a seeded call-and-response that changes every two bars.
      const seed = Math.sin((this.bar >> 1) * 91.7 + step * 13.1) * 43758.5453;
      const r = seed - Math.floor(seed);
      if ((step % 3 === 0 || step === 14) && r > 0.35 && this.bar % 4 !== 3) {
        const n = scale[Math.floor(r * scale.length)]!;
        this.tone(midi(n), 0.22, { type: "sine", gain: 0.13, delay: at, bus: "music" });
        this.tone(midi(n + 12), 0.08, { type: "triangle", gain: 0.04, delay: at, bus: "music" });
      }
      this.nextBeat += sixteenth;
      this.beat++;
      if (this.beat % 16 === 0) this.bar++;
    }
  }

  /**
   * Mid-tempo Bongo flava: syncopated kick, log-drum bass slides, offbeat
   * chord stabs and a bright pentatonic pluck.
   */
  private scheduleBongo() {
    const ctx = this.ctx!;
    const bpm = 102;
    const sixteenth = 60 / bpm / 4;
    const roots = [50, 50, 45, 47];
    const lead = [74, 76, 78, 81, 83, 86];
    while (this.nextBeat < ctx.currentTime + 0.12) {
      const step = this.beat % 16;
      const at = this.nextBeat - ctx.currentTime;
      const root = roots[this.bar % roots.length]!;
      if (step === 0 || step === 6 || step === 8 || step === 11) this.tone(130, 0.2, { type: "sine", gain: 0.5, slideTo: 42, delay: at, bus: "music" });
      if (step === 4 || step === 12) this.burst(0.14, 1800, 0.22, { delay: at, bus: "music", q: 0.6 });
      if (step % 2 === 1) this.burst(0.025, 8000, 0.05, { type: "highpass", delay: at, bus: "music" });
      if (step === 0 || step === 3 || step === 7 || step === 10) this.tone(midi(root - 12), sixteenth * 2.6, { type: "sine", gain: 0.34, slideTo: midi(root - 14), delay: at, bus: "music" });
      if (step === 2 || step === 6 || step === 10 || step === 14) [0, 4, 7].forEach((iv) => this.tone(midi(root + 12 + iv), 0.12, { type: "triangle", gain: 0.035, delay: at, bus: "music" }));
      const seed = Math.sin((this.bar >> 1) * 57.3 + step * 7.7) * 43758.5453;
      const r = seed - Math.floor(seed);
      if (step % 2 === 0 && r > 0.55 && this.bar % 4 !== 3) this.tone(midi(lead[Math.floor(r * lead.length)]!), 0.16, { type: "triangle", gain: 0.07, delay: at, bus: "music" });
      this.nextBeat += sixteenth;
      this.beat++;
      if (this.beat % 16 === 0) this.bar++;
    }
  }

  /**
   * Coastal Taarab feel: darbuka doum-tek, an oud-like pluck in a Hijaz
   * mode and a soft string drone.
   */
  private scheduleTaarab() {
    const ctx = this.ctx!;
    const bpm = 88;
    const eighth = 60 / bpm / 2;
    // D Hijaz: D Eb F# G A Bb C.
    const scale = [62, 63, 66, 67, 69, 70, 72, 74];
    while (this.nextBeat < ctx.currentTime + 0.12) {
      const step = this.beat % 8;
      const at = this.nextBeat - ctx.currentTime;
      // Maqsum rhythm: doum on 1 and 4, teks between.
      if (step === 0 || step === 3) this.tone(95, 0.22, { type: "sine", gain: 0.42, slideTo: 60, delay: at, bus: "music" });
      if (step === 2 || step === 5 || step === 6) this.burst(0.06, 3200, 0.12, { delay: at, bus: "music", q: 2 });
      if (step === 0 && this.bar % 2 === 0) this.tone(midi(50), eighth * 15, { type: "sawtooth", gain: 0.025, delay: at, bus: "music", lowpass: 700, sustain: true });
      const seed = Math.sin(this.bar * 31.7 + step * 11.3) * 43758.5453;
      const r = seed - Math.floor(seed);
      if (r > 0.35) {
        const n = scale[Math.floor(r * scale.length)]!;
        this.tone(midi(n), 0.3, { type: "sawtooth", gain: 0.05, delay: at, bus: "music", lowpass: 1600, attack: 0.004 });
      }
      this.nextBeat += eighth;
      this.beat++;
      if (this.beat % 8 === 0) this.bar++;
    }
  }

  dispose() {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
    this.engine = null;
    this.loops = { skid: null, rain: null, crowd: null };
  }
}

export type MusicStyle = "singeli" | "bongo" | "taarab";

/** One engine per page. */
export const audio = new AudioEngine();
