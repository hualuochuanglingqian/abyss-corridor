// ===== headless 冒烟/平衡仿真 (在打包的全局作用域内运行) =====

let simFailures = 0;
function simAssert(cond, msg) {
  if (!cond) { simFailures++; console.log('❌ ' + msg); }
}
const simLog = (...a) => console.log(...a);

// localStorage 桩 (存档测试用)
const __store = new Map();
globalThis.localStorage = {
  getItem: k => (__store.has(k) ? __store.get(k) : null),
  setItem: (k, v) => __store.set(k, String(v)),
  removeItem: k => __store.delete(k),
};

// ---------- 玩家构造 ----------
function simWeaponForFloor(f) {
  const w = [null, null, 'w_iron', 'w_iron', 'w_axe', 'w_axe', 'w_knight', 'w_knight', 'w_rune', 'w_rune', 'w_rune', 'w_rune', 'w_rune', 'w_demon', 'w_demon', 'w_demon'];
  return w[Math.min(15, Math.max(0, f))] || null;
}
function simArmorForFloor(f) {
  const a = ['a_cloth', 'a_cloth', 'a_leather', 'a_leather', 'a_chain', 'a_chain', 'a_chain', 'a_plate', 'a_plate', 'a_plate', 'a_mithril', 'a_mithril', 'a_mithril', 'a_dragon', 'a_dragon', 'a_dragon'];
  return a[Math.min(15, Math.max(0, f))];
}

function simPlayer(floor) {
  const lvl = Math.max(1, Math.min(15, floor));
  const p = {
    name: 'sim', x: 0, y: 0, anim: null, lunge: null,
    baseMaxHp: 50 + (lvl - 1) * 6,
    baseMaxMp: 20 + (lvl - 1) * 3,
    baseAtk: 3 + (lvl - 1),
    baseDef: Math.floor(lvl / 2),
    hp: 0, mp: 0, maxHp: 0, maxMp: 0,
    atk: 0, def: 0, acc: 85, eva: 5, crit: 5,
    level: lvl, xp: 0, gold: 50, kills: 0,
    inv: [], equip: { weapon: null, armor: Items.mk(simArmorForFloor(floor)), trinket: null },
    statuses: [], flags: {},
  };
  const wid = simWeaponForFloor(floor);
  if (wid) p.equip.weapon = Items.mk(wid);
  p.hp = p.baseMaxHp; p.mp = p.baseMaxMp;
  p.heal = function (n) { this.hp = Math.min(this.maxHp, this.hp + n); };
  p.gainMp = function (n) { this.mp = Math.min(this.maxMp, this.mp + n); };
  p.inv.push(Items.mk('p_hp_s', 3));
  return p;
}

function simRecalc(p) {
  const b = Items.eqBonus(p.equip);
  const bb = Boons.bonus(p);
  p.atk = p.baseAtk + b.atk + bb.atk;
  p.def = p.baseDef + b.def + bb.def;
  p.acc = 85 + b.acc + bb.acc;
  p.eva = 5 + b.eva + bb.eva;
  p.crit = 5 + b.crit + bb.crit;
  p.maxHp = Math.max(10, Math.round((p.baseMaxHp + bb.hp) * (1 + (bb.flag.hpPct || 0))));
  p.maxMp = p.baseMaxMp + b.mp;
  p.flags = Object.assign({}, b.flag, bb.flag);
}
function simApplyEquip(p, it) {
  const d = ITEMS[it.id];
  const slot = d.kind === 'armor' ? 'armor' : (d.kind === 'trinket' ? 'trinket' : 'weapon');
  const score = x => x ? (ITEMS[x.id].atk || 0) * 2 + (ITEMS[x.id].def || 0) * 2 + (ITEMS[x.id].eva || 0) + (ITEMS[x.id].crit || 0) : 0;
  if (score(it) > score(p.equip[slot])) {
    p.equip[slot] = it;
    simRecalc(p);
    return true;
  }
  return false;
}

