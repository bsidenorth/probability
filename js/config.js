/**
 * ==========================================================================
 * PLANO HIT — CONFIG
 * Constantes globais, chaves de armazenamento e valores padrão do sistema.
 * Nenhum outro módulo deve declarar "magic strings/numbers" — tudo que é
 * configurável vive aqui.
 * ==========================================================================
 */

(function (global) {
  'use strict';

  /**
   * Namespace global da aplicação. Todos os módulos (storage, auth, state,
   * router, views, components) se registram dentro de window.PlanoHIT
   * para evitar poluição do escopo global e deixar as dependências
   * explícitas (PlanoHIT.Storage, PlanoHIT.Auth, etc.).
   */
  const PlanoHIT = global.PlanoHIT || {};

  /* ------------------------------------------------------------------
     Chaves de armazenamento (sessionStorage / localStorage)
     ------------------------------------------------------------------ */
  const STORAGE_KEYS = Object.freeze({
    // sessionStorage — ciclo de vida da sessão autenticada
    SESSION_TOKEN: 'planohit.session.token',
    SESSION_USER: 'planohit.session.user',

    // localStorage — "banco de dados" simulado, persiste entre sessões
    DB_USERS: 'planohit.db.users',
    DB_ENTRIES_PREFIX: 'planohit.db.entries.', // + userId
    DB_SETTINGS_PREFIX: 'planohit.db.settings.', // + userId
    DB_GOALS_PREFIX: 'planohit.db.goals.', // + userId -> array de Objetivos
    DB_ACTIVE_GOAL_PREFIX: 'planohit.db.activegoal.', // + userId -> string (goalId)
  });

  /* ------------------------------------------------------------------
     Autenticação / JWT simulado
     ------------------------------------------------------------------ */
  const AUTH_CONFIG = Object.freeze({
    TOKEN_TTL_MS: 1000 * 60 * 60 * 8, // 8 horas de validade simulada
    TOKEN_ISSUER: 'planohit.local',
    MIN_PASSWORD_LENGTH: 6,
  });

  /* ------------------------------------------------------------------
     Perfil do usuário
     ------------------------------------------------------------------ */
  const PROFILE_CONFIG = Object.freeze({
    NAME_CHANGE_COOLDOWN_DAYS: 30,
  });

  /* ------------------------------------------------------------------
     Identificadores e metadados dos pilares
     ------------------------------------------------------------------ */
  const PILLARS = Object.freeze({
    INDIVIDUAL: 'individual',
    TECNICO: 'tecnico',
    HUMANO: 'humano',
  });

  const PILLAR_META = Object.freeze({
    [PILLARS.INDIVIDUAL]: Object.freeze({
      id: PILLARS.INDIVIDUAL,
      label: 'Individual',
      icon: '#icon-individual',
      description: 'Corpo, disciplina e hábitos pessoais.',
    }),
    [PILLARS.TECNICO]: Object.freeze({
      id: PILLARS.TECNICO,
      label: 'Técnico',
      icon: '#icon-tecnico',
      description: 'Estudo, prática deliberada e execução.',
    }),
    [PILLARS.HUMANO]: Object.freeze({
      id: PILLARS.HUMANO,
      label: 'Humano',
      icon: '#icon-humano',
      description: 'Relações, mentalidade e recuperação.',
    }),
  });

  const PILLAR_ORDER = Object.freeze([
    PILLARS.INDIVIDUAL,
    PILLARS.TECNICO,
    PILLARS.HUMANO,
  ]);

  /* ------------------------------------------------------------------
     Escopo padrão dos módulos — usado apenas na primeira inicialização
     de um novo usuário (seed). Depois disso, tudo é editável em
     Configurações e persistido em DB_SETTINGS_PREFIX + userId.
     ------------------------------------------------------------------ */
  const DEFAULT_MODULE_SCOPE = Object.freeze({
    [PILLARS.INDIVIDUAL]: {
      enabled: true,
      tasks: [
        { id: 'ind-1', label: 'Treino físico (mín. 30min)' },
        { id: 'ind-2', label: 'Alimentação alinhada ao plano' },
        { id: 'ind-3', label: '7h+ de sono' },
      ],
    },
    [PILLARS.TECNICO]: {
      enabled: true,
      tasks: [
        { id: 'tec-1', label: 'Bloco de estudo focado (1h)' },
        { id: 'tec-2', label: 'Prática deliberada da habilidade-chave' },
        { id: 'tec-3', label: 'Revisão do progresso do dia anterior' },
      ],
    },
    [PILLARS.HUMANO]: {
      enabled: true,
      tasks: [
        { id: 'hum-1', label: 'Conexão real com alguém importante' },
        { id: 'hum-2', label: 'Momento de reflexão/journaling' },
        { id: 'hum-3', label: 'Tempo sem telas antes de dormir' },
      ],
    },
  });

  /* ------------------------------------------------------------------
     Heatmap — limites de intensidade (percentual de conclusão do dia
     mapeado para um nível visual de 0 a 4)
     ------------------------------------------------------------------ */
  const HEATMAP_LEVELS = Object.freeze([
    { level: 0, min: 0, max: 0 },      // sem registro / 0%
    { level: 1, min: 1, max: 33 },
    { level: 2, min: 34, max: 66 },
    { level: 3, min: 67, max: 99 },
    { level: 4, min: 100, max: 100 },
  ]);

  const HEATMAP_WEEKS_VISIBLE = 18; // ~ 126 dias no grid do histórico

  /* ------------------------------------------------------------------
     Motor preditivo — Simulador de Engenharia de Metas
     ------------------------------------------------------------------ */
  const GOAL_MODULE_LENGTH_OPTIONS = Object.freeze([14, 30]);
  const GOAL_DEFAULT_MODULE_LENGTH = 30;

  // Faixas de status derivadas da Probabilidade de Sucesso (0-100).
  // "completed" é tratado à parte (progresso efetivo >= 100%).
  const GOAL_STATUS_THRESHOLDS = Object.freeze({
    ON_TRACK_MIN: 85,  // >= 85%  -> "No ritmo"
    AT_RISK_MIN: 50,   // 50-84%  -> "Em risco"
    // < 50%                       -> "Atrasado"
  });

  const GOAL_STATUS_LABELS = Object.freeze({
    'on-track': 'No ritmo',
    'at-risk': 'Em risco',
    'behind': 'Atrasado',
    'completed': 'Concluído',
  });

  /* ------------------------------------------------------------------
     Rotas / views internas da SPA
     ------------------------------------------------------------------ */
  const VIEWS = Object.freeze({
    AUTH: 'auth',
    DASHBOARD: 'dashboard',
    HISTORY: 'history',
    SETTINGS: 'settings',
  });

  const VIEW_META = Object.freeze({
    [VIEWS.DASHBOARD]: { title: 'Painel Preditivo', subtitle: 'Probabilidade de sucesso do seu objetivo, calculada em tempo real' },
    [VIEWS.HISTORY]: { title: 'Histórico de Execução', subtitle: 'Sua consistência ao longo do tempo' },
    [VIEWS.SETTINGS]: { title: 'Configurações', subtitle: 'Objetivo, cronograma e escopo do Plano de Treinamento' },
  });

  const DEFAULT_VIEW = VIEWS.DASHBOARD;

  /* ------------------------------------------------------------------
     Toasts
     ------------------------------------------------------------------ */
  const TOAST_DURATION_MS = 3600;

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */
  PlanoHIT.CONFIG = Object.freeze({
    STORAGE_KEYS,
    AUTH_CONFIG,
    PROFILE_CONFIG,
    PILLARS,
    PILLAR_META,
    PILLAR_ORDER,
    DEFAULT_MODULE_SCOPE,
    HEATMAP_LEVELS,
    HEATMAP_WEEKS_VISIBLE,
    GOAL_MODULE_LENGTH_OPTIONS,
    GOAL_DEFAULT_MODULE_LENGTH,
    GOAL_STATUS_THRESHOLDS,
    GOAL_STATUS_LABELS,
    VIEWS,
    VIEW_META,
    DEFAULT_VIEW,
    TOAST_DURATION_MS,
  });

  global.PlanoHIT = PlanoHIT;

})(window);
