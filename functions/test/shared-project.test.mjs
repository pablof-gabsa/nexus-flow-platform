import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { MemoryRepository, config, grant } from './fixture.mjs';
import { sharedProject } from '../src/shared-project.mjs';
import { createApp } from '../src/app.mjs';
import { NexusService } from '../src/nexus-service.mjs';

const setup = () => {
  const repo = new MemoryRepository();
  const data = repo.data.project_data.maintenance;
  data.sharingToken = 'legacy-token-123';
  data.tasks.private = { requerimiento: 'HIDDEN-TASK', confidential: true, attachments: [{ data: 'HIDDEN-FILE' }] };
  data.tasks.deleted = { requerimiento: 'TRASH-TASK', rubro: 'Eliminado' };
  data.tasks.existing._assistantOperation = { fingerprint: 'PRIVATE-OPERATION' };
  data.tasks.existing.createdBy = 'PRIVATE-AUTHOR';
  data.assets = { visible: { name: 'Public asset', documents: [{ name: 'Manual', data: 'PUBLIC-DOCUMENT' }], owner: 'PRIVATE-METADATA' }, private: { name: 'HIDDEN-ASSET', confidential: true } };
  return repo;
};

test('shared response preserves public content and excludes private tasks, files and metadata', async () => {
  const repo = setup();
  const result = await sharedProject(repo, { projectId: 'maintenance', token: 'legacy-token-123' });
  assert.equal(result.readOnly, true);
  assert.equal(result.data.tasks.existing.requerimiento, 'Preservar adjuntos');
  assert.equal(result.data.assets.visible.documents[0].data, 'PUBLIC-DOCUMENT');
  for (const value of ['HIDDEN-TASK', 'HIDDEN-FILE', 'TRASH-TASK', 'HIDDEN-ASSET', 'PRIVATE-OPERATION', 'PRIVATE-AUTHOR', 'PRIVATE-METADATA', 'legacy-token-123', 'sharingToken', 'ownerUid']) assert(!JSON.stringify(result).includes(value));
});

test('wrong or rotated tokens and missing ownership all return the same unavailable-link error', async () => {
  const repo = setup();
  const input = { projectId: 'maintenance', token: 'legacy-token-123' };
  await assert.rejects(sharedProject(repo, { ...input, token: 'wrong-token-123' }), { code: 'shared_link_unavailable' });
  repo.data.project_data.maintenance.sharingToken = 'rotated-token-123';
  await assert.rejects(sharedProject(repo, input), { code: 'shared_link_unavailable' });
  repo.data.project_data.maintenance.sharingToken = input.token;
  repo.data.project_owners.maintenance.ownerUid = 'bob';
  await assert.rejects(sharedProject(repo, input), { code: 'shared_link_unavailable' });
});

test('a forged project entry cannot grant assistant access to another owner data', async () => {
  const repo = setup();
  const actor = await grant(repo);
  repo.data.users.owner.projects.bobproject = { owner: 'owner', name: 'Forged' };
  const service = new NexusService(repo, config.webUrl);
  await assert.rejects(service.tasks(actor, 'owner', 'bobproject'), { code: 'project_not_found' });
  assert(!(await service.projects(actor, 'owner')).projects.some(project => project.id === 'bobproject'));
});

test('HTTP shared links require a token, have no edit mode, and expose no public write route', async t => {
  const server = createApp(setup(), config).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/v1/shared-project`;
  const invoke = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await invoke({ projectId: 'maintenance', token: 'legacy-token-123' })).status, 200);
  assert.equal((await invoke({ projectId: 'maintenance' })).status, 400);
  assert.equal((await invoke({ projectId: 'maintenance', token: 'legacy-token-123', mode: 'edit' })).status, 400);
  assert.equal((await fetch(url, { method: 'PATCH' })).status, 404);
  assert.equal((await invoke({ projectId: 'maintenance', token: 'wrong-token-123' })).status, 404);
});