function simGame(player, level, seed) {
  const g = {
    seed, level, player, floor: level.floor, turn: 0,
    state: 'play', cause: null,
    stats: { kills: 0, damageDealt: 0, taken: 0, turns: 0, goldGained: 0, itemsUsed: 0, casts: 0, chests: 0, takenThisFloor: 0 },
    rng: new RNG(seed + ':combat'),
    msg() {}, toast() {}, shake() {},
    enemiesVisible() { return this.level.enemies.filter(e => e.hp > 0 && FOV.isVisible(this.level, e.x, e.y)); },
    gainGold(n) { this.player.gold += n; this.stats.goldGained += n; },
    gainXp(n) { Combat.gainXp(this, n); },
    recalcStats() { simRecalc(this.player); },
    die(cause) { this.state = 'dead'; this.cause = cause; },
  };
  player.heal = function (n) { this.hp = Math.min(this.maxHp, this.hp + n); };
  player.gainMp = function (n) { this.mp = Math.min(this.maxMp, this.mp + n); };
  simRecalc(player);
  return g;
}

// ---------- 1. 地图生成 ----------
simLog('\n=== 1. 地图生成检查 (2 seeds × 20 层) ===');
let simBlockedFloor = 0;
for (const seed of ['SMOKE-A', 'SMOKE-B']) {
  for (let f = 1; f <= 20; f++) {
    let L;
    try { L = MapGen.generate(seed, f); }
    catch (e) { simAssert(false, `${seed} F${f}: 生成抛异常 ${e.message}`); continue; }
    const dist = L.reachable(L.spawn.x, L.spawn.y);
    const sk = L.stairsY * L.w + L.stairsX;
    simAssert(dist[sk] !== -1, `${seed} F${f}: 楼梯不可达`);
    simAssert(L.walkable(L.spawn.x, L.spawn.y), `${seed} F${f}: 出生点不可走`);
    for (const e of L.enemies) simAssert(L.walkable(e.x, e.y), `${seed} F${f}: 敌人在墙里 ${e.id}`);
    for (const it of L.items) simAssert(L.inBounds(it.x, it.y) && !Tiles.blocksMove(L.tile(it.x, it.y)), `${seed} F${f}: 物品位置非法 ${it.id}`);
    const path = Path.aStar(L, L.spawn.x, L.spawn.y, L.stairsX, L.stairsY, {
      passFn: (x, y) => L.walkable(x, y) || L.tile(x, y) === T.DOOR_C,
      occupied: (x, y) => !!L.enemyAt(x, y),
    });
    const pathFree = Path.aStar(L, L.spawn.x, L.spawn.y, L.stairsX, L.stairsY, {
      passFn: (x, y) => L.walkable(x, y) || L.tile(x, y) === T.DOOR_C,
    });
    simAssert(pathFree !== null, `${seed} F${f}: A* 无法到达楼梯`);
    if (!path) simBlockedFloor++;
    if (f === 5 || f === 10 || f === 15) {
      const boss = L.enemies.find(e => e.boss);
      simAssert(!!boss, `${seed} F${f}: 缺少 Boss`);
      if (boss) simAssert(Util.cdist(boss.x, boss.y, L.spawn.x, L.spawn.y) >= 4, `${seed} F${f}: Boss 离出生点太近`);
    }
    if (f === 3 || f === 6 || f === 9 || f === 12) {
      simAssert(L.items.some(it => it.price), `${seed} F${f}: 强制商店层没有商品`);
    }
  }
}
simLog(`地图生成检查完成 (敌人堵住唯一通路的层数: ${simBlockedFloor}/40 — 可击杀通过, 不算软锁)`);

// ---------- 2. FOV ----------
simLog('\n=== 2. FOV 检查 ===');
{
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const L = MapGen.generate('FOV-' + i, (i % 15) + 1);
    FOV.compute(L, L.spawn.x, L.spawn.y, 8);
    simAssert(L.visible[L.spawn.y * L.w + L.spawn.x] === 1, 'FOV: 出生点自身不可见');
    let cnt = 0;
    for (let k = 0; k < L.visible.length; k++) cnt += L.visible[k];
    simAssert(cnt > 10, 'FOV: 可见格过少 ' + cnt);
    total += cnt;
  }
  simLog('平均可见格数:', Math.round(total / 30));
}

