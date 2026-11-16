// ============ FX: 粒子 / 飘字 / 弹道 / 震屏 ============
// 所有坐标以"格"为单位 (浮点), 渲染时乘 TILE。
// 逻辑与渲染分离: 这里只维护数据 + 更新, 由 Render 负责画。

'use strict';

const FX = (() => {
  const parts = [];       // 粒子
  const floats = [];      // 飘字
  const projectiles = []; // 弹道
  const novas = [];       // 扩散环
  let shakeMag = 0, shakeT = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  function spawnParticle(x, y, opts) {
    parts.push(Object.assign({
      x, y, vx: 0, vy: 0,
      life: 0.5, maxLife: 0.5,
      size: 0.12, color: '#fff',
      type: 'dot', drag: 0.9,
    }, opts, { maxLife: opts.life || 0.5 }));
    if (parts.length > 700) parts.splice(0, parts.length - 700);
  }

  /** 通用爆裂 */
  function burst(x, y, color, n, opts) {
    opts = opts || {};
    n = n || 8;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.6, 2.6) * (opts.speed || 1);
      spawnParticle(x + rand(-0.25, 0.25), y + rand(-0.25, 0.25), {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6) * (opts.lifeMul || 1),
        size: rand(0.06, 0.16) * (opts.sizeMul || 1),
        color, type: 'spark', drag: 0.86,
      });
    }
  }

  /** 命中: 火花 + 血点 */
  function hit(x, y, color, crit) {
    const n = crit ? 18 : 9;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1, 4) * (crit ? 1.5 : 1);
      spawnParticle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.18, 0.5), size: rand(0.05, 0.14),
        color: i % 3 === 0 ? '#8e2b33' : color, type: 'spark', drag: 0.82,
      });
    }
  }

  /** 玩家受伤: 红色碎屑四溅 */
  function hurt(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1, 3.4);
      spawnParticle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.2, 0.55), size: rand(0.06, 0.15),
        color: i % 2 ? '#e5484d' : '#8e2b33', type: 'shard', drag: 0.85,
      });
    }
  }

  function death(x, y, color) {
    for (let i = 0; i < 22; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.6, 3);
      spawnParticle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.4, 0.9), size: rand(0.08, 0.2),
        color: i % 3 ? color : '#4a4f5c', type: 'smoke', drag: 0.9,
      });
    }
    // 消散的骷髅轮廓
    floats.push({ x, y: y - 0.3, text: '💀', color: '#9aa5b5', life: 1.1, maxLife: 1.1, big: true, emoji: true });
  }

  /** 魂魄上升: 击杀后一团发光碎片缓缓升空 (v2.3 打击感) */
  function soul(x, y, color) {
    for (let i = 0; i < 7; i++) {
      spawnParticle(x + rand(-0.3, 0.3), y + rand(-0.2, 0.2), {
        vx: rand(-0.15, 0.15), vy: rand(-1.4, -0.6),
        life: rand(0.6, 1.2), size: rand(0.07, 0.16),
        color: i % 2 ? color : '#fff3bf', type: 'ember', drag: 0.985,
      });
    }
  }

  function boom(x, y, big) {
    const n = big ? 46 : 26;
    const cols = ['#ffd43b', '#ff9538', '#ff5a4a', '#fff3bf'];
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(1.5, 7) * (big ? 1.4 : 1);
      spawnParticle(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.3, 0.8), size: rand(0.1, 0.28),
        color: cols[i % cols.length], type: 'spark', drag: 0.88,
      });
    }
    novas.push({ x, y, r0: 0.3, r1: big ? 3.4 : 2.2, color: '#ffb35a', t: 0, dur: 0.4, width: 3 });
    shake(big ? 9 : 5);
  }

  function flame(x, y) {
    for (let i = 0; i < 10; i++) {
      spawnParticle(x + rand(-0.3, 0.3), y + rand(-0.3, 0.3), {
        vx: rand(-0.3, 0.3), vy: rand(-1.6, -0.5),
        life: rand(0.25, 0.6), size: rand(0.12, 0.26),
        color: ['#ffd43b', '#ff9538', '#ff5a4a'][i % 3], type: 'ember', drag: 0.95,
      });
    }
  }

  function trail(x, y, color) {
    spawnParticle(x, y, { life: 0.3, size: 0.22, color, type: 'smoke' });
  }

  /** 治疗/增益环 */
  function ring(x, y, color) {
    novas.push({ x, y, r0: 0.2, r1: 1.1, color, t: 0, dur: 0.5, width: 2, up: true });
    for (let i = 0; i < 12; i++) {
      spawnParticle(x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), {
        vx: rand(-0.2, 0.2), vy: rand(-1.8, -0.6),
        life: rand(0.4, 0.8), size: rand(0.06, 0.14),
        color, type: 'spark', drag: 0.97,
      });
    }
  }

  /** 大型扩散 (死亡之光/新星) */
  function nova(x, y, color, radius) {
    novas.push({ x, y, r0: 0.2, r1: radius || 3, color, t: 0, dur: 0.55, width: 4 });
    burst(x, y, color, 18);
  }

  function levelUp(x, y) {
    ring(x, y, '#ffd43b');
    for (let i = 0; i < 26; i++) {
      spawnParticle(x + rand(-0.6, 0.6), y + rand(-0.3, 0.3), {
        vx: rand(-0.2, 0.2), vy: rand(-2.4, -0.8),
        life: rand(0.5, 1.1), size: rand(0.06, 0.16),
        color: ['#ffd43b', '#fff3bf', '#ffb35a'][i % 3], type: 'spark', drag: 0.97,
      });
    }
  }

  function projectile(x0, y0, x1, y1, color) {
    projectiles.push({ x0, y0, x1, y1, x: x0, y: y0, color, t: 0, dur: 0.22 });
  }

  function float(x, y, text, color, big) {
    floats.push({ x: x + rand(-0.15, 0.15), y: y - 0.4, text, color: color || '#fff', life: big ? 1.0 : 0.8, maxLife: big ? 1.0 : 0.8, big: !!big });
  }

  /** 攻击突进: 目标实体向对方方向冲一下 */
  function lunge(ent, target) {
    const dx = Math.sign(target.x - ent.x), dy = Math.sign(target.y - ent.y);
    ent.lunge = { dx, dy, t: performance.now(), dur: 110 };
  }

  /** 移动插值: 记录旧位置偏移, 渲染时衰减 */
  function step(ent, nx, ny) {
    ent.anim = { mx: ent.x - nx, my: ent.y - ny, t: performance.now(), dur: 110 };
  }

  function shake(mag) {
    shakeMag = Math.max(shakeMag, mag);
    shakeT = 0.28;
  }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.y -= dt * 0.7;
      if (f.life <= 0) floats.splice(i, 1);
    }
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.t += dt;
      const k = Math.min(1, pr.t / pr.dur);
      pr.x = Util.lerp(pr.x0, pr.x1, k);
      pr.y = Util.lerp(pr.y0, pr.y1, k);
      spawnParticle(pr.x, pr.y, {
        life: 0.18, size: rand(0.05, 0.1),
        color: pr.color, type: 'spark', drag: 0.9,
      });
      if (k >= 1) {
        burst(pr.x1, pr.y1, pr.color, 10);
        projectiles.splice(i, 1);
      }
    }
    for (let i = novas.length - 1; i >= 0; i--) {
      const n = novas[i];
      n.t += dt;
      if (n.t >= n.dur) novas.splice(i, 1);
    }
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeMag = 0; }
  }

  /** 渲染入口: ctx 为整幅画布, TS = 图块像素 */
  function draw(ctx, TS, now) {
    // 弹道
    for (const pr of projectiles) {
      const px = (pr.x + 0.5) * TS, py = (pr.y + 0.5) * TS;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(px, py, 1, px, py, TS * 0.7);
      g.addColorStop(0, pr.color);
      g.addColorStop(0.4, Util.rgba(pr.color, 0.5));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - TS, py - TS, TS * 2, TS * 2);
      ctx.restore();
    }
    // 扩散环
    for (const n of novas) {
      const k = Math.min(1, n.t / n.dur);
      const r = Util.lerp(n.r0, n.r1, Util.easeOut(k)) * TS;
      const a = 1 - k;
      ctx.save();
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = n.color;
      ctx.lineWidth = n.width * (1 - k * 0.5);
      ctx.beginPath();
      ctx.arc((n.x + 0.5) * TS, (n.y + 0.5) * TS, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // 粒子
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const a = Util.clamp(p.life / p.maxLife, 0, 1);
      const px = (p.x + 0.5) * TS, py = (p.y + 0.5) * TS;
      const sz = Math.max(1, p.size * TS);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.color;
      if (p.type === 'spark') {
        ctx.beginPath();
        ctx.arc(px, py, sz * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'ember') {
        ctx.beginPath();
        ctx.ellipse(px, py, sz * 0.5, sz, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, sz, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // 飘字
    for (const f of floats) {
      const a = Util.clamp(f.life / f.maxLife, 0, 1);
      const px = (f.x + 0.5) * TS, py = (f.y + 0.5) * TS;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (f.emoji) {
        ctx.font = `${Math.round(TS * 1.2)}px "Segoe UI Emoji", sans-serif`;
      } else {
        ctx.font = f.big
          ? `bold 24px "Fusion Pixel 12px", "Microsoft YaHei", sans-serif`
          : `bold 12px "Fusion Pixel 12px", "Microsoft YaHei", sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,.75)';
        ctx.strokeText(f.text, px, py);
      }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, px, py);
      ctx.restore();
    }
  }

  function clear() {
    parts.length = 0; floats.length = 0; projectiles.length = 0; novas.length = 0;
    shakeMag = 0; shakeT = 0;
  }

  return {
    burst, hit, hurt, death, soul, boom, flame, trail, ring, nova, levelUp,
    projectile, float, lunge, step, shake, update, draw, clear,
    get shakeMag() { return shakeMag; },
    get shakeT() { return shakeT; },
    _parts: parts,
  };
})();
