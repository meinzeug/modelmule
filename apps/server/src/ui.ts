export const dashboardHtml = `<!doctype html>
<html lang="en">
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
          <h1>Provider Console</h1>
        </div>
        <nav aria-label="Dashboard sections">
          <a href="#providers">Providers</a>
          <a href="#routing">Routing</a>
          <a href="#usage">Usage</a>
          <a href="#config">Config</a>
        </nav>
        <div class="status-line">
          <span id="server-status" class="dot"></span>
          <span id="server-label">Checking server</span>
        </div>
      </aside>

      <section class="content">
        <div class="topbar">
          <div>
            <p class="eyebrow">Local endpoint</p>
            <p class="endpoint">http://127.0.0.1:43110/v1</p>
          </div>
          <label class="token-field">
            API token
            <input id="api-token" type="password" placeholder="Only required when MODELMULE_API_KEY is set" autocomplete="off" />
          </label>
          <div class="actions">
            <button id="refresh-btn" type="button">Refresh</button>
            <button id="reload-btn" type="button">Reload config</button>
          </div>
        </div>

        <section id="providers" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Backends</p>
              <h2>Providers</h2>
            </div>
          </div>
          <div id="provider-list" class="provider-grid"></div>
          <form id="provider-form" class="form-grid">
            <label>
              Provider ID
              <input name="id" required pattern="[A-Za-z0-9_-]+" placeholder="codex_local" />
            </label>
            <label>
              Template
              <select name="type">
                <option value="codex_cli">Codex CLI</option>
                <option value="claude_cli">Claude CLI</option>
                <option value="shell_command">Shell command</option>
                <option value="ollama">Ollama</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai_compatible">OpenAI-compatible</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <button type="submit">Add provider</button>
          </form>
        </section>

        <section id="routing" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Policy</p>
              <h2>Routing</h2>
            </div>
          </div>
          <form id="route-form" class="inline-form">
            <select name="taskType">
              <option value="coding">coding</option>
              <option value="refactor">refactor</option>
              <option value="debugging">debugging</option>
              <option value="planning">planning</option>
              <option value="cheap-chat">cheap-chat</option>
              <option value="long-context">long-context</option>
              <option value="local-private">local-private</option>
              <option value="premium-reasoning">premium-reasoning</option>
            </select>
            <button type="submit">Inspect route</button>
          </form>
          <pre id="route-output" class="output"></pre>
        </section>

        <section id="usage" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Local store</p>
              <h2>Usage</h2>
            </div>
          </div>
          <div id="usage-grid" class="metrics"></div>
          <pre id="recent-usage-output" class="output compact-output"></pre>
        </section>

        <section id="config" class="panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">YAML source</p>
              <h2>Runtime Config</h2>
            </div>
          </div>
          <p id="config-path" class="muted"></p>
          <div class="actions backup-actions">
            <button id="backup-btn" type="button">Create backup</button>
          </div>
          <div id="backup-list" class="backup-list"></div>
          <pre id="config-output" class="output"></pre>
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
  --bg: #eef1ed;
  --ink: #1c2721;
  --muted: #68756d;
  --panel: #fbfcf8;
  --line: #d7ded6;
  --accent: #226b52;
  --accent-2: #b45f2a;
  --danger: #a13a32;
  --shadow: 0 18px 55px rgba(35, 52, 42, 0.12);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    linear-gradient(120deg, rgba(34, 107, 82, 0.08), transparent 42%),
    repeating-linear-gradient(90deg, rgba(28, 39, 33, 0.04) 0 1px, transparent 1px 36px),
    var(--bg);
  color: var(--ink);
  font-family: "Aptos", "Segoe UI", sans-serif;
}

button,
input,
select {
  font: inherit;
}

button {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 6px;
  cursor: pointer;
}

button.secondary {
  background: transparent;
  color: var(--accent);
}

button.danger {
  border-color: var(--danger);
  background: transparent;
  color: var(--danger);
}

input,
select {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--ink);
  padding: 0 10px;
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
  padding: 28px;
  background: #18231d;
  color: #f4f7ef;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.sidebar h1 {
  margin: 4px 0 28px;
  font-size: 28px;
  line-height: 1.05;
}

.sidebar nav {
  display: grid;
  gap: 8px;
}

.sidebar a {
  color: #dce6dc;
  text-decoration: none;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.content {
  min-width: 0;
  padding: 28px;
  display: grid;
  gap: 18px;
  align-content: start;
}

.topbar,
.panel {
  background: rgba(251, 252, 248, 0.92);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}

.topbar {
  min-height: 86px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
}

.panel {
  padding: 18px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}

.panel h2,
.eyebrow,
.endpoint,
.muted {
  margin: 0;
}

.panel h2 {
  font-size: 22px;
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
  margin-bottom: 10px;
}

.actions,
.inline-form {
  display: flex;
  gap: 10px;
  align-items: center;
}

.token-field {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 13px;
  min-width: min(320px, 100%);
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.provider-card {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
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

.provider-title strong {
  overflow-wrap: anywhere;
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
  border-color: rgba(34, 107, 82, 0.35);
}

.badge.fail {
  color: var(--danger);
  border-color: rgba(161, 58, 50, 0.35);
}

.provider-meta {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.form-grid label {
  display: grid;
  gap: 5px;
  color: var(--muted);
  font-size: 13px;
}

.output {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 14px;
  min-height: 92px;
  font-family: "Aptos Mono", "Cascadia Code", monospace;
  font-size: 13px;
}

.compact-output {
  margin-top: 12px;
  min-height: 64px;
}

.backup-actions {
  margin-bottom: 10px;
}

.backup-list {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
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

.backup-item strong {
  overflow-wrap: anywhere;
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
  background: #18231d;
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

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
    height: auto;
    gap: 20px;
  }

  .topbar,
  .actions,
  .inline-form,
  .form-grid {
    display: grid;
    grid-template-columns: 1fr;
  }
}
`;

