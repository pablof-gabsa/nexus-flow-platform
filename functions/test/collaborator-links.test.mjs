import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { MemoryRepository, config } from './fixture.mjs';
import { collaboratorLink, mutateSharedProject } from '../src/collaborator-links.mjs';
import { sharedProject } from '../src/shared-project.mjs';
import { version } from '../src/validation.mjs';
import { createApp } from '../src/app.mjs';

async function setup() {
  const repo = new MemoryRepository(), data = repo.data.project_data.maintenance;
  data.sharingToken = 'guest-token-123';
  data.tasks.existing.attachments = [{ name: 'Manual', type: 'application/pdf', data: 'https://files.example/manual.pdf', privateMetadata: 'KEEP-METADATA' }];
  data.tasks.private = { requerimiento: 'HIDDEN-TASK', confidential: true };
  data.tasks.deleted = { requerimiento: 'DELETED-TASK', rubro: 'Eliminado' };
  data.assets = { visible: { name: 'Pump', image: '', documents: [] }, hidden: { name: 'HIDDEN-ASSET', confidential: true } };
  const { token } = await collaboratorLink(repo, 'maintenance', 'owner');
  return { repo, token, invoke: (changes = {}) => mutateSharedProject(repo, { projectId: 'maintenance', token, requestId: 'operation-request-123', operation: 'task_update', id: 'existing', expectedVersion: version(data.tasks.existing), changes: { description: 'Updated' }, ...changes }) };
}

test('project owners and authorized admins can recopy a stable, separate collaborator link', async () => {
  const { repo, token } = await setup();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, repo.data.project_data.maintenance.sharingToken);
  assert.equal((await collaboratorLink(repo, 'maintenance', 'alice')).token, token);
  await assert.rejects(collaboratorLink(repo, 'maintenance', 'bob'), { status: 403 });
  const guest = await sharedProject(repo, { projectId: 'maintenance', token: 'guest-token-123' });
  const editor = await sharedProject(repo, { projectId: 'maintenance', token });
  assert.equal(guest.readOnly, true); assert.equal(editor.readOnly, false);
  assert.equal(guest.data.tasks.existing._version, undefined);
  assert.equal(editor.data.tasks.existing._version, version(repo.data.project_data.maintenance.tasks.existing));
  for (const marker of ['HIDDEN-TASK', 'HIDDEN-ASSET', 'DELETED-TASK', 'KEEP-METADATA', token, 'guest-token-123']) assert(!JSON.stringify(editor).includes(marker));
});

test('guest links, forged projects, guessed private items and confidential changes cannot write', async () => {
  const { repo, invoke } = await setup();
  const original = structuredClone(repo.data);
  for (const input of [
    { token: 'guest-token-123' }, { token: 'wrong-token-123' }, { projectId: 'bobproject' },
    { id: 'private' }, { id: 'deleted' }, { changes: { confidential: false } },
    { changes: { _assistantOperation: { id: 'forged' } } }, { changes: { assetId: 'hidden' } },
    { operation: 'asset_update', id: 'hidden', changes: { name: 'Leaked' } }
  ]) await assert.rejects(invoke(input));
  assert.deepEqual(repo.data, original);
});

test('task changes preserve attachments, comments, other projects and private tasks and detect conflicts', async () => {
  const { repo, invoke } = await setup();
  const original = structuredClone(repo.data), before = version(repo.data.project_data.maintenance.tasks.existing);
  const result = await invoke({ changes: { description: 'A note', subtasks: [{ text: 'Check pump', done: true }], attachments: [{ existingIndex: 0 }], estado: 'En Proceso' } });
  assert.equal(result.saved, true);
  const task = repo.data.project_data.maintenance.tasks.existing;
  assert.equal(task.description, 'A note'); assert.equal(task.subtasks[0].done, true);
  assert(task.real_start_date); assert.equal(task.attachments[0].privateMetadata, 'KEEP-METADATA');
  assert.deepEqual(task.comments, original.project_data.maintenance.tasks.existing.comments);
  assert.deepEqual(repo.data.project_data.bobproject, original.project_data.bobproject);
  assert.deepEqual(repo.data.project_data.maintenance.tasks.private, original.project_data.maintenance.tasks.private);
  await assert.rejects(invoke({ requestId: 'operation-request-456', expectedVersion: before }), { code: 'version_conflict' });
});