// ---------- 3. 1v1 战斗采样 ----------
simLog('\n=== 3. 1v1 战斗采样 (每项 300 场) ===');
function simFight(p, e, rng) {
  const L = { floor: 1, enemies: [], items: [], golds: [] };
  const g = simGame(p, L, 'fight');
  let rounds = 0;
  while (p.hp > 0 && e.hp > 0 && rounds < 300) {
    rounds++;
    Combat.playerAttack(g, e);
    if (e.hp <= 0) break;
    if (e.ranged && rng.chance(0.5)) Combat.enemyRanged(g, e);
    else Combat.enemyAttack(g, e);
    Status.tick(p, g);
  }
  return { win: e.hp <= 0, hp: p.hp, rounds };
}

function simBattleSample(floor, enemyId, n) {
  let wins = 0, hpSum = 0, roundsSum = 0;
  for (let i = 0; i < n; i++) {
    const p = simPlayer(floor);
    const e = Enemies.mk(enemyId, floor, new RNG('e' + i));
    const r = simFight(p, e, new RNG('r' + i + floor));
    if (r.win) { wins++; hpSum += r.hp / p.maxHp; roundsSum += r.rounds; }
  }
  return { rate: wins / n, hp: wins ? hpSum / wins : 0, rounds: wins ? roundsSum / wins : 0 };
}

const roster = [
  [1, 'rat'], [1, 'bat'], [2, 'spider'], [4, 'snake'], [5, 'zombie'], [5, 'skeleton'],
  [7, 'ghost'], [8, 'imp'], [9, 'wisp'], [11, 'mage'], [12, 'scorpion'], [13, 'drake'],
];
for (const [f, id] of roster) {
  const r = simBattleSample(f, id, 300);
  simLog(`F${String(f).padStart(2)} ${ENEMIES[id].name.padEnd(4)} 胜率 ${(r.rate * 100).toFixed(1)}%  余血 ${(r.hp * 100).toFixed(0)}%  回合 ${r.rounds.toFixed(1)}`);
}
simLog('-- Boss --');
for (const [f, id] of [[5, 'boss_butcher'], [10, 'boss_king'], [15, 'boss_dragon']]) {
  const r = simBattleSample(f, id, 200);
  simLog(`F${f} ${ENEMIES[id].name} 胜率 ${(r.rate * 100).toFixed(1)}%  余血 ${(r.hp * 100).toFixed(0)}%  回合 ${r.rounds.toFixed(1)}`);
}

