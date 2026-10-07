import { z } from 'zod';
import { idSchema, version, NexusError } from './validation.mjs';
import { linkPermissions, settingsVersion } from './collaborator-links.mjs';

export const sharedProjectSchema = z.object({
  projectId: idSchema,
  token: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/)
}).strict();

const pick = (value, fields) => Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const unavailable = () => new NexusError(404, 'shared_link_unavailable', 'El enlace expiró o no es válido.');
const attachment = value => pick(value, ['name', 'type', 'data', 'url', 'size']);
const taskFields = ['requerimiento', 'description', 'rubro', 'responsable', 'prioridad', 'deadline', 'estado', 'start_date', 'real_start_date', 'end_date', 'resources', 'hh_estimated', 'hh_executed', 'assetId'];

export async function sharedProject(repo, { projectId, token }) {
  const owner = await repo.get(`project_owners/${projectId}`);
  if (!owner?.ownerUid || !idSchema.safeParse(owner.ownerUid).success) throw unavailable();
  const project = await repo.get(`users/${owner.ownerUid}/projects/${projectId}`);
  if (!project || project.owner !== owner.ownerUid) throw unavailable();
  const source = await repo.get(`project_data/${projectId}`);
  if (!source) throw unavailable();
  const { readOnly } = await linkPermissions(repo, projectId, token, source, owner.ownerUid);
  const tasks = Object.fromEntries(Object.entries(source.tasks || {}).filter(([, task]) => task && !task.confidential && task.rubro !== 'Eliminado').map(([id, task]) => [id, {
    ...pick(task, taskFields),
    ...(!readOnly ? { ...pick(task, ['start_time', 'time', 'costo']), _version: version(task) } : {}),
    ...(task.recurrence ? { recurrence: pick(task.recurrence, ['type', 'days', 'monthlyType', 'day', 'week', 'dayOfWeek', 'interval']) } : {}),
    ...(Array.isArray(task.subtasks) ? { subtasks: task.subtasks.map(value => pick(value, ['text', 'done'])) } : {}),
    ...(Array.isArray(task.attachments) ? { attachments: task.attachments.map(attachment) } : {}),
    ...(Array.isArray(task.comments) ? { comments: task.comments.map(value => pick(value, ['text', 'createdAt', 'date'])) } : {})
  }]));
  const assets = Object.fromEntries(Object.entries(source.assets || {}).filter(([, asset]) => asset && !asset.confidential).map(([id, asset]) => [id, {
    ...pick(asset, ['name', 'description', 'category', 'subcategory', 'serviceStatus', 'image']),
    ...(!readOnly ? { _version: version(asset) } : {}),
    ...(Array.isArray(asset.documents) ? { documents: asset.documents.map(attachment) } : {})
  }]));
  return { data: { ...pick(source, ['rubros', 'responsables', 'assetCategories', 'assetSubcategories']), ...(!readOnly ? { _settingsVersion: settingsVersion(source) } : {}), name: project.name || source.name || 'Proyecto compartido', tasks, assets }, readOnly: readOnly || project.status === 'inactive' };
}
