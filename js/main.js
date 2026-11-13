// ============ MAIN: 游戏主控 / 回合引擎 ============
// 状态机: title → play → dead / win
// 玩家输入 → 玩家结算 → 敌人行动 → 状态 tick → 视野 → HUD

'use strict';

const Game = {
  state: 'title',
  seed: null,
  rng: null,
  floor: 1,
  level: null,
  player: null,
  turn: 0,
  endless: false,
  paused: true,
  won: false,
  auto: null,
  autoTimer: 0,
  banner: null,
  flashRed: 0,
  mouse: { x: -1, y: -1, px: 0, py: 0 },
  stats: null,
  backdrop: null,
  _lastT: 0,

  // ---------------- 初始化 ----------------
  init() {
    Meta.load();
    Render.init(Util.el('game'));
    HUD.init();
    Screens.init(this);
    window.Game = this;
    this.stats = this.defaultStats();
    this.bindInput();
    this.buildBackdrop();
    this.toTitle();
    requestAnimationFrame((t) => this.loop(t));
  },

  defaultStats() {
    return {
      kills: 0, damageDealt: 0, taken: 0, turns: 0, goldGained: 0,
      itemsUsed: 0, casts: 0, chests: 0, takenThisFloor: 0,
    };
  },

  /** 标题界面的动态背景 */
  buildBackdrop() {
    const seed = 'TITLE-' + Math.floor(Math.random() * 99999);
    const level = MapGen.generate(seed, 6);
    level.explored.fill(1);
    const sp = level.spawn;
    FOV.compute(level, sp.x, sp.y, 9);
    const fakePlayer = {
      x: sp.x, y: sp.y, anim: null, lunge: null, hp: 1, maxHp: 1,
      statuses: [], equip: {},
    };
    this.backdrop = {
      level, player: fakePlayer, mouse: { x: -1, y: -1, px: 0, py: 0 },
      banner: null, flashRed: 0,
    };
  },

  // ---------------- 主循环 ----------------
  loop(now) {
    const dt = Math.min(0.05, (now - this._lastT) / 1000 || 0.016);
    this._lastT = now;
    FX.update(dt);
    if (this.flashRed > 0) this.flashRed = Math.max(0, this.flashRed - dt * 2.2);

    if (this.state === 'play' && !this.paused && this.auto) {
      this.autoTimer -= dt * 1000;
      if (this.autoTimer <= 0) {
        this.autoTimer = 95;
        try { this.stepAuto(); } catch (e) { console.error('auto step error', e); this.stopAuto(); }
      }
    }

    const view = this.state !== 'title' && this.player ? this : (this.backdrop || this);
    const overlayOpen = typeof Screens !== 'undefined' && Screens.pausedByOverlay;
    const keepRendering = this.state === 'title' || !overlayOpen;
    if (keepRendering) {
      try {
        Render.draw(view, now);
      } catch (e) {
        console.error('render error', e);
      }
    }
    requestAnimationFrame((t) => this.loop(t));
  },

  // ---------------- 开局 / 读档 ----------------
  newRun(challenge, opts) {
    opts = opts || {};
    const seed = opts.seed || ('ABYSS-' + Math.random().toString(36).slice(2, 8).toUpperCase());
    this.seed = seed;
    this.rng = new RNG(seed);
    this.challenge = challenge || null;
    this.daily = !!opts.daily;
    this.floor = 1;
    this.turn = 0;
    this.endless = false;
    this.won = false;
    this.auto = null;
    this.paused = false;
    this.state = 'play';
    this.won = false;
    this.stats = this.defaultStats();
    this.player = this.makePlayer();
    FX.clear();
    HUD.clearLog();
    Screens.hideAll();
    AudioSys.unlock();
    AudioSys.startAmbience();
    Meta.newRun();
    this.enterFloor(1, true);
    this.msg('<b>你踏入了暗渊回廊。</b> 传说第 15 层盘踞着深渊之龙…', 'sys');
    this.msg('提示: WASD/方向键移动, 撞击敌人攻击; 按 <b>H</b> 查看完整操作。', 'sys');
    this.saveRun(false);
    HUD.update(this);
  },

  makePlayer() {
    const p = {
      name: '旅者',
      x: 0, y: 0, anim: null, lunge: null,
      baseMaxHp: CONFIG.PLAYER.HP, baseMaxMp: CONFIG.PLAYER.MP,
      baseAtk: CONFIG.PLAYER.ATK, baseDef: CONFIG.PLAYER.DEF,
      hp: CONFIG.PLAYER.HP, mp: CONFIG.PLAYER.MP,
      maxHp: CONFIG.PLAYER.HP, maxMp: CONFIG.PLAYER.MP,
      atk: CONFIG.PLAYER.ATK, def: 0, acc: 85, eva: 5, crit: 5,
      level: 1, xp: 0, gold: 10,
      inv: [Items.mk('p_hp_s', 3), Items.mk('p_mp', 1)],
      equip: { weapon: null, weapon2: null, armor: Items.mk('a_cloth'), trinket: null },
      kills: 0, statuses: [], flags: {}, boons: {}, baseFov: 0,
    };
    this.attachPlayerMethods(p);
    // 局外天赋 (魂晶解锁) 开局生效
    Talents.apply(p, Meta.data.talents || {});
    return p;
  },

  attachPlayerMethods(p) {
    p.heal = function (n, silent) {
      // 药剂师祝福: 药水效果加成 (仅对下一次 heal 生效, 由 useItem 设置)
      n = Math.round(n * (this._potionMul || 1));
      this._potionMul = 1;
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + n);
      if (n > 0 && !silent) FX.float(this.x, this.y - 0.3, '+' + (this.hp - before), '#6fd07a');
    };
    p.gainMp = function (n) {
      const before = this.mp;
      this.mp = Math.min(this.maxMp, this.mp + n);
      if (this.mp > before) FX.float(this.x, this.y - 0.3, '+MP', '#4dabf7');
    };
  },

  /** 每日挑战: 日期决定种子与因子, 全世界同一天同一张地牢 */
  startDaily() {
    const d = new Date();
    const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const rng = new RNG('DAILY-' + ymd);
    const factor = CONFIG.CHALLENGES[rng.int(0, CONFIG.CHALLENGES.length - 1)];
    this.newRun(factor, { seed: 'DAILY-' + ymd, daily: true });
    this.msg(`☀️ <b>每日挑战 ${ymd}</b> — 今日因子: ${factor.icon} ${factor.name}`, 'magic');
    HUD.update(this);
  },

  continueRun() {
    const d = SaveSys.load();
    if (!d) {
      HUD.toast('没有可用的存档');
      return;
    }
    this.seed = d.seed;
    this.rng = new RNG(d.seed);
    this.challenge = d.challenge || null;
    this.floor = d.floor;
    this.turn = d.turn;
    this.endless = d.mode === 'endless';
    this.level = d.levelObj;
    this.stats = Object.assign(this.defaultStats(), d.stats);
    this.state = 'play';
    this.paused = false;
    this.auto = null;
    this.won = false;
    const p = Object.assign({}, d.player);
    p.anim = null; p.lunge = null;
    this.attachPlayerMethods(p);
    this.player = p;
    this.recalcStats();
    FX.clear();
    Screens.hideAll();
    HUD.clearLog();
    AudioSys.startAmbience();
    const r = this.fovRadius();
    FOV.compute(this.level, p.x, p.y, r);
    this.banner = { text: `第 ${this.floor} 层 · ${this.level.theme.name}`, sub: '读档继续', t: performance.now() };
    this.msg('你从营地醒来, 继续下潜…', 'sys');
    HUD.update(this);
  },

  toTitle() {
    this.state = 'title';
    this.paused = true;
    this.auto = null;
    Screens.title();
  },

  abandon() {
    SaveSys.clear();
    this.msg('你放弃了这次下潜。', 'sys');
    this.toTitle();
  },

  // ---------------- 属性 ----------------
  recalcStats() {
    const p = this.player;
    if (!p) return;
    // 防御: 旧存档 / 异常数据补齐基础值 (null / undefined / NaN 都视为无效)
    const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : NaN;
    if (!isFinite(num(p.baseMaxHp))) p.baseMaxHp = CONFIG.PLAYER.HP + (p.level - 1) * CONFIG.LEVEL_UP.HP;
    if (!isFinite(num(p.baseMaxMp))) p.baseMaxMp = CONFIG.PLAYER.MP + (p.level - 1) * CONFIG.LEVEL_UP.MP;
    if (!isFinite(num(p.baseAtk))) p.baseAtk = CONFIG.PLAYER.ATK + (p.level - 1) * CONFIG.LEVEL_UP.ATK;
    if (!isFinite(num(p.baseDef))) p.baseDef = Math.floor(p.level / CONFIG.LEVEL_UP.DEF_EVERY);
    if (!isFinite(num(p.level)) || p.level < 1) p.level = 1;
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
    // 双持成就
    if (p.equip.weapon && p.equip.weapon2) Meta.unlock('dual_wield');
    if (!isFinite(num(p.hp)) || p.hp <= 0) p.hp = p.maxHp;
    if (!isFinite(num(p.mp)) || p.mp < 0) p.mp = p.maxMp;
    p.hp = Math.min(p.hp, p.maxHp);
    p.mp = Math.min(p.mp, p.maxMp);
  },

  fovRadius() {
    let base = this.level ? (this.level.theme.radius || CONFIG.FOV_RADIUS) : CONFIG.FOV_RADIUS;
    const p = this.player;
    if (p) {
      base += ((p.flags && p.flags.farSight) || 0) + (p.baseFov || 0);
      if (p.boons) base += (Boons.bonus(p).flag.farSight || 0);
    }
    if (this.challenge && this.challenge.fog) base += this.challenge.fog;
    return Math.max(3, Math.round(base));
  },

  // ---------------- 楼层 ----------------
  enterFloor(floor, isFresh) {
    this.floor = floor;
    const chal = this.challenge ? {
      hpMul: this.challenge.hpMul, atkMul: this.challenge.atkMul,
      defAdd: this.challenge.defAdd, rewardMul: this.challenge.rewardMul,
    } : null;
    this.level = MapGen.generate(this.seed, floor, { chal });
    const p = this.player;
    p.x = this.level.spawn.x;
    p.y = this.level.spawn.y;
    p.anim = null; p.lunge = null;
    this.stats.takenThisFloor = 0;
    FX.clear();
    FX.ring(p.x, p.y, PALETTE.gold);
    const theme = this.level.theme;
    this.banner = {
      text: `第 ${floor} 层 · ${theme.name}` + (this.challenge ? ` · ${this.challenge.icon}${this.challenge.name}` : ''),
      sub: theme.boss ? '⚠ 空气变得灼热沉重…有强大的存在盘踞于此' : (this.challenge ? this.challenge.desc : ''),
      t: performance.now(),
    };
    const r = this.fovRadius();
    FOV.compute(this.level, p.x, p.y, r);
    // 铁壁祝福: 每层护盾
    if (p.flags && p.flags.floorShield) Status.add(p, 'shield', 99, p.flags.floorShield);
    // 恶魔契约诅咒: 每层开始中毒
    if (p.flags && p.flags.poisonPerFloor) {
      Status.add(p, 'poison', 3, 2);
      this.msg('😈 恶魔契约生效 — 毒素在血液里苏醒…', 'warn');
    }
    // 探图者天赋
    if (Meta.data.talents && Meta.data.talents.t_map) this.revealPartial(0.3);
    if (!isFresh) {
      AudioSys.play('descend');
      this.msg(`你走下石阶, 来到 <b>第 ${floor} 层 · ${theme.name}</b>。`, 'sys');
    }
    HUD.update(this);
    Meta.check(this);
    // 每层祝福三选一
    this.offerBoons();
  },

  /** 局外天赋: 每层随机映出部分地图 */
  revealPartial(frac) {
    const L = this.level;
    const walkable = [];
    for (let i = 0; i < L.tiles.length; i++) {
      if (!Tiles.blocksMove(L.tiles[i]) || L.tiles[i] === T.DOOR_C) walkable.push(i);
    }
    const n = Math.floor(walkable.length * frac);
    for (let i = 0; i < n; i++) {
      const k = walkable[this.rng.int(0, walkable.length - 1)];
      L.explored[k] = 1;
    }
    this.msg('🗺️ 探图者天赋: 本层部分地图已映入脑海。', 'magic');
  },

  // ---------------- 祝福三选一 ----------------
  offerBoons() {
    if (this.state !== 'play') return;
    this.boonChoices = Boons.sample(this.rng, 3);
    Screens.showBoonChoices(this.boonChoices);
    this.paused = true;
  },

  chooseBoon(idx) {
    if (!this.boonChoices) return;
    const id = this.boonChoices[idx];
    if (!id) return;
    Boons.give(this.player, id);
    const d = Boons.def(id);
    const n = this.player.boons[id];
    this.msg(`✨ 获得祝福: ${d.icon} <b>${d.name}</b>${n > 1 ? ' ×' + n : ''} — ${d.desc}`, 'magic');
    AudioSys.play('levelup');
    this.recalcStats();
    this.boonChoices = null;
    Screens.hideBoonChoices();
    this.paused = false;
    HUD.update(this);
    this.saveRun(false);
  },

  descend() {
    if (this.state !== 'play') return;
    if (!this.endless && this.floor === 15 && this.dragonAlive()) {
      this.msg('深渊之龙的威压锁住了阶梯。必须先击败它!', 'warn');
      HUD.toast('⚠ 击败深渊之龙才能继续');
      AudioSys.play('error');
      return;
    }
    // 无伤过层成就
    if (this.floor >= 1 && this.stats.takenThisFloor === 0 && this.floor > 1) {
      Meta.unlock('nohit_floor');
    }
    this.floor++;
    this.auto = null;
    this.enterFloor(this.floor, false);
    this.saveRun(false);
    this.msg('进度已自动保存。', 'sys');
  },

  dragonAlive() {
    return this.level.enemies.some(e => e.id === 'boss_dragon' && e.hp > 0);
  },

  // ---------------- 回合 ----------------
  canAct() {
    return this.state === 'play' && !this.paused && this.player && this.player.hp > 0;
  },

  /** 玩家移动 / 撞墙攻击 */
  move(dx, dy, fromAuto) {
    if (!this.canAct()) return false;
    if (this.auto && !fromAuto) this.stopAuto(true);
    const p = this.player, L = this.level;
    const nx = p.x + dx, ny = p.y + dy;
    if (!L.inBounds(nx, ny)) return false;

    const e = L.enemyAt(nx, ny);
    if (e) {
      Combat.playerAttack(this, e);
      this.afterAction();
      return true;
    }
    // 远程武器: 朝向有目标则射击而非移动
    if (this.tryRangedAttack(dx, dy)) {
      this.afterAction();
      return true;
    }
    const t = L.tile(nx, ny);
    if (t === T.DOOR_C) {
      if (this.lockedDoorAt(nx, ny)) {
        this.msg('大门被邪能锁死了, 无法打开!', 'warn');
        return false;
      }
      L.set(nx, ny, T.DOOR_O);
      this.msg('吱呀一声, 木门打开了。', 'sys');
      AudioSys.play('open');
      this.afterAction();
      return true;
    }
    if (Tiles.blocksMove(t)) {
      // 撞墙: 不消耗回合, 但阻止穿墙
      return false;
    }
    FX.step(p, nx, ny);
    p.x = nx; p.y = ny;
    this.onEnterTile();
    this.afterAction();
    return true;
  },

  /** 进入格子: 拾取 / 提示 */
  onEnterTile() {
    const p = this.player, L = this.level;
    // 金币
    const gi = L.golds.findIndex(gd => gd.x === p.x && gd.y === p.y);
    if (gi >= 0) {
      const gd = L.golds[gi];
      this.gainGold(gd.n);
      L.golds.splice(gi, 1);
      AudioSys.play('gold');
      FX.float(p.x, p.y - 0.3, '+' + gd.n + ' 金币', PALETTE.gold);
    }
    // 物品
    const its = L.itemsAt(p.x, p.y);
    for (const it of its) {
      if (it.price) {
        HUD.toast(`💰 ${ITEMS[it.id].name} 售价 ${it.price} 金币 — 按 Enter 购买`, 2600);
        continue;
      }
      if (this.addToInv(it)) {
        const idx = L.items.indexOf(it);
        if (idx >= 0) L.items.splice(idx, 1);
        AudioSys.play('pickup');
      }
    }
    // 地形提示
    const tile = L.tile(p.x, p.y);
    if (tile === T.STAIRS) {
      HUD.toast(this.floor === 15 ? '⬇ 按 Enter 离开深渊' : '⬇ 按 Enter 下楼', 2200);
    } else if (tile === T.FOUNTAIN) {
      HUD.toast('⛲ 按 Enter 饮用泉水 (回满状态)', 2200);
    }
    // 相邻交互提示
    const near = this.adjacentTiles();
    for (const n of near) {
      const nt = L.tile(n.x, n.y);
      if (nt === T.CHEST) { HUD.toast('📦 按 Enter 开启宝箱', 2200); break; }
      if (nt === T.FOUNTAIN) { HUD.toast('⛲ 按 Enter 饮用泉水', 2200); break; }
      if (nt === T.ALTAR) { HUD.toast('⚱️ 按 Enter 向祭坛献祭 60 金币', 2200); break; }
      if (nt === T.SHOPKEEP) { HUD.toast('🧞 商人: 踩上商品按 Enter 购买', 2400); break; }
    }
    // 伏击房触发检查
    this.triggerAmbushCheck();
  },

  /** 副手武器切换 (不耗回合) */
  swapWeapon() {
    if (!this.canAct()) return;
    const p = this.player;
    if (!p.equip.weapon2) { HUD.toast('🗡 副手上没有武器 (背包里的第二把武器会自动放入副手)'); AudioSys.play('error'); return; }
    const a = p.equip.weapon, b = p.equip.weapon2;
    p.equip.weapon = b; p.equip.weapon2 = a;
    this.recalcStats();
    this.msg(`切换到 ${Affixes.displayName(p.equip.weapon)}。`, 'item');
    AudioSys.play('swap');
    HUD.refreshInv(this);
  },

  /**
   * 远程武器尝试攻击:
   * bow/bom → 按键方向直线弹道; wand → 按键朝向存在敌人时自动锁定 (2 法力/发)。
   * 返回 true 表示进行了攻击 (消耗回合)。
   */
  tryRangedAttack(dx, dy) {
    const p = this.player, L = this.level;
    const w = p.equip.weapon;
    if (!w) return false;
    const d = ITEMS[w.id];
    if (!d.sub || d.sub === 'melee') return false;

    if (d.sub === 'wand') {
      const vis = this.enemiesVisible().filter(e => Util.dist(p.x, p.y, e.x, e.y) <= d.range);
      const aligned = vis.find(e =>
        (dx === 0 || Math.sign(e.x - p.x) === dx) &&
        (dy === 0 || Math.sign(e.y - p.y) === dy));
      if (!aligned) return false;
      if (p.mp < 2) { HUD.toast('💧 法力不足 (法杖需 2 法力/发)'); AudioSys.play('error'); return false; }
      p.mp -= 2;
      // 连锁法杖: 魔法弹在敌人间弹跳
      const entries = [{ t: aligned, mult: 1 }];
      if (d.flag && d.flag.chain) {
        let last = aligned, mult = 1;
        const hitSet = new Set([aligned]);
        for (let j = 0; j < d.flag.chain; j++) {
          mult *= 0.7;
          const next = vis
            .filter(e => e.hp > 0 && !hitSet.has(e) && Util.dist(last.x, last.y, e.x, e.y) <= 4)
            .sort((a, b) => Util.dist2(last.x, last.y, a.x, a.y) - Util.dist2(last.x, last.y, b.x, b.y))[0];
          if (!next) break;
          hitSet.add(next);
          entries.push({ t: next, mult });
          last = next;
        }
      }
      Combat.playerRanged(this, w, entries, 'wand');
      return true;
    }
    if (d.sub === 'scatter') {
      // 散弹弩: 正交方向触发扇形三矢 (本方向 + 两侧 45°)
      if (dx !== 0 && dy !== 0) return false;
      const lines = (dx !== 0) ? [[dx, 0], [dx, -1], [dx, 1]] : [[0, dy], [1, dy], [-1, dy]];
      const entries = [];
      for (const [lx, ly] of lines) {
        let x = p.x, y = p.y;
        for (let i = 0; i < d.range; i++) {
          x += lx; y += ly;
          if (!L.inBounds(x, y) || L.blocksSight(x, y)) break;
          const e = L.enemyAt(x, y);
          if (e) { entries.push({ t: e, mult: 1 }); break; }
        }
      }
      if (!entries.length) return false;
      Combat.playerRanged(this, w, entries, 'scatter');
      return true;
    }
    // bow / bom: 正交直线
    if (dx !== 0 && dy !== 0) return false;
    const hits = [];
    let x = p.x, y = p.y;
    for (let i = 0; i < d.range; i++) {
      x += dx; y += dy;
      if (!L.inBounds(x, y) || L.blocksSight(x, y)) break;
      const e = L.enemyAt(x, y);
      if (e) {
        hits.push({ t: e, mult: 1 });
        // 穿云弓贯穿一整排; 回旋刃至多 2 个; 普通弓命中第一个
        if (d.flag && d.flag.pierceLine) { if (hits.length >= 4) break; }
        else if (d.sub === 'bom') { if (hits.length >= 2) break; }
        else break;
      }
    }
    if (!hits.length) return false;
    Combat.playerRanged(this, w, hits, d.sub);
    return true;
  },

  // ---------------- 伏击房 (关门打狗) ----------------
  lockedDoorAt(x, y) {
    const L = this.level;
    if (!L.ambushRooms) return false;
    return L.ambushRooms.some(r => r.triggered && !r.cleared
      && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  },

  triggerAmbushCheck() {
    const L = this.level, p = this.player;
    if (!L.ambushRooms || !L.ambushRooms.length || this.state !== 'play') return;
    for (const room of L.ambushRooms) {
      if (room.triggered || room.cleared) continue;
      if (p.x >= room.x && p.x < room.x + room.w && p.y >= room.y && p.y < room.y + room.h) {
        this.triggerAmbush(room);
      }
    }
  },

  triggerAmbush(room) {
    const L = this.level, p = this.player;
    room.triggered = true;
    // 封门: 房间边缘通向外界的格子变成锁死的门 (玩家脚下的门也封)
    let sealed = 0;
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const edge = (x === room.x || x === room.x + room.w - 1 || y === room.y || y === room.y + room.h - 1);
        if (!edge) continue;
        const t = L.tile(x, y);
        if (t === T.FLOOR || t === T.DOOR_O || t === T.GRASS || t === T.BONES || t === T.CRACK) {
          const outside = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([ox, oy]) =>
            (ox < room.x || ox >= room.x + room.w || oy < room.y || oy >= room.y + room.h) && L.walkable(ox, oy));
          if (outside) { L.set(x, y, T.DOOR_C); sealed++; }
        }
      }
    }
    // 刷伏击波
    const rng = this.rng;
    const n = 2 + Math.min(3, Math.floor(this.floor / 3));
    const inner = [];
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (L.walkable(x, y) && !(x === p.x && y === p.y) && !L.enemyAt(x, y)) inner.push({ x, y });
      }
    }
    rng.shuffle(inner);
    for (let i = 0; i < n && i < inner.length; i++) {
      const id = Enemies.pickForFloor(this.floor, rng);
      const e = Enemies.mk(id, this.floor, rng, { chal: L.chal });
      e.x = inner[i].x; e.y = inner[i].y; e.homeX = e.x; e.homeY = e.y;
      e.awake = true;
      e.ambusher = room;
      L.enemies.push(e);
      FX.burst(e.x, e.y, '#ff7b72', 8);
    }
    this.msg('🚪 <b>咔嚓!</b> 大门在身后关上了 — 是伏击!', 'dmg');
    HUD.toast('⚠ 伏击! 清空房间里的敌人才能离开');
    AudioSys.play('roar');
    this.shake(6);
  },

  /** 伏击房清场 → 开门 + 奖励 (killEnemy 后调用) */
  checkAmbushClear() {
    const L = this.level;
    if (!L.ambushRooms) return;
    for (const room of L.ambushRooms) {
      if (!room.triggered || room.cleared) continue;
      const alive = L.enemies.some(e => e.ambusher === room && e.hp > 0);
      if (!alive) {
        room.cleared = true;
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            if (L.tile(x, y) === T.DOOR_C) L.set(x, y, T.FLOOR);
          }
        }
        const rng = this.rng;
        const it = Items.randomItem(rng, this.floor + 1, { eq: true });
        it.x = room.cx; it.y = room.cy;
        L.items.push(it);
        const goldN = rng.int(30, 60) + this.floor * 10;
        L.golds.push({ x: room.cx, y: room.cy, n: goldN });
        this.msg('🔓 伏击已清剿! 战利品散落在房间中央。', 'good');
        HUD.toast('✅ 清剿成功! 快去拾取奖励');
        Meta.unlock('ambush_clear');
        this.stats.ambushCleared = (this.stats.ambushCleared || 0) + 1;
        AudioSys.play('chest');
        FX.ring(room.cx, room.cy, PALETTE.gold);
      }
    }
  },

  adjacentTiles() {
    const out = [];
    for (const [dx, dy] of Util.DIRS8) {
      const x = this.player.x + dx, y = this.player.y + dy;
      if (this.level.inBounds(x, y)) out.push({ x, y });
    }
    return out;
  },

  addToInv(it) {
    const p = this.player;
    const def = ITEMS[it.id];
    if (def.stack) {
      const ex = p.inv.find(o => o && o.id === it.id);
      if (ex) {
        ex.count = (ex.count || 1) + (it.count || 1);
        this.msg(`获得 ${def.name} ×${it.count || 1}。`, 'item');
        return true;
      }
    }
    if (p.inv.filter(Boolean).length >= CONFIG.INV_MAX) {
      this.msg('背包已满! (右键丢弃物品)', 'warn');
      HUD.toast('🎒 背包已满');
      return false;
    }
    it.x = -1; it.y = -1;
    if (it.price) delete it.price;
    p.inv.push(it);
    // QoL: 对应装备槽为空时自动装备
    if (Items.isEq(it)) {
      const slot = def.kind === 'armor' ? 'armor' : (def.kind === 'trinket' ? 'trinket' : 'weapon');
      if (!p.equip[slot]) {
        p.equip[slot] = it;
        p.inv.splice(p.inv.indexOf(it), 1);
        this.recalcStats();
        this.msg(`自动装备了 ${Affixes.displayName(it)}。`, 'item');
      }
    }
    this.msg(`获得 ${def.name}${it.count > 1 ? ' ×' + it.count : ''}。`, 'item');
    HUD.refreshInv(this);
    return true;
  },

  quickPotion() {
    if (!this.canAct()) return;
    const idx = this.player.inv.findIndex(it => it && it.id === 'p_hp_s');
    const idx2 = idx >= 0 ? idx : this.player.inv.findIndex(it => it && it.id === 'p_hp_l');
    if (idx2 < 0) { HUD.toast('没有治疗药水'); AudioSys.play('error'); return; }
    this.useItem(idx2);
  },

  useItem(invIdx) {
    if (!this.canAct()) return;
    if (this.auto) this.stopAuto(true);
    const p = this.player;
    const it = p.inv[invIdx];
    if (!it) return;
    if (Items.isEq(it)) { this.equipItem(invIdx); return; }
    const def = ITEMS[it.id];
    // 药剂师祝福
    if (p.flags && p.flags.potionMul) p._potionMul = p.flags.potionMul;
    const consumed = def.onUse ? def.onUse(this, it) : false;
    if (!consumed) return;
    this.stats.itemsUsed++;
    it.count = (it.count || 1) - 1;
    if (it.count <= 0) p.inv.splice(invIdx, 1);
    HUD.refreshInv(this);
    this.afterAction();
  },

  equipItem(invIdx) {
    if (!this.canAct()) return;
    if (this.auto) this.stopAuto(true);
    const p = this.player;
    const it = p.inv[invIdx];
    if (!it) return;
    const def = ITEMS[it.id];
    const slot = def.kind === 'armor' ? 'armor' : (def.kind === 'trinket' ? 'trinket' : 'weapon');
    // 主手已有武器且副手为空 → 放入副手
    if (slot === 'weapon' && p.equip.weapon && !p.equip.weapon2) {
      p.inv.splice(invIdx, 1);
      p.equip.weapon2 = it;
      this.recalcStats();
      this.msg(`${Affixes.displayName(it)} 装入副手。按 <b>X</b> 随时切换主副手。`, 'item');
      AudioSys.play('swap');
      HUD.refreshInv(this);
      this.afterAction();
      return;
    }
    p.inv.splice(invIdx, 1);
    const old = p.equip[slot];
    p.equip[slot] = it;
    if (old) p.inv.push(old);
    this.recalcStats();
    this.msg(`装备了 ${Affixes.displayName(it)}。`, 'item');
    AudioSys.play('pickup');
    HUD.refreshInv(this);
    this.afterAction();
  },

  unequip(slot) {
    if (!this.canAct()) return;
    const p = this.player;
    const it = p.equip[slot];
    if (!it) return;
    if (p.inv.filter(Boolean).length >= CONFIG.INV_MAX) {
      HUD.toast('🎒 背包已满, 先丢点东西');
      return;
    }
    p.equip[slot] = null;
    p.inv.push(it);
    this.recalcStats();
    this.msg(`卸下了 ${ITEMS[it.id].name}。`, 'sys');
    HUD.refreshInv(this);
    this.afterAction();
  },

  dropItem(invIdx) {
    if (!this.canAct()) return;
    const p = this.player;
    const it = p.inv[invIdx];
    if (!it) return;
    p.inv.splice(invIdx, 1);
    it.x = p.x; it.y = p.y;
    if (it.price) delete it.price;
    this.level.items.push(it);
    this.msg(`丢弃了 ${ITEMS[it.id].name}。`, 'sys');
    HUD.refreshInv(this);
  },

  invClicked(i) {
    const p = this.player;
    const it = p.inv[i];
    if (!it) return;
    if (this.state !== 'play') return;
    if (Items.isEq(it)) this.equipItem(i);
    else this.useItem(i);
  },

  invRightClicked(i) {
    if (this.state !== 'play') return;
    if (!this.player.inv[i]) return;
    this.dropItem(i);
  },

  // ---------------- 交互 ----------------
  interact() {
    if (!this.canAct()) return;
    if (this.auto) this.stopAuto(true);
    const p = this.player, L = this.level;
    const here = L.tile(p.x, p.y);

    // 商店商品
    const shopItem = L.itemsAt(p.x, p.y).find(it => it.price);
    if (shopItem) { this.buy(shopItem); return; }

    // 楼梯
    if (here === T.STAIRS) { this.interactStairs(); return; }
    // 泉水
    if (here === T.FOUNTAIN) { this.drinkFountain(); return; }

    // 相邻交互
    const near = this.adjacentTiles();
    let chest = null, altar = null, fountain = null, stairs = null, shopkeep = null;
    for (const n of near) {
      const t = L.tile(n.x, n.y);
      if (t === T.CHEST && !chest) chest = n;
      else if (t === T.ALTAR && !altar) altar = n;
      else if (t === T.FOUNTAIN && !fountain) fountain = n;
      else if (t === T.STAIRS && !stairs) stairs = n;
      else if (t === T.SHOPKEEP && !shopkeep) shopkeep = n;
    }
    if (chest) { this.openChest(chest); return; }
    if (altar) { this.useAltar(altar); return; }
    if (fountain) {
      // 相邻泉水: 先走上去
      this.move(Math.sign(fountain.x - p.x), Math.sign(fountain.y - p.y));
      return;
    }
    if (stairs) { this.move(Math.sign(stairs.x - p.x), Math.sign(stairs.y - p.y)); return; }
    if (shopkeep) {
      this.msg('🧞 商人笑眯眯地看着你: 「踩上商品, 按 Enter 付钱。」', 'item');
      return;
    }
    // 脚下非免费物品 (不会发生, 自动拾取) / 无目标
    HUD.toast('这里没有可交互的东西');
  },

  interactStairs() {
    if (this.floor === 15 && !this.endless) {
      if (this.dragonAlive()) {
        this.msg('深渊之龙的威压锁住了阶梯。必须先击败它!', 'warn');
        HUD.toast('⚠ 深渊之龙还在盘踞…');
        return;
      }
      this.win();
      return;
    }
    this.descend();
  },

  drinkFountain() {
    const L = this.level, p = this.player;
    if (L.fountainUsed) { this.msg('泉水已经干涸了。', 'sys'); return; }
    L.fountainUsed = true;
    L.set(p.x, p.y, T.FLOOR);
    p.hp = p.maxHp; p.mp = p.maxMp;
    FX.ring(p.x, p.y, '#4dabf7');
    FX.levelUp(p.x, p.y);
    this.msg('⛲ 你饮下清泉, 生命与法力完全恢复! 泉水随之干涸。', 'good');
    AudioSys.play('fountain');
    this.afterAction();
  },

  openChest(at) {
    const L = this.level, p = this.player;
    if (L.chest && L.chest.opened) { this.msg('宝箱已经空了。', 'sys'); return; }
    if (L.chest) L.chest.opened = true;
    L.set(at.x, at.y, T.FLOOR);
    // 战利品
    const drops = [
      Items.randomItem(rng, this.floor + 1, { eq: true }),
      Items.randomItem(rng, this.floor, {}),
    ];
    for (const it of drops) {
      it.x = at.x; it.y = at.y;
      L.items.push(it);
    }
    const goldN = rng.int(25, 45) + this.floor * 8;
    L.golds.push({ x: at.x, y: at.y, n: goldN });
    FX.ring(at.x, at.y, PALETTE.gold);
    FX.burst(at.x, at.y, PALETTE.gold, 16);
    this.msg(`📦 宝箱打开了! 里面散落着 ${drops.map(it => Affixes.displayName(it)).join('、')} 与 ${goldN} 金币。`, 'item');
    this.stats.chests++;
    Meta.chestOpened();
    Meta.unlock('chest_5');
    AudioSys.play('chest');
    this.afterAction();
  },

  useAltar(at) {
    const L = this.level, p = this.player;
    if (L.altarUsed) { this.msg('祭坛已经沉寂了。', 'sys'); return; }
    const COST = 60;
    if (p.gold < COST) { this.msg(`祭坛需要 ${COST} 金币的献祭。你的钱不够。`, 'warn'); return; }
    p.gold -= COST;
    L.altarUsed = true;
    const rng = this.rng;
    const bless = rng.pick(['atk', 'def', 'hp', 'mp']);
    AudioSys.play('levelup');
    FX.ring(p.x, p.y, PALETTE.gold);
    FX.nova(p.x, p.y, PALETTE.gold, 2);
    if (bless === 'atk') {
      p.baseAtk += 1;
      this.msg('⚱️ 深渊之力涌入双臂 — <b>攻击永久 +1</b>!', 'magic');
    } else if (bless === 'def') {
      p.baseDef += 1;
      this.msg('⚱️ 你的皮肤变得坚韧 — <b>防御永久 +1</b>!', 'magic');
    } else if (bless === 'hp') {
      p.baseMaxHp += 8; p.hp += 8;
      this.msg('⚱️ 生命之泉在体内涌动 — <b>生命上限 +8</b>!', 'magic');
    } else {
      p.baseMaxMp += 6; p.mp += 6;
      this.msg('⚱️ 灵魂变得丰盈 — <b>法力上限 +6</b>!', 'magic');
    }
    this.recalcStats();
    Meta.unlock('skill_first');
    HUD.update(this);
  },

  buy(it) {
    const p = this.player;
    const price = it.price;
    if (p.gold < price) {
      this.msg(`金币不够 (需要 ${price})。`, 'warn');
      HUD.toast('💰 金币不足');
      AudioSys.play('error');
      return;
    }
    if (p.inv.filter(Boolean).length >= CONFIG.INV_MAX && !(ITEMS[it.id].stack && p.inv.some(o => o && o.id === it.id))) {
      HUD.toast('🎒 背包已满');
      AudioSys.play('error');
      return;
    }
    p.gold -= price;
    const idx = this.level.items.indexOf(it);
    if (idx >= 0) this.level.items.splice(idx, 1);
    delete it.price;
    it.x = -1; it.y = -1;
    this.addToInv(it);
    this.msg(`💰 你花 ${price} 金币买下了 ${ITEMS[it.id].name}。`, 'item');
    AudioSys.play('buy');
    this.afterAction();
  },

  // ---------------- 技能 ----------------
  castSkill(idx) {
    if (!this.canAct()) return;
    if (this.auto) this.stopAuto(true);
    const p = this.player;
    const sk = CONFIG.SKILLS[idx];
    if (!sk) return;
    if (p.level < sk.lv) {
      HUD.toast(`🔒 ${sk.name} 需要 Lv.${sk.lv}`);
      AudioSys.play('error');
      return;
    }
    if (p.mp < sk.mp) {
      this.msg('法力不足。', 'warn');
      HUD.toast('💧 法力不足');
      AudioSys.play('error');
      return;
    }
    const L = this.level;
    const vis = this.enemiesVisible();
    let acted = false;
    const rng = this.rng;

    switch (sk.id) {
      case 'fireball': {
        if (!vis.length) { HUD.toast('🔥 视野内没有目标'); AudioSys.play('error'); return; }
        const t = vis.sort((a, b) => Util.dist2(a.x, a.y, p.x, p.y) - Util.dist2(b.x, b.y, p.x, p.y))[0];
        p.mp -= sk.mp;
        FX.projectile(p.x, p.y, t.x, t.y, '#ff9538');
        FX.boom(t.x, t.y);
        AudioSys.play('fireball');
        const dmg = Math.round((12 + p.level) * ((p.flags && p.flags.fireMul) || 1));
        this.msg(`🔥 火球命中了 ${t.name}!`, 'magic');
        Combat.hurtEnemy(this, t, dmg, { type: 'fire' });
        for (const e of L.enemies) {
          if (e === t || e.hp <= 0) continue;
          if (Util.cdist(e.x, e.y, t.x, t.y) <= 1) {
            Combat.hurtEnemy(this, e, Math.round(dmg * 0.5), { type: 'fire' });
            FX.flame(e.x, e.y);
          }
        }
        acted = true;
        break;
      }
      case 'heal': {
        if (p.hp >= p.maxHp * 0.98) { HUD.toast('✨ 状态很好, 不需要治疗'); return; }
        p.mp -= sk.mp;
        const n = 15 + 3 * p.level;
        p.heal(n);
        FX.ring(p.x, p.y, '#6fd07a');
        FX.levelUp(p.x, p.y);
        AudioSys.play('potion');
        this.msg(`✨ 柔和的光包裹着你, 恢复 ${Math.min(n, p.maxHp - p.hp + n)} 生命。`, 'good');
        acted = true;
        break;
      }
      case 'lightning': {
        if (!vis.length) { HUD.toast('⚡ 视野内没有目标'); AudioSys.play('error'); return; }
        p.mp -= sk.mp;
        const targets = vis.sort((a, b) => Util.dist2(a.x, a.y, p.x, p.y) - Util.dist2(b.x, b.y, p.x, p.y)).slice(0, 3);
        AudioSys.play('zap');
        const dmg = 14 + p.level;
        for (const t of targets) {
          FX.nova(t.x, t.y, '#f7e463', 1.2);
          FX.float(t.x, t.y, '⚡', '#f7e463');
          Combat.hurtEnemy(this, t, dmg, { type: 'lightning' });
        }
        this.msg(`⚡ 闪电链击中了 ${targets.length} 个敌人!`, 'magic');
        acted = true;
        break;
      }
      case 'frostnova': {
        if (!vis.length) { HUD.toast('❄ 视野内没有目标'); AudioSys.play('error'); return; }
        p.mp -= sk.mp;
        AudioSys.play('frost');
        FX.nova(p.x, p.y, '#9fd8ff', 7);
        this.shake(4);
        const dmg = 10 + p.level;
        let n = 0;
        for (const e of vis) {
          Status.add(e, 'frozen', 3, 1);
          Combat.hurtEnemy(this, e, dmg, { type: 'ice' });
          n++;
        }
        this.msg(`❄ 寒霜爆发! ${n} 个敌人被冻结了。`, 'magic');
        acted = true;
        break;
      }
      case 'blink': {
        const spots = MapGen.spawnableTiles(L, 5).filter(s =>
          L.walkable(s.x, s.y) && !L.enemyAt(s.x, s.y) && FOV.isVisible(L, s.x, s.y));
        const pool = spots.length ? spots : MapGen.spawnableTiles(L, 3).filter(s => L.walkable(s.x, s.y) && !L.enemyAt(s.x, s.y));
        if (!pool.length) { HUD.toast('🌀 无处可传送'); AudioSys.play('error'); return; }
        p.mp -= sk.mp;
        const s = rng.pick(pool);
        FX.burst(p.x, p.y, '#b197fc', 14);
        const oldX = p.x, oldY = p.y;
        p.x = s.x; p.y = s.y;
        p.anim = null;
        FX.burst(p.x, p.y, '#b197fc', 14);
        AudioSys.play('blink');
        this.msg('🌀 空间一阵扭曲, 你出现在别处。', 'magic');
        this.onEnterTile();
        acted = true;
        break;
      }
    }
    if (acted) {
      this.stats.casts++;
      Meta.unlock('skill_first');
      this.afterAction();
    }
  },

  enemiesVisible() {
    if (!this.level) return [];
    return this.level.enemies.filter(e => e.hp > 0 && FOV.isVisible(this.level, e.x, e.y));
  },

  // ---------------- 回合结算 ----------------
  afterAction() {
    if (this.state !== 'play') return;
    this.turn++;
    this.stats.turns++;
    // 玩家状态 tick
    Status.tick(this.player, this);
    if (this.player.hp <= 0) { this.die('状态侵蚀'); return; }

    // 敌人行动
    const snapshot = [...this.level.enemies];
    for (const e of snapshot) {
      if (this.state !== 'play') break;
      if (e.hp > 0) AI.act(this, e);
    }
    if (this.state !== 'play') { this.finishTurn(); return; }

    // 敌人状态 tick
    for (const e of [...this.level.enemies]) {
      if (e.hp > 0) Status.tick(e, this);
    }

    // 装备被动
    const p = this.player;
    if (p.flags) {
      if (p.flags.regen && p.hp < p.maxHp) p.heal(1, true);
      if (p.flags.manaFlow && this.turn % 2 === 0 && p.mp < p.maxMp) p.gainMp(1);
    }

    this.finishTurn();
  },

  finishTurn() {
    const p = this.player;
    // 视野
    FOV.compute(this.level, p.x, p.y, this.fovRadius());
    // 通关检查 (15 层龙已死)
    if (!this.won && !this.endless && this.floor === 15 && !this.dragonAlive() && this.state === 'play') {
      this.win();
      return;
    }
    if (this.state !== 'play') return;
    Meta.check(this);
    HUD.update(this);
    this.checkAutoStop();
    if (this.turn % 30 === 0 && this.state === 'play') this.saveRun(false);
  },

  waitTurn() {
    if (!this.canAct()) return;
    this.afterAction();
  },

  checkAutoStop() {
    if (!this.auto) return;
    const vis = this.enemiesVisible();
    if (vis.length) {
      if (this.auto.type === 'travel') {
        // 目标就是某个可见敌人时继续, 否则停
        const target = this.auto.attackUid ? this.level.enemies.find(e => e.uid === this.auto.attackUid) : null;
        if (!target || !vis.includes(target)) { this.stopAuto(); this.msg('附近出现了敌人, 自动移动停止。', 'warn'); }
      } else {
        this.stopAuto();
        this.msg('视野中出现敌人, 自动行动停止。', 'warn');
      }
    }
  },

  // ---------------- 自动探索 / 寻路 ----------------
  startExplore() {
    if (!this.canAct()) return;
    if (this.enemiesVisible().length) { HUD.toast('⚠ 附近有敌人, 无法自动探索'); return; }
    this.auto = { type: 'explore' };
    HUD.toast('🔍 自动探索中 (探完自动前往楼梯) — 任意操作中止', 1800);
  },

  startRest() {
    if (!this.canAct()) return;
    if (this.enemiesVisible().length) { HUD.toast('⚠ 附近有敌人, 无法休息'); return; }
    this.auto = { type: 'rest' };
    HUD.toast('💤 休息中 — 任意操作中止', 1400);
  },

  startTravelTo(tx, ty) {
    if (!this.canAct()) return;
    const L = this.level;
    if (!L.explored[ty * L.w + tx]) { return; }
    this.auto = { type: 'travel', tx, ty };
  },

  startTravelToEnemy(enemy) {
    if (!this.canAct()) return;
    this.auto = { type: 'travel', attackUid: enemy.uid, tx: enemy.x, ty: enemy.y };
  },

  stopAuto(silent) {
    if (!this.auto) return;
    this.auto = null;
    if (!silent) HUD.toast('自动行动停止', 900);
  },

  stepAuto() {
    const a = this.auto;
    if (!a || !this.canAct()) { this.auto = null; return; }
    const p = this.player, L = this.level;

    if (a.type === 'rest') {
      if (p.hp >= p.maxHp) { this.stopAuto(true); this.msg('你已经完全恢复了。', 'good'); return; }
      if (this.enemiesVisible().length) { this.stopAuto(true); this.msg('有敌人靠近, 你停止了休息。', 'warn'); return; }
      if (this.turn > 100000) { this.stopAuto(true); return; }
      this.waitTurn();
      return;
    }

    if (a.type === 'explore') {
      const goal = this.findUnexplored();
      if (!goal) {
        // 全图探索完: 自动前往下行楼梯
        if (p.x === L.stairsX && p.y === L.stairsY) {
          this.stopAuto(true);
          this.msg('已到达下行楼梯, 按 <b>Enter</b> 下楼。', 'good');
          HUD.toast('⬇ 已到达楼梯 — 按 Enter 下楼', 2600);
          return;
        }
        const path = this.pathTo(L.stairsX, L.stairsY);
        if (!path || !path.length) {
          this.stopAuto(true);
          this.msg('本层已探索完毕, 但无法抵达楼梯。', 'warn');
          return;
        }
        this.stepPath(path);
        return;
      }
      const path = this.pathTo(goal.x, goal.y);
      if (!path || !path.length) { this.stopAuto(true); this.msg('前方无法抵达, 自动探索停止。', 'warn'); return; }
      this.stepPath(path);
      return;
    }

    if (a.type === 'travel') {
      let tx = a.tx, ty = a.ty;
      let enemy = null;
      if (a.attackUid) {
        enemy = L.enemies.find(e => e.uid === a.attackUid && e.hp > 0);
        if (!enemy) { this.stopAuto(true); return; }
        tx = enemy.x; ty = enemy.y;
        // 相邻则攻击
        if (p.x === enemy.x && p.y === enemy.y) { this.stopAuto(true); return; }
        if (Util.cdist(p.x, p.y, enemy.x, enemy.y) <= 1) {
          Combat.playerAttack(this, enemy);
          this.afterAction();
          return;
        }
      }
      if (p.x === tx && p.y === ty && !a.attackUid) { this.stopAuto(true); return; }
      const path = this.pathTo(tx, ty, a.attackUid);
      if (!path || !path.length) { this.stopAuto(true); return; }
      this.stepPath(path);
      return;
    }

    this.stopAuto(true);
  },

  /** 走路径的第一步 */
  stepPath(path) {
    const n = path[0];
    const p = this.player;
    const dx = n.x - p.x, dy = n.y - p.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) { this.stopAuto(true); return; }
    const ok = this.move(dx, dy, true);
    if (!ok) this.stopAuto(true);
  },

  /** 通用寻路: 把门和碎石处理掉 */
  pathTo(tx, ty, attackUid) {
    const L = this.level;
    const p = this.player;
    if (p.x === tx && p.y === ty) return [];
    const path = Path.aStar(L, p.x, p.y, tx, ty, {
      passFn: (x, y) => L.walkable(x, y) || L.tile(x, y) === T.DOOR_C,
      occupied: (x, y) => {
        if (attackUid) {
          const e = L.enemyAt(x, y);
          if (e && e.uid === attackUid) return false;
        }
        if (x === p.x && y === p.y) return false;
        return !!L.enemyAt(x, y);
      },
    });
    return path;
  },

  /** 找最近的可达未探索格 */
  findUnexplored() {
    const L = this.level, p = this.player;
    const w = L.w, h = L.h;
    const dist = new Int16Array(w * h).fill(-1);
    const start = p.y * w + p.x;
    dist[start] = 0;
    const q = [start];
    let best = -1, bestD = Infinity;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi], x = k % w, y = (k / w) | 0;
      if (dist[k] >= bestD) continue;
      // 4 邻域扩展
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
          // 不继续穿过未探索区域太远 (最佳目标已经足够近)
          continue;
        }
        q.push(nk);
      }
    }
    if (best < 0) return null;
    return { x: best % w, y: (best / w) | 0 };
  },

  // ---------------- 收益 ----------------
  msg(text, cls) {
    HUD.log(text, cls || 'sys');
  },

  gainGold(n) {
    const f = this.player.flags || {};
    const mult = (f.greed || 1) * (f.goldMul || 1) * ((this.challenge && this.challenge.goldMul) || 1);
    n = Math.round(n * mult);
    this.player.gold += n;
    this.stats.goldGained += n;
    if (this.player.gold >= 1000) Meta.unlock('gold_1000');
    return n;
  },

  gainXp(n) {
    const f = this.player.flags || {};
    n = Math.round(n * (f.xpMul || 1) * ((this.challenge && this.challenge.xpMul) || 1));
    Combat.gainXp(this, n);
  },

  shake(mag) { FX.shake(mag); },

  // ---------------- 死亡 / 通关 ----------------
  die(cause) {
    if (this.state !== 'play') return;
    if (this.player) this.player.hp = 0;
    this.state = 'dead';
    this.paused = true;
    this.auto = null;
    SaveSys.clear();
    AudioSys.play('bossdie');
    FX.clear();
    this.flashRed = 0;
    try { Render.draw(this, performance.now()); } catch (e) {}
    this.msg(`☠ <b>${cause}</b> — 你倒在了第 ${this.floor} 层。`, 'dmg');
    const res = Meta.gameOver(this, false);
    setTimeout(() => {
      Screens.death(this, `死因: ${cause} · 倒在第 ${this.floor} 层`, res.score, res.shards);
    }, 700);
  },

  win() {
    if (this.won) return;
    this.won = true;
    this.state = 'win';
    this.paused = true;
    this.auto = null;
    SaveSys.clear();
    Meta.unlock('dragon_slayer');
    if (this.challenge) Meta.unlock('challenge_win');
    AudioSys.play('victory');
    FX.boom(this.player.x, this.player.y, true);
    this.msg('🏆 <b>深渊之龙倒下了! 你成为屠龙者!</b>', 'good');
    const res = Meta.gameOver(this, true);
    setTimeout(() => Screens.win(this, res.score, res.shards), 900);
  },

  continueEndless() {
    this.endless = true;
    this.state = 'play';
    this.paused = false;
    this.won = false;
    this.floor = 15;
    Screens.hideAll();
    this.descend();
    this.msg('🌀 你踏入了无尽回廊。深渊没有底。', 'magic');
    HUD.update(this);
  },

  // ---------------- 存档 ----------------
  saveRun(manual) {
    if (this.state !== 'play') return;
    const ok = SaveSys.save(this);
    if (manual) {
      HUD.toast(ok ? '💾 已保存当前进度' : '⚠ 保存失败: 浏览器禁用了本地存储');
      if (ok) AudioSys.play('ui');
    }
  },

  // ---------------- 输入 ----------------
  bindInput() {
    const keyMap = {
      ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
      ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
      ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
      ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    };

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const overlayOpen = !!document.querySelector('.overlay.visible');
      const k = e.key;
      if (k === 'Escape') {
        e.preventDefault();
        const open = Array.from(document.querySelectorAll('.overlay.visible')).pop();
        if (open) {
          if (open.id === 'overlay-help') Screens.closeHelp();
          else if (open.id === 'overlay-codex') Screens.closeCodex();
          else if (open.id === 'overlay-menu') Screens.closeMenu();
        } else if (this.state === 'play' && !this.paused) {
          Screens.openMenu();
        }
        return;
      }
      if (overlayOpen) return;
      if (this.state !== 'play' || this.paused) return;

      if (keyMap[k]) {
        e.preventDefault();
        this.stopAuto(true);
        this.move(...keyMap[k]);
        return;
      }
      if (k === ' ' || k === '.') { e.preventDefault(); this.stopAuto(true); this.waitTurn(); return; }
      if (k === 'Enter' || k === 'g' || k === 'G') { e.preventDefault(); this.interact(); return; }
      if (k === 'q' || k === 'Q') { e.preventDefault(); this.quickPotion(); return; }
      if (k === 'r' || k === 'R') { e.preventDefault(); this.startRest(); return; }
      if (k === 'f' || k === 'F') { e.preventDefault(); this.startExplore(); return; }
      if (k === 'i' || k === 'I') { e.preventDefault(); HUD.toast('🎒 直接点击右侧背包格使用/装备, 右键丢弃'); return; }
      if (k === 'x' || k === 'X') { e.preventDefault(); this.swapWeapon(); return; }
      if (k === 'z' || k === 'Z') { e.preventDefault(); Screens.openCodex('bestiary', 'play'); return; }
      if (k === 'h' || k === 'H' || k === '?') { e.preventDefault(); Screens.openHelp('play'); return; }
      if (k === 'm' || k === 'M') {
        e.preventDefault();
        const muted = AudioSys.toggleMute();
        Util.el('btn-mute').textContent = muted ? '🔇 静音' : '🔊 音效';
        return;
      }
      if (/^[1-5]$/.test(k)) { e.preventDefault(); this.castSkill(parseInt(k, 10) - 1); return; }
    });

    const canvas = Util.el('game');
    const tileFromEvent = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleX;
      const t = (Render && Render.screenToTile)
        ? Render.screenToTile(px, py)
        : { x: Math.floor(px / CONFIG.TILE), y: Math.floor(py / CONFIG.TILE) };
      return { px, py, x: t.x, y: t.y };
    };
    canvas.addEventListener('mousemove', (e) => {
      const t = tileFromEvent(e);
      this.mouse.px = t.px; this.mouse.py = t.py;
      this.mouse.x = t.x; this.mouse.y = t.y;
      const view = (this.state === 'play' && this.player) ? this : this.backdrop;
      if (view) { view.mouse = this.mouse; }
    });
    canvas.addEventListener('mouseleave', () => {
      this.mouse.x = -1; this.mouse.y = -1;
      const view = (this.state === 'play' && this.player) ? this : this.backdrop;
      if (view) { view.mouse = this.mouse; }
    });
    canvas.addEventListener('click', (e) => {
      if (this.state !== 'play' || this.paused) return;
      const t = tileFromEvent(e);
      const x = t.x, y = t.y;
      const L = this.level;
      if (!L.inBounds(x, y)) return;
      const enemy = L.enemyAt(x, y);
      if (enemy && FOV.isVisible(L, x, y)) {
        if (Util.cdist(this.player.x, this.player.y, x, y) <= 1) {
          this.move(Math.sign(x - this.player.x), Math.sign(y - this.player.y));
        } else {
          this.startTravelToEnemy(enemy);
        }
        return;
      }
      if (x === this.player.x && y === this.player.y) return;
      if (L.explored[y * L.w + x]) {
        if (L.walkable(x, y) || L.tile(x, y) === T.DOOR_C) this.startTravelTo(x, y);
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },
};

// 启动
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => Game.init());
}
