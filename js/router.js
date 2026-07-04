/**
 * ==========================================================================
 * PLANO HIT — ROUTER
 * Motor de navegação da SPA. Duas responsabilidades bem separadas:
 *
 *   1) ROUTE GUARD: decide se o usuário vê o Shell autenticado
 *      (Sidebar/Tab Bar + views protegidas) ou a tela de Auth.
 *      Esta é a "porta de entrada" de segurança do front-end — nenhuma
 *      view protegida deve ficar visível sem um token válido.
 *
 *   2) NAVEGAÇÃO INTERNA: alterna entre Dashboard / Histórico /
 *      Configurações dentro do Shell, mantendo Sidebar, Tab Bar e
 *      cabeçalho sincronizados com PlanoHIT.State.
 *
 * O Router não conhece o conteúdo de cada view — ele apenas
 * mostra/esconde as seções e emite o evento 'planohit:view:enter',
 * que os módulos em js/views/*.view.js escutam para se popular.
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const Auth = global.PlanoHIT.Auth;
  const State = global.PlanoHIT.State;
  const VIEWS = CONFIG.VIEWS;
  const VIEW_META = CONFIG.VIEW_META;

  /* ------------------------------------------------------------------
     Referências DOM (resolvidas em init, já que os scripts são
     carregados antes do body terminar de parsear em navegadores
     mais antigos — resolver tudo em DOMContentLoaded é mais seguro)
     ------------------------------------------------------------------ */

  let el = {};

  function cacheDom() {
    el = {
      app: document.getElementById('app'),
      viewAuth: document.getElementById('view-auth'),
      shell: document.getElementById('shell'),
      viewSections: {
        [VIEWS.DASHBOARD]: document.getElementById('view-dashboard'),
        [VIEWS.HISTORY]: document.getElementById('view-history'),
        [VIEWS.SETTINGS]: document.getElementById('view-settings'),
      },
      navLinks: Array.from(document.querySelectorAll('[data-nav-target]')),
      headerTitle: document.querySelector('[data-role="view-title"]'),
      headerSubtitle: document.querySelector('[data-role="view-subtitle"]'),
    };
  }

  /* ------------------------------------------------------------------
     Route Guard — alterna entre tela de Auth e Shell autenticado
     ------------------------------------------------------------------ */

  function renderAuthGate() {
    const authenticated = Auth.isAuthenticated();

    el.app.setAttribute('data-authenticated', String(authenticated));
    el.viewAuth.hidden = authenticated;
    el.viewAuth.setAttribute('aria-hidden', String(authenticated));
    el.shell.hidden = !authenticated;

    return authenticated;
  }

  /* ------------------------------------------------------------------
     Navegação interna entre views protegidas
     ------------------------------------------------------------------ */

  function navigateTo(viewId) {
    if (!VIEW_META[viewId]) {
      console.warn('[PlanoHIT.Router] View desconhecida:', viewId);
      return;
    }
    State.setView(viewId);
  }

  function renderActiveView() {
    const activeView = State.getView();

    // Alterna as seções de conteúdo
    Object.keys(el.viewSections).forEach((viewId) => {
      const section = el.viewSections[viewId];
      if (!section) return;
      section.hidden = viewId !== activeView;
    });

    // Sincroniza estado visual de Sidebar + Tab Bar
    el.navLinks.forEach((link) => {
      const isActive = link.getAttribute('data-nav-target') === activeView;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // Atualiza cabeçalho (título + subtítulo contextual)
    const meta = VIEW_META[activeView];
    if (meta && el.headerTitle) el.headerTitle.textContent = meta.title;
    if (meta && el.headerSubtitle) el.headerSubtitle.textContent = meta.subtitle;

    // Notifica o módulo de view responsável para que ele se popule.
    // Cada view (dashboard.view.js, history.view.js, settings.view.js)
    // escuta este evento e faz sua própria renderização sob demanda —
    // o Router nunca manipula o conteúdo interno de uma view.
    global.dispatchEvent(new CustomEvent('planohit:view:enter', { detail: { view: activeView } }));

    // Move o foco para o título da view — acessibilidade em SPA
    if (el.headerTitle) {
      el.headerTitle.setAttribute('tabindex', '-1');
      el.headerTitle.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------------
     Wiring de eventos de clique (Sidebar + Tab Bar)
     ------------------------------------------------------------------ */

  function bindNavClicks() {
    el.navLinks.forEach((link) => {
      link.addEventListener('click', () => {
        navigateTo(link.getAttribute('data-nav-target'));
      });
    });
  }

  /* ------------------------------------------------------------------
     Reage a mudanças de autenticação vindas de auth.js
     ------------------------------------------------------------------ */

  function bindAuthEvents() {
    global.addEventListener('planohit:auth:login', () => {
      renderAuthGate();
      navigateTo(CONFIG.DEFAULT_VIEW);
      renderActiveView();
    });

    global.addEventListener('planohit:auth:logout', () => {
      renderAuthGate();
    });

    global.addEventListener('planohit:auth:expired', () => {
      renderAuthGate();
    });
  }

  /* ------------------------------------------------------------------
     Reage a mudanças de view vindas do State (ex.: navegação
     programática disparada por um botão dentro de uma view, como o
     "Configurar módulos" no estado vazio do Dashboard)
     ------------------------------------------------------------------ */

  function bindStateEvents() {
    State.subscribe((eventName) => {
      if (eventName === 'view:change') {
        renderActiveView();
      }
    });
  }

  /* ------------------------------------------------------------------
     Inicialização pública
     ------------------------------------------------------------------ */

  function init() {
    cacheDom();
    bindNavClicks();
    bindAuthEvents();
    bindStateEvents();

    const authenticated = renderAuthGate();
    if (authenticated) {
      renderActiveView();
    }
  }

  /* ------------------------------------------------------------------
     Export
     ------------------------------------------------------------------ */

  global.PlanoHIT.Router = {
    init,
    navigateTo,
    renderAuthGate,
    renderActiveView,
  };

})(window);
