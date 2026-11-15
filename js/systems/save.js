// ============ SAVE: localStorage 存档 ============
// 单存档槽。死亡/放弃即删档 (Roguelike 铁律)。
// 只序列化纯数据, 关卡对象在读取时重建。

'use strict';

const SaveSys = (() => {
  const RUN_KEY = 'abyss_corridor_run_v1';

  function storageOK() {
    try {
      if (typeof localStorage === 'undefined') return false;
      localStorage.setItem('__ac_test', '1');
      localStorage.removeItem('__ac_test');
      return true;
    } catch (e) { return false; }
  }

  /** 从游戏中提取快照 */
  function snapshot(game) {
    const p = game.player;
    const L = game.level;
    return {
      v: 2,
      savedAt: Date.now(),
      seed: game.seed,
      floor: game.floor,
      turn: game.turn,
      mode: game.endless ? 'endless' : 'normal',
      challenge: game.challenge || null,
      daily: !!game.daily,
      stats: JSON.parse(JSON.stringify(game.stats)),
      player: {
        name: p.name, x: p.x, y: p.y,
        hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp,
        baseMaxHp: p.baseMaxHp, baseMaxMp: p.baseMaxMp,
        baseAtk: p.baseAtk, baseDef: p.baseDef,
        baseFov: p.baseFov || 0,
        level: p.level, xp: p.xp, gold: p.gold,
        acc: p.acc, eva: p.eva, crit: p.crit,
        kills: p.kills,
        boons: JSON.parse(JSON.stringify(p.boons || {})),
        inv: JSON.parse(JSON.stringify(p.inv)),
        equip: JSON.parse(JSON.stringify(p.equip)),
        statuses: JSON.parse(JSON.stringify(p.statuses)),
      },
      level: {
        floor: L.floor,
        tiles: Array.from(L.tiles),
        variant: Array.from(L.variant),
        explored: Array.from(L.explored),
        rooms: JSON.parse(JSON.stringify(L.rooms)),
        spawn: { x: L.spawn.x, y: L.spawn.y },
        stairsX: L.stairsX, stairsY: L.stairsY,
        items: JSON.parse(JSON.stringify(L.items)),
        golds: JSON.parse(JSON.stringify(L.golds)),
        enemies: JSON.parse(JSON.stringify(L.enemies)),
        torches: JSON.parse(JSON.stringify(L.torches)),
        ambushRooms: JSON.parse(JSON.stringify(L.ambushRooms || [])),
        talked: JSON.parse(JSON.stringify(L.talked || {})),
        shop: L.shop || null,
        chest: L.chest || null,
        altarUsed: !!L.altarUsed,
        fountainUsed: !!L.fountainUsed,
      },
    };
  }

  function save(game) {
    if (!storageOK()) return false;
    try {
      localStorage.setItem(RUN_KEY, JSON.stringify(snapshot(game)));
      return true;
    } catch (e) {
      console.warn('save failed', e);
      return false;
    }
  }

  function hasSave() {
    if (!storageOK()) return false;
    try { return !!localStorage.getItem(RUN_KEY); } catch (e) { return false; }
  }

  function readRaw() {
    if (!storageOK()) return null;
    try {
      const s = localStorage.getItem(RUN_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  /** 读档并重建关卡对象 (兼容 v1/v2) */
  function load() {
    const d = readRaw();
    if (!d || (d.v !== 1 && d.v !== 2)) return null;
    try {
      const L = MapGen.createLevel(d.seed, d.level.floor);
      L.chal = d.challenge ? { hpMul: d.challenge.hpMul, atkMul: d.challenge.atkMul, defAdd: d.challenge.defAdd, rewardMul: d.challenge.rewardMul } : null;
      L.tiles = new Uint8Array(d.level.tiles);
      L.variant = new Uint8Array(d.level.variant);
      L.explored = new Uint8Array(d.level.explored);
      L.rooms = d.level.rooms;
      L.spawn = d.level.spawn;
      L.stairsX = d.level.stairsX;
      L.stairsY = d.level.stairsY;
      L.items = d.level.items;
      L.golds = d.level.golds;
      L.enemies = d.level.enemies;
      L.torches = d.level.torches;
      L.ambushRooms = d.level.ambushRooms || [];
      L.talked = d.level.talked || {};
      L.fountainUsed = !!d.level.fountainUsed;
      L.shop = d.level.shop;
      L.chest = d.level.chest;
      L.altarUsed = d.level.altarUsed;
      L.theme = Floors.def(d.level.floor);
      // 修正物品 uid 计数器
      let maxUid = 0;
      const scan = (obj) => {
        if (!obj) return;
        if (obj.uid && obj.uid > maxUid) maxUid = obj.uid;
        if (obj.equip) for (const k in obj.equip) scan(obj.equip[k]);
        if (obj.inv) for (const it of obj.inv) scan(it);
      };
      scan(d.player);
      for (const it of L.items) scan(it);
      Items._uid = Math.max(Items._uid, maxUid + 1);
      let maxEUid = 0;
      for (const e of L.enemies) if (e.uid > maxEUid) maxEUid = e.uid;
      Enemies._seq = Math.max(Enemies._seq, maxEUid + 1);
      d.levelObj = L;
      return d;
    } catch (e) {
      console.warn('load failed', e);
      return null;
    }
  }

  function clear() {
    if (!storageOK()) return;
    try { localStorage.removeItem(RUN_KEY); } catch (e) {}
  }

  return { save, load, hasSave, readRaw, clear, snapshot, storageOK };
})();
