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
