// ===== 数值网格搜索 (在打包作用域内运行) =====

const bLog = (...a) => console.log(...a);

// ---- 玩家构造 (与 sim-body 一致) ----
function bWeapon(floor) {
  const w = [null, null, 'w_iron', 'w_iron', 'w_axe', 'w_axe', 'w_knight', 'w_knight', 'w_rune', 'w_rune', 'w_rune', 'w_rune', 'w_rune', 'w_demon', 'w_demon', 'w_demon'];
  return w[Math.min(15, Math.max(0, floor))] || null;
}
function bArmor(floor) {
  const a = ['a_cloth', 'a_cloth', 'a_leather', 'a_leather', 'a_chain', 'a_chain', 'a_chain', 'a_plate', 'a_plate', 'a_plate', 'a_mithril', 'a_mithril', 'a_mithril', 'a_dragon', 'a_dragon', 'a_dragon'];
  return a[Math.min(15, Math.max(0, floor))];
}
function bRecalc(p) {
  const b = Items.eqBonus(p.equip);
  p.atk = p.baseAtk + b.atk;
  p.def = p.baseDef + b.def;
  p.acc = 85 + b.acc;
  p.eva = 5 + b.eva;
  p.crit = 5 + b.crit;
  p.maxHp = p.baseMaxHp;
  p.maxMp = p.baseMaxMp + b.mp;
  p.flags = b.flag || {};
}
function bPlayer(floor) {
  const lvl = Util.clamp(floor, 1, 15);
  const p = {
    name: 'sim', x: 0, y: 0, anim: null, lunge: null,
    baseMaxHp: 50 + (lvl - 1) * 6,
    baseMaxMp: 20 + (lvl - 1) * 3,
    baseAtk: 3 + (lvl - 1),
    baseDef: Math.floor(lvl / 2),
    hp: 0, mp: 0, maxHp: 0, maxMp: 0,
    atk: 0, def: 0, acc: 85, eva: 5, crit: 5,
    level: lvl, xp: 0, gold: 50, kills: 0,
    inv: [], equip: { weapon: null, armor: Items.mk(bArmor(floor)), trinket: null },
    statuses: [], flags: {},
  };
  const wid = bWeapon(floor);
  if (wid) p.equip.weapon = Items.mk(wid);
  p.inv.push(Items.mk('p_hp_s', 3));
  p.heal = function (n) { this.hp = Math.min(this.maxHp, this.hp + n); };
  p.gainMp = function (n) { this.mp = Math.min(this.maxMp, this.mp + n); };
  bRecalc(p);
  p.hp = p.maxHp; p.mp = p.maxMp;
  return p;
}
function bGame(p, floor, seed) {
  return {
    seed, level: { floor, enemies: [], items: [], golds: [] }, player: p,
    floor, turn: 0, state: 'play', cause: null,
    stats: { kills: 0, damageDealt: 0, taken: 0, turns: 0, goldGained: 0, itemsUsed: 0, casts: 0, chests: 0, takenThisFloor: 0 },
    rng: new RNG(seed), msg() {}, toast() {}, shake() {},
    enemiesVisible() { return []; },
    gainGold(n) { this.player.gold += n; },
    gainXp(n) { Combat.gainXp(this, n); },
    recalcStats() { bRecalc(this.player); },
    die(cause) { this.state = 'dead'; this.cause = cause; },
  };
}

// ---- 普通敌人 1v1 (不用药水) ----
function bFight(p, e, rng) {
  const g = bGame(p, 1, 'f');
  let rounds = 0;
  while (p.hp > 0 && e.hp > 0 && rounds < 200) {
    rounds++;
    Combat.playerAttack(g, e);
    if (e.hp <= 0) break;
    if (e.ranged && rng.chance(0.5)) Combat.enemyRanged(g, e);
    else Combat.enemyAttack(g, e);
    Status.tick(p, g);
  }
  return { win: e.hp <= 0, hp: p.hp, maxHp: p.maxHp };
}
function bSample(floor, id, n) {
  let wins = 0, hpSum = 0;
  for (let i = 0; i < n; i++) {
    const p = bPlayer(floor);
    const e = Enemies.mk(id, floor, new RNG('e' + i + floor));
    const r = bFight(p, e, new RNG('r' + i));
    if (r.win) { wins++; hpSum += r.hp / r.maxHp; }
  }
  return { rate: wins / n, hp: wins ? hpSum / wins : 0 };
}

