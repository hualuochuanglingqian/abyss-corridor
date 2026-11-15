// ============ RENDER: Canvas 渲染器 (GC 优化版) ============
// 静态层 (图块+光照+迷雾) 缓存到离屏画布, 仅在楼层/回合/地砖变化时重绘;
// 所有光晕使用预渲染精灵 (blit 替代每帧 createRadialGradient);
// 暗度字符串查表; 小地图底图按同 key 缓存。
// 每帧动态: 实体/物品/粒子/弹道/飘字/动画光晕。

'use strict';

const Render = (() => {
  let cv, ctx;
  const TS = 24;
  const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
  const ZOOM = 1.5;          // 跟随模式缩放
  let camX = 0, camY = 0;    // 摄像机左上角 (格坐标)
  let curZoom = 1;           // 本帧实际缩放 (fixed=整图适配 / follow=1.5)
  let camSX = 0, camSY = 0;  // 平滑跟随的插值位置
  let lastDrawT = 0;         // 上一帧时间戳 (算 dt)

  // 离屏缓存
  let staticCv, sctx;        // 世界坐标全图静态层
  let miniCv, mctx;          // 小地图底图
  let staticKey = null;
  const glowCache = new Map();

  // 暗度字符串查表 (可见格 0~0.34)
  const DARK = [];
  for (let i = 0; i <= 34; i++) DARK.push(`rgba(3,5,10,${i / 100})`);

  // 预生成颜色表
  let floorCols, wallCols, wallFaceCols, crackCols;
  const EMOJI_FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';

  function init(canvasEl) {
    cv = canvasEl;
    ctx = cv.getContext('2d');
    cv.width = W * TS;
    cv.height = H * TS;
    staticCv = document.createElement('canvas');
    staticCv.width = W * TS;
    staticCv.height = H * TS;
    sctx = staticCv.getContext('2d');
    const mw = 150;
    miniCv = document.createElement('canvas');
    miniCv.width = mw;
    miniCv.height = Math.round(mw * H / W);
    mctx = miniCv.getContext('2d');
    floorCols = [];
    wallCols = [];
    wallFaceCols = [];
    crackCols = [];
    for (let i = 0; i < 8; i++) {
      const f = 1 + (i - 3.5) * 0.016;
      floorCols.push(shadeHex(PALETTE.floor, f));
      wallCols.push(shadeHex(PALETTE.wallFace, 1 + (i - 3.5) * 0.03));
      wallFaceCols.push(shadeHex(PALETTE.wallDark, 1 + (i - 3.5) * 0.04));
      crackCols.push(shadeHex('#1d2330', 1 + (i - 3.5) * 0.05));
    }
  }

  function shadeHex(hex, f) {
    const h = hex.replace('#', '');
    const r = Util.clamp(Math.round(parseInt(h.substr(0, 2), 16) * f), 0, 255);
    const g = Util.clamp(Math.round(parseInt(h.substr(2, 2), 16) * f), 0, 255);
    const b = Util.clamp(Math.round(parseInt(h.substr(4, 2), 16) * f), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  // ---------- 光晕精灵缓存 ----------
  function makeGlowSprite(hex, radPx) {
    const key = hex + '|' + radPx;
    let spr = glowCache.get(key);
    if (spr) return spr;
    spr = document.createElement('canvas');
    spr.width = spr.height = radPx * 2;
    const g = spr.getContext('2d');
    const grad = g.createRadialGradient(radPx, radPx, 1, radPx, radPx, radPx);
    grad.addColorStop(0, Util.rgba(hex, 1));
    grad.addColorStop(0.4, Util.rgba(hex, 0.45));
    grad.addColorStop(1, Util.rgba(hex, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, radPx * 2, radPx * 2);
    glowCache.set(key, spr);
    return spr;
  }

  /** 在格中心 blit 一个光晕精灵 (加色混合) */
  function blitGlow(c, x, y, radTiles, hex, alpha) {
    const spr = makeGlowSprite(hex, Math.max(8, Math.round(radTiles * TS)));
    const px = (x + 0.5) * TS - spr.width / 2;
    const py = (y + 0.5) * TS - spr.height / 2;
    c.save();
    c.globalAlpha = Util.clamp(alpha, 0, 1);
    c.globalCompositeOperation = 'lighter';
    c.drawImage(spr, px, py);
    c.restore();
  }

  // ---------- 主绘制 ----------
  function draw(game, now) {
    if (!ctx || !staticCv) return;
    const L = game.level;
    if (!L) return;

    // 摄像机: fixed(整张地图静止不动) / follow(平滑跟随人物动画位置)
    const p = game.player;
    const mode = (game.settings && game.settings.camera === 'follow') ? 'follow' : 'fixed';
    const zoom = (mode === 'follow') ? ZOOM : Math.min(cv.width / (W * TS), cv.height / (H * TS));
    const viewW = cv.width / (TS * zoom);
    const viewH = cv.height / (TS * zoom);
    const dt = Math.min(0.1, Math.max(0.001, (now - lastDrawT) / 1000));
    if (mode === 'follow') {
      // 跟踪人物的"动画位置"(含移动插值), 指数平滑 → 地图滑行而非跳格
      const [pox, poy] = entityOffset(p, now);
      const tx = p.x + 0.5 + pox - viewW / 2;
      const ty = p.y + 0.5 + poy - viewH / 2;
      const k = 1 - Math.pow(0.0005, dt);
      camSX += (tx - camSX) * k;
      camSY += (ty - camSY) * k;
      camX = camSX; camY = camSY;
    } else {
      camX = 0; camY = 0; camSX = 0; camSY = 0;
    }
    curZoom = zoom;
    lastDrawT = now;

    // 静态层缓存: 楼层/种子/地砖版本/回合 任一变化才重绘
    const key = L.floor + '|' + (L.seed || '') + '|' + (L.version || 0) + '|' + (game.turn == null ? 0 : game.turn);
    if (key !== staticKey) {
      renderStatic(game);
      renderMiniBase(game);
      staticKey = key;
    }

    const bx0 = Math.max(0, Math.floor(camX) - 1);
    const bx1 = Math.min(W - 1, Math.ceil(camX + viewW) + 1);
    const by0 = Math.max(0, Math.floor(camY) - 1);
    const by1 = Math.min(H - 1, Math.ceil(camY + viewH) + 1);

    ctx.save();
    // 屏幕震动 (可在设置中关闭; 默认幅度减半)
    if (FX.shakeT > 0 && FX.shakeMag > 0) {
      const mul = (game.settings && game.settings.shake === false) ? 0 : 0.5;
      const m = FX.shakeMag * (FX.shakeT / 0.28) * mul;
      if (m > 0.1) ctx.translate((Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2);
    }
    ctx.scale(zoom, zoom);
    ctx.translate(-camX * TS, -camY * TS);

    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(camX * TS - 64, camY * TS - 64, viewW * TS + 128, viewH * TS + 128);

    // 静态层 blit (含光照迷雾)
    ctx.drawImage(staticCv, 0, 0);

    // 每帧动态层
    drawTileAnimations(game, now, bx0, bx1, by0, by1);
    drawItems(game, now, bx0, bx1, by0, by1);
    drawEntities(game, now, bx0, bx1, by0, by1);
    drawAmbushLocks(game, now);
    drawTorchOuterGlow(game, now);
    FX.draw(ctx, TS, now);
    drawPlayerAura(game, now);

    ctx.restore();

    // ---- 屏幕空间 UI ----
    drawLowHpVignette(game, now);
    if (game.flashRed > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(160,20,30,${Math.min(0.2, game.flashRed * 0.22)})`;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
    }
    drawBossBar(game, now);
    if (mode === 'follow') drawMinimap(game); // 固定镜头下整图可见, 小地图冗余
    drawBanner(game, now);
    drawHover(game, now);
  }

  // ---------- 静态层 (离屏, 每 key 一次) ----------
  function renderStatic(game) {
    const L = game.level;
    const vis = L.visible, exp = L.explored;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, W * TS, H * TS);
    sctx.fillStyle = '#04060a';
    sctx.fillRect(0, 0, W * TS, H * TS);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!exp[k]) continue;           // 未探索: 保持底色, 由光照层统一填充
        const t = L.tiles[k];
        const px = x * TS, py = y * TS;
        const v = L.variant[k] & 7;

        switch (t) {
          case T.WALL:
          case T.TORCH:
            drawWallBase(sctx, x, y, v, L);
            break;
          case T.DOOR_C:
          case T.DOOR_O:
            sctx.fillStyle = floorCols[v];
            sctx.fillRect(px, py, TS, TS);
            drawDoor(sctx, x, y, t === T.DOOR_O, v);
            break;
          default:
            sctx.fillStyle = floorCols[v];
            sctx.fillRect(px, py, TS, TS);
            drawFloorStatic(sctx, x, y, t, v);
        }
        // 网格线
        sctx.fillStyle = 'rgba(0,0,0,0.14)';
        sctx.fillRect(px, py, TS, 1);
        sctx.fillRect(px, py, 1, TS);
      }
    }

    // 光照 + 迷雾 (全图)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!exp[k]) {
          sctx.fillStyle = '#04060a';
          sctx.fillRect(x * TS, y * TS, TS, TS);
          continue;
        }
        let alpha;
        if (vis[k]) {
          const l = Util.clamp(L.light[k], 0, 1);
          const idx = Util.clamp(Math.round((1 - l) * 26) + 3, 3, 34);
          alpha = DARK[idx];
        } else {
          alpha = 'rgba(3,5,10,0.78)'; // 记忆中的区域压暗
        }
        sctx.fillStyle = alpha;
        sctx.fillRect(x * TS, y * TS, TS, TS);
        if (exp[k] && !vis[k]) {
          sctx.fillStyle = 'rgba(30,48,74,0.10)';
          sctx.fillRect(x * TS, y * TS, TS, TS);
        }
      }
    }
  }

  function drawWallBase(c, x, y, v, L) {
    const px = x * TS, py = y * TS;
    c.fillStyle = wallCols[v];
    c.fillRect(px, py, TS, TS);
    c.fillStyle = 'rgba(255,255,255,0.045)';
    c.fillRect(px, py, TS, 3);
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.fillRect(px, py + TS * 0.5 - 1, TS, 1);
    if (v & 1) c.fillRect(px + TS * 0.5 - 1, py, 1, TS * 0.5);
    else c.fillRect(px + TS * 0.3, py + TS * 0.5, 1, TS * 0.5);
    const below = L.tile(x, y + 1);
    if (!Tiles.isWall(below) && below !== T.VOID) {
      const g = c.createLinearGradient(px, py + TS * 0.55, px, py + TS);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = g;
      c.fillRect(px, py + TS * 0.55, TS, TS * 0.45);
    }
    if (v === 3 || v === 6) {
      c.strokeStyle = 'rgba(0,0,0,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(px + TS * 0.2, py + TS * 0.15);
      c.lineTo(px + TS * 0.45, py + TS * 0.5);
      c.lineTo(px + TS * 0.35, py + TS * 0.8);
      c.stroke();
    }
    // 墙面苔藓 (低频装饰)
    if (v % 17 === 3) {
      c.fillStyle = 'rgba(90,140,80,0.35)';
      c.fillRect(px + 2, py + 4, TS - 5, 3);
      c.fillRect(px + TS * 0.35, py + TS * 0.4, TS * 0.3, 3);
    }
  }

  function drawDoor(c, x, y, open, v) {
    const px = x * TS, py = y * TS;
    c.fillStyle = open ? 'rgba(90,60,30,0.55)' : PALETTE.door;
    if (open) {
      c.fillRect(px + 2, py + 2, TS - 4, 3);
      return;
    }
    c.fillRect(px + 3, py + 2, TS - 6, TS - 4);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(px + 3, py + TS * 0.5, TS - 6, 2);
    c.fillStyle = PALETTE.gold;
    c.beginPath();
    c.arc(px + TS * 0.72, py + TS * 0.55, 1.6, 0, Math.PI * 2);
    c.fill();
  }

  /** 静态地面装饰 (草/骨/裂/碎石 + 变体低频水晶/骷髅) — 入静态层 */
  function drawFloorStatic(c, x, y, t, v) {
    const px = x * TS, py = y * TS;
    switch (t) {
      case T.FLOOR: {
        // 变体哈希装饰: 深渊水晶簇 / 小骷髅堆 (低频, 每格稳定)
        if (v % 23 === 5) {
          c.save();
          c.fillStyle = 'rgba(150,110,220,0.65)';
          c.beginPath();
          c.moveTo(px + TS * 0.28, py + TS * 0.8);
          c.lineTo(px + TS * 0.42, py + TS * 0.22);
          c.lineTo(px + TS * 0.56, py + TS * 0.8);
          c.closePath();
          c.fill();
          c.fillStyle = 'rgba(195,165,255,0.55)';
          c.beginPath();
          c.moveTo(px + TS * 0.54, py + TS * 0.8);
          c.lineTo(px + TS * 0.67, py + TS * 0.4);
          c.lineTo(px + TS * 0.78, py + TS * 0.8);
          c.closePath();
          c.fill();
          c.restore();
        } else if (v % 31 === 11) {
          c.fillStyle = 'rgba(200,195,180,0.5)';
          c.beginPath(); c.arc(px + TS * 0.4, py + TS * 0.62, TS * 0.14, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(px + TS * 0.62, py + TS * 0.7, TS * 0.11, 0, Math.PI * 2); c.fill();
          c.beginPath(); c.arc(px + TS * 0.5, py + TS * 0.45, TS * 0.09, 0, Math.PI * 2); c.fill();
        }
        break;
      }
      case T.GRASS: {
        c.strokeStyle = 'rgba(90,150,90,0.5)';
        c.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const gx = px + TS * (0.25 + i * 0.22), gy = py + TS * 0.75;
          c.beginPath();
          c.moveTo(gx, gy);
          c.quadraticCurveTo(gx - 2, gy - 5, gx + (i - 1) * 3, gy - 8);
          c.stroke();
        }
        break;
      }
      case T.BONES: {
        c.strokeStyle = 'rgba(190,185,165,0.5)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(px + TS * 0.25, py + TS * 0.65);
        c.lineTo(px + TS * 0.7, py + TS * 0.45);
        c.stroke();
        c.beginPath();
        c.arc(px + TS * 0.72, py + TS * 0.42, 2.5, 0, Math.PI * 2);
        c.stroke();
        break;
      }
      case T.CRACK: {
        c.strokeStyle = 'rgba(0,0,0,0.3)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(px + TS * 0.2, py + TS * 0.2);
        c.lineTo(px + TS * 0.45, py + TS * 0.55);
        c.lineTo(px + TS * 0.4, py + TS * 0.85);
        c.stroke();
        break;
      }
      case T.RUBBLE: {
        c.fillStyle = 'rgba(80,88,102,0.8)';
        for (let i = 0; i < 4; i++) {
          const rx = px + TS * (0.2 + ((v * 37 + i * 53) % 60) / 100);
          const ry = py + TS * (0.3 + ((v * 19 + i * 41) % 50) / 100);
          c.beginPath();
          c.arc(rx, ry, 2 + (i % 2), 0, Math.PI * 2);
          c.fill();
        }
        break;
      }
    }
  }

  /** 每帧动画图块: 楼梯/泉水/宝箱/祭坛/商人/火把焰 */
  function drawTileAnimations(game, now, bx0, bx1, by0, by1) {
    const L = game.level;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const k = y * W + x;
        if (!L.explored[k]) continue;
        const t = L.tiles[k];
        const px = x * TS, py = y * TS;
        switch (t) {
          case T.STAIRS: {
            const pulse = 0.55 + 0.25 * Math.sin(now / 420);
            blitGlow(ctx, x, y, 1.4, '#5fd068', 0.42 * pulse);
            for (let i = 0; i < 3; i++) {
              ctx.fillStyle = i === 0 ? '#3f8f4a' : (i === 1 ? '#2f6f3a' : '#1f4f2a');
              ctx.fillRect(px + 3 + i * 3, py + 4 + i * 6, TS - 6 - i * 6, 5);
            }
            ctx.fillStyle = `rgba(160,255,170,${0.5 + 0.4 * Math.sin(now / 300)})`;
            ctx.beginPath();
            ctx.moveTo(px + TS / 2, py + TS * 0.82);
            ctx.lineTo(px + TS / 2 - 4, py + TS * 0.66);
            ctx.lineTo(px + TS / 2 + 4, py + TS * 0.66);
            ctx.closePath();
            ctx.fill();
            break;
          }
          case T.FOUNTAIN: {
            const pulse = 0.5 + 0.3 * Math.sin(now / 500);
            blitGlow(ctx, x, y, 1.2, '#50aaff', 0.3 * pulse);
            drawEmoji('⛲', px + TS / 2, py + TS / 2, now, 0.8);
            break;
          }
          case T.CHEST:
            drawEmoji('🧰', px + TS / 2, py + TS / 2, now, 0.82);
            break;
          case T.ALTAR:
            drawEmoji('⚱️', px + TS / 2, py + TS / 2, now, 0.8);
            break;
          case T.SHOPKEEP:
            drawEmoji('🧞', px + TS / 2, py + TS / 2, now, 0.9);
            break;
          case T.TORCH: {
            drawTorchFlame(x, y, now);
            break;
          }
        }
      }
    }
  }

  function drawTorchFlame(x, y, now) {
    const px = x * TS + TS / 2, py = y * TS + TS * 0.42;
    const fl = 0.7 + 0.3 * Math.sin(now / 90 + x * 7 + y * 13);
    const fl2 = 0.6 + 0.4 * Math.sin(now / 63 + x * 3);
    // 内晕 (精灵) + 火焰形状
    blitGlow(ctx, x, y - 0.08, 1.6, '#ffb450', 0.5 * fl);
    ctx.save();
    ctx.fillStyle = 'rgba(255,150,50,0.85)';
    ctx.beginPath();
    ctx.ellipse(px, py - TS * 0.12 * fl, TS * 0.09, TS * 0.2 * fl, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,235,150,0.9)';
    ctx.beginPath();
    ctx.ellipse(px, py - TS * 0.1, TS * 0.05, TS * 0.12 * fl2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEmoji(ch, px, py, now, sizeMul, glow) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(TS * (sizeMul || 0.78))}px ${EMOJI_FONT}`;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
    }
    const bob = Math.sin(now / 380 + px * 0.13) * 1.2;
    ctx.fillText(ch, px, py + bob);
    ctx.restore();
  }

  // ---------- 物品 ----------
  function drawItems(game, now, bx0, bx1, by0, by1) {
    const L = game.level;
    for (const it of L.items) {
      if (it.x < bx0 || it.x > bx1 || it.y < by0 || it.y > by1) continue;
      if (!L.explored[it.y * W + it.x]) continue;
      const px = it.x * TS + TS / 2, py = it.y * TS + TS / 2;
      const def = ITEMS[it.id];
      // 稀有度光晕 (精灵)
      if (def.kind === 'weapon' || def.kind === 'armor' || def.kind === 'trinket') {
        blitGlow(ctx, it.x, it.y, 0.8, '#d9ab74', 0.22);
      }
      drawEmoji(def.glyph, px, py - 1, now, 0.84);
      if (it.price) {
        ctx.save();
        ctx.font = `bold 9px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(px - 15, py + TS * 0.28, 30, 10);
        ctx.fillStyle = PALETTE.gold;
        ctx.fillText('💰' + it.price, px, py + TS * 0.28);
        ctx.restore();
      }
      if (it.count > 1) {
        ctx.save();
        ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.fillText('×' + it.count, px + TS * 0.42, py + TS * 0.42);
        ctx.restore();
      }
    }
    for (const gd of L.golds) {
      if (gd.x < bx0 || gd.x > bx1 || gd.y < by0 || gd.y > by1) continue;
      if (!L.explored[gd.y * W + gd.x]) continue;
      const px = gd.x * TS + TS / 2, py = gd.y * TS + TS / 2;
      ctx.save();
      const n = Math.min(5, 2 + Math.floor(gd.n / 12));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.4;
        const cx = px + Math.cos(a) * 5, cy = py + Math.sin(a) * 3 + 2;
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 3.2, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f5d67b';
        ctx.beginPath();
        ctx.ellipse(cx - 0.7, cy - 0.7, 1.4, 1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- 实体 ----------
  function drawEntities(game, now, bx0, bx1, by0, by1) {
    const L = game.level;
    const list = [];
    for (const e of L.enemies) {
      if (e.hp <= 0) continue;
      if (e.x < bx0 || e.x > bx1 || e.y < by0 || e.y > by1) continue;
      if (!L.explored[e.y * W + e.x]) continue;
      list.push({ kind: 'enemy', e, y: e.y });
    }
    list.push({ kind: 'player', y: game.player.y });
    list.sort((a, b) => a.y - b.y);

    for (const item of list) {
      if (item.kind === 'player') drawPlayer(game, now);
      else drawEnemy(game, item.e, now);
    }
  }

  function entityOffset(ent, now) {
    let ox = 0, oy = 0;
    if (ent.anim) {
      const p = Util.clamp((now - ent.anim.t) / ent.anim.dur, 0, 1);
      const k = 1 - Util.easeOut(p);
      ox += ent.anim.mx * k; oy += ent.anim.my * k;
    }
    if (ent.lunge) {
      const p = Util.clamp((now - ent.lunge.t) / ent.lunge.dur, 0, 1);
      ox += ent.lunge.dx * 0.32 * Math.sin(Math.PI * p);
      oy += ent.lunge.dy * 0.32 * Math.sin(Math.PI * p);
    }
    return [ox, oy];
  }

  function drawPlayer(game, now) {
    const p = game.player;
    const [ox, oy] = entityOffset(p, now);
    const px = (p.x + 0.5 + ox) * TS, py = (p.y + 0.5 + oy) * TS;

    // 脚下光环 (精灵) + 落地阴影
    blitGlow(ctx, p.x + ox, p.y + 0.3 + oy, 0.7, '#78aaff', 0.18);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + TS * 0.34, TS * 0.3, TS * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 战斗状态: 环色随敌情变化 (蓝=安全, 红=被怪盯上)
    const inCombat = game.enemiesVisible && game.enemiesVisible().some(e => e.awake && e.hp > 0);
    drawEmoji('🧙', px, py, now, 1.06, inCombat ? 'rgba(255,120,90,0.7)' : 'rgba(150,190,255,0.7)');
    ctx.save();
    ctx.strokeStyle = inCombat ? 'rgba(255,110,90,0.7)' : 'rgba(165,200,255,0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py + 1, TS * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#9db8d9';
    ctx.beginPath();
    ctx.arc(px + 9, py + 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(game, e, now) {
    const L = game.level;
    const isVis = FOV.isVisible(L, e.x, e.y);
    const [ox, oy] = entityOffset(e, now);
    const px = (e.x + 0.5 + ox) * TS, py = (e.y + 0.5 + oy) * TS;

    // boss / 精英 光晕 (精灵)
    if (e.boss && isVis) blitGlow(ctx, e.x + ox, e.y + oy, 1.5, '#ff5a3c', 0.22);
    if (e.elite && isVis) {
      const pulse = 0.65 + 0.35 * Math.sin(now / 260);
      blitGlow(ctx, e.x + ox, e.y + oy, 1.15, '#ffd25a', 0.30 * pulse);
    }

    ctx.save();
    ctx.globalAlpha = isVis ? 1 : 0.45;
    if (isVis) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(px, py + TS * 0.32, TS * (e.boss ? 0.4 : 0.28), TS * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawEmoji(e.glyph, px, py, now, e.boss ? 1.2 : 0.98, isVis && e.boss ? 'rgba(255,90,60,0.8)' : null);

    if (Status.has(e, 'frozen')) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(px, py, TS * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (isVis && e.elite) drawEmoji('👑', px, py - TS * 0.82, now, 0.55);
    if (isVis && e.hp < e.maxHp) {
      const bw = e.boss ? TS * 1.6 : TS * 1.1;
      const bx = px - bw / 2, by = py - TS * 0.52;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = e.boss ? '#ff5a4a' : '#e5484d';
      ctx.fillRect(bx, by, bw * Util.clamp(e.hp / e.maxHp, 0, 1), 3);
    }
    if (isVis && e.statuses.length) {
      ctx.font = `${Math.round(TS * 0.4)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      let sx = px - (e.statuses.length - 1) * TS * 0.18;
      for (const s of e.statuses) {
        const d = CONFIG.STATUS[s.id];
        if (d) ctx.fillText(d.icon, sx, py + TS * 0.62);
        sx += TS * 0.36;
      }
    }

    // 战斗预警: 觉醒怪头顶常驻感叹号; 贴脸/进入射程时显示下次攻击伤害预估
    if (isVis) {
      const pl = game.player;
      const dd = Util.cdist(e.x, e.y, pl.x, pl.y);
      const inRange = e.ranged ? dd <= e.ranged.range : dd <= 1;
      if (e.awake && dd > 1) {
        drawEmoji('❗', px, py - TS * 0.88, now, 0.45);
      } else if (inRange && e.awake) {
        const nextDmg = e.ranged
          ? Math.max(1, Math.round((e.ranged.dmg || e.atk) - Math.floor(pl.def / 2)))
          : Math.max(1, Math.round(Status.atkOf(e) - pl.def));
        ctx.font = `bold ${Math.round(TS * 0.42)}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = '⚔' + nextDmg;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(px - tw / 2 - 3, py - TS * 0.98, tw + 6, TS * 0.42);
        ctx.fillStyle = '#ffb35a';
        ctx.fillText(label, px, py - TS * 0.98 + TS * 0.21);
      }
    }
    ctx.restore();
  }

  // ---------- 火把外圈辉光 (每帧精灵, 抖动幅度) ----------
  function drawTorchOuterGlow(game, now) {
    const L = game.level;
    for (const t of L.torches) {
      if (!L.explored[t.y * W + t.x]) continue;
      if (L.tile(t.x, t.y) !== T.TORCH) continue;
      const d = Util.dist(game.player.x, game.player.y, t.x, t.y);
      if (d > 14) continue;
      const fl = 0.8 + 0.2 * Math.sin(now / 110 + t.x * 3.1 + t.y * 5.3);
      blitGlow(ctx, t.x, t.y, 2.2 + (t.bright ? 0.8 : 0), '#ff963c', 0.10 * fl);
    }
  }

  /** 伏击结界: 锁定中的房间描红框 (纯视觉, 边界规则在 move/AI 里) */
  function drawAmbushLocks(game, now) {
    const L = game.level;
    if (!L.ambushRooms) return;
    const pulse = 0.55 + 0.35 * Math.sin(now / 300);
    for (const r of L.ambushRooms) {
      if (!r.triggered || r.cleared) continue;
      const x0 = r.x * TS, y0 = r.y * TS, w = r.w * TS, h = r.h * TS;
      ctx.save();
      ctx.strokeStyle = `rgba(255,80,70,${0.4 + 0.3 * pulse})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,90,70,${0.45 + 0.4 * pulse})`;
      for (const [cx, cy] of [[x0 + 1, y0 + 1], [x0 + w - 1, y0 + 1], [x0 + 1, y0 + h - 1], [x0 + w - 1, y0 + h - 1]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPlayerAura(game, now) {
    const p = game.player;
    blitGlow(ctx, p.x, p.y, 2.6, '#78a0ff', 0.06);
  }

  // ---------- 屏幕空间 ----------
  function drawLowHpVignette(game, now) {
    const p = game.player;
    const r = p.hp / p.maxHp;
    if (r > 0.32) return;
    const pulse = 0.35 + 0.25 * Math.sin(now / 260);
    const a = (1 - r / 0.32) * 0.28 * pulse;
    const g = ctx.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.35, cv.width / 2, cv.height / 2, cv.height * 0.75);
    g.addColorStop(0, 'rgba(120,10,20,0)');
    g.addColorStop(1, `rgba(160,15,25,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
  }

  function drawBossBar(game, now) {
    const L = game.level;
    const boss = L.enemies.find(e => e.boss && e.awake && e.hp > 0 && (FOV.isVisible(L, e.x, e.y) || Util.dist(game.player.x, game.player.y, e.x, e.y) < 10));
    if (!boss) return;
    const bw = 480, bh = 22;
    const bx = (cv.width - bw) / 2, by = 14;
    ctx.save();
    ctx.fillStyle = 'rgba(5,8,14,0.85)';
    ctx.strokeStyle = 'rgba(200,70,60,0.6)';
    ctx.lineWidth = 1;
    roundRect(bx, by, bw, bh, 6);
    ctx.fill(); ctx.stroke();
    const frac = Util.clamp(boss.hp / boss.maxHp, 0, 1);
    const g = ctx.createLinearGradient(bx, by, bx, by + bh);
    g.addColorStop(0, '#ff6b5a');
    g.addColorStop(1, '#a02a2a');
    ctx.fillStyle = g;
    ctx.fillRect(bx + 2, by + 2, (bw - 4) * frac, bh - 4);
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${boss.name}  ${boss.hp}/${boss.maxHp}`, cv.width / 2, by + bh / 2 + 1);
    ctx.restore();
  }

  // ---------- 小地图 (底图按 key 缓存, 圆点每帧) ----------
  function renderMiniBase(game) {
    const L = game.level;
    mctx.clearRect(0, 0, miniCv.width, miniCv.height);
    const s = miniCv.width / W;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (!L.explored[k]) continue;
        const t = L.tiles[k];
        let c = null;
        if (t === T.STAIRS) c = '#5fd068';
        else if (Tiles.isWall(t)) c = '#39435a';
        else if (t === T.SHOPKEEP) c = '#e8c35a';
        else if (t === T.FOUNTAIN) c = '#4dabf7';
        else if (t === T.CHEST) c = '#c9944a';
        else c = '#1c2434';
        mctx.fillStyle = c;
        mctx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
      }
    }
    for (const it of L.items) {
      if (!L.explored[it.y * W + it.x]) continue;
      mctx.fillStyle = '#d9ab4a';
      mctx.fillRect(it.x * s, it.y * s, Math.ceil(s), Math.ceil(s));
    }
  }

  function drawMinimap(game) {
    const L = game.level;
    const mw = miniCv.width, mh = miniCv.height;
    const mx = cv.width - mw - 12, my = 12;
    const s = mw / W;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(6,9,14,0.8)';
    roundRect(mx - 4, my - 4, mw + 8, mh + 8, 6);
    ctx.fill();
    ctx.drawImage(miniCv, mx, my);
    ctx.strokeStyle = 'rgba(90,110,140,0.4)';
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const e of L.enemies) {
      if (e.hp <= 0 || !FOV.isVisible(L, e.x, e.y)) continue;
      ctx.fillStyle = e.boss ? '#ff4d4d' : '#e5484d';
      ctx.fillRect(mx + e.x * s - 1, my + e.y * s - 1, Math.ceil(s) + 2, Math.ceil(s) + 2);
    }
    const p = game.player;
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx + p.x * s - 1, my + p.y * s - 1, Math.ceil(s) + 2, Math.ceil(s) + 2);
    ctx.restore();
  }

  function drawBanner(game, now) {
    if (!game.banner) return;
    const dt = now - game.banner.t;
    if (dt > 2600) return;
    const a = dt < 300 ? dt / 300 : (dt > 2000 ? 1 - (dt - 2000) / 600 : 1);
    const by = cv.height * 0.085;
    ctx.save();
    ctx.globalAlpha = Util.clamp(a, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, by, cv.width, 58);
    ctx.fillStyle = PALETTE.gold;
    ctx.shadowColor = 'rgba(217,171,74,0.6)';
    ctx.shadowBlur = 18;
    ctx.fillText(game.banner.text, cv.width / 2, by + 27);
    ctx.shadowBlur = 0;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(200,210,225,0.85)';
    ctx.fillText(game.banner.sub || '', cv.width / 2, by + 47);
    ctx.restore();
  }

  function screenToTile(px, py) {
    const tx = Math.floor((px / curZoom + camX * TS) / TS);
    const ty = Math.floor((py / curZoom + camY * TS) / TS);
    return { x: tx, y: ty };
  }

  function drawHover(game, now) {
    const m = game.mouse;
    if (!m || m.x < 0 || m.x >= W || m.y < 0 || m.y >= H) return;
    const mmW = miniCv.width, mmH = miniCv.height;
    if (m.px > cv.width - mmW - 18 && m.py < mmH + 22) return;
    const L = game.level;
    if (!L.explored[m.y * W + m.x]) return;
    let lines = null;
    const e = L.enemyAt(m.x, m.y);
    if (e && FOV.isVisible(L, m.x, m.y)) {
      const nextDmg = e.ranged
        ? Math.max(1, Math.round((e.ranged.dmg || e.atk) - Math.floor(game.player.def / 2)))
        : Math.max(1, Math.round(Status.atkOf(e) - game.player.def));
      lines = [`${e.glyph} ${e.name}`, `HP ${e.hp}/${e.maxHp} · 攻 ${Status.atkOf(e)} · 防 ${e.def}`, e.boss ? '★ 首领' : `经验 +${e.xp}`, `⚔ 下次攻击 ≈ ${nextDmg}`];
    } else {
      const its = L.itemsAt(m.x, m.y);
      if (its.length) {
        const it = its[0];
        const d = ITEMS[it.id];
        lines = [`${d.glyph} ${Affixes.displayName(it)}`];
        const stats = [];
        if (d.atk) stats.push('攻击+' + d.atk);
        if (d.def) stats.push('防御+' + d.def);
        if (d.eva) stats.push('闪避' + (d.eva > 0 ? '+' : '') + d.eva);
        if (d.acc) stats.push('命中+' + d.acc);
        if (d.crit) stats.push('暴击+' + d.crit);
        if (stats.length) lines.push(stats.join(' · '));
        if (d.desc) lines.push(d.desc);
        if (it.price) lines.push(`💰 ${it.price} 金币 (Enter 购买)`);
      } else {
        const gd = L.goldAt(m.x, m.y);
        if (gd) lines = [`💰 金币 ×${gd.n}`];
        else {
          const td = Tiles.def(L.tiles[m.y * W + m.x]);
          if (td.interact || L.tiles[m.y * W + m.x] === T.SHOPKEEP) {
            const tip = { stairs: '下行楼梯 (Enter)', fountain: '回响泉水 (Enter 饮用)', chest: '宝箱 (Enter 开启)', altar: '深渊祭坛 (Enter 献祭)' }[td.interact];
            if (tip) lines = ['🔍 ' + tip];
          }
        }
      }
    }
    if (!lines) return;
    ctx.save();
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    let wmax = 0;
    for (const ln of lines) wmax = Math.max(wmax, ctx.measureText(ln).width);
    const bw = wmax + 16, bh = lines.length * 15 + 10;
    let bx = m.px + 14, by = m.py + 12;
    if (bx + bw > cv.width - 4) bx = m.px - bw - 10;
    if (by + bh > cv.height - 4) by = m.py - bh - 10;
    ctx.fillStyle = 'rgba(8,11,17,0.92)';
    ctx.strokeStyle = 'rgba(90,110,140,0.5)';
    roundRect(bx, by, bw, bh, 6);
    ctx.fill(); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let ty = by + 6;
    lines.forEach((ln, i) => {
      ctx.fillStyle = i === 0 ? PALETTE.gold : (i === 1 ? '#cdd4de' : '#8b95a5');
      ctx.fillText(ln, bx + 8, ty);
      ty += 15;
    });
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    init, draw, TS, screenToTile,
    get canvas() { return cv; },
    get camera() { return { x: camX, y: camY, zoom: curZoom }; },
  };
})();
