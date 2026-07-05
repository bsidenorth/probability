/**
 * ==========================================================================
 * PLANO HIT — VIEW: PAINEL PREDITIVO (ex-"Dashboard do Dia")
 * Renderiza o Objetivo ativo, a Probabilidade de Sucesso (gráfico
 * preditivo principal), a Definição Modular atual (com linha do tempo)
 * e o Plano de Treinamento do módulo em curso. Também mantém
 * atualizado o "chrome" persistente (chips de pilar na Sidebar e o
 * badge de sequência no header), que sempre reflete o dia de HOJE
 * independentemente da data navegada no Painel.
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

      // Navegação temporal
      datePrev: document.querySelector('[data-role="date-prev"]'),
      dateNext: document.querySelector('[data-role="date-next"]'),
      dateToday: document.querySelector('[data-role="date-today"]'),
      dateLabel: document.querySelector('[data-role="date-label"]'),
      dateFull: document.querySelector('[data-role="date-full"]'),

      // Estado vazio (sem Objetivo)
      goalSetupEmpty: document.querySelector('[data-role="goal-setup-empty"]'),

      // Cabeçalho do Objetivo
      goalHeader: document.querySelector('[data-role="goal-header"]'),
      goalTitle: document.querySelector('[data-role="goal-title"]'),
      goalDescription: document.querySelector('[data-role="goal-description"]'),
      goalStatusBadge: document.querySelector('[data-role="goal-status-badge"]'),
      goalDaysRemaining: document.querySelector('[data-role="goal-days-remaining"]'),
      goalTotalDays: document.querySelector('[data-role="goal-total-days"]'),
      goalEstimatedDate: document.querySelector('[data-role="goal-estimated-date"]'),
      goalDateDelta: document.querySelector('[data-role="goal-date-delta"]'),
      goalExecutionRate: document.querySelector('[data-role="goal-execution-rate"]'),

      // Probabilidade de Sucesso
      probabilityCard: document.querySelector('[data-role="probability-card"]'),
      probabilityValue: document.querySelector('[data-role="probability-value"]'),
      probabilityProgress: document.querySelector('[data-role="probability-progress"]'),
      probabilityBreakdown: document.querySelector('[data-role="probability-breakdown"]'),

      // Definição Modular atual
      moduleCurrent: document.querySelector('[data-role="module-current"]'),
      moduleCurrentLabel: document.querySelector('[data-role="module-current-label"]'),
      moduleProgressFill: document.querySelector('[data-role="module-progress-fill"]'),
      moduleProgressPct: document.querySelector('[data-role="module-progress-pct"]'),
      moduleTimeline: document.querySelector('[data-role="module-timeline"]'),
      tplModuleChip: document.getElementById('tpl-module-chip'),

      // Plano de Treinamento
      trainingPlanTitle: document.querySelector('[data-role="training-plan-title"]'),
      pillarsGrid: document.querySelector('[data-role="pillars-grid"]'),
      emptyState: document.querySelector('[data-role="dashboard-empty"]'),
      tplPillarCard: document.getElementById('tpl-pillar-card'),
      tplPillarTask: document.getElementById('tpl-pillar-task'),

      // Chrome persistente
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
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const moduleRangeFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

  function daysBetween(a, b) {
    const da = new Date(a); da.setHours(0, 0, 0, 0);
    const db = new Date(b); db.setHours(0, 0, 0, 0);
    return Math.round((db - da) / 86400000);
  }

  function getDateLabel(date) {
    const diff = daysBetween(date, new Date());
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff === -1) return 'Amanhã';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
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

  /* ------------------------------------------------------------------
     Renderização — cabeçalho do Objetivo
     ------------------------------------------------------------------ */

  function renderGoalHeader(stats) {
    el.goalTitle.textContent = stats.goal.name || 'Objetivo sem nome';

    if (stats.goal.description) {
      el.goalDescription.textContent = stats.goal.description;
      el.goalDescription.hidden = false;
    } else {
      el.goalDescription.hidden = true;
    }

    el.goalStatusBadge.setAttribute('data-status', stats.status);
    el.goalStatusBadge.textContent = CONFIG.GOAL_STATUS_LABELS[stats.status];

    el.goalDaysRemaining.textContent = String(stats.remainingDaysOriginal);
    el.goalTotalDays.textContent = String(stats.totalDays);
    el.goalExecutionRate.textContent = `${stats.executionRatePct}%`;

    const originalDeadline = new Date(stats.currentModule ? stats.modules[stats.modules.length - 1].endDate : stats.today);

    if (stats.isCompleted) {
      el.goalEstimatedDate.textContent = shortDateFormatter.format(stats.actualCompletionDate);
      el.goalDateDelta.textContent = 'meta concluída';
    } else if (stats.projectedCompletionDate) {
      el.goalEstimatedDate.textContent = shortDateFormatter.format(stats.projectedCompletionDate);
      const delta = daysBetween(originalDeadline, stats.projectedCompletionDate);
      if (delta <= 0) {
        el.goalDateDelta.textContent = 'dentro do prazo';
      } else {
        el.goalDateDelta.textContent = `+${delta} dia${delta > 1 ? 's' : ''} de atraso projetado`;
      }
    } else {
      el.goalEstimatedDate.textContent = '—';
      el.goalDateDelta.textContent = 'sem execução suficiente para projetar';
    }
  }

  /* ------------------------------------------------------------------
     Renderização — Probabilidade de Sucesso (gráfico preditivo)
     ------------------------------------------------------------------ */

  function renderProbability(stats) {
    el.probabilityValue.textContent = `${stats.probability}%`;

    const offset = RING_CIRCUMFERENCE - (stats.probability / 100) * RING_CIRCUMFERENCE;
    el.probabilityProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);
    el.probabilityProgress.style.strokeDashoffset = String(offset);

    const colorByStatus = {
      completed: 'var(--color-success)',
      'on-track': 'var(--color-success)',
      'at-risk': 'var(--color-warning)',
      behind: 'var(--color-danger)',
    };
    el.probabilityProgress.style.stroke = colorByStatus[stats.status] || 'var(--color-tecnico)';

    el.probabilityBreakdown.innerHTML = '';
    PILLAR_ORDER.forEach((pillarId) => {
      const pct = stats.pillarRates[pillarId];
      if (pct === null || pct === undefined) return; // frente desabilitada

      const row = document.createElement('div');
      row.className = `breakdown-row breakdown-row--${pillarId}`;
      row.innerHTML = `
        <span class="breakdown-row__label">${PILLAR_META[pillarId].label}</span>
        <span class="breakdown-row__track">
          <span class="breakdown-row__fill" style="width:${pct}%"></span>
        </span>
        <span class="breakdown-row__pct">${pct}%</span>
      `;
      el.probabilityBreakdown.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------
     Renderização — Definição Modular atual + linha do tempo
     ------------------------------------------------------------------ */

  function renderModule(stats) {
    if (!stats.currentModule) return;

    el.moduleCurrentLabel.textContent =
      `Módulo ${stats.currentModule.index} de ${stats.modules.length} · Dias ${stats.currentModule.startOffset + 1}–${stats.currentModule.endOffset + 1}`;

    el.moduleProgressFill.style.width = `${stats.currentModuleProgressPct}%`;
    el.moduleProgressPct.textContent = `${stats.currentModuleProgressPct}%`;

    el.moduleTimeline.innerHTML = '';
    stats.modules.forEach((mod) => {
      const fragment = el.tplModuleChip.content.cloneNode(true);
      const chip = fragment.querySelector('.module-chip');
      chip.setAttribute('data-status', mod.status);
      chip.querySelector('.module-chip__index').textContent = `M${mod.index}`;
      chip.querySelector('.module-chip__range').textContent =
        `${moduleRangeFormatter.format(mod.startDate)}–${moduleRangeFormatter.format(mod.endDate)}`;
      chip.setAttribute(
        'aria-label',
        `Módulo ${mod.index}, dias ${mod.startOffset + 1} a ${mod.endOffset + 1}, status ${CONFIG.GOAL_STATUS_LABELS[mod.status] || mod.status}`
      );
      el.moduleTimeline.appendChild(fragment);
    });
  }

  /* ------------------------------------------------------------------
     Renderização — grid do Plano de Treinamento (checklist do dia)
     ------------------------------------------------------------------ */

  function renderTrainingPlanGrid() {
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

      card.querySelector('.pillar-card__icon use').setAttribute('href', meta.icon);
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
        checkBtn.setAttribute('aria-label', `Marcar "${task.label}" como ${isDone ? 'não concluído' : 'concluído'}`);
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
     Sempre reflete o dia de HOJE, independentemente da data navegada.
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

    const stats = State.computeGoalStats();

    if (!stats.hasGoal) {
      el.goalSetupEmpty.hidden = false;
      el.goalHeader.hidden = true;
      el.probabilityCard.hidden = true;
      el.moduleCurrent.hidden = true;
      el.trainingPlanTitle.hidden = true;
      el.pillarsGrid.hidden = true;
      el.emptyState.hidden = true;
      renderChrome();
      return;
    }

    el.goalSetupEmpty.hidden = true;
    el.goalHeader.hidden = false;
    el.probabilityCard.hidden = false;
    el.moduleCurrent.hidden = false;
    el.trainingPlanTitle.hidden = false;

    renderGoalHeader(stats);
    renderProbability(stats);
    renderModule(stats);
    renderTrainingPlanGrid();
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

  function isDashboardVisible() {
    return el.section && !el.section.hidden;
  }

  function bindStateEvents() {
    State.subscribe((eventName) => {
      switch (eventName) {
        case 'date:change':
          if (isDashboardVisible()) {
            renderDateNav();
            const stats = State.computeGoalStats();
            if (stats.hasGoal) renderTrainingPlanGrid();
          }
          break;
        case 'entry:change':
          renderChrome();
          if (isDashboardVisible()) render();
          break;
        case 'settings:change':
        case 'goal:change':
          if (isDashboardVisible()) render();
          else renderChrome();
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
