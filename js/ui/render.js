// ============ RENDER: Canvas 渲染器 ============
// 层序: 地面/墙 → 装饰 → 物品 → 实体(按 y 排序) → 光照迷雾 → 粒子 → 小地图/横幅。

'use strict';

const Render = (() => {
  let cv, ctx;
  const TS = 24;
  const W = CONFIG.MAP_W, H = CONFIG.MAP_H;
  const ZOOM = 1.5;          // 摄像机缩放
  let camX = 0, camY = 0;    // 摄像机左上角 (格坐标)

  // 预生成颜色表 (避免每帧字符串拼接)
  let floorCols, wallCols, wallFaceCols, crackCols;
  const EMOJI_FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';

  function init(canvasEl) {
    cv = canvasEl;
    ctx = cv.getContext('2d');
    cv.width = W * TS;
    cv.height = H * TS;
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

  // ---------- 主绘制 ----------
  function draw(game, now) {
    if (!ctx) return;
    const L = game.level;
    if (!L) return;

    // 摄像机: 始终跟随玩家居中 (地图外为虚空)
    const p = game.player;
    const viewW = cv.width / (TS * ZOOM);
    const viewH = cv.height / (TS * ZOOM);
    camX = p.x + 0.5 - viewW / 2;
    camY = p.y + 0.5 - viewH / 2;

    const bx0 = Math.max(0, Math.floor(camX) - 1);
    const bx1 = Math.min(W - 1, Math.ceil(camX + viewW) + 1);
    const by0 = Math.max(0, Math.floor(camY) - 1);
    const by1 = Math.min(H - 1, Math.ceil(camY + viewH) + 1);

    ctx.save();
    // 屏幕震动
    if (FX.shakeT > 0 && FX.shakeMag > 0) {
      const m = FX.shakeMag * (FX.shakeT / 0.28);
      ctx.translate((Math.random() - 0.5) * m * 2, (Math.random() - 0.5) * m * 2);
    }
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-camX * TS, -camY * TS);

    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(camX * TS - 64, camY * TS - 64, viewW * TS + 128, viewH * TS + 128);

    drawTiles(game, now, bx0, bx1, by0, by1);
    drawItems(game, now, bx0, bx1, by0, by1);
    drawEntities(game, now, bx0, bx1, by0, by1);
    drawLighting(game, bx0, bx1, by0, by1);
    drawTorchGlow(game, now);
    FX.draw(ctx, TS, now);
    drawPlayerAura(game, now);

    ctx.restore();

    // ---- 屏幕空间 UI ----
    drawLowHpVignette(game, now);
    if (game.flashRed > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(160,20,30,${Math.min(0.35, game.flashRed * 0.35)})`;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
    }
    drawBossBar(game, now);
    drawMinimap(game, now);
    drawBanner(game, now);
    drawHover(game, now);
  }

  // ---------- 图块 ----------
  function drawTiles(game, now, bx0, bx1, by0, by1) {
    const L = game.level;
    const vis = L.visible, exp = L.explored;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const k = y * W + x;
        if (!exp[k]) continue;
        const t = L.tiles[k];
        const px = x * TS, py = y * TS;
        const v = L.variant[k] & 7;

        switch (t) {
          case T.WALL:
          case T.TORCH: {
            drawWall(x, y, t, v, vis[k], now, L);
            break;
          }
          case T.DOOR_C:
          case T.DOOR_O: {
            ctx.fillStyle = floorCols[v];
            ctx.fillRect(px, py, TS, TS);
            drawDoor(x, y, t === T.DOOR_O, v);
            break;
          }
          case T.FLOOR:
          case T.GRASS:
          case T.BONES:
          case T.CRACK:
          case T.RUBBLE:
          case T.STAIRS:
          case T.FOUNTAIN:
          case T.CHEST:
          case T.ALTAR:
          case T.SHOPKEEP: {
            ctx.fillStyle = floorCols[v];
            ctx.fillRect(px, py, TS, TS);
            drawFloorDetail(x, y, t, v, now);
            break;
          }
          default: {
            ctx.fillStyle = floorCols[v];
            ctx.fillRect(px, py, TS, TS);
          }
        }
        // 网格线
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(px, py, TS, 1);
        ctx.fillRect(px, py, 1, TS);
      }
    }
  }

  function drawWall(x, y, t, v, isVis, now, L) {
    const px = x * TS, py = y * TS;
    ctx.fillStyle = wallCols[v];
    ctx.fillRect(px, py, TS, TS);
    // 顶部高光
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(px, py, TS, 3);
    // 砖缝
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px, py + TS * 0.5 - 1, TS, 1);
    if (v & 1) ctx.fillRect(px + TS * 0.5 - 1, py, 1, TS * 0.5);
    else ctx.fillRect(px + TS * 0.3, py + TS * 0.5, 1, TS * 0.5);
    // 下方是地面 → 画立面阴影
    const below = L.tile(x, y + 1);
    if (!Tiles.isWall(below) && below !== T.VOID) {
      const g = ctx.createLinearGradient(px, py + TS * 0.55, px, py + TS);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(px, py + TS * 0.55, TS, TS * 0.45);
    }
    // 裂纹
    if (v === 3 || v === 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + TS * 0.2, py + TS * 0.15);
      ctx.lineTo(px + TS * 0.45, py + TS * 0.5);
      ctx.lineTo(px + TS * 0.35, py + TS * 0.8);
      ctx.stroke();
    }
    // 火把
    if (t === T.TORCH) drawTorchFlame(x, y, now, isVis);
  }

  function drawTorchFlame(x, y, now, isVis) {
    const px = x * TS + TS / 2, py = y * TS + TS * 0.42;
    const fl = 0.7 + 0.3 * Math.sin(now / 90 + x * 7 + y * 13);
    const fl2 = 0.6 + 0.4 * Math.sin(now / 63 + x * 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 光晕
    const g = ctx.createRadialGradient(px, py, 1, px, py, TS * 1.6);
    g.addColorStop(0, `rgba(255,180,80,${0.5 * fl})`);
    g.addColorStop(0.35, `rgba(255,120,40,${0.22 * fl})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - TS * 1.6, py - TS * 1.6, TS * 3.2, TS * 3.2);
    // 火焰形状
    ctx.fillStyle = `rgba(255,150,50,${0.85})`;
    ctx.beginPath();
    ctx.ellipse(px, py - TS * 0.12 * fl, TS * 0.09, TS * 0.2 * fl, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,235,150,0.9)';
    ctx.beginPath();
    ctx.ellipse(px, py - TS * 0.1, TS * 0.05, TS * 0.12 * fl2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDoor(x, y, open, v) {
    const px = x * TS, py = y * TS;
    ctx.fillStyle = open ? 'rgba(90,60,30,0.55)' : PALETTE.door;
    if (open) {
      ctx.fillRect(px + 2, py + 2, TS - 4, 3);
      return;
    }
    ctx.fillRect(px + 3, py + 2, TS - 6, TS - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px + 3, py + TS * 0.5, TS - 6, 2);
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(px + TS * 0.72, py + TS * 0.55, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFloorDetail(x, y, t, v, now) {
    const px = x * TS, py = y * TS;
    switch (t) {
      case T.GRASS: {
        ctx.strokeStyle = 'rgba(90,150,90,0.5)';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i++) {
          const gx = px + TS * (0.25 + i * 0.22), gy = py + TS * 0.75;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.quadraticCurveTo(gx - 2, gy - 5, gx + (i - 1) * 3, gy - 8);
          ctx.stroke();
        }
        break;
      }
      case T.BONES: {
        ctx.strokeStyle = 'rgba(190,185,165,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px + TS * 0.25, py + TS * 0.65);
        ctx.lineTo(px + TS * 0.7, py + TS * 0.45);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + TS * 0.72, py + TS * 0.42, 2.5, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case T.CRACK: {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + TS * 0.2, py + TS * 0.2);
        ctx.lineTo(px + TS * 0.45, py + TS * 0.55);
        ctx.lineTo(px + TS * 0.4, py + TS * 0.85);
        ctx.stroke();
        break;
      }
      case T.RUBBLE: {
        ctx.fillStyle = 'rgba(80,88,102,0.8)';
        for (let i = 0; i < 4; i++) {
          const rx = px + TS * (0.2 + ((v * 37 + i * 53) % 60) / 100);
          const ry = py + TS * (0.3 + ((v * 19 + i * 41) % 50) / 100);
          ctx.beginPath();
          ctx.arc(rx, ry, 2 + (i % 2), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case T.STAIRS: {
        const pulse = 0.55 + 0.25 * Math.sin(now / 420);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(px + TS / 2, py + TS / 2, 2, px + TS / 2, py + TS / 2, TS * 1.4);
        g.addColorStop(0, `rgba(95,208,104,${0.42 * pulse})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - TS, py - TS, TS * 3, TS * 3);
        ctx.restore();
        // 台阶
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i === 0 ? '#3f8f4a' : (i === 1 ? '#2f6f3a' : '#1f4f2a');
          ctx.fillRect(px + 3 + i * 3, py + 4 + i * 6, TS - 6 - i * 6, 5);
        }
        // 向下箭头
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
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(px + TS / 2, py + TS / 2, 2, px + TS / 2, py + TS / 2, TS * 1.2);
        g.addColorStop(0, `rgba(80,170,255,${0.3 * pulse})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - TS, py - TS, TS * 3, TS * 3);
        ctx.restore();
        drawEmoji('⛲', px + TS / 2, py + TS / 2, now, 0.8);
        break;
      }
      case T.CHEST: {
        drawEmoji('🧰', px + TS / 2, py + TS / 2, now, 0.82);
        break;
      }
      case T.ALTAR: {
        drawEmoji('⚱️', px + TS / 2, py + TS / 2, now, 0.8);
        break;
      }
      case T.SHOPKEEP: {
        drawEmoji('🧞', px + TS / 2, py + TS / 2, now, 0.9);
        break;
      }
    }
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
      // 稀有度光晕
      if (def.kind === 'weapon' || def.kind === 'armor' || def.kind === 'trinket') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(px, py, 2, px, py, TS * 0.8);
        g.addColorStop(0, 'rgba(217,171,74,0.22)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(px - TS, py - TS, TS * 2, TS * 2);
        ctx.restore();
      }
      drawEmoji(def.glyph, px, py - 1, now, 0.84);
      // 商品价格
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
      // 数量
      if (it.count > 1) {
        ctx.save();
        ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.fillText('×' + it.count, px + TS * 0.42, py + TS * 0.42);
        ctx.restore();
      }
    }
    // 金币堆
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

  /** 计算实体绘制偏移 (移动插值 + 突进) */
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

    // 脚下光环 + 落地阴影
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(px, py + TS * 0.3, 2, px, py + TS * 0.3, TS * 0.7);
    g.addColorStop(0, 'rgba(120,170,255,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - TS, py, TS * 2, TS);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(px, py + TS * 0.34, TS * 0.3, TS * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawEmoji('🧙', px, py, now, 1.06, 'rgba(150,190,255,0.7)');
    // 玩家位置高亮环
    ctx.save();
    ctx.strokeStyle = 'rgba(165,200,255,0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py + 1, TS * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // 朝向指示 (轻微)
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

    // 可见的 boss / 精英 光晕
    if (e.boss && isVis) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(px, py, 4, px, py, TS * 1.5);
      g.addColorStop(0, 'rgba(255,90,60,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - TS * 1.5, py - TS * 1.5, TS * 3, TS * 3);
      ctx.restore();
    }
    if (e.elite && isVis) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.65 + 0.35 * Math.sin(now / 260);
      const g = ctx.createRadialGradient(px, py, 3, px, py, TS * 1.15);
      g.addColorStop(0, `rgba(255,210,90,${0.30 * pulse})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - TS * 1.15, py - TS * 1.15, TS * 2.3, TS * 2.3);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = isVis ? 1 : 0.45;
    // 落地阴影
    if (isVis) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(px, py + TS * 0.32, TS * (e.boss ? 0.4 : 0.28), TS * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawEmoji(e.glyph, px, py, now, e.boss ? 1.2 : 0.98, isVis && e.boss ? 'rgba(255,90,60,0.8)' : null);

    // 冻结覆层
    if (Status.has(e, 'frozen')) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(px, py, TS * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 血条 (受伤才显示) + 精英皇冠
    if (isVis && e.elite) drawEmoji('👑', px, py - TS * 0.82, now, 0.55);
    if (isVis && e.hp < e.maxHp) {
      const bw = e.boss ? TS * 1.6 : TS * 1.1;
      const bx = px - bw / 2, by = py - TS * 0.52;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = e.boss ? '#ff5a4a' : '#e5484d';
      ctx.fillRect(bx, by, bw * Util.clamp(e.hp / e.maxHp, 0, 1), 3);
    }
    // 状态图标
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
    ctx.restore();
  }

  // ---------- 光照 ----------
  function drawLighting(game, bx0, bx1, by0, by1) {
    const L = game.level;
    const vis = L.visible, exp = L.explored, light = L.light;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const k = y * W + x;
        if (!exp[k]) {
          ctx.fillStyle = '#04060a';
          ctx.fillRect(x * TS, y * TS, TS, TS);
          continue;
        }
        let alpha;
        if (vis[k]) {
          const l = Util.clamp(light[k], 0, 1);
          alpha = Math.round((1 - l) * 26) / 100; // 0 ~ 0.26 已见区域整体较亮
          alpha = Util.clamp(alpha + 0.03, 0.03, 0.34);
        } else {
          alpha = 0.78; // 记忆中的区域压暗
        }
        ctx.fillStyle = `rgba(3,5,10,${alpha})`;
        ctx.fillRect(x * TS, y * TS, TS, TS);
      }
    }
    // 已探索未可见区域加冷色
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const k = y * W + x;
        if (exp[k] && !vis[k]) {
          ctx.fillStyle = 'rgba(30,48,74,0.10)';
          ctx.fillRect(x * TS, y * TS, TS, TS);
        }
      }
    }
  }

  function drawTorchGlow(game, now) {
    const L = game.level;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of L.torches) {
      if (!L.explored[t.y * W + t.x]) continue;
      if (L.tile(t.x, t.y) !== T.TORCH) continue;
      const d = Util.dist(game.player.x, game.player.y, t.x, t.y);
      if (d > 14) continue;      const px = t.x * TS + TS / 2, py = t.y * TS + TS / 2;
      const fl = 0.8 + 0.2 * Math.sin(now / 110 + t.x * 3.1 + t.y * 5.3);
      const rad = TS * (2.2 + (t.bright ? 0.8 : 0)) * fl;
      const g = ctx.createRadialGradient(px, py, 2, px, py, rad);
      g.addColorStop(0, `rgba(255,150,60,${0.10 * fl})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }

  function drawPlayerAura(game, now) {
    const p = game.player;
    const px = (p.x + 0.5) * TS, py = (p.y + 0.5) * TS;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rad = TS * 2.6;
    const g = ctx.createRadialGradient(px, py, 4, px, py, rad);
    g.addColorStop(0, 'rgba(120,160,255,0.06)');
    g.addColorStop(0.5, 'rgba(90,130,220,0.03)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    ctx.restore();
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

  function drawMinimap(game, now) {
    const L = game.level;
    const mw = 150, mh = Math.round(mw * H / W);
    const mx = cv.width - mw - 12, my = 12;
    const s = mw / W;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(6,9,14,0.8)';
    roundRect(mx - 4, my - 4, mw + 8, mh + 8, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,110,140,0.4)';
    ctx.stroke();
    ctx.globalAlpha = 1;
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
        ctx.fillStyle = c;
        ctx.fillRect(mx + x * s, my + y * s, Math.ceil(s), Math.ceil(s));
      }
    }
    // 可见敌人
    for (const e of L.enemies) {
      if (e.hp <= 0 || !FOV.isVisible(L, e.x, e.y)) continue;
      ctx.fillStyle = e.boss ? '#ff4d4d' : '#e5484d';
      ctx.fillRect(mx + e.x * s - 1, my + e.y * s - 1, Math.ceil(s) + 2, Math.ceil(s) + 2);
    }
    // 物品
    for (const it of L.items) {
      if (!L.explored[it.y * W + it.x]) continue;
      ctx.fillStyle = '#d9ab4a';
      ctx.fillRect(mx + it.x * s, my + it.y * s, Math.ceil(s), Math.ceil(s));
    }
    // 玩家
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

  /** 屏幕像素 → 地砖坐标 (考虑摄像机缩放) */
  function screenToTile(px, py) {
    const tx = Math.floor((px / ZOOM + camX * TS) / TS);
    const ty = Math.floor((py / ZOOM + camY * TS) / TS);
    return { x: tx, y: ty };
  }

  /** 鼠标悬停提示 */
  function drawHover(game, now) {
    const m = game.mouse;
    if (!m || m.x < 0 || m.x >= W || m.y < 0 || m.y >= H) return;
    // 悬停在小地图区域时不出提示
    const mmW = 150, mmH = Math.round(mmW * H / W);
    if (m.px > cv.width - mmW - 18 && m.py < mmH + 22) return;
    const L = game.level;
    if (!L.explored[m.y * W + m.x]) return;
    let lines = null;
    const e = L.enemyAt(m.x, m.y);
    if (e && FOV.isVisible(L, m.x, m.y)) {
      lines = [`${e.glyph} ${e.name}`, `HP ${e.hp}/${e.maxHp} · 攻 ${Status.atkOf(e)} · 防 ${e.def}`, e.boss ? '★ 首领' : `经验 +${e.xp}`];
    } else {
      const its = L.itemsAt(m.x, m.y);
      if (its.length) {
        const it = its[0];
        const d = ITEMS[it.id];
        lines = [`${d.glyph} ${d.name}${it.count > 1 ? ' ×' + it.count : ''}`];
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
    get camera() { return { x: camX, y: camY, zoom: ZOOM }; },
  };
})();
