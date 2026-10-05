import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { z } from 'zod';
import { createTaskSchema, updateTaskSchema } from '../src/validation.mjs';
import { NexusService } from '../src/nexus-service.mjs';
import { nextOccurrence } from '../src/task-model.mjs';
import { createApp } from '../src/app.mjs';
import { openapi } from '../src/openapi.mjs';
import { MemoryRepository, config, grant } from './fixture.mjs';
import { linked } from './oauth-fixture.mjs';

const now = new Date('2026-10-05T01:00:00Z'); // Still October 4 in Buenos Aires.
async function setup() {
  const repo = new MemoryRepository();
  repo.data.project_data.maintenance.assets = { pump: { name: 'Bomba 1' } };
  return { repo, service: new NexusService(repo, config.webUrl, () => now), actor: await grant(repo) };
}
const complete = () => ({
  requerimiento: 'Prueba completa', description: 'Todos los campos del formulario', rubro: 'General', responsable: 'Pablo', prioridad: 'Alta', confidential: true,
  estado: 'En Proceso', assetId: 'pump', start_date: '2026-10-01', start_time: '09:15', deadline: '2026-10-09', time: '18:30',
  real_start_date: '2026-10-02', end_date: '', resources: 2, costo: 1250.75, hh_estimated: 17.5, hh_executed: 3.25,
  subtasks: Array.from({ length: 5 }, (_, i) => ({ text: `Punto ${i + 1}`, done: i === 0 })),
  recurrence: { type: 'weekly', days: [0, 4] }, attachments: [{ name: 'prueba.txt', type: 'text/plain', data: 'data:text/plain;base64,SG9sYQ==' }]
});

test('create, edit and REST contracts cover every field saved by the Nexus form', async () => {
  const source = await readFile(new URL('../../js/components/project.js', import.meta.url), 'utf8');
  const body = source.match(/const taskData = \{([\s\S]*?)\n        \};/)[1];
  const fields = [...body.matchAll(/^ {12}(\w+):/gm)].map(match => match[1]).sort();
  const spec = openapi(config.baseUrl);
  const path = '/v1/workspaces/{workspaceId}/projects/{projectId}/tasks';
  for (const properties of [
    z.toJSONSchema(createTaskSchema, { io: 'input' }).properties,
    z.toJSONSchema(updateTaskSchema, { io: 'input' }).properties,
    spec.paths[path].post.requestBody.content['application/json'].schema.properties.task.properties,
    spec.paths[`${path}/{taskId}`].patch.requestBody.content['application/json'].schema.properties.changes.properties
  ]) assert.deepEqual(Object.keys(properties).sort(), fields);
  assert.equal(fields.length, 21);
});

test('complete task round trip, ordered checklist and asset lookup preserve all supplied values', async () => {
  const { repo, service, actor } = await setup();
  assert.deepEqual((await service.details(actor, 'owner', 'maintenance')).assets, [{ id: 'pump', name: 'Bomba 1' }]);
  const input = complete();
  const first = await service.createTask(actor, 'owner', 'maintenance', input, 'complete-create-12345');
  const stored = repo.data.project_data.maintenance.tasks[first.task.id];
  for (const [key, value] of Object.entries(input)) assert.deepEqual(stored[key], value, key);
  const read = await service.task(actor, 'owner', 'maintenance', first.task.id);
  for (const [key, value] of Object.entries(input)) if (key !== 'attachments') assert.deepEqual(read[key], value, key);
  assert.deepEqual(read.attachments, [{ existingIndex: 0, name: 'prueba.txt', type: 'text/plain' }]);
  assert.ok(!JSON.stringify(read).includes('SG9sYQ=='));
  assert.deepEqual((await service.tasks(actor, 'owner', 'maintenance')).tasks.find(task => task.id === read.id), read);
  const changes = { ...input, estado: 'Suspendido', deadline: '', time: '', start_date: '', start_time: '', resources: 0, costo: 0, assetId: '', recurrence: { type: 'none' }, subtasks: [...input.subtasks].reverse(), attachments: read.attachments };
  const edited = await service.updateTask(actor, 'owner', 'maintenance', read.id, changes, read.version, 'complete-update-12345');
  for (const [key, value] of Object.entries(changes)) if (key !== 'attachments') assert.deepEqual(edited.task[key], value, key);
  assert.deepEqual(repo.data.project_data.maintenance.tasks[read.id].attachments, input.attachments);
});

