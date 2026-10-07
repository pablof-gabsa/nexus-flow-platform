import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { idSchema, hash, version, canonical, parse, NexusError, createTaskSchema, updateTaskSchema, attachmentData, newAttachment, attachmentReference, attachments } from './validation.mjs';
import { taskChanges, nextOccurrence } from './task-model.mjs';
import { NexusService } from './nexus-service.mjs';

export const sameToken = (left, right) => typeof left === 'string' && typeof right === 'string' && timingSafeEqual(Buffer.from(hash(left), 'hex'), Buffer.from(hash(right), 'hex'));
const unavailable = () => new NexusError(404, 'shared_link_unavailable', 'El enlace expiró o no es válido.');
const text = z.string().max(10000).refine(value => !/[<>]/.test(value), 'Usar texto plano');
const labels = z.array(text.pipe(z.string().trim().min(1).max(150))).max(500);
const assetFields = { name: text.pipe(z.string().trim().min(1).max(300)), description: text, category: text, subcategory: text, serviceStatus: z.enum(['En servicio', 'Fuera de servicio']), image: z.union([z.literal(''), attachmentData]), documents: attachments(z.union([newAttachment, attachmentReference])) };
const settingsSchema = z.object({ rubros: labels.optional(), responsables: labels.optional(), assetCategories: labels.optional(), assetSubcategories: z.record(z.string().max(150).refine(key => !/[<>]/.test(key)), labels).optional() }).strict().refine(value => Object.keys(value).length > 0);
export const sharedMutationSchema = z.object({
  projectId: idSchema, token: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/), requestId: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  operation: z.enum(['task_create', 'task_update', 'asset_create', 'asset_update', 'asset_delete', 'settings', 'rename']),
  id: idSchema.optional(), expectedVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(), changes: z.record(z.string(), z.unknown()).optional()
}).strict();

export async function projectForLink(repo, projectId) {
  const owner = await repo.get(`project_owners/${projectId}`);
  if (!owner?.ownerUid || !idSchema.safeParse(owner.ownerUid).success) throw unavailable();
  const project = await repo.get(`users/${owner.ownerUid}/projects/${projectId}`);
  if (!project || project.owner !== owner.ownerUid) throw unavailable();
  return { ownerUid: owner.ownerUid, project };
}

export async function collaboratorLink(repo, projectId, uid) {
  parse(idSchema, projectId);
  const { ownerUid, project } = await projectForLink(repo, projectId);
  await new NexusService(repo, '').project({ uid }, ownerUid, projectId, true);
  if (project.status === 'inactive') throw new NexusError(409, 'archived_project', 'Abrí el proyecto archivado antes de compartirlo para editar.');
  const readToken = await repo.get(`project_data/${projectId}/sharingToken`);
  if (typeof readToken !== 'string') throw unavailable();
  const readTokenHash = hash(readToken);
  const link = await repo.privateTransaction('collaborator_links', projectId, current => current?.ownerUid === ownerUid && current.readTokenHash === readTokenHash ? current : { ownerUid, readTokenHash, token: randomBytes(32).toString('hex') });
  return { token: link.token };
}

export async function linkPermissions(repo, projectId, token, source, ownerUid) {
  if (sameToken(source.sharingToken, token)) return { readOnly: true };
  const link = await repo.privateGet('collaborator_links', projectId);
  if (!link || link.ownerUid !== ownerUid || link.readTokenHash !== hash(source.sharingToken || '') || !sameToken(link.token, token)) throw unavailable();
  return { readOnly: false, link };
}

const visible = value => value && !value.confidential && value.rubro !== 'Eliminado';
const conflict = () => new NexusError(409, 'version_conflict', 'Los datos cambiaron. Actualizá la vista antes de guardar.');
export const settingsVersion = source => version(Object.fromEntries(['rubros', 'responsables', 'assetCategories', 'assetSubcategories'].map(key => [key, source[key] ?? null])));

