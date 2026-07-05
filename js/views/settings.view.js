/**
 * ==========================================================================
 * PLANO HIT — VIEW: CONFIGURAÇÕES
 * Controla o perfil exibido (nome com cooldown de 30 dias, e-mail
 * somente-leitura), o CRUD de múltiplos Objetivos & Cronogramas, o
 * escopo de cada frente do Plano de Treinamento (ativar/desativar,
 * adicionar/editar/remover tarefas) e a zona de risco (reset total).
 * ==========================================================================
 */

(function (global) {
  'use strict';

  const CONFIG = global.PlanoHIT.CONFIG;
  const State = global.PlanoHIT.State;
  const Storage = global.PlanoHIT.Storage;
  const PILLAR_ORDER = CONFIG.PILLAR_ORDER;

  let el = {};
  let editingGoalId = null; // null = formulário em modo "novo objetivo"

  function cacheDom() {
    el = {
      section: document.getElementById('view-settings'),
      nameInput: document.querySelector('[data-role="settings-name"]'),
      nameHint: document.querySelector('[data-role="name-cooldown-hint"]'),
      emailDisplay: document.querySelector('[data-role="settings-email"]'),
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
      // Objetivo & Cronograma (múltiplos objetivos)
      goalsList: document.querySelector('[data-role="goals-list"]'),
      goalsEmpty: document.querySelector('[data-role="goals-empty"]'),
      tplGoalItem: document.getElementById('tpl-goal-item'),
      goalFormModeLabel: document.querySelector('[data-role="goal-form-mode-label"]'),
      newGoalButton: document.querySelector('[data-role="new-goal"]'),
      cancelGoalEditButton: document.querySelector('[data-role="cancel-goal-edit"]'),
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
     Objetivo & Cronograma — lista de Objetivos cadastrados
     ------------------------------------------------------------------ */

  const startDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  function renderGoalsList() {
    const summary = State.getGoalsSummary();

    el.goalsEmpty.hidden = summary.length > 0;
    el.goalsList.hidden = summary.length === 0;
    el.goalsList.innerHTML = '';

    summary.forEach((g) => {
      const fragment = el.tplGoalItem.content.cloneNode(true);
      const item = fragment.querySelector('.goal-list-item');
      item.setAttribute('data-goal-id', g.id);

      item.querySelector('.goal-list-item__name').textContent = g.name || 'Objetivo sem nome';

      const metaParts = [`Dia ${g.daysElapsed} de ${g.totalDays}`, `${g.probability}% de probabilidade`];
      if (g.isActive) metaParts.push('em foco no Painel');
      item.querySelector('.goal-list-item__meta').textContent = metaParts.join(' · ');

      const badge = item.querySelector('.goal-list-item__badge');
      badge.setAttribute('data-status', g.status);
      badge.textContent = CONFIG.GOAL_STATUS_LABELS[g.status] || g.status;

      const selectBtn = item.querySelector('[data-action="select"]');
      if (g.isActive) {
        selectBtn.disabled = true;
        selectBtn.textContent = 'Em foco';
      }

      el.goalsList.appendChild(fragment);
    });
  }

  function bindGoalsList() {
    el.goalsList.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const item = e.target.closest('.goal-list-item');
      const goalId = item.getAttribute('data-goal-id');
      const action = btn.getAttribute('data-action');

      if (action === 'select') {
        State.setActiveGoal(goalId);
        renderGoalsList();
        toast('Objetivo selecionado — confira o Painel Preditivo.', 'success');
      } else if (action === 'edit') {
        startEditingGoal(goalId);
      } else if (action === 'delete') {
        const goal = State.getGoalById(goalId);
        const confirmed = global.confirm(
          `Excluir o Objetivo "${goal ? goal.name : ''}"? Isso não afeta o histórico do Plano de Treinamento, só o cronograma dessa meta.`
        );
        if (!confirmed) return;

        State.deleteGoal(goalId);
        if (editingGoalId === goalId) resetGoalFormToNew();
        renderGoalsList();
        toast('Objetivo excluído.', 'warning');
      }
    });
  }

  /* ------------------------------------------------------------------
     Objetivo & Cronograma — formulário (cria OU edita, nunca os dois)
     ------------------------------------------------------------------ */

  function resetGoalFormToNew() {
    editingGoalId = null;
    el.goalNameInput.value = '';
    el.goalDescriptionInput.value = '';
    el.goalDurationInput.value = '';
    el.goalModuleLengthInput.value = String(CONFIG.GOAL_DEFAULT_MODULE_LENGTH);
    el.goalStartDateLine.hidden = true;
    el.goalFormModeLabel.textContent = 'Novo Objetivo';
    el.saveGoalButton.textContent = 'Criar Objetivo';
    el.cancelGoalEditButton.hidden = true;
  }

  function startEditingGoal(goalId) {
    const goal = State.getGoalById(goalId);
    if (!goal) return;

    editingGoalId = goalId;
    el.goalNameInput.value = goal.name;
    el.goalDescriptionInput.value = goal.description || '';
    el.goalDurationInput.value = String(goal.totalDays);
    el.goalModuleLengthInput.value = String(goal.moduleLengthDays);

    el.goalStartDateLine.hidden = false;
    el.goalStartDateDisplay.textContent = startDateFormatter.format(new Date(goal.startDate + 'T00:00:00'));

    el.goalFormModeLabel.textContent = `Editando: ${goal.name}`;
    el.saveGoalButton.textContent = 'Atualizar Objetivo';
    el.cancelGoalEditButton.hidden = false;

    el.goalNameInput.focus();
  }

  function bindGoalForm() {
    el.newGoalButton.addEventListener('click', () => {
      resetGoalFormToNew();
      el.goalNameInput.focus();
    });

    el.cancelGoalEditButton.addEventListener('click', () => {
      resetGoalFormToNew();
    });

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

      const payload = {
        name,
        description: el.goalDescriptionInput.value.trim(),
        totalDays,
        moduleLengthDays: parseInt(el.goalModuleLengthInput.value, 10),
      };

      if (editingGoalId) {
        State.updateGoal(editingGoalId, payload);
        toast('Objetivo atualizado — simulação recalculada.', 'success');
      } else {
        State.createGoal(payload);
        toast('Objetivo criado! Acompanhe a Probabilidade de Sucesso no Painel Preditivo.', 'success');
      }

      resetGoalFormToNew();
      renderGoalsList();
    });
  }

  /* ------------------------------------------------------------------
     Perfil — nome com cooldown de 30 dias, e-mail somente-leitura
     ------------------------------------------------------------------ */

  const NAME_COOLDOWN_DAYS = CONFIG.PROFILE_CONFIG.NAME_CHANGE_COOLDOWN_DAYS;

  function getNameChangeStatus(fullUser) {
    if (!fullUser || !fullUser.nameChangedAt) {
      return { allowed: true, daysRemaining: 0 };
    }
    const msSinceChange = Date.now() - new Date(fullUser.nameChangedAt).getTime();
    const daysSinceChange = msSinceChange / 86400000;
    if (daysSinceChange >= NAME_COOLDOWN_DAYS) {
      return { allowed: true, daysRemaining: 0 };
    }
    return { allowed: false, daysRemaining: Math.ceil(NAME_COOLDOWN_DAYS - daysSinceChange) };
  }

  function renderProfile() {
    const user = State.getUser();
    if (!user) return;

    el.nameInput.value = user.name;
    el.emailDisplay.textContent = user.email;

    const fullUser = Storage.findUserById(user.id);
    const cooldown = getNameChangeStatus(fullUser);

    el.nameInput.disabled = !cooldown.allowed;
    if (cooldown.allowed) {
      el.nameHint.textContent = 'Você pode alterar seu nome agora (disponível a cada 30 dias).';
      el.nameHint.setAttribute('data-state', 'available');
    } else {
      el.nameHint.textContent = `Você poderá alterar o nome novamente em ${cooldown.daysRemaining} dia${cooldown.daysRemaining > 1 ? 's' : ''}.`;
      el.nameHint.setAttribute('data-state', 'locked');
    }
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

    const fullUser = Storage.findUserById(user.id);
    const cooldown = getNameChangeStatus(fullUser);
    if (!cooldown.allowed) {
      el.nameInput.value = user.name;
      toast(`Você já alterou o nome recentemente. Tente novamente em ${cooldown.daysRemaining} dia(s).`, 'warning');
      return;
    }

    const nameChangedAt = new Date().toISOString();
    const updatedUser = Object.assign({}, user, { name: newName });

    Storage.updateUser(user.id, { name: newName, nameChangedAt });
    Storage.setSessionUser(updatedUser);
    updateSidebarUserDisplay(updatedUser);
    renderProfile(); // já trava o campo com o novo prazo de cooldown
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
        'Isso vai apagar permanentemente todos os Objetivos, o histórico e restaurar o Plano de Treinamento padrão. Esta ação não pode ser desfeita. Deseja continuar?'
      );
      if (!confirmed) return;

      const user = State.getUser();
      if (!user) return;

      Storage.wipeUserData(user.id);
      State.init(user); // recarrega settings padrão + entries/objetivos vazios em memória

      resetGoalFormToNew();
      render();
      toast('Todos os dados foram redefinidos.', 'danger');
    });
  }

  /* ------------------------------------------------------------------
     Renderização completa da view
     ------------------------------------------------------------------ */

  function render() {
    renderGoalsList();
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
      if (eventName === 'goal:change' && el.section && !el.section.hidden) {
        renderGoalsList();
      }
      if (eventName === 'state:init') {
        resetGoalFormToNew();
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
    resetGoalFormToNew();
    bindGoalsList();
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
