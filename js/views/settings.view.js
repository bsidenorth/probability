/**
 * ==========================================================================
 * PLANO HIT — VIEW: CONFIGURAÇÕES
 * Controla o perfil exibido, o escopo de cada módulo/pilar (ativar ou
 * desativar, adicionar/editar/remover tarefas) e a zona de risco
 * (reset total dos dados do usuário atual, mantendo-o logado).
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const State = global.PlanoHIT.State;
  const Storage = global.PlanoHIT.Storage;
  const PILLAR_ORDER = CONFIG.PILLAR_ORDER;

  let el = {};

  function cacheDom() {
    el = {
      section: document.getElementById('view-settings'),
      nameInput: document.querySelector('[data-role="settings-name"]'),
      emailInput: document.querySelector('[data-role="settings-email"]'),
      moduleToggles: Array.from(document.querySelectorAll('[data-role="module-toggle"]')),
      taskLists: {
        individual: document.querySelector('[data-role="settings-tasklist"][data-module="individual"]'),
        tecnico: document.querySelector('[data-role="settings-tasklist"][data-module="tecnico"]'),
        humano: document.querySelector('[data-role="settings-tasklist"][data-module="humano"]'),
      },
      addTaskButtons: Array.from(document.querySelectorAll('[data-role="add-task"]')),
      tplSettingsTask: document.getElementById('tpl-settings-task'),
      resetButton: document.querySelector('[data-role="reset-data"]'),
      sidebarUserName: document.querySelector('[data-role="user-name"]'),
      sidebarUserEmail: document.querySelector('[data-role="user-email"]'),
      // Objetivo & Cronograma
      goalNameInput: document.querySelector('[data-role="goal-name-input"]'),
      goalDescriptionInput: document.querySelector('[data-role="goal-description-input"]'),
      goalDurationInput: document.querySelector('[data-role="goal-duration-input"]'),
      goalModuleLengthInput: document.querySelector('[data-role="goal-module-length-input"]'),
      goalStartDateLine: document.querySelector('[data-role="goal-start-date-line"]'),
      goalStartDateDisplay: document.querySelector('[data-role="goal-start-date-display"]'),
      saveGoalButton: document.querySelector('[data-role="save-goal"]'),
    };
  }

  /* ------------------------------------------------------------------
     Toast de feedback (depende de PlanoHIT.Toast, inicializado em app.js)
     ------------------------------------------------------------------ */

  function toast(message, variant) {
    if (global.PlanoHIT.Toast && typeof global.PlanoHIT.Toast.show === 'function') {
      global.PlanoHIT.Toast.show(message, variant);
    }
  }

  /* ------------------------------------------------------------------
     Objetivo & Cronograma
     ------------------------------------------------------------------ */

  const startDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  function renderGoalForm() {
    const goal = State.getGoal();

    if (!goal) {
      el.goalNameInput.value = '';
      el.goalDescriptionInput.value = '';
      el.goalDurationInput.value = '';
      el.goalModuleLengthInput.value = String(CONFIG.GOAL_DEFAULT_MODULE_LENGTH);
      el.goalStartDateLine.hidden = true;
      el.saveGoalButton.textContent = 'Salvar Objetivo';
      return;
    }

    el.goalNameInput.value = goal.name;
    el.goalDescriptionInput.value = goal.description || '';
    el.goalDurationInput.value = String(goal.totalDays);
    el.goalModuleLengthInput.value = String(goal.moduleLengthDays);

    el.goalStartDateLine.hidden = false;
    el.goalStartDateDisplay.textContent = startDateFormatter.format(new Date(goal.startDate + 'T00:00:00'));
    el.saveGoalButton.textContent = 'Atualizar Objetivo';
  }

  function bindGoalForm() {
    el.saveGoalButton.addEventListener('click', () => {
      const name = el.goalNameInput.value.trim();
      const totalDays = parseInt(el.goalDurationInput.value, 10);

      if (!name) {
        toast('Dê um nome ao seu Objetivo antes de salvar.', 'danger');
        el.goalNameInput.focus();
        return;
      }
      if (!totalDays || totalDays < 1) {
        toast('Informe um Tempo Estimado válido (em dias).', 'danger');
        el.goalDurationInput.focus();
        return;
      }

      const wasEditing = !!State.getGoal();

      State.saveGoal({
        name,
        description: el.goalDescriptionInput.value.trim(),
        totalDays,
        moduleLengthDays: parseInt(el.goalModuleLengthInput.value, 10),
      });

      renderGoalForm();
      toast(
        wasEditing ? 'Objetivo atualizado — simulação recalculada.' : 'Objetivo definido! Acompanhe a Probabilidade de Sucesso no Painel Preditivo.',
        'success'
      );
    });
  }

  /* ------------------------------------------------------------------
     Perfil
     ------------------------------------------------------------------ */

  function renderProfile() {
    const user = State.getUser();
    if (!user) return;
    el.nameInput.value = user.name;
    el.emailInput.value = user.email;
  }

  function updateSidebarUserDisplay(user) {
    if (el.sidebarUserName) el.sidebarUserName.textContent = user.name;
    if (el.sidebarUserEmail) el.sidebarUserEmail.textContent = user.email;
  }

  function handleNameChange() {
    const user = State.getUser();
    if (!user) return;

    const newName = el.nameInput.value.trim();
    if (!newName || newName === user.name) {
      el.nameInput.value = user.name;
      return;
    }

    const updatedUser = Object.assign({}, user, { name: newName });
    Storage.updateUser(user.id, { name: newName });
    Storage.setSessionUser(updatedUser);
    updateSidebarUserDisplay(updatedUser);
    toast('Nome atualizado com sucesso.', 'success');
  }

  /* ------------------------------------------------------------------
     Toggle de módulos (ativar/desativar pilar)
     ------------------------------------------------------------------ */

  function renderModuleToggles() {
    const settings = State.getSettings();
    el.moduleToggles.forEach((toggle) => {
      const pillarId = toggle.getAttribute('data-module');
      toggle.checked = !!(settings[pillarId] && settings[pillarId].enabled);
    });
  }

  function bindModuleToggles() {
    el.moduleToggles.forEach((toggle) => {
      toggle.addEventListener('change', () => {
        const pillarId = toggle.getAttribute('data-module');
        State.setPillarEnabled(pillarId, toggle.checked);
        toast(
          `Pilar ${CONFIG.PILLAR_META[pillarId].label} ${toggle.checked ? 'ativado' : 'desativado'}.`,
          'success'
        );
      });
    });
  }

  /* ------------------------------------------------------------------
     Listas de tarefas por pilar (CRUD)
     ------------------------------------------------------------------ */

  function renderTaskList(pillarId) {
    const listEl = el.taskLists[pillarId];
    if (!listEl) return;

    const settings = State.getSettings();
    const tasks = settings[pillarId].tasks;

    listEl.innerHTML = '';

    tasks.forEach((task) => {
      const fragment = el.tplSettingsTask.content.cloneNode(true);
      const item = fragment.querySelector('.settings-tasklist__item');
      const input = item.querySelector('.settings-tasklist__input');
      const removeBtn = item.querySelector('.settings-tasklist__remove');

      input.value = task.label;
      input.setAttribute('aria-label', `Tarefa do pilar ${CONFIG.PILLAR_META[pillarId].label}`);
      input.dataset.taskId = task.id;

      input.addEventListener('blur', () => {
        const newLabel = input.value.trim();
        if (!newLabel) {
          input.value = task.label; // não permite salvar rótulo vazio
          return;
        }
        if (newLabel !== task.label) {
          State.updateTaskLabel(pillarId, task.id, newLabel);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        }
      });

      removeBtn.setAttribute('aria-label', `Remover tarefa "${task.label}"`);
      removeBtn.addEventListener('click', () => {
        State.removeTaskFromPillar(pillarId, task.id);
        renderTaskList(pillarId);
        toast('Tarefa removida.', 'warning');
      });

      listEl.appendChild(fragment);
    });
  }

  function renderAllTaskLists() {
    PILLAR_ORDER.forEach(renderTaskList);
  }

  function bindAddTaskButtons() {
    el.addTaskButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pillarId = btn.getAttribute('data-module');
        const task = State.addTaskToPillar(pillarId, 'Nova tarefa');
        renderTaskList(pillarId);

        // Foca automaticamente o campo recém-criado para edição imediata
        const listEl = el.taskLists[pillarId];
        const newInput = listEl.querySelector(`[data-task-id="${task.id}"]`);
        if (newInput) {
          newInput.focus();
          newInput.select();
        }
      });
    });
  }

  /* ------------------------------------------------------------------
     Zona de risco — reset total dos dados do usuário atual
     ------------------------------------------------------------------ */

  function bindResetButton() {
    if (!el.resetButton) return;
    el.resetButton.addEventListener('click', () => {
      const confirmed = global.confirm(
        'Isso vai apagar permanentemente todo o histórico e restaurar as tarefas padrão. Esta ação não pode ser desfeita. Deseja continuar?'
      );
      if (!confirmed) return;

      const user = State.getUser();
      if (!user) return;

      Storage.wipeUserData(user.id);
      State.init(user); // recarrega settings padrão + entries vazias em memória

      render();
      toast('Todos os dados foram redefinidos.', 'danger');
    });
  }

  /* ------------------------------------------------------------------
     Renderização completa da view
     ------------------------------------------------------------------ */

  function render() {
    renderGoalForm();
    renderProfile();
    renderModuleToggles();
    renderAllTaskLists();
  }

  /* ------------------------------------------------------------------
     Eventos
     ------------------------------------------------------------------ */

  function bindProfileForm() {
    el.nameInput.addEventListener('blur', handleNameChange);
    el.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') el.nameInput.blur();
    });
  }

  function bindStateEvents() {
    State.subscribe((eventName) => {
      if (eventName === 'settings:change' && el.section && !el.section.hidden) {
        renderModuleToggles();
        renderAllTaskLists();
      }
      if (eventName === 'state:init') {
        render();
      }
    });
  }

  function bindViewEnter() {
    global.addEventListener('planohit:view:enter', (e) => {
      if (e.detail.view === CONFIG.VIEWS.SETTINGS) {
        render();
      }
    });
  }

  /* ------------------------------------------------------------------
     Inicialização pública
     ------------------------------------------------------------------ */

  function init() {
    cacheDom();
    bindGoalForm();
    bindProfileForm();
    bindModuleToggles();
    bindAddTaskButtons();
    bindResetButton();
    bindStateEvents();
    bindViewEnter();
  }

  global.PlanoHIT.Views = global.PlanoHIT.Views || {};
  global.PlanoHIT.Views.SettingsView = { init, render };

})(window);
