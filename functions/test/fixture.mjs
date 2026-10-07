import { NexusError } from '../src/validation.mjs';
export class MemoryRepository {
  constructor() {
    this.data = { admin_map: { 'alice@example,com': { owner: true } }, users: { alice: { projects: { personal: { owner: 'alice', name: 'Personal', status: 'active' } } }, bob: { projects: { bobproject: { owner: 'bob', name: 'Privado', status: 'active' } } }, owner: { config: { companyName: 'GABSA', admins: { 'alice@example,com': { email: 'alice@example.com' } } }, projects: { maintenance: { owner: 'owner', name: 'Mantenimiento', status: 'active' }, archived: { owner: 'owner', status: 'inactive' } } } }, project_data: { maintenance: { rubros: ['Seguridad', 'General'], responsables: ['Pablo'], sharingToken: 'NEVER-RETURN-THIS', tasks: { existing: { requerimiento: 'Preservar adjuntos', description: '', rubro: 'Seguridad', responsable: 'Pablo', prioridad: 'Media', estado: 'Pendiente', attachments: [{ content: 'PRIVATE-BINARY' }], comments: [{ text: 'Conservar' }], recurrence: { type: 'none' } } } }, personal: { rubros: ['General'], responsables: [], tasks: {} }, bobproject: { tasks: {} } } };
    this.data.project_owners = { maintenance: { ownerUid: 'owner' }, archived: { ownerUid: 'owner' }, personal: { ownerUid: 'alice' }, bobproject: { ownerUid: 'bob' } };
    this.users = new Map(['alice', 'bob', 'owner'].map(uid => [uid, { uid, email: `${uid}@example.com`, emailVerified: true, disabled: false }]));
    this.documents = new Map();
  }
  async get(path) { return structuredClone(path.split('/').reduce((value, key) => value?.[key], this.data) ?? null); }
  async getUser(uid) { return this.users.get(uid); }
  async verifyFirebase(token) { if (token === 'firebase-alice-token-for-tests') return { uid: 'alice' }; if (token === 'firebase-bob-token-for-tests') return { uid: 'bob' }; throw new NexusError(401, 'invalid_token', 'Sesión inválida.'); }
  async privateGet(collection, id) { return structuredClone(this.documents.get(`${collection}/${id}`) ?? null); }
  async privatePut(collection, id, data) { this.documents.set(`${collection}/${id}`, structuredClone(data)); }
  async privateTransaction(collection, id, change) { const value = change(await this.privateGet(collection, id)); await this.privatePut(collection, id, value); return value; }
  async updateRoot(changes) { for (const [path, value] of Object.entries(changes)) { const parts = path.split('/'), key = parts.pop(); const parent = parts.reduce((object, part) => object[part] ||= {}, this.data); parent[key] = structuredClone(value); } }
  async transaction(path, change) { const parts = path.split('/'), key = parts.pop(); const parent = parts.reduce((object, part) => object[part] ||= {}, this.data); const value = change(structuredClone(parent[key] || null)); parent[key] = structuredClone(value); return structuredClone(value); }
  async privateConsume(collection, id, predicate) { const key = `${collection}/${id}`, data = this.documents.get(key); if (!data || !predicate(data)) return null; this.documents.delete(key); return structuredClone(data); }
  async privateList(collection, uid) { return [...this.documents].filter(([key, value]) => key.startsWith(`${collection}/`) && value.uid === uid).map(([key, value]) => ({ id: key.split('/')[1], ...structuredClone(value) })); }
  async taskTransaction(projectId, taskId, change) { const tasks = this.data.project_data[projectId].tasks ||= {}; const value = change(structuredClone(tasks[taskId] || null)); tasks[taskId] = structuredClone(value); return structuredClone(value); }
  async tasksTransaction(projectId, change) { const value = change(structuredClone(this.data.project_data[projectId].tasks || {})); this.data.project_data[projectId].tasks = structuredClone(value); return structuredClone(value); }
}
export const config = { baseUrl: 'https://nexus.example', webUrl: 'https://nexus.example/app/' };
export async function grant(repo, { uid = 'alice', workspaceIds = ['owner'], scopes = ['tasks:read', 'tasks:write'], id = 'grant-test' } = {}) { await repo.privatePut('grants', id, { uid, workspaceIds, scopes, expiresAt: Date.now() + 86400_000 }); return { uid, grantId: id, scopes }; }
