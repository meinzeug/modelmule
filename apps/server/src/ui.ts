export const dashboardHtml = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ModelMule</title>
    <link rel="stylesheet" href="/ui/styles.css" />
  </head>
  <body>
    <main class="shell">
      <aside class="sidebar">
        <div>
          <p class="eyebrow">ModelMule</p>
          <h1>Einfaches Setup</h1>
          <p class="sidebar-text">Coding-AIs verbinden, ModelMule routet zentral fur dich.</p>
        </div>
        <nav aria-label="Bereiche">
          <a href="#start">Start</a>
          <a href="#setup">Assistent</a>
          <a href="#providers">Anbieter</a>
          <a href="#coding-ais">Coding AIs</a>
          <a href="#models">Modelle</a>
          <a href="#routing-profiles">Routing</a>
          <a href="#chat">Chat-Test</a>
          <a href="#usage">Nutzung</a>
          <a href="#advanced">Expertenbereich</a>
        </nav>
        <div class="status-line">
          <span id="server-status" class="dot"></span>
          <span id="server-label">Server wird gepruft ...</span>
        </div>
      </aside>

      <section class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Lokaler Endpunkt</p>
            <p class="endpoint">http://127.0.0.1:43110/v1</p>
          </div>
          <label class="token-field">
            Optional: ModelMule API-Token
            <input id="api-token" type="password" placeholder="Nur falls MODELMULE_API_KEY gesetzt ist" autocomplete="off" />
          </label>
          <button id="refresh-btn" type="button">Aktualisieren</button>
        </header>

        <section id="start" class="panel intro-panel">
          <div class="start-layout">
            <div>
              <p class="eyebrow">Start</p>
              <h2>ModelMule verbindet deine Coding-AI mit den passenden Modellen</h2>
              <p class="muted">Waehle einen Anbieter, ein Routing-Profil und dein Coding-Tool. ModelMule stellt danach den lokalen OpenAI-kompatiblen Endpunkt bereit.</p>
            </div>
            <div id="setup-status-grid" class="setup-status-grid"></div>
          </div>
        </section>

        <section id="setup" class="panel setup-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Empfohlen</p>
              <h2>Setup-Assistent</h2>
            </div>
          </div>
          <form id="setup-wizard-form" class="setup-wizard-form">
            <label>
              1. Anbieter
              <select name="presetId"></select>
            </label>
            <label>
              Anzeigename
              <input name="providerId" placeholder="wird automatisch gesetzt" />
            </label>
            <label>
              API-Key, falls noetig
              <input name="apiKey" type="password" placeholder="bei Ollama/LM Studio leer lassen" autocomplete="off" />
            </label>
            <label>
              2. Routing
              <select name="routingProfileId"></select>
            </label>
            <label>
              3. Coding-AI
              <select name="codingToolId"></select>
            </label>
            <button type="submit">Setup anwenden</button>
          </form>
          <div class="connection-help">
            <div>
              <p class="eyebrow">Fuer dein Coding-Tool</p>
              <p class="endpoint">http://127.0.0.1:43110/v1</p>
            </div>
            <button id="copy-endpoint-btn" class="secondary" type="button">Endpoint kopieren</button>
          </div>
          <pre id="tool-command-output" class="output compact-output"></pre>
        </section>

        <section id="coding-ais" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Schritt 1</p>
              <h2>Coding AIs installieren und verbinden</h2>
            </div>
          </div>
          <p class="muted">Hier kannst du Codex, Claude Code, OpenCode oder Aider prufen, installieren und direkt mit ModelMule verbinden. Beim Verbinden wird das Tool automatisch als Coding-Fallback in die Router-Reihenfolge aufgenommen.</p>
          <p class="muted">Wenn ein Coding-Tool ModelMule als KI-Router nutzen soll, trage im Tool als API-Endpunkt http://127.0.0.1:43110/v1 ein. Als API-Key reicht ein Platzhalter wie modelmule, falls das Tool einen Key verlangt.</p>
          <div id="coding-ai-list" class="coding-ai-grid"></div>
          <form id="custom-cli-form" class="custom-cli-form">
            <label>
              Eigener Anbieter-Name
              <input name="id" required pattern="[A-Za-z0-9_-]+" placeholder="z. B. mein_cli_tool" />
            </label>
            <label>
              Befehl
              <input name="command" required placeholder="z. B. my-ai-cli" />
            </label>
            <label>
              Argumente (Komma-getrennt)
              <input name="args" placeholder="z. B. chat, --stdin" />
            </label>
            <label>
              Modellname (optional)
              <input name="model" placeholder="z. B. my-cli-model" />
            </label>
            <button type="submit">Als eigenes Tool verbinden</button>
          </form>
        </section>

        <section id="models" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Modellkatalog</p>
              <h2>Modelle verwalten</h2>
            </div>
          </div>
          <p class="muted">Alle erkannten Modelle mit Markierungen fur kostenlos, lokal, Coding, Reasoning und Geschwindigkeit.</p>
          <div id="model-list" class="model-grid"></div>
        </section>

        <section id="routing-profiles" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Zentrale Steuerung</p>
              <h2>Routing-Profile</h2>
            </div>
          </div>
          <p class="muted">Profile legen fest, welche Provider und Modelle zuerst genutzt werden. Coding-AIs konnen diesen Profilen zugewiesen werden.</p>
          <div id="routing-profile-list" class="profile-grid"></div>
          <form id="tool-assignment-form" class="custom-cli-form">
            <label>
              Coding-AI
              <select name="toolId"></select>
            </label>
            <label>
              Routing-Profil
              <select name="routingProfileId"></select>
            </label>
            <label>
              Aktiv
              <select name="enabled">
                <option value="true">Ja</option>
                <option value="false">Nein</option>
              </select>
            </label>
            <button type="submit">Zuweisung speichern</button>
          </form>
        </section>

        <section id="providers" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Anbieter</p>
              <h2>Anbieter einrichten</h2>
            </div>
          </div>
          <form id="simple-provider-form" class="simple-provider-form">
            <label>
              Name
              <input name="id" required pattern="[A-Za-z0-9_-]+" placeholder="z. B. openrouter_main" />
            </label>
            <label>
              Anbieter
              <select name="type">
                <option value="openrouter">OpenRouter</option>
                <option value="openai_compatible">OpenAI-kompatibel</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama (lokal)</option>
              </select>
            </label>
            <label>
              API-Basis-URL (optional)
              <input name="baseUrl" placeholder="Automatisch passend gesetzt" />
            </label>
            <label>
              Standardmodell (optional)
              <input name="model" placeholder="z. B. openrouter/auto" />
            </label>
            <label>
              API-Key (optional fur Cloud-Anbieter)
              <input name="apiKey" type="password" placeholder="Hier direkt einfugen" autocomplete="off" />
            </label>
            <button type="submit">Anbieter speichern</button>
          </form>
          <div id="provider-list" class="provider-grid"></div>
        </section>

        <section id="chat" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Test</p>
              <h2>Chat testen</h2>
            </div>
          </div>
          <form id="chat-form" class="chat-form">
            <label>
              Modus
              <select name="taskPreset">
                <option value="coding">Code</option>
                <option value="cheap-chat">Alltag</option>
                <option value="local-private">Privat lokal</option>
              </select>
            </label>
            <label class="chat-prompt">
              Deine Nachricht
              <textarea name="prompt" rows="4" required placeholder="Schreibe hier deine Frage ..."></textarea>
            </label>
            <button type="submit">Senden</button>
          </form>
          <pre id="chat-output" class="output compact-output"></pre>
        </section>

        <section id="usage" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Ubersicht</p>
              <h2>Nutzung heute</h2>
            </div>
          </div>
          <div id="usage-grid" class="metrics"></div>
        </section>

        <section id="advanced" class="panel">
          <details>
            <summary>Expertenbereich anzeigen</summary>
            <div class="advanced-grid">
              <button id="reload-btn" type="button">Konfiguration neu laden</button>
              <button id="backup-btn" type="button">Backup erstellen</button>
            </div>
            <p id="config-path" class="muted"></p>
            <div id="backup-list" class="backup-list"></div>
            <pre id="config-output" class="output"></pre>
          </details>
        </section>
      </section>
    </main>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <script src="/ui/app.js"></script>
  </body>
