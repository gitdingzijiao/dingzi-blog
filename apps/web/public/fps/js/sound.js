/**
 * 音效引擎 —— 全部用 Web Audio 实时合成，不依赖任何音频文件。
 *
 * 枪声 = 白噪声爆发（快速衰减）+ 低频"闷响"正弦扫频 + 带通塑形
 * 不同武器靠包络时长、滤波频率、失真量区分。
 */

let ctx = null;
let master = null;
let sfxBus = null;
let noiseBuf = null;
let listenerReady = false;

const TAU = Math.PI * 2;

function makeNoise(ctx) {
  const len = ctx.sampleRate * 1.2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** 造一段噪声源 */
function noise() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

/** 简易失真（用于让枪声更"炸"） */
function shaper(amount) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  ws.curve = curve;
  return ws;
}

export const Sound = {
  get ready() {
    return !!ctx && ctx.state === "running";
  },

  /** 必须在用户手势里调用 */
  init() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.0;
    sfxBus.connect(master);
    noiseBuf = makeNoise(ctx);
    if (ctx.listener.forwardX) listenerReady = true;
    return true;
  },

  setVolume(v) {
    if (master) master.gain.value = Math.max(0, Math.min(1, v));
  },

  /** 让 3D 声像跟随相机（右向量由调用方给出） */
  setListener(pos, forward, up) {
    if (!ctx || !listenerReady) return;
    const L = ctx.listener;
    const t = ctx.currentTime;
    L.positionX.setTargetAtTime(pos.x, t, 0.02);
    L.positionY.setTargetAtTime(pos.y, t, 0.02);
    L.positionZ.setTargetAtTime(pos.z, t, 0.02);
    L.forwardX.setTargetAtTime(forward.x, t, 0.02);
    L.forwardY.setTargetAtTime(forward.y, t, 0.02);
    L.forwardZ.setTargetAtTime(forward.z, t, 0.02);
    L.upX.setTargetAtTime(up.x, t, 0.02);
    L.upY.setTargetAtTime(up.y, t, 0.02);
    L.upZ.setTargetAtTime(up.z, t, 0.02);
  },

  /** 建立一个输出节点；给了 position 就走 3D 声像 */
  _out(position, refDistance = 6) {
    const g = ctx.createGain();
    if (position && listenerReady) {
      const p = ctx.createPanner();
      p.panningModel = "HRTF";
      p.distanceModel = "inverse";
      p.refDistance = refDistance;
      p.maxDistance = 90;
      p.rolloffFactor = 1.4;
      p.positionX.value = position.x;
      p.positionY.value = position.y;
      p.positionZ.value = position.z;
      g.connect(p);
      p.connect(sfxBus);
    } else {
      g.connect(sfxBus);
    }
    return g;
  },

  /**
   * 枪声
   * @param {"pistol"|"rifle"|"shotgun"|"smg"} type
   */
  shoot(type = "pistol", position = null) {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const P = {
      pistol:  { dur: 0.16, body: 170, cut: 2600, q: 0.9, boom: 90,  gain: 0.55, dist: 0.5 },
      smg:     { dur: 0.11, body: 210, cut: 3000, q: 1.1, boom: 110, gain: 0.45, dist: 0.6 },
      rifle:   { dur: 0.22, body: 140, cut: 2200, q: 0.7, boom: 70,  gain: 0.68, dist: 0.7 },
      shotgun: { dur: 0.34, body: 100, cut: 1500, q: 0.5, boom: 55,  gain: 0.85, dist: 0.4 },
    }[type] || {};

    const out = this._out(position);

    // 1) 噪声爆裂
    const n = noise();
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = P.cut;
    nf.Q.value = P.q;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(P.gain, t);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + P.dur);
    const dist = shaper(P.dist);
    n.connect(nf).connect(dist).connect(ng).connect(out);
    n.start(t);
    n.stop(t + P.dur + 0.05);

    // 2) 低频"闷响"（枪声的胸腔感）
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(P.boom * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(P.boom * 0.6, t + P.dur * 0.9);
    const og = ctx.createGain();
    og.gain.setValueAtTime(P.gain * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0008, t + P.dur * 1.1);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + P.dur + 0.05);

    // 3) 高频"啪"（瞬态）
    const c = noise();
    const cf = ctx.createBiquadFilter();
    cf.type = "highpass";
    cf.frequency.value = 4200;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(P.gain * 0.7, t);
    cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    c.connect(cf).connect(cg).connect(out);
    c.start(t);
    c.stop(t + 0.06);
  },

  /** 空仓咔哒 */
  empty(position = null) {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const out = this._out(position, 4);
    const n = noise();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    n.connect(f).connect(g).connect(out);
    n.start(t); n.stop(t + 0.05);
  },

  /** 换弹：退匣 + 上膛 两声 */
  reload(position = null) {
    if (!this.ready) return;
    const t0 = ctx.currentTime;
    const out = this._out(position, 4);
    const click = (t, freq, gain, dur) => {
      const n = noise();
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      f.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      n.connect(f).connect(g).connect(out);
      n.start(t); n.stop(t + dur + 0.02);
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = freq * 0.35;
      const og = ctx.createGain();
      og.gain.setValueAtTime(gain * 0.35, t);
      og.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(og).connect(out);
      o.start(t); o.stop(t + dur + 0.02);
    };
    click(t0, 1500, 0.3, 0.05);          // 退匣
    click(t0 + 0.16, 900, 0.26, 0.06);   // 插匣
    click(t0 + 0.30, 2400, 0.34, 0.045); // 上膛
  },

  /** 命中反馈（准星"叮"） */
  hitmark() {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(2100, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + 0.08);
  },

  /** 子弹打墙（碎屑声） */
  impact(position = null) {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const out = this._out(position, 5);
    const n = noise();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
    n.connect(f).connect(g).connect(out);
    n.start(t); n.stop(t + 0.08);
  },

  /** 击中敌人的闷响 */
  flesh(position = null) {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const out = this._out(position, 5);
    const n = noise();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    n.connect(f).connect(g).connect(out);
    n.start(t); n.stop(t + 0.13);
  },

  /** 敌人死亡（下坠的电子音） */
  kill(position = null) {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const out = this._out(position, 6);
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.42);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.45);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    o.connect(f).connect(g).connect(out);
    o.start(t); o.stop(t + 0.46);
  },

  /** 玩家受伤 */
  hurt() {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const n = noise();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0006, t + 0.22);
    n.connect(f).connect(g).connect(sfxBus);
    n.start(t); n.stop(t + 0.24);
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.0005, t + 0.22);
    o.connect(og).connect(sfxBus);
    o.start(t); o.stop(t + 0.24);
  },

  /** 脚步 */
  step() {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const n = noise();
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 320 + Math.random() * 160;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.09);
    n.connect(f).connect(g).connect(sfxBus);
    n.start(t); n.stop(t + 0.1);
  },

  /** 波次开始 / 提示音 */
  blip(up = true) {
    if (!this.ready) return;
    const t = ctx.currentTime;
    [0, 0.12].forEach((d, i) => {
      const o = ctx.createOscillator();
      o.type = "square";
      const base = up ? 520 : 380;
      o.frequency.value = base * (i ? 1.5 : 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.13, t + d);
      g.gain.exponentialRampToValueAtTime(0.0005, t + d + 0.1);
      o.connect(g).connect(sfxBus);
      o.start(t + d); o.stop(t + d + 0.12);
    });
  },

  /** 死亡音 */
  die() {
    if (!this.ready) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.5);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 1.3);
    o.connect(f).connect(g).connect(sfxBus);
    o.start(t); o.stop(t + 1.55);
  },
};
