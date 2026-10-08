import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { MemoryRepository, config } from './fixture.mjs';
import { ProjectFiles } from '../src/project-files.mjs';
import { collaboratorLink } from '../src/collaborator-links.mjs';
import { sharedProject } from '../src/shared-project.mjs';
import { createApp } from '../src/app.mjs';

async function setup() {
  const repo = new MemoryRepository(), objects = new Map(), reads = [];
  repo.saveFile = async (key, bytes) => objects.set(key, Buffer.from(bytes));
  repo.readFile = async key => { reads.push(key); return objects.get(key); };
  repo.data.project_data.maintenance.sharingToken = 'visitor-token-123';
  const { token } = await collaboratorLink(repo, 'maintenance', 'owner');
  const files = new ProjectFiles(repo, config);
  const input = { projectId: 'maintenance', name: 'foto.png', type: 'image/png', data: Buffer.from('verified file bytes').toString('base64') };
  const saved = await files.upload({ ...input, token });
  const download = { projectId: 'maintenance', fileId: saved.url.split('/').pop() };
  return { repo, files, objects, reads, token, input, saved, download };
}

test('owner, authorized admin and collaborator can upload; visitors and strangers cannot', async () => {
  const { files, input, token, objects } = await setup();
  await files.upload(input, { uid: 'owner' });
  await files.upload(input, { uid: 'alice' });
  await files.upload({ ...input, token });
  const count = objects.size;
  for (const [value, actor, code] of [[{ ...input, token: 'visitor-token-123' }, null, 'read_only_link'], [input, { uid: 'bob' }, 'access_denied'], [input, null, 'invalid_token'], [{ ...input, token: 'invalid-token-123' }, null, 'shared_link_unavailable']]) {
    await assert.rejects(files.upload(value, actor), { code });
  }
  assert.equal(objects.size, count);
});

test('visitors can read attached files but not confidential, deleted, removed or unlinked files', async () => {
  const { repo, files, reads, token, saved, download } = await setup();
  const visitor = { ...download, token: 'visitor-token-123' };
  await assert.rejects(files.download(visitor), { code: 'file_unavailable' });
  assert.equal(reads.length, 0);
  assert.equal((await files.download({ ...download, token })).bytes.toString(), 'verified file bytes');
  const item = repo.data.project_data.maintenance.tasks.existing;
  item.attachments = [{ data: saved.url }];
  assert.equal((await files.download(visitor)).bytes.toString(), 'verified file bytes');
  item.confidential = true;
  const count = reads.length;
  await assert.rejects(files.download(visitor), { code: 'file_unavailable' });
  await assert.rejects(files.download({ ...download, token }), { code: 'file_unavailable' });
  item.confidential = false; item.rubro = 'Eliminado';
  await assert.rejects(files.download(visitor), { code: 'file_unavailable' });
  item.rubro = 'General'; item.attachments = [];
  await assert.rejects(files.download(visitor), { code: 'file_unavailable' });
  assert.equal(reads.length, count);
  assert.equal((await files.download(download, { uid: 'owner' })).bytes.toString(), 'verified file bytes');
});

test('current tokens, project ownership, archive status and asset visibility apply to files', async () => {
  const { repo, files, token, saved, download, input } = await setup();
  repo.data.project_data.maintenance.assets = { pump: { image: saved.url, documents: [] } };
  assert.equal((await files.download({ ...download, token: 'visitor-token-123' })).bytes.toString(), 'verified file bytes');
  repo.data.project_data.maintenance.assets.pump.confidential = true;
  await assert.rejects(files.download({ ...download, token }), { code: 'file_unavailable' });
  repo.data.project_data.maintenance.sharingToken = 'rotated-token-123';
  await assert.rejects(files.download({ ...download, token }), { code: 'shared_link_unavailable' });
  await assert.rejects(files.download({ ...download, token: 'visitor-token-123' }), { code: 'shared_link_unavailable' });
  repo.data.users.owner.projects.maintenance.status = 'inactive';
  await assert.rejects(files.upload(input, { uid: 'owner' }), { code: 'archived_project' });
  await assert.rejects(files.download({ ...download, projectId: 'bobproject' }, { uid: 'owner' }), { code: 'access_denied' });
});

test('recurring visible copies preserve access and corrupted binaries are rejected', async () => {
  const { repo, files, objects, saved, download } = await setup();
  repo.data.project_data.maintenance.tasks.existing = { confidential: true, attachments: [{ data: saved.url }] };
  repo.data.project_data.maintenance.tasks.recurring = { rubro: 'General', attachments: [{ data: saved.url }] };
  const visitor = { ...download, token: 'visitor-token-123' };
  assert.equal((await files.download(visitor)).bytes.toString(), 'verified file bytes');
  for (const key of objects.keys()) objects.set(key, Buffer.from('corrupt'));
  await assert.rejects(files.download(visitor), { code: 'file_integrity_failed' });
});

test('HTTP keeps stored URLs private, authenticates requests and sends safe binary types', async t => {
  const { repo, saved, download, token, input } = await setup();
  repo.data.project_data.maintenance.tasks.existing.attachments = [{ data: saved.url }];
  const server = createApp(repo, config).listen(0, '127.0.0.1');
  await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + new URL(saved.url).pathname)).status, 403);
  assert.equal((await post('/v1/project-files/download', download)).status, 401);
  const response = await post('/v1/project-files/download', { ...download, token: 'visitor-token-123' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'verified file bytes');
  assert.equal((await post('/v1/project-files/upload', { ...input, token: 'visitor-token-123' })).status, 403);
  const html = await post('/v1/project-files/upload', { ...input, token, name: 'unsafe.html', type: 'text/html' });
  const htmlSaved = await html.json();
  const binary = await post('/v1/project-files/download', { projectId: 'maintenance', fileId: htmlSaved.url.split('/').pop(), token });
  assert.equal(binary.headers.get('content-type'), 'application/octet-stream');
});

test('invalid shared links are denied before loading any project payload', async () => {
  const { repo } = await setup();
  const get = repo.get.bind(repo), reads = [];
  repo.get = async path => { reads.push(path); return get(path); };
  await assert.rejects(sharedProject(repo, { projectId: 'maintenance', token: 'wrong-token-123' }));
  assert(!reads.includes('project_data/maintenance'));
});