</html>`;

export const dashboardCss = `
:root {
  color-scheme: light;
  --bg: #eef0ec;
  --ink: #1f2c28;
  --muted: #5e6a63;
  --panel: #fcfbf7;
  --line: #d8d4c7;
  --accent: #1f7a62;
  --accent-2: #315f9b;
  --warn: #b05a2a;
  --danger: #ab3d36;
  --shadow: 0 18px 50px rgba(26, 41, 36, 0.14);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: "Aptos", "Segoe UI", sans-serif;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  cursor: pointer;
}

button.secondary {
  background: transparent;
  color: var(--accent);
}

button.danger {
  border-color: var(--danger);
  color: var(--danger);
  background: transparent;
}

input,
select,
textarea {
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
  padding: 0 10px;
}

textarea {
  min-height: 110px;
  padding: 10px;
  resize: vertical;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  overflow: auto;
}

.shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 26px;
  background: #183028;
  color: #edf6f2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.sidebar h1 {
  margin: 4px 0 10px;
  font-size: 30px;
  line-height: 1.05;
}

.sidebar-text {
  margin: 0;
  color: #c6ddd4;
  font-size: 14px;
}

.sidebar nav {
  display: grid;
  gap: 8px;
}

.sidebar a {
  color: #d9ebe4;
  text-decoration: none;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}

.content {
  min-width: 0;
  padding: 26px;
  display: grid;
  gap: 18px;
  align-content: start;
}

.topbar,
.panel {
  background: rgba(252, 251, 247, 0.94);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  border-radius: 12px;
}

.topbar {
  min-height: 88px;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(260px, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 18px;
}

.panel {
  padding: 18px;
}

.start-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 18px;
  align-items: start;
}

