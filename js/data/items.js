// ============ ITEMS: 物品定义 ============
// kind: weapon 武器 / armor 护甲 / trinket 饰品 / potion 药水 / scroll 卷轴 / gem 杂项
// 武器 sub: melee 近战 / bow 弓(直线弹道) / wand 法杖(自动锁定, 耗蓝) / bom 回旋(去回双击)
// 实例 = { uid, id, x, y, count, affixes? }  消耗品可堆叠, 装备不堆叠。

'use strict';

const ITEMS = {
  // ---------------- 武器·近战 ----------------
  w_club:   { name: '粗木棒',   glyph: '🏏', kind: 'weapon', sub: 'melee', tier: 1, price: 18,  atk: 2,  crit: 0,  acc: 0,  desc: '捡来的树枝, 好歹是根棍子。' },
  w_iron:   { name: '铁剑',     glyph: '🗡', kind: 'weapon', sub: 'melee', tier: 2, price: 55,  atk: 4,  crit: 3,  acc: 2,  desc: '制式铁剑, 磨得很亮。' },
  w_axe:    { name: '战斧',     glyph: '🪓', kind: 'weapon', sub: 'melee', tier: 3, price: 110, atk: 6,  crit: 0,  acc: -4, desc: '重, 但每一击都够狠。' },
  w_knight: { name: '骑士长剑', glyph: '⚔', kind: 'weapon', sub: 'melee', tier: 4, price: 200, atk: 7,  crit: 5,  acc: 4,  desc: '落魄骑士留下的利剑。' },
  w_rune:   { name: '符文之刃', glyph: '🔪', kind: 'weapon', sub: 'melee', tier: 5, price: 340, atk: 9,  crit: 8,  acc: 4,  desc: '刃上符文微微发烫。' },
  w_demon:  { name: '深渊魔剑', glyph: '🗡️', kind: 'weapon', sub: 'melee', tier: 6, price: 520, atk: 12, crit: 10, acc: 2, flag: { burnOnHit: 0.15 }, desc: '深渊锻造, 命中可能点燃敌人。' },

  // ---------------- 武器·远程 ----------------
  w_bow1:  { name: '短弓',     glyph: '🏹', kind: 'weapon', sub: 'bow', range: 5, tier: 2, price: 95,  atk: 4,  crit: 4,  acc: 4, desc: '朝面向方向射出箭矢 (直线 5 格)。' },
  w_bow2:  { name: '猎手长弓', glyph: '🏹', kind: 'weapon', sub: 'bow', range: 6, tier: 4, price: 230, atk: 7,  crit: 6,  acc: 6, desc: '直线弹道, 站得远才安全。' },
  w_wand1: { name: '学徒法杖', glyph: '🪄', kind: 'weapon', sub: 'wand', range: 6, tier: 2, price: 100, atk: 5,  crit: 4,  acc: 0, desc: '自动锁定最近敌人 (2 法力/发)。' },
  w_wand2: { name: '星辉法杖', glyph: '🪄', kind: 'weapon', sub: 'wand', range: 7, tier: 5, price: 280, atk: 8,  crit: 6,  acc: 0, desc: '更强的追踪魔法弹 (2 法力/发)。' },
  w_bom1:  { name: '回旋刃',   glyph: '🪃', kind: 'weapon', sub: 'bom', range: 4, tier: 3, price: 140, atk: 5,  crit: 5,  acc: 4, desc: '去回双击, 可命中路径上至多 2 个敌人。' },
  w_bom2:  { name: '飞斧',     glyph: '🪃', kind: 'weapon', sub: 'bom', range: 4, tier: 5, price: 290, atk: 8,  crit: 5,  acc: 2, desc: '沉重的去回双击。' },

  // ---------------- 护甲 ----------------
  a_cloth:   { name: '布衣',   glyph: '🧥', kind: 'armor', tier: 1, price: 10,  def: 0, eva: 0,  desc: '普通布衣。' },
  a_leather: { name: '皮甲',   glyph: '🦺', kind: 'armor', tier: 2, price: 50,  def: 1, eva: 3,  desc: '轻便, 闪避小幅提升。' },
  a_chain:   { name: '锁子甲', glyph: '🥼', kind: 'armor', tier: 3, price: 120, def: 3, eva: 0,  desc: '环环相扣的可靠防护。' },
  a_plate:   { name: '板甲',   glyph: '🛡', kind: 'armor', tier: 4, price: 230, def: 5, eva: -3, desc: '沉重, 稳如堡垒。' },
  a_mithril: { name: '秘银甲', glyph: '🪙', kind: 'armor', tier: 5, price: 380, def: 7, eva: 2,  desc: '轻若无物的秘银光泽。' },
  a_dragon:  { name: '龙鳞铠', glyph: '🐲', kind: 'armor', tier: 6, price: 560, def: 9, eva: 0, flag: { burnImmune: true }, desc: '免疫灼烧。龙的馈赠。' },

  // ---------------- 饰品 ----------------
  tr_life:  { name: '生命戒指', glyph: '💍', kind: 'trinket', tier: 2, price: 150, flag: { regen: 1 }, desc: '每回合恢复 1 点生命。' },
  tr_power: { name: '力量护符', glyph: '🧿', kind: 'trinket', tier: 2, price: 160, atk: 3, desc: '攻击 +3。' },
  tr_boots: { name: '疾风之靴', glyph: '👟', kind: 'trinket', tier: 3, price: 200, eva: 8, flag: { fast: true }, desc: '闪避 +8, 走路带风。' },
  tr_greed: { name: '贪婪金币', glyph: '🪙', kind: 'trinket', tier: 3, price: 190, flag: { greed: 1.5 }, desc: '击杀掉落金币 ×1.5。' },
  tr_frost: { name: '冰霜护符', glyph: '🧊', kind: 'trinket', tier: 4, price: 260, flag: { frostAura: 0.2 }, desc: '近战攻击你的敌人 20% 被冻结 1 回合。' },
  tr_blood: { name: '嗜血护符', glyph: '🩸', kind: 'trinket', tier: 4, price: 300, flag: { lifesteal: 0.2 }, desc: '造成伤害的 20% 转化为生命。' },
  tr_mana:  { name: '魔力吊坠', glyph: '🔮', kind: 'trinket', tier: 3, price: 220, mp: 10, flag: { manaFlow: 1 }, desc: '法力上限 +10, 每两回合回 1 法力。' },
  tr_eagle: { name: '鹰眼神珠', glyph: '👁', kind: 'trinket', tier: 3, price: 180, acc: 10, flag: { farSight: 2 }, desc: '命中 +10, 视野 +2。' },

  // ---------------- 药水 ----------------
  p_hp_s:  { name: '治疗药水',   glyph: '🧪', kind: 'potion', price: 30,  stack: true, desc: '恢复 35 生命。', onUse(g) {
    g.msg('你喝下治疗药水, 伤口愈合了。', 'good');
    g.player.heal(35); FX.ring(g.player.x, g.player.y, PALETTE.hp); AudioSys.play('potion'); return true;
  } },
  p_hp_l:  { name: '大治疗药水', glyph: '⚗', kind: 'potion', price: 65,  stack: true, desc: '恢复 80 生命。', onUse(g) {
    g.msg('你饮尽大治疗药水, 浑身一轻。', 'good');
    g.player.heal(80); FX.ring(g.player.x, g.player.y, PALETTE.hp); AudioSys.play('potion'); return true;
  } },
  p_mp:    { name: '魔力药水',   glyph: '💙', kind: 'potion', price: 40,  stack: true, desc: '恢复 18 法力。', onUse(g) {
    g.msg('魔力涌入你的经脉。', 'magic');
    g.player.gainMp(18); FX.ring(g.player.x, g.player.y, PALETTE.mp); AudioSys.play('potion'); return true;
  } },
  p_str:   { name: '力量药剂',   glyph: '💪', kind: 'potion', price: 55,  stack: true, desc: '12 回合内攻击 +4。', onUse(g) {
    g.msg('力量在血管里咆哮! (12 回合攻击 +4)', 'warn');
    Status.add(g.player, 'strength', 12, 4); FX.ring(g.player.x, g.player.y, '#ffa94d'); AudioSys.play('buff'); return true;
  } },
  p_shield:{ name: '铁皮药剂',   glyph: '🔵', kind: 'potion', price: 55,  stack: true, desc: '获得 25 点护盾。', onUse(g) {
    g.msg('皮肤泛起铁灰色的光泽。', 'magic');
    Status.add(g.player, 'shield', 15, 25); FX.ring(g.player.x, g.player.y, PALETTE.mp); AudioSys.play('buff'); return true;
  } },
  p_cure:  { name: '净化药剂',   glyph: '🌿', kind: 'potion', price: 35,  stack: true, desc: '解除中毒/灼烧, 并再生 5 回合。', onUse(g) {
    g.msg('毒素与火焰被涤净了。', 'good');
    Status.remove(g.player, 'poison'); Status.remove(g.player, 'burn');
    Status.add(g.player, 'regen', 5, 2); FX.ring(g.player.x, g.player.y, PALETTE.xp); AudioSys.play('potion'); return true;
  } },

  // ---------------- 卷轴 ----------------
  s_fire:  { name: '火焰卷轴',   glyph: '📜', kind: 'scroll', price: 60,  stack: true, desc: '视野内所有敌人受 14 点火焰伤害并灼烧。', onUse(g) {
    g.msg('卷轴燃起烈焰风暴!', 'magic');
    let hit = 0;
    for (const e of g.enemiesVisible()) {
      Combat.hurtEnemy(e, 14, { type: 'fire', src: 'scroll' });
      Status.add(e, 'burn', 2, 3); hit++;
    }
    if (!hit) g.msg('视野内没有目标, 火焰在空气中散去…', 'sys');
    AudioSys.play('fire'); g.turnUsed = true; return true;
  } },
  s_frost: { name: '冰霜卷轴',   glyph: '❄️', kind: 'scroll', price: 60,  stack: true, desc: '冻结视野内所有敌人 4 回合。', onUse(g) {
    g.msg('寒霜轰然扩散!', 'magic');
    let hit = 0;
    for (const e of g.enemiesVisible()) { Status.add(e, 'frozen', 4, 1); Combat.hurtEnemy(e, 6, { type: 'ice', src: 'scroll' }); hit++; }
    if (!hit) g.msg('视野内没有目标。', 'sys');
    AudioSys.play('frost'); g.turnUsed = true; return true;
  } },
  s_bolt:  { name: '闪电卷轴',   glyph: '⚡', kind: 'scroll', price: 55,  stack: true, desc: '雷击最近的最多 3 个可视敌人, 各 18 点。', onUse(g) {
    g.msg('雷光自卷轴中迸发!', 'magic');
    const targets = g.enemiesVisible().sort((a, b) => Util.dist2(a.x, a.y, g.player.x, g.player.y) - Util.dist2(b.x, b.y, g.player.x, g.player.y)).slice(0, 3);
    if (!targets.length) g.msg('视野内没有目标。', 'sys');
    for (const e of targets) Combat.hurtEnemy(e, 18, { type: 'lightning', src: 'scroll' });
    AudioSys.play('zap'); g.turnUsed = true; return true;
  } },
  s_tele:  { name: '传送卷轴',   glyph: '🌀', kind: 'scroll', price: 50,  stack: true, desc: '随机传送到本层的安全位置。', onUse(g) {
    g.msg('空间在你眼前折叠…', 'magic');
    g.blinkRandom(true); AudioSys.play('blink'); g.turnUsed = true; return true;
  } },
  s_map:   { name: '地图卷轴',   glyph: '🗺️', kind: 'scroll', price: 45,  stack: true, desc: '映出本层的完整地图(不含怪物)。', onUse(g) {
    g.msg('本层的地图在你脑中展开!', 'magic');
    g.level.explored.fill(1); FX.float(g.player.x, g.player.y, '地图!', PALETTE.gold);
    AudioSys.play('magic'); g.turnUsed = true; return true;
  } },

  // ---------------- 杂项 ----------------
  gem: { name: '深渊晶石', glyph: '💎', kind: 'gem', price: 120, stack: true, desc: '纯粹的价值。商人喜欢它。', onUse(g) {
    g.msg('晶石碎片融进掌心… 毫无反应。看来只能卖钱。', 'sys'); return false;
  } },
};

