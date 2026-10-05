import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, get, set, update, remove, runTransaction } = require('firebase/database');
let environment;
const email = 'a.b.admin@example.com', emailKey = email.replaceAll('.', ',');
const user = (uid = 'admin', options = {}) => environment.authenticatedContext(uid, { email, email_verified: true, ...options }).database();
const fixture = () => ({
  users: {
    owner: { config: { admins: { [emailKey]: true } }, projects: { shared: { name: 'Delegated project', owner: 'owner' } } },
    admin: { projects: { personal: { name: 'Personal', owner: 'admin' } } },
    other: { projects: { foreign: { name: 'Foreign', owner: 'other' } } }
  },
  admin_map: { [emailKey]: { owner: true } },
  project_owners: { shared: { ownerUid: 'owner' }, personal: { ownerUid: 'admin' }, foreign: { ownerUid: 'other' } },
  project_data: {
    shared: { name: 'Delegated project', sharingToken: 'legacy-token-123', tasks: { existing: { requerimiento: 'Preserve', attachments: [{ name: 'Keep' }] } } },
    personal: { name: 'Personal', sharingToken: 'personal-token-123' },
    foreign: { name: 'Foreign', sharingToken: 'foreign-token-123' }
  }
});
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-nexus-security', database: { host: '127.0.0.1', port: 9005, rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8') } });
});
beforeEach(async () => { await environment.clearDatabase(); await environment.withSecurityRulesDisabled(async context => set(ref(context.database()), fixture())); });
after(async () => { await environment?.cleanup(); });