.setup-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.setup-step {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 5px;
}

.setup-step strong {
  font-size: 14px;
}

.setup-step.done {
  border-color: rgba(31, 122, 98, 0.35);
}

.setup-wizard-form {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr)) auto;
  gap: 10px;
  align-items: end;
}

.setup-wizard-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.connection-help {
  margin-top: 14px;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.panel-head {
  margin-bottom: 12px;
}

.panel h2,
.eyebrow,
.endpoint,
.muted {
  margin: 0;
}

.panel h2 {
  font-size: 24px;
}

.eyebrow {
  color: var(--accent-2);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.endpoint {
  margin-top: 4px;
  font-family: "Aptos Mono", "Cascadia Code", monospace;
}

.muted {
  color: var(--muted);
}

.token-field,
.simple-provider-form label,
.chat-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.simple-provider-form {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 10px;
  align-items: end;
  margin-bottom: 14px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.coding-ai-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.model-grid,
.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.provider-card {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.provider-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.provider-meta {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 13px;
}

.badge {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 8px;
  color: var(--muted);
  font-size: 12px;
}

.badge.ok {
  color: var(--accent);
  border-color: rgba(31, 122, 98, 0.35);
}

.badge.fail {
  color: var(--danger);
  border-color: rgba(171, 61, 54, 0.35);
}

.badge.warn {
  color: var(--warn);
  border-color: rgba(176, 90, 42, 0.35);
}

.provider-secret-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.provider-actions {
  display: flex;
  gap: 8px;
}

.coding-ai-card {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.model-card,
.profile-card {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  color: var(--muted);
}

.tag.free,
.tag.local {
  color: var(--accent);
  border-color: rgba(31, 122, 98, 0.35);
}

.tag.paid {
  color: var(--warn);
  border-color: rgba(176, 90, 42, 0.35);
}

.coding-ai-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
}

.coding-ai-actions label,
.custom-cli-form label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}

.custom-cli-form {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 10px;
  align-items: end;
}

.chat-form {
  display: grid;
  grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.chat-prompt {
  grid-column: auto;
}

.output {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  min-height: 90px;
  font-family: "Aptos Mono", "Cascadia Code", monospace;
  font-size: 13px;
}

.compact-output {
  margin-top: 12px;
  min-height: 68px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.metric {
  border-left: 3px solid var(--accent);
  background: #fff;
  padding: 14px;
  border-radius: 8px;
}

.metric span {
  display: block;
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
}

.metric strong {
  display: block;
  margin-top: 6px;
  font-size: 22px;
}

.advanced-grid {
  display: flex;
  gap: 10px;
  margin: 10px 0;
}

.backup-list {
  display: grid;
  gap: 8px;
  margin: 10px 0 12px;
}

.backup-item {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #dce6dc;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #c1c9c0;
}

.dot.ok {
  background: #64c18c;
}

.dot.fail {
  background: #e06a5f;
}

.toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  max-width: min(420px, calc(100vw - 44px));
  background: #183028;
  color: #fff;
  padding: 12px 14px;
  border-radius: 8px;
  box-shadow: var(--shadow);
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}

.toast.show {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 980px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
    gap: 20px;
  }

  .topbar,
  .start-layout,
  .setup-status-grid,
  .setup-wizard-form,
  .simple-provider-form,
  .provider-secret-form,
  .chat-form,
  .coding-ai-actions,
  .custom-cli-form {
    grid-template-columns: 1fr;
    display: grid;
  }

  .advanced-grid,
  .connection-help,
  .provider-actions {
    flex-direction: column;
  }
}
`;

export const dashboardJs = `
const state = {
  configPayload: null,
  providers: [],
  usage: null,
  backups: [],
  codingAiTools: [],
  modelCatalog: [],
  routingProfiles: {},
  toolAssignments: {},
  setupStatus: null,
  providerPresets: []
};

const defaultsByType = {
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', isLocal: false },
  openai_compatible: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', isLocal: false },
  anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest', isLocal: false },
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3.1:8b', isLocal: true }
};

const clientEnvHintsByTool = {
  codex: ['OPENAI_BASE_URL=http://127.0.0.1:43110/v1', 'OPENAI_API_KEY=modelmule'],
  opencode: ['OPENAI_BASE_URL=http://127.0.0.1:43110/v1', 'OPENAI_API_KEY=modelmule'],
  aider: ['OPENAI_BASE_URL=http://127.0.0.1:43110/v1', 'OPENAI_API_KEY=modelmule'],
  claude_code: ['ANTHROPIC_BASE_URL=http://127.0.0.1:43110/v1', 'ANTHROPIC_API_KEY=modelmule']
};

const defaultProviderIds = {
  openrouter: 'openrouter_main',
  ollama: 'ollama_local',
  lm_studio: 'lm_studio_local'
};

const tagLabels = {
  free: 'kostenlos',
  paid: 'bezahlt',
  local: 'lokal',
  fast: 'schnell',
  strong: 'stark',
  cheap: 'guenstig',
  coding: 'Coding',
  reasoning: 'Denken',
  experimental: 'experimentell'
};

function presetProviderId(presetId) {
  return defaultProviderIds[presetId] || presetId + '_main';
}

function setSelectValue(select, value) {
  if (!select) {
    return;
  }
  const values = Array.from(select.options).map((option) => option.value);
  if (values.includes(value)) {
    select.value = value;
  }
}

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function optionalString(value) {
  const trimmed = String(value || '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
}

async function api(path, options) {
  const token = localStorage.getItem('modelmule.apiKey') || '';
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-modelmule-api-key': token } : {}),
      ...(options && options.headers ? options.headers : {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body && body.error && body.error.message ? body.error.message : JSON.stringify(body);
    throw new Error(message);
  }
  return body;
}

function setServerStatus(ok) {
  $('#server-status').className = 'dot ' + (ok ? 'ok' : 'fail');
  $('#server-label').textContent = ok ? 'Server online' : 'Server nicht erreichbar';
}

function inferApiKeyEnv(providerId, type) {
  const fixed = {
    openrouter: 'OPENROUTER_API_KEY',
    openai_compatible: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY'
  };
  if (fixed[type]) {
    return fixed[type];
  }
  const normalized = providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return 'MODELMULE_' + (normalized || 'PROVIDER') + '_API_KEY';
}

function providerSecretStorageKey(providerId) {
  return 'modelmule.providerKey.' + providerId;
}

function buildSimpleProvider(form) {
  const id = String(form.elements.id.value || '').trim();
  const type = String(form.elements.type.value || 'openrouter');
  const baseDefaults = defaultsByType[type] || defaultsByType.openrouter;
  const model = optionalString(form.elements.model.value);
  const baseUrl = optionalString(form.elements.baseUrl.value) || baseDefaults.baseUrl;

  const provider = {
    type,
    priority: baseDefaults.isLocal ? 60 : 75,
    models: model ? [model] : [baseDefaults.model],
    baseUrl,
    isLocal: Boolean(baseDefaults.isLocal)
  };

  if (type !== 'ollama') {
    provider.apiKeyEnv = inferApiKeyEnv(id, type);
  }

  return { id, provider };
}

async function applyProviderSecret(providerId, key) {
  await api('/providers/secret', {
    method: 'POST',
    body: JSON.stringify({ id: providerId, apiKey: key })
  });
  localStorage.setItem(providerSecretStorageKey(providerId), key);
}

async function reapplyStoredSecrets() {
  if (!state.configPayload || !state.configPayload.config || !state.configPayload.config.providers) {
    return;
  }

  const entries = Object.entries(state.configPayload.config.providers);
  for (const [providerId, provider] of entries) {
    if (!provider.apiKeyEnv) {
      continue;
    }
    const stored = localStorage.getItem(providerSecretStorageKey(providerId));
    if (!stored) {
      continue;
    }
    try {
      await applyProviderSecret(providerId, stored);
    } catch (_error) {
      // Ignore silently; user can re-enter key.
    }
  }
}

function renderUsage() {
  const usage = state.usage || {};
  const items = [
    ['Anfragen heute', usage.requestsToday ?? 0],
    ['Kosten heute', '$' + (usage.costTodayUsd ?? 0)],
    ['Fallbacks', usage.fallbacks ?? 0],
    ['Fehler', usage.errors ?? 0]
  ];

  $('#usage-grid').innerHTML = items.map(([label, value]) => {
    return '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }).join('');
}

function renderBackups() {
  const list = $('#backup-list');
  if (!state.backups || state.backups.length === 0) {
    list.innerHTML = '<p class="muted">Noch keine Backups vorhanden.</p>';
    return;
  }

  list.innerHTML = state.backups.map((backup) => {
    return [
      '<div class="backup-item">',
      '<div><strong>' + escapeHtml(backup.name) + '</strong><br><span class="muted">' + escapeHtml(backup.createdAt) + '</span></div>',
      '<button class="secondary" data-restore-backup="' + escapeHtml(backup.name) + '" type="button">Wiederherstellen</button>',
      '</div>'
    ].join('');
  }).join('');

  document.querySelectorAll('[data-restore-backup]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.getAttribute('data-restore-backup');
      await api('/config/restore', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      showToast('Backup wiederhergestellt');
      await loadAll();
    });
  });
}

function renderConfig() {
  if (!state.configPayload) {
    return;
  }
  $('#config-path').textContent = state.configPayload.path;
  $('#config-output').textContent = JSON.stringify(state.configPayload.config, null, 2);
}

function updateWizardHints() {
  const form = $('#setup-wizard-form');
  if (!form) {
    return;
  }
  const presetId = String(form.elements.presetId.value || 'openrouter');
  const providerIdInput = form.elements.providerId;
  const apiKeyInput = form.elements.apiKey;
  const toolId = String(form.elements.codingToolId.value || '');
  const preset = (state.providerPresets || []).find((item) => item.id === presetId);

  providerIdInput.placeholder = presetProviderId(presetId);
  apiKeyInput.placeholder = preset && preset.isLocal ? 'nicht noetig' : 'API-Key einfuegen oder leer lassen';

  const hints = clientEnvHintsByTool[toolId] || ['OPENAI_BASE_URL=http://127.0.0.1:43110/v1', 'OPENAI_API_KEY=modelmule'];
  $('#tool-command-output').textContent = [
    'Trage diese Werte in deiner Coding-AI ein:',
    'Base URL: http://127.0.0.1:43110/v1',
    'API-Key: modelmule',
    '',
    'Als Umgebungsvariablen:',
    ...hints
  ].join('\n');
}

function renderSetupAssistant() {
  const status = state.setupStatus || { steps: [] };
  const steps = status.steps || [];
  $('#setup-status-grid').innerHTML = steps.map((step) => {
    return [
      '<div class="setup-step ' + (step.done ? 'done' : '') + '">',
      '<span class="badge ' + (step.done ? 'ok' : 'warn') + '">' + (step.done ? 'fertig' : 'offen') + '</span>',
      '<strong>' + escapeHtml(step.label) + '</strong>',
      '<span class="muted">' + escapeHtml(step.detail || '') + '</span>',
      '</div>'
    ].join('');
  }).join('');

  const form = $('#setup-wizard-form');
  const currentPreset = form.elements.presetId.value || 'openrouter';
  const currentProfile = form.elements.routingProfileId.value || 'free_first';
  const currentTool = form.elements.codingToolId.value || 'codex';
  const providerPresets = (state.providerPresets || []).filter((preset) => preset.type !== 'account_placeholder');
  const profiles = Object.entries(state.routingProfiles || {});

  form.elements.presetId.innerHTML = providerPresets.map((preset) => {
    const suffix = preset.isLocal ? ' lokal' : preset.apiKeyEnv ? ' Cloud' : '';
    return '<option value="' + escapeHtml(preset.id) + '">' + escapeHtml(preset.name + suffix) + '</option>';
  }).join('');
  form.elements.routingProfileId.innerHTML = profiles.map(([id, profile]) => {
    return '<option value="' + escapeHtml(id) + '">' + escapeHtml(profile.name || id) + '</option>';
  }).join('');
  form.elements.codingToolId.innerHTML = ['<option value="">Nur Anbieter einrichten</option>'].concat((state.codingAiTools || []).map((tool) => {
    return '<option value="' + escapeHtml(tool.id) + '">' + escapeHtml(tool.name) + '</option>';
  })).join('');

  setSelectValue(form.elements.presetId, currentPreset);
  setSelectValue(form.elements.routingProfileId, currentProfile);
  setSelectValue(form.elements.codingToolId, currentTool);
  updateWizardHints();
}

function renderModelCatalog() {
  const list = $('#model-list');
  const models = state.modelCatalog || [];
  if (models.length === 0) {
    list.innerHTML = '<div class="model-card">Noch keine Modelle erkannt. Klicke oben auf Aktualisieren.</div>';
    return;
  }

  list.innerHTML = models.map((model) => {
    const tags = (model.tags || []).map((tag) => '<span class="tag ' + escapeHtml(tag) + '">' + escapeHtml(tagLabels[tag] || tag) + '</span>').join('');
    return [
      '<article class="model-card">',
      '<div class="provider-title"><strong>' + escapeHtml(model.model) + '</strong><span class="badge ' + (model.enabled ? 'ok' : 'fail') + '">' + (model.enabled ? 'aktiv' : 'inaktiv') + '</span></div>',
      '<div class="provider-meta">',
      '<span>Provider: ' + escapeHtml(model.providerName || model.providerId) + '</span>',
      '<span>' + (model.free ? 'Kostenlos markiert' : model.local ? 'Lokal' : 'Kostenpflichtig/Unbekannt') + '</span>',
      '</div>',
      '<div class="tag-row">' + tags + '</div>',
      '<button class="secondary" data-toggle-model="' + escapeHtml(model.id) + '" data-next-enabled="' + (!model.enabled) + '" type="button">' + (model.enabled ? 'Modell pausieren' : 'Modell aktivieren') + '</button>',
      '</article>'
    ].join('');
  }).join('');

  document.querySelectorAll('[data-toggle-model]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-toggle-model');
      const enabled = button.getAttribute('data-next-enabled') === 'true';
      await api('/models/catalog/update', {
        method: 'POST',
        body: JSON.stringify({ id, enabled })
      });
      showToast(enabled ? 'Modell aktiviert' : 'Modell pausiert');
      await loadAll();
    });
  });
}

function renderRoutingProfiles() {
  const list = $('#routing-profile-list');
  const profiles = state.routingProfiles || {};
  const entries = Object.entries(profiles);

  if (entries.length === 0) {
    list.innerHTML = '<div class="profile-card">Noch keine Routing-Profile vorhanden.</div>';
  } else {
    list.innerHTML = entries.map(([id, profile]) => {
      const providers = Array.isArray(profile.providerOrder) ? profile.providerOrder.join(' -> ') : '';
      return [
        '<article class="profile-card">',
        '<div class="provider-title"><strong>' + escapeHtml(profile.name || id) + '</strong><span class="badge">' + escapeHtml(profile.mode || 'balanced') + '</span></div>',
        '<div class="provider-meta">',
        '<span>' + escapeHtml(profile.description || '') + '</span>',
        '<span>Provider-Kette: ' + escapeHtml(providers || 'automatisch') + '</span>',
        '<span>Bezahlmodelle: ' + (profile.allowPaid === false ? 'Nein' : 'Ja') + '</span>',
        '</div>',
        '</article>'
      ].join('');
    }).join('');
  }

  const toolSelect = $('#tool-assignment-form select[name="toolId"]');
  const profileSelect = $('#tool-assignment-form select[name="routingProfileId"]');
  toolSelect.innerHTML = (state.codingAiTools || []).map((tool) => {
    return '<option value="' + escapeHtml(tool.id) + '">' + escapeHtml(tool.name) + '</option>';
  }).join('');
  profileSelect.innerHTML = entries.map(([id, profile]) => {
    return '<option value="' + escapeHtml(id) + '">' + escapeHtml(profile.name || id) + '</option>';
  }).join('');
}

function renderCodingAiList() {
  const list = $('#coding-ai-list');
  const tools = state.codingAiTools || [];

  if (tools.length === 0) {
    list.innerHTML = '<div class="coding-ai-card">Keine Coding-AI Tools gefunden.</div>';
    return;
  }

  list.innerHTML = tools
    .map((tool) => {
      const installOptions = (tool.installMethods || [])
        .map((method) => '<option value="' + escapeHtml(method) + '">' + escapeHtml(method) + '</option>')
        .join('');
      const configured = Array.isArray(tool.configuredProviders) && tool.configuredProviders.length > 0
        ? tool.configuredProviders.join(', ')
        : 'noch nicht verbunden';

      return [
        '<article class="coding-ai-card">',
        '<div class="provider-title">',
        '<strong>' + escapeHtml(tool.name) + '</strong>',
        '<span class="badge ' + (tool.installed ? 'ok' : 'fail') + '">' + (tool.installed ? 'installiert' : 'nicht installiert') + '</span>',
        '</div>',
        '<div class="provider-meta">',
        '<span>' + escapeHtml(tool.description || '') + '</span>',
        '<span>Befehl: ' + escapeHtml(tool.command) + (tool.commandPath ? ' (' + escapeHtml(tool.commandPath) + ')' : '') + '</span>',
        '<span>Provider: ' + escapeHtml(configured) + '</span>',
        '<span>API-Key: nicht erforderlich fur die Verbindung als CLI-Provider</span>',
        '<span>Tool-Endpoint: http://127.0.0.1:43110/v1</span>',
        '<span>Tool-API-Key: modelmule (Platzhalter)</span>',
        '<span>Env-Hinweis: ' + escapeHtml((clientEnvHintsByTool[tool.id] || []).join(' | ')) + '</span>',
        '</div>',
        '<form class="coding-ai-actions" data-install-form="' + escapeHtml(tool.id) + '">',
        '<label>Installationsart<select name="method">' + installOptions + '</select></label>',
        '<button type="submit">Installieren</button>',
        '</form>',
        '<form class="coding-ai-actions" data-connect-form="' + escapeHtml(tool.id) + '">',
        '<label>Provider-ID<input name="providerId" placeholder="' + escapeHtml(tool.defaultProviderId || tool.id + '_cli') + '" /></label>',
        '<button type="submit">Mit ModelMule verbinden</button>',
        '</form>',
        '</article>'
      ].join('');
    })
    .join('');

  document.querySelectorAll('[data-install-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const toolId = form.getAttribute('data-install-form');
      const method = String(form.querySelector('select[name="method"]').value || '').trim();
      showToast('Installation lauft ...');
      const result = await api('/tools/coding-ai/install', {
        method: 'POST',
        body: JSON.stringify({ toolId, method })
      });
      if (result.installed) {
        showToast('Installation erfolgreich');
      } else {
        showToast('Installation beendet, bitte Ausgabe im Expertenbereich prufen');
      }
      await loadAll();
    });
  });

  document.querySelectorAll('[data-connect-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const toolId = form.getAttribute('data-connect-form');
      const providerId = optionalString(form.querySelector('input[name="providerId"]').value);
      await api('/tools/coding-ai/connect', {
        method: 'POST',
        body: JSON.stringify({ toolId, providerId })
      });
      showToast('Tool wurde als Provider verbunden und im Coding-Routing eingetragen');
      await loadAll();
    });
  });
}

