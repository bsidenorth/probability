/**
 * ==========================================================================
 * PLANO HIT — STATE
 * Store central em memória. Nenhuma view lê localStorage diretamente:
 * tudo passa pelo State, que mantém um cache sincronizado com
 * Storage e notifica assinantes (padrão pub/sub simples) sempre que
 * algo relevante muda — data selecionada, tarefa marcada, settings etc.
 *
 * Convenção de "dia": cada dia é identificado por uma dateKey no
 * formato "YYYY-MM-DD" (fuso horário local do navegador).
 *
 * Definição de "dia consistente" (usada em streak/heatmap):
 * um dia conta para a sequência quando o score geral daquele dia é
 * 100% — ou seja, todas as tarefas de todos os pilares habilitados
 * foram concluídas.
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const Storage = global.PlanoHIT.Storage;
  const PILLAR_ORDER = CONFIG.PILLAR_ORDER;

  /* ------------------------------------------------------------------
     Estado interno (privado ao módulo)
     ------------------------------------------------------------------ */

  const state = {
    user: null,           // { id, name, email }
    settings: null,       // escopo de módulos/tarefas do usuário atual
    entries: {},          // cache em memória de todas as entradas (por dateKey)
    selectedDate: startOfDay(new Date()), // data em foco no Dashboard
    currentView: CONFIG.DEFAULT_VIEW,
  };

  const subscribers = [];

  function subscribe(callback) {
    subscribers.push(callback);
    return function unsubscribe() {
      const idx = subscribers.indexOf(callback);
      if (idx > -1) subscribers.splice(idx, 1);
    };
  }

  function notify(eventName, payload) {
    subscribers.forEach((cb) => {
      try {
        cb(eventName, payload, state);
      } catch (err) {
        console.error('[PlanoHIT.State] Erro em assinante:', err);
      }
    });
  }

  /* ------------------------------------------------------------------
     Utilitários de data
     ------------------------------------------------------------------ */

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function toDateKey(date) {
    const d = startOfDay(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDays(date, amount) {
    const d = startOfDay(date);
    d.setDate(d.getDate() + amount);
    return d;
  }

  function isSameDay(a, b) {
    return toDateKey(a) === toDateKey(b);
  }

  /* ------------------------------------------------------------------
     Inicialização por usuário (chamado após login/registro bem-sucedido)
     ------------------------------------------------------------------ */

  function init(user) {
    state.user = user;
    state.settings = Storage.getSettings(user.id) || JSON.parse(JSON.stringify(CONFIG.DEFAULT_MODULE_SCOPE));
    state.entries = Storage.getAllEntries(user.id) || {};
    state.selectedDate = startOfDay(new Date());
    state.currentView = CONFIG.DEFAULT_VIEW;
    notify('state:init', { user });
  }

  function reset() {
    state.user = null;
    state.settings = null;
    state.entries = {};
    state.selectedDate = startOfDay(new Date());
    state.currentView = CONFIG.DEFAULT_VIEW;
    notify('state:reset', {});
  }

  /* ------------------------------------------------------------------
     Navegação de view
     ------------------------------------------------------------------ */

  function setView(viewId) {
    state.currentView = viewId;
    notify('view:change', { view: viewId });
  }

  function getView() {
    return state.currentView;
  }

  /* ------------------------------------------------------------------
     Navegação temporal (Dashboard do Dia)
     ------------------------------------------------------------------ */

  function getSelectedDate() {
    return state.selectedDate;
  }

  function setSelectedDate(date) {
    state.selectedDate = startOfDay(date);
    notify('date:change', { date: state.selectedDate });
  }

  function goToPrevDay() {
    setSelectedDate(addDays(state.selectedDate, -1));
  }

  function goToNextDay() {
    // Não permite navegar para o futuro além de hoje
    const next = addDays(state.selectedDate, 1);
    if (next > startOfDay(new Date())) return;
    setSelectedDate(next);
  }

  function goToToday() {
    setSelectedDate(new Date());
  }

  function isSelectedDateToday() {
    return isSameDay(state.selectedDate, new Date());
  }

  /* ------------------------------------------------------------------
     Settings (escopo dos módulos)
     ------------------------------------------------------------------ */

  function getSettings() {
    return state.settings;
  }

  function saveSettings(newSettings) {
    state.settings = newSettings;
    if (state.user) Storage.saveSettings(state.user.id, newSettings);
    notify('settings:change', { settings: newSettings });
  }

  function setPillarEnabled(pillarId, enabled) {
    if (!state.settings[pillarId]) return;
    state.settings[pillarId].enabled = enabled;
    saveSettings(state.settings);
  }

  function addTaskToPillar(pillarId, label) {
    if (!state.settings[pillarId]) return null;
    const task = { id: `${pillarId}-${Date.now().toString(36)}`, label };
    state.settings[pillarId].tasks.push(task);
    saveSettings(state.settings);
    return task;
  }

  function updateTaskLabel(pillarId, taskId, label) {
    const pillar = state.settings[pillarId];
    if (!pillar) return;
    const task = pillar.tasks.find((t) => t.id === taskId);
    if (task) {
      task.label = label;
      saveSettings(state.settings);
    }
  }

  function removeTaskFromPillar(pillarId, taskId) {
    const pillar = state.settings[pillarId];
    if (!pillar) return;
    pillar.tasks = pillar.tasks.filter((t) => t.id !== taskId);
    saveSettings(state.settings);
  }

  /* ------------------------------------------------------------------
     Entradas diárias
     ------------------------------------------------------------------ */

  /**
   * Retorna a entrada de um dia já "hidratada" com todas as tarefas
   * atualmente configuradas (mesmo que a entrada salva seja antiga e
   * não conheça uma tarefa nova adicionada depois).
   */
  function getEntryForDate(date) {
    const dateKey = toDateKey(date);
    const saved = state.entries[dateKey];
    const hydrated = { date: dateKey, pillars: {} };

    PILLAR_ORDER.forEach((pillarId) => {
      const pillarConfig = state.settings[pillarId];
      hydrated.pillars[pillarId] = {};
      if (!pillarConfig) return;
      pillarConfig.tasks.forEach((task) => {
        const savedValue = saved && saved.pillars && saved.pillars[pillarId]
          ? saved.pillars[pillarId][task.id]
          : false;
        hydrated.pillars[pillarId][task.id] = Boolean(savedValue);
      });
    });

    return hydrated;
  }

  function toggleTask(pillarId, taskId) {
    if (!state.user) return;
    const dateKey = toDateKey(state.selectedDate);
    const entry = getEntryForDate(state.selectedDate);

    const current = Boolean(entry.pillars[pillarId][taskId]);
    entry.pillars[pillarId][taskId] = !current;
    entry.updatedAt = new Date().toISOString();

    state.entries[dateKey] = entry;
    Storage.saveEntry(state.user.id, dateKey, entry);

    notify('entry:change', { dateKey, entry });
  }

  /* ------------------------------------------------------------------
     Cálculo de score (dia único)
     ------------------------------------------------------------------ */

  function computeDayScore(entry) {
    const byPillar = {};
    let totalDone = 0;
    let totalTasks = 0;

    PILLAR_ORDER.forEach((pillarId) => {
      const pillarConfig = state.settings[pillarId];
      if (!pillarConfig || !pillarConfig.enabled) return;

      const taskIds = pillarConfig.tasks.map((t) => t.id);
      const doneCount = taskIds.filter((id) => entry.pillars[pillarId] && entry.pillars[pillarId][id]).length;
      const pct = taskIds.length > 0 ? Math.round((doneCount / taskIds.length) * 100) : 0;

      byPillar[pillarId] = { done: doneCount, total: taskIds.length, pct };
      totalDone += doneCount;
      totalTasks += taskIds.length;
    });

    const overall = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
    return { overall, byPillar };
  }

  function getSelectedDayScore() {
    const entry = getEntryForDate(state.selectedDate);
    return computeDayScore(entry);
  }

  /* ------------------------------------------------------------------
     Streaks (sequência atual e melhor sequência histórica)
     ------------------------------------------------------------------ */

  function isDayComplete(dateKey) {
    const saved = state.entries[dateKey];
    if (!saved) return false;
    const entry = getEntryForDate(new Date(dateKey + 'T00:00:00'));
    return computeDayScore(entry).overall === 100;
  }

  function computeStreaks() {
    // Sequência atual: conta pra trás a partir de hoje (ou ontem, se
    // hoje ainda não foi completado) enquanto os dias forem 100%.
    let current = 0;
    let cursor = startOfDay(new Date());

    // Se hoje ainda não está completo, começamos a contar a partir de ontem
    // (não queremos "quebrar" a sequência só porque o dia ainda não acabou).
    if (!isDayComplete(toDateKey(cursor))) {
      cursor = addDays(cursor, -1);
    }

    while (isDayComplete(toDateKey(cursor))) {
      current += 1;
      cursor = addDays(cursor, -1);
    }

    // Melhor sequência histórica: percorre todas as dateKeys conhecidas,
    // ordenadas, procurando a maior sequência de dias consecutivos completos.
    const knownDates = Object.keys(state.entries).sort();
    let best = 0;
    let running = 0;
    let prevDate = null;

    knownDates.forEach((dateKey) => {
      const complete = isDayComplete(dateKey);
      if (!complete) {
        running = 0;
        prevDate = dateKey;
        return;
      }
      if (prevDate && isSameDay(addDays(new Date(prevDate + 'T00:00:00'), 1), new Date(dateKey + 'T00:00:00'))) {
        running += 1;
      } else {
        running = 1;
      }
      best = Math.max(best, running);
      prevDate = dateKey;
    });

    best = Math.max(best, current);

    return { current, best };
  }

  /* ------------------------------------------------------------------
     Consistência média (últimos N dias) — usada no Histórico
     ------------------------------------------------------------------ */

  function computeConsistency(days) {
    const n = days || 90;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const date = addDays(new Date(), -i);
      const entry = getEntryForDate(date);
      sum += computeDayScore(entry).overall;
    }
    return Math.round(sum / n);
  }

  /* ------------------------------------------------------------------
     Dados para o Heatmap (grade de semanas x dias da semana)
     ------------------------------------------------------------------ */

  function levelForScore(score) {
    const match = CONFIG.HEATMAP_LEVELS
      .slice()
      .reverse()
      .find((l) => score >= l.min);
    return match ? match.level : 0;
  }

  /**
   * Retorna um array plano de células { date, dateKey, level, hasEntry }
   * cobrindo `weeks` semanas completas (domingo a sábado), terminando
   * na semana de hoje. O layout em grid (7 linhas x N colunas) é
   * responsabilidade do componente heatmap.js.
   */
  function getHeatmapData(weeks) {
    const totalWeeks = weeks || CONFIG.HEATMAP_WEEKS_VISIBLE;
    const today = startOfDay(new Date());

    // Recua até o domingo da semana atual, depois volta `totalWeeks` semanas
    const currentWeekday = today.getDay(); // 0 = domingo
    const endOfGrid = addDays(today, 6 - currentWeekday); // sábado desta semana
    const startOfGrid = addDays(endOfGrid, -(totalWeeks * 7 - 1));

    const cells = [];
    for (let i = 0; i < totalWeeks * 7; i++) {
      const date = addDays(startOfGrid, i);
      const dateKey = toDateKey(date);
      const isFuture = date > today;
      const hasEntry = Boolean(state.entries[dateKey]);
      const entry = getEntryForDate(date);
      const score = hasEntry ? computeDayScore(entry).overall : 0;

      cells.push({
        date,
        dateKey,
        level: isFuture ? -1 : levelForScore(score),
        score,
        isFuture,
        isToday: isSameDay(date, today),
      });
    }
    return cells;
  }

  /* ------------------------------------------------------------------
     Lista de registros recentes (para a view de Histórico)
     ------------------------------------------------------------------ */

  function getRecentEntries(limit) {
    const dateKeys = Object.keys(state.entries).sort().reverse().slice(0, limit || 14);
    return dateKeys.map((dateKey) => {
      const entry = getEntryForDate(new Date(dateKey + 'T00:00:00'));
      const score = computeDayScore(entry);
      return { dateKey, entry, score };
    });
  }

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */

  global.PlanoHIT.State = {
    subscribe,
    init,
    reset,
    // view
    setView,
    getView,
    // datas
    getSelectedDate,
    setSelectedDate,
    goToPrevDay,
    goToNextDay,
    goToToday,
    isSelectedDateToday,
    toDateKey,
    // settings
    getSettings,
    saveSettings,
    setPillarEnabled,
    addTaskToPillar,
    updateTaskLabel,
    removeTaskFromPillar,
    // entradas
    getEntryForDate,
    toggleTask,
    // scores/estatísticas
    computeDayScore,
    getSelectedDayScore,
    computeStreaks,
    computeConsistency,
    getHeatmapData,
    getRecentEntries,
    // usuário atual (somente leitura)
    getUser: () => state.user,
  };

})(window);
