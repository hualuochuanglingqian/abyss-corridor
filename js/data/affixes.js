// ============ AFFIXES: 武器/防具随机词条 ============
// 参考"武器即 Build"的设计: 掉落时附带 0~2 条随机词条, 名字随词条变化。
// stat 类词条在 Items.eqBonus 里汇总; trigger 类词条在 Combat 里触发。

'use strict';

const AFFIXES = {
  // ---- 武器触发类 (flag 由 eqBonus 汇总进玩家 flags, Combat 触发) ----
  burn:   { name: '灼烧', icon: '🔥', pool: 'weapon', flag: { burnOnHit: 0.35 }, desc: '命中 35% 概率点燃敌人 (2 回合)' },
  poison: { name: '毒刃', icon: '☠', pool: 'weapon', flag: { poisonOnHit: 0.4 }, desc: '命中 40% 概率使敌人中毒' },
  chill:  { name: '冰寒', icon: '❄', pool: 'weapon', flag: { chillOnHit: 0.25 }, desc: '命中 25% 概率减速敌人 2 回合' },
  vamp:   { name: '吸血', icon: '🩸', pool: 'weapon', flag: { lifesteal: 0.15 }, desc: '造成伤害的 15% 转化为生命' },
  pierce: { name: '破甲', icon: '🛡', pool: 'weapon', flag: { pierce: true }, desc: '无视目标 50% 防御' },
  combo:  { name: '连击', icon: '⚡', pool: 'weapon', flag: { comboOnHit: 0.25 }, desc: '25% 概率追加一次攻击' },

  // ---- 属性类 (武器/护甲/饰品通用) ----
  sharp:  { name: '锐利', icon: '🗡', pool: 'any', desc: '攻击 +2', stat: { atk: 2 } },
  deadly: { name: '致命', icon: '🎯', pool: 'any', desc: '暴击 +8%', stat: { crit: 8 } },
  swift:  { name: '轻灵', icon: '💨', pool: 'any', desc: '命中 +6, 闪避 +2', stat: { acc: 6, eva: 2 } },
  heavy:  { name: '巨力', icon: '💪', pool: 'any', desc: '攻击 +4, 命中 -6', stat: { atk: 4, acc: -6 } },

  // ---- 护甲类 ----
  tough:  { name: '坚韧', icon: '🪨', pool: 'armor', desc: '防御 +2', stat: { def: 2 } },
  thorns: { name: '棘甲', icon: '🌵', pool: 'armor', desc: '近战攻击你的敌人受 3 点反伤', flag: { thorns: 3 } },
  mana:   { name: '灵纹', icon: '🔮', pool: 'any', desc: '法力上限 +6', stat: { mp: 6 } },

  // ---- 饰品专属 ----
  leech:  { name: '汲取', icon: '🧛', pool: 'trinket', desc: '造成伤害的 10% 转化为生命', flag: { lifesteal: 0.1 } },
};

const Affixes = {
  WEAPON_POOL: ['burn', 'poison', 'chill', 'vamp', 'pierce', 'combo', 'sharp', 'deadly', 'swift', 'heavy'],
  ARMOR_POOL: ['tough', 'thorns', 'mana', 'swift'],
  TRINKET_POOL: ['sharp', 'deadly', 'swift', 'mana', 'leech'],

  def(id) { return AFFIXES[id]; },

  name(id) { return AFFIXES[id] ? AFFIXES[id].name : id; },

  /** 给物品实例生成词条 (返回词条 id 数组) */
  gen(rng, floor, kind, opts) {
    opts = opts || {};
    const pool = kind === 'armor' ? this.ARMOR_POOL
      : kind === 'trinket' ? this.TRINKET_POOL
      : this.WEAPON_POOL;
    // 楼层越深词条越多
    let n = 0;
    const r = rng.next();
    if (floor >= 7) n = r < 0.45 ? 2 : 1;
    else if (floor >= 3) n = r < 0.22 ? 2 : (r < 0.75 ? 1 : 0);
    else n = r < 0.45 ? 1 : 0;
    if (opts.min) n = Math.max(n, opts.min);
    if (opts.max !== undefined) n = Math.min(n, opts.max);
    n = Math.min(n, 2, pool.length);
    const out = [];
    const bag = pool.slice();
    for (let i = 0; i < n; i++) {
      const idx = rng.int(0, bag.length - 1);
      out.push(bag.splice(idx, 1)[0]);
    }
    return out;
  },

  /** 物品全名 (含词条) */
  displayName(it) {
    const d = ITEMS[it.id];
    if (!d || !it.affixes || !it.affixes.length) return d ? d.name : '?';
    return d.name + '·' + it.affixes.map(a => this.name(a)).join('·');
  },
};