function renderProviderList() {
  const list = $('#provider-list');
  const config = state.configPayload ? state.configPayload.config : { providers: {} };
  const healthById = new Map(state.providers.map((item) => [item.id, item]));
  const entries = Object.entries(config.providers || {});

  if (entries.length === 0) {
    list.innerHTML = '<div class="provider-card">Noch kein Anbieter eingerichtet.</div>';
    return;
  }

  list.innerHTML = entries.map(([id, provider]) => {
    const health = healthById.get(id);
    const healthy = health ? health.healthy : false;
    const model = Array.isArray(provider.models) && provider.models.length > 0 ? provider.models[0] : 'auto';
    const hasStoredKey = Boolean(localStorage.getItem(providerSecretStorageKey(id)));
    const keyHint = provider.apiKeyEnv
      ? 'API-Key: ' + (hasStoredKey ? 'hinterlegt' : 'fehlt')
      : 'Kein API-Key notwendig';

    return [
      '<article class="provider-card">',
      '<div class="provider-title">',
      '<strong>' + escapeHtml(id) + '</strong>',
      '<span class="badge ' + (healthy ? 'ok' : 'fail') + '">' + (healthy ? 'bereit' : 'prufen') + '</span>',
      '</div>',
      '<div class="provider-meta">',
      '<span>Typ: ' + escapeHtml(provider.type) + '</span>',
      '<span>Modell: ' + escapeHtml(model) + '</span>',
      '<span>' + escapeHtml(keyHint) + '</span>',
      '</div>',
      provider.apiKeyEnv ? (
        '<form class="provider-secret-form" data-provider-secret-form="' + escapeHtml(id) + '">' +
        '<input name="apiKey" type="password" placeholder="API-Key fur ' + escapeHtml(id) + '" autocomplete="off" />' +
        '<button type="submit">API-Key speichern</button>' +
        '</form>'
      ) : '',
      '<div class="provider-actions">',
      '<button class="secondary" data-prioritize-coding="' + escapeHtml(id) + '" type="button">Als Coding-Standard setzen</button>',
      '<button class="danger" data-delete-provider="' + escapeHtml(id) + '" type="button">Entfernen</button>',
      '</div>',
      '</article>'
    ].join('');
  }).join('');

  document.querySelectorAll('[data-provider-secret-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const providerId = form.getAttribute('data-provider-secret-form');
      const apiKey = String(form.querySelector('input[name="apiKey"]').value || '').trim();
      if (!apiKey) {
        showToast('Bitte API-Key eingeben');
        return;
      }
      await applyProviderSecret(providerId, apiKey);
      showToast('API-Key gespeichert');
      await loadAll();
    });
  });

  document.querySelectorAll('[data-delete-provider]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-delete-provider');
      await api('/config/provider/' + encodeURIComponent(id), { method: 'DELETE' });
      localStorage.removeItem(providerSecretStorageKey(id));
      showToast('Anbieter entfernt');
      await loadAll();
    });
  });

  document.querySelectorAll('[data-prioritize-coding]').forEach((button) => {
    button.addEventListener('click', async () => {
      const providerId = button.getAttribute('data-prioritize-coding');
      if (!state.configPayload) {
        return;
      }

      const currentRouting = state.configPayload.config.routing || { defaultMode: 'balanced', privacyMode: false, tasks: {} };
      const currentPrefer = currentRouting.tasks && currentRouting.tasks.coding && Array.isArray(currentRouting.tasks.coding.prefer)
        ? currentRouting.tasks.coding.prefer
        : [];
      const nextPrefer = [providerId, ...currentPrefer.filter((id) => id !== providerId)];

      await api('/config/routing', {
        method: 'POST',
        body: JSON.stringify({
          ...currentRouting,
          tasks: {
            ...(currentRouting.tasks || {}),
            coding: {
              prefer: nextPrefer
            }
          }
        })
      });

      showToast('Coding-Routing: ' + providerId + ' steht jetzt an erster Stelle');
      await loadAll();
    });
  });
}