test('create retries do not duplicate tasks and recurrent completion schedules one successor', async () => {
  const { repo, invoke } = await setup();
  const input = { operation: 'task_create', id: undefined, expectedVersion: undefined, changes: { requerimiento: 'Repeat', rubro: 'General', deadline: '2026-10-07', recurrence: { type: 'daily' } } };
  const created = await invoke(input);
  assert.deepEqual(await invoke(input), created);
  await assert.rejects(invoke({ ...input, changes: { requerimiento: 'Different', rubro: 'General' } }), { code: 'request_id_reused' });
  const complete = { requestId: 'complete-request-123', id: created.id, expectedVersion: created.version, changes: { estado: 'Realizado' } };
  const completed = await invoke(complete);
  assert.deepEqual(await invoke(complete), completed);
  const tasks = Object.entries(repo.data.project_data.maintenance.tasks).filter(([id]) => id.startsWith('shared_next_'));
  assert.equal(tasks.length, 1); assert.equal(tasks[0][1].deadline, '2026-10-08'); assert.equal(tasks[0][1].estado, 'Pendiente');
});

test('collaborators retain areas, responsible names, asset groups, asset documents and project names', async () => {
  const { repo, token, invoke } = await setup();
  const view = await sharedProject(repo, { projectId: 'maintenance', token });
  const settings = await invoke({ operation: 'settings', id: undefined, expectedVersion: view.data._settingsVersion, changes: { rubros: ['General', 'New area', 'Realizados', 'Eliminado'], responsables: ['New person'], assetCategories: ['Equipment'], assetSubcategories: { Equipment: ['Pump'] } } });
  assert.equal(settings.saved, true); assert.equal(repo.data.project_data.maintenance.responsables[0], 'New person');
  const created = await invoke({ requestId: 'create-asset-request', operation: 'asset_create', id: undefined, expectedVersion: undefined, changes: { name: 'New pump', documents: [{ name: 'Manual', type: 'application/pdf', data: 'https://files.example/new.pdf' }] } });
  const updated = await invoke({ requestId: 'update-asset-request', operation: 'asset_update', id: created.id, expectedVersion: created.version, changes: { serviceStatus: 'Fuera de servicio', documents: [{ existingIndex: 0 }] } });
  assert.equal(repo.data.project_data.maintenance.assets[created.id].documents[0].name, 'Manual');
  await invoke({ requestId: 'delete-asset-request', operation: 'asset_delete', id: created.id, expectedVersion: updated.version, changes: undefined });
  assert.equal(repo.data.project_data.maintenance.assets[created.id], undefined);
  await invoke({ requestId: 'rename-project-request', operation: 'rename', id: undefined, expectedVersion: undefined, changes: { name: 'Renamed' } });
  assert.equal(repo.data.users.owner.projects.maintenance.name, 'Renamed');
  assert.equal(repo.data.project_data.maintenance.name, 'Renamed');
});

test('rotating the guest link invalidates both links and archived projects reject edits', async () => {
  const { repo, token, invoke } = await setup();
  repo.data.project_data.maintenance.sharingToken = 'rotated-token-123';
  await assert.rejects(sharedProject(repo, { projectId: 'maintenance', token }), { status: 404 });
  await assert.rejects(invoke(), { status: 404 });
  const replacement = await collaboratorLink(repo, 'maintenance', 'owner');
  assert.notEqual(replacement.token, token);
  repo.data.users.owner.projects.maintenance.status = 'inactive';
  assert.equal((await sharedProject(repo, { projectId: 'maintenance', token: replacement.token })).readOnly, true);
  await assert.rejects(invoke({ token: replacement.token }), { code: 'archived_project' });
});

test('HTTP activation requires a permitted verified account and mutation enforces link authority', async t => {
  const { repo, token } = await setup();
  const server = createApp(repo, config).listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, bearer) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/v1/projects/maintenance/collaborator-link', {})).status, 401);
  assert.equal((await post('/v1/projects/maintenance/collaborator-link', {}, 'firebase-bob-token-for-tests')).status, 403);
  const activation = await post('/v1/projects/maintenance/collaborator-link', {}, 'firebase-alice-token-for-tests');
  assert.equal(activation.status, 200); assert.equal((await activation.json()).token, token);
  const body = { projectId: 'maintenance', token, operation: 'task_update', id: 'existing', expectedVersion: version(repo.data.project_data.maintenance.tasks.existing), requestId: 'http-request-12345', changes: { description: 'HTTP edit' } };
  assert.equal((await post('/v1/shared-project/mutate', { ...body, token: 'guest-token-123' })).status, 403);
  assert.equal((await post('/v1/shared-project/mutate', body)).status, 200);
  assert.equal((await post('/v1/shared-project/mutate', { ...body, operation: 'task_delete' })).status, 400);
});
