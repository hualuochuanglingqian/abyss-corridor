// ============ META: 成就 / 图鉴 / 纪录 (跨局持久) ============

'use strict';

const ACHIEVEMENTS = [
  { id: 'first_kill',   name: '初次见血',     icon: '🩸', desc: '第一次击杀敌人' },
  { id: 'kill_50',      name: '屠魔者',       icon: '⚔️', desc: '单局击杀 50 个敌人' },
  { id: 'kill_150',     name: '深渊清道夫',   icon: '💀', desc: '单局击杀 150 个敌人' },
  { id: 'gold_1000',    name: '腰缠万贯',     icon: '💰', desc: '单局金币达到 1000' },
  { id: 'reach_f5',     name: '踏入屠宰场',   icon: '🩸', desc: '抵达第 5 层' },
  { id: 'boss_butcher', name: '屠夫终结者',   icon: '👹', desc: '击败屠夫·格罗' },
  { id: 'reach_f10',    name: '王座之下',     icon: '🪑', desc: '抵达第 10 层' },
  { id: 'boss_king',    name: '王的葬礼',     icon: '☠️', desc: '击败骸骨王' },
  { id: 'dragon_slayer',name: '屠龙者',       icon: '🐉', desc: '击败深渊之龙' },
  { id: 'lv10',         name: '十级旅者',     icon: '⭐', desc: '单局达到 10 级' },
  { id: 'nohit_floor',  name: '无伤一层',     icon: '🍃', desc: '一整层毫发无伤' },
  { id: 'skill_first',  name: '初窥魔法',     icon: '✨', desc: '第一次释放技能' },
  { id: 'chest_5',      name: '开箱狂人',     icon: '📦', desc: '累计打开 5 个宝箱' },
  { id: 'endless_20',   name: '无尽旅人',     icon: '🌀', desc: '抵达第 20 层' },
  { id: 'elite_first',  name: '精英猎手',     icon: '👑', desc: '击败一只精英怪' },
  { id: 'ambush_clear', name: '关门打狗',     icon: '🚪', desc: '清剿一处伏击房' },
  { id: 'dual_wield',   name: '双持大师',     icon: '🖖', desc: '同时装备两把武器' },
  { id: 'challenge_win',name: '因子挑战者',   icon: '🎯', desc: '在挑战模式下通关深渊之龙' },
  { id: 'daily_play',   name: '每日打卡',     icon: '☀️', desc: '完成一次每日挑战 (死亡或通关都算)' },
  { id: 'cursed_pact',  name: '敢于诅咒',     icon: '😈', desc: '接受一张诅咒祝福' },
];

const META_KEY = 'abyss_corridor_meta_v1';

