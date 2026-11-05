// ============ COMBAT: 战斗结算 ============
// 命中率 = acc - eva, 伤害 = (atk ±20%) - def, 下限 1, 暴击 ×1.6。
// 词条/祝福/挑战因子通过玩家 flags 统一挂钩; 护盾优先吸收。

'use strict';

const Combat = (() => {

  /** 命中判定 */
  function hitRoll(rng, acc, eva) {
    return rng.next() * 100 < Util.clamp(acc - eva, 15, 95);
  }

  /** 玩家有效攻击值 (含低血狂怒祝福) */
  function playerAtkVal(game) {
    const p = game.player;
    let atk = Status.atkOf(p);
    if (p.flags && p.flags.lowHpAtk && p.hp / p.maxHp < 0.4) atk += p.flags.lowHpAtk;
    return atk;
  }

  /**
   * 玩家对单敌结算一次打击 (近战/远程共用):
   * 暴击 / 破甲 / 对Boss增伤 / 飘字 / 音效 / 词条触发 / 吸血。
   * 返回 {dmg, crit, killed}
   */
  function dealPlayerHit(game, enemy, mult) {
    const p = game.player;
    const rng = game.rng;
    const f = p.flags || {};

    let dmg = playerAtkVal(game) * (mult || 1) * (1 + rng.float(-CONFIG.DMG_VARIANCE, CONFIG.DMG_VARIANCE));
    const crit = rng.next() * 100 < p.crit;
    if (crit) dmg *= CONFIG.CRIT_MULT;
    let effDef = enemy.def;
    if (f.pierce) effDef *= 0.5;
    if (enemy.boss && f.bossDmgMul) dmg *= f.bossDmgMul;
    dmg = Math.max(1, Math.round(dmg - effDef));

    hurtEnemy(game, enemy, dmg, { type: 'melee', crit });

    // 词条触发
    if (enemy.hp > 0) {
      if (f.burnOnHit && rng.chance(f.burnOnHit)) {
        Status.add(enemy, 'burn', 2, 3);
        game.msg(`🔥 ${enemy.name} 被点燃了!`, 'warn');
      }
      if (f.poisonOnHit && rng.chance(f.poisonOnHit)) {
        Status.add(enemy, 'poison', 3, Math.max(2, Math.round(playerAtkVal(game) * 0.35)));
        game.msg(`☠ ${enemy.name} 中毒了!`, 'warn');
      }
      if (f.chillOnHit && rng.chance(f.chillOnHit)) {
        Status.add(enemy, 'slow', 2, 1);
        FX.burst(enemy.x, enemy.y, '#9fd8ff', 6);
        game.msg(`❄ ${enemy.name} 被冻得迟缓了。`, 'magic');
      }
    }
    // 吸血 (武器词条 + 嗜血护符 + 汲取词条 合计)
    if (f.lifesteal && p.hp < p.maxHp) {
      const h = Math.max(1, Math.floor(dmg * f.lifesteal));
      p.heal(h, true);
      FX.float(p.x, p.y - 0.2, '+' + h, '#6fd07a');
    }
    return { dmg, crit, killed: enemy.hp <= 0 };
  }

  /** 玩家近战攻击敌人 (bump) */
  function playerAttack(game, enemy) {
    const p = game.player;
    const rng = game.rng;
    AudioSys.play('swing');
    FX.lunge(p, enemy);

    if (!hitRoll(rng, p.acc + Status.accBonus(p), enemy.eva)) {
      game.msg(`你的攻击被 ${enemy.name} 闪开了。`, 'sys');
      FX.float(enemy.x, enemy.y, '闪避', '#9aa5b5');
      return;
    }
    const r1 = dealPlayerHit(game, enemy, 1);
    game.msg(`你${r1.crit ? '暴击' : '击中'} ${enemy.name} <b>(-${r1.dmg})</b>`, 'dmg');

    // 连击词条: 概率追加一击
    const f = p.flags || {};
    if (f.comboOnHit && enemy.hp > 0 && rng.chance(f.comboOnHit)) {
      FX.float(enemy.x, enemy.y - 0.6, '连击!', '#ffd43b');
      AudioSys.play('swing');
      FX.lunge(p, enemy);
      if (hitRoll(rng, p.acc + Status.accBonus(p), enemy.eva)) {
        const r2 = dealPlayerHit(game, enemy, 1);
        game.msg(`连击命中 <b>(-${r2.dmg})</b>`, 'dmg');
      } else {
        game.msg('连击被闪开了。', 'sys');
      }
    }

    // 冰霜护符反冻
    const t = p.equip.trinket ? ITEMS[p.equip.trinket.id] : null;
    if (t && t.flag && t.flag.frostAura && rng.chance(t.flag.frostAura) && enemy.hp > 0 && !enemy.flag.frozenImmune) {
      Status.add(enemy, 'frozen', 1, 1);
      FX.burst(enemy.x, enemy.y, '#9fd8ff', 8);
    }
  }

  /**
   * 玩家远程攻击 (弓/法杖/回旋刃)。
   * targets: 敌人数组; sub: 'bow'|'wand'|'bom'
   */
  function playerRanged(game, weapon, targets, sub) {
    const p = game.player;
    const rng = game.rng;
    let fired = false;
    for (const t of targets) {
      if (!t || t.hp <= 0) continue;
      fired = true;
      const col = sub === 'wand' ? '#b197fc' : (sub === 'bom' ? '#c9c4b4' : '#d9c27a');
      FX.projectile(p.x, p.y, t.x, t.y, col);
      AudioSys.play(sub === 'wand' ? 'magic' : 'bow');

      if (!hitRoll(rng, p.acc + Status.accBonus(p), t.eva)) {
        game.msg(`你的攻击被 ${t.name} 闪开了。`, 'sys');
        FX.float(t.x, t.y, '闪避', '#9aa5b5');
        continue;
      }
      const r = dealPlayerHit(game, t, 1);
      game.msg(`${sub === 'wand' ? '🪄 魔法弹' : (sub === 'bom' ? '🪃 回旋刃' : '🏹 箭矢')}击中 ${t.name} <b>(-${r.dmg})</b>`, 'dmg');
    }
    // 回旋刃去回特效
    if (fired && sub === 'bom' && targets.length) {
      const last = targets[targets.length - 1];
      FX.projectile(last.x, last.y, p.x, p.y, '#c9c4b4');
    }
    return fired;
  }

  /** 敌人近战攻击玩家 */
  function enemyAttack(game, enemy) {
    const p = game.player;
    const rng = game.rng;
    FX.lunge(enemy, p);
    AudioSys.play('ehit');

    if (!hitRoll(rng, enemy.acc, p.eva + Status.evaBonus(p))) {
      game.msg(`你闪开了 ${enemy.name} 的攻击。`, 'sys');
      FX.float(p.x, p.y, '闪避', '#9aa5b5');
      // 残影祝福: 闪避回蓝
      if (p.flags && p.flags.dodgeMp && p.mp < p.maxMp) {
        p.gainMp(p.flags.dodgeMp);
      }
      return;
    }
    let dmg = Status.atkOf(enemy) * (1 + rng.float(-CONFIG.DMG_VARIANCE, CONFIG.DMG_VARIANCE));
    const crit = rng.next() * 100 < enemy.crit;
    if (crit) dmg *= CONFIG.CRIT_MULT;
    dmg = Math.max(1, Math.round(dmg - p.def));

    hurtPlayer(game, dmg, { type: 'melee', src: enemy, crit });
    game.msg(`${enemy.name} 击中你 <b>(-${dmg})</b>`, 'dmg');

    // 荆棘 (祝福词条): 反伤
    if (p.flags && p.flags.thorns && enemy.hp > 0 && p.hp > 0) {
      const back = Math.round(p.flags.thorns);
      FX.float(enemy.x, enemy.y, '刺!' + back, '#8fce6a');
      hurtEnemy(game, enemy, back, { type: 'melee' });
    }

    // 敌人命中附加效果
    if (enemy.flag.poisonOnHit && rng.chance(enemy.flag.poisonOnHit) && p.hp > 0) {
      Status.add(p, 'poison', 4, Math.max(2, Math.round(Status.atkOf(enemy) * 0.4)));
      game.msg('你中毒了!', 'warn');
    }
    if (enemy.flag.webOnHit && rng.chance(enemy.flag.webOnHit) && p.hp > 0) {
      Status.add(p, 'slow', 4, 1);
      game.msg('蛛丝缠住了你, 动作变迟缓了!', 'warn');
      FX.burst(p.x, p.y, '#cfd8dc', 6);
    }
    if (enemy.flag.drainMp && p.mp > 0 && p.hp > 0) {
      const drain = Math.min(p.mp, enemy.flag.drainMp);
      p.mp -= drain;
      game.msg(`${enemy.name} 吸走了你 ${drain} 点法力!`, 'magic');
    }
  }

  /** 敌人远程攻击 (火球/奥术弹) */
  function enemyRanged(game, enemy, dmgOverride, typeOverride) {
    const p = game.player;
    const rng = game.rng;
    const spec = enemy.ranged;
    const type = typeOverride || spec.type;
    FX.projectile(enemy.x, enemy.y, p.x, p.y, type === 'fire' ? '#ff9538' : '#b197fc');
    AudioSys.play(type === 'fire' ? 'fireball' : 'magic');
    game.msg(`${enemy.name} 向你掷出${type === 'fire' ? '火球' : '奥术弹'}!`, 'dmg');
    const dmg = Math.max(1, Math.round((dmgOverride || spec.dmg) * rng.float(0.85, 1.15)) - Math.floor(p.def / 2));
    hurtPlayer(game, dmg, { type, src: enemy });
    game.msg(`${type === 'fire' ? '火球' : '奥术弹'}命中你 <b>(-${dmg})</b>`, 'dmg');
  }

  /** 对敌人造成伤害 (技能/卷轴/反伤等任何来源) */
  function hurtEnemy(game, enemy, dmg, opts) {
    opts = opts || {};
    if (enemy.hp <= 0) return;
    enemy.hp -= dmg;
    game.stats.damageDealt += dmg;
    const color = opts.type === 'fire' ? '#ff9538'
      : opts.type === 'ice' ? '#9fd8ff'
      : opts.type === 'lightning' ? '#f7e463'
      : opts.type === 'arcane' ? '#b197fc'
      : '#ff7b72';
    FX.hit(enemy.x, enemy.y, color, opts.crit);
    FX.float(enemy.x, enemy.y, '-' + dmg + (opts.crit ? '!' : ''), opts.crit ? '#ffd43b' : color, opts.crit);
    AudioSys.play(opts.crit ? 'crit' : 'hit');
    if (opts.crit) game.shake(CONFIG.SHAKE.crit);

    if (enemy.hp <= 0) killEnemy(game, enemy);
    else if (!enemy.awake) { enemy.awake = true; } // 被打醒
  }

  /** 对玩家造成伤害 */
  function hurtPlayer(game, dmg, opts) {
    opts = opts || {};
    const p = game.player;
    if (p.hp <= 0) return;

    // 护盾吸收
    const sh = p.statuses.find(s => s.id === 'shield');
    if (sh) {
      const absorbed = Math.min(sh.power, dmg);
      sh.power -= absorbed;
      dmg -= absorbed;
      FX.float(p.x, p.y, '盾-' + absorbed, '#4dabf7');
      if (sh.power <= 0) Status.remove(p, 'shield');
      if (dmg <= 0) return;
    }

    p.hp -= dmg;
    game.stats.taken += dmg;
    game.stats.takenThisFloor = (game.stats.takenThisFloor || 0) + dmg;
    const color = opts.type === 'fire' ? '#ff9538' : opts.type === 'arcane' ? '#b197fc' : '#ff6b6b';
    FX.hurt(p.x, p.y, opts.crit);
    FX.float(p.x, p.y, '-' + dmg + (opts.crit ? '!' : ''), opts.crit ? '#ffd43b' : color, opts.crit);
    AudioSys.play(opts.crit ? 'hurt' : 'phit');
    game.shake(opts.crit ? CONFIG.SHAKE.crit : CONFIG.SHAKE.hit);
    game.flashRed = Math.min(1, (game.flashRed || 0) + 0.4);

    if (p.hp <= 0) {
      p.hp = 0;
      game.die(opts.src ? `被 ${opts.src.name} 击杀` : (opts.cause || '伤重不治'));
    }
  }

  /** 击杀敌人: 掉落 / 金币 / 经验 / 图鉴 */
  function killEnemy(game, enemy) {
    const p = game.player;
    const rng = game.rng;
    enemy.hp = 0;
    FX.death(enemy.x, enemy.y, enemy.color);
    AudioSys.play(enemy.boss ? 'bossdie' : 'die');

    // 自爆
    if (enemy.flag.explodeOnDeath) {
      const d = Util.cdist(enemy.x, enemy.y, p.x, p.y);
      if (d <= 1) {
        game.msg(`${enemy.name} 爆炸了!`, 'dmg');
        FX.boom(enemy.x, enemy.y);
        hurtPlayer(game, enemy.flag.explodeOnDeath, { type: 'fire', cause: `${enemy.name} 的自爆` });
      } else {
        FX.boom(enemy.x, enemy.y);
        game.msg(`${enemy.name} 爆成了火花。`, 'warn');
      }
      game.shake(4);
    }

    // 金币
    if (enemy.gold) {
      const greed = (p.flags && p.flags.greed) || 1;
      const gold = Math.round(rng.int(enemy.gold[0], enemy.gold[1]) * greed);
      if (gold > 0) {
        game.gainGold(gold);
        FX.float(enemy.x, enemy.y - 0.5, '+' + gold + ' 金币', PALETTE.gold);
      }
    }
    // 掉落
    for (const id of Enemies.rollDrops(enemy, rng)) {
      const it = Items.mkLoot(id, rng, game.level.floor);
      it.x = enemy.x; it.y = enemy.y;
      game.level.items.push(it);
      game.msg(`${enemy.name} 掉落了 ${Affixes.displayName(it)}。`, 'item');
    }
    // 精英: 必掉一件带词条装备
    if (enemy.elite) {
      const id = Items.randomItem(rng, game.level.floor + 1, { eq: true }).id;
      const it = Items.mkLoot(id, rng, game.level.floor + 1);
      it.x = enemy.x; it.y = enemy.y;
      game.level.items.push(it);
      game.msg(`👑 精英 ${enemy.name} 掉落了 ${Affixes.displayName(it)}!`, 'item');
      Meta.unlock('elite_first');
      FX.ring(enemy.x, enemy.y, PALETTE.gold);
    }
    // Boss 掉落砸在脚下
    if (enemy.boss) {
      FX.boom(enemy.x, enemy.y, true);
      game.shake(12);
      game.msg(`${enemy.name} 倒下了! 深渊震颤!`, 'good');
    }

    // 汲血术祝福
    if (p.flags && p.flags.killHeal && p.hp < p.maxHp && p.hp > 0) {
      p.heal(p.flags.killHeal, true);
    }

    // 经验
    game.gainXp(enemy.xp);
    p.kills++;
    game.stats.kills++;
    Meta.recordKill(enemy.id);
    if (enemy.boss) {
      const map = { boss_butcher: 'boss_butcher', boss_king: 'boss_king', boss_dragon: 'dragon_slayer' };
      if (map[enemy.id]) Meta.unlock(map[enemy.id]);
    }

    game.msg(`你击杀了 ${enemy.name}。 (+${enemy.xp} 经验)`, 'good');
    // 从列表移除
    const idx = game.level.enemies.indexOf(enemy);
    if (idx >= 0) game.level.enemies.splice(idx, 1);
    // 伏击房清场检查
    if (typeof game.checkAmbushClear === 'function') game.checkAmbushClear();
  }

  /** 经验与升级 */
  function gainXp(game, n) {
    const p = game.player;
    p.xp += n;
    let need = CONFIG.xpNeed(p.level);
    while (p.xp >= need) {
      p.xp -= need;
      p.level++;
      const LU = CONFIG.LEVEL_UP;
      p.baseMaxHp += LU.HP;
      p.baseMaxMp += LU.MP;
      p.baseAtk += LU.ATK;
      if (p.level % LU.DEF_EVERY === 0) p.baseDef += 1;
      game.recalcStats();
      p.hp = p.maxHp; p.mp = p.maxMp;
      game.msg(`⬆ 升级! 现在是 ${p.level} 级, 状态全恢复。`, 'good');
      FX.levelUp(p.x, p.y);
      AudioSys.play('levelup');
      // 解锁技能提示
      for (const sk of CONFIG.SKILLS) {
        if (sk.lv === p.level) game.msg(`领悟新技能: ${sk.glyph} ${sk.name} (按 ${CONFIG.SKILLS.indexOf(sk) + 1})`, 'magic');
      }
      if (p.level === 10) Meta.unlock('lv10');
      need = CONFIG.xpNeed(p.level);
    }
  }

  return { playerAttack, playerRanged, enemyAttack, enemyRanged, hurtEnemy, hurtPlayer, killEnemy, gainXp, playerAtkVal };
})();