// ---------- 4. 整局自动游玩 ----------
simLog('\n=== 4. 整局自动游玩 (探索型bot: 拾取/购物/技能/药水, 5 seeds) ===');
function eqScore(x) {
  if (!x) return 0;
  const d = ITEMS[x.id];
  return (d.atk || 0) * 2 + (d.def || 0) * 2 + (d.eva || 0) + (d.crit || 0) + (d.acc || 0) * 0.5 + (d.mp || 0) * 0.3;
}
function slotOf(it) {
  const k = ITEMS[it.id].kind;
  return k === 'armor' ? 'armor' : (k === 'trinket' ? 'trinket' : 'weapon');
}
function botPotion(g, threshold) {
  const p = g.player;
  if (p.hp / p.maxHp > threshold) return false;
  let idx = p.inv.findIndex(it => it.id === 'p_hp_l');
  if (idx < 0) idx = p.inv.findIndex(it => it.id === 'p_hp_s');
  if (idx < 0) return false;
  const it = p.inv[idx];
  ITEMS[it.id].onUse(g, it);
  it.count = (it.count || 1) - 1;
  if (it.count <= 0) p.inv.splice(idx, 1);
  return true;
}
function botPickup(g) {
  const L = g.level, p = g.player;
  const gi = L.golds.findIndex(gd => gd.x === p.x && gd.y === p.y);
  if (gi >= 0) { g.gainGold(L.golds[gi].n); L.golds.splice(gi, 1); }
  for (const it of L.itemsAt(p.x, p.y).slice()) {
    const idx = L.items.indexOf(it);
    if (idx < 0) continue;
    const consumable = ['p_hp_s', 'p_hp_l', 'p_mp', 'p_cure', 'p_str', 'p_shield', 's_fire', 's_frost', 's_bolt', 's_tele', 's_map'].includes(it.id);
    if (it.price) {
      const worth = Items.isEq(it) ? eqScore(it) > eqScore(p.equip[slotOf(it)]) : (consumable && p.inv.length < 10 && p.gold > it.price * 3);
      if (p.gold >= it.price && worth) {
        p.gold -= it.price;
        L.items.splice(idx, 1);
        delete it.price;
        if (Items.isEq(it)) simApplyEquip(p, it);
        else p.inv.push(it);
      }
      continue;
    }
    L.items.splice(idx, 1);
    if (Items.isEq(it)) simApplyEquip(p, it);
    else if (consumable && p.inv.length < 10) p.inv.push(it);
  }
}
function botMove(g, tx, ty) {
  const L = g.level, p = g.player;
  const path = Path.aStar(L, p.x, p.y, tx, ty, {
    passFn: (x, y) => L.walkable(x, y) || L.tile(x, y) === T.DOOR_C,
    occupied: (x, y) => (x === p.x && y === p.y) ? false : !!L.enemyAt(x, y),
  });
  if (!path || !path.length) return false;
  const n = path[0];
  if (L.enemyAt(n.x, n.y)) return false;
  if (L.tile(n.x, n.y) === T.DOOR_C) L.set(n.x, n.y, T.DOOR_O);
  p.x = n.x; p.y = n.y;
  return true;
}
function botFindUnexplored(g) {
  const L = g.level, p = g.player, w = L.w, h = L.h;
  const dist = new Int16Array(w * h).fill(-1);
  const start = p.y * w + p.x;
  dist[start] = 0;
  const q = [start];
  let best = -1, bestD = Infinity;
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi], x = k % w, y = (k / w) | 0;
    if (dist[k] >= bestD) continue;
    for (const [dx, dy] of Util.DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nk = ny * w + nx;
      if (dist[nk] !== -1) continue;
      const t = L.tiles[nk];
      if (Tiles.blocksMove(t) && t !== T.DOOR_C) continue;
      dist[nk] = dist[k] + 1;
      if (!L.explored[nk]) {
        if (dist[nk] < bestD) { bestD = dist[nk]; best = nk; }
        continue;
      }
      q.push(nk);
    }
  }
  return best < 0 ? null : { x: best % w, y: (best / w) | 0 };
}
function botSkill(g, vis) {
  const p = g.player;
  if (p.level >= 6 && p.mp >= 18 && vis.length >= 2) {
    p.mp -= 18;
    for (const e of vis) { Status.add(e, 'frozen', 3, 1); Combat.hurtEnemy(g, e, 10 + p.level, { type: 'ice' }); }
    return true;
  }
  if (p.level >= 4 && p.mp >= 15 && (vis.length >= 2 || p.hp < p.maxHp * 0.55)) {
    p.mp -= 15;
    for (const t of vis.slice(0, 3)) Combat.hurtEnemy(g, t, 14 + p.level, { type: 'lightning' });
    return true;
  }
  if (p.level >= 1 && p.mp >= 8 && vis.length && (vis[0].maxHp > p.atk * 2 || vis.length >= 2)) {
    p.mp -= 8;
    Combat.hurtEnemy(g, vis[0], 12 + p.level, { type: 'fire' });
    return true;
  }
  return false;
}

