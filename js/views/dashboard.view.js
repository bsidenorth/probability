/**
 * ==========================================================================
 * PLANO HIT — VIEW: DASHBOARD DO DIA
 * Renderiza a navegação temporal, o anel de score geral, o breakdown
 * por pilar e o grid de cards de pilares com suas tarefas do dia
 * selecionado. Também mantém atualizados dois elementos "de chrome"
 * que vivem fora desta view (chips de pilar na Sidebar e o badge de
 * streak no header), já que ambos refletem o progresso de HOJE
 * independentemente de qual data está sendo navegada no Dashboard.
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const State = global.PlanoHIT.State;
  const PILLAR_ORDER = CONFIG.PILLAR_ORDER;
  const PILLAR_META = CONFIG.PILLAR_META;

  const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // deve bater com o raio no SVG (r=52)

  let el = {};

  function cacheDom() {
    el = {
      section: document.getElementById('view-dashboard'),
      datePrev: document.querySelector('[data-role="date-prev"]'),
      dateNext: document.querySelector('[data-role="date-next"]'),
      dateToday: document.querySelector('[data-role="date-today"]'),
      dateLabel: document.querySelector('[data-role="date-label"]'),
      dateFull: document.querySelector('[data-role="date-full"]'),
      scoreValue: document.querySelector('[data-role="day-score-value"]'),
      scoreProgress: document.querySelector('[data-role="day-score-progress"]'),
      scoreBreakdown: document.querySelector('[data-role="day-score-breakdown"]'),
      pillarsGrid: document.querySelector('[data-role="pillars-grid"]'),
      emptyState: document.querySelector('[data-role="dashboard-empty"]'),
      tplPillarCard: document.getElementById('tpl-pillar-card'),
      tplPillarTask: document.getElementById('tpl-pillar-task'),
      streakCount: document.querySelector('[data-role="streak-count"]'),
      pillarChipValues: {
        individual: document.querySelector('[data-pillar-value="individual"]'),
        tecnico: document.querySelector('[data-pillar-value="tecnico"]'),
        humano: document.querySelector('[data-pillar-value="humano"]'),
      },
    };
  }

  /* ------------------------------------------------------------------
     Formatação de data (pt-BR)
     ------------------------------------------------------------------ */

  const fullDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  function daysBetween(a, b) {
    const msPerDay = 86400000;
    const da = new Date(a); da.setHours(0, 0, 0, 0);
    const db = new Date(b); db.setHours(0, 0, 0, 0);
    return Math.round((db - da) / msPerDay);
  }

  function getDateLabel(date) {
    const today = new Date();
    const diff = daysBetween(date, today);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff === -1) return 'Amanhã';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
  }

  /* ------------------------------------------------------------------
     Renderização — navegação temporal
     ------------------------------------------------------------------ */

  function renderDateNav() {
    const selected = State.getSelectedDate();
    el.dateLabel.textContent = getDateLabel(selected);
    el.dateFull.textContent = capitalize(fullDateFormatter.format(selected));

    const isToday = State.isSelectedDateToday();
    el.dateToday.hidden = isToday;
    el.dateNext.disabled = isToday;
    el.dateNext.setAttribute('aria-disabled', String(isToday));
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /* ------------------------------------------------------------------
     Renderização — anel de score + breakdown por pilar
     ------------------------------------------------------------------ */

  function renderScore() {
    const { overall, byPillar } = State.getSelectedDayScore();

    el.scoreValue.textContent = `${overall}%`;

    const offset = RING_CIRCUMFERENCE - (overall / 100) * RING_CIRCUMFERENCE;
    el.scoreProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    el.scoreProgress.style.strokeDashoffset = String(offset);
    el.scoreProgress.style.stroke = overall === 100
      ? 'var(--color-success)'
      : 'var(--color-tecnico)';

    el.scoreBreakdown.innerHTML = '';
    PILLAR_ORDER.forEach((pillarId) => {
      const pillarData = byPillar[pillarId];
      if (!pillarData) return; // pilar desabilitado ou sem tarefas — fora da média

      const row = document.createElement('div');
      row.className = `breakdown-row breakdown-row--${pillarId}`;
      row.innerHTML = `
        <span class="breakdown-row__label">${PILLAR_META[pillarId].label}</span>
        <span class="breakdown-row__track">
          <span class="breakdown-row__fill" style="width:${pillarData.pct}%"></span>
        </span>
        <span class="breakdown-row__pct">${pillarData.pct}%</span>
      `;
      el.scoreBreakdown.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------
     Renderização — grid de cards de pilar
     ------------------------------------------------------------------ */

  function renderPillarsGrid() {
    const settings = State.getSettings();
    const selectedDate = State.getSelectedDate();
    const entry = State.getEntryForDate(selectedDate);

    el.pillarsGrid.innerHTML = '';

    const visiblePillars = PILLAR_ORDER.filter((pillarId) => {
      const cfg = settings[pillarId];
      return cfg && cfg.enabled && cfg.tasks.length > 0;
    });

    el.emptyState.hidden = visiblePillars.length > 0;
    el.pillarsGrid.hidden = visiblePillars.length === 0;

    visiblePillars.forEach((pillarId) => {
      const cfg = settings[pillarId];
      const meta = PILLAR_META[pillarId];
      const doneMap = entry.pillars[pillarId] || {};
      const doneCount = cfg.tasks.filter((t) => doneMap[t.id]).length;

      const cardFragment = el.tplPillarCard.content.cloneNode(true);
      const card = cardFragment.querySelector('.pillar-card');
      card.classList.add(`pillar-card--${pillarId}`);

      const icon = card.querySelector('.pillar-card__icon use');
      icon.setAttribute('href', meta.icon);

      card.querySelector('.pillar-card__title').textContent = meta.label;
      card.querySelector('.pillar-card__progress').textContent = `${doneCount}/${cfg.tasks.length}`;

      const list = card.querySelector('.pillar-card__list');
      cfg.tasks.forEach((task) => {
        const taskFragment = el.tplPillarTask.content.cloneNode(true);
        const item = taskFragment.querySelector('.task-item');
        const isDone = !!doneMap[task.id];

        item.classList.toggle('is-done', isDone);
        item.querySelector('.task-item__label').textContent = task.label;

        const checkBtn = item.querySelector('.task-item__check');
        checkBtn.setAttribute('aria-pressed', String(isDone));
        checkBtn.setAttribute('aria-label', `Marcar "${task.label}" como ${isDone ? 'não concluída' : 'concluída'}`);
        checkBtn.addEventListener('click', () => {
          State.toggleTask(pillarId, task.id);
        });

        list.appendChild(taskFragment);
      });

      el.pillarsGrid.appendChild(cardFragment);
    });
  }

  /* ------------------------------------------------------------------
     Renderização — "chrome" persistente (chips de pilar + streak)
     Sempre reflete o dia de HOJE, independentemente da data navegada
     no Dashboard, pois vive na Sidebar/Header globais.
     ------------------------------------------------------------------ */

  function renderChrome() {
    const todayEntry = State.getEntryForDate(new Date());
    const { byPillar } = State.computeDayScore(todayEntry);

    PILLAR_ORDER.forEach((pillarId) => {
      const chipEl = el.pillarChipValues[pillarId];
      if (!chipEl) return;
      const pillarData = byPillar[pillarId];
      chipEl.textContent = pillarData ? `${pillarData.pct}%` : '—';
    });

    if (el.streakCount) {
      const { current } = State.computeStreaks();
      el.streakCount.textContent = String(current);
    }
  }

  /* ------------------------------------------------------------------
     Renderização completa da view
     ------------------------------------------------------------------ */

  function render() {
    renderDateNav();
    renderScore();
    renderPillarsGrid();
    renderChrome();
  }

  /* ------------------------------------------------------------------
     Eventos
     ------------------------------------------------------------------ */

  function bindDateNav() {
    el.datePrev.addEventListener('click', () => State.goToPrevDay());
    el.dateNext.addEventListener('click', () => State.goToNextDay());
    el.dateToday.addEventListener('click', () => State.goToToday());
  }

  function bindStateEvents() {
    State.subscribe((eventName) => {
      switch (eventName) {
        case 'date:change':
          renderDateNav();
          renderScore();
          renderPillarsGrid();
          break;
        case 'entry:change':
          renderScore();
          renderPillarsGrid();
          renderChrome();
          break;
        case 'settings:change':
          renderScore();
          renderPillarsGrid();
          renderChrome();
          break;
        case 'state:init':
          renderChrome();
          break;
        default:
          break;
      }
    });
  }

  function bindViewEnter() {
    global.addEventListener('planohit:view:enter', (e) => {
      if (e.detail.view === CONFIG.VIEWS.DASHBOARD) {
        render();
      }
    });
  }

  /* ------------------------------------------------------------------
     Inicialização pública
     ------------------------------------------------------------------ */

  function init() {
    cacheDom();
    bindDateNav();
    bindStateEvents();
    bindViewEnter();
  }

  global.PlanoHIT.Views = global.PlanoHIT.Views || {};
  global.PlanoHIT.Views.DashboardView = { init, render, renderChrome };

})(window);
