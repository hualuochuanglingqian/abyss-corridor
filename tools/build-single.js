// 构建单文件分发版: node tools/build-single.js → dist/abyss-corridor.html
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const inlineCss = (m, href) => {
  const file = path.join(ROOT, href);
  return '<style>\n' + fs.readFileSync(file, 'utf8') + '\n</style>';
};
const inlineJs = (m, src) => {
  const file = path.join(ROOT, src);
  const code = fs.readFileSync(file, 'utf8');
  if (/<\/script/i.test(code)) throw new Error('脚本内含 </script, 无法安全内联: ' + src);
  return '<script>\n' + code + '\n</script>';
};

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, inlineCss);
html = html.replace(/<script src="([^"]+)"><\/script>/g, inlineJs);

if (/<script src=/.test(html) || /<link rel="stylesheet"/.test(html)) {
  throw new Error('仍有外部资源未内联');
}

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'abyss-corridor.html');
fs.writeFileSync(out, html, 'utf8');
console.log('✅ 单文件已生成: dist/abyss-corridor.html (' + Math.round(html.length / 1024) + ' KB)');
