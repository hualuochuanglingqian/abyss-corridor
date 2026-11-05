// ============ FOV: 递归阴影投射视野 ============
// 参考 Bob Nystrom "What the Hero Sees" / RogueBasin shadowcasting。
// 8 个象限递归投射, 记录可见集 + 光照衰减。

'use strict';

const FOV = (() => {
  // 8 象限变换矩阵 [xx, xy, yx, yy]
  const OCT = [
    [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
    [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1],
  ];

  function compute(level, ox, oy, radius) {
    const { w, h } = level;
    level.visible.fill(0);
    level.light.fill(0);
    const vis = level.visible, light = level.light;

    const setVisible = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const k = y * w + x;
      vis[k] = 1;
      level.explored[k] = 1;
      const d = Util.dist(ox, oy, x, y);
      light[k] = Math.max(light[k], Math.max(0, 1 - d / (radius + 0.5)));
    };

    setVisible(ox, oy);

    for (const [xx, xy, yx, yy] of OCT) {
      castLight(level, ox, oy, 1, 1.0, 0.0, radius, xx, xy, yx, yy, setVisible);
    }

    // 火把辉光: 叠加光照 (穿透微光, 让墙外有暖色氛围)
    for (const t of level.torches) {
      const d = Util.dist(ox, oy, t.x, t.y);
      const glow = Math.max(0, 1 - d / (radius + 3)); // 只有离玩家近的火把渲染辉光
      const k = t.y * w + t.x;
      if (vis[k] || level.explored[k]) {
        const rr = 3.5 + (t.bright ? 1.5 : 0);
        for (let y = Math.max(0, t.y - 4); y <= Math.min(h - 1, t.y + 4); y++) {
          for (let x = Math.max(0, t.x - 4); x <= Math.min(w - 1, t.x + 4); x++) {
            const dd = Util.dist(t.x, t.y, x, y);
            if (dd > rr) continue;
            const lk = y * w + x;
            const v = (1 - dd / rr) * glow * (t.bright ? 1.0 : 0.8);
            if (v > light[lk]) light[lk] = Math.max(light[lk], 0); // 不直接给光, 渲染时另用
            if (vis[lk]) light[lk] = Math.min(1.4, light[lk] + v * 0.55); // 可见格增亮
          }
        }
      }
    }
    return light;
  }

  function castLight(level, cx, cy, row, start, end, radius, xx, xy, yx, yy, setVisible) {
    if (start < end) return;
    const blocksSight = (x, y) => level.blocksSight(x, y);
    const r2 = radius * radius;

    for (let j = row; j <= radius; j++) {
      let dx = -j - 1, dy = -j;
      let blocked = false;
      let newStart = start;

      while (dx <= 0) {
        dx += 1;
        const X = cx + dx * xx + dy * xy;
        const Y = cy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);

        if (start < rSlope) continue;
        if (end > lSlope) break;

        if (dx * dx + dy * dy < r2 + j) setVisible(X, Y);

        if (blocked) {
          if (blocksSight(X, Y)) {
            newStart = rSlope;
            continue;
          } else {
            blocked = false;
            start = newStart;
          }
        } else if (blocksSight(X, Y) && j < radius) {
          blocked = true;
          castLight(level, cx, cy, j + 1, start, lSlope, radius, xx, xy, yx, yy, setVisible);
          newStart = rSlope;
          start = newStart;
        }
      }
      if (blocked) break;
    }
  }

  /** 某格是否在玩家视野内 */
  function isVisible(level, x, y) {
    return level.inBounds(x, y) && level.visible[y * level.w + x] === 1;
  }

  return { compute, isVisible };
})();