function simulateRun(seed, strong) {
  const p = simPlayer(1);
  if (strong) {
    // 模拟"熟练玩家"强度: 更好装备决策/资源管理的等效增益
    p.baseMaxHp = Math.round(p.baseMaxHp * 1.5);
    p.baseMaxMp = Math.round(p.baseMaxMp * 1.5);
    p.baseAtk += 2;
    p.baseDef += 1;
    p.hp = p.baseMaxHp;
    simRecalc(p);
    p.hp = p.maxHp; p.mp = p.maxMp;
  }
  let floor = 1, turns = 0;
  const trail = [];
  while (floor <= 15 && p.hp > 0) {
    const L = MapGen.generate(seed, floor);
    p.x = L.spawn.x; p.y = L.spawn.y;
    const g = simGame(p, L, seed + ':' + floor);
    g.floor = floor;
    simRecalc(p);
    p.inv.push(Items.mk('p_hp_s', strong ? 5 : 2));
    // 祝福: 模拟玩家每层三选一 (每层净得约 2 个)
    for (let b = 0; b < 2; b++) {
      const bid = Boons.sample(g.rng, 1)[0];
      Boons.give(p, bid);
    }
    simRecalc(p);
    // 定位本层设施
    let fountainPos = null, chestPos = null;
    for (let i = 0; i < L.tiles.length; i++) {
      const t = L.tiles[i];
      if (t === T.FOUNTAIN) fountainPos = { x: i % L.w, y: (i / L.w) | 0 };
      if (t === T.CHEST) chestPos = { x: i % L.w, y: (i / L.w) | 0 };
    }
    let local = 0, cleared = false;
    let bossMinFrac = 1, startHp = p.hp, startPots = p.inv.filter(it => it.id === 'p_hp_s' || it.id === 'p_hp_l').reduce((a, it) => a + (it.count || 1), 0);
    while (local < 2000 && p.hp > 0 && !cleared) {
      local++; turns++; g.turn++;
      const r = L.theme.radius + (p.flags.farSight || 0);
      FOV.compute(L, p.x, p.y, r);
      botPickup(g);
      // Boss 血量埋点
      for (const e of L.enemies) if (e.boss && e.hp > 0) bossMinFrac = Math.min(bossMinFrac, e.hp / e.maxHp);
      const vis = g.enemiesVisible();
      const threatened = vis.length > 0;

      // 泉水和宝箱 (无敌人时)
      const here = L.tile(p.x, p.y);
      if (here === T.FOUNTAIN && !L.fountainUsed) {
        L.fountainUsed = true; L.set(p.x, p.y, T.FLOOR);
        p.hp = p.maxHp; p.mp = p.maxMp;
        continue;
      }
      if (chestPos && !L.chest.opened && Util.cdist(p.x, p.y, chestPos.x, chestPos.y) <= 1) {
        L.chest.opened = true; L.set(chestPos.x, chestPos.y, T.FLOOR);
        const goldN = 25 + floor * 8 + 10;
        p.gold += goldN;
        const eq = Items.randomItem(g.rng, floor + 1, { eq: true });
        simApplyEquip(p, eq);
        continue;
      }

      if (botPotion(g, threatened ? 0.62 : 0.82) && !threatened) {
        // 脱战喝药补状态
      } else if (threatened && p.level >= 2 && p.hp / p.maxHp < 0.45 && p.mp >= 12) {
        p.mp -= 12;
        p.hp = Math.min(p.maxHp, p.hp + 15 + 3 * p.level);
      } else if (threatened && p.hp / p.maxHp < 0.2 && !p.inv.some(it => it.id === 'p_hp_s' || it.id === 'p_hp_l')) {
        // 濒死无药: 后撤
        const t = vis[0];
        let best = null, bestScore = Util.cdist(p.x, p.y, t.x, t.y);
        for (const [dx, dy] of Util.DIRS8) {
          const nx = p.x + dx, ny = p.y + dy;
          if (!L.walkable(nx, ny) || L.enemyAt(nx, ny)) continue;
          let score = Infinity;
          for (const e of vis) score = Math.min(score, Util.cdist(nx, ny, e.x, e.y));
          if (score > bestScore) { bestScore = score; best = { x: nx, y: ny }; }
        }
        if (best) { p.x = best.x; p.y = best.y; }
        else Combat.playerAttack(g, t);
      } else if (threatened && p.mp > p.maxMp * 0.30 && botSkill(g, vis)) {
        // 放技能
      } else if (threatened) {
        const t = vis.sort((a, b) => Util.dist2(a.x, a.y, p.x, p.y) - Util.dist2(b.x, b.y, p.x, p.y))[0];
        if (Util.cdist(p.x, p.y, t.x, t.y) <= 1) Combat.playerAttack(g, t);
        else botMove(g, t.x, t.y);
      } else {
        // 状态不好且泉水还在 → 先去喝
        if (fountainPos && !L.fountainUsed && (p.hp < p.maxHp * 0.75 || floor === 5 || floor === 10 || floor === 15)) {
          botMove(g, fountainPos.x, fountainPos.y);
        } else {
          const goal = botFindUnexplored(g);
          if (goal) botMove(g, goal.x, goal.y);
          else if (p.x === L.stairsX && p.y === L.stairsY) cleared = true;
          else botMove(g, L.stairsX, L.stairsY);
        }
      }

      // 敌人回合
      if (p.hp > 0) {
        for (const e of [...L.enemies]) {
          if (p.hp <= 0) break;
          if (e.hp > 0) AI.act(g, e);
        }
        Status.tick(p, g);
        for (const e of [...L.enemies]) if (e.hp > 0) Status.tick(e, g);
        if (p.flags.regen && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 1);
      }
      botPickup(g);
    }
    let exploredFloors = 0, totalFloors = 0;
    for (let i = 0; i < L.explored.length; i++) {
      if (!Tiles.blocksMove(L.tiles[i])) { totalFloors++; if (L.explored[i]) exploredFloors++; }
    }
    const exploredPct = Math.round(exploredFloors / Math.max(1, totalFloors) * 100);
    trail.push({ floor, hp: Math.round(p.hp), startHp: Math.round(startHp), pots: startPots, lvl: p.level, kills: p.kills, exp: exploredPct, cleared, bossMin: Math.round(bossMinFrac * 100) });
    if (p.hp <= 0) break;
    if (!cleared) break;
    floor++;
  }
  return { seed, floor, dead: p.hp <= 0, hp: Math.max(0, Math.round(p.hp)), level: p.level, kills: p.kills, turns, trail, won: floor > 15 };
}

