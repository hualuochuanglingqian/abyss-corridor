// ============ Util: 通用工具函数 ============

'use strict';

const Util = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },

  /** 缓动 */
  easeOut(t) { return 1 - (1 - t) * (1 - t); },
  easeIn(t) { return t * t; },
  easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  easeBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },

  /** 切比雪夫距离 (八方向格距) */
  cdist(x1, y1, x2, y2) { return Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); },
  /** 曼哈顿距离 */
  mdist(x1, y1, x2, y2) { return Math.abs(x2 - x1) + Math.abs(y2 - y1); },
  /** 欧氏距离平方 */
  dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; },
  /** 欧氏距离 */
  dist(x1, y1, x2, y2) { return Math.sqrt(this.dist2(x1, y1, x2, y2)); },

  /** 8 方向: (dx,dy) -> [dx',dy'] 归一为 -1/0/1 */
  dirNorm(dx, dy) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > 0 && ay > 0) return [Math.sign(dx), Math.sign(dy)];
    if (ax > ay) return [Math.sign(dx), 0];
    if (ay > ax) return [0, Math.sign(dy)];
    return [Math.sign(dx), Math.sign(dy)];
  },

  /** 8 邻域步进表 */
  DIRS8: [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ],
  /** 4 邻域 (BFS/寻路用, 走廊更自然) */
  DIRS4: [[0, -1], [1, 0], [0, 1], [-1, 0]],

  /** 视线检测: Bresenham 直线, 对每个中间格调 blocker(x,y) */
  lineOfSight(x0, y0, x1, y1, blocked) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0, y = y0;
    while (!(x === x1 && y === y1)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) break;
      if (blocked(x, y)) return false;
    }
    return true;
  },

  /** 颜色: hex -> rgba 字符串 */
  rgba(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${a})`;
  },

  /** hex -> [r,g,b] */
  rgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  },

  /** 颜色变亮/变暗: amt -1..1 */
  shade(hex, amt) {
    const [r, g, b] = this.rgb(hex);
    const f = (c) => this.clamp(Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)), 0, 255);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  },

  /** 概率四舍五入取整 (大数统计期望更准) */
  probRound(v, rng) {
    const f = Math.floor(v);
    return f + (rng && rng.next ? (rng.next() < v - f ? 1 : 0) : (Math.random() < v - f ? 1 : 0));
  },

  /** 千分位 */
  fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },

  /** 安全 DOM 获取 */
  el(id) { return document.getElementById(id); },

  /** 简易事件总线 */
  bus: {
    _m: {},
    on(ev, fn) { (this._m[ev] = this._m[ev] || []).push(fn); },
    emit(ev, ...args) { (this._m[ev] || []).forEach(fn => { try { fn(...args); } catch (e) { console.error(`[bus:${ev}]`, e); } }); },
  },
};
