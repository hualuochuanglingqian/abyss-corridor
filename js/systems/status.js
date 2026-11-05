// ============ STATUS: 状态效果 (buff / debuff) ============

'use strict';

const Status = (() => {

  /** 添加状态: 已存在则刷新回合取最大、强度取最大 */
  function add(entity, id, turns, power) {
    if (entity.flag) {
      if (id === 'burn' && entity.flag.burnImmune) return false;
      if (id === 'poison' && entity.flag.poisonImmune) return false;
      if (id === 'frozen' && entity.flag.frozenImmune) return false;
    }
    const cur = entity.statuses.find(s => s.id === id);
    if (cur) {
      cur.turns = Math.max(cur.turns, turns);
      cur.power = Math.max(cur.power, power || cur.power);
    } else {
      entity.statuses.push({ id, turns, power: power || 1 });
    }
    return true;
  }

  function remove(entity, id) {
    const i = entity.statuses.findIndex(s => s.id === id);
    if (i >= 0) entity.statuses.splice(i, 1);
  }

  function has(entity, id) {
    return entity.statuses.some(s => s.id === id);
  }

  function powerOf(entity, id) {
    const s = entity.statuses.find(s => s.id === id);
    return s ? s.power : 0;
  }

  /** 攻击力合成: 基础 + 力量 - 虚弱 */
  function atkOf(entity) {
    let atk = entity.atk;
    if (has(entity, 'strength')) atk += powerOf(entity, 'strength');
    if (has(entity, 'weaken')) atk -= 3;
    return Math.max(1, atk);
  }

  /** 玩家命中/闪避修正 (蛛网减速: 迟缓) */
  function accBonus(e) { return has(e, 'slow') ? -10 : 0; }
  function evaBonus(e) { return has(e, 'slow') ? -20 : 0; }

  /**
   * 回合结束 tick (对所有活体调用一次/回合)。
   * game.msg 只对玩家输出。
   */
  function tick(entity, game) {
    if (!entity.statuses.length) return;
    const isPlayer = entity === game.player;
    for (let i = entity.statuses.length - 1; i >= 0; i--) {
      const s = entity.statuses[i];
      s.turns--;
      switch (s.id) {
        case 'poison': {
          const d = Math.max(1, s.power);
          if (isPlayer) {
            game.player.hp = Math.max(1, game.player.hp - d); // 毒不致死, 留 1 血
            FX.float(entity.x, entity.y, '-' + d, '#b197fc');
          } else if (entity.hp > 0) {
            entity.hp -= d;
            FX.float(entity.x, entity.y, '-' + d, '#b197fc');
            if (entity.hp <= 0) Combat.killEnemy(game, entity);
          }
          break;
        }
        case 'burn': {
          const d = Math.max(1, s.power);
          if (isPlayer) {
            game.player.hp = Math.max(1, game.player.hp - d);
            FX.float(entity.x, entity.y, '-' + d, '#ff9538');
          } else if (entity.hp > 0) {
            entity.hp -= d;
            FX.burst(entity.x, entity.y, '#ff9538', 4);
            FX.float(entity.x, entity.y, '-' + d, '#ff9538');
            if (entity.hp <= 0) Combat.killEnemy(game, entity);
          }
          break;
        }
        case 'regen': {
          if (isPlayer && game.player.hp < game.player.maxHp) {
            game.player.heal(s.power, true);
          }
          break;
        }
      }
      if (s.turns <= 0) {
        entity.statuses.splice(i, 1);
        if (isPlayer && (s.id === 'strength')) game.msg('力量药剂的效果消退了。', 'sys');
        if (isPlayer && (s.id === 'shield')) game.msg('护盾碎裂了。', 'sys');
      }
    }
  }

  /** HUD 图标数据 */
  function icons(entity) {
    return entity.statuses.map(s => {
      const d = CONFIG.STATUS[s.id] || { name: s.id, icon: '?' };
      return { ...d, turns: s.turns, power: s.power };
    });
  }

  return { add, remove, has, powerOf, atkOf, accBonus, evaBonus, tick, icons };
})();
