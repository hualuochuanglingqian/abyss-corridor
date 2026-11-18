// ============ SCREENS: 覆盖层界面 (标题/死亡/通关/帮助/图鉴/菜单) ============

'use strict';

const Screens = (() => {
  let game = null;
  let returnTo = 'play';
  let codexTab = 'bestiary';
  let abandonArmed = false;
  let abandonTimer = null;

  function init(gameRef) {
    game = gameRef;
    const $ = Util.el;

    // ---- 标题页 ----
    $('btn-new-run').addEventListener('click', () => { AudioSys.play('ui'); pickClass(cls => game.newRun(null, { cls })); });
    $('btn-continue').addEventListener('click', () => { AudioSys.play('ui'); game.continueRun(); });
    $('btn-title-help').addEventListener('click', () => { AudioSys.play('ui'); openHelp('title'); });
    $('btn-title-codex').addEventListener('click', () => { AudioSys.play('ui'); openCodex('bestiary', 'title'); });
    $('btn-title-talents').addEventListener('click', () => { AudioSys.play('ui'); openTalents(); });
    $('btn-title-challenge').addEventListener('click', () => { AudioSys.play('ui'); openChallenge(); });
    $('btn-title-ascension').addEventListener('click', () => { AudioSys.play('ui'); openAscension(); });
    $('btn-asc-none').addEventListener('click', () => { AudioSys.play('ui'); pickClass(cls => { hideAll(); game.newRun(null, { cls, asc: 0 }); }); });
    $('btn-title-daily').addEventListener('click', () => { AudioSys.play('ui'); pickClass(cls => { hideAll(); game.startDaily(cls); }); });
    $('btn-talents-close').addEventListener('click', () => { AudioSys.play('ui'); hide('overlay-talents'); game.paused = true; });
    $('btn-challenge-none').addEventListener('click', () => { AudioSys.play('ui'); pickClass(cls => { hideAll(); game.newRun(null, { cls }); }); });

    // 祝福三选一: 键盘 1/2/3
    window.addEventListener('keydown', (e) => {
      if (!visible('overlay-boon')) return;
      if (/^[1-3]$/.test(e.key)) {
        e.preventDefault();
        if (window.Game) Game.chooseBoon(parseInt(e.key, 10) - 1);
      }
    });

    // ---- 帮助 ----
    $('btn-help-close').addEventListener('click', closeHelp);

    // ---- 图鉴 ----
    $('btn-codex-close').addEventListener('click', closeCodex);
    document.querySelectorAll('.ctab').forEach(tab => {
      tab.addEventListener('click', () => {
        codexTab = tab.dataset.tab;
        document.querySelectorAll('.ctab').forEach(t => t.classList.toggle('active', t === tab));
        renderCodexBody();
      });
    });

    // ---- 死亡 ----
    $('btn-death-retry').addEventListener('click', () => { AudioSys.play('ui'); pickClass(cls => game.newRun(null, { cls })); });
    $('btn-death-menu').addEventListener('click', () => { AudioSys.play('ui'); game.toTitle(); });

    // ---- 职业选择: 取消 ----
    $('btn-class-cancel').addEventListener('click', () => {
      AudioSys.play('ui');
      hide('overlay-class');
      classCb = null;
      game.paused = true;
      title();
    });

    // ---- 通关 ----
    $('btn-win-endless').addEventListener('click', () => { AudioSys.play('ui'); game.continueEndless(); });
    $('btn-win-menu').addEventListener('click', () => { AudioSys.play('ui'); game.toTitle(); });

    // ---- 暂停菜单 ----
    $('btn-menu-resume').addEventListener('click', () => { AudioSys.play('ui'); closeMenu(); });
    $('btn-menu-camera').addEventListener('click', () => { game.toggleCamera(); refreshSettingsMenu(); });
    $('btn-menu-shake').addEventListener('click', () => { game.toggleShake(); refreshSettingsMenu(); });
    $('btn-menu-save').addEventListener('click', () => { game.saveRun(true); closeMenu(); });
    $('btn-menu-help').addEventListener('click', () => { AudioSys.play('ui'); openHelp('menu'); });
    $('btn-menu-abandon').addEventListener('click', () => {
      const btn = $('btn-menu-abandon');
      if (!abandonArmed) {
        abandonArmed = true;
        btn.textContent = '⚠ 确定放弃? 再点一次 (删档)';
        abandonTimer = setTimeout(() => { abandonArmed = false; btn.textContent = '☠ 放弃本局 (删档回主菜单)'; }, 3000);
      } else {
        clearTimeout(abandonTimer);
        abandonArmed = false;
        btn.textContent = '☠ 放弃本局 (删档回主菜单)';
        game.abandon();
      }
    });

    // ---- 顶栏 ----
    $('btn-help').addEventListener('click', () => { AudioSys.play('ui'); openHelp(game.state === 'play' ? 'play' : 'title'); });
    $('btn-codex').addEventListener('click', () => { AudioSys.play('ui'); openCodex('bestiary', game.state === 'play' ? 'play' : 'title'); });
    $('btn-save').addEventListener('click', () => {
      if (game.state !== 'play') return;
      game.saveRun(true);
    });
    $('btn-mute').addEventListener('click', () => {
      const v = AudioSys.toggleMute();
      $('btn-mute').textContent = v === 0 ? '🔇 静音' : (v <= 0.3 ? '🔉 音效' : '🔊 音效');
      if (v > 0) AudioSys.play('ui');
    });
    $('btn-menu').addEventListener('click', () => {
      if (game.state === 'play') openMenu();
    });

    // 成就通知
    Util.bus.on('achievement', (def) => {
      toast(`🏅 成就解锁${def.icon} <b>${def.name}</b> — ${def.desc}`, 3200);
    });

    // ---- 对话系统 ----
    $('overlay-dialog').addEventListener('click', () => advanceDialogue());
    $('btn-dialog-skip').addEventListener('click', (e) => { e.stopPropagation(); skipDialogue(); });
    window.addEventListener('keydown', (e) => {
      if (!visible('overlay-dialog')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceDialogue(); }
    });
  }

  // ---------- 基础 ----------
  function show(id) { Util.el(id).classList.add('visible'); }
  function hide(id) { Util.el(id).classList.remove('visible'); }
  function visible(id) { return Util.el(id).classList.contains('visible'); }

  function hideAll() {
    document.querySelectorAll('.overlay').forEach(o => o.classList.remove('visible'));
  }

  // ---------- 标题 ----------
  function title() {
    hideAll();
    refreshRecord();
    const vEl = Util.el('game-version');
    if (vEl) vEl.textContent = `v${CONFIG.VERSION} · MIT 开源 · 欢迎共建`;
    Util.el('title-shards').textContent = `💎 魂晶 ${Util.fmt(Meta.data.shards || 0)} · 死亡与通关都会凝结魂晶, 在「天赋」中永久变强`;
    show('overlay-title');
    const btn = Util.el('btn-continue');
    btn.disabled = !SaveSys.hasSave();
    btn.style.opacity = SaveSys.hasSave() ? '1' : '0.4';
    game.paused = true;
  }

  function refreshRecord() {
    const r = Meta.data.records;
    Util.el('title-record').textContent =
      `最深抵达 第 ${r.deepest} 层 · 最高分 ${Util.fmt(r.bestScore)} · 通关 ${r.wins} 次 · 累计击杀 ${Util.fmt(r.totalKills)}`;
  }

  // ---------- 帮助 ----------
  function openHelp(from) {
    returnTo = from || 'play';
    if (from === 'menu') returnTo = 'menu';
    if (from === 'title') returnTo = 'title';
    show('overlay-help');
    game.paused = true;
  }

  function closeHelp() {
    hide('overlay-help');
    afterCloseOverlay();
  }

  // ---------- 图鉴 ----------
  function openCodex(tab, from) {
    codexTab = tab || codexTab;
    returnTo = from || 'play';
    document.querySelectorAll('.ctab').forEach(t => t.classList.toggle('active', t.dataset.tab === codexTab));
    renderCodexBody();
    show('overlay-codex');
    game.paused = true;
  }

  function closeCodex() {
    hide('overlay-codex');
    afterCloseOverlay();
  }

  function renderCodexBody() {
    const body = Util.el('codex-body');
    if (codexTab === 'bestiary') {
      const list = Meta.listBestiary();
      const seenN = list.filter(x => x.seen).length;
      body.innerHTML = `<div class="panel-hint" style="margin-bottom:10px">已收录 ${seenN} / ${list.length} 种敌人</div>
        <div class="cx-grid">` + list.map(en => `
        <div class="cx-card ${en.seen ? '' : 'unknown'} ${en.boss ? 'cx-boss' : ''}">
          <div class="cx-glyph">${en.seen ? en.glyph : '❓'}</div>
          <div class="cx-info">
            <div class="cx-name">${en.seen ? en.name : '未知生物'}${en.boss ? ' ★' : ''}</div>
            <div class="cx-detail">${en.seen
              ? `HP ${en.hp} · 攻 ${en.atk} · 防 ${en.def}<br>${en.boss ? '首领' : '经验 +' + en.xp} · 出没 ${en.floors} 层<br>击杀 ${en.kills}`
              : '尚未遭遇'}</div>
          </div>
        </div>`).join('') + '</div>';
    } else if (codexTab === 'achievements') {
      const list = Meta.listAchievements();
      const doneN = list.filter(x => x.done).length;
      body.innerHTML = `<div class="panel-hint" style="margin-bottom:10px">已达成 ${doneN} / ${list.length}</div>
        <div class="ach-grid">` + list.map(a => `
        <div class="ach-card ${a.done ? 'done' : ''}">
          <div class="ach-ico">${a.done ? a.icon : '🔒'}</div>
          <div>
            <div class="ach-name ${a.done ? 'done' : ''}">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
          </div>
        </div>`).join('') + '</div>';
    } else if (codexTab === 'echoes') {
      // 回响: 记忆碎片收集 (v2.3)
      const total = STORY.notes.length;
      const got = Meta.noteCount();
      body.innerHTML = `<div class="panel-hint" style="margin-bottom:10px">
        📜 掘金队日记 — 三代人之前被深渊吞掉的十二个人, 只留下这些碎片。已收集 <b>${got} / ${total}</b>
        ${got >= total ? ' · <b style="color:var(--gold)">🧩 已拼齐 — 歌声的调子, 是你自己的名字</b>' : ' · 走遍 1~15 层寻找泛紫光的纸页'}
      </div>
      <div class="echo-grid">` + STORY.notes.map((txt, i) => {
        const has = Meta.hasNote(i);
        return `<div class="echo-card ${has ? '' : 'unknown'}">
          <div class="echo-idx">${has ? '📜' : '🔒'} 碎片 ${i + 1}</div>
          <div class="echo-text">${has ? txt : '尚未寻回的回响…'}</div>
        </div>`;
      }).join('') + '</div>';
    } else {
      const r = Meta.data.records;
      const daily = Meta.data.daily;
      const totalKinds = Object.keys(ENEMIES).length;
      const seenKinds = Object.values(Meta.data.bestiary).filter(n => n > 0).length;
      body.innerHTML = `<table class="rec-table">
        <tr><td>最深抵达</td><td>第 ${r.deepest} 层</td></tr>
        <tr><td>历史最高分</td><td>${Util.fmt(r.bestScore)}</td></tr>
        <tr><td>通关次数</td><td>${r.wins}</td></tr>
        <tr><td>累计开局</td><td>${r.runs}</td></tr>
        <tr><td>累计击杀</td><td>${Util.fmt(r.totalKills)}</td></tr>
        <tr><td>累计开箱</td><td>${Meta.data.chests}</td></tr>
        <tr><td>图鉴收录</td><td>${seenKinds} / ${totalKinds}</td></tr>
        <tr><td>☀️ 每日挑战</td><td>${daily && daily.date ? `${daily.date} · 最佳 ${Util.fmt(daily.bestScore)} 分 · 最深 ${daily.deepest} 层` : '今日尚未挑战'}</td></tr>
        <tr><td>🏆 挑战最佳</td><td>${r.challengeBest ? `${r.challengeBest.name} · ${Util.fmt(r.challengeBest.score)} 分 (第 ${r.challengeBest.floor} 层)` : '—'}</td></tr>
      </table>`;
    }
  }

  function afterCloseOverlay() {
    if (returnTo === 'menu') {
      show('overlay-menu');
      game.paused = true;
    } else if (returnTo === 'title') {
      show('overlay-title');
      game.paused = true;
    } else {
      game.paused = false;
    }
  }

  // ---------- 对话 ----------
  let dq = null;
  function showDialogue(lines, onDone) {
    dq = { lines, i: 0, onDone: onDone || null };
    show('overlay-dialog');
    renderDialogue();
  }
  function renderDialogue() {
    const step = dq.lines[dq.i];
    Util.el('dialog-name').textContent = step.name || '';
    Util.el('dialog-text').textContent = step.text || '';
  }
  function advanceDialogue() {
    if (!dq) return;
    dq.i++;
    if (dq.i >= dq.lines.length) {
      const cb = dq.onDone;
      dq = null;
      hide('overlay-dialog');
      if (cb) cb();
    } else renderDialogue();
  }
  function skipDialogue() {
    if (!dq) return;
    const cb = dq.onDone;
    dq = null;
    hide('overlay-dialog');
    if (cb) cb();
  }

  // ---------- 菜单 ----------
  function refreshSettingsMenu() {
    const b1 = Util.el('btn-menu-camera');
    const b2 = Util.el('btn-menu-shake');
    if (b1) b1.textContent = `🎥 镜头: ${game.settings.camera === 'fixed' ? '固定地图' : '平滑跟随'}`;
    if (b2) b2.textContent = `📳 屏幕震动: ${game.settings.shake === false ? '关' : '开'}`;
  }
  function openMenu() {
    refreshSettingsMenu();
    show('overlay-menu');
    game.paused = true;
  }
  function closeMenu() {
    hide('overlay-menu');
    game.paused = false;
  }

  // ---------- 祝福三选一 ----------
  function showBoonChoices(choices) {
    const box = Util.el('boon-cards');
    box.innerHTML = choices.map((id, i) => {
      const d = Boons.def(id);
      if (!d) return '';
      return `<div class="boon-card ${d.cursed ? 'cursed' : ''}" data-idx="${i}">
        <div class="bc-icon">${d.icon}</div>
        <div class="bc-name">${d.cursed ? '⚠ ' : ''}${d.name}${d.cursed ? ' <span style="font-size:10px">诅咒</span>' : ''}</div>
        <div class="bc-desc">${d.desc}</div>
        <div class="bc-key">[ ${i + 1} ]</div>
      </div>`;
    }).join('');
    box.querySelectorAll('.boon-card').forEach(card => {
      card.addEventListener('click', () => {
        if (window.Game) Game.chooseBoon(parseInt(card.dataset.idx, 10));
      });
    });
    show('overlay-boon');
  }

  function hideBoonChoices() {
    hide('overlay-boon');
  }

  // ---------- 天赋 · 魂晶 ----------
  function openTalents() {
    renderTalents();
    show('overlay-talents');
    game.paused = true;
  }

  function renderTalents() {
    const shards = Meta.data.shards || 0;
    const levels = Meta.data.talents || {};
    Util.el('talent-shards').textContent = `💎 魂晶: ${Util.fmt(shards)}`;
    const list = Util.el('talent-list');
    list.innerHTML = Talents.all().map(t => {
      const lv = levels[t.id] || 0;
      const owned = lv >= t.max;
      const canBuy = Talents.canBuy(levels, t.id) && shards >= t.cost;
      const locked = t.req && !(levels[t.req] || 0);
      return `<div class="talent-row ${owned ? 'owned' : ''}">
        <div class="tl-icon">${t.icon}</div>
        <div class="tl-info">
          <div class="tl-name">${t.name}${t.max > 1 ? `<span class="tl-lv">Lv.${lv}/${t.max}</span>` : ''}</div>
          <div class="tl-desc">${locked ? `🔒 需要「${Talents.def(t.req).name}」` : t.desc}</div>
        </div>
        ${owned
          ? '<div class="tl-cost" style="color:var(--gold)">✔ 已习得</div>'
          : `<button class="mbtn small tl-buy" data-id="${t.id}" ${canBuy ? '' : 'disabled'}>💎 ${t.cost}</button>`}
      </div>`;
    }).join('');
    list.querySelectorAll('.tl-buy').forEach(btn => {
      btn.addEventListener('click', () => {
        if (Meta.buyTalent(btn.dataset.id)) {
          AudioSys.play('levelup');
          HUD.toast('💎 天赋习得! 下局开局生效');
          renderTalents();
        } else {
          AudioSys.play('error');
        }
      });
    });
  }

  // ---------- 挑战模式 ----------
  function openChallenge() {
    const box = Util.el('challenge-cards');
    box.innerHTML = CONFIG.CHALLENGES.map((c, i) => `
      <div class="challenge-card">
        <div class="cc-icon">${c.icon}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-desc">${c.desc}</div>
        <button class="mbtn small cc-start" data-idx="${i}" style="margin-top:10px">开始挑战</button>
      </div>`).join('');
    box.querySelectorAll('.cc-start').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = CONFIG.CHALLENGES[parseInt(btn.dataset.idx, 10)];
        pickClass(cls => { hideAll(); game.newRun(c, { cls }); });
      });
    });
    show('overlay-challenge');
    game.paused = true;
  }

  // ---------- 深渊契约 (v2.5) ----------
  function openAscension() {
    const unlocked = Math.min(CONFIG.ASCENSION.length, Meta.data.records.ascUnlocked || 0);
    const box = Util.el('asc-list');
    box.innerHTML = CONFIG.ASCENSION.map((a, i) => {
      const lv = i + 1;
      const locked = lv > unlocked;
      const stack = CONFIG.ASCENSION.slice(0, lv).map(x => x.name).join(' + ');
      return `<div class="asc-row ${locked ? 'locked' : ''}">
        <div class="asc-lv">${locked ? '🔒' : '🩸'} 第 ${lv} 阶</div>
        <div class="asc-info">
          <div class="asc-name">${a.name}${locked ? ' (未解锁)' : ''}</div>
          <div class="asc-desc">${a.desc}${lv > 1 ? `<br><span class="dim">叠加: ${stack}</span>` : ''}</div>
        </div>
        ${locked
          ? '<div class="asc-go dim">通关解锁</div>'
          : `<button class="mbtn small asc-go" data-asc="${lv}">签订</button>`}
      </div>`;
    }).join('');
    box.querySelectorAll('.asc-go[data-asc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const asc = parseInt(btn.dataset.asc, 10);
        pickClass(cls => { hideAll(); game.newRun(null, { cls, asc }); });
      });
    });
    show('overlay-ascension');
    game.paused = true;
  }

  // ---------- 职业选择 (v2.3) ----------
  let classCb = null;
  function pickClass(cb) {
    classCb = cb || null;
    const box = Util.el('class-cards');
    box.innerHTML = CONFIG.CLASSES.map((c, i) => `
      <div class="boon-card class-card" data-idx="${i}">
        <div class="bc-icon">${c.glyph}</div>
        <div class="bc-name">${c.icon} ${c.name}</div>
        <div class="bc-desc">${c.desc}</div>
        <div class="bc-key">初始: ${ITEMS[c.weapon].glyph} ${ITEMS[c.weapon].name}</div>
      </div>`).join('');
    box.querySelectorAll('.class-card').forEach(card => {
      card.addEventListener('click', () => {
        const c = CONFIG.CLASSES[parseInt(card.dataset.idx, 10)];
        AudioSys.play('ui');
        hide('overlay-class');
        game.paused = false;
        if (classCb) classCb(c.id);
        classCb = null;
      });
    });
    show('overlay-class');
    game.paused = true;
  }

  // ---------- 死亡 ----------
  /** 按死因给出针对性建议 (v2.3) */
  function deathAdvice(cause, g) {
    const c = cause || '';
    const notes = Meta.noteCount();
    const noteLine = notes < 15 ? ` 另: 你已收集 ${notes}/15 枚记忆碎片 — 图鉴「回响」页等着补完。` : ' 你已集齐全部记忆碎片 — 掘金队的故事由你续写。';
    if (/中毒/.test(c)) return '🕯 建议: 背包常备 🌿 净化药剂 (中毒/灼烧一扫而空); 毒牙蛇/铠蝎出没的层更要带。' + noteLine;
    if (/灼烧|火|龙/.test(c)) return '🕯 建议: 对火系敌人拉开距离打; 🐲 龙鳞铠免疫灼烧, 龙掉必出。近战打龙先看好退路。' + noteLine;
    if (/伏击|围/.test(c)) return '🕯 建议: 伏击房先退到房间角落, 让敌人排队进来 — 一次只挨一拳。' + noteLine;
    if (/被 .+ 击杀/.test(c)) {
      if (g && g.floor >= 10) return '🕯 建议: 深层精英更凶 — 看清名字里的词缀再决定打不打; 退到走廊口让它们排队。' + noteLine;
      return '🕯 建议: 群战退到走廊口卡位, 一列只放一只进来; 精英怪名字里的词缀就是它的招。' + noteLine;
    }
    if (/状态|毒/.test(c)) return '🕯 建议: 中毒/灼烧会持续掉血 — 见到 🌿 净化药剂别犹豫, 直接囤。' + noteLine;
    return '🕯 建议: 每层三选一祝福决定流派 — 同类祝福叠加收益远大于分散; 血量 <40% 立刻 Q 喝药。' + noteLine;
  }

  function death(g, cause, score, shards) {
    hideAll();
    game = g;
    Util.el('death-cause').textContent = cause || '';
    const tipEl = Util.el('death-tip');
    if (tipEl) tipEl.textContent = deathAdvice(cause, g);
    const p = g.player;
    Util.el('death-stats').innerHTML = [
      ['到达层数', '第 ' + g.floor + ' 层'],
      ['等级', 'Lv.' + p.level],
      ['击杀', p.kills],
      ['金币', Util.fmt(p.gold)],
      ['总回合', Util.fmt(g.turn)],
      ['造成伤害', Util.fmt(g.stats.damageDealt)],
      ['承受伤害', Util.fmt(g.stats.taken)],
      ['本局得分', Util.fmt(score)],
      ['💎 魂晶收益', '+' + Util.fmt(shards || 0)],
      ['魂晶总库存', Util.fmt(Meta.data.shards || 0)],
      ['最高分', Util.fmt(Meta.data.records.bestScore)],
    ].map(([k, v]) => `<div class="ds-item"><div class="ds-v">${v}</div><div class="ds-k">${k}</div></div>`).join('');
    show('overlay-death');
    game.paused = true;
  }

  // ---------- 通关 ----------
  function win(g, score, shards) {
    hideAll();
    game = g;
    const p = g.player;
    Util.el('win-stats').innerHTML = [
      ['通关', '第 15 层' + (g.challenge ? ` · ${g.challenge.name}` : '')],
      ['等级', 'Lv.' + p.level],
      ['击杀', p.kills],
      ['金币', Util.fmt(p.gold)],
      ['总回合', Util.fmt(g.turn)],
      ['本局得分', Util.fmt(score)],
      ['💎 魂晶收益', '+' + Util.fmt(shards || 0)],
      ['魂晶总库存', Util.fmt(Meta.data.shards || 0)],
    ].map(([k, v]) => `<div class="ds-item"><div class="ds-v">${v}</div><div class="ds-k">${k}</div></div>`).join('');
    show('overlay-win');
    game.paused = true;
  }

  // ---------- 提示 ----------
  function toast(text, ms) { HUD.toast(text, ms); }

  return {
    init, show, hide, hideAll, title, death, win, toast,
    openHelp, openCodex, openMenu, closeMenu, closeHelp, closeCodex, refreshRecord,
    showBoonChoices, hideBoonChoices, openTalents, openChallenge, openAscension,
    showDialogue, pickClass,
    get pausedByOverlay() { return !!document.querySelector('.overlay.visible'); },
  };
})();
