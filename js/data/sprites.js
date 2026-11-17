// ============ SPRITES: 程序化像素精灵 (v2.4 像素觉醒) ============
// 每个 sprite 是 8×8 字符位图: 一个字符一像素, '.' 为透明。
// 'o' 统一为深色描边。SpriteLib 预渲染到离屏画布, drawImage 放大时关闭平滑 → 硬像素。
// 设计原则: 8×8 里只保留剪影 + 2~3 个特征色, 靠轮廓辨认 (向 UltimateSpritescan/Pixel Dungeon 致敬)。

'use strict';

// 全局调色 (各 sprite 可覆盖)
const SPRITE_DEF_PAL = {
  o: '#101318',   // 描边
  f: '#e8b98a',   // 肤色
  e: '#141018',   // 眼
};

const SPRITES = {
  // ---------------- 玩家三职业 ----------------
  player_warrior: {
    pal: { r: '#e5484d', h: '#9aa5b5', s: '#6f7d92' },
    map: [
      '...rr...',
      '..ohho..',
      '.ohhhho.',
      '.ofefo..',
      '.ossso..',
      '.ossso..',
      '..o.o...',
      '..o.o...',
    ],
  },
  player_ranger: {
    pal: { h: '#5f8f4a', g: '#3f6f38', b: '#8a5a2b' },
    map: [
      '..ohh...',
      '.ohhho.b',
      '.ofefo.b',
      '.ogggo.b',
      '..ogg..b',
      '..ogg..b',
      '..o.o...',
      '..o.o...',
    ],
  },
  player_mage: {
    pal: { p: '#8a5fd0', s: '#8a5a2b' },
    map: [
      '...pp...',
      '..pppp..',
      '.ofefo.s',
      '.opppo.s',
      '..oppo.s',
      '..oppo.s',
      '..o.o...',
      '..o.o...',
    ],
  },

  // ---------------- 普通敌人 ----------------
  rat: {
    pal: { g: '#9c8472', p: '#e8a0a0' },
    map: [
      '.o....o.',
      'opo..opo',
      'oggggggo',
      'ogegggeo',
      'oggggggo',
      '.oggpgo.',
      '..oooo..',
      '........',
    ],
  },
  bat: {
    pal: { W: '#7a4a8f', b: '#4a2a5a', e: '#ff5a4a' },
    map: [
      '........',
      'W......W',
      'WW....WW',
      'WWWooWWW',
      '.WobboW.',
      '..beeb..',
      '...bb...',
      '........',
    ],
  },
  spider: {
    pal: { l: '#3f4a28', b: '#4a5a28', e: '#c9e04a' },
    map: [
      '........',
      '.l....l.',
      '.lobbol.',
      'l.beeb.l',
      'l.obbo.l',
      '.l.oo.l.',
      'l..ll..l',
      '........',
    ],
  },
  snake: {
    pal: { g: '#5fae5f', t: '#ff5a4a' },
    map: [
      '....oot.',
      '...ogeo.',
      '.oooggo.',
      'ogggoo..',
      'ogggo...',
      '..oo....',
      '........',
      '........',
    ],
  },
  skeleton: {
    pal: { w: '#e8e0c8' },
    map: [
      '..oooo..',
      '.owwwwo.',
      '.oweewo.',
      '..owwo..',
      '.owwwwo.',
      '..owwo..',
      '..o..o..',
      '........',
    ],
  },
  zombie: {
    pal: { z: '#6f8f5a', c: '#2f3a2a' },
    map: [
      '..oooo..',
      '.ozzezo.',
      '.ozzzzo.',
      '.ozcczo.',
      '.ozzzzo.',
      '..ozzo..',
      '..z..z..',
      '........',
    ],
  },
  ghost: {
    pal: { w: '#c9d8ea' },
    map: [
      '..oooo..',
      '.owwwwo.',
      '.oweewo.',
      '.owwwwo.',
      '.owwwwo.',
      '.owwwwo.',
      '.oww.wo.',
      '........',
    ],
  },
  imp: {
    pal: { k: '#2a1a1a', r: '#d95a4a', y: '#ffd43b' },
    map: [
      '.ko..ok.',
      '.orrrro.',
      '.oryyro.',
      '.orrrro.',
      '.orrrro.',
      '..orro..',
      '..o..o..',
      '........',
    ],
  },
  wisp: {
    pal: { a: '#ff9538', y: '#ffd43b' },
    map: [
      '...aa...',
      '..aaa...',
      '..ayya..',
      '.ayyyya.',
      '.ayyyya.',
      '..ayya..',
      '...aa...',
      '........',
    ],
  },
  mage: {
    pal: { m: '#5a3a8a', c: '#7ad9e8', s: '#8a5a2b' },
    map: [
      '..oooo..',
      '.ommmmo.',
      '.omccmo.',
      '.ommmm.s',
      '..ommo.s',
      '..ommo.s',
      '..o..o.s',
      '........',
    ],
  },
  scorpion: {
    pal: { c: '#c9944a', b: '#a06a2a', t: '#8a4a2a', l: '#6a4a1a' },
    map: [
      '.c....t.',
      'cc...ot.',
      '.obbbbo.',
      '.beeeeb.',
      '..obbo..',
      '.l.oo.l.',
      'l..oo..l',
      '........',
    ],
  },
  drake: {
    pal: { g: '#5fae3f', W: '#3f7f2f', y: '#ffd43b' },
    map: [
      '......o.',
      '.Wo.ogy.',
      'WWogggo.',
      '.oggggo.',
      '..ogggo.',
      '...o.o..',
      '........',
      '........',
    ],
  },
  boar: {
    pal: { b: '#8a5a3a', p: '#e8a0a0', t: '#f0e8d8' },
    map: [
      '..oooo..',
      '.obbbbo.',
      'pebbbbbo',
      'tbbbbbo.',
      '.obbbbo.',
      '..oooo..',
      '........',
      '........',
    ],
  },
  healer: {
    pal: { y: '#ffd43b', m: '#2a3a6f' },
    map: [
      '...yy...',
      '..oooo..',
      '.ommmmo.',
      '.ommmmo.',
      '.omymmo.',
      '..ommo..',
      '..o..o..',
      '........',
    ],
  },
  crab: {
    pal: { c: '#d97a5a', r: '#c95a3a', y: '#ffd43b', l: '#8a3a2a' },
    map: [
      'cc....cc',
      '.c.oo.c.',
      '.orrrro.',
      '.oryyro.',
      '.orrrro.',
      '..l..l..',
      '.l.ll.l.',
      '........',
    ],
  },

  // ---------------- Boss ----------------
  boss_butcher: {
    pal: { p: '#e8b98a', s: '#3a3f4a', a: '#a02a2a', w: '#c9c4b4', b: '#5a3a1a' },
    map: [
      '..oooo.w',
      '.oppppow',
      '.opeepow',
      '.osssob.',
      'osaaaso.',
      'osaaaso.',
      '..o..o..',
      '..o..o..',
    ],
  },
  boss_king: {
    pal: { y: '#ffd43b', w: '#e8e0c8' },
    map: [
      '.y.yy.y.',
      '.yyyyyy.',
      '.owwwwo.',
      '.oweewo.',
      '..owwo..',
      '.owwwwo.',
      '..o..o..',
      '..o..o..',
    ],
  },
  boss_dragon: {
    pal: { r: '#ff8c3a', W: '#b04a1a', y: '#ffd43b', b: '#ffaa50' },
    map: [
      'W......W',
      'WW.oo.WW',
      'WWorrroW',
      '.Worryo.',
      '..orrro.',
      '..obbbo.',
      '..o..o..',
      '........',
    ],
  },

  // ---------------- NPC / 设施 ----------------
  npc_oracle: {
    pal: { v: '#6a4a9f', c: '#7ad9e8', m: '#2a1a3a' },
    map: [
      '..oooo..',
      '.ovvvvo.',
      '.ovmmvo.',
      '.ovvvvo.',
      '.ovccvo.',
      '..ovvo..',
      '..o..o..',
      '........',
    ],
  },
  npc_captive: {
    pal: { h: '#5a3a1a', c: '#8a8f9a' },
    map: [
      '..oooo..',
      '.ohhhho.',
      '.ofefo..',
      '.occco..',
      '..offo..',
      '..o..o..',
      '........',
      '........',
    ],
  },
  npc_statue: {
    pal: { G: '#7a8290', D: '#4a5058' },
    map: [
      '..oooo..',
      '.oGGGGo.',
      '.oGeGeo.',
      '.oGDGGo.',
      '.oGGGGo.',
      '..oGGo..',
      '..o..o..',
      '........',
    ],
  },
  npc_shopkeep: {
    pal: { y: '#d9ab4a', b: '#6a4a2a' },
    map: [
      '..oooo..',
      '.oyyyyo.',
      '.ofefo..',
      '.obbbo..',
      '.obybo..',
      '..obbo..',
      '..o..o..',
      '........',
    ],
  },
};

// 渲染库: 懒初始化 (headless 环境无 document, 只在浏览器里建缓存)
const SpriteLib = (() => {
  const cache = new Map();
  const SCALE = 3;   // 8px 位图 × 3 = 24px = 一格

  function make(id) {
    const def = SPRITES[id];
    if (!def || typeof document === 'undefined') return null;
    const rows = def.map;
    const h = rows.length, w = rows[0].length;
    const cv = document.createElement('canvas');
    cv.width = w * SCALE;
    cv.height = h * SCALE;
    const c = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = (def.pal && def.pal[ch]) || SPRITE_DEF_PAL[ch] || '#ff00ff';
        c.fillStyle = col;
        c.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    return cv;
  }

  function get(id) {
    if (!SPRITES[id]) return null;
    let cv = cache.get(id);
    if (!cv) { cv = make(id); if (!cv) return null; cache.set(id, cv); }
    return cv;
  }

  function has(id) { return !!SPRITES[id]; }

  return { get, has, SCALE, _cache: cache };
})();