async function loadAll() {
  try {
    const authStatus = await fetch('/auth/status').then((response) => response.json()).catch(() => ({ required: false }));
    $('#api-token').placeholder = authStatus.required ? 'Erforderlich fur API-Operationen' : 'Optional';

    await api('/health');
    setServerStatus(true);

    const [configPayload, providersPayload, usagePayload, backupPayload, codingAiPayload, modelCatalogPayload, routingProfilesPayload, setupStatusPayload, providerPresetsPayload] = await Promise.all([
      api('/config'),
      api('/providers'),
      api('/usage'),
      api('/config/backups'),
      api('/tools/coding-ai'),
      api('/models/catalog'),
      api('/routing/profiles'),
      api('/setup/status'),
      api('/provider-presets')
    ]);

    state.configPayload = configPayload;
    state.providers = providersPayload.providers || [];
    state.usage = usagePayload;
    state.backups = backupPayload.backups || [];
    state.codingAiTools = codingAiPayload.tools || [];
    state.modelCatalog = modelCatalogPayload.models || [];
    state.routingProfiles = routingProfilesPayload.profiles || {};
    state.toolAssignments = routingProfilesPayload.assignments || {};
    state.setupStatus = setupStatusPayload;
    state.providerPresets = providerPresetsPayload.presets || [];

    await reapplyStoredSecrets();
    renderSetupAssistant();
    renderModelCatalog();
    renderRoutingProfiles();
    renderCodingAiList();
    renderProviderList();
    renderUsage();
    renderConfig();
    renderBackups();
  } catch (error) {
    setServerStatus(false);
    showToast(error.message);
  }
}