const Meta = (() => {
  let data = {
    achievements: {},   // id -> true
    bestiary: {},       // enemyId -> 击杀数
    records: { deepest: 1, bestScore: 0, runs: 0, wins: 0, totalKills: 0, dailyBest: null, challengeBest: null },
    chests: 0,
    shards: 0,          // 魂晶 (局外货币)
    talents: {},        // 局外天赋等级
    version: 1,
  };
  let loaded = false;

  function load() {
    if (typeof localStorage === 'undefined') return;
    try {
      const s = localStorage.getItem(META_KEY);
      if (s) {
        const d = JSON.parse(s);
        data = Object.assign(data, d);
        data.records = Object.assign({ deepest: 1, bestScore: 0, runs: 0, wins: 0, totalKills: 0, dailyBest: null, challengeBest: null }, d.records || {});
        if (!isFinite(data.records.totalKills)) data.records.totalKills = 0;
        data.shards = data.shards || 0;
        data.talents = data.talents || {};
      }
    } catch (e) { /* 用默认值 */ }
    loaded = true;
  }

  function save() {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(META_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function unlock(id) {
    if (data.achievements[id]) return false;
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def) return false;
    data.achievements[id] = true;
    save();
    Util.bus.emit('achievement', def);
    AudioSys.play('levelup');
    return true;
  }

  /** 击杀记录 → 图鉴 + 击杀成就 */
  function recordKill(enemyId) {
    data.bestiary[enemyId] = (data.bestiary[enemyId] || 0) + 1;
    data.records.totalKills = (data.records.totalKills || 0) + 1;
    save();
  }

  function hasAchievement(id) { return !!data.achievements[id]; }

  function bestiaryCount(id) { return data.bestiary[id] || 0; }

  function chestOpened() {
    data.chests++;
    if (data.chests >= 5) unlock('chest_5');
    save();
  }

  /** 新开一局 */
  function newRun() {
    data.records.runs++;
    save();
  }

  /** 局内检查点 (击杀/金币/层数变化时调用) */
  function check(game) {
    const p = game.player;
    if (p.kills >= 1) unlock('first_kill');
    if (p.kills >= 50) unlock('kill_50');
    if (p.kills >= 150) unlock('kill_150');
    if (p.gold >= 1000) unlock('gold_1000');
    if (p.level >= 10) unlock('lv10');
    if (game.floor >= 5) unlock('reach_f5');
    if (game.floor >= 10) unlock('reach_f10');
    if (game.floor >= 20) unlock('endless_20');
    const deep = Math.max(data.records.deepest, game.floor);
    if (deep !== data.records.deepest) { data.records.deepest = deep; save(); }
  }

  /** 结算 (死亡或通关): 返回 {score, shards} */
  function gameOver(game, won) {
    const p = game.player;
    const floor = game.floor;
    const score = floor * 1000 + p.kills * 40 + p.gold + (won ? 10000 : 0);
    data.records.deepest = Math.max(data.records.deepest, floor);
    data.records.bestScore = Math.max(data.records.bestScore, score);
    if (won) data.records.wins++;
    // 每日挑战纪录 (按日期归档)
    if (game.daily) {
      const d = new Date();
      const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (!data.daily || data.daily.date !== ymd) data.daily = { date: ymd, bestScore: 0, deepest: 0 };
      data.daily.bestScore = Math.max(data.daily.bestScore, score);
      data.daily.deepest = Math.max(data.daily.deepest, floor);
    }
    // 挑战模式最佳纪录
    if (game.challenge) {
      const cur = data.records.challengeBest;
      if (!cur || score > cur.score) {
        data.records.challengeBest = { id: game.challenge.id, name: game.challenge.name, score, floor };
      }
      if (won) unlock('challenge_win');
    }
    // 每日挑战: 打卡成就 (死亡或通关都算)
    if (game.daily) unlock('daily_play');
    // 魂晶结算: 层数 + 击杀 + 通关奖励; 挑战 ×1.5; 魂引天赋 ×1.25
    let shards = Math.round(floor * 3 + p.kills / 2 + (won ? 80 : 0));
    if (game.challenge) shards = Math.round(shards * 1.5);
    if (data.talents.t_shard) shards = Math.round(shards * 1.25);
    data.shards += shards;
    save();
    return { score, shards };
  }

  /** 购买局外天赋 */
  function buyTalent(id) {
    const d = Talents.def(id);
    if (!d) return false;
    if (!Talents.canBuy(data.talents, id)) return false;
    if (data.shards < d.cost) return false;
    data.shards -= d.cost;
    data.talents[id] = (data.talents[id] || 0) + 1;
    save();
    return true;
  }

  function listAchievements() {
    return ACHIEVEMENTS.map(a => ({ ...a, done: !!data.achievements[a.id] }));
  }

  function listBestiary() {
    return Object.keys(ENEMIES).map(id => {
      const d = ENEMIES[id];
      const kills = data.bestiary[id] || 0;
      return {
        id, glyph: d.glyph, name: d.name, boss: !!d.boss,
        kills, seen: kills > 0,
        hp: d.hp, atk: d.atk, def: d.def, xp: d.xp,
        floors: d.minF + '-' + d.maxF,
        desc: d.desc,
      };
    });
  }

  return {
    get data() { return data; },
    load, save, unlock, recordKill, hasAchievement, bestiaryCount,
    chestOpened, newRun, check, gameOver, buyTalent, listAchievements, listBestiary,
    get loaded() { return loaded; },
  };
})();