export const dashboardJs = `
const state = {
  configPayload: null,
  capabilities: null,
  providers: [],
  usage: null,
  backups: []
};

const $ = (selector) => document.querySelector(selector);

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

function renderProviderList() {
  const list = $('#provider-list');
  const config = state.configPayload ? state.configPayload.config : { providers: {} };
  const healthById = new Map(state.providers.map((item) => [item.id, item]));
  const entries = Object.entries(config.providers || {});

  if (entries.length === 0) {
    list.innerHTML = '<div class="provider-card">No providers configured.</div>';
    return;
  }

  list.innerHTML = entries.map(([id, provider]) => {
    const health = healthById.get(id);
    const healthy = health ? health.healthy : false;
    const models = Array.isArray(provider.models) && provider.models.length > 0 ? provider.models.join(', ') : 'dynamic';
    const command = provider.command ? provider.command + ' ' + (provider.args || []).join(' ') : '';
    return [
      '<article class="provider-card">',
      '<div class="provider-title">',
      '<strong>' + id + '</strong>',
      '<span class="badge ' + (healthy ? 'ok' : 'fail') + '">' + (healthy ? 'healthy' : 'check') + '</span>',
      '</div>',
      '<div class="provider-meta">',
      '<span>type: ' + provider.type + '</span>',
      '<span>priority: ' + provider.priority + '</span>',
      '<span>models: ' + models + '</span>',
      command ? '<span>command: ' + command + '</span>' : '',
      health && health.message ? '<span>' + health.message + '</span>' : '',
      '</div>',
      '<button class="danger" data-delete-provider="' + id + '" type="button">Remove</button>',
      '</article>'
    ].join('');
  }).join('');

  document.querySelectorAll('[data-delete-provider]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-delete-provider');
      await api('/config/provider/' + encodeURIComponent(id), { method: 'DELETE' });
      showToast('Provider removed');
      await loadAll();
    });
  });
}

function renderProviderTemplateOptions() {
  const select = document.querySelector('#provider-form select[name="type"]');
  const labels = {
    codex_cli: 'Codex CLI',
    claude_cli: 'Claude CLI',
    shell_command: 'Shell command',
    ollama: 'Ollama',
    openrouter: 'OpenRouter',
    openai_compatible: 'OpenAI-compatible',
    anthropic: 'Anthropic'
  };
  const templates = state.capabilities && state.capabilities.providerTemplates ? state.capabilities.providerTemplates : [];
  if (templates.length === 0) {
    return;
  }
  select.innerHTML = templates.map((template) => {
    return '<option value="' + template + '">' + (labels[template] || template) + '</option>';
  }).join('');
}

function renderUsage() {
  const usage = state.usage || {};
  const items = [
    ['Requests today', usage.requestsToday ?? 0],
    ['Cost today', '$' + (usage.costTodayUsd ?? 0)],
    ['Fallbacks', usage.fallbacks ?? 0],
    ['Errors', usage.errors ?? 0]
  ];
  $('#usage-grid').innerHTML = items.map(([label, value]) => {
    return '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }).join('');

  $('#recent-usage-output').textContent = JSON.stringify({
    recentRequests: usage.recentRequests || [],
    recentErrors: usage.recentErrors || []
  }, null, 2);
}

function renderConfig() {
  if (!state.configPayload) {
    return;
  }
  $('#config-path').textContent = state.configPayload.path;
  $('#config-output').textContent = JSON.stringify(state.configPayload.config, null, 2);
}

function renderBackups() {
  const list = $('#backup-list');
  if (!state.backups || state.backups.length === 0) {
    list.innerHTML = '<p class="muted">No config backups yet.</p>';
    return;
  }

  list.innerHTML = state.backups.map((backup) => {
    return [
      '<div class="backup-item">',
      '<div><strong>' + backup.name + '</strong><br><span class="muted">' + backup.createdAt + ' · ' + backup.sizeBytes + ' bytes</span></div>',
      '<button class="secondary" data-restore-backup="' + backup.name + '" type="button">Restore</button>',
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
      showToast('Config restored');
      await loadAll();
    });
  });
}

function setServerStatus(ok) {
  $('#server-status').className = 'dot ' + (ok ? 'ok' : 'fail');
  $('#server-label').textContent = ok ? 'Server online' : 'Server unavailable';
}

async function loadAll() {
  try {
    const authStatus = await fetch('/auth/status').then((response) => response.json()).catch(() => ({ required: false }));
    const tokenInput = $('#api-token');
    tokenInput.placeholder = authStatus.required ? 'Required for API operations' : 'Optional';
    await api('/health');
    setServerStatus(true);
    const [capabilitiesPayload, configPayload, providersPayload, usagePayload, backupPayload] = await Promise.all([
      api('/capabilities'),
      api('/config'),
      api('/providers'),
      api('/usage'),
      api('/config/backups')
    ]);
    state.capabilities = capabilitiesPayload;
    state.configPayload = configPayload;
    state.providers = providersPayload.providers || [];
    state.usage = usagePayload;
    state.backups = backupPayload.backups || [];
    renderProviderTemplateOptions();
    renderProviderList();
    renderUsage();
    renderConfig();
    renderBackups();
  } catch (error) {
    setServerStatus(false);
    showToast(error.message);
  }
}

$('#provider-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api('/config/provider', {
    method: 'POST',
    body: JSON.stringify({
      id: String(form.get('id') || '').trim(),
      type: String(form.get('type') || '')
    })
  });
  event.currentTarget.reset();
  showToast('Provider added');
  await loadAll();
});

$('#route-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = await api('/route/test', {
    method: 'POST',
    body: JSON.stringify({ taskType: String(form.get('taskType') || 'coding') })
  });
  $('#route-output').textContent = JSON.stringify(payload, null, 2);
});

$('#refresh-btn').addEventListener('click', () => {
  loadAll();
});

$('#reload-btn').addEventListener('click', async () => {
  await api('/config/reload', { method: 'POST', body: '{}' });
  showToast('Config reloaded');
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
  showToast('Backup created');
  await loadAll();
});

loadAll();
`;
