/**
 * ==========================================================================
 * PLANO HIT — VIEW: HISTÓRICO GLOBAL
 * Renderiza os cartões de estatística (streak atual, recorde,
 * consistência em 90 dias), o mapa de calor de consistência (heatmap)
 * e a lista de registros recentes. Um dia só é considerado "completo"
 * (nível máximo do heatmap / streak) quando o score geral é 100% —
 * regra centralizada em state.js.
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const State = global.PlanoHIT.State;
  const PILLAR_ORDER = CONFIG.PILLAR_ORDER;
  const PILLAR_META = CONFIG.PILLAR_META;

  let el = {};

  function cacheDom() {
    el = {
      section: document.getElementById('view-history'),
      statCurrentStreak: document.querySelector('[data-role="stat-current-streak"]'),
      statBestStreak: document.querySelector('[data-role="stat-best-streak"]'),
      statConsistency: document.querySelector('[data-role="stat-consistency"]'),
      heatmapGrid: document.querySelector('[data-role="heatmap-grid"]'),
      tplHeatmapCell: document.getElementById('tpl-heatmap-cell'),
      historyList: document.querySelector('[data-role="history-list"]'),
      historyEmpty: document.querySelector('[data-role="history-empty"]'),
      tplHistoryItem: document.getElementById('tpl-history-item'),
    };
  }

  /* ------------------------------------------------------------------
     Formatação de data (pt-BR)
     ------------------------------------------------------------------ */

  const weekdayShortFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
  const dayMonthFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
  const cellTitleFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  /* ------------------------------------------------------------------
     Renderização — cartões de estatística
     ------------------------------------------------------------------ */

  function renderStats() {
    const { current, best } = State.computeStreaks();
    const consistency = State.computeConsistency(90);

    el.statCurrentStreak.textContent = String(current);
    el.statBestStreak.textContent = String(best);
    el.statConsistency.textContent = `${consistency}%`;
  }

  /* ------------------------------------------------------------------
     Renderização — heatmap de consistência
     ------------------------------------------------------------------ */

  function renderHeatmap() {
    const cells = State.getHeatmapData(CONFIG.HEATMAP_WEEKS_VISIBLE);

    el.heatmapGrid.innerHTML = '';

    cells.forEach((cellData) => {
      const fragment = el.tplHeatmapCell.content.cloneNode(true);
      const cellEl = fragment.querySelector('.heatmap__cell');

      if (cellData.isFuture) {
        // Dias futuros existem apenas para completar o alinhamento do
        // grid (7 linhas fixas) — ficam invisíveis e não-interativos.
        cellEl.style.visibility = 'hidden';
        cellEl.tabIndex = -1;
      } else {
        cellEl.setAttribute('data-level', String(cellData.level));
        const label = `${cellTitleFormatter.format(cellData.date)} — ${cellData.score}% concluído`;
        cellEl.setAttribute('title', label);
        cellEl.setAttribute('aria-label', label);
        if (cellData.isToday) {
          cellEl.style.outline = '1.5px solid var(--color-tecnico)';
          cellEl.style.outlineOffset = '1px';
        }
      }

      el.heatmapGrid.appendChild(fragment);
    });
  }

  /* ------------------------------------------------------------------
     Renderização — lista de registros recentes
     ------------------------------------------------------------------ */

  function renderHistoryList() {
    const recent = State.getRecentEntries(21);

    el.historyList.innerHTML = '';
    el.historyEmpty.hidden = recent.length > 0;

    recent.forEach(({ dateKey, score }) => {
      const date = new Date(dateKey + 'T00:00:00');
      const fragment = el.tplHistoryItem.content.cloneNode(true);
      const item = fragment.querySelector('.history-list__item');

      const dateBlock = item.querySelector('.history-list__date');
      dateBlock.querySelector('strong').textContent = capitalize(dayMonthFormatter.format(date));
      dateBlock.querySelector('span').textContent = capitalize(weekdayShortFormatter.format(date)).replace('.', '');

      PILLAR_ORDER.forEach((pillarId) => {
        const dot = item.querySelector(`.mini-dot--${pillarId}`);
        if (!dot) return;
        const pillarData = score.byPillar[pillarId];
        dot.style.opacity = pillarData && pillarData.pct === 100 ? '1' : '0.25';
        dot.setAttribute('title', `${PILLAR_META[pillarId].label}: ${pillarData ? pillarData.pct : 0}%`);
      });

      item.querySelector('.history-list__score').textContent = `${score.overall}%`;

      el.historyList.appendChild(fragment);
    });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /* ------------------------------------------------------------------
     Renderização completa da view
     ------------------------------------------------------------------ */

  function render() {
    renderStats();
    renderHeatmap();
    renderHistoryList();
  }

  /* ------------------------------------------------------------------
     Eventos
     ------------------------------------------------------------------ */

  function bindStateEvents() {
    State.subscribe((eventName) => {
      // Qualquer mudança de tarefa ou de escopo de módulos pode alterar
      // streaks, consistência e o heatmap — mais barato re-renderizar
      // tudo do que rastrear dependências finas aqui.
      if (eventName === 'entry:change' || eventName === 'settings:change') {
        // Só recalcula de fato se a view de Histórico estiver visível;
        // caso contrário, o evento 'planohit:view:enter' cuida disso
        // quando o usuário navegar até aqui.
        if (el.section && !el.section.hidden) {
          render();
        }
      }
    });
  }

  function bindViewEnter() {
    global.addEventListener('planohit:view:enter', (e) => {
      if (e.detail.view === CONFIG.VIEWS.HISTORY) {
        render();
      }
    });
  }

  /* ------------------------------------------------------------------
     Inicialização pública
     ------------------------------------------------------------------ */

  function init() {
    cacheDom();
    bindStateEvents();
    bindViewEnter();
  }

  global.PlanoHIT.Views = global.PlanoHIT.Views || {};
  global.PlanoHIT.Views.HistoryView = { init, render };

})(window);
