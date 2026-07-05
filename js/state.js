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
    goal: null,           // Objetivo & Cronograma ativo (motor preditivo)
    selectedDate: startOfDay(new Date()), // data em foco no Painel Preditivo
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
    state.goal = Storage.getGoal(user.id) || null;
    state.selectedDate = startOfDay(new Date());
    state.currentView = CONFIG.DEFAULT_VIEW;
    notify('state:init', { user });
  }

  function reset() {
    state.user = null;
    state.settings = null;
    state.entries = {};
    state.goal = null;
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
     Objetivo & Cronograma
     ------------------------------------------------------------------ */

  function getGoal() {
    return state.goal;
  }

  /**
   * Cria ou atualiza o Objetivo ativo. Ao CRIAR (nenhum goal existente),
   * `startDate` é fixado em hoje — é o "dia zero" da simulação. Ao
   * EDITAR um goal existente, o startDate original é preservado (mudar
   * nome/descrição/prazo não reinicia a contagem já percorrida).
   */
  function saveGoal({ name, description, totalDays, moduleLengthDays }) {
    const isNew = !state.goal;
    const goal = {
      name: String(name || '').trim(),
      description: String(description || '').trim(),
      totalDays: Math.max(1, Math.round(Number(totalDays) || 1)),
      moduleLengthDays: Number(moduleLengthDays) || CONFIG.GOAL_DEFAULT_MODULE_LENGTH,
      startDate: isNew ? toDateKey(new Date()) : state.goal.startDate,
      createdAt: isNew ? new Date().toISOString() : state.goal.createdAt,
      updatedAt: new Date().toISOString(),
    };

    state.goal = goal;
    if (state.user) Storage.saveGoal(state.user.id, goal);
    notify('goal:change', { goal });
    return goal;
  }

  /* ------------------------------------------------------------------
     Definições Modulares — divisão do prazo total em blocos de
     `moduleLengthDays` (14 ou 30 dias).
     ------------------------------------------------------------------ */

  function getModules() {
    if (!state.goal) return [];
    const { totalDays, moduleLengthDays, startDate } = state.goal;
    const moduleCount = Math.ceil(totalDays / moduleLengthDays);
    const start = startOfDay(new Date(startDate + 'T00:00:00'));

    const modules = [];
    for (let i = 0; i < moduleCount; i++) {
      const startOffset = i * moduleLengthDays;
      const endOffset = Math.min(startOffset + moduleLengthDays - 1, totalDays - 1);
      modules.push({
        index: i + 1,
        startOffset,
        endOffset,
        startDate: addDays(start, startOffset),
        endDate: addDays(start, endOffset),
      });
    }
    return modules;
  }

  function diffDays(a, b) {
    return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  }

  /**
   * Média do score geral (0-100) de todos os dias entre `from` e `to`
   * (inclusive). Dias sem registro contam como 0 — não executar o
   * plano também é um dado real para o motor preditivo.
   */
  function averageScoreBetween(from, to) {
    const start = startOfDay(from);
    const end = startOfDay(to);
    const totalDaysInRange = Math.max(diffDays(start, end) + 1, 1);
    let sum = 0;
    for (let i = 0; i < totalDaysInRange; i++) {
      const day = addDays(start, i);
      if (day > end) break;
      sum += computeDayScore(getEntryForDate(day)).overall;
    }
    return sum / totalDaysInRange;
  }

  /**
   * Taxa de execução real por frente (pilar), média desde o início do
   * Objetivo até hoje. Frentes desabilitadas retornam `null` (não
   * contam para a Probabilidade de Sucesso).
   */
  function computePillarExecutionRates(from, to) {
    const start = startOfDay(from);
    const end = startOfDay(to);
    const totalDaysInRange = Math.max(diffDays(start, end) + 1, 1);

    const sums = {};
    const counts = {};
    PILLAR_ORDER.forEach((p) => { sums[p] = 0; counts[p] = 0; });

    for (let i = 0; i < totalDaysInRange; i++) {
      const day = addDays(start, i);
      if (day > end) break;
      const { byPillar } = computeDayScore(getEntryForDate(day));
      PILLAR_ORDER.forEach((p) => {
        if (byPillar[p]) {
          sums[p] += byPillar[p].pct;
          counts[p] += 1;
        }
      });
    }

    const rates = {};
    PILLAR_ORDER.forEach((p) => {
      rates[p] = counts[p] > 0 ? Math.round(sums[p] / counts[p]) : null;
    });
    return rates;
  }

  /**
   * ================================================================
   * MOTOR PREDITIVO — Probabilidade de Sucesso
   * ================================================================
   * Modelo:
   *   E  = dias decorridos desde o início (inclusive hoje)
   *   R  = taxa de execução real média (0–1) nesses E dias
   *   T  = tempo estimado total (dias)
   *
   *   progresso_efetivo   = E * R                     ("dias" de plano
   *                                                     de fato executados)
   *   trabalho_restante   = T − progresso_efetivo      (quanto ainda falta)
   *   dias_restantes      = T − E                      (quanto tempo resta
   *                                                     no prazo original)
   *
   *   ritmo_necessário    = trabalho_restante / dias_restantes
   *                         (taxa de execução exigida DAQUI PRA FRENTE
   *                          para ainda terminar no prazo original)
   *
   *   Probabilidade       = clamp( R / ritmo_necessário * 100, 0, 100 )
   *                         → se o ritmo necessário sobe (porque você
   *                           atrasou), e seu ritmo real não acompanha,
   *                           a probabilidade cai.
   *
   *   Conclusão estimada  = projeta, ao ritmo real atual, quantos dias
   *                         de calendário serão necessários para
   *                         acumular T dias efetivos — se R cai, essa
   *                         data se afasta dinamicamente.
   * ================================================================
   */
  function computeGoalStats() {
    if (!state.goal) {
      return { hasGoal: false };
    }

    const goal = state.goal;
    const today = startOfDay(new Date());
    const start = startOfDay(new Date(goal.startDate + 'T00:00:00'));

    const dayIndexToday = Math.max(diffDays(start, today), 0); // 0 = dia de início
    const daysElapsed = dayIndexToday + 1;                      // dias já "vividos" (inclusive hoje)
    const totalDays = goal.totalDays;
    const remainingDaysOriginal = Math.max(totalDays - daysElapsed, 0);

    const executionRatePct = averageScoreBetween(start, today);      // 0-100
    const executionRate = executionRatePct / 100;                    // 0-1
    const pillarRates = computePillarExecutionRates(start, today);

    const effectiveProgressDays = daysElapsed * executionRate;
    const isCompleted = effectiveProgressDays >= totalDays;

    let probability;
    let requiredRatePct = null;

    if (isCompleted) {
      probability = 100;
    } else if (remainingDaysOriginal <= 0) {
      // Prazo original estourou e a meta ainda não foi concluída.
      probability = 0;
      requiredRatePct = null;
    } else {
      const remainingEffectiveWork = totalDays - effectiveProgressDays;
      const requiredRate = remainingEffectiveWork / remainingDaysOriginal; // pode ser > 1 (inviável)
      requiredRatePct = Math.round(requiredRate * 100);
      probability = requiredRate <= 0
        ? 100
        : Math.max(0, Math.min(100, Math.round((executionRate / requiredRate) * 100)));
    }

    // Data de conclusão projetada, ao ritmo real atual (dinâmica: piora
    // se a taxa de execução cair, melhora se ela subir).
    let projectedCompletionDate = null;
    let projectedTotalCalendarDays = null;
    if (!isCompleted && executionRate > 0.001) {
      const remainingEffectiveWork = totalDays - effectiveProgressDays;
      const projectedRemainingCalendarDays = remainingEffectiveWork / executionRate;
      projectedTotalCalendarDays = daysElapsed + projectedRemainingCalendarDays;
      projectedCompletionDate = addDays(start, Math.ceil(projectedTotalCalendarDays) - 1);
    }

    // Se já concluído, reconstrói em que dia real o progresso efetivo
    // acumulado bateu o total — para exibir a data de conclusão real.
    let actualCompletionDate = null;
    if (isCompleted) {
      let cumulative = 0;
      for (let i = 0; i < daysElapsed; i++) {
        const day = addDays(start, i);
        cumulative += computeDayScore(getEntryForDate(day)).overall / 100;
        if (cumulative >= totalDays) {
          actualCompletionDate = day;
          break;
        }
      }
      if (!actualCompletionDate) actualCompletionDate = today;
    }

    let status;
    if (isCompleted) {
      status = 'completed';
    } else if (probability >= CONFIG.GOAL_STATUS_THRESHOLDS.ON_TRACK_MIN) {
      status = 'on-track';
    } else if (probability >= CONFIG.GOAL_STATUS_THRESHOLDS.AT_RISK_MIN) {
      status = 'at-risk';
    } else {
      status = 'behind';
    }

    // Definições Modulares — módulo atual e linha do tempo completa
    const modules = getModules().map((m) => {
      let moduleStatus = 'upcoming';
      if (dayIndexToday > m.endOffset) moduleStatus = 'completed';
      else if (dayIndexToday >= m.startOffset && dayIndexToday <= m.endOffset) moduleStatus = 'current';
      return Object.assign({}, m, { status: moduleStatus });
    });

    const currentModule = modules.find((m) => m.status === 'current')
      || modules[modules.length - 1]
      || null;

    let currentModuleProgressPct = 0;
    if (currentModule) {
      const moduleEnd = today < currentModule.endDate ? today : currentModule.endDate;
      currentModuleProgressPct = Math.round(averageScoreBetween(currentModule.startDate, moduleEnd));
    }

    return {
      hasGoal: true,
      goal,
      today,
      daysElapsed,
      totalDays,
      remainingDaysOriginal,
      executionRatePct: Math.round(executionRatePct),
      pillarRates,
      effectiveProgressDays,
      isCompleted,
      probability,
      requiredRatePct,
      projectedCompletionDate,
      actualCompletionDate,
      status,
      modules,
      currentModule,
      currentModuleProgressPct,
    };
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
    // objetivo & motor preditivo
    getGoal,
    saveGoal,
    getModules,
    computeGoalStats,
    // usuário atual (somente leitura)
    getUser: () => state.user,
  };

})(window);
