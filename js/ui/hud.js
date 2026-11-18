// ============ HUD: 右侧栏 / 日志 / 提示 ============

'use strict';

const HUD = (() => {
  let els = {};
  let toastTimer = null;
  let lastInvSnapshot = '';
  let lastSkillLevel = -1;
  let logCount = 0;

  function init() {
    els = {
      floor: Util.el('tb-floor'),
      gold: Util.el('tb-gold'),
      turn: Util.el('tb-turn'),
      seed: Util.el('tb-seed'),
      name: Util.el('st-name'),
      lv: Util.el('st-level'),
      hpBar: Util.el('bar-hp'), hpText: Util.el('bar-hp-text'),
      mpBar: Util.el('bar-mp'), mpText: Util.el('bar-mp-text'),
      xpBar: Util.el('bar-xp'), xpText: Util.el('bar-xp-text'),
      status: Util.el('status-icons'),
      atk: Util.el('st-atk'), def: Util.el('st-def'),
      acc: Util.el('st-acc'), eva: Util.el('st-eva'),
      crit: Util.el('st-crit'), kills: Util.el('st-kills'),
      invGrid: Util.el('inv-grid'), invCount: Util.el('inv-count'),
      skillList: Util.el('skill-list'),
      log: Util.el('log'),
      toast: Util.el('toast'),
      eq: {
        weapon: { g: Util.el('eq-weapon-g'), n: Util.el('eq-weapon-n'), s: Util.el('eq-weapon-s') },
        weapon2: { g: Util.el('eq-weapon2-g'), n: Util.el('eq-weapon2-n'), s: Util.el('eq-weapon2-s') },
        armor: { g: Util.el('eq-armor-g'), n: Util.el('eq-armor-n'), s: Util.el('eq-armor-s') },
        trinket: { g: Util.el('eq-trinket-g'), n: Util.el('eq-trinket-n'), s: Util.el('eq-trinket-s') },
      },
      boons: Util.el('boon-chips'),
      chal: Util.el('tb-challenge'),
    };

    // 背包槽
    els.invGrid.innerHTML = '';
    for (let i = 0; i < CONFIG.INV_MAX; i++) {
      const d = document.createElement('div');
      d.className = 'inv-slot';
      d.dataset.idx = i;
      d.addEventListener('click', () => { if (window.Game) Game.invClicked(i); });
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); if (window.Game) Game.invRightClicked(i); });
      els.invGrid.appendChild(d);
    }
    // 技能行
    els.skillList.innerHTML = '';
    CONFIG.SKILLS.forEach((sk, i) => {
      const row = document.createElement('div');
      row.className = 'skill-row';
      row.dataset.idx = i;
      row.innerHTML = `
        <span class="skill-key">${i + 1}</span>
        <span class="skill-name">${sk.glyph} ${sk.name}</span>
        <span class="skill-mp">${sk.mp} MP</span>`;
      row.title = sk.desc;
      row.addEventListener('click', () => { if (window.Game) Game.castSkill(i); });
      els.skillList.appendChild(row);
    });
    // 装备栏点击: 武器行 = 切换主副手, 其他 = 卸下
    document.querySelectorAll('.equip-row').forEach(row => {
      row.addEventListener('click', () => {
        if (!window.Game) return;
        const slot = row.dataset.slot;
        if (slot === 'weapon' || slot === 'weapon2') Game.swapWeapon();
        else Game.unequip(slot);
      });
    });
  }

  /** 全面板刷新 (每回合调用) */
  function update(game) {
    const p = game.player;
    if (!p) return;
    const L = game.level;

    els.floor.textContent = `第 ${game.floor} 层 · ${L.theme.name}${game.endless ? ' · 无尽' : ''}`;
    els.gold.textContent = `💰 ${Util.fmt(p.gold)}`;
    els.turn.textContent = `⏱ 回合 ${Util.fmt(game.turn)}`;
    els.seed.textContent = `🌱 ${game.seed}`;
    els.seed.title = '本局种子: ' + game.seed;

    // 名字 + 职业角标 (v2.3)
    const clsDef = p.cls && CONFIG.CLASSES ? CONFIG.CLASSES.find(c => c.id === p.cls) : null;
    els.name.textContent = clsDef ? `${clsDef.icon} ${clsDef.name}` : p.name;
    els.lv.textContent = 'Lv.' + p.level;
    els.hpBar.style.width = Util.clamp(p.hp / p.maxHp * 100, 0, 100) + '%';
    els.hpText.textContent = `${p.hp} / ${p.maxHp}`;
    els.mpBar.style.width = Util.clamp(p.mp / p.maxMp * 100, 0, 100) + '%';
    els.mpText.textContent = `${p.mp} / ${p.maxMp}`;
    const need = CONFIG.xpNeed(p.level);
    els.xpBar.style.width = Util.clamp(p.xp / need * 100, 0, 100) + '%';
    els.xpText.textContent = `${p.xp} / ${need}`;

    els.atk.textContent = p.atk;
    els.def.textContent = p.def;
    els.acc.textContent = p.acc;
    els.eva.textContent = p.eva;
    els.crit.textContent = p.crit;
    els.kills.textContent = p.kills;

    // 状态图标 + 祝福
    const icons = Status.icons(p);
    els.status.innerHTML = icons.map(s =>
      `<span class="st-icon" title="${s.name} (${s.turns} 回合)">${s.icon}${s.name}${s.turns > 1 ? ' ' + s.turns : ''}</span>`
    ).join('');

    if (els.boons) {
      const boons = p.boons || {};
      let chips = Object.keys(boons).map(id => {
        const d = Boons.def(id);
        if (!d) return '';
        return `<span class="boon-chip" title="${d.desc}">${d.icon}${d.name}${boons[id] > 1 ? '×' + boons[id] : ''}</span>`;
      });
      // 共鸣进度芯片 (v2.4): 激活的亮金, 未满的暗色显示进度
      const counts = Boons.tagCounts(p);
      const active = Boons.activeResonances(p);
      for (const tag of Object.keys(RESONANCES)) {
        const r = RESONANCES[tag];
        const n = counts[tag] || 0;
        if (active.includes(tag)) {
          chips.push(`<span class="boon-chip res-on" title="${r.desc}">${r.icon}${r.name}</span>`);
        } else if (n >= 1) {
          chips.push(`<span class="boon-chip res-dim" title="再集 ${3 - n} 种${RESONANCE_TAG_NAMES[tag]}系祝福即可共鸣: ${r.desc}">${RESONANCE_TAG_NAMES[tag]}系 ${n}/3</span>`);
        }
      }
      els.boons.innerHTML = chips.join('');
    }

    // 挑战因子 / 每日挑战
    if (els.chal) {
      const parts = [];
      if (game.challenge) parts.push(`${game.challenge.icon} ${game.challenge.name}`);
      if (game.ascension > 0) parts.push(`🩸 契约 ${game.ascension} 阶`);
      if (game.daily) parts.push('📅 每日挑战');
      if (parts.length) {
        els.chal.textContent = parts.join(' · ');
        els.chal.title = game.challenge ? game.challenge.desc : '每日挑战: 全世界同一天玩同一张地牢';
        els.chal.classList.remove('hidden');
      } else {
        els.chal.classList.add('hidden');
      }
    }

    // 装备
    for (const slot of ['weapon', 'weapon2', 'armor', 'trinket']) {
      const it = p.equip[slot];
      const e = els.eq[slot];
      if (!e) continue;
      if (slot === 'weapon2') {
        if (it) {
          e.g.textContent = ITEMS[it.id].glyph;
          e.n.textContent = Affixes.displayName(it);
          e.s.textContent = '副手 · 按 X 切换';
        } else {
          e.g.textContent = '—';
          e.n.textContent = '副手空闲';
          e.s.textContent = '第二把武器会自动放入副手';
        }
        continue;
      }
      if (it) {
        e.g.textContent = ITEMS[it.id].glyph;
        e.n.textContent = Affixes.displayName(it);
        const d = ITEMS[it.id];
        const subs = [];
        if (d.atk) subs.push('攻击+' + d.atk);
        if (d.def) subs.push('防御+' + d.def);
        if (d.eva) subs.push('闪避' + (d.eva > 0 ? '+' : '') + d.eva);
        if (d.acc) subs.push('命中+' + d.acc);
        if (d.crit) subs.push('暴击+' + d.crit);
        if (d.mp) subs.push('法力+' + d.mp);
        if (it.affixes && it.affixes.length) subs.push(it.affixes.map(a => AFFIXES[a].icon + AFFIXES[a].name).join(' '));
        e.s.textContent = subs.join(' · ') || d.desc;
      } else {
        e.g.textContent = slot === 'weapon' ? '✊' : (slot === 'armor' ? '🧥' : '—');
        e.n.textContent = slot === 'weapon' ? '空手' : (slot === 'armor' ? '无护甲' : '无饰品');
        e.s.textContent = slot === 'weapon' ? '基础攻击 ' + p.baseAtk : '点击背包装备';
      }
    }

    // 背包 (仅在变化时重建)
    const snap = p.inv.map(it => it ? it.uid + ':' + it.id + ':' + (it.count || 1) : '').join('|');
    if (snap !== lastInvSnapshot) {
      lastInvSnapshot = snap;
      const slots = els.invGrid.children;
      for (let i = 0; i < CONFIG.INV_MAX; i++) {
        const it = p.inv[i];
        const slot = slots[i];
        if (it) {
          const d = ITEMS[it.id];
          const isEq = d.kind === 'weapon' || d.kind === 'armor' || d.kind === 'trinket';
          slot.className = 'inv-slot filled';
          slot.innerHTML = `${d.glyph}${it.count > 1 ? `<span class="qty">${it.count}</span>` : ''}${isEq ? '' : ''}`;
          slot.dataset.name = d.name + (it.count > 1 ? ' ×' + it.count : '');
          slot.title = d.desc || '';
        } else {
          slot.className = 'inv-slot';
          slot.innerHTML = '';
          slot.dataset.name = '';
          slot.title = '';
        }
      }
      els.invCount.textContent = p.inv.filter(Boolean).length + '/' + CONFIG.INV_MAX;
    }

    // 技能 (等级变化时重建状态)
    if (lastSkillLevel !== p.level) {
      lastSkillLevel = p.level;
      CONFIG.SKILLS.forEach((sk, i) => {
        const row = els.skillList.children[i];
        if (!row) return;
        const locked = p.level < sk.lv;
        const noMp = p.mp < sk.mp;
        row.classList.toggle('locked', locked);
        row.classList.toggle('no-mp', !locked && noMp);
        row.querySelector('.skill-name').innerHTML = locked
          ? `🔒 ${sk.name} <span class="skill-desc">Lv.${sk.lv} 解锁</span>`
          : `${sk.glyph} ${sk.name}`;
      });
    } else {
      // 只更新蓝量状态
      CONFIG.SKILLS.forEach((sk, i) => {
        const row = els.skillList.children[i];
        if (!row) return;
        const locked = p.level < sk.lv;
        row.classList.toggle('no-mp', !locked && p.mp < sk.mp);
      });
    }
  }

  function log(text, cls) {
    if (!els.log) return;
    const li = document.createElement('li');
    li.className = 'log-' + (cls || 'sys');
    li.innerHTML = text;
    els.log.appendChild(li);
    logCount++;
    while (logCount > 120) {
      els.log.removeChild(els.log.firstChild);
      logCount--;
    }
    els.log.scrollTop = els.log.scrollHeight;
  }

  function toast(text, ms) {
    if (!els.toast) return;
    els.toast.innerHTML = text;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms || 2000);
  }

  function clearLog() {
    if (els.log) els.log.innerHTML = '';
    logCount = 0;
  }

  function refreshInv(game) { lastInvSnapshot = ''; update(game); }

  return { init, update, log, toast, clearLog, refreshInv };
})();
