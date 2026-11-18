// ============ ENEMIES: 敌人定义 ============
// speed: 每"玩家回合"的行动次数 (0.5 = 隔回合行动, 2 = 一回合两动)
// ai: chase 追击 / ranged 远程 / ghost 穿墙 / spider 剧蛛 / mage 法师 / bomber 自爆
// drops: [{id, p, n:[min,max]}]

'use strict';

const ENEMIES = {
  rat: {
    name: '巨鼠', glyph: '🐀', color: '#9c8472',
    hp: 8, atk: 2, def: 0, acc: 85, eva: 5, crit: 3, xp: 6, gold: [2, 6], speed: 1,
    ai: 'chase', minF: 1, maxF: 3, weight: 10,
    desc: '深渊里的老鼠, 又肥又凶。',
    drops: [{ id: 'p_hp_s', p: 0.04 }],
  },
  bat: {
    name: '血蝠', glyph: '🦇', color: '#b06a8f',
    hp: 6, atk: 2, def: 0, acc: 80, eva: 15, crit: 3, xp: 7, gold: [2, 7], speed: 2,
    ai: 'chase', minF: 1, maxF: 5, weight: 9,
    desc: '双倍速度的小吸血鬼。',
  },
  spider: {
    name: '巨蛛', glyph: '🕷️', color: '#7a9c4a',
    hp: 10, atk: 3, def: 0, acc: 90, eva: 8, crit: 5, xp: 9, gold: [3, 8], speed: 1,
    ai: 'chase', minF: 1, maxF: 6, weight: 8, flag: { webOnHit: 0.4 },
    desc: '命中会吐丝减速你。',
    drops: [{ id: 'p_cure', p: 0.05 }],
  },
  snake: {
    name: '毒牙蛇', glyph: '🐍', color: '#5fae5f',
    hp: 12, atk: 4, def: 0, acc: 88, eva: 10, crit: 5, xp: 12, gold: [4, 9], speed: 1,
    ai: 'chase', minF: 3, maxF: 8, weight: 8, flag: { poisonOnHit: 0.6 },
    desc: '咬一口, 毒三分。',
    drops: [{ id: 'p_cure', p: 0.08 }],
  },
  skeleton: {
    name: '骷髅兵', glyph: '💀', color: '#c9c4b4',
    hp: 16, atk: 5, def: 1, acc: 88, eva: 3, crit: 5, xp: 14, gold: [5, 12], speed: 1,
    ai: 'chase', minF: 4, maxF: 10, weight: 9,
    desc: '骨头打架不疼——前提是你没骨头。',
    drops: [{ id: 'w_iron', p: 0.05 }, { id: 'a_leather', p: 0.05 }],
  },
  zombie: {
    name: '腐尸', glyph: '🧟', color: '#6f8f5a',
    hp: 24, atk: 6, def: 1, acc: 80, eva: 0, crit: 3, xp: 16, gold: [4, 10], speed: 0.5,
    ai: 'chase', minF: 3, maxF: 9, weight: 8,
    desc: '慢, 但特别扛揍。',
  },
  ghost: {
    name: '幽魂', glyph: '👻', color: '#9db8d9',
    hp: 13, atk: 5, def: 0, acc: 90, eva: 25, crit: 5, xp: 18, gold: [6, 14], speed: 1,
    ai: 'ghost', minF: 4, maxF: 11, weight: 7, flag: { drainMp: 2 },
    desc: '穿墙而过, 触碰吸走你的法力。',
  },
  imp: {
    name: '小恶魔', glyph: '😈', color: '#d96a5a',
    hp: 14, atk: 4, def: 0, acc: 90, eva: 8, crit: 5, xp: 17, gold: [8, 16], speed: 1,
    ai: 'ranged', ranged: { range: 6, dmg: 6, type: 'fire' }, minF: 6, maxF: 12, weight: 8,
    desc: '隔六格扔火球的小混蛋。',
    drops: [{ id: 'p_mp', p: 0.08 }],
  },
  wisp: {
    name: '灯火妖', glyph: '🕯️', color: '#ffb35a',
    hp: 10, atk: 6, def: 0, acc: 92, eva: 12, crit: 5, xp: 19, gold: [6, 15], speed: 1,
    ai: 'chase', minF: 8, maxF: 14, weight: 6, flag: { explodeOnDeath: 9 },
    desc: '死的时候会爆炸, 离远点。',
  },
  mage: {
    name: '邪术师', glyph: '🧙', color: '#a06ad9',
    hp: 15, atk: 7, def: 0, acc: 92, eva: 6, crit: 5, xp: 25, gold: [12, 24], speed: 1,
    ai: 'mage', ranged: { range: 7, dmg: 9, type: 'arcane' }, minF: 8, maxF: 15, weight: 6,
    desc: '被贴近会传送走, 再扔你一法术。',
    drops: [{ id: 's_tele', p: 0.07 }, { id: 'p_mp', p: 0.1 }],
  },
  scorpion: {
    name: '铠蝎', glyph: '🦂', color: '#c9944a',
    hp: 28, atk: 8, def: 3, acc: 90, eva: 4, crit: 8, xp: 30, gold: [10, 22], speed: 1,
    ai: 'chase', minF: 10, maxF: 15, weight: 7, flag: { poisonOnHit: 0.35 },
    desc: '甲壳能弹开刀刃。',
    drops: [{ id: 'p_shield', p: 0.08 }],
  },
  drake: {
    name: '幼龙', glyph: '🐲', color: '#7ad96a',
    hp: 32, atk: 9, def: 2, acc: 90, eva: 4, crit: 8, xp: 38, gold: [14, 30], speed: 1,
    ai: 'ranged', ranged: { range: 5, dmg: 11, type: 'fire' }, minF: 11, maxF: 15, weight: 6,
    flag: { burnImmune: true },
    desc: '龙族幼崽, 会喷火。',
    drops: [{ id: 'p_hp_l', p: 0.1 }, { id: 'gem', p: 0.08 }],
  },
  boar: {
    name: '冲锋野猪', glyph: '🐗', color: '#b0785a',
    hp: 18, atk: 6, def: 0, acc: 85, eva: 0, crit: 5, xp: 13, gold: [5, 11], speed: 1,
    ai: 'charger', minF: 2, maxF: 8, weight: 8,
    desc: '和它站成一条直线, 你会后悔的。',
    drops: [{ id: 'p_hp_s', p: 0.05 }],
  },
  healer: {
    name: '暗影僧', glyph: '🙏', color: '#8f6ad9',
    hp: 14, atk: 3, def: 0, acc: 85, eva: 10, crit: 3, xp: 18, gold: [8, 16], speed: 1,
    ai: 'healer', minF: 4, maxF: 12, weight: 6,
    desc: '不停治疗同伴——优先解决它。',
    drops: [{ id: 'p_mp', p: 0.1 }],
  },
  crab: {
    name: '岩蟹', glyph: '🦀', color: '#d97a5a',
    hp: 34, atk: 6, def: 5, acc: 85, eva: 0, crit: 5, xp: 26, gold: [10, 22], speed: 0.5,
    ai: 'chase', minF: 6, maxF: 13, weight: 6,
    desc: '硬壳弹开刀刃, 带上破甲武器再来。',
    drops: [{ id: 'p_shield', p: 0.08 }],
  },

  // ---------------- Boss ----------------
  boss_butcher: {
    name: '屠夫·格罗', glyph: '👹', color: '#ff5a4a', boss: 1,
    hp: 165, atk: 12, def: 2, acc: 92, eva: 0, crit: 10, xp: 120, gold: [120, 180], speed: 1,
    ai: 'boss_butcher', minF: 5, maxF: 5, weight: 0, flag: { burnImmune: true, knockResist: true },
    desc: '第 5 层的看门人, 会突然冲锋。',
    drops: [{ id: 'w_knight', p: 1 }, { id: 'p_hp_l', p: 1, n: [2, 2] }],
  },
  boss_king: {
    name: '骸骨王', glyph: '☠️', color: '#e8e0c8', boss: 1,
    hp: 430, atk: 16, def: 3, acc: 92, eva: 0, crit: 10, xp: 260, gold: [260, 380], speed: 1,
    ai: 'boss_king', minF: 10, maxF: 10, weight: 0, flag: { poisonImmune: true, knockResist: true },
    desc: '第 10 层的王座之主, 会召唤骷髅、释放死亡之光。',
    drops: [{ id: 'w_rune', p: 1 }, { id: 'a_mithril', p: 0.6 }, { id: 'p_hp_l', p: 1, n: [2, 2] }],
  },
  boss_dragon: {
    name: '深渊之龙', glyph: '🐉', color: '#ff8c3a', boss: 1,
    hp: 700, atk: 18, def: 4, acc: 94, eva: 0, crit: 12, xp: 500, gold: [500, 700], speed: 1,
    ai: 'boss_dragon', minF: 15, maxF: 15, weight: 0,
    flag: { burnImmune: true, frozenImmune: true, knockResist: true },
    desc: '深渊的最终守卫。火焰吐息, 巨翼横扫。',
    drops: [{ id: 'w_demon', p: 1 }, { id: 'a_dragon', p: 1 }],
  },
};

