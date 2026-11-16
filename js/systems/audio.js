// ============ AUDIO: WebAudio 实时合成音效 ============
// 零素材: 所有音效由振荡器 / 噪声缓冲实时合成。
// 浏览器要求用户手势后才能出声 → 首次点击/按键时 unlock()。

'use strict';

const AudioSys = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let unlocked = false;
  let muted = false;
  // 音量三档循环: 🔊 0.55 → 🔉 0.25 → 🔇 0 → 🔊, 持久化到 localStorage
  let volume = 0.55;
  try {
    const vs = (typeof localStorage !== 'undefined') ? localStorage.getItem('abyss_volume') : null;
    if (vs !== null && isFinite(parseFloat(vs))) volume = Util.clamp(parseFloat(vs), 0, 1);
    muted = volume <= 0;
  } catch (e) {}
  let musicTimer = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);
      // 预生成噪声缓冲 (1s)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) {
      console.warn('Audio init failed', e);
      return false;
    }
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }

  // ---------- 基础合成原语 ----------
  function tone(freq, dur, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    const vol = (opts.vol !== undefined ? opts.vol : 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.value = opts.cutoff || 800;
      f.Q.value = opts.q || 1;
      node.connect(f); node = f;
    }
    node.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 900, t0);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, opts.sweep), t0 + dur);
    f.Q.value = opts.q || 0.9;
    const vol = opts.vol !== undefined ? opts.vol : 0.18;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ---------- 音名表 ----------
  const SOUNDS = {
    swing() { noise(0.13, { freq: 2200, sweep: 500, vol: 0.13, q: 1.4 }); },
    ehit() { noise(0.1, { freq: 900, sweep: 300, vol: 0.08 }); },
    hit() {
      tone(150, 0.09, { type: 'square', vol: 0.1, slideTo: 60 });
      noise(0.08, { freq: 600, sweep: 200, vol: 0.14 });
    },
    crit() {
      tone(220, 0.14, { type: 'square', vol: 0.14, slideTo: 55 });
      noise(0.16, { freq: 1400, sweep: 150, vol: 0.2 });
      tone(880, 0.1, { type: 'triangle', vol: 0.08, delay: 0.02 });
    },
    phit() { noise(0.12, { freq: 500, sweep: 150, vol: 0.12 }); },
    hurt() {
      tone(110, 0.22, { type: 'sawtooth', vol: 0.16, slideTo: 45 });
      noise(0.18, { freq: 300, sweep: 90, vol: 0.16 });
    },
    die() {
      tone(300, 0.3, { type: 'square', vol: 0.1, slideTo: 40 });
      noise(0.35, { freq: 800, sweep: 80, vol: 0.14 });
    },
    bossdie() {
      tone(90, 1.0, { type: 'sawtooth', vol: 0.22, slideTo: 25 });
      noise(1.2, { freq: 600, sweep: 50, vol: 0.22 });
      tone(55, 1.4, { type: 'sine', vol: 0.2 });
    },
    alert() { tone(660, 0.08, { type: 'triangle', vol: 0.08 }); tone(880, 0.1, { type: 'triangle', vol: 0.06, delay: 0.06 }); },
    potion() {
      tone(520, 0.1, { type: 'sine', vol: 0.1 });
      tone(780, 0.14, { type: 'sine', vol: 0.1, delay: 0.07 });
      tone(1040, 0.16, { type: 'sine', vol: 0.08, delay: 0.14 });
    },
    buff() {
      tone(330, 0.18, { type: 'triangle', vol: 0.1 });
      tone(440, 0.2, { type: 'triangle', vol: 0.1, delay: 0.1 });
      tone(660, 0.24, { type: 'triangle', vol: 0.1, delay: 0.2 });
    },
    magic() { tone(600, 0.2, { type: 'sine', vol: 0.08, slideTo: 1200 }); },
    fire() { noise(0.4, { freq: 500, sweep: 2500, vol: 0.18 }); tone(90, 0.35, { type: 'sawtooth', vol: 0.12 }); },
    fireball() { noise(0.25, { freq: 700, sweep: 2000, vol: 0.14 }); tone(200, 0.2, { type: 'sawtooth', vol: 0.1, slideTo: 90 }); },
    frost() {
      tone(1600, 0.25, { type: 'sine', vol: 0.08, slideTo: 500 });
      noise(0.3, { freq: 3000, sweep: 1200, vol: 0.1, filter: 'highpass' });
    },
    zap() {
      noise(0.12, { freq: 4000, sweep: 800, vol: 0.16, filter: 'highpass' });
      tone(1200, 0.12, { type: 'square', vol: 0.06, slideTo: 200 });
    },
    blink() { tone(400, 0.25, { type: 'sine', vol: 0.12, slideTo: 1600 }); },
    levelup() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, { type: 'triangle', vol: 0.11, delay: i * 0.09 }));
    },
    gold() { tone(1175, 0.08, { type: 'triangle', vol: 0.07 }); tone(1568, 0.1, { type: 'triangle', vol: 0.06, delay: 0.06 }); },
    pickup() { tone(700, 0.09, { type: 'sine', vol: 0.08 }); tone(1050, 0.1, { type: 'sine', vol: 0.06, delay: 0.05 }); },
    buy() { tone(880, 0.1, { type: 'triangle', vol: 0.1 }); tone(1175, 0.12, { type: 'triangle', vol: 0.08, delay: 0.07 }); },
    stairs() { tone(300, 0.4, { type: 'sine', vol: 0.1, slideTo: 150 }); noise(0.5, { freq: 400, sweep: 100, vol: 0.1 }); },
    open() { noise(0.2, { freq: 500, sweep: 250, vol: 0.1 }); tone(180, 0.15, { type: 'square', vol: 0.06 }); },
    roar() {
      tone(70, 0.9, { type: 'sawtooth', vol: 0.24, slideTo: 45 });
      noise(0.9, { freq: 400, sweep: 120, vol: 0.2 });
    },
    dragon() {
      noise(1.1, { freq: 300, sweep: 2400, vol: 0.24 });
      tone(60, 1.0, { type: 'sawtooth', vol: 0.18 });
    },
    ui() { tone(600, 0.05, { type: 'sine', vol: 0.05 }); },
    error() { tone(220, 0.12, { type: 'square', vol: 0.08, slideTo: 180 }); },
    bow() {
      noise(0.09, { freq: 1600, sweep: 500, vol: 0.11, q: 1.6 });
      tone(620, 0.08, { type: 'triangle', vol: 0.06, slideTo: 980 });
    },
    swap() {
      tone(480, 0.06, { type: 'square', vol: 0.05 });
      tone(720, 0.08, { type: 'square', vol: 0.05, delay: 0.05 });
    },
    chest() {
      [392, 523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.1, delay: i * 0.07 }));
    },
    fountain() {
      [523, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.09, delay: i * 0.1 }));
    },
    descend() { tone(160, 0.8, { type: 'sine', vol: 0.14, slideTo: 55 }); noise(0.9, { freq: 240, sweep: 60, vol: 0.14 }); },
    victory() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.12, delay: i * 0.14 }));
    },
    // v2.3: 脚步 (极轻, 仅手动移动触发)
    step() { noise(0.05, { freq: 620, sweep: 240, vol: 0.035, q: 0.7 }); },
    // v2.3: 低血量心跳 (双闷响)
    heartbeat() {
      tone(58, 0.14, { type: 'sine', vol: 0.22, slideTo: 40 });
      tone(52, 0.16, { type: 'sine', vol: 0.18, slideTo: 36, delay: 0.17 });
    },
    // v2.3: 记忆碎片拾取音 (空灵琶音)
    echo() {
      [880, 1174, 1568].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.07, delay: i * 0.12 }));
      tone(440, 0.9, { type: 'sine', vol: 0.05, delay: 0.1 });
    },
  };

  function play(name) {
    if (muted || !unlocked || !ctx) return;
    const fn = SOUNDS[name];
    if (fn) { try { fn(); } catch (e) { /* 忽略声音错误 */ } }
  }

  // ---------- 环境音: 低频氛围垫 + 远处钟声 ----------
  function startAmbience() {
    if (!ctx || muted) return;
    if (musicTimer) return;
    musicGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
    // 两层失谐低频垫
    const oscs = [];
    const freqs = [55, 82.4, 110];
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const flt = ctx.createBiquadFilter();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      flt.type = 'lowpass';
      flt.frequency.value = 300;
      g.gain.value = f > 100 ? 0.03 : 0.06;
      // 缓慢呼吸
      const lfo = ctx.createOscillator();
      const lfoG = ctx.createGain();
      lfo.frequency.value = 0.05 + Math.random() * 0.05;
      lfoG.gain.value = 0.02;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      o.connect(flt); flt.connect(g); g.connect(musicGain);
      o.start(); lfo.start();
      oscs.push(o, lfo);
    }
    // 随机远处钟声 (小调五声音阶)
    const bells = [220, 261.6, 293.7, 349.2, 392, 440];
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      if (Math.random() < 0.55) {
        const f = bells[Math.floor(Math.random() * bells.length)];
        tone(f / 2, 2.2, { type: 'sine', vol: 0.035 });
        tone(f / 4, 2.8, { type: 'sine', vol: 0.03 });
      }
    }, 7000);
    AudioSys._oscs = oscs;
  }

  function stopAmbience() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (musicGain) musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    if (AudioSys._oscs) {
      for (const o of AudioSys._oscs) { try { o.stop(); } catch (e) {} }
      AudioSys._oscs = null;
    }
  }

  /** 设置音量 (0~1) 并持久化 */
  function setVolume(v) {
    volume = Util.clamp(v, 0, 1);
    muted = volume <= 0;
    if (ctx) master.gain.value = volume;
    try { localStorage.setItem('abyss_volume', String(volume)); } catch (e) {}
    if (volume > 0 && unlocked && !musicTimer) startAmbience();
    return volume;
  }

  /** 🔊 → 🔉 → 🔇 → 🔊 循环, 返回新音量 */
  function toggleMute() {
    return setVolume(volume > 0 ? (volume > 0.3 ? 0.25 : 0) : 0.55);
  }

  return {
    unlock, play, startAmbience, stopAmbience, toggleMute, setVolume,
    get muted() { return muted; },
    get volume() { return volume; },
    get ready() { return unlocked && !muted; },
  };
})();

// 首次交互解锁音频
if (typeof window !== 'undefined') {
  const unlockOnce = () => { AudioSys.unlock(); };
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });
}
