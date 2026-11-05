// 数值扫描入口: node tools/balance.js
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'js/core/rng.js', 'js/core/util.js', 'js/data/config.js', 'js/data/tiles.js',
  'js/data/affixes.js', 'js/data/items.js', 'js/data/enemies.js', 'js/data/floors.js',
  'js/data/boons.js', 'js/data/talents.js',
  'js/systems/mapgen.js', 'js/systems/fov.js', 'js/systems/pathing.js',
  'js/systems/combat.js', 'js/systems/status.js', 'js/systems/ai.js',
  'js/systems/particles.js', 'js/systems/audio.js', 'js/systems/save.js', 'js/systems/meta.js',
];

const bundle = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const body = fs.readFileSync(path.join(__dirname, 'balance-body.js'), 'utf8');
try {
  vm.runInThisContext(bundle + '\n;\n' + body, { filename: 'abyss-balance.js' });
} catch (e) {
  console.error('数值扫描崩溃: ' + e.stack);
  process.exit(2);
}
