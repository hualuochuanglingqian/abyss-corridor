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
    $('btn-new-run').addEventListener('click', () => { AudioSys.play('ui'); game.newRun(null); });
    $('btn-continue').addEventListener('click', () => { AudioSys.play('ui'); game.continueRun(); });
    $('btn-title-help').addEventListener('click', () => { AudioSys.play('ui'); openHelp('title'); });
    $('btn-title-codex').addEventListener('click', () => { AudioSys.play('ui'); openCodex('bestiary', 'title'); });
    $('btn-title-talents').addEventListener('click', () => { AudioSys.play('ui'); openTalents(); });
    $('btn-title-challenge').addEventListener('click', () => { AudioSys.play('ui'); openChallenge(); });
    $('btn-talents-close').addEventListener('click', () => { AudioSys.play('ui'); hide('overlay-talents'); game.paused = true; });
    $('btn-challenge-none').addEventListener('click', () => { AudioSys.play('ui'); hideAll(); game.newRun(null); });

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
    $('btn-death-retry').addEventListener('click', () => { AudioSys.play('ui'); game.newRun(); });
    $('btn-death-menu').addEventListener('click', () => { AudioSys.play('ui'); game.toTitle(); });

    // ---- 通关 ----
    $('btn-win-endless').addEventListener('click', () => { AudioSys.play('ui'); game.continueEndless(); });
    $('btn-win-menu').addEventListener('click', () => { AudioSys.play('ui'); game.toTitle(); });

    // ---- 暂停菜单 ----
    $('btn-menu-resume').addEventListener('click', () => { AudioSys.play('ui'); closeMenu(); });
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
      const muted = AudioSys.toggleMute();
      $('btn-mute').textContent = muted ? '🔇 静音' : '🔊 音效';
      if (!muted) AudioSys.play('ui');
    });
    $('btn-menu').addEventListener('click', () => {
      if (game.state === 'play') openMenu();
    });

    // 成就通知
    Util.bus.on('achievement', (def) => {
      toast(`🏅 成就解锁${def.icon} <b>${def.name}</b> — ${def.desc}`, 3200);
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
    } else {
      const r = Meta.data.records;
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

  // ---------- 菜单 ----------
  function openMenu() {
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
      return `<div class="boon-card" data-idx="${i}">
        <div class="bc-icon">${d.icon}</div>
        <div class="bc-name">${d.name}</div>
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
        hideAll();
        game.newRun(c);
      });
    });
    show('overlay-challenge');
    game.paused = true;
  }

  // ---------- 死亡 ----------
  function death(g, cause, score, shards) {
    hideAll();
    game = g;
    Util.el('death-cause').textContent = cause || '';
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
    showBoonChoices, hideBoonChoices, openTalents, openChallenge,
    get pausedByOverlay() { return !!document.querySelector('.overlay.visible'); },
  };
})();
