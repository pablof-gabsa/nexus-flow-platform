import { createHash } from 'node:crypto';
import { z } from 'zod';

export class NexusError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const plain = () => z.string().refine(value => !/[<>]/.test(value), 'Usar texto plano, sin HTML');
const date = z.string().refine(value => {
  if (value === '') return true;
  const parsed = new Date(`${value}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Fecha inválida; usar YYYY-MM-DD');
export const taskFields = {
  requerimiento: plain().pipe(z.string().trim().min(1).max(300)),
  description: plain().pipe(z.string().max(10000)),
  rubro: plain().pipe(z.string().min(1).max(150)),
  responsable: plain().pipe(z.string().max(150)),
  prioridad: z.enum(['Baja', 'Media', 'Alta', 'Crítico']),
  deadline: date,
  confidential: z.boolean(),
  estado: z.enum(['Pendiente', 'En Proceso', 'Realizado', 'Suspendido'])
};
export const createTaskSchema = z.object({
  requerimiento: taskFields.requerimiento,
  description: taskFields.description.default(''),
  rubro: taskFields.rubro,
  responsable: taskFields.responsable.default(''),
  prioridad: taskFields.prioridad.default('Media'),
  deadline: taskFields.deadline.default(''),
  confidential: taskFields.confidential.default(false)
}).strict();
export const updateTaskSchema = z.object(taskFields).partial().strict().refine(value => Object.keys(value).length > 0, 'No hay cambios');
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new NexusError(400, 'invalid_input', result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
export function hash(value) { return createHash('sha256').update(value).digest('hex'); }
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function version(task) { return hash(canonical(task)); }
export function publicTask(id, task, webUrl, projectId, workspaceId) {
  const fields = ['requerimiento', 'description', 'rubro', 'responsable', 'prioridad', 'deadline', 'confidential', 'estado', 'start_date', 'end_date', 'recurrence'];
  return { id, ...Object.fromEntries(fields.filter(k => task[k] !== undefined).map(k => [k, task[k]])), version: version(task), url: `${webUrl}#/project/${encodeURIComponent(projectId)}?workspace=${encodeURIComponent(workspaceId)}` };
}
