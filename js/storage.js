/**
 * ==========================================================================
 * PLANO HIT — STORAGE
 * Camada única de acesso a localStorage/sessionStorage. Nenhum outro
 * módulo deve chamar window.localStorage/sessionStorage diretamente —
 * tudo passa por aqui, o que nos dá um ponto central de serialização,
 * tratamento de erro e uma futura troca por uma API real sem tocar
 * no resto do app.
 *
 * Estrutura de dados persistida (localStorage), por usuário:
 *
 *   planohit.db.users            -> Array<{ id, name, email, passwordHash, createdAt }>
 *
 *   planohit.db.settings.<userId> -> {
 *     [pillarId]: { enabled: boolean, tasks: [{ id, label }] }
 *   }
 *
 *   planohit.db.entries.<userId>  -> {
 *     "YYYY-MM-DD": {
 *       date: "YYYY-MM-DD",
 *       pillars: {
 *         [pillarId]: { [taskId]: boolean }
 *       },
 *       updatedAt: ISOString
 *     },
 *     ...
 *   }
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const KEYS = CONFIG.STORAGE_KEYS;

  /* ------------------------------------------------------------------
     Helpers internos de leitura/escrita segura (try/catch + JSON)
     ------------------------------------------------------------------ */

  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error('[PlanoHIT.Storage] Falha ao parsear JSON:', err);
      return fallback;
    }
  }

  function readLocal(key, fallback) {
    try {
      return safeParse(global.localStorage.getItem(key), fallback);
    } catch (err) {
      console.error('[PlanoHIT.Storage] localStorage indisponível:', err);
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[PlanoHIT.Storage] Falha ao gravar em localStorage:', err);
      return false;
    }
  }

  function removeLocal(key) {
    try {
      global.localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error('[PlanoHIT.Storage] Falha ao remover de localStorage:', err);
      return false;
    }
  }

  function readSession(key, fallback) {
    try {
      return safeParse(global.sessionStorage.getItem(key), fallback);
    } catch (err) {
      console.error('[PlanoHIT.Storage] sessionStorage indisponível:', err);
      return fallback;
    }
  }

  function writeSession(key, value) {
    try {
      global.sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[PlanoHIT.Storage] Falha ao gravar em sessionStorage:', err);
      return false;
    }
  }

  function removeSession(key) {
    try {
      global.sessionStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error('[PlanoHIT.Storage] Falha ao remover de sessionStorage:', err);
      return false;
    }
  }

  /* ------------------------------------------------------------------
     Sessão (token JWT simulado + snapshot do usuário logado)
     Vive em sessionStorage: fecha a aba/navegador, sessão some —
     coerente com "expiração segura" sem precisar de backend.
     ------------------------------------------------------------------ */

  function getSessionToken() {
    return readSession(KEYS.SESSION_TOKEN, null);
  }

  function setSessionToken(tokenPayload) {
    return writeSession(KEYS.SESSION_TOKEN, tokenPayload);
  }

  function clearSessionToken() {
    return removeSession(KEYS.SESSION_TOKEN);
  }

  function getSessionUser() {
    return readSession(KEYS.SESSION_USER, null);
  }

  function setSessionUser(user) {
    return writeSession(KEYS.SESSION_USER, user);
  }

  function clearSessionUser() {
    return removeSession(KEYS.SESSION_USER);
  }

  function clearSession() {
    clearSessionToken();
    clearSessionUser();
  }

  /* ------------------------------------------------------------------
     Usuários (tabela única em localStorage — simula uma tabela `users`)
     ------------------------------------------------------------------ */

  function getUsers() {
    return readLocal(KEYS.DB_USERS, []);
  }

  function saveUsers(users) {
    return writeLocal(KEYS.DB_USERS, users);
  }

  function findUserByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return getUsers().find((u) => u.email.toLowerCase() === normalized) || null;
  }

  function findUserById(id) {
    return getUsers().find((u) => u.id === id) || null;
  }

  function insertUser(user) {
    const users = getUsers();
    users.push(user);
    saveUsers(users);
    return user;
  }

  function updateUser(userId, patch) {
    const users = getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;
    users[idx] = Object.assign({}, users[idx], patch);
    saveUsers(users);
    return users[idx];
  }

  /* ------------------------------------------------------------------
     Configurações de escopo dos módulos (por usuário)
     ------------------------------------------------------------------ */

  function getSettings(userId) {
    const key = KEYS.DB_SETTINGS_PREFIX + userId;
    return readLocal(key, null);
  }

  function saveSettings(userId, settings) {
    const key = KEYS.DB_SETTINGS_PREFIX + userId;
    return writeLocal(key, settings);
  }

  /* ------------------------------------------------------------------
     Entradas diárias (histórico de progresso — por usuário)
     ------------------------------------------------------------------ */

  function getAllEntries(userId) {
    const key = KEYS.DB_ENTRIES_PREFIX + userId;
    return readLocal(key, {});
  }

  function saveAllEntries(userId, entriesMap) {
    const key = KEYS.DB_ENTRIES_PREFIX + userId;
    return writeLocal(key, entriesMap);
  }

  function getEntry(userId, dateKey) {
    const entries = getAllEntries(userId);
    return entries[dateKey] || null;
  }

  function saveEntry(userId, dateKey, entry) {
    const entries = getAllEntries(userId);
    entries[dateKey] = entry;
    return saveAllEntries(userId, entries);
  }

  /* ------------------------------------------------------------------
     Objetivo & Cronograma (por usuário) — coração do motor preditivo
     ------------------------------------------------------------------ */

  function getGoal(userId) {
    const key = KEYS.DB_GOAL_PREFIX + userId;
    return readLocal(key, null);
  }

  function saveGoal(userId, goal) {
    const key = KEYS.DB_GOAL_PREFIX + userId;
    return writeLocal(key, goal);
  }

  function clearGoal(userId) {
    const key = KEYS.DB_GOAL_PREFIX + userId;
    return removeLocal(key);
  }

  /* ------------------------------------------------------------------
     Reset total dos dados de um usuário (Configurações > Zona de risco)
     ------------------------------------------------------------------ */

  function wipeUserData(userId) {
    removeLocal(KEYS.DB_SETTINGS_PREFIX + userId);
    removeLocal(KEYS.DB_ENTRIES_PREFIX + userId);
    removeLocal(KEYS.DB_GOAL_PREFIX + userId);
  }

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */

  global.PlanoHIT.Storage = {
    // sessão
    getSessionToken,
    setSessionToken,
    clearSessionToken,
    getSessionUser,
    setSessionUser,
    clearSessionUser,
    clearSession,
    // usuários
    getUsers,
    saveUsers,
    findUserByEmail,
    findUserById,
    insertUser,
    updateUser,
    // configurações
    getSettings,
    saveSettings,
    // objetivo & cronograma
    getGoal,
    saveGoal,
    clearGoal,
    // entradas diárias
    getAllEntries,
    saveAllEntries,
    getEntry,
    saveEntry,
    // manutenção
    wipeUserData,
  };

})(window);
