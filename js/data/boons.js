// ============ BOONS: 局内祝福 (每层三选一, 可叠加) ============
// 参考"关卡节点三选一天赋"的构筑节奏: 玩家围绕祝福滚雪球, 形成流派。
// stat 类在 recalcStats 里汇总; trigger 类由 Combat / 主循环挂钩。

'use strict';

const BOONS = {
  might:      { name: '蛮力',   icon: '💪', desc: '攻击 +2', stat: { atk: 2 } },
  vigor:      { name: '铁骨',   icon: '❤️', desc: '生命上限 +12', stat: { hp: 12 } },
  agility:    { name: '敏捷',   icon: '🌀', desc: '闪避 +6', stat: { eva: 6 } },
  eagle:      { name: '鹰眼',   icon: '🦅', desc: '命中 +8, 视野 +1', stat: { acc: 8 }, flag: { farSight: 1 } },
  hunter:     { name: '猎手',   icon: '🎯', desc: '暴击 +8%', stat: { crit: 8 } },
  reaper:     { name: '汲血术', icon: '🩸', desc: '击杀敌人恢复 3 生命', flag: { killHeal: 3 } },
  spring:     { name: '法泉',   icon: '💧', desc: '每回合回复 1 法力', flag: { mpSpring: 1 } },
  thorns:     { name: '荆棘',   icon: '🌵', desc: '近战攻击你的敌人受 3 点反伤', flag: { thorns: 3 } },
  rage:       { name: '狂怒',   icon: '😡', desc: '生命低于 40% 时攻击 +4', flag: { lowHpAtk: 4 } },
  scavenger:  { name: '拾荒者', icon: '💰', desc: '获取金币 +30%', flag: { goldMul: 1.3 } },
  scholar:    { name: '学者',   icon: '📖', desc: '获取经验 +25%', flag: { xpMul: 1.25 } },
  alchemist:  { name: '药剂师', icon: '⚗️', desc: '药水效果 +50%', flag: { potionMul: 1.5 } },
  aegis:      { name: '铁壁',   icon: '🛡', desc: '每层开始时获得 8 点护盾', flag: { floorShield: 8 } },
  ghost:      { name: '残影',   icon: '👤', desc: '闪避 +4, 闪避成功回复 2 法力', stat: { eva: 4 }, flag: { dodgeMp: 2 } },
  slayer:     { name: '破军',   icon: '⚔️', desc: '对 Boss 伤害 +25%', flag: { bossDmgMul: 1.25 } },
  pyromancer: { name: '烈焰亲和', icon: '🔥', desc: '火球术伤害 +60%', flag: { fireMul: 1.6 } },

  // ---- 诅咒祝福: 高风险高收益 (40% 概率混入三选一) ----
  devil:     { name: '恶魔契约', icon: '😈', cursed: true, desc: '攻击 +8; 代价: 每层开始中毒 3 回合', stat: { atk: 8 }, flag: { poisonPerFloor: 3 } },
  blood_pact:{ name: '血誓',     icon: '🩸', cursed: true, desc: '暴击 +25%; 代价: 生命上限 -15%', stat: { crit: 25 }, flag: { hpPct: -0.15 } },
  titan:     { name: '泰坦之诅', icon: '🗿', cursed: true, desc: '防御 +6; 代价: 闪避 -25', stat: { def: 6, eva: -25 } },
};

const Boons = {
  def(id) { return BOONS[id]; },
  all() { return Object.keys(BOONS); },

  /** 随机抽 n 个不重复的祝福 id (诅咒卡 40% 概率替换其中一张) */
  sample(rng, n, exclude) {
    const normal = this.all().filter(id => !(exclude || []).includes(id));
    rng.shuffle(normal);
    const picks = normal.slice(0, n);
    const cursed = Object.keys(BOONS).filter(id => BOONS[id].cursed && !(exclude || []).includes(id));
    if (cursed.length && picks.length && rng.chance(0.4)) {
      const slot = rng.int(0, picks.length - 1);
      const pick = rng.pick(cursed);
      if (!picks.includes(pick)) picks[slot] = pick;
    }
    return picks;
  },

  /** 汇总玩家身上所有祝福的属性加成 */
  bonus(p) {
    const b = { atk: 0, hp: 0, def: 0, eva: 0, acc: 0, crit: 0, flag: {} };
    if (!p.boons) return b;
    for (const id in p.boons) {
      const d = BOONS[id];
      if (!d) continue;
      const n = p.boons[id];
      if (d.stat) {
        b.atk += (d.stat.atk || 0) * n;
        b.hp += (d.stat.hp || 0) * n;
        b.def += (d.stat.def || 0) * n;
        b.eva += (d.stat.eva || 0) * n;
        b.acc += (d.stat.acc || 0) * n;
        b.crit += (d.stat.crit || 0) * n;
      }
      if (d.flag) {
        for (const k in d.flag) {
          b.flag[k] = (b.flag[k] || 0) + d.flag[k] * n;
        }
      }
    }
    return b;
  },

  /** 祝福生效 */
  give(p, id) {
    p.boons = p.boons || {};
    p.boons[id] = (p.boons[id] || 0) + 1;
  },
};
