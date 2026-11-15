// 打包游戏脚本为单一 script 作用域后运行 headless 仿真。
// 用法: node tools/smoke.js
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'js/core/rng.js',
  'js/core/util.js',
  'js/data/config.js',
  'js/data/tiles.js',
  'js/data/affixes.js',
  'js/data/items.js',
  'js/data/enemies.js',
  'js/data/floors.js',
  'js/data/boons.js',
  'js/data/talents.js',
  'js/data/story.js',
  'js/systems/mapgen.js',
  'js/systems/fov.js',
  'js/systems/pathing.js',
  'js/systems/combat.js',
  'js/systems/status.js',
  'js/systems/ai.js',
  'js/systems/particles.js',
  'js/systems/audio.js',
  'js/systems/save.js',
  'js/systems/meta.js',
];

const bundle = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const body = fs.readFileSync(path.join(__dirname, 'sim-body.js'), 'utf8');
const source = bundle + '\n;\n' + body;

console.log('加载游戏脚本: ' + FILES.length + ' 个文件, ' + Math.round(source.length / 1024) + ' KB');
try {
  vm.runInThisContext(source, { filename: 'abyss-bundle.js' });
} catch (e) {
  console.error('运行时崩溃: ' + e.stack);
  process.exit(2);
}
