// ============ RNG: 可复现的种子随机数引擎 ============
// mulberry32 + xmur3 字符串哈希。整局游戏用一个主 seed,
// 每层/每个子系统从主 seed 派生子流, 保证同 seed 同地牢。

'use strict';

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class RNG {
  constructor(seed) {
    // seed: 数字或字符串
    if (typeof seed === 'string') {
      const h = xmur3(seed);
      this.seedStr = seed;
      this._next = mulberry32(h());
    } else {
      this.seedStr = String(seed);
      this._next = mulberry32(seed >>> 0);
    }
    this.state = null;
  }

  /** 基础浮点 [0,1) */
  next() { return this._next(); }

  /** 整数 [a, b] 双闭区间 */
  int(a, b) {
    if (b === undefined) { b = a; a = 0; }
    if (b < a) { const t = a; a = b; b = t; }
    return a + Math.floor(this._next() * (b - a + 1));
  }

  /** 浮点 [a, b) */
  float(a, b) { return a + this._next() * (b - a); }

  /** 概率 p∈[0,1] */
  chance(p) { return this._next() < p; }

  /** 从数组挑一个 */
  pick(arr) { return arr[Math.floor(this._next() * arr.length)]; }

  /** 按权重表挑选: [{w:权重, v:值}...] 或 权重表对象 {key: weight} */
  weighted(entries) {
    let total = 0;
    const list = Array.isArray(entries)
      ? entries.map(e => ({ w: e.w, v: e.v !== undefined ? e.v : e.key }))
      : Object.entries(entries).map(([v, w]) => ({ w, v }));
    for (const e of list) total += e.w;
    let r = this._next() * total;
    for (const e of list) {
      r -= e.w;
      if (r <= 0) return e.v;
    }
    return list[list.length - 1].v;
  }

  /** Fisher-Yates 洗牌 (返回原数组) */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** 打乱并返回副本 */
  shuffled(arr) { return this.shuffle(arr.slice()); }

  /** nDm 掷骰 (如 2d6) */
  roll(n, d) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += this.int(1, d);
    return sum;
  }

  /** 正态近似 (Box-Muller 简化): 均值 mean, 标准差 sd, 截断在 [min,max] */
  normal(mean, sd, min, max) {
    const u = Math.max(1e-9, this._next());
    const v = this._next();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    let x = mean + g * sd;
    if (min !== undefined) x = Math.max(min, x);
    if (max !== undefined) x = Math.min(max, x);
    return x;
  }

  /** 派生子流: 同一主 seed 下, 每个用途拿到独立可复现流 */
  static derive(seed, tag) {
    return new RNG(seed + '::' + tag);
  }
}

// 全局单例入口 (Game 会重新设置主 seed)
const RNGX = {
  main: new RNG(Date.now()), // 默认流 (标题界面小动画用)
};
