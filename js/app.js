/**
 * ==========================================================================
 * PLANO HIT — APP (BOOTSTRAP)
 * Ponto de entrada da aplicação. Responsabilidades:
 *   1) Implementar o componente global de Toast (usado por qualquer view)
 *   2) Inicializar a sessão (Route Guard) e o State a partir dela
 *   3) Inicializar Router + todas as views
 *   4) Ligar o logout e o watcher de expiração de token
 *
 * Ordem de carregamento (ver index.html):
 *   config -> storage -> auth -> state -> router ->
 *   views/* -> app (este arquivo, por último)
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const Auth = global.PlanoHIT.Auth;
  const Storage = global.PlanoHIT.Storage;
  const State = global.PlanoHIT.State;
  const Router = global.PlanoHIT.Router;
  const Views = global.PlanoHIT.Views;

  /* ------------------------------------------------------------------
     Componente: Toast
     Fila simples de notificações temporárias, renderizadas dentro de
     [data-role="toast-container"]. Qualquer módulo pode chamar
     PlanoHIT.Toast.show(message, variant).
     ------------------------------------------------------------------ */

  const Toast = (function () {
    let container = null;

    function ensureContainer() {
      if (!container) {
        container = document.querySelector('[data-role="toast-container"]');
      }
      return container;
    }

    function show(message, variant) {
      const root = ensureContainer();
      if (!root) return;

      const toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('data-variant', variant || 'info');
      toastEl.setAttribute('role', 'status');
      toastEl.textContent = message;

      root.appendChild(toastEl);

      global.setTimeout(() => {
        toastEl.style.transition = `opacity ${CONFIG.TOAST_DURATION_MS > 0 ? 200 : 0}ms ease`;
        toastEl.style.opacity = '0';
        global.setTimeout(() => toastEl.remove(), 200);
      }, CONFIG.TOAST_DURATION_MS);
    }

    return { show };
  })();

  global.PlanoHIT.Toast = Toast;

  /* ------------------------------------------------------------------
     Sidebar/Shell — nome e e-mail do usuário logado
     ------------------------------------------------------------------ */

  function renderSessionChrome(user) {
    const nameEl = document.querySelector('[data-role="user-name"]');
    const emailEl = document.querySelector('[data-role="user-email"]');
    if (nameEl) nameEl.textContent = user ? user.name : '—';
    if (emailEl) emailEl.textContent = user ? user.email : '—';
  }

  /* ------------------------------------------------------------------
     Logout
     ------------------------------------------------------------------ */

  function bindLogout() {
    const logoutBtns = document.querySelectorAll('[data-role="logout"]');
    logoutBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        Auth.logout('manual');
      });
    });
  }

  /* ------------------------------------------------------------------
     Sincroniza o State (dados de negócio) com a sessão de Auth
     ------------------------------------------------------------------ */

  function hydrateStateFromSession() {
    const user = Auth.getCurrentUser();
    if (user) {
      State.init(user);
      renderSessionChrome(user);
      Views.DashboardView.renderChrome();
    } else {
      State.reset();
      renderSessionChrome(null);
    }
  }

  function bindAuthLifecycleEvents() {
    global.addEventListener('planohit:auth:login', (e) => {
      State.init(e.detail.user);
      renderSessionChrome(e.detail.user);
      Toast.show(`Bem-vindo(a), ${e.detail.user.name.split(' ')[0]}!`, 'success');
    });

    global.addEventListener('planohit:auth:logout', () => {
      State.reset();
      renderSessionChrome(null);
    });

    global.addEventListener('planohit:auth:expired', () => {
      State.reset();
      renderSessionChrome(null);
      Toast.show('Sua sessão expirou. Faça login novamente.', 'warning');
    });
  }

  /* ------------------------------------------------------------------
     Inicialização de todas as views (registram seus próprios listeners
     e só renderizam de fato quando 'planohit:view:enter' ou os eventos
     de State relevantes disparam)
     ------------------------------------------------------------------ */

  function initViews() {
    Views.AuthView.init();
    Views.DashboardView.init();
    Views.HistoryView.init();
    Views.SettingsView.init();
  }

  /* ------------------------------------------------------------------
     Bootstrap principal
     ------------------------------------------------------------------ */

  function bootstrap() {
    initViews();

    // Importante: o State precisa estar hidratado (settings/entries do
    // usuário carregados) ANTES do Router decidir renderizar a view
    // ativa — caso contrário, dashboard/history/settings tentariam ler
    // um State ainda vazio na primeira pintura da página.
    hydrateStateFromSession();

    // bindAuthLifecycleEvents() precisa ser registrado ANTES de
    // Router.init(): ambos escutam 'planohit:auth:login', e listeners
    // de CustomEvent disparam na ordem de registro. Precisamos que
    // State.init(user) rode primeiro, para que a navegação disparada
    // pelo Router já encontre settings/entries carregados.
    bindAuthLifecycleEvents();
    Router.init();

    bindLogout();

    // Verifica a expiração do token periodicamente, mesmo sem interação
    // do usuário, garantindo que o Route Guard reaja sozinho ao TTL.
    Auth.startExpiryWatcher(30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})(window);
