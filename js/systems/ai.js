// ============ AI: 敌人行为 ============
// 速度累积器: actAcc += speed, >=1 时行动一次。
// 感知: 玩家视野内 或 距离<=7 且有视线 → awake, 永久追猎。

'use strict';

const AI = (() => {

  /** 敌人行动入口 (玩家回合结束后逐个调用) */
  function act(game, enemy) {
    if (enemy.hp <= 0) return;
    const p = game.player;
    const L = game.level;
    const rng = game.rng;

    // 冰冻: 跳过
    if (Status.has(enemy, 'frozen')) {
      FX.float(enemy.x, enemy.y, '❄', '#9fd8ff');
      return;
    }

    enemy.actAcc += enemy.speed;
    let actions = 0;
    while (enemy.actAcc >= 1 && actions < 3 && p.hp > 0) {
      enemy.actAcc -= 1;
      actions++;
      if (!actOnce(game, enemy, rng)) break;
    }
  }

  function actOnce(game, enemy, rng) {
    const p = game.player;
    const L = game.level;
    const d = Util.cdist(enemy.x, enemy.y, p.x, p.y);

    // 感知
    if (!enemy.awake) {
      const seen = FOV.isVisible(L, enemy.x, enemy.y);
      const near = d <= 7 && Util.lineOfSight(enemy.x, enemy.y, p.x, p.y, (x, y) => L.blocksSight(x, y));
      if (seen || near) {
        enemy.awake = true;
        FX.float(enemy.x, enemy.y, '!', '#ffd43b');
        AudioSys.play('alert');
      } else {
        // 沉睡: 20% 游走
        if (rng.chance(0.2)) stepRandom(game, enemy, rng);
        return true;
      }
    }

    // Boss / 特殊行为
    switch (enemy.ai) {
      case 'boss_butcher': return aiButcher(game, enemy, rng, d);
      case 'boss_king': return aiKing(game, enemy, rng, d);
      case 'boss_dragon': return aiDragon(game, enemy, rng, d);
      case 'charger': return aiCharger(game, enemy, rng, d);
      case 'healer': return aiHealer(game, enemy, rng, d);
    }

    // 通用: 远程系
    if (enemy.ai === 'ranged') return aiRanged(game, enemy, rng, d);
    if (enemy.ai === 'mage') return aiMage(game, enemy, rng, d);
    if (enemy.ai === 'ghost') return aiGhost(game, enemy, rng, d);

    // 通用: 近战追击
    return aiChase(game, enemy, rng, d);
  }

  // ---------- 近战追击 ----------
  function aiChase(game, enemy, rng, d) {
    const p = game.player;
    if (d <= 1 && Math.abs(p.x - enemy.x) <= 1 && Math.abs(p.y - enemy.y) <= 1) {
      Combat.enemyAttack(game, enemy);
      return true;
    }
    stepToward(game, enemy, p.x, p.y, rng);
    return true;
  }

  // ---------- 远程 (站桩输出, 保持距离) ----------
  function aiRanged(game, enemy, rng, d) {
    const p = game.player;
    const spec = enemy.ranged;
    if (d <= 1) {
      // 被贴脸: 有一半概率近战反击 (伤害较低)
      if (rng.chance(0.5)) { Combat.enemyAttack(game, enemy); return true; }
    }
    if (d <= spec.range && Util.lineOfSight(enemy.x, enemy.y, p.x, p.y, (x, y) => game.level.blocksSight(x, y))) {
      if (enemy.cool <= 0) {
        enemy.cool = 2;
        Combat.enemyRanged(game, enemy);
        return true;
      }
      enemy.cool--;
      // 冷却中: 后撤保持距离
      if (d <= 3) stepAway(game, enemy, p.x, p.y, rng);
      else stepToward(game, enemy, p.x, p.y, rng);
      return true;
    }
    stepToward(game, enemy, p.x, p.y, rng);
    return true;
  }

  // ---------- 法师: 被贴脸就传送 ----------
  function aiMage(game, enemy, rng, d) {
    const p = game.player;
    if (d <= 2 && enemy.cool <= 0) {
      enemy.cool = 4;
      blinkAway(game, enemy, rng);
      game.msg(`${enemy.name} 化作阴影消失了!`, 'magic');
      FX.burst(enemy.x, enemy.y, '#b197fc', 10);
      return true;
    }
    enemy.cool--;
    return aiRanged(game, enemy, rng, d);
  }

  // ---------- 幽魂: 直线穿墙 ----------
  function aiGhost(game, enemy, rng, d) {
    const p = game.player;
    if (d <= 1) {
      Combat.enemyAttack(game, enemy);
      return true;
    }
    const dx = Math.sign(p.x - enemy.x), dy = Math.sign(p.y - enemy.y);
    // 穿墙走 (终点必须是可站格)
    const tryDirs = [[dx, dy], [dx, 0], [0, dy]];
    for (const [ex, ey] of tryDirs) {
      const nx = enemy.x + ex, ny = enemy.y + ey;
      if ((ex || ey) && game.level.inBounds(nx, ny) && game.level.walkable(nx, ny) && !occupied(game, nx, ny)) {
        moveEnemy(game, enemy, nx, ny);
        return true;
      }
    }
    stepRandom(game, enemy, rng);
    return true;
  }

  // ---------- 冲锋野猪: 同排/列直线冲锋 ----------
  function aiCharger(game, enemy, rng, d) {
    const p = game.player;
    const L = game.level;
    if (enemy.cool <= 0 && (p.x === enemy.x || p.y === enemy.y) && d >= 2 && d <= 6
      && Util.lineOfSight(enemy.x, enemy.y, p.x, p.y, (x, y) => L.blocksSight(x, y))) {
      enemy.cool = 3;
      game.msg(`${enemy.name} 低头冲锋!!`, 'dmg');
      AudioSys.play('roar');
      const dx = Math.sign(p.x - enemy.x), dy = Math.sign(p.y - enemy.y);
      for (let i = 0; i < 6; i++) {
        const nx = enemy.x + dx, ny = enemy.y + dy;
        if (nx === p.x && ny === p.y) break;
        if (!L.walkable(nx, ny) || occupied(game, nx, ny)) break;
        moveEnemy(game, enemy, nx, ny);
        FX.trail(enemy.x, enemy.y, '#b0785a');
      }
      if (Util.cdist(enemy.x, enemy.y, p.x, p.y) <= 1) {
        const saved = enemy.atk;
        enemy.atk = Math.round(saved * 1.5);
        Combat.enemyAttack(game, enemy);
        enemy.atk = saved;
      }
      return true;
    }
    enemy.cool--;
    return aiChase(game, enemy, rng, d);
  }

  // ---------- 暗影僧: 治疗同伴, 保持距离 ----------
  function aiHealer(game, enemy, rng, d) {
    const p = game.player;
    const L = game.level;
    const woundedAllies = () => L.enemies.filter(e => e !== enemy && e.hp > 0 && e.hp < e.maxHp * 0.85);
    if (enemy.cool <= 0) {
      const wounded = woundedAllies();
      if (wounded.length) {
        wounded.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
        const t = wounded[0];
        const heal = 5 + Math.round(L.floor / 2);
        t.hp = Math.min(t.maxHp, t.hp + heal);
        enemy.cool = 2;
        FX.ring(t.x, t.y, '#8fce6a');
        FX.float(t.x, t.y, '+' + heal, '#6fd07a');
        game.msg(`暗影僧治疗了 ${t.name} (+${heal})。`, 'warn');
        AudioSys.play('potion');
        return true;
      }
    }
    enemy.cool--;
    if (d <= 1) { Combat.enemyAttack(game, enemy); return true; }
    if (d <= 3) { stepAway(game, enemy, p.x, p.y, rng); return true; }
    const ally = L.enemies.find(e => e !== enemy && e.hp > 0 && e.hp < e.maxHp);
    if (ally) { stepToward(game, enemy, ally.x, ally.y, rng); return true; }
    return aiChase(game, enemy, rng, d);
  }

  // ---------- Boss: 屠夫 ----------
  function aiButcher(game, enemy, rng, d) {
    const p = game.player;
    // 二阶段: 半血狂怒
    if (!enemy.enraged && enemy.hp < enemy.maxHp * 0.5) {
      enemy.enraged = true;
      enemy.atk += 3;
      enemy.cool = 0;
      game.msg('屠夫·格罗 狂怒了!! 斧刃滴血!', 'dmg');
      game.shake(8);
      AudioSys.play('roar');
      FX.nova(enemy.x, enemy.y, '#ff5a4a', 3);
    }
    // 冲锋: 有冷却, 距离 2-4, 有视线
    const chargeCd = enemy.enraged ? 2 : 3;
    if (enemy.cool <= 0 && d >= 2 && d <= 4
      && Util.lineOfSight(enemy.x, enemy.y, p.x, p.y, (x, y) => game.level.blocksSight(x, y))) {
      enemy.cool = chargeCd;
      game.msg(`${enemy.name} 发起冲锋!!`, 'dmg');
      AudioSys.play('roar');
      // 直线冲 3 格
      const dx = Math.sign(p.x - enemy.x), dy = Math.sign(p.y - enemy.y);
      for (let i = 0; i < 3; i++) {
        const nx = enemy.x + dx, ny = enemy.y + dy;
        if (Util.cdist(nx, ny, p.x, p.y) === 0) break; // 撞到玩家
        if (!game.level.walkable(nx, ny) || occupied(game, nx, ny)) break;
        moveEnemy(game, enemy, nx, ny);
        FX.trail(enemy.x, enemy.y, '#ff5a4a');
      }
      if (Util.cdist(enemy.x, enemy.y, p.x, p.y) <= 1) {
        // 冲锋重击 ×1.5
        const saved = enemy.atk;
        enemy.atk = Math.round(saved * 1.5);
        Combat.enemyAttack(game, enemy);
        enemy.atk = saved;
      }
      return true;
    }
    enemy.cool--;
    return aiChase(game, enemy, rng, d);
  }

  // ---------- Boss: 骸骨王 ----------
  function aiKing(game, enemy, rng, d) {
    const p = game.player;
    const L = game.level;
    // 二阶段: 半血狂怒
    if (!enemy.enraged && enemy.hp < enemy.maxHp * 0.5) {
      enemy.enraged = true;
      enemy.atk += 2;
      enemy.cool = 0;
      game.msg('骸骨王的王冠燃烧了! 亡者大军, 起!', 'dmg');
      game.shake(8);
      AudioSys.play('roar');
      FX.nova(enemy.x, enemy.y, '#c9c4b4', 4);
    }
    const summonN = enemy.enraged ? 3 : 2;
    const novaCd = enemy.enraged ? 3 : 4;
    // 召唤: 有冷却, 场上骷髅有限
    if (enemy.cool <= 0 && rng.chance(0.5)) {
      const minions = L.enemies.filter(e => e.id === 'skeleton' && e.summonOf === true).length;
      const cap = enemy.enraged ? 4 : 3;
      if (minions < cap) {
        enemy.cool = 5;
        game.msg('骸骨王咆哮: 「起来, 我的仆从们!」', 'dmg');
        AudioSys.play('roar');
        let summoned = 0;
        for (const [dx, dy] of rng.shuffled(Util.DIRS8)) {
          if (summoned >= summonN) break;
          const nx = enemy.x + dx, ny = enemy.y + dy;
          if (!L.walkable(nx, ny) || occupied(game, nx, ny) || (nx === p.x && ny === p.y)) continue;
          const s = Enemies.mk('skeleton', L.floor, rng);
          s.x = nx; s.y = ny; s.awake = true; s.summonOf = true;
          L.enemies.push(s);
          FX.burst(nx, ny, '#c9c4b4', 8);
          summoned++;
        }
        if (summoned) game.msg(`骷髅从地里爬了出来!`, 'warn');
        return true;
      }
    }
    // 死亡之光: 有冷却, 有视线, 十字 8 格
    if (enemy.cool <= 0 && d <= 6
      && Util.lineOfSight(enemy.x, enemy.y, p.x, p.y, (x, y) => L.blocksSight(x, y))) {
      enemy.cool = novaCd;
      game.msg('骸骨王释放死亡之光!', 'dmg');
      AudioSys.play('magic');
      FX.nova(enemy.x, enemy.y, '#c9c4b4', 6);
      const dd = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y);
      if (dd <= 6 && (p.x === enemy.x || p.y === enemy.y)) {
        const dmg = Math.max(1, Math.round(rng.int(10, 15) + (enemy.enraged ? 3 : 0) - p.def / 2));
        Combat.hurtPlayer(game, dmg, { type: 'arcane', src: enemy });
      }
      return true;
    }
    enemy.cool--;
    return aiChase(game, enemy, rng, d);
  }

  // ---------- Boss: 深渊之龙 ----------
  function aiDragon(game, enemy, rng, d) {
    const p = game.player;
    const L = game.level;
    const enraged = enemy.hp < enemy.maxHp * 0.5;
    if (enraged && !enemy.enraged) {
      enemy.enraged = true;
      enemy.atk += 4;
      game.msg('深渊之龙狂怒了!! 火焰灼烧空气!', 'dmg');
      game.shake(10);
      AudioSys.play('roar');
    }
    // 火焰吐息: 直线 5 格
    const breathCd = enraged ? 2 : 3;
    if (enemy.cool <= 0 && d <= 5
      && Util.lineOfSight(enemy.x, enemy.y, p.x, p.y, (x, y) => L.blocksSight(x, y))) {
      enemy.cool = breathCd;
      game.msg('龙焰吞没了回廊!!', 'dmg');
      AudioSys.play('dragon');
      game.shake(8);
      // 直线延伸 5 格
      const dx = Math.sign(p.x - enemy.x), dy = Math.sign(p.y - enemy.y);
      let hx = enemy.x, hy = enemy.y;
      FX.boom(hx, hy);
      for (let i = 0; i < 5; i++) {
        const nx = hx + dx, ny = hy + dy;
        if (L.blocksSight(nx, ny)) break;
        hx = nx; hy = ny;
        FX.flame(hx, hy);
        if (hx === p.x && hy === p.y) {
          const dmg = Math.max(1, Math.round(rng.int(14, 20) + (enraged ? 4 : 0) - p.def / 2));
          Combat.hurtPlayer(game, dmg, { type: 'fire', src: enemy });
          Status.add(p, 'burn', 2, 3);
        }
      }
      return true;
    }
    // 振翅突进: 距离 > 3 时跳到玩家附近
    if (enemy.cool <= 0 && d > 3) {
      enemy.cool = 5;
      const spots = [];
      for (const [ddx, ddy] of Util.DIRS8) {
        const nx = p.x + ddx, ny = p.y + ddy;
        if (L.walkable(nx, ny) && !occupied(game, nx, ny)) spots.push({ x: nx, y: ny });
      }
      if (spots.length) {
        const s = rng.pick(spots);
        FX.burst(enemy.x, enemy.y, '#ff8c3a', 12);
        enemy.x = s.x; enemy.y = s.y;
        FX.burst(enemy.x, enemy.y, '#ff8c3a', 12);
        AudioSys.play('blink');
        game.msg('深渊之龙振翅扑至你面前!', 'dmg');
        return true;
      }
    }
    enemy.cool--;
    return aiChase(game, enemy, rng, d);
  }

  // ---------- 移动原语 ----------
  function occupied(game, x, y) {
    if (game.player.x === x && game.player.y === y) return true;
    return !!game.level.enemyAt(x, y);
  }

  function moveEnemy(game, enemy, nx, ny) {
    // 伏击锁定: 锁定房内的单位不能越过房间边界 (外面可以进来)
    if (game.lockedRoomAt) {
      const rf = game.lockedRoomAt(enemy.x, enemy.y);
      const rt = game.lockedRoomAt(nx, ny);
      if (rf && rf !== rt) return;
    }
    if (game.level.tile(nx, ny) === T.DOOR_C) {
      game.level.set(nx, ny, T.DOOR_O);
      game.msg('一只怪物撞开了木门!', 'warn');
    }
    FX.step(enemy, nx, ny);
    enemy.x = nx; enemy.y = ny;
  }

  /** A* 追击, 失败则贪心/随机 */
  function stepToward(game, enemy, tx, ty, rng) {
    const path = Path.aStar(game.level, enemy.x, enemy.y, tx, ty, {
      occupied: (x, y) => occupied(game, x, y),
      passFn: (x, y) => game.level.walkable(x, y) || game.level.tile(x, y) === T.DOOR_C,
    });
    if (path && path.length) {
      const n = path[0];
      if (!occupied(game, n.x, n.y)) { moveEnemy(game, enemy, n.x, n.y); return; }
    }
    // 贪心方向
    const [dx, dy] = Util.dirNorm(tx - enemy.x, ty - enemy.y);
    const nx = enemy.x + dx, ny = enemy.y + dy;
    if ((dx || dy) && game.level.walkable(nx, ny) && !occupied(game, nx, ny)) {
      moveEnemy(game, enemy, nx, ny);
      return;
    }
    stepRandom(game, enemy, rng);
  }

  function stepAway(game, enemy, fx, fy, rng) {
    const cands = [];
    for (const [dx, dy] of Util.DIRS8) {
      const nx = enemy.x + dx, ny = enemy.y + dy;
      if (!game.level.walkable(nx, ny) || occupied(game, nx, ny)) continue;
      const d = Util.dist(nx, ny, fx, fy);
      cands.push({ x: nx, y: ny, d });
    }
    if (cands.length) {
      cands.sort((a, b) => b.d - a.d);
      moveEnemy(game, enemy, cands[0].x, cands[0].y);
    } else stepRandom(game, enemy, rng);
  }

  function stepRandom(game, enemy, rng) {
    const dirs = rng.shuffled(Util.DIRS8);
    for (const [dx, dy] of dirs) {
      const nx = enemy.x + dx, ny = enemy.y + dy;
      if (game.level.walkable(nx, ny) && !occupied(game, nx, ny)) {
        moveEnemy(game, enemy, nx, ny);
        return;
      }
    }
  }

  function blinkAway(game, enemy, rng) {
    const lock = game.lockedRoomAt ? game.lockedRoomAt(enemy.x, enemy.y) : null;
    const spots = MapGen.spawnableTiles(game.level, 4, 12);
    const free = spots.filter(s => game.level.walkable(s.x, s.y) && !occupied(game, s.x, s.y)
      && (!lock || (s.x >= lock.x && s.x < lock.x + lock.w && s.y >= lock.y && s.y < lock.y + lock.h)));
    if (free.length) {
      const s = rng.pick(free);
      enemy.x = s.x; enemy.y = s.y;
      FX.burst(enemy.x, enemy.y, '#b197fc', 10);
    }
  }

  return { act };
})();
