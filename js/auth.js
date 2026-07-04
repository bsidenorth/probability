/**
 * ==========================================================================
 * PLANO HIT — AUTH
 * Simula um fluxo de autenticação JWT completo, 100% client-side:
 *   - "hash" de senha (não criptográfico, apenas para não guardar
 *     senha em texto puro no localStorage de demonstração)
 *   - emissão de um token no formato header.payload.signature (base64),
 *     assim como um JWT real, com claims (sub, email, iat, exp)
 *   - validação de expiração (TTL configurado em config.js)
 *   - Route Guard: qualquer parte do app pode perguntar
 *     Auth.isAuthenticated() antes de renderizar conteúdo protegido
 *
 * Este módulo dispara eventos customizados em `window` para desacoplar
 * de router.js / app.js:
 *   - 'planohit:auth:login'   -> { detail: { user } }
 *   - 'planohit:auth:logout'  -> { detail: { reason } }
 *   - 'planohit:auth:expired' -> { detail: {} }
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const Storage = global.PlanoHIT.Storage;
  const AUTH_CFG = CONFIG.AUTH_CONFIG;

  /* ------------------------------------------------------------------
     Utilitários de codificação (base64 seguro para unicode)
     ------------------------------------------------------------------ */

  function b64encode(obj) {
    const json = JSON.stringify(obj);
    return global.btoa(unescape(encodeURIComponent(json)));
  }

  function b64decode(str) {
    try {
      const json = decodeURIComponent(escape(global.atob(str)));
      return JSON.parse(json);
    } catch (err) {
      return null;
    }
  }

  /**
   * "Hash" simples (djb2) apenas para não persistir senha em texto puro
   * no localStorage de um ambiente de demonstração front-end-only.
   * NÃO é criptograficamente seguro — em produção, hashing de senha
   * deve sempre acontecer no backend (bcrypt/argon2).
   */
  function simpleHash(text) {
    let hash = 5381;
    const str = String(text);
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'h_' + Math.abs(hash).toString(36);
  }

  function generateId(prefix) {
    const rand = Math.random().toString(36).slice(2, 10);
    const time = Date.now().toString(36);
    return (prefix || 'usr') + '_' + time + rand;
  }

  /* ------------------------------------------------------------------
     Emissão / validação do token simulado (formato JWT-like)
     ------------------------------------------------------------------ */

  function issueToken(user) {
    const now = Date.now();
    const header = { alg: 'SIM256', typ: 'JWT' };
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      iss: AUTH_CFG.TOKEN_ISSUER,
      iat: now,
      exp: now + AUTH_CFG.TOKEN_TTL_MS,
    };
    // "assinatura" simulada — hash do header+payload, só para o token
    // ter o formato de 3 partes de um JWT real.
    const signature = simpleHash(JSON.stringify(header) + JSON.stringify(payload));

    const token = [
      b64encode(header),
      b64encode(payload),
      signature,
    ].join('.');

    return { token, payload };
  }

  function decodeToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = b64decode(parts[1]);
    return payload;
  }

  function isPayloadValid(payload) {
    if (!payload || !payload.exp) return false;
    return Date.now() < payload.exp;
  }

  /* ------------------------------------------------------------------
     Seed de dados para um usuário novo (configurações + entradas vazias)
     ------------------------------------------------------------------ */

  function seedUserData(userId) {
    if (!Storage.getSettings(userId)) {
      // deep clone do escopo padrão definido em config.js
      const defaults = JSON.parse(JSON.stringify(CONFIG.DEFAULT_MODULE_SCOPE));
      Storage.saveSettings(userId, defaults);
    }
    if (!Storage.getAllEntries(userId)) {
      Storage.saveAllEntries(userId, {});
    }
  }

  /* ------------------------------------------------------------------
     Validações de formulário
     ------------------------------------------------------------------ */

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function validateRegisterInput({ name, email, password, passwordConfirm }) {
    const errors = {};
    if (!name || name.trim().length < 2) {
      errors.name = 'Informe seu nome completo.';
    }
    if (!validateEmail(email)) {
      errors.email = 'Informe um e-mail válido.';
    }
    if (!password || password.length < AUTH_CFG.MIN_PASSWORD_LENGTH) {
      errors.password = `A senha precisa ter ao menos ${AUTH_CFG.MIN_PASSWORD_LENGTH} caracteres.`;
    }
    if (password !== passwordConfirm) {
      errors.passwordConfirm = 'As senhas não coincidem.';
    }
    return errors;
  }

  function validateLoginInput({ email, password }) {
    const errors = {};
    if (!validateEmail(email)) {
      errors.email = 'Informe um e-mail válido.';
    }
    if (!password || password.length < AUTH_CFG.MIN_PASSWORD_LENGTH) {
      errors.password = `A senha precisa ter ao menos ${AUTH_CFG.MIN_PASSWORD_LENGTH} caracteres.`;
    }
    return errors;
  }

  /* ------------------------------------------------------------------
     Fluxo de Registro
     ------------------------------------------------------------------ */

  function register({ name, email, password, passwordConfirm }) {
    const errors = validateRegisterInput({ name, email, password, passwordConfirm });
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    if (Storage.findUserByEmail(email)) {
      return { ok: false, errors: { email: 'Já existe uma conta com este e-mail.' } };
    }

    const user = {
      id: generateId('usr'),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: simpleHash(password),
      createdAt: new Date().toISOString(),
    };

    Storage.insertUser(user);
    seedUserData(user.id);

    return loginWithUser(user);
  }

  /* ------------------------------------------------------------------
     Fluxo de Login
     ------------------------------------------------------------------ */

  function login({ email, password }) {
    const errors = validateLoginInput({ email, password });
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    const user = Storage.findUserByEmail(email);
    if (!user || user.passwordHash !== simpleHash(password)) {
      return { ok: false, errors: { form: 'E-mail ou senha inválidos.' } };
    }

    seedUserData(user.id); // garante seed mesmo se o usuário veio de uma versão antiga
    return loginWithUser(user);
  }

  function loginWithUser(user) {
    const { token, payload } = issueToken(user);
    const publicUser = { id: user.id, name: user.name, email: user.email };

    Storage.setSessionToken({ token, payload });
    Storage.setSessionUser(publicUser);

    global.dispatchEvent(new CustomEvent('planohit:auth:login', { detail: { user: publicUser } }));

    return { ok: true, user: publicUser, token };
  }

  /* ------------------------------------------------------------------
     Logout
     ------------------------------------------------------------------ */

  function logout(reason) {
    Storage.clearSession();
    global.dispatchEvent(new CustomEvent('planohit:auth:logout', { detail: { reason: reason || 'manual' } }));
  }

  /* ------------------------------------------------------------------
     Route Guard
     ------------------------------------------------------------------ */

  function isAuthenticated() {
    const session = Storage.getSessionToken();
    if (!session || !session.payload) return false;

    if (!isPayloadValid(session.payload)) {
      // token expirado — limpa a sessão e avisa o app
      Storage.clearSession();
      global.dispatchEvent(new CustomEvent('planohit:auth:expired', { detail: {} }));
      return false;
    }
    return true;
  }

  function getCurrentUser() {
    if (!isAuthenticated()) return null;
    return Storage.getSessionUser();
  }

  function getTokenExpiryDate() {
    const session = Storage.getSessionToken();
    if (!session || !session.payload) return null;
    return new Date(session.payload.exp);
  }

  /**
   * Inicia um verificador periódico de expiração do token. Deve ser
   * chamado uma única vez pelo app.js na inicialização. Isso garante
   * que, mesmo sem interação do usuário, a sessão expire "sozinha"
   * na tela ao atingir o TTL configurado.
   */
  let expiryWatcherId = null;
  function startExpiryWatcher(intervalMs) {
    if (expiryWatcherId) return;
    expiryWatcherId = global.setInterval(function () {
      const session = Storage.getSessionToken();
      if (session && !isPayloadValid(session.payload)) {
        isAuthenticated(); // dispara limpeza + evento 'expired'
      }
    }, intervalMs || 30000);
  }

  function stopExpiryWatcher() {
    if (expiryWatcherId) {
      global.clearInterval(expiryWatcherId);
      expiryWatcherId = null;
    }
  }

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */

  global.PlanoHIT.Auth = {
    register,
    login,
    logout,
    isAuthenticated,
    getCurrentUser,
    getTokenExpiryDate,
    decodeToken,
    startExpiryWatcher,
    stopExpiryWatcher,
    // exportado para uso pontual em settings.view.js (ex.: renomear usuário)
    _generateId: generateId,
  };

})(window);