test('unauthenticated users cannot read projects, tasks, tokens or write data', async () => {
  const db = environment.unauthenticatedContext().database();
  for (const path of ['users/owner', 'project_owners/shared', 'project_data/shared', 'project_data/shared/tasks', 'project_data/shared/sharingToken']) await assertFails(get(ref(db, path)));
  await assertFails(set(ref(db, 'project_data/shared/tasks/injected'), { requerimiento: 'Denied' }));
  await assertFails(remove(ref(db, 'project_data/shared')));
});
test('owners and dual-authorized administrators retain their project access', async () => {
  const db = user();
  await assertSucceeds(get(ref(db, 'users/owner/projects')));
  await assertSucceeds(get(ref(db, 'project_data/shared')));
  await assertSucceeds(set(ref(db, 'project_data/shared/tasks/new'), { requerimiento: 'Allowed' }));
  await assertSucceeds(runTransaction(ref(db, 'project_data/shared/tasks'), current => ({ ...(current || {}), imported: { requerimiento: 'Imported' } })));
  const saved = (await get(ref(db, 'project_data/shared/tasks'))).val();
  assert.equal(saved.existing.attachments[0].name, 'Keep');
  await assertSucceeds(update(ref(db, 'users/owner/projects/shared'), { name: 'Renamed' }));
  await assertSucceeds(set(ref(db, 'project_data/personal/tasks/new'), { requerimiento: 'Personal' }));
  await assertSucceeds(set(ref(user('owner'), 'project_data/shared/tasks/owner'), { requerimiento: 'Owner' }));
});
test('unrelated spaces, unverified administrators and anonymous guest identities cannot cross access', async () => {
  for (const db of [user(), user('admin', { email_verified: false }), user('guest', { email: null, email_verified: false })]) {
    await assertFails(get(ref(db, 'project_data/foreign')));
    await assertFails(set(ref(db, 'project_data/foreign/tasks/new'), { requerimiento: 'Denied' }));
  }
  await assertFails(get(ref(user('admin', { email_verified: false }), 'project_data/shared')));
});
test('admins cannot self-grant memberships or modify owner permissions and sharing tokens', async () => {
  const db = user();
  await assertFails(set(ref(db, `admin_map/${emailKey}/other`), true));
  await assertFails(set(ref(db, `users/owner/config/admins/new@example,com`), true));
  await assertFails(set(ref(db, 'project_data/shared/sharingToken'), 'attacker-token-123'));
  await assertFails(remove(ref(db, 'project_data/shared/sharingToken')));
  await assertFails(remove(ref(db, 'project_data/shared')));
  await assertFails(remove(ref(db, 'users/owner/projects/shared')));
  await assertSucceeds(set(ref(user('owner'), 'project_data/shared/sharingToken'), 'rotated-token-123'));
});
test('stale, false or forged maps do not grant membership and revocation takes effect immediately', async () => {
  for (const change of [
    { [`admin_map/${emailKey}/owner`]: false },
    { [`users/owner/config/admins/${emailKey}`]: false },
    { [`users/owner/config/admins/${emailKey}`]: 0 },
    { [`users/owner/config/admins/${emailKey}`]: '' },
    { [`users/owner/config/admins/${emailKey}`]: null },
    { [`admin_map/${emailKey}/owner`]: null }
  ]) {
    await environment.withSecurityRulesDisabled(async context => {
      await set(ref(context.database()), fixture());
      await update(ref(context.database()), change);
    });
    await assertFails(get(ref(user(), 'users/owner')));
    await assertFails(set(ref(user(), 'project_data/shared/tasks/new'), { requerimiento: 'Denied' }));
  }
});
test('legacy membership keeps working while owners can revoke that exact entry', async () => {
  await environment.withSecurityRulesDisabled(async context => update(ref(context.database()), {
    [`admin_map/${emailKey}`]: { ownerId: 'owner' },
    [`users/owner/config/admins/${emailKey}`]: null,
    [`users/owner/authorized_admins/${emailKey}`]: { email }
  }));
  await assertSucceeds(get(ref(user(), 'project_data/shared')));
  await assertSucceeds(remove(ref(user('owner'), `admin_map/${emailKey}/ownerId`)));
  await assertFails(get(ref(user(), 'project_data/shared')));
});
test('existing ownership cannot be reassigned or impersonated through project metadata', async () => {
  const db = user();
  await assertFails(set(ref(db, 'project_owners/foreign'), { ownerUid: 'admin' }));
  await assertFails(remove(ref(db, 'project_owners/personal')));
  await assertFails(set(ref(db, 'users/admin/projects/foreign'), { name: 'Forged', owner: 'admin' }));
  await assertFails(set(ref(db, 'users/owner/projects/shared/owner'), 'admin'));
});
test('atomic project creation works for personal and delegated spaces and rejects forged destinations', async () => {
  for (const ownerUid of ['admin', 'owner']) {
    const projectId = `new_${ownerUid}`;
    await assertSucceeds(update(ref(user()), {
      [`users/${ownerUid}/projects/${projectId}`]: { owner: ownerUid, name: 'New project' },
      [`project_owners/${projectId}`]: { ownerUid },
      [`project_data/${projectId}`]: { name: 'New project', sharingToken: 'new-token-123', rubros: ['General'] }
    }));
    await assertSucceeds(get(ref(user(), `project_data/${projectId}`)));
  }
  await assertFails(update(ref(user()), {
    'users/other/projects/forged': { owner: 'other', name: 'Forged' },
    'project_owners/forged': { ownerUid: 'other' },
    'project_data/forged': { sharingToken: 'forged-token-123' }
  }));
  await assertFails(set(ref(user(), 'project_owners/standalone'), { ownerUid: 'admin' }));
});

test('guest identities retain their own personal projects without gaining delegated access', async () => {
  const db = user('guest', { email: null, email_verified: false });
  await assertSucceeds(update(ref(db), {
    'users/guest/projects/guestproject': { name: 'Personal guest project', owner: 'guest' },
    'project_owners/guestproject': { ownerUid: 'guest' },
    'project_data/guestproject': { name: 'Personal guest project', sharingToken: 'guest-token-123' }
  }));
  await assertSucceeds(get(ref(db, 'project_data/guestproject')));
  await assertFails(get(ref(db, 'project_data/shared')));
});