let simWins = 0;
for (const seed of ['RUN-A', 'RUN-B', 'RUN-C', 'RUN-D', 'RUN-E']) {
  const r = simulateRun(seed);
  if (r.won) simWins++;
  simLog(`seed ${seed}: ${r.won ? '🏆 通关!' : '到达 F' + r.floor + (r.dead ? ' (死亡)' : '')} · Lv${r.level} · 击杀 ${r.kills} · 回合 ${r.turns}`);
  simLog('   ' + r.trail.map(t => `F${t.floor}(HP${t.startHp}→${t.hp},Lv${t.lvl},药${t.pots},${t.exp}%,boss${t.bossMin}%)`).join(' → '));
}
simLog(`通关 ${simWins}/5`);

// 熟练玩家强度验证
simLog('\n=== 4b. 熟练玩家强度档 (验证 15 层通关链路) ===');
for (const seed of ['PRO-A', 'PRO-B', 'PRO-C']) {
  const r = simulateRun(seed, true);
  if (r.won) simWins++;
  simLog(`seed ${seed}: ${r.won ? '🏆 通关!' : '到达 F' + r.floor + (r.dead ? ' (死亡)' : '')} · Lv${r.level} · 击杀 ${r.kills} · 回合 ${r.turns}`);
  simLog('   ' + r.trail.map(t => `F${t.floor}(HP${t.startHp}→${t.hp},Lv${t.lvl},药${t.pots},boss${t.bossMin}%)`).join(' → '));
}