export async function mutateSharedProject(repo, input, now = new Date()) {
  const { projectId, token, requestId, operation, id, expectedVersion } = input;
  const { ownerUid, project } = await projectForLink(repo, projectId);
  const source = await repo.get(`project_data/${projectId}`);
  if (!source) throw unavailable();
  const access = await linkPermissions(repo, projectId, token, source, ownerUid);
  if (access.readOnly) throw new NexusError(403, 'read_only_link', 'Este enlace es de solo lectura.');
  if (project.status === 'inactive') throw new NexusError(409, 'archived_project', 'El proyecto está archivado.');
  const opId = hash(`${projectId}:${token}:${requestId}`), fingerprint = hash(canonical(input));
  const previous = await repo.privateGet('shared_audit', opId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new NexusError(409, 'request_id_reused', 'Este requestId ya se usó para otra acción.');
    return previous.result;
  }
  let changes;
  const raw = input.changes || {};
  if ('confidential' in raw) throw new NexusError(403, 'confidential_restricted', 'Solo el propietario puede cambiar la confidencialidad.');
  if (operation === 'task_create') changes = parse(createTaskSchema, raw);
  else if (operation === 'task_update') changes = parse(updateTaskSchema, raw);
  else if (operation === 'asset_create') changes = parse(z.object({ ...assetFields, documents: attachments(newAttachment).optional(), name: assetFields.name }).partial().required({ name: true }).strict(), raw);
  else if (operation === 'asset_update') changes = parse(z.object(assetFields).partial().strict().refine(value => Object.keys(value).length > 0), raw);
  else if (operation === 'settings') changes = parse(settingsSchema, raw);
  else if (operation === 'rename') changes = parse(z.object({ name: assetFields.name }).strict(), raw);
  else if (Object.keys(raw).length) throw new NexusError(400, 'invalid_input', 'La eliminación no admite otros cambios.');
  if (['task_update', 'asset_update', 'asset_delete'].includes(operation) && (!id || !expectedVersion)) throw new NexusError(400, 'version_required', 'Actualizá la vista antes de guardar.');
  if (operation === 'rename') {
    // A project link may change its name, but cannot touch workspace settings.
    await repo.updateRoot({ [`users/${ownerUid}/projects/${projectId}/name`]: changes.name, [`project_data/${projectId}/name`]: changes.name });
    const result = { saved: true };
    await repo.privatePut('shared_audit', opId, { projectId, ownerUid, operation, fingerprint, createdAt: now.getTime(), result });
    return result;
  }
  const itemId = operation.endsWith('_create') ? `shared_${opId}` : id;
  let result;
  await repo.transaction(`project_data/${projectId}`, current => {
    // Rotation also invalidates in-flight writes retried by the database.
    if (!current || access.link.readTokenHash !== hash(current.sharingToken || '')) throw unavailable();
    if (operation === 'settings') {
      if (current._sharedSettingsOperation?.id === opId && current._sharedSettingsOperation.fingerprint === fingerprint) { result = { saved: true, version: settingsVersion(current) }; return current; }
      if (settingsVersion(current) !== expectedVersion) throw conflict();
      result = { saved: true, version: settingsVersion({ ...current, ...changes }) };
      return { ...current, ...changes, _sharedSettingsOperation: { id: opId, fingerprint } };
    }
    const tasks = operation.startsWith('task_');
    const field = tasks ? 'tasks' : 'assets';
    const items = { ...(current[field] || {}) }, existing = items[itemId];
    if (existing?._sharedOperation?.id === opId && existing._sharedOperation.fingerprint === fingerprint) { result = { saved: true, id: itemId, version: version(existing) }; return current; }
    if (operation.endsWith('_create')) { if (existing) throw conflict(); }
    else if (!visible(existing)) throw new NexusError(404, 'item_not_found', 'No se encontró el elemento compartido.');
    else if (version(existing) !== expectedVersion) throw conflict();
    if (operation === 'asset_delete') {
      delete items[itemId];
      result = { saved: true, id: itemId };
      return { ...current, [field]: items };
    }
    if (tasks) {
      if (changes.rubro && !(current.rubros || []).includes(changes.rubro) && !['Realizados', 'Eliminado'].includes(changes.rubro)) throw new NexusError(400, 'unknown_rubro', 'Elegí un área del proyecto.');
      if (operation === 'task_create' && changes.rubro === 'Eliminado') throw new NexusError(400, 'unknown_rubro', 'Elegí un área activa.');
      if (changes.assetId && !visible(current.assets?.[changes.assetId])) throw new NexusError(400, 'unknown_asset', 'Elegí un activo compartido de este proyecto.');
    }
    const defaults = tasks ? { estado: 'Pendiente', recurrence: { type: 'none' }, subtasks: [], attachments: [], resources: 1, costo: 0, assetId: '' } : { documents: [], image: '', description: '', category: 'Sin categoria', subcategory: '', serviceStatus: 'En servicio' };
    const base = existing || { ...defaults, createdAt: now.toISOString(), createdBy: 'Colaborador', source: 'shared' };
    const applied = tasks ? taskChanges(base, changes, now) : { ...changes, ...(changes.documents ? { documents: taskChanges({ attachments: base.documents }, { attachments: changes.documents }, now).attachments } : {}) };
    const value = { ...base, ...applied, updatedAt: now.toISOString(), _sharedOperation: { id: opId, fingerprint } };
    if (tasks && changes.estado === 'Realizado' && base.estado !== 'Realizado' && value.recurrence?.type && value.recurrence.type !== 'none') {
      const nextId = `shared_next_${opId}`;
      const next = nextOccurrence(value, now);
      delete next._sharedOperation;
      items[nextId] = { ...next, createdAt: now.toISOString() };
    }
    items[itemId] = value;
    result = { saved: true, id: itemId, version: version(value) };
    return { ...current, [field]: items };
  });
  await repo.privatePut('shared_audit', opId, { projectId, ownerUid, operation, fingerprint, createdAt: now.getTime(), result });
  return result;
}
