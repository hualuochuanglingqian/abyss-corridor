// ============ CONFIG: 全局配置 ============

'use strict';

const CONFIG = {
  VERSION: '2.0.0',       // 与 CHANGELOG.md 同步, 标题画面显示
  TILE: 24,               // 图块像素
  MAP_W: 48,              // 地图宽 (格)
  MAP_H: 30,              // 地图高 (格)
  INV_MAX: 12,            // 背包容量
  MAX_FLOOR: 15,          // 通关层
  FOV_RADIUS: 8,          // 基础视野半径

  // 玩家初始
  PLAYER: {
    HP: 50, MP: 20,
    ATK: 3, DEF: 0,
    ACC: 85, EVA: 5, CRIT: 5,
  },

  // 升级曲线: 升到 L 级所需经验 = 18 * L^1.35
  xpNeed(level) { return Math.round(18 * Math.pow(level, 1.35)); },

  // 每级提升
  LEVEL_UP: { HP: 6, MP: 3, ATK: 1, DEF_EVERY: 2 }, // 每 DEF_EVERY 级 +1 防御

  // 暴击倍率 / 浮动
  CRIT_MULT: 1.6,
  DMG_VARIANCE: 0.2,      // ±20%
  BASE_HIT: 85,           // 命中率基数

  // 技能表
  SKILLS: [
    {
      id: 'fireball', name: '火球术', glyph: '🔥', lv: 1, mp: 8,
      desc: '向最近可视敌人投掷火球, 12+Lv 伤害并溅射周围',
    },
    {
      id: 'heal', name: '治疗术', glyph: '✨', lv: 2, mp: 12,
      desc: '恢复 15+3×Lv 生命',
    },
    {
      id: 'lightning', name: '闪电链', glyph: '⚡', lv: 4, mp: 15,
      desc: '雷击最近的最多 3 个可视敌人, 各 14+Lv 伤害',
    },
    {
      id: 'frostnova', name: '冰冻新星', glyph: '❄', lv: 6, mp: 18,
      desc: '冻结视野内所有敌人 3 回合并造成 10+Lv 伤害',
    },
    {
      id: 'blink', name: '传送术', glyph: '🌀', lv: 8, mp: 16,
      desc: '瞬移到视线下随机安全位置',
    },
  ],

  // 挑战因子 (开局可选, 参考元气骑士挑战因子的设计)
  CHALLENGES: [
    {
      id: 'crazy', name: '疯狂因子', icon: '🔥',
      desc: '敌人 HP/攻击 +40%, 防御 +2; 金币与经验 ×2, 装备掉落提升, 魂晶 ×1.5',
      hpMul: 1.4, atkMul: 1.4, defAdd: 2, rewardMul: 2, goldMul: 2, xpMul: 2, eqBonus: 0.25,
    },
    {
      id: 'mist', name: '浓雾因子', icon: '🌫️',
      desc: '视野 -3, 摸黑作战; 经验 +60%, 魂晶 ×1.5',
      fog: -3, xpMul: 1.6,
    },
    {
      id: 'hard', name: '坚壁因子', icon: '🪨',
      desc: '敌人防御 +4; 装备掉落率大幅提升, 金币 ×1.5, 魂晶 ×1.5',
      defAdd: 4, eqBonus: 0.5, goldMul: 1.5,
    },
  ],

  // 状态效果
  STATUS: {
    poison:  { name: '中毒', icon: '🟣', bad: true },
    burn:    { name: '灼烧', icon: '🔴', bad: true },
    frozen:  { name: '冰冻', icon: '❄', bad: true },
    slow:    { name: '减速', icon: '🐌', bad: true },
    weaken:  { name: '虚弱', icon: '⬇', bad: true },
    regen:   { name: '再生', icon: '🟢', bad: false },
    strength:{ name: '力量', icon: '🟠', bad: false },
    shield:  { name: '护盾', icon: '🔵', bad: false },
  },

  // 屏幕震动
  SHAKE: { hit: 2, crit: 5, boss: 10 },
};

// 调色板 (渲染主用色)
const PALETTE = {
  void:     '#04060a',
  wallTop:  '#3a4356',
  wallFace: '#232b3b',
  wallDark: '#1a2130',
  floor:    '#2a3040',
  floorAlt: '#262c3b',
  grass:    '#2f4a33',
  water:    '#1d3a52',
  gold:     '#d9ab4a',
  stair:    '#5fd068',
  door:     '#8a5a2b',
  torch:    '#ff9538',
  blood:    '#7e2a33',
  hp:       '#e5484d',
  mp:       '#3f8fe0',
  xp:       '#8fc94b',
  fogSeen:  '#0d1420',
};
