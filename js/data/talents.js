// ============ TALENTS: 局外天赋 (魂晶永久解锁) ============
// Roguelite 元循环: 每局结算魂晶 → 主菜单购买永久成长 → 下一局开局生效。

'use strict';

const TALENTS = [
  { id: 't_hp1',   name: '生命之源 I', icon: '❤️', desc: '初始生命 +10',        cost: 30,  max: 1 },
  { id: 't_hp2',   name: '生命之源 II', icon: '❤️', desc: '初始生命 +20 (需 I)', cost: 70,  max: 1, req: 't_hp1' },
  { id: 't_hp3',   name: '生命之源 III', icon: '❤️', desc: '初始生命 +30 (需 II)', cost: 140, max: 1, req: 't_hp2' },
  { id: 't_atk1',  name: '锐意 I',     icon: '🗡', desc: '初始攻击 +1',          cost: 45,  max: 1 },
  { id: 't_atk2',  name: '锐意 II',    icon: '🗡', desc: '初始攻击 +2 (需 I)',   cost: 110, max: 1, req: 't_atk1' },
  { id: 't_mp1',   name: '法脉',       icon: '🔮', desc: '初始法力上限 +10',     cost: 45,  max: 1 },
  { id: 't_potion',name: '药剂师',     icon: '🧪', desc: '开局多带 2 瓶治疗药水', cost: 30,  max: 1 },
  { id: 't_gold',  name: '启程资金',   icon: '💰', desc: '开局携带 +80 金币',    cost: 35,  max: 1 },
  { id: 't_gear',  name: '老兵装备',   icon: '⚔️', desc: '开局自带铁剑与皮甲',   cost: 90,  max: 1 },
  { id: 't_eye',   name: '猫眼',       icon: '👁', desc: '视野半径 +1',          cost: 40,  max: 1 },
  { id: 't_map',   name: '探图者',     icon: '🗺️', desc: '每层自动映出 30% 地图', cost: 65,  max: 1 },
  { id: 't_shard', name: '魂引',       icon: '💎', desc: '局末魂晶收益 +25%',    cost: 80,  max: 1 },
];

const Talents = {
  def(id) { return TALENTS.find(t => t.id === id); },
  all() { return TALENTS; },

  /** 是否可购买 (达标前置且未满级) */
  canBuy(levels, id) {
    const d = this.def(id);
    if (!d) return false;
    const lv = levels[id] || 0;
    if (lv >= d.max) return false;
    if (d.req && !(levels[d.req] || 0)) return false;
    return true;
  },

  /** 应用开局加成到玩家 (makePlayer 里调用) */
  apply(p, levels) {
    levels = levels || {};
    let hp = 0, atk = 0, mp = 0;
    if (levels.t_hp1) hp += 10;
    if (levels.t_hp2) hp += 10; // 叠加到 +20
    if (levels.t_hp3) hp += 10; // 叠加到 +30
    if (levels.t_atk1) atk += 1;
    if (levels.t_atk2) atk += 1; // 叠加到 +2
    if (levels.t_mp1) mp += 10;
    p.baseMaxHp += hp; p.hp += hp;
    p.baseMaxMp += mp; p.mp += mp;
    p.baseAtk += atk;
    if (levels.t_potion) p.inv.push(Items.mk('p_hp_s', 2));
    if (levels.t_gold) p.gold += 80;
    if (levels.t_gear) {
      if (!p.equip.weapon) { p.equip.weapon = Items.mk('w_iron'); }
      if (!p.equip.armor) { p.equip.armor = Items.mk('a_leather'); }
    }
    if (levels.t_eye) p.baseFov = (p.baseFov || 0) + 1;
    return p;
  },
};