test('attachment references preserve stored files while adding, reordering and removing attachments', async () => {
  const { repo, service, actor } = await setup();
  const before = await service.task(actor, 'owner', 'maintenance', 'existing');
  const original = structuredClone(repo.data.project_data.maintenance.tasks.existing.attachments[0]);
  const newFile = { name: 'nuevo.pdf', type: 'application/pdf', data: 'https://files.example/nuevo.pdf' };
  const added = await service.updateTask(actor, 'owner', 'maintenance', 'existing', { attachments: [newFile, ...before.attachments] }, before.version, 'attachment-add-12345');
  assert.deepEqual(repo.data.project_data.maintenance.tasks.existing.attachments, [newFile, original]);
  assert.equal(repo.data.project_data.maintenance.tasks.existing.comments[0].text, 'Conservar');
  await assert.rejects(service.updateTask(actor, 'owner', 'maintenance', 'existing', { attachments: [{ existingIndex: 99 }] }, added.task.version, 'attachment-bad-12345'), { code: 'unknown_attachment' });
  await assert.rejects(service.updateTask(actor, 'owner', 'maintenance', 'existing', { attachments: [{ existingIndex: 0 }, { existingIndex: 0 }] }, added.task.version, 'attachment-dup-12345'), { code: 'invalid_input' });
  const cleared = await service.updateTask(actor, 'owner', 'maintenance', 'existing', { attachments: [], subtasks: [] }, added.task.version, 'attachment-clear-12345');
  assert.deepEqual(cleared.task.attachments, []);
  assert.deepEqual(repo.data.project_data.maintenance.tasks.existing.attachments, []);
});

test('invalid extended fields and assets from another project leave the task unchanged', async () => {
  const { repo, service, actor } = await setup();
  const before = await service.task(actor, 'owner', 'maintenance', 'existing');
  const invalid = [{ assetId: 'not-in-this-project' }, { start_time: '24:00' }, { time: '11:60' }, { real_start_date: '2026-02-30' }, { resources: -1 }, { resources: 1.5 }, { costo: -0.01 }, { hh_estimated: -1 }, { subtasks: [{ text: '<script>', done: false }] }, { recurrence: { type: 'weekly', days: [] } }, { recurrence: { type: 'weekly', days: [0, 0] } }, { recurrence: { type: 'monthly', monthlyType: 'relative', week: 6, dayOfWeek: 1 } }, { attachments: [{ name: 'bad', type: 'text/plain', data: 'javascript:alert(1)' }] }, { attachments: [{ name: 'bad', type: 'text/plain', data: 'data:text/plain;base64,invalid!' }] }];
  for (const changes of invalid) await assert.rejects(service.updateTask(actor, 'owner', 'maintenance', 'existing', changes, before.version, 'invalid-fields-12345'), { status: 400 });
  assert.equal((await service.task(actor, 'owner', 'maintenance', 'existing')).version, before.version);
  assert.equal((await repo.privateList('audit', actor.uid)).length, 0);
});

test('calculated hours and real dates respect explicit values and zero resources', async () => {
  const { service, actor } = await setup();
  const created = await service.createTask(actor, 'owner', 'maintenance', { requerimiento: 'Horas', rubro: 'General', start_date: '2026-10-01', deadline: '2026-10-02', resources: 2, estado: 'En Proceso' }, 'hours-create-12345');
  assert.equal(created.task.hh_estimated, 32);
  assert.equal(created.task.real_start_date, '2026-10-04');
  const edited = await service.updateTask(actor, 'owner', 'maintenance', created.task.id, { resources: 0, real_start_date: '2026-10-01', estado: 'Realizado' }, created.task.version, 'hours-update-12345');
  assert.equal(edited.task.hh_estimated, 0);
  assert.equal(edited.task.hh_executed, 0);
  assert.equal(edited.task.end_date, '2026-10-04');
  const explicit = await service.updateTask(actor, 'owner', 'maintenance', created.task.id, { resources: 3, end_date: '2026-10-02', hh_estimated: 2.5, hh_executed: 1.25 }, edited.task.version, 'hours-explicit-12345');
  assert.equal(explicit.task.hh_estimated, 2.5);
  assert.equal(explicit.task.hh_executed, 1.25);
});

test('recurring completion schedules exactly once and recovers a failed audit write', async () => {
  const { repo, service, actor } = await setup();
  const created = await service.createTask(actor, 'owner', 'maintenance', { ...complete(), estado: 'Pendiente' }, 'recurrence-create-12345');
  const put = repo.privatePut.bind(repo);
  let fail = true;
  repo.privatePut = async (collection, id, data) => { if (collection === 'audit' && fail) { fail = false; throw new Error('Temporary audit failure'); } return put(collection, id, data); };
  const args = [actor, 'owner', 'maintenance', created.task.id, { estado: 'Realizado' }, created.task.version, 'recurrence-complete-12345'];
  await assert.rejects(service.updateTask(...args));
  const saved = await service.updateTask(...args);
  const again = await service.updateTask(...args);
  assert.deepEqual(saved, again);
  assert.equal(saved.task.estado, 'Realizado');
  assert.equal(saved.nextTask.estado, 'Pendiente');
  assert.equal(saved.nextTask.deadline, '2026-10-12');
  assert.equal(saved.nextTask.start_date, '2026-10-04');
  assert.ok(saved.nextTask.subtasks.every(point => point.done === false));
  assert.equal(saved.nextTask.attachments.length, 1);
  assert.equal(Object.keys(repo.data.project_data.maintenance.tasks).length, 3);
  const second = await service.updateTask(actor, 'owner', 'maintenance', created.task.id, { estado: 'Realizado' }, saved.task.version, 'recurrence-already-12345');
  assert.equal(second.nextTask, undefined);
  assert.equal(Object.keys(repo.data.project_data.maintenance.tasks).length, 3);
});

