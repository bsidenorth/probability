# Plano HIT — Sistema de Alta Performance

SPA (Single Page Application) modular para acompanhamento diário de performance, organizada em **3 pilares**: **Individual**, **Técnico** e **Humano**. Construída em HTML/CSS/JS puro (sem framework, sem build step), com estética Cyberpunk Dark, totalmente responsiva (Tab Bar no mobile, Sidebar no desktop) e persistência 100% client-side.

> ⚠️ Este é um projeto **front-end-only de demonstração**. Não há backend real: autenticação, "banco de dados" e hashing de senha são simulados no navegador (ver seção [Segurança](#segurança--limitações) abaixo).

---

## Rodando localmente

Não há dependências, bundler ou passo de build. Basta servir a pasta com qualquer servidor estático (não abra o `index.html` direto via `file://`, pois os scripts com `defer` e os módulos de template podem se comportar de forma inconsistente em alguns navegadores):

```bash
# Python
python3 -m http.server 8080

# ou Node (com o pacote serve)
npx serve .
```

Depois acesse `http://localhost:8080`.

---

## Estrutura do repositório

```
plano-hit/
├── index.html                  # Shell da SPA: todas as views/templates
├── css/
│   ├── reset.css                # Normalização base
│   ├── variables.css            # Tokens de design (cores, tipografia, espaçamento)
│   ├── layout.css                # Shell responsivo (Sidebar/Tab Bar), grids
│   ├── components.css           # Botões, cards, forms, badges, switches
│   └── views.css                 # Estilos específicos de cada view
├── js/
│   ├── config.js                 # Constantes globais e escopo padrão dos módulos
│   ├── storage.js                # Camada única de acesso a localStorage/sessionStorage
│   ├── auth.js                   # JWT simulado, hashing, Route Guard
│   ├── state.js                   # Store central (pub/sub), cálculo de métricas
│   ├── router.js                 # Route Guard visual + navegação entre views
│   ├── app.js                     # Bootstrap, Toast, ligação final de tudo
│   └── views/
│       ├── auth.view.js          # Login/Registro
│       ├── dashboard.view.js     # Dashboard do Dia
│       ├── history.view.js       # Histórico Global / Heatmap
│       └── settings.view.js      # Configurações / escopo dos módulos
└── README.md
```

**Ordem de carregamento dos scripts** (cada módulo se registra em `window.PlanoHIT`):

```
config → storage → auth → state → router → views/* → app
```

---

## Arquitetura

- **Namespace único**: tudo vive em `window.PlanoHIT.*` (`.CONFIG`, `.Storage`, `.Auth`, `.State`, `.Router`, `.Views`, `.Toast`) — sem variáveis soltas no escopo global.
- **Separação de responsabilidades**:
  - `Storage` é o **único** módulo que toca `localStorage`/`sessionStorage`.
  - `State` é o **único** módulo que lê/escreve dados de negócio (settings, entradas diárias) e calcula métricas derivadas (score, streak, consistência, heatmap). Views nunca acessam `Storage` diretamente para dados de negócio.
  - `Router` decide *o quê* está visível (Auth vs Shell, qual view ativa) mas nunca *como* o conteúdo de uma view é renderizado — isso é delegado via evento `planohit:view:enter`.
  - Cada `views/*.view.js` escuta esse evento + eventos de mudança do `State` (padrão pub/sub) e se autorrenderiza.
- **Sem dependências externas de JS** (nenhuma lib, nenhum framework) — só as fontes do Google Fonts via `<link>`.

---

## Funcionalidades

### Autenticação
- Registro e login com validação inline por campo.
- Token no formato `header.payload.signature` (JWT-like), com claims `sub/email/iat/exp` e TTL de 8h.
- **Route Guard**: sem token válido em `sessionStorage`, o usuário só vê a tela de Auth — qualquer tentativa de acessar Dashboard/Histórico/Configurações é bloqueada no nível de renderização.
- Expiração automática: um watcher verifica o token a cada 30s e desloga sozinho quando o TTL vence, mesmo sem interação do usuário.

### Dashboard do Dia
- Navegação temporal (dia anterior/seguinte, atalho "Hoje"), bloqueando avanço para datas futuras.
- Anel de progresso SVG com o score geral do dia + breakdown por pilar.
- Cards de pilar com checklist de tarefas — cada toggle é persistido imediatamente.
- Estado vazio quando nenhum pilar está configurado.

### Histórico Global
- Cartões de streak atual, recorde histórico e consistência média (90 dias).
- Mapa de calor de consistência (heatmap) de 18 semanas, com 5 níveis de intensidade.
- Lista de registros recentes com indicador por pilar.

### Configurações
- Edição de nome do perfil.
- Ativar/desativar cada pilar individualmente.
- CRUD completo de tarefas por pilar (adicionar, editar, remover).
- Zona de risco: reset total dos dados do usuário atual (com confirmação), sem deslogar.

---

## Modelo de dados (localStorage)

```
planohit.db.users               -> [{ id, name, email, passwordHash, createdAt }]

planohit.db.settings.<userId>   -> {
  individual: { enabled: bool, tasks: [{ id, label }] },
  tecnico:    { enabled: bool, tasks: [{ id, label }] },
  humano:     { enabled: bool, tasks: [{ id, label }] }
}

planohit.db.entries.<userId>    -> {
  "YYYY-MM-DD": {
    date: "YYYY-MM-DD",
    pillars: { individual: { taskId: bool }, tecnico: {...}, humano: {...} },
    updatedAt: ISOString
  }
}
```

Sessão (`sessionStorage`, expira ao fechar a aba ou ao vencer o TTL):

```
planohit.session.token -> { token, payload: { sub, email, name, iss, iat, exp } }
planohit.session.user  -> { id, name, email }
```

Regra de consistência: um dia conta para **streak**/nível máximo do **heatmap** quando o score geral daquele dia é **100%** (todas as tarefas de todos os pilares habilitados concluídas).

---

## Sistema de design

- **Paleta**: fundo `#0A0E14`, painéis `#10151F`; cada pilar tem cor própria — Individual (violeta `#7C3AED`), Técnico (ciano `#00D9FF`), Humano (âmbar-coral `#FF6B4A`).
- **Tipografia**: Rajdhani (display/HUD), Inter (corpo), JetBrains Mono (dados/timestamps).
- **Assinatura visual**: cantos de mira (`hud-corner`) nos cards e uma scanline ambiente sutil no fundo — reforçam a leitura de "sistema tático", sem exagero.
- **Responsivo mobile-first**: Tab Bar fixa inferior abaixo de 960px; Sidebar sticky acima disso.
- Suporte a `prefers-reduced-motion` em todas as animações.

---

## Segurança / limitações

Este projeto é **100% front-end**, então:
- O "hash" de senha (`simpleHash`, djb2) **não é criptográfico** — serve apenas para não persistir a senha em texto puro no `localStorage` de uma demo. Em produção, hashing de senha deve sempre acontecer no backend (bcrypt/argon2/scrypt).
- O "JWT" é simulado inteiramente no cliente — não há assinatura verificável por um servidor. Qualquer pessoa com acesso ao DevTools pode inspecionar/editar os dados.
- Todos os dados (usuários, progresso, configurações) ficam **apenas no navegador do próprio usuário** — limpar os dados do site apaga tudo, e não há sincronização entre dispositivos.

Para um SaaS real, a próxima etapa seria substituir `js/storage.js` e `js/auth.js` por chamadas a uma API (mantendo a mesma assinatura de funções), sem precisar tocar em `state.js`, `router.js` ou nas views.

---

## Testes

O fluxo completo (registro → toggle de tarefas → navegação temporal → histórico/heatmap → configurações → persistência via reload → logout/login → validação de formulário) foi validado ponta a ponta com Playwright, cobrindo 28 cenários sem falhas.
