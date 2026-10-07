const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(files, options = {}) {
  const context = { crypto: globalThis.crypto, Uint8Array, console, ...options };
  vm.createContext(context);
  for (const [file, symbol] of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8') + `\nglobalThis.${symbol} = ${symbol};`, context);
  return context;
}

test('checklist editing preserves quotes as text without creating input attributes', () => {
  const container = { innerHTML: '' };
  const context = load([['js/utils.js', 'Utils'], ['js/components/project.js', 'ProjectComponent']], {
    document: { getElementById: () => container }, Sortable: class { destroy() {} }
  });
  const text = 'Revisar "A & B" y O\'Connor; " autofocus onfocus="alert(1)';
  context.ProjectComponent.editingSubtasks = [{ text, done: true }];
  context.ProjectComponent.renderSubtasksEdit();
  const input = container.innerHTML.match(/<input\b[^>]+>/)[0];
  const value = input.match(/\bvalue="([^"]*)"/)[1];
  assert.ok(value.includes('&quot;A &amp; B&quot;'));
  assert.ok(value.includes('O&#39;Connor'));
  assert.ok(!/\b(?:autofocus|onfocus)=/.test(input.replace(/\bvalue="[^"]*"/, '')));
  assert.equal(context.ProjectComponent.editingSubtasks[0].text, text);
  assert.equal(context.ProjectComponent.editingSubtasks[0].done, true);
});

test('attachment previews preserve quoted names and URLs as attribute values', () => {
  const container = { innerHTML: '' };
  const context = load([['js/utils.js', 'Utils'], ['js/components/project.js', 'ProjectComponent']], { document: { getElementById: () => container } });
  const file = { name: 'Foto "Bomba 1"', type: 'image/png', data: 'https://files.example/image?name="bomba"&size=1' };
  context.ProjectComponent.currentAttachments = [file];
  context.ProjectComponent.renderAttachmentsPreview();
  assert.ok(container.innerHTML.includes('title="Foto &quot;Bomba 1&quot;"'));
  const image = container.innerHTML.match(/<img\b[^>]+>/)[0];
  assert.equal(image.match(/\bsrc="([^"]*)"/)[1], 'https://files.example/image?name=&quot;bomba&quot;&amp;size=1');
  assert.equal(context.ProjectComponent.currentAttachments[0].data, file.data);
});
test('shared data is obtained through the public service without any database read', async () => {
  const calls = [];
  const context = load([['js/services/store.js', 'Store']], {
    db: { ref() { throw new Error('A shared view must not read the database directly'); } },
    AssistantAPI: { async publicRequest(route, options) { calls.push({ route, body: JSON.parse(options.body) }); return { data: { name: 'Shared', tasks: {} } }; } }
  });
  assert.equal((await context.Store.getSharedProjectData('project', 'legacy-token-123')).name, 'Shared');
  assert.deepEqual(calls, [{ route: '/v1/shared-project', body: { projectId: 'project', token: 'legacy-token-123' } }]);
  await assert.rejects(context.Store.getSharedProjectData('project', ''), { status: 404 });
});
test('project creation saves owner, metadata and data in one atomic update with a secure token', async () => {
  const writes = [];
  const context = load([['js/utils.js', 'Utils'], ['js/services/store.js', 'Store']], {
    db: { ref(target) { return { push: () => ({ key: 'newproject' }), async update(value) { writes.push({ target, value }); } }; } },
    Auth: { getCurrentUser: () => ({ uid: 'owner', email: 'owner@example.com' }) }
  });
  context.Store.currentContext.ownerId = 'owner';
  await context.Store.createProject({ name: 'New project' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].target, undefined);
  assert.equal(writes[0].value['project_owners/newproject'].ownerUid, 'owner');
  assert.equal(writes[0].value['users/owner/projects/newproject'].owner, 'owner');
  assert.match(writes[0].value['project_data/newproject'].sharingToken, /^[a-f0-9]{64}$/);
  assert.notEqual(context.Utils.generateSharingToken(), context.Utils.generateSharingToken());
});
test('old edit links always render as read-only and unavailable service is not reported as an expired link', async () => {
  let options;
  const context = load([['js/components/shared.js', 'SharedComponent']], { ProjectComponent: { async render(container, projectId, settings) { options = settings; } } });
  await context.SharedComponent.render({}, 'project', { get: name => name === 'mode' ? 'edit' : 'legacy-token-123' });
  assert.equal(options.isEditable, false);
  const container = {};
  context.SharedComponent.unavailable(container, { status: 503 });
  assert(container.innerHTML.includes('No se pudo abrir el proyecto'));
  context.SharedComponent.unavailable(container, { status: 404 });
  assert(container.innerHTML.includes('Enlace expirado o inválido'));
});

test('read-only views reject management, import and task edits before touching data or opening editors', async () => {
  let warnings=0, prevented=false;
  const context=load([['js/components/project.js','ProjectComponent']], {
    UI: { showToast(message) { assert.match(message,/solo lectura/); warnings++; } },
    document: new Proxy({}, { get() { throw new Error('A read-only action opened an editor'); } }),
    Store: new Proxy({}, { get() { throw new Error('A read-only action accessed a mutation'); } })
  });
  const component=context.ProjectComponent;
  component.isShared=true; component.isEditable=false;
  component.data=[{id:'existing',estado:'Pendiente',subtasks:[{text:'Preserve',done:false}]}];
  await component.toggleSubtaskCheck('existing',0);
  await component.updateStatus('existing','Realizado');
  await component.handleTaskSubmit({preventDefault(){prevented=true;}});
  for(const action of ['openTaskModal','openMoveModal','confirmMoveTask','manageRubros','manageResponsables','openManageModal','editProjectName','rotateLink','saveAsTaskTemplate','deleteTaskTemplate','importFromExcel','handleExcelFile']) await component[action]();
  assert.equal(warnings,15); assert.equal(prevented,true);
  assert.equal(component.data[0].estado,'Pendiente'); assert.equal(component.data[0].subtasks[0].done,false);
});

test('share offers both roles and copies a separate collaborator token in the project route', async () => {
  const modal = { innerHTML: '', classList: { remove() {} } }, links = [];
  const context = load([['js/components/project.js', 'ProjectComponent']], {
    document: { getElementById: () => modal },
    window: { location: { origin: 'https://nexus.example', pathname: '/app/', hash: '#/project/project?workspace=owner' } },
    Store: { currentContext: { role: 'admin' }, getProjectData: async () => ({ sharingToken: 'guest-token-123' }), getCollaboratorToken: async () => 'collaborator-token-123' }
  });
  context.ProjectComponent.projectId = 'project';
  context.ProjectComponent.copyLink = url => links.push(url);
  await context.ProjectComponent.shareProject();
  assert(modal.innerHTML.includes('Colaborador'));
  assert(modal.innerHTML.includes('Visita (Solo lectura)'));
  assert(modal.innerHTML.includes('?mode=readonly&t=guest-token-123'));
  await context.ProjectComponent.copyCollaboratorLink();
  assert.deepEqual(links, ['https://nexus.example/app/#/share/project?mode=edit&t=collaborator-token-123']);
});

test('shared writes use the service, retain stored attachment references and reject other projects and guests', async () => {
  const calls = [], version = 'a'.repeat(64);
  const context = load([['js/services/store.js', 'Store']], {
    db: new Proxy({}, { get() { throw new Error('Shared writes must never reach the database'); } }),
    AssistantAPI: { async publicRequest(route, options) { const body = JSON.parse(options.body); calls.push({ route, body }); return { saved: true, id: body.id, version: 'b'.repeat(64) }; } }
  });
  const attachment = { name: 'Manual', type: 'application/pdf', data: 'https://files.example/manual.pdf' };
  context.Store.sharedAccess = { projectId: 'project', token: 'collaborator-token-123', isEditable: true, data: { tasks: { task: { _version: version, attachments: [attachment] } }, assets: { asset: { _version: version } }, _settingsVersion: version } };
  await context.Store.updateTask('project', 'task', { description: 'Note', confidential: false, attachments: [attachment] });
  assert.equal(calls[0].route, '/v1/shared-project/mutate');
  assert.equal(calls[0].body.expectedVersion, version);
  assert.equal(calls[0].body.changes.confidential, undefined);
  assert.deepEqual(calls[0].body.changes.attachments, [{ existingIndex: 0 }]);
  assert.equal(context.Store.sharedAccess.data.tasks.task._version, 'b'.repeat(64));
  await context.Store.updateRubros('project', ['General']);
  await context.Store.updateAsset('project', 'asset', { name: 'Pump' });
  assert.equal(calls[1].body.operation, 'settings'); assert.equal(calls[2].body.operation, 'asset_update');
  await assert.rejects(context.Store.updateTask('other', 'task', { description: 'Denied' }), /solo lectura/);
  context.Store.sharedAccess.isEditable = false;
  await assert.rejects(context.Store.addTask('project', {}), /solo lectura/);
  await assert.rejects(context.Store.deleteAsset('project', 'asset'), /solo lectura/);
  assert.equal(calls.length, 3);
});

test('shared task editors use server permissions and never trust mode=edit alone', async () => {
  const container = { innerHTML: '' }, data = { name: 'Shared project', rubros: ['General'], responsables: [], tasks: {}, assets: {}, _sharedEditable: false };
  const context = load([['js/utils.js', 'Utils'], ['js/components/project.js', 'ProjectComponent']], {
    localStorage: { getItem: () => null },
    Store: { getSharedProjectData: async () => data },
    IntegrationsComponent: { load: async () => {}, isEnabled: () => false }
  });
  context.ProjectComponent.refreshUI = async () => {};
  context.ProjectComponent.focusTaskFromSession = () => {};
  const params = { get: name => name === 'mode' ? 'edit' : 'guest-token-123' };
  await context.ProjectComponent.render(container, 'project', { isShared: true, isEditable: true, params });
  assert.equal(context.ProjectComponent.isEditable, false);
  assert(!container.innerHTML.includes('onclick="ProjectComponent.openTaskModal()"'));
  data._sharedEditable = true;
  await context.ProjectComponent.render(container, 'project', { isShared: true, isEditable: false, params });
  assert.equal(context.ProjectComponent.isEditable, true);
  assert(container.innerHTML.includes('onclick="ProjectComponent.openTaskModal()"'));
  assert(container.innerHTML.includes('onclick="ProjectComponent.manageRubros()"'));
  assert(!container.innerHTML.includes('id="task-confidential"'));
});

test('opening project or metrics fetches the data once and subsequent refreshes fetch current permissions', async () => {
  for (const isShared of [true, false]) for (const screen of ['render', 'renderMetrics']) {
    let reads = 0;
    let source = { name: 'Project', rubros: ['General'], responsables: [], tasks: { task: { requerimiento: 'Initial task', rubro: 'General' } }, assets: {}, _sharedEditable: true };
    const read = async () => { reads++; return source; };
    const context = load([['js/utils.js', 'Utils'], ['js/components/project.js', 'ProjectComponent']], {
      document: { getElementById: () => null }, localStorage: { getItem: () => null }, setTimeout() {},
      NavbarComponent: { render: () => '' }, IntegrationsComponent: { load: async () => {}, isEnabled: () => false },
      Store: { getProject: async () => ({ name: 'Project' }), getSharedProjectData: read, getProjectData: read }
    });
    const component = context.ProjectComponent;
    component.renderChecklist = () => {};
    component.renderModalOptions = () => {};
    component.renderExportBar = () => {};
    component.focusTaskFromSession = () => {};
    await component[screen]({ innerHTML: '' }, 'project', { isShared, params: { get: key => key === 'mode' ? 'edit' : 'collaborator-token' } });
    assert.equal(reads, 1, `${screen}, shared=${isShared}: opening fetched the same payload again`);
    assert.equal(component.data[0].requerimiento, 'Initial task');
    source = { ...source, _sharedEditable: false, tasks: { task: { requerimiento: 'Changed by another user', rubro: 'General' } } };
    await component.refreshUI();
    assert.equal(reads, 2, 'refresh after an edit must request fresh data');
    assert.equal(component.data[0].requerimiento, 'Changed by another user');
    if (isShared) assert.equal(component.isEditable, false, 'revoked edit permission must be refreshed');
  }
});

test('filtering, sorting and export selection reuse loaded shared tasks and preserve link permissions', async () => {
  let reads = 0;
  const storage = new Map();
  const context = load([['js/utils.js', 'Utils'], ['js/components/project.js', 'ProjectComponent']], {
    document: { getElementById: () => null },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    Store: { getSharedProjectData: async () => { reads++; throw new Error('Unexpected read'); } }
  });
  const component = context.ProjectComponent;
  component.projectId = 'project';
  component.isShared = true;
  component.isEditable = false;
  component.shareToken = 'existing-guest-token';
  component.shareParams = '?mode=readonly&t=existing-guest-token';
  component.data = [{ id: 'task', requerimiento: 'Task', rubro: 'General' }];
  let paints = 0;
  component.renderChecklist = () => { paints++; };
  component.renderModalOptions = () => {};
  component.renderExportBar = () => {};
  component.updateSortUI = () => {};
  component.render = () => { throw new Error('Filtering must not restart shared navigation'); };
  component.setFilter('status', 'Pendiente');
  component.setSort('name');
  component.setSortOrder();
  component.toggleSelectionMode();
  component.toggleTaskSelection('task', true);
  assert.equal(reads, 0);
  assert.equal(paints, 5);
  assert.equal(component.filters.status, 'Pendiente');
  assert(storage.has('project_filters_project'));
  assert(component.selectedTasks.has('task'));
  assert.equal(component.isEditable, false);
  assert.equal(component.shareToken, 'existing-guest-token');
  assert.equal(component.shareParams, '?mode=readonly&t=existing-guest-token');
});

test('loading fallback does not reopen a guest project while its first load is still running', async () => {
  const timers = [];
  const loading = { style: { display: 'block' }, classList: { add() {} } }, app = { classList: { remove() {} } };
  const context = load([['js/app.js', 'App']], {
    console: { log() {}, warn() {} }, window: { addEventListener() {} }, auth: {}, Auth: { init() {} },
    setTimeout(callback) { timers.push(callback); },
    document: { addEventListener() {}, getElementById: id => id === 'loading-screen' ? loading : app }
  });
  let routes = 0, finish;
  const pending = new Promise(resolve => { finish = resolve; });
  context.App.handleRoute = async () => { routes++; await pending; };
  await context.App.init();
  const authCallback = context.App.onAuthStateChanged(null);
  assert.equal(routes, 1);
  timers[0](); // The first public response takes longer than the 1.5s fallback.
  assert.equal(routes, 1, 'the guest load must not be started a second time');
  finish();
  await authCallback;
});