test('recurring tasks can start or suspend without scheduling; conflicting completion is atomic', async () => {
  const { repo, service, actor } = await setup();
  repo.data.project_data.maintenance.tasks.existing.recurrence = { type: 'daily' };
  const before = await service.task(actor, 'owner', 'maintenance', 'existing');
  const started = await service.updateTask(actor, 'owner', 'maintenance', 'existing', { estado: 'En Proceso' }, before.version, 'recurring-start-12345');
  assert.equal(started.task.real_start_date, '2026-10-04');
  await assert.rejects(service.updateTask(actor, 'owner', 'maintenance', 'existing', { estado: 'Realizado' }, before.version, 'recurring-stale-12345'), { code: 'version_conflict' });
  assert.equal(Object.keys(repo.data.project_data.maintenance.tasks).length, 1);
  const results = await Promise.allSettled(['one', 'two'].map(name => service.updateTask(actor, 'owner', 'maintenance', 'existing', { estado: 'Realizado' }, started.task.version, `recurring-parallel-${name}`)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(repo.data.project_data.maintenance.tasks).length, 2);
});

test('recurrence follows calendar boundaries, weekdays, last weekday and completion-based intervals', () => {
  for (const [deadline, recurrence, expected] of [
    ['2026-01-31', { type: 'monthly', monthlyType: 'fixed', day: 31 }, '2026-02-28'],
    ['2026-12-31', { type: 'monthly', monthlyType: 'relative', week: 5, dayOfWeek: 4 }, '2027-01-29'],
    ['2026-01-31', { type: 'monthly', monthlyType: 'relative', week: 2, dayOfWeek: 1 }, '2026-02-10'],
    ['2024-02-29', { type: 'yearly' }, '2025-02-28'],
    ['2026-12-31', { type: 'daily' }, '2027-01-01'],
    ['2026-10-02', { type: 'weekly', days: [0, 4] }, '2026-10-05'],
    ['2026-01-01', { type: 'periodic', interval: 10 }, '2026-10-14']
  ]) assert.equal(nextOccurrence({ deadline, recurrence }, now).deadline, expected);
});

test('real MCP exposes and saves every field, including attachments larger than the previous body limit', async t => {
  const { repo, tokens } = await linked();
  repo.data.project_data.maintenance.assets = { pump: { name: 'Bomba 1' } };
  const server = createApp(repo, config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${tokens.access_token}` };
  let id = 1;
  async function invoke(method, params) {
    const response = await fetch(`${base}/mcp`, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
    assert.equal(response.status, 200);
    return (await response.json()).result;
  }
  const list = await invoke('tools/list', {});
  for (const [name, field] of [['create_task', 'task'], ['update_task', 'changes']]) assert.deepEqual(Object.keys(list.tools.find(tool => tool.name === name).inputSchema.properties[field].properties).sort(), Object.keys(complete()).sort());
  const input = complete();
  input.attachments[0].data = `data:text/plain;base64,${Buffer.alloc(150_000, 65).toString('base64')}`;
  const first = await invoke('tools/call', { name: 'create_task', arguments: { workspaceId: 'owner', projectId: 'maintenance', task: input, requestId: 'full-mcp-create-12345' } });
  assert.equal(first.isError, undefined);
  assert.equal(first.structuredContent.saved, true);
  assert.equal(first.structuredContent.task.subtasks.length, 5);
  assert.equal(first.structuredContent.task.hh_estimated, 17.5);
  const task = first.structuredContent.task;
  const edited = await invoke('tools/call', { name: 'update_task', arguments: { workspaceId: 'owner', projectId: 'maintenance', taskId: task.id, changes: { costo: 42, subtasks: [...task.subtasks, { text: 'Punto 6', done: true }], attachments: task.attachments }, expectedVersion: task.version, requestId: 'full-mcp-edit-12345' } });
  assert.equal(edited.structuredContent.task.costo, 42);
  assert.equal(edited.structuredContent.task.subtasks.length, 6);
  assert.equal(repo.data.project_data.maintenance.tasks[task.id].attachments[0].data, input.attachments[0].data);
  assert.ok(!JSON.stringify(edited).includes(input.attachments[0].data));
  const response = await fetch(`${base}/v1/workspaces/owner/projects/maintenance/tasks/${task.id}`, { headers });
  assert.equal((await response.json()).costo, 42);
});