$('#simple-provider-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const { id, provider } = buildSimpleProvider(form);
  const enteredKey = optionalString(form.elements.apiKey ? form.elements.apiKey.value : '');

  await api('/config/provider', {
    method: 'POST',
    body: JSON.stringify({ id, provider })
  });

  if (enteredKey && provider.apiKeyEnv) {
    await applyProviderSecret(id, enteredKey);
  }

  form.reset();
  showToast('Anbieter gespeichert');
  await loadAll();
});

$('#setup-wizard-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const providerId = optionalString(form.elements.providerId.value) || presetProviderId(String(form.elements.presetId.value || 'openrouter'));
  const apiKey = optionalString(form.elements.apiKey.value);
  const codingToolId = optionalString(form.elements.codingToolId.value);

  const result = await api('/setup/quickstart', {
    method: 'POST',
    body: JSON.stringify({
      presetId: String(form.elements.presetId.value || 'openrouter'),
      providerId,
      apiKey,
      routingProfileId: String(form.elements.routingProfileId.value || 'free_first'),
      codingToolId
    })
  });

  if (apiKey && result.providerId) {
    localStorage.setItem(providerSecretStorageKey(result.providerId), apiKey);
  }

  form.elements.apiKey.value = '';
  showToast('Setup angewendet');
  await loadAll();
});