// 全局难度调参 (由仿真工具扫描得出)
const ENEMY_TUNING = {
  hpDepth: 0.34,    // 每高于出现层 1 层, HP 增幅
  atkDepth: 0.24,   // 攻击增幅
  hpMul: 1.35,      // 基础 HP 倍率 (早期宽容)
  atkMul: 1.25,     // 基础攻击倍率
  bossHpMul: 1.0,
  bossAtkMul: 1.0,
};

// 精英词缀 (v2.3): 精英怪随机获得一条, 名字即威胁 — 借鉴 Diablo 精英词缀的"读名知险"
// apply 在 mk() 基础属性生成后调用; flag 合并进敌人 flag (combat.js 消费)
const ELITE_AFFIXES = {
  swift:    { name: '迅捷', icon: '💨', apply(e) { e.speed = Math.min(2.5, e.speed + 0.5); } },
  sturdy:   { name: '坚韧', icon: '🪨', apply(e) { e.maxHp = Math.round(e.maxHp * 1.25); e.hp = e.maxHp; e.def += 3; } },
  blazing:  { name: '灼热', icon: '🔥', apply(e, flag) { flag.burnOnHit = 0.35; } },
  venomous: { name: '剧毒', icon: '☠️', apply(e, flag) { flag.poisonOnHit = 0.5; } },
  vampiric: { name: '虹吸', icon: '🩸', apply(e, flag) { flag.vampiric = 0.5; } },
  thorny:   { name: '荆棘', icon: '🌵', apply(e, flag) { flag.thornArmor = 3 + Math.round(e.level / 4); } },
};