// ---------- 4c. 新系统: 词条 / 祝福 / 天赋 / 精英 / 伏击房 ----------
simLog('\n=== 4c. 新系统检查 (词条/祝福/天赋/精英/伏击) ===');
{
  // 词条生成 (仅统计装备类掉落)
  const rngA = new RNG('affix-test');
  let eqPicks = 0, withAffix = 0;
  for (let i = 0; i < 300; i++) {
    const it = Items.randomItem(rngA, 8, { eq: true });
    const k = ITEMS[it.id].kind;
    if (k === 'weapon' || k === 'armor' || k === 'trinket') {
      eqPicks++;
      if (it.affixes && it.affixes.length) withAffix++;
    }
  }
  simAssert(eqPicks > 50, `词条: 300 次抽取仅 ${eqPicks} 件装备`);
  simAssert(withAffix >= eqPicks * 0.9, `词条: 装备覆盖率 ${withAffix}/${eqPicks} (8 层应 ≥90%)`);
  simLog(`装备词条覆盖率 (F8): ${withAffix}/${eqPicks}`);
  const it2 = Items.mkLoot('w_iron', new RNG('ax'), 9);
  simAssert(it2.affixes && it2.affixes.length >= 1, 'mkLoot: 9 层装备应至少 1 词条');
  simLog('词条名示例: ' + Affixes.displayName(it2));

  // 祝福
  const picks = Boons.sample(new RNG('boon'), 3);
  simAssert(picks.length === 3 && new Set(picks).size === 3, '祝福: 三选一应不重复');
  const dummy = { boons: {}, baseMaxHp: 50, baseMaxMp: 20, baseAtk: 3, baseDef: 0, equip: {} };
  Boons.give(dummy, 'might'); Boons.give(dummy, 'might'); Boons.give(dummy, 'vigor');
  const bb = Boons.bonus(dummy);
  simAssert(bb.atk === 4 && bb.hp === 12, `祝福叠加: atk=${bb.atk} hp=${bb.hp} (期望 4/12)`);

  // 局外天赋
  Meta.data.shards = 1000;
  simAssert(Meta.buyTalent('t_hp1') === true, '天赋: 应能购买 t_hp1');
  simAssert(Meta.buyTalent('t_hp2') === true, '天赋: 前置满足后应能购买 t_hp2');
  simAssert(Meta.data.talents.t_hp1 === 1 && Meta.data.talents.t_hp2 === 1, '天赋: 等级记录');
  const tp = { baseMaxHp: 50, baseMaxMp: 20, baseAtk: 3, hp: 50, mp: 20, baseDef: 0, gold: 0, inv: [], equip: { weapon: null, armor: null, trinket: null }, statuses: [] };
  Talents.apply(tp, Meta.data.talents);
  simAssert(tp.baseMaxHp === 70, `天赋: 生命 +20 应生效 (${tp.baseMaxHp})`);
  simAssert(Meta.data.shards < 1000, '天赋: 购买应扣魂晶');
  Meta.data.shards = 0; Meta.data.talents = {}; // 还原, 不影响后续

  // 精英怪
  let eliteSeen = 0, totalE = 0;
  for (const seed of ['ELITE-A', 'ELITE-B']) {
    for (let f = 2; f <= 10; f++) {
      const L = MapGen.generate(seed, f);
      for (const e of L.enemies) { totalE++; if (e.elite) eliteSeen++; }
    }
  }
  simAssert(eliteSeen > 0, `精英: 18 层 ${totalE} 只敌人中未出现精英`);
  simLog(`精英出现率: ${eliteSeen}/${totalE} (${(eliteSeen / Math.max(1, totalE) * 100).toFixed(1)}%)`);

  // 伏击房
  let ambushFloors = 0;
  for (const seed of ['AMB-A', 'AMB-B']) {
    for (let f = 1; f <= 15; f++) {
      const L = MapGen.generate(seed, f);
      simAssert(Array.isArray(L.ambushRooms), `${seed} F${f}: ambushRooms 缺失`);
      for (const r of L.ambushRooms) {
        simAssert(r.w * r.h >= 16, '伏击房: 面积过小');
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) {
            const t = L.tile(x, y);
            simAssert(t !== T.STAIRS && t !== T.CHEST && t !== T.FOUNTAIN && t !== T.ALTAR && t !== T.SHOPKEEP,
              `${seed} F${f}: 伏击房包含特殊设施 ${t}`);
          }
        }
      }
      if (L.ambushRooms.length) ambushFloors++;
    }
  }
  simLog(`含伏击房的层数: ${ambushFloors}/30`);

  // 新敌人 + 挑战因子
  const chal = { hpMul: 1.4, atkMul: 1.4, defAdd: 2, rewardMul: 2 };
  const eb = Enemies.mk('boar', 3, new RNG('e1'));
  const eh = Enemies.mk('healer', 5, new RNG('e2'));
  const ec = Enemies.mk('crab', 7, new RNG('e3'));
  const ec2 = Enemies.mk('crab', 7, new RNG('e4'), { chal, elite: true });
  simAssert(eb.ai === 'charger' && eh.ai === 'healer' && ec.def === 5, '新敌人: 定义异常');
  simAssert(ec2.maxHp > ec.maxHp * 2 && ec2.atk > ec.atk && ec2.def === 8, '挑战+精英: 倍率未生效 (防=挑战+2+精英+1)');

  // v2.1: 新武器 / 诅咒祝福 / 每日种子
  simAssert(ITEMS['w_bow3'].flag && ITEMS['w_bow3'].flag.pierceLine
    && ITEMS['w_wand3'].flag && ITEMS['w_wand3'].flag.chain === 2
    && ITEMS['w_xbow1'].sub === 'scatter', 'v2.1 新武器: 定义异常');
  let cursedSeen = 0;
  for (let i = 0; i < 60; i++) {
    const picks = Boons.sample(new RNG('cs' + i), 3);
    if (picks.some(id => BOONS[id] && BOONS[id].cursed)) cursedSeen++;
  }
  simAssert(cursedSeen >= 10 && cursedSeen <= 45, `诅咒: 60 次三选一出现 ${cursedSeen} 次诅咒卡 (期望约 24)`);
  simLog(`诅咒卡出现率: ${cursedSeen}/60`);
  const ct = { boons: {}, baseMaxHp: 100, baseMaxMp: 20, baseAtk: 3, baseDef: 0, statuses: [] };
  Boons.give(ct, 'titan');
  Boons.give(ct, 'blood_pact');
  const cbb = Boons.bonus(ct);
  simAssert(cbb.def === 6 && cbb.eva === -25 && cbb.crit === 25 && cbb.flag.hpPct === -0.15, '诅咒: 属性汇总异常');
  const d1 = MapGen.generate('DAILY-2026-11-14', 3);
  const d2 = MapGen.generate('DAILY-2026-11-14', 3);
  let dailySame = true;
  for (let i = 0; i < d1.tiles.length; i++) if (d1.tiles[i] !== d2.tiles[i]) { dailySame = false; break; }
  simAssert(dailySame, '每日种子: 同 seed 两次生成不一致');
  simLog(`精英+挑战岩蟹: HP ${ec.maxHp} → ${ec2.maxHp}, 攻 ${ec.atk} → ${ec2.atk}, 防 ${ec.def} → ${ec2.def}`);
}