$('#setup-wizard-form select[name="presetId"]').addEventListener('change', updateWizardHints);
$('#setup-wizard-form select[name="codingToolId"]').addEventListener('change', updateWizardHints);

$('#copy-endpoint-btn').addEventListener('click', async () => {
  const endpoint = 'http://127.0.0.1:43110/v1';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(endpoint);
    showToast('Endpoint kopiert');
  } else {
    showToast(endpoint);
  }
});

$('#simple-provider-form select[name="type"]').addEventListener('change', (event) => {
  const form = $('#simple-provider-form');
  const type = String(event.currentTarget.value || 'openrouter');
  const defaults = defaultsByType[type] || defaultsByType.openrouter;
  form.elements.baseUrl.placeholder = defaults.baseUrl || 'Automatisch passend gesetzt';
  form.elements.model.placeholder = defaults.model || 'z. B. openrouter/auto';
});

$('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const prompt = String(form.elements.prompt.value || '').trim();
  if (!prompt) {
    return;
  }

  $('#chat-output').textContent = 'Sende Anfrage ...';
  try {
    const payload = await api('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        taskType: String(form.elements.taskPreset.value || 'coding'),
        messages: [{ role: 'user', content: prompt }]
      })
    });

    $('#chat-output').textContent = JSON.stringify({
      antwort: payload.choices && payload.choices[0] ? payload.choices[0].message.content : '',
      modell: payload.model,
      anbieter: payload.metadata && payload.metadata.modelmule ? payload.metadata.modelmule.usedProvider : 'unbekannt'
    }, null, 2);

    await loadAll();
  } catch (error) {
    $('#chat-output').textContent = error.message;
  }
});