const Enemies = {
  _seq: 1,

  /** 由定义生成实例 (opts: {elite, chal:{hpMul,atkMul,defAdd}}) */
  mk(id, floor, rng, opts) {
    opts = opts || {};
    const d = ENEMIES[id];
    if (!d) throw new Error('unknown enemy: ' + id);
    const e = {
      uid: Enemies._seq++,
      id, name: d.name, glyph: d.glyph, color: d.color, boss: d.boss || 0,
      x: -1, y: -1, ox: 0, oy: 0,
      atk: d.atk, def: d.def, acc: d.acc, eva: d.eva, crit: d.crit,
      speed: d.speed, ai: d.ai, flag: Object.assign({}, d.flag),
      ranged: d.ranged ? Object.assign({}, d.ranged) : null,
      level: floor,
      elite: !!opts.elite,
    };
    // 深度微调: 普通敌人吃全局倍率与深度成长; Boss 用独立倍率 (数值直接调)
    const isBoss = !!d.boss;
    const deep = Math.max(0, floor - (d.minF || 1));
    let hpScale = isBoss
      ? ENEMY_TUNING.bossHpMul * ((opts.chal && opts.chal.bossHpMul) || 1)
      : (1 + deep * ENEMY_TUNING.hpDepth) * ENEMY_TUNING.hpMul;
    let atkScale = isBoss
      ? ENEMY_TUNING.bossAtkMul
      : (1 + deep * ENEMY_TUNING.atkDepth) * ENEMY_TUNING.atkMul;
    // 挑战因子
    if (opts.chal) {
      hpScale *= (opts.chal.hpMul || 1);
      atkScale *= (opts.chal.atkMul || 1);
    }
    // 精英
    if (e.elite) { hpScale *= 2.2; atkScale *= 1.4; }
    e.maxHp = Math.round(d.hp * hpScale);
    e.hp = e.maxHp;
    e.atk = Math.max(1, Math.round(d.atk * atkScale));
    e.def = d.def + (opts.chal && opts.chal.defAdd ? opts.chal.defAdd : 0) + (e.elite ? 1 : 0);
    e.eva += e.elite ? 5 : 0;
    // 精英词缀 (v2.3): 随机获得一条, 名字即威胁
    if (e.elite) {
      const affKey = rng.pick(Object.keys(ELITE_AFFIXES));
      const aff = ELITE_AFFIXES[affKey];
      e.eliteAff = { id: affKey, name: aff.name, icon: aff.icon };
      const affFlag = {};
      aff.apply(e, affFlag);
      Object.assign(e.flag, affFlag);
      e.name = aff.name + '·' + e.name;
    }
    const xMul = (e.elite ? 2.5 : 1) * (opts.chal && opts.chal.rewardMul ? opts.chal.rewardMul : 1);
    e.xp = Math.round(d.xp * (1 + deep * 0.04) * xMul);
    e.gold = d.gold ? [Math.round(d.gold[0] * (1 + deep * 0.04) * xMul), Math.round(d.gold[1] * (1 + deep * 0.06) * xMul)] : null;
    e.drops = d.drops || null;
    e.statuses = [];
    e.cool = 0;          // 通用冷却 (远程/boss 技能)
    e.actAcc = 0;        // 速度累积器
    e.awake = false;     // 是否已察觉玩家
    e.homeX = -1; e.homeY = -1;
    e.summonCd = 0;
    return e;
  },

  /** 按楼层权重抽怪 (无限层按 15 层名册抽取, 强度由 mk 的深度成长负责) */
  pickForFloor(floor, rng, opts) {
    opts = opts || {};
    const rf = Math.min(floor, CONFIG.MAX_FLOOR);
    const pool = [];
    for (const id in ENEMIES) {
      const d = ENEMIES[id];
      if (d.boss) continue;
      if (rf >= d.minF && rf <= d.maxF) pool.push({ v: id, w: d.weight });
    }
    if (!pool.length) pool.push({ v: 'rat', w: 1 });
    return rng.weighted(pool);
  },

  /** 掉落结算, 返回物品 id 数组 */
  rollDrops(e, rng) {
    const out = [];
    if (!e.drops) return out;
    for (const d of e.drops) {
      if (rng.chance(d.p)) {
        const n = d.n ? rng.int(d.n[0], d.n[1]) : 1;
        for (let i = 0; i < n; i++) out.push(d.id);
      }
    }
    return out;
  },
};
