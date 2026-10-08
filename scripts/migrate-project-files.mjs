// Run deliberately with --apply. Backups and checkpoints contain private data.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { setDefaultAutoSelectFamily } from 'node:net';
import { createRequire } from 'node:module';
import { separateInlineFiles, digest, jsonBytes } from '../tests/loading-trial-files.mjs';
import { canonical } from '../functions/src/validation.mjs';

// Keep Windows dual-stack connection probes from timing out against Hosting.
setDefaultAutoSelectFamily(false);

const options = Object.fromEntries(process.argv.slice(2).map(value => { const i = value.indexOf('='); return i < 0 ? [value.slice(2), true] : [value.slice(2, i), value.slice(i + 1)]; }));
if (!options.apply || !options['firebase-tools']) throw new Error('Use --apply --firebase-tools=<installed firebase-tools/lib/api.js>');
const project = 'nexus-flow-6dac7', database = `https://${project}-default-rtdb.firebaseio.com`, bucket = `${project}.firebasestorage.app`, base = `https://${project}.web.app`;
const firestore = `https://firestore.googleapis.com/v1/projects/${project}/databases/nexus-assistants/documents`;
const directory = resolve(options.state || '.firebase/files-migration');
mkdirSync(directory, { recursive: true });
const statePath = join(directory, 'state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { project, startedAt: new Date().toISOString(), databaseBytes: 0, storageUploadedBytes: 0, storageVerifiedBytes: 0, objects: {}, projects: {} };
if (state.project !== project) throw new Error('Checkpoint belongs to another Firebase project');
const budget = Number(options['max-database-mb'] || 250) * 1024 * 1024;
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
save();
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const firebaseApi = require(options['firebase-tools']);
const cli = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
let authorization, expiresAt = 0;
async function auth() {
  if (authorization && expiresAt > Date.now()) return authorization;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: firebaseApi.clientId(), client_secret: firebaseApi.clientSecret(), grant_type: 'refresh_token', refresh_token: cli.tokens.refresh_token }), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Authorization unavailable (${response.status})`);
  authorization = (await response.json()).access_token; expiresAt = Date.now() + 50 * 60_000;
  return authorization;
}
async function remote(url, method = 'GET', body, headers = {}) {
  return fetch(url, { method, headers: { Authorization: `Bearer ${await auth()}`, ...(!(body instanceof Buffer) && body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body === undefined ? {} : { body: body instanceof Buffer ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
}
async function db(path, method = 'GET', body, headers = {}) {
  if (state.databaseBytes >= budget) throw new Error('Database transfer budget exhausted; resume only after reviewing the checkpoint');
  const response = await remote(`${database}/${path}.json`, method, body, headers);
  const reader = response.body.getReader(), chunks = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    state.databaseBytes += value.length;
    if (state.databaseBytes > budget) { await reader.cancel(); save(); throw new Error('Database transfer budget reached'); }
    chunks.push(Buffer.from(value));
  }
  save();
  const value = JSON.parse(Buffer.concat(chunks).toString());
  if (!response.ok && response.status !== 412) throw new Error(`Database ${method} failed (${response.status})`);
  return { status: response.status, value, etag: response.headers.get('etag') };
}
async function checked(url, method = 'GET', body, headers) {
  const response = await remote(url, method, body, headers);
  if (!response.ok) throw new Error(`Cloud ${method} failed (${response.status})`);
  return response;
}
const policy = await (await checked(`https://storage.googleapis.com/storage/v1/b/${bucket}/iam`)).json();
if ((policy.bindings || []).some(binding => (binding.members || []).some(member => ['allUsers', 'allAuthenticatedUsers'].includes(member)))) throw new Error('Storage has public IAM access; migration stopped');
const owners = (await db('project_owners')).value || {};
const ids = options.project ? [options.project] : Object.keys(owners);
for (const id of ids) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !owners[id]?.ownerUid) throw new Error('Invalid project ownership');
  if (state.projects[id]?.completed) { console.log(JSON.stringify({ projectId: id, alreadyCompleted: true })); continue; }
  const owner = owners[id].ownerUid;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(owner)) throw new Error('Invalid owner ID');
  const metadata = (await db(`users/${owner}/projects/${id}`)).value;
  if (metadata?.owner !== owner) { console.log(JSON.stringify({ projectId: id, skipped: 'missing_project_metadata' })); continue; }
  const snapshot = await db(`project_data/${id}`, 'GET', undefined, { 'X-Firebase-ETag': 'true' });
  const source = snapshot.value;
  if (!source) continue;
  if (!snapshot.etag) throw new Error('Database did not return an ETag; migration stopped');
  const backupName = `${id}-${digest(snapshot.etag).slice(0, 12)}.json`;
  if (!existsSync(join(directory, backupName))) writeFileSync(join(directory, backupName), JSON.stringify(source));
  state.projects[id] = { backup: backupName, sourceHash: digest(canonical(source)), tokenHash: digest(source.sharingToken || ''), tasks: Object.keys(source.tasks || {}).length, assets: Object.keys(source.assets || {}).length, sourceBytes: jsonBytes(source), etag: snapshot.etag, completed: false };
  save();
  const verified = new Map();
  const keyHashes = new Map();
  const { data, files } = await separateInlineFiles(source, {
    save: async (key, bytes, type) => {
      const hash = digest(bytes), objectKey = `project-files/${id}/${hash}`;
      keyHashes.set(key, hash);
      const checkpointKey = `${id}_${hash}`;
      if (!state.objects[checkpointKey]) {
        const upload = await remote(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectKey)}&ifGenerationMatch=0&predefinedAcl=private`, 'POST', bytes, { 'Content-Type': type });
        if (!upload.ok && upload.status !== 412) throw new Error(`Private object upload failed (${upload.status})`);
        if (upload.ok) { state.storageUploadedBytes += bytes.length; state.objects[checkpointKey] = { objectKey, generation: (await upload.json()).generation, size: bytes.length, sha256: hash, type, verified: false }; save(); }
      }
      if (!verified.has(hash)) {
        if (!state.objects[checkpointKey]?.verified) {
          const stored = Buffer.from(await (await checked(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectKey)}?alt=media`)).arrayBuffer());
          state.storageVerifiedBytes += stored.length; save();
          if (stored.length !== bytes.length || digest(stored) !== hash) throw new Error('Stored file checksum mismatch; original retained');
          state.objects[checkpointKey] = { ...state.objects[checkpointKey], objectKey, size: bytes.length, sha256: hash, type, verified: true }; save();
        }
        verified.set(hash, bytes);
      }
    },
    read: async key => verified.get(keyHashes.get(key)),
    urlFor: file => `${base}/v1/project-files/${id}/${file.hash}`
  });
  if (!files.length) { state.projects[id].completed = true; state.projects[id].fileCount = 0; state.projects[id].optimizedBytes = jsonBytes(source); save(); continue; }
  for (const [hash, bytes] of verified) {
    const file = files.find(value => value.hash === hash);
    await checked(`${firestore}/nexus_assistant_files/${id}_${hash}`, 'PATCH', { fields: { projectId: { stringValue: id }, objectKey: { stringValue: `project-files/${id}/${hash}` }, sha256: { stringValue: hash }, size: { integerValue: String(bytes.length) }, type: { stringValue: file.type }, name: { stringValue: 'adjunto' }, createdAt: { integerValue: String(Date.now()) } } });
  }
  if (digest(data.sharingToken || '') !== state.projects[id].tokenHash || Object.keys(data.tasks || {}).length !== state.projects[id].tasks || Object.keys(data.assets || {}).length !== state.projects[id].assets) throw new Error('Identity preservation check failed');
  const result = await db(`project_data/${id}`, 'PUT', data, { 'If-Match': snapshot.etag });
  if (result.status === 412) { state.projects[id].conflict = true; save(); console.log(JSON.stringify({ projectId: id, concurrentChange: true, originalRetained: true })); continue; }
  if (digest(canonical(result.value)) !== digest(canonical(data))) throw new Error('Database write receipt mismatch');
  Object.assign(state.projects[id], { completed: true, fileCount: files.length, uniqueFiles: verified.size, optimizedBytes: jsonBytes(result.value), completedAt: new Date().toISOString() });
  save();
  console.log(JSON.stringify({ projectId: id, completed: true, files: files.length, beforeBytes: state.projects[id].sourceBytes, afterBytes: state.projects[id].optimizedBytes, linksPreserved: true, databaseBytesSoFar: state.databaseBytes }));
}
state.completedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ completedProjects: Object.values(state.projects).filter(value => value.completed).length, conflicts: Object.values(state.projects).filter(value => !value.completed).length, files: Object.values(state.projects).reduce((n, value) => n + (value.fileCount || 0), 0), beforeBytes: Object.values(state.projects).reduce((n, value) => n + value.sourceBytes, 0), afterBytes: Object.values(state.projects).reduce((n, value) => n + (value.optimizedBytes || value.sourceBytes), 0), databaseBytes: state.databaseBytes, storageUploadedBytes: state.storageUploadedBytes, storageVerifiedBytes: state.storageVerifiedBytes }));
