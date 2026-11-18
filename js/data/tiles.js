// ============ TILES: 图块定义 ============
// 地图存 Uint8Array, 每格一个 tile id。
// blocksMove: 挡路; blocksSight: 挡视线; interact: 可交互。

'use strict';

const T = {
  VOID: 0,        // 虚空 (地图边界外)
  WALL: 1,
  FLOOR: 2,
  DOOR_C: 3,      // 关闭的门
  DOOR_O: 4,      // 打开的门
  STAIRS: 5,
  GRASS: 6,
  BONES: 7,
  CRACK: 8,       // 裂纹地面
  TORCH: 9,       // 墙上火把 (挡路挡视线, 发光)
  RUBBLE: 10,     // 碎石堆 (挡路不挡视线)
  FOUNTAIN: 11,   // 泉水 (交互: 全恢复)
  CHEST: 12,      // 宝箱 (交互: 开启)
  SHOPKEEP: 13,   // 商人 (静态, 挡路)
  ALTAR: 14,      // 祭坛 (交互: 献金币回魔/增益)
  ORACLE: 15,     // 预言者 (交互: 对话+一次性祝福)
  CAPTIVE: 16,    // 被困的旅者 (交互: 对话+救援奖励)
  STATUE: 17,     // 神秘石像 (交互: 祈愿, 结果随机)
  FORGE: 18,      // 铁匠重铸台 (交互: 花金币重掷装备词条) v2.5
};

const TILE_DEFS = {
  [T.VOID]:     { name: '虚空',   blocksMove: true,  blocksSight: true },
  [T.WALL]:     { name: '石墙',   blocksMove: true,  blocksSight: true },
  [T.FLOOR]:    { name: '地面',   blocksMove: false, blocksSight: false },
  [T.DOOR_C]:   { name: '木门',   blocksMove: true,  blocksSight: true,  door: true },
  [T.DOOR_O]:   { name: '敞门',   blocksMove: false, blocksSight: false },
  [T.STAIRS]:   { name: '下行楼梯', blocksMove: false, blocksSight: false, interact: 'stairs' },
  [T.GRASS]:    { name: '苔草',   blocksMove: false, blocksSight: false },
  [T.BONES]:    { name: '残骸',   blocksMove: false, blocksSight: false },
  [T.CRACK]:    { name: '裂地',   blocksMove: false, blocksSight: false },
  [T.TORCH]:    { name: '火把',   blocksMove: true,  blocksSight: true,  light: 4 },
  [T.RUBBLE]:   { name: '碎石',   blocksMove: true,  blocksSight: false },
  [T.FOUNTAIN]: { name: '回响泉水', blocksMove: false, blocksSight: false, interact: 'fountain' },
  [T.CHEST]:    { name: '古旧宝箱', blocksMove: true,  blocksSight: false, interact: 'chest' },
  [T.SHOPKEEP]: { name: '商人',   blocksMove: true,  blocksSight: false },
  [T.ALTAR]:    { name: '深渊祭坛', blocksMove: false, blocksSight: false, interact: 'altar' },
  [T.ORACLE]:   { name: '预言者', blocksMove: true,  blocksSight: false, interact: 'oracle' },
  [T.CAPTIVE]:  { name: '被困的旅者', blocksMove: true,  blocksSight: false, interact: 'captive' },
  [T.STATUE]:   { name: '神秘石像', blocksMove: true,  blocksSight: false, interact: 'statue' },
  [T.FORGE]:    { name: '铁匠重铸台', blocksMove: true,  blocksSight: false, interact: 'forge' },
};

const Tiles = {
  def(id) { return TILE_DEFS[id] || TILE_DEFS[T.VOID]; },
  isWall(id) { return id === T.WALL || id === T.VOID || id === T.TORCH; },
  blocksMove(id) { return this.def(id).blocksMove; },
  blocksSight(id) { return this.def(id).blocksSight; },
};