// 商店不出售的稀有品
const NO_SHOP = new Set(['a_dragon', 'w_demon', 'w_bow2', 'w_wand2', 'w_bom2', 'tr_blood', 'p_hp_l']);

const Items = {
  _uid: 1,

  def(id) { return ITEMS[id]; },

  /** 生成物品实例 */
  mk(id, count) {
    const d = ITEMS[id];
    if (!d) throw new Error('unknown item: ' + id);
    const it = { uid: this._uid++, id, x: -1, y: -1 };
    if (d.stack) it.count = count || 1;
    return it;
  },

  /** 生成带词条的掉落装备 (非装备类型等同 mk) */
  mkLoot(id, rng, floor) {
    const it = this.mk(id);
    const d = ITEMS[id];
    if (d && (d.kind === 'weapon' || d.kind === 'armor' || d.kind === 'trinket')) {
      it.affixes = Affixes.gen(rng, floor, d.kind);
    }
    return it;
  },

  /** 全名 (含词条) */
  name(it) {
    const base = ITEMS[it.id].name;
    const n = it.count > 1 ? '×' + it.count : '';
    return base + n;
  },

  /** 悬浮/日志用的完整显示名 */
  displayName(it) { return Affixes.displayName(it); },

  glyph(it) { return ITEMS[it.id].glyph; },

  isEq(it) { const k = ITEMS[it.id].kind; return k === 'weapon' || k === 'armor' || k === 'trinket'; },

  /** 装备槽位名 */
  slotOf(it) {
    const k = ITEMS[it.id].kind;
    return k === 'armor' ? 'armor' : (k === 'trinket' ? 'trinket' : 'weapon');
  },

  /** 是否远程武器 */
  isRanged(it) {
    if (!it) return false;
    const d = ITEMS[it.id];
    return d.kind === 'weapon' && d.sub && d.sub !== 'melee';
  },

  /**
   * 装备+词条汇总到属性 (recalcStats 调用)。
   * 主手武器计入攻击; 副手武器不占属性 (仅备用)。
   */
  eqBonus(equip) {
    const b = { atk: 0, def: 0, eva: 0, acc: 0, crit: 0, mp: 0, flag: {} };
    const collect = (it) => {
      if (!it) return;
      const d = ITEMS[it.id];
      b.atk += d.atk || 0; b.def += d.def || 0; b.eva += d.eva || 0;
      b.acc += d.acc || 0; b.crit += d.crit || 0; b.mp += d.mp || 0;
      if (d.flag) Object.assign(b.flag, d.flag);
      // 词条
      if (it.affixes) {
        for (const a of it.affixes) {
          const ad = AFFIXES[a];
          if (!ad) continue;
          if (ad.stat) {
            b.atk += ad.stat.atk || 0;
            b.def += ad.stat.def || 0;
            b.eva += ad.stat.eva || 0;
            b.acc += ad.stat.acc || 0;
            b.crit += ad.stat.crit || 0;
            b.mp += ad.stat.mp || 0;
          }
          if (ad.flag) {
            for (const k in ad.flag) {
              if (k === 'lifesteal') b.flag.lifesteal = (b.flag.lifesteal || 0) + ad.flag[k];
              else b.flag[k] = ad.flag[k];
            }
          }
        }
      }
    };
    collect(equip.weapon);      // 主手
    collect(equip.armor);
    collect(equip.trinket);
    // 副手武器: 只取词条属性的一半 (备用武器微弱共鸣)
    if (equip.weapon2) {
      const half = { atk: 0, def: 0, eva: 0, acc: 0, crit: 0, mp: 0, flag: {} };
      const bak = equip.weapon; equip.weapon = equip.weapon2;
      // 借用 collect 但只取词条, 简化: 直接扫词条
      const d2 = ITEMS[equip.weapon2.id];
      if (d2.flag) Object.assign(half.flag, d2.flag);
      if (equip.weapon2.affixes) {
        for (const a of equip.weapon2.affixes) {
          const ad = AFFIXES[a];
          if (ad && ad.stat) { half.atk += ad.stat.atk || 0; half.crit += ad.stat.crit || 0; half.acc += ad.stat.acc || 0; }
        }
      }
      equip.weapon = bak;
      b.atk += Math.round(half.atk / 2);
      b.crit += Math.round(half.crit / 2);
      b.acc += Math.round(half.acc / 2);
      for (const k in half.flag) if (!(k in b.flag)) b.flag[k] = half.flag[k];
    }
    return b;
  },

  /** 按楼层生成随机掉落/商店货 */
  randomItem(rng, floor, opts) {
    opts = opts || {};
    const table = [];
    const push = (id, w) => table.push({ v: id, w });
    if (opts.eq) {
      // 装备: 按楼层附近档位 (近战/远程/防具/饰品混合)
      const tiers = this.tiersForFloor(floor);
      for (const id of tiers.eq) push(id, 10);
    }
    push('p_hp_s', floor <= 8 ? 14 : 8);
    push('p_hp_l', floor >= 4 ? 7 : 2);
    push('p_mp', 8);
    push('p_str', 5); push('p_shield', 5); push('p_cure', 6);
    push('s_fire', 6); push('s_frost', 5); push('s_bolt', 5); push('s_tele', 5); push('s_map', 4);
    push('gem', floor >= 3 ? 3 : 1);
    let id = rng.weighted(table);
    if (opts.noShop && NO_SHOP.has(id)) id = 'p_hp_s';
    const it = this.mk(id);
    const d = ITEMS[id];
    if (d.kind === 'weapon' || d.kind === 'armor' || d.kind === 'trinket') {
      it.affixes = Affixes.gen(rng, floor, d.kind, { max: opts.noShop ? 1 : 2 });
    }
    return it;
  },

  /** 楼层对应的装备档位 (含远程) */
  tiersForFloor(floor) {
    const f = Util.clamp(floor, 1, CONFIG.MAX_FLOOR);
    const lo = Math.max(1, Math.min(6, f - 2));
    const hi = Math.max(1, Math.min(6, f));
    const byTier = {
      1: ['w_club'],
      2: ['w_iron', 'w_bow1', 'w_wand1'],
      3: ['w_axe', 'w_bom1'],
      4: ['w_knight', 'w_bow2'],
      5: ['w_rune', 'w_wand2', 'w_bom2'],
      6: ['w_demon'],
    };
    const aname = ['a_cloth', 'a_leather', 'a_chain', 'a_plate', 'a_mithril', 'a_dragon'];
    const tname = ['tr_life', 'tr_power', 'tr_boots', 'tr_greed', 'tr_frost', 'tr_blood'];
    const eq = [];
    for (let i = lo; i <= hi; i++) {
      eq.push(...(byTier[i] || []));
      eq.push(aname[i - 1]);
      eq.push(tname[(i - 1) % tname.length]);
      if (i >= 3) eq.push('tr_mana', 'tr_eagle');
    }
    return { eq };
  },

  price(id) { return ITEMS[id].price; },
};