$('#refresh-btn').addEventListener('click', () => {
  loadAll();
});

$('#reload-btn').addEventListener('click', async () => {
  await api('/config/reload', { method: 'POST', body: '{}' });
  showToast('Konfiguration neu geladen');
  await loadAll();
});

$('#api-token').addEventListener('change', (event) => {
  const value = event.currentTarget.value.trim();
  if (value) {
    localStorage.setItem('modelmule.apiKey', value);
  } else {
    localStorage.removeItem('modelmule.apiKey');
  }
  loadAll();
});

const storedToken = localStorage.getItem('modelmule.apiKey');
if (storedToken) {
  $('#api-token').value = storedToken;
}

$('#backup-btn').addEventListener('click', async () => {
  await api('/config/backup', { method: 'POST', body: '{}' });
  showToast('Backup erstellt');
  await loadAll();
});

$('#custom-cli-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const id = String(form.elements.id.value || '').trim();
  const command = String(form.elements.command.value || '').trim();
  const args = splitList(form.elements.args.value);
  const model = optionalString(form.elements.model.value) || 'custom-cli-model';

  const provider = {
    type: 'shell_command',
    command,
    args,
    timeoutMs: 600000,
    priority: 60,
    models: [model],
    isLocal: true
  };

  await api('/config/provider', {
    method: 'POST',
    body: JSON.stringify({ id, provider })
  });

  form.reset();
  showToast('Eigenes Tool verbunden');
  await loadAll();
});

$('#tool-assignment-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const toolId = String(form.elements.toolId.value || '').trim();
  const routingProfileId = String(form.elements.routingProfileId.value || '').trim();
  const enabled = String(form.elements.enabled.value || 'true') === 'true';

  await api('/tools/coding-ai/assign', {
    method: 'POST',
    body: JSON.stringify({
      toolId,
      assignment: {
        enabled,
        routingProfileId
      }
    })
  });

  showToast('Routing-Profil wurde der Coding-AI zugewiesen');
  await loadAll();
});

loadAll();
`;