// ---------- 5. 存档往返 ----------
simLog('\n=== 5. 存档往返检查 ===');
{
  const L = MapGen.generate('SAVE-TEST', 4);
  const p = simPlayer(4);
  p.x = L.spawn.x; p.y = L.spawn.y;
  const g = simGame(p, L, 'SAVE-TEST');
  g.seed = 'SAVE-TEST'; g.floor = 4; g.turn = 42;
  g.stats.taken = 13;
  FOV.compute(L, p.x, p.y, 8);
  const okSave = SaveSys.save(g);
  simAssert(okSave, '存档失败');
  const d = SaveSys.load();
  simAssert(!!d, '读档失败');
  if (d) {
    simAssert(JSON.stringify(Array.from(d.levelObj.tiles)) === JSON.stringify(Array.from(L.tiles)), '存档: tiles 不一致');
    simAssert(JSON.stringify(Array.from(d.levelObj.explored)) === JSON.stringify(Array.from(L.explored)), '存档: explored 不一致');
    simAssert(d.levelObj.enemies.length === L.enemies.length, '存档: 敌人数不一致');
    simAssert(d.player.x === p.x && d.player.y === p.y, '存档: 玩家坐标不一致');
    simAssert(d.turn === 42 && d.floor === 4, '存档: 回合/层数不一致');
    simAssert(d.player.inv.length === p.inv.length, '存档: 背包不一致');
  }
}

simLog('\n=== 结果 ===');
if (simFailures === 0) simLog('✅ 全部检查通过');
else simLog(`❌ ${simFailures} 项失败`);
process.exitCode = simFailures === 0 ? 0 : 1;
