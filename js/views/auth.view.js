/**
 * ==========================================================================
 * PLANO HIT — VIEW: AUTENTICAÇÃO
 * Controla a tela de Login/Registro: alternância de abas, toggle de
 * visibilidade de senha, validação inline por campo e submissão dos
 * formulários via PlanoHIT.Auth. Esta view não decide navegação pós-
 * login — apenas dispara o fluxo de Auth; quem reage à autenticação
 * bem-sucedida é o router.js (evento 'planohit:auth:login').
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const Auth = global.PlanoHIT.Auth;

  let el = {};

  function cacheDom() {
    el = {
      tabLogin: document.getElementById('tab-login'),
      tabRegister: document.getElementById('tab-register'),
      formLogin: document.getElementById('form-login'),
      formRegister: document.getElementById('form-register'),
    };
  }

  /* ------------------------------------------------------------------
     Alternância de abas Login / Registro
     ------------------------------------------------------------------ */

  function switchTab(target) {
    const isLogin = target === 'login';

    el.tabLogin.classList.toggle('is-active', isLogin);
    el.tabLogin.setAttribute('aria-selected', String(isLogin));
    el.tabRegister.classList.toggle('is-active', !isLogin);
    el.tabRegister.setAttribute('aria-selected', String(!isLogin));

    el.formLogin.hidden = !isLogin;
    el.formRegister.hidden = isLogin;

    clearFormFeedback(el.formLogin);
    clearFormFeedback(el.formRegister);
  }

  function bindTabs() {
    el.tabLogin.addEventListener('click', () => switchTab('login'));
    el.tabRegister.addEventListener('click', () => switchTab('register'));
  }

  /* ------------------------------------------------------------------
     Toggle de visibilidade de senha
     ------------------------------------------------------------------ */

  function bindPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inputId = btn.getAttribute('data-toggle-password');
        const input = document.getElementById(inputId);
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.setAttribute('aria-label', isHidden ? 'Ocultar senha' : 'Mostrar senha');
      });
    });
  }

  /* ------------------------------------------------------------------
     Feedback de formulário (erros de campo + alerta geral + loading)
     ------------------------------------------------------------------ */

  function clearFormFeedback(form) {
    form.querySelectorAll('.field__error').forEach((el) => { el.textContent = ''; });
    const alertEl = form.querySelector('[data-role="auth-alert"]');
    if (alertEl) {
      alertEl.hidden = true;
      alertEl.textContent = '';
      alertEl.removeAttribute('data-variant');
    }
  }

  // Mapeia o nome do campo (usado nas validações de auth.js) para o
  // atributo `data-error-for` real de cada formulário, já que os ids
  // no HTML seguem o padrão "<form>-<campo>" com hífens (ex.:
  // "passwordConfirm" -> "register-password-confirm").
  const FIELD_ERROR_MAP = {
    login: {
      email: 'login-email',
      password: 'login-password',
    },
    register: {
      name: 'register-name',
      email: 'register-email',
      password: 'register-password',
      passwordConfirm: 'register-password-confirm',
    },
  };

  function applyFieldErrors(form, errors) {
    const formKey = form === el.formLogin ? 'login' : 'register';
    const map = FIELD_ERROR_MAP[formKey];

    Object.keys(errors).forEach((fieldName) => {
      if (fieldName === 'form') return; // erro geral, tratado à parte
      const targetId = map[fieldName];
      if (!targetId) return;
      const errorEl = form.querySelector(`[data-error-for="${targetId}"]`);
      if (errorEl) errorEl.textContent = errors[fieldName];
    });

    if (errors.form) {
      showAlert(form, errors.form, 'danger');
    }
  }

  function showAlert(form, message, variant) {
    const alertEl = form.querySelector('[data-role="auth-alert"]');
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.hidden = false;
    alertEl.setAttribute('data-variant', variant || 'danger');
  }

  function setLoading(form, isLoading) {
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;
    submitBtn.disabled = isLoading;
    submitBtn.querySelector('.btn__spinner').hidden = !isLoading;
    submitBtn.querySelector('.btn__label').style.opacity = isLoading ? '0.6' : '1';
  }

  /* ------------------------------------------------------------------
     Submit — Login
     ------------------------------------------------------------------ */

  function handleLoginSubmit(event) {
    event.preventDefault();
    clearFormFeedback(el.formLogin);

    const formData = new FormData(el.formLogin);
    const payload = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    setLoading(el.formLogin, true);

    // Pequeno delay simulado para dar sensação de chamada de rede real
    // e permitir que o spinner seja percebido pelo usuário.
    global.setTimeout(() => {
      const result = Auth.login(payload);
      setLoading(el.formLogin, false);

      if (!result.ok) {
        applyFieldErrors(el.formLogin, result.errors);
        return;
      }
      // Sucesso: router.js reage ao evento 'planohit:auth:login'
      // disparado dentro de Auth.login(). Nada a fazer aqui.
      el.formLogin.reset();
    }, 420);
  }

  /* ------------------------------------------------------------------
     Submit — Registro
     ------------------------------------------------------------------ */

  function handleRegisterSubmit(event) {
    event.preventDefault();
    clearFormFeedback(el.formRegister);

    const formData = new FormData(el.formRegister);
    const payload = {
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      passwordConfirm: formData.get('passwordConfirm'),
    };

    setLoading(el.formRegister, true);

    global.setTimeout(() => {
      const result = Auth.register(payload);
      setLoading(el.formRegister, false);

      if (!result.ok) {
        applyFieldErrors(el.formRegister, result.errors);
        return;
      }
      el.formRegister.reset();
    }, 420);
  }

  function bindForms() {
    el.formLogin.addEventListener('submit', handleLoginSubmit);
    el.formRegister.addEventListener('submit', handleRegisterSubmit);
  }

  /* ------------------------------------------------------------------
     Inicialização pública
     ------------------------------------------------------------------ */

  function init() {
    cacheDom();
    bindTabs();
    bindPasswordToggles();
    bindForms();
  }

  global.PlanoHIT.Views = global.PlanoHIT.Views || {};
  global.PlanoHIT.Views.AuthView = { init };

})(window);
