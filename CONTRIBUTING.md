# 贡献指南 · Contributing

欢迎参与《暗渊回廊》！这是一个零依赖的原生 JS 项目，不需要 npm install，clone 下来就能玩、能改。

## 🚀 快速上手

```bash
git clone https://github.com/<OWNER>/abyss-corridor.git
cd abyss-corridor
# 玩: 直接双击 index.html
# 调试: 起一个禁缓存静态服务器
node tools/serve.js 8124   # → http://127.0.0.1:8124/
```

## ✅ 提交前请过回归

```bash
node tools/smoke.js     # 地图连通性 / FOV / 战斗采样 / 整局 bot / 存档往返 / 新系统用例
```

要求：最后输出 `✅ 全部检查通过`。改了数值请同时跑 `node tools/balance.js` 看胜率曲线是否失控。

Push 后 GitHub Actions 会自动跑同样的回归（`.github/workflows/ci.yml`），红灯的 PR 不合并。

## 🗂 代码导航

详见 [README.md](README.md) 的目录结构一节。常用入口：

| 想改什么 | 去哪 |
|---|---|
| 新武器/装备/词条 | `js/data/items.js` · `js/data/affixes.js` |
| 新敌人/Boss/AI | `js/data/enemies.js` · `js/systems/ai.js` |
| 新祝福/天赋/挑战因子 | `js/data/boons.js` · `js/data/talents.js` · `js/data/config.js` |
| 地图生成/伏击房 | `js/systems/mapgen.js` |
| 渲染/特效 | `js/ui/render.js` · `js/systems/particles.js` |
| 数值难度 | `js/data/enemies.js` → `ENEMY_TUNING` |

## 📐 约定

- **零依赖原则**：不引入任何第三方库/素材/字体文件；图形程序化绘制，音效 WebAudio 合成
- **file:// 可玩**：不使用 ES module、不发起网络请求；改动后请双击 index.html 验证
- **中文文案**：UI 与日志保持中文，风格参考现有条目（简短、有点味道）
- **数值改动**：在 PR 描述里附上 `balance.js` 的前后对比（胜率/余血）
- **存档兼容**：改存档结构请升级 `SaveSys` 版本号并写迁移，旧档必须能读

## 🐛 提 Issue

报 bug 请附：操作系统/浏览器、复现步骤、控制台报错截图（F12）、当前种子（顶栏 🌱 显示）。
