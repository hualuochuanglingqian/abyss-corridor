// ============ FLOORS: 楼层主题表 ============
// type: 'rooms' 房间走廊 / 'cave' 细胞洞穴 / 'mixed' 混合
// radius: 基础视野半径; darkness: 整体压暗系数(洞穴更暗)

'use strict';

const FLOORS = [
  { name: '幽暗入口',   type: 'rooms', radius: 9,  darkness: 0,   enemyN: 5,  torch: 0.030 },
  { name: '碎石回廊',   type: 'rooms', radius: 8,  darkness: 0.05, enemyN: 6,  torch: 0.026 },
  { name: '蛛网洞窟',   type: 'cave',  radius: 7,  darkness: 0.10, enemyN: 7,  torch: 0.022 },
  { name: '潮湿通道',   type: 'mixed', radius: 8,  darkness: 0.08, enemyN: 8,  torch: 0.024 },
  { name: '屠宰场',     type: 'arena', radius: 9,  darkness: 0.06, enemyN: 2,  torch: 0.040, boss: 'boss_butcher' },
  { name: '苔藓深处',   type: 'cave',  radius: 7,  darkness: 0.12, enemyN: 10, torch: 0.022 },
  { name: '白骨大厅',   type: 'rooms', radius: 8,  darkness: 0.08, enemyN: 11, torch: 0.026 },
  { name: '幽影迷宫',   type: 'rooms', radius: 6,  darkness: 0.14, enemyN: 11, torch: 0.018 },
  { name: '恶魔前厅',   type: 'cave',  radius: 7,  darkness: 0.10, enemyN: 12, torch: 0.024 },
  { name: '骸骨王座',   type: 'arena', radius: 10, darkness: 0.04, enemyN: 2,  torch: 0.040, boss: 'boss_king' },
  { name: '熔岩裂隙',   type: 'cave',  radius: 7,  darkness: 0.12, enemyN: 12, torch: 0.028 },
  { name: '秘法书房',   type: 'rooms', radius: 8,  darkness: 0.08, enemyN: 12, torch: 0.030 },
  { name: '空寂回声',   type: 'mixed', radius: 7,  darkness: 0.12, enemyN: 13, torch: 0.022 },
  { name: '龙脊峭壁',   type: 'cave',  radius: 7,  darkness: 0.12, enemyN: 13, torch: 0.026 },
  { name: '深渊之心',   type: 'arena', radius: 11, darkness: 0.02, enemyN: 2,  torch: 0.050, boss: 'boss_dragon' },
];

const Floors = {
  def(floor) {
    if (floor <= CONFIG.MAX_FLOOR) return FLOORS[floor - 1];
    // 无尽回廊: 循环主题 + 每 5 层一位 Boss + 深度标注
    const base = FLOORS[(floor - 1) % 15];
    const bossCycle = ['boss_butcher', 'boss_king', 'boss_dragon'];
    const isBossFloor = floor % 5 === 0;
    return Object.assign({}, base, {
      name: '无尽回廊 · ' + (floor - 15) + ' 层',
      enemyN: Math.min(16, base.enemyN + Math.floor((floor - 15) / 3)),
      boss: isBossFloor ? bossCycle[(floor / 5 - 1) % 3] : undefined,
    });
  },
  type(floor) { return this.def(floor).type; },
};