// ---- Boss (带药水/火球) ----
function bBossFight(floor, id, n) {
  let wins = 0, hpSum = 0;
  for (let i = 0; i < n; i++) {
    const p = bPlayer(floor);
    const g = bGame(p, floor, 'boss' + i);
    const e = Enemies.mk(id, floor, new RNG('b' + i));
    e.atk = Math.round(e.atk * 1.3); // 近似 Boss 特殊技能 (冲锋/死光/吐息) 的额外压力
    let rounds = 0;
    while (p.hp > 0 && e.hp > 0 && rounds < 500) {
      rounds++;
      // 治疗技能优先, 否则喝药
      if (p.hp / p.maxHp < 0.42 && p.level >= 2 && p.mp >= 12) {
        p.mp -= 12;
        p.hp = Math.min(p.maxHp, p.hp + 15 + 3 * p.level);
      } else if (p.hp / p.maxHp < 0.5) {
        const it = p.inv.find(x => x.id === 'p_hp_s' && x.count > 0);
        if (it) {
          ITEMS[it.id].onUse(g, it);
          it.count--;
          if (it.count <= 0) p.inv.splice(p.inv.indexOf(it), 1);
        }
      }
      if (p.mp >= 8 && e.hp > p.atk * 2) {
        p.mp -= 8;
        Combat.hurtEnemy(g, e, 12 + p.level, { type: 'fire' });
      } else {
        Combat.playerAttack(g, e);
      }
      if (e.hp <= 0) break;
      if (e.ranged) Combat.enemyRanged(g, e);
      else Combat.enemyAttack(g, e);
      Status.tick(p, g);
    }
    if (e.hp <= 0) { wins++; hpSum += p.hp / p.maxHp; }
  }
  return { rate: wins / n, hp: wins ? hpSum / wins : 0 };
}

// ---- 1. 普通敌人难度网格 ----
bLog('\n=== 1. 普通敌人难度网格 (1v1 无药水) ===');
const roster = [
  [1, 'rat'], [1, 'bat'], [2, 'spider'], [4, 'snake'], [5, 'zombie'], [5, 'skeleton'],
  [7, 'ghost'], [8, 'imp'], [9, 'wisp'], [11, 'mage'], [12, 'scorpion'], [13, 'drake'],
];
const grid = [
  { hpDepth: 0.20, atkDepth: 0.12, hpMul: 1.45, atkMul: 1.20 },
  { hpDepth: 0.26, atkDepth: 0.16, hpMul: 1.60, atkMul: 1.35 },
  { hpDepth: 0.30, atkDepth: 0.20, hpMul: 1.75, atkMul: 1.50 },
  { hpDepth: 0.36, atkDepth: 0.24, hpMul: 1.90, atkMul: 1.70 },
];
for (const t of grid) {
  Object.assign(ENEMY_TUNING, t);
  let rateSum = 0, hpSum = 0, cnt = 0;
  const parts = [];
  for (const [f, id] of roster) {
    const r = bSample(f, id, 120);
    rateSum += r.rate; hpSum += r.hp; cnt++;
    parts.push(`${ENEMIES[id].name}:${(r.rate * 100).toFixed(0)}%/${(r.hp * 100).toFixed(0)}%`);
  }
  bLog(`hpD${t.hpDepth} atkD${t.atkDepth} hp×${t.hpMul} atk×${t.atkMul} → 平均胜率 ${(rateSum / cnt * 100).toFixed(1)}% 平均余血 ${(hpSum / cnt * 100).toFixed(0)}%`);
  bLog('   ' + parts.join(' '));
}

// ---- 2. Boss 网格 (固定采用第 3 组普通敌人调参) ----
Object.assign(ENEMY_TUNING, grid[2]);
bLog('\n=== 2. Boss HP/攻击 网格 (带药水+火球+治疗) ===');
const bossCands = {
  boss_butcher: [[180, 12], [165, 12], [160, 13]],
  boss_king: [[430, 16], [440, 15], [420, 17]],
  boss_dragon: [[700, 18], [660, 18], [720, 19]],
};
for (const id of Object.keys(bossCands)) {
  for (const [hp, atk] of bossCands[id]) {
    ENEMIES[id].hp = hp;
    ENEMIES[id].atk = atk;
    const floor = id === 'boss_butcher' ? 5 : (id === 'boss_king' ? 10 : 15);
    const r = bBossFight(floor, id, 150);
    bLog(`${ENEMIES[id].name}: HP${hp} ATK${atk} → 胜率 ${(r.rate * 100).toFixed(1)}% 余血 ${(r.hp * 100).toFixed(0)}%`);
  }
}
