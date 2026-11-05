// ============ PATHING: A* 寻路 + BFS 场 ============
// 8 方向, 禁止切墙角 (斜走需两正交邻格均可走)。

'use strict';

const Path = (() => {

  /** 二叉小顶堆 */
  class Heap {
    constructor() { this.a = []; }
    push(node) {
      const a = this.a;
      a.push(node);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.a;
      if (!a.length) return null;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    }
    get size() { return this.a.length; }
  }

  /**
   * A* 寻路
   * opts.passFn(x,y) 自定义可走; opts.occupied(x,y) 视为阻挡; opts.allowEnd 可走向终点格(即使被占)
   * 返回: [{x,y}...] 从起点下一步到终点 (不含起点), null 表示不可达
   */
  function aStar(level, sx, sy, tx, ty, opts) {
    opts = opts || {};
    const w = level.w, h = level.h;
    const passFn = opts.passFn || ((x, y) => level.walkable(x, y));
    const blocked = opts.occupied || (() => false);
    if (sx === tx && sy === ty) return [];
    if (!level.inBounds(tx, ty)) return null;

    const g = new Float32Array(w * h).fill(Infinity);
    const from = new Int32Array(w * h).fill(-1);
    const closed = new Uint8Array(w * h);
    const H = (x, y) => (Math.abs(x - tx) + Math.abs(y - ty)) * 1.001;

    const sk = sy * w + sx;
    g[sk] = 0;
    const heap = new Heap();
    heap.push({ k: sk, f: H(sx, sy) });

    const targetK = ty * w + tx;
    let found = false;

    while (heap.size) {
      const cur = heap.pop();
      if (cur.k === targetK) { found = true; break; }
      if (closed[cur.k]) continue;
      closed[cur.k] = 1;
      const cx = cur.k % w, cy = (cur.k / w) | 0;
      for (const [dx, dy] of Util.DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (closed[nk]) continue;
        if (!passFn(nx, ny)) continue;
        if (blocked(nx, ny) && nk !== targetK) continue;
        // 禁止切角
        if (dx !== 0 && dy !== 0) {
          if (!passFn(cx + dx, cy) || !passFn(cx, cy + dy)) continue;
        }
        const step = (dx !== 0 && dy !== 0) ? 1.4 : 1;
        const ng = g[cur.k] + step;
        if (ng < g[nk]) {
          g[nk] = ng;
          from[nk] = cur.k;
          heap.push({ k: nk, f: ng + H(nx, ny) });
        }
      }
    }
    if (!found && g[targetK] === Infinity) return null;

    // 回溯
    const path = [];
    let k = targetK;
    while (k !== sk && k !== -1) {
      path.push({ x: k % w, y: (k / w) | 0 });
      k = from[k];
    }
    path.reverse();
    return path;
  }

  /** BFS 距离场 (自动探索用) */
  function bfsField(level, sx, sy) {
    const w = level.w, h = level.h;
    const dist = new Int16Array(w * h).fill(-1);
    const q = [sy * w + sx];
    dist[sy * w + sx] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi], x = k % w, y = (k / w) | 0;
      for (const [dx, dy] of Util.DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (dist[nk] !== -1) continue;
        if (!level.walkable(nx, ny)) continue;
        dist[nk] = dist[k] + 1;
        q.push(nk);
      }
    }
    return dist;
  }

  return { aStar, bfsField };
})();
