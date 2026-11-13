// ============ MAPGEN: 地图生成 ============
// 三种生成器: rooms(房间+走廊) / cave(细胞自动机) / arena(Boss 竞技场)
// 保证: 出生点与楼梯 BFS 连通, 物件只放在可达格上。

'use strict';

const MapGen = (() => {

  /** 创建带工具方法的空关卡 */
  function createLevel(seed, floor) {
    const w = CONFIG.MAP_W, h = CONFIG.MAP_H;
    const L = {
      seed, floor, w, h,
      tiles: new Uint8Array(w * h),
      variant: new Uint8Array(w * h),
      explored: new Uint8Array(w * h),
      visible: new Uint8Array(w * h),
      light: new Float32Array(w * h),
      rooms: [],
      spawn: { x: 0, y: 0 },
      stairsX: -1, stairsY: -1,
      items: [],      // 掉落物 (含商店商品 price)
      golds: [],      // 金币堆 {x,y,n}
      enemies: [],
      torches: [],
      theme: Floors.def(floor),
      key(x, y) { return y * w + x; },
      inBounds(x, y) { return x >= 0 && y >= 0 && x < w && y < h; },
      tile(x, y) { return this.inBounds(x, y) ? this.tiles[y * w + x] : T.VOID; },
      set(x, y, t) {
        if (this.inBounds(x, y)) {
          this.tiles[y * w + x] = t;
          this.version = (this.version || 0) + 1;  // 渲染静态层缓存失效依据
        }
      },
      blocksMove(x, y) { return !this.inBounds(x, y) || Tiles.blocksMove(this.tiles[y * w + x]); },
      blocksSight(x, y) { return !this.inBounds(x, y) || Tiles.blocksSight(this.tiles[y * w + x]); },
      /** 通用可走判定 (不含实体占用) */
      walkable(x, y) {
        if (!this.inBounds(x, y)) return false;
        const t = this.tiles[y * w + x];
        return !Tiles.blocksMove(t);
      },
      enemyAt(x, y) { return this.enemies.find(e => e.hp > 0 && e.x === x && e.y === y) || null; },
      itemsAt(x, y) { return this.items.filter(it => it.x === x && it.y === y); },
      goldAt(x, y) { return this.golds.find(gd => gd.x === x && gd.y === y) || null; },
      /** BFS 可达集 (木门视为可通行 — 玩家撞一下就开) */
      reachable(sx, sy) {
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
            const t = this.tiles[nk];
            if (Tiles.blocksMove(t) && t !== T.DOOR_C) continue;
            dist[nk] = dist[k] + 1;
            q.push(nk);
          }
        }
        return dist;
      },
    };
    return L;
  }

  // ---------- rooms: 房间 + 走廊 ----------
  function genRooms(L, rng) {
    const { w, h } = L;
    L.tiles.fill(T.WALL);
    const rooms = [];
    for (let i = 0; i < 80 && rooms.length < 11; i++) {
      const rw = rng.int(4, 9), rh = rng.int(3, 6);
      const rx = rng.int(1, w - rw - 2), ry = rng.int(1, h - rh - 2);
      const r = { x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) };
      let ok = true;
      for (const o of rooms) {
        if (rx < o.x + o.w + 1 && rx + rw + 1 > o.x && ry < o.y + o.h + 1 && ry + rh + 1 > o.y) { ok = false; break; }
      }
      if (!ok) continue;
      rooms.push(r);
      for (let y = ry; y < ry + rh; y++)
        for (let x = rx; x < rx + rw; x++)
          L.tiles[y * w + x] = T.FLOOR;
    }
    if (!rooms.length) {
      // 兜底: 中央开一间房
      const rx = (w >> 1) - 3, ry = (h >> 1) - 2;
      const r = { x: rx, y: ry, w: 7, h: 5, cx: rx + 3, cy: ry + 2 };
      for (let y = ry; y < ry + 5; y++)
        for (let x = rx; x < rx + 7; x++)
          L.tiles[y * w + x] = T.FLOOR;
      rooms.push(r);
    }
    L.rooms = rooms;

    // 走廊: 依次连接 (每个房间连到已连接集合中最近的一个)
    const connected = [rooms[0]];
    const rest = rooms.slice(1);
    while (rest.length) {
      let bi = 0, bt = 0, bd = Infinity;
      for (let i = 0; i < rest.length; i++) {
        for (let j = 0; j < connected.length; j++) {
          const d = Util.mdist(rest[i].cx, rest[i].cy, connected[j].cx, connected[j].cy);
          if (d < bd) { bd = d; bi = i; bt = j; }
        }
      }
      carveCorridor(L, rng, rest[bi], connected[bt]);
      connected.push(rest.splice(bi, 1)[0]);
    }
    return rooms;
  }

  function carveCorridor(L, rng, a, b) {
    const { w } = L;
    let x = a.cx, y = a.cy;
    const hFirst = rng.chance(0.5);
    const doorAt = (x, y) => {
      const t = L.tiles[y * w + x];
      if (t === T.WALL && rng.chance(0.35)) L.tiles[y * w + x] = T.DOOR_C;
      else if (t === T.WALL) L.tiles[y * w + x] = T.FLOOR;
    };
    const stepX = () => {
      while (x !== b.cx) { x += Math.sign(b.cx - x); doorAt(x, y); }
    };
    const stepY = () => {
      while (y !== b.cy) { y += Math.sign(b.cy - y); doorAt(x, y); }
    };
    if (hFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    // 尽头保底为地面
    if (L.tiles[y * w + x] === T.DOOR_C) L.tiles[y * w + x] = T.FLOOR;
  }

  // ---------- cave: 细胞自动机 ----------
  function genCave(L, rng) {
    const { w, h } = L;
    let cur = new Uint8Array(w * h);
    for (let i = 0; i < cur.length; i++) cur[i] = rng.chance(0.45) ? 1 : 0;
    // 边界强制墙
    for (let x = 0; x < w; x++) { cur[x] = 1; cur[(h - 1) * w + x] = 1; }
    for (let y = 0; y < h; y++) { cur[y * w] = 1; cur[y * w + w - 1] = 1; }
    for (let it = 0; it < 5; it++) {
      const nxt = new Uint8Array(w * h);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            n += cur[(y + dy) * w + x + dx];
          }
          nxt[y * w + x] = (cur[y * w + x] === 1) ? (n >= 4 ? 1 : 0) : (n >= 5 ? 1 : 0);
        }
      }
      cur = nxt;
    }
    // 只保留最大连通区域
    const region = new Int16Array(w * h).fill(-1);
    let bestId = -1, bestN = 0, regId = 0;
    for (let i = 0; i < w * h; i++) {
      if (cur[i] || region[i] !== -1) continue;
      let n = 0;
      const q = [i]; region[i] = regId;
      for (let qi = 0; qi < q.length; qi++) {
        const k = q[qi]; n++;
        const x = k % w, y = (k / w) | 0;
        for (const [dx, dy] of Util.DIRS4) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nk = ny * w + nx;
          if (cur[nk] || region[nk] !== -1) continue;
          region[nk] = regId; q.push(nk);
        }
      }
      if (n > bestN) { bestN = n; bestId = regId; }
      regId++;
    }
    L.tiles.fill(T.WALL);
    for (let i = 0; i < w * h; i++) if (region[i] === bestId) L.tiles[i] = T.FLOOR;
    // 面积太小 → 退化为 rooms
    if (bestN < 260) { L.tiles.fill(T.WALL); genRooms(L, rng); return; }
  }

  // ---------- arena: Boss 竞技场 ----------
  function genArena(L, rng) {
    const { w, h } = L;
    L.tiles.fill(T.WALL);
    // 中央大房间
    const aw = 17, ah = 11;
    const ax = ((w - aw) >> 1), ay = ((h - ah) >> 1);
    const arena = { x: ax, y: ay, w: aw, h: ah, cx: ax + (aw >> 1), cy: ay + (ah >> 1) };
    for (let y = ay; y < ay + ah; y++)
      for (let x = ax; x < ax + aw; x++)
        L.tiles[y * w + x] = T.FLOOR;
    // 周边小房间 ×3
    const rooms = [arena];
    const spots = [
      { x: rng.int(2, 6), y: rng.int(3, 8), w: rng.int(5, 7), h: rng.int(4, 5) },
      { x: w - rng.int(8, 13), y: rng.int(3, 8), w: rng.int(5, 7), h: rng.int(4, 5) },
      { x: rng.int(w >> 2, (w >> 1) - 4), y: h - rng.int(6, 8), w: rng.int(6, 8), h: rng.int(3, 4) },
    ];
    for (const s of spots) {
      const r = { x: s.x, y: s.y, w: s.w, h: s.h, cx: s.x + (s.w >> 1), cy: s.y + (s.h >> 1) };
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          L.tiles[y * w + x] = T.FLOOR;
      rooms.push(r);
      carveCorridor(L, rng, r, arena);
    }
    L.rooms = rooms.slice(1).concat(arena); // 出生点选小房间, 竞技场排最后
    return L.rooms;
  }

  // ---------- 主流程 ----------
  function generate(seed, floor, opts) {
    opts = opts || {};
    const rng = RNG.derive(seed, 'map' + floor);
    const L = createLevel(seed, floor);
    L.chal = opts.chal || null;   // 挑战因子数值
    L.opts = opts;
    const type = Floors.type(floor);
    if (type === 'cave') genCave(L, rng);
    else if (type === 'arena') genArena(L, rng);
    else if (type === 'mixed') { genRooms(L, rng); drunkWiden(L, rng, 220); }
    else genRooms(L, rng);

    // variant 噪声 (渲染变化用)
    for (let i = 0; i < L.variant.length; i++) L.variant[i] = rng.int(0, 255);

    // 出生点: 第一个房间中心 / 洞穴: 随机地面
    const floorsList = [];
    for (let y = 1; y < CONFIG.MAP_H - 1; y++)
      for (let x = 1; x < CONFIG.MAP_W - 1; x++)
        if (L.tiles[y * CONFIG.MAP_W + x] === T.FLOOR) floorsList.push({ x, y });

    if (type === 'cave') {
      const s = rng.pick(floorsList);
      L.spawn = { x: s.x, y: s.y };
    } else {
      const r = L.rooms[0];
      L.spawn = { x: r.cx, y: r.cy };
    }

    // 可达 + 最远点 = 楼梯
    const dist = L.reachable(L.spawn.x, L.spawn.y);
    let far = -1, farK = -1;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] > far) { far = dist[i]; farK = i; }
    }
    L.stairsX = farK % L.w; L.stairsY = (farK / L.w) | 0;
    L.tiles[farK] = T.STAIRS;

    // 装饰
    sprinkleDecor(L, rng);

    // 火把: 贴地墙面
    placeTorches(L, rng);

    // 出生点必须干净可站
    L.set(L.spawn.x, L.spawn.y, T.FLOOR);

    // 敌人
    placeEnemies(L, rng, floor);

    // 物品 / 金币 / 宝箱 / 泉水 / 祭坛
    placeLoot(L, rng, floor);

    // 商店
    maybeShop(L, rng, floor);

    // 伏击房 (关门打狗)
    pickAmbushRooms(L, rng);

    // Boss
    const theme = Floors.def(floor);
    if (theme.boss) placeBoss(L, rng, floor, theme.boss);

    // 出生点旁的安净区: 清掉紧邻敌人 (Boss 不移除)
    for (const [dx, dy] of Util.DIRS8) {
      const e = L.enemyAt(L.spawn.x + dx, L.spawn.y + dy);
      if (e && !e.boss) { L.enemies.splice(L.enemies.indexOf(e), 1); }
    }

    // 最终连通性保障 (碎石/宝箱可能堵路)
    ensureConnectivity(L);
    return L;
  }

  /** 保证出生点 → 楼梯可达 */
  function ensureConnectivity(L) {
    const sk = L.stairsY * L.w + L.stairsX;
    const check = () => L.reachable(L.spawn.x, L.spawn.y)[sk] !== -1;
    if (check()) return;
    // 1) 清除所有碎石
    for (let i = 0; i < L.tiles.length; i++) {
      if (L.tiles[i] === T.RUBBLE) L.tiles[i] = T.FLOOR;
    }
    if (check()) return;
    // 2) 打开宝箱占位
    if (L.chest && !L.chest.opened) L.set(L.chest.x, L.chest.y, T.FLOOR);
    if (check()) return;
    // 3) 最后手段: 从出生点直线强拆
    let x = L.spawn.x, y = L.spawn.y;
    const carve = (xx, yy) => {
      const t = L.tile(xx, yy);
      if (t === T.WALL || t === T.TORCH || t === T.RUBBLE || t === T.SHOPKEEP || t === T.CHEST || t === T.DOOR_C) {
        L.set(xx, yy, T.FLOOR);
      }
    };
    while (x !== L.stairsX) { x += Math.sign(L.stairsX - x); carve(x, y); }
    while (y !== L.stairsY) { y += Math.sign(L.stairsY - y); carve(x, y); }
  }

  /** mixed: 醉汉游走加宽走廊 */
  function drunkWiden(L, rng, n) {
    const { w, h } = L;
    let x = rng.pick(L.rooms).cx, y = rng.pick(L.rooms).cy;
    for (let i = 0; i < n; i++) {
      const [dx, dy] = rng.pick(Util.DIRS4);
      const nx = Util.clamp(x + dx, 1, w - 2), ny = Util.clamp(y + dy, 1, h - 2);
      x = nx; y = ny;
      if (L.tiles[y * w + x] === T.FLOOR && rng.chance(0.5)) {
        for (const [ddx, ddy] of Util.DIRS4) {
          const tx = x + ddx, ty = y + ddy;
          if (tx > 0 && ty > 0 && tx < w - 1 && ty < h - 1 && L.tiles[ty * w + tx] === T.WALL) {
            L.tiles[ty * w + tx] = T.FLOOR;
            break;
          }
        }
      }
    }
  }

  function sprinkleDecor(L, rng) {
    const { w, h } = L;
    for (let i = 0; i < w * h; i++) {
      if (L.tiles[i] !== T.FLOOR) continue;
      const r = rng.next();
      if (r < 0.020) L.tiles[i] = T.GRASS;
      else if (r < 0.032) L.tiles[i] = T.BONES;
      else if (r < 0.045) L.tiles[i] = T.CRACK;
      else if (r < 0.050) L.tiles[i] = T.RUBBLE;
    }
  }

  function placeTorches(L, rng) {
    const density = L.theme.torch || 0.025;
    const { w, h } = L;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (L.tiles[y * w + x] !== T.WALL) continue;
        // 只取下方是地面的墙 (火把朝外)
        if (L.tiles[(y + 1) * w + x] === T.FLOOR && rng.chance(density * 6)) {
          L.tiles[y * w + x] = T.TORCH;
          L.torches.push({ x, y });
        }
      }
    }
  }

  /** 可用于放怪/放物的可达地面格 (距出生 minDist 以上) */
  function spawnableTiles(L, minDist, maxDist) {
    const dist = L.reachable(L.spawn.x, L.spawn.y);
    const out = [];
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < minDist) continue;
      if (maxDist !== undefined && dist[i] > maxDist) continue;
      const x = i % L.w, y = (i / L.w) | 0;
      if (L.tiles[i] !== T.FLOOR && L.tiles[i] !== T.GRASS && L.tiles[i] !== T.BONES && L.tiles[i] !== T.CRACK) continue;
      if (x === L.stairsX && y === L.stairsY) continue;
      out.push({ x, y, d: dist[i] });
    }
    return out;
  }

  function placeEnemies(L, rng, floor) {
    const theme = L.theme;
    const tiles = rng.shuffled(spawnableTiles(L, 8));
    let n = theme.enemyN || 8;
    for (let i = 0; i < n && tiles.length; i++) {
      const p = tiles.pop();
      const id = Enemies.pickForFloor(floor, rng);
      // 精英怪: 第 2 层起 10% 概率
      const elite = floor >= 2 && !L.theme.boss && rng.chance(0.1);
      const e = Enemies.mk(id, floor, rng, { elite, chal: L.chal });
      e.x = p.x; e.y = p.y; e.homeX = p.x; e.homeY = p.y;
      L.enemies.push(e);
    }
  }

  function placeBoss(L, rng, floor, bossId) {
    // Boss 放在离楼梯近、离出生远的位置; 楼梯在竞技场最远角, Boss 坐守楼梯旁
    const b = Enemies.mk(bossId, floor, rng, { chal: L.chal });
    const sx = L.stairsX, sy = L.stairsY;
    let best = null, bestD = -1;
    for (let i = 0; i < L.tiles.length; i++) {
      if (L.tiles[i] !== T.FLOOR) continue;
      const x = i % L.w, y = (i / L.w) | 0;
      const d = Util.mdist(x, y, sx, sy);
      if (d >= 2 && d <= 5 && d > bestD) { bestD = d; best = { x, y }; }
    }
    if (!best) best = { x: L.stairsX, y: L.stairsY + 1 };
    clearEnemyAt(L, best.x, best.y);
    // 无尽回廊: Boss 随深度强化
    if (floor > CONFIG.MAX_FLOOR) {
      const deep = floor - CONFIG.MAX_FLOOR;
      b.maxHp = Math.round(b.maxHp * (1 + deep * 0.22));
      b.hp = b.maxHp;
      b.atk = Math.round(b.atk * (1 + deep * 0.08));
    }
    b.x = best.x; b.y = best.y; b.homeX = best.x; b.homeY = best.y;
    b.guarding = true;
    L.enemies.push(b);
    // 无尽回廊每 10 层: 双生 Boss (两位首领同场镇守)
    if (floor > CONFIG.MAX_FLOOR && (floor - CONFIG.MAX_FLOOR) % 10 === 0) {
      const cycle = ['boss_butcher', 'boss_king', 'boss_dragon'];
      const idx = cycle.indexOf(bossId);
      const twinId = cycle[(idx + 1 + rng.int(0, 1)) % 3];
      const deep2 = floor - CONFIG.MAX_FLOOR;
      const twin = Enemies.mk(twinId, floor, rng, { chal: L.chal });
      twin.maxHp = Math.round(twin.maxHp * (1 + deep2 * 0.22));
      twin.hp = twin.maxHp;
      twin.atk = Math.round(twin.atk * (1 + deep2 * 0.08));
      let tb = null;
      for (let i = 0; i < L.tiles.length; i++) {
        if (L.tiles[i] !== T.FLOOR) continue;
        const x = i % L.w, y = (i / L.w) | 0;
        const d2 = Util.mdist(x, y, best.x, best.y);
        if (d2 >= 3 && d2 <= 6 && !L.enemyAt(x, y) && !(x === L.spawn.x && y === L.spawn.y)) { tb = { x, y }; break; }
      }
      if (!tb) tb = { x: best.x + 1, y: best.y };
      clearEnemyAt(L, tb.x, tb.y);
      twin.x = tb.x; twin.y = tb.y; twin.homeX = tb.x; twin.homeY = tb.y;
      twin.guarding = true;
      L.enemies.push(twin);
    }
    // 少量护卫
    const tiles = rng.shuffled(spawnableTiles(L, 10));
    for (let i = 0; i < 2 && tiles.length; i++) {
      const p = tiles.pop();
      const e = Enemies.mk(Enemies.pickForFloor(floor, rng), floor, rng, { chal: L.chal });
      e.x = p.x; e.y = p.y; e.homeX = p.x; e.homeY = p.y;
      L.enemies.push(e);
    }
    // 竞技场火把加亮
    for (const t of L.torches) t.bright = true;
  }

  function placeLoot(L, rng, floor) {
    const tiles = rng.shuffled(spawnableTiles(L, 5));
    // 楼层散落物品 2-4 件 (挑战"坚壁"提高装备率)
    const eqChance = 0.45 + (L.chal && L.chal.eqBonus ? L.chal.eqBonus : 0);
    const nItem = rng.int(2, 4);
    for (let i = 0; i < nItem && tiles.length; i++) {
      const p = tiles.pop();
      const it = Items.randomItem(rng, floor, { eq: rng.chance(eqChance) });
      it.x = p.x; it.y = p.y;
      L.items.push(it);
    }
    // 金币堆 4-7 堆
    const nGold = rng.int(4, 7);
    for (let i = 0; i < nGold && tiles.length; i++) {
      const p = tiles.pop();
      L.golds.push({ x: p.x, y: p.y, n: rng.int(6, 18) + floor * 3 });
    }
    // 宝箱 30% 一层一个
    if (rng.chance(0.55) && tiles.length) {
      const p = tiles.pop();
      clearEnemyAt(L, p.x, p.y);
      L.set(p.x, p.y, T.CHEST);
      L.chest = { x: p.x, y: p.y, opened: false };
    }
    // 泉水: Boss 层 & 40% 普通层
    const nearTiles = rng.shuffled(spawnableTiles(L, 3, 9).filter(p =>
      !L.items.some(it => it.x === p.x && it.y === p.y)
      && !L.golds.some(gd => gd.x === p.x && gd.y === p.y)));
    if ((L.theme.boss || rng.chance(0.5)) && nearTiles.length) {
      const p = nearTiles[0];
      clearEnemyAt(L, p.x, p.y);
      L.set(p.x, p.y, T.FOUNTAIN);
    }
    // 祭坛: 第 7 层起 35%
    if (floor >= 7 && rng.chance(0.35) && nearTiles.length > 1) {
      const p = nearTiles[1];
      clearEnemyAt(L, p.x, p.y);
      L.set(p.x, p.y, T.ALTAR);
      L.altarUsed = false;
    }
  }

  /** 移除某格上的敌人 (设施占位用) */
  function clearEnemyAt(L, x, y) {
    const e = L.enemyAt(x, y);
    if (e) {
      const i = L.enemies.indexOf(e);
      if (i >= 0) L.enemies.splice(i, 1);
    }
  }

  function maybeShop(L, rng, floor) {
    const forced = floor === 3 || floor === 6 || floor === 9 || floor === 12;
    if (!forced && !rng.chance(0.25)) return;

    const walkDecor = (t) => t === T.FLOOR || t === T.GRASS || t === T.BONES || t === T.CRACK;
    const countWalkNbr = (x, y) => {
      let c = 0;
      for (const [dx, dy] of Util.DIRS8) if (L.walkable(x + dx, y + dy)) c++;
      return c;
    };

    let kx = -1, ky = -1;
    // 首选房间中心 (避开出生点/楼梯/已有设施)
    const cand = L.rooms.filter(r =>
      Util.mdist(r.cx, r.cy, L.spawn.x, L.spawn.y) > 4
      && !(L.stairsX === r.cx && L.stairsY === r.cy)
      && walkDecor(L.tile(r.cx, r.cy)));
    if (cand.length) {
      let best = null, bestN = -1;
      for (const r of rng.shuffled(cand)) {
        const n = countWalkNbr(r.cx, r.cy);
        if (n > bestN) { bestN = n; best = r; }
        if (n >= 5) break;
      }
      if (best && bestN >= 3) { kx = best.cx; ky = best.cy; }
    }
    // 洞穴层: 找一块 3x3 开阔地
    if (kx < 0) {
      const tiles = rng.shuffled(spawnableTiles(L, 5, 30));
      for (const p of tiles) {
        if (walkDecor(L.tile(p.x, p.y)) && countWalkNbr(p.x, p.y) >= 5) { kx = p.x; ky = p.y; break; }
      }
    }
    if (kx < 0) return;

    // 清走占位实体/物品, 再放商人
    L.enemies = L.enemies.filter(e => Util.cdist(e.x, e.y, kx, ky) > 1);
    L.items = L.items.filter(it => !(it.x === kx && it.y === ky));
    L.golds = L.golds.filter(gd => !(gd.x === kx && gd.y === ky));
    L.set(kx, ky, T.SHOPKEEP);
    L.shop = { x: kx, y: ky };

    // 商品摆在商人四周地面
    const slots = [];
    for (const [dx, dy] of Util.DIRS8) {
      const x = kx + dx, y = ky + dy;
      if (!L.walkable(x, y)) continue;
      if (L.items.some(it => it.x === x && it.y === y)) continue;
      if (L.golds.some(gd => gd.x === x && gd.y === y)) continue;
      slots.push({ x, y });
    }
    rng.shuffle(slots);
    const nGoods = Math.min(4, slots.length);
    for (let i = 0; i < nGoods; i++) {
      const it = Items.randomItem(rng, floor, { eq: true, noShop: true });
      const priceMul = 1 + floor * 0.08;
      it.price = Math.max(5, Math.round(Items.price(it.id) * priceMul / 5) * 5);
      it.x = slots[i].x; it.y = slots[i].y;
      L.items.push(it);
    }
  }

  /** 挑选伏击房 (关门打狗): 中等大小、无特殊设施、非出生房/商店/Boss 层 */
  function pickAmbushRooms(L, rng) {
    L.ambushRooms = [];
    if (L.theme.boss) return;
    const bad = new Set([T.STAIRS, T.CHEST, T.FOUNTAIN, T.ALTAR, T.SHOPKEEP]);
    const cands = L.rooms.filter(r => {
      const area = r.w * r.h;
      if (area < 16 || area > 60) return false;
      if (r === L.rooms[0]) return false;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (bad.has(L.tile(x, y))) return false;
        }
      }
      return true;
    });
    rng.shuffle(cands);
    for (let i = 0; i < Math.min(2, cands.length); i++) {
      const r = cands[i];
      L.ambushRooms.push({
        x: r.x, y: r.y, w: r.w, h: r.h, cx: r.cx, cy: r.cy,
        triggered: false, cleared: false,
      });
    }
  }

  return { generate, spawnableTiles, createLevel };
})();
