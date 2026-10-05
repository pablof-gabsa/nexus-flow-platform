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
const time = z.string().regex(/^(?:|(?:[01]\d|2[0-3]):[0-5]\d)$/, 'Usar HH:MM o vacío');
const amount = z.number().finite().nonnegative();
const MAX_FILE_BYTES = 7 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const recurrenceSchema = z.union([
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('daily') }).strict(),
  z.object({ type: z.literal('weekly'), days: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length, 'No repetir días') }).strict(),
  z.object({ type: z.literal('monthly'), monthlyType: z.literal('fixed'), day: z.number().int().min(1).max(31) }).strict(),
  z.object({ type: z.literal('monthly'), monthlyType: z.literal('relative'), week: z.number().int().min(1).max(5), dayOfWeek: z.number().int().min(0).max(6) }).strict(),
  z.object({ type: z.literal('yearly') }).strict(),
  z.object({ type: z.literal('periodic'), interval: z.number().int().min(1).max(3650) }).strict()
]).describe('Repetición. Días: 0=lunes, 6=domingo. Semana mensual 5=última. periodic.interval indica días desde la finalización.');
const attachmentData = z.string().max(Math.ceil(MAX_FILE_BYTES / 3) * 4 + 300).refine(value => {
  if (value.startsWith('https://')) {
    try { const url = new URL(value); return value.length <= 8192 && url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
  }
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return false;
  const bytes = Buffer.from(match[2], 'base64');
  return bytes.length <= MAX_FILE_BYTES && bytes.toString('base64') === match[2];
}, 'Usar una URL HTTPS o data:<tipo>;base64,... de hasta 7 MB; para archivos mayores usar su enlace HTTPS');
const newAttachment = z.object({ name: plain().pipe(z.string().trim().min(1).max(255)), type: z.string().regex(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/), data: attachmentData }).strict();
const attachmentReference = z.object({ existingIndex: z.number().int().nonnegative(), name: z.string().optional(), type: z.string().optional() }).strict();
const attachments = schema => z.array(schema).max(100).refine(items => {
  const total = items.reduce((sum, item) => sum + (item.data?.startsWith('data:') ? Buffer.byteLength(item.data.split(',')[1], 'base64') : 0), 0);
  const indices = items.filter(item => item.existingIndex !== undefined).map(item => item.existingIndex);
  return total <= MAX_ATTACHMENT_BYTES && new Set(indices).size === indices.length;
}, 'Los archivos inline nuevos no deben superar 10 MB en total ni repetir referencias');
export const taskFields = {
  requerimiento: plain().pipe(z.string().trim().min(1).max(300)),
  description: plain().pipe(z.string().max(10000)),
  rubro: plain().pipe(z.string().min(1).max(150)),
  responsable: plain().pipe(z.string().max(150)),
  prioridad: z.enum(['Baja', 'Media', 'Alta', 'Crítico']),
  deadline: date,
  confidential: z.boolean(),
  estado: z.enum(['Pendiente', 'En Proceso', 'Realizado', 'Suspendido']),
  assetId: z.union([z.literal(''), idSchema]).describe('ID de un activo existente del proyecto; vacío para desvincularlo.'),
  start_date: date.describe('Fecha de inicio prevista: YYYY-MM-DD o vacío.'),
  start_time: time.describe('Hora de inicio prevista: HH:MM o vacío.'),
  time: time.describe('Hora de vencimiento: HH:MM o vacío.'),
  real_start_date: date.describe('Inicio real. Sólo indicar para corregirlo o cargar un dato conocido.'),
  end_date: date.describe('Fin real. Sólo indicar para corregirlo o cargar un dato conocido.'),
  resources: amount.int().describe('Cantidad de recursos, incluido 0.'),
  costo: amount.describe('Costo de la tarea.'),
  hh_estimated: amount.describe('Horas de trabajo estimadas. Si se omiten, se calculan al cambiar fechas previstas o recursos.'),
  hh_executed: amount.describe('Horas de trabajo ejecutadas. Un valor explícito prevalece sobre el cálculo automático.'),
  subtasks: z.array(z.object({ text: plain().pipe(z.string().trim().min(1).max(2000)), done: z.boolean().default(false) }).strict()).max(500).describe('Checklist completo, en orden. Conservá los puntos existentes al agregar o editar; [] lo vacía.'),
  recurrence: recurrenceSchema,
  attachments: attachments(z.union([newAttachment, attachmentReference])).describe('Lista completa de adjuntos. Conservá los existentes mediante existingIndex de get_task y agregá nuevos con name, type, data. [] retira los adjuntos de la tarea sin borrar archivos.')
};
export const createTaskSchema = z.object({
  ...Object.fromEntries(Object.entries(taskFields).map(([key, field]) => [key, field.optional()])),
  requerimiento: taskFields.requerimiento,
  description: taskFields.description.default(''),
  rubro: taskFields.rubro,
  responsable: taskFields.responsable.default(''),
  prioridad: taskFields.prioridad.default('Media'),
  deadline: taskFields.deadline.default(''),
  confidential: taskFields.confidential.default(false),
  attachments: attachments(newAttachment).optional().describe('Adjuntos nuevos: name, type y data como URL HTTPS o data URL base64. Inline: máximo 7 MB por archivo y 10 MB en total; para archivos mayores usar su enlace HTTPS.')
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
export function assertResultSize(result) {
  // Firestore audit documents must remain below 1 MiB, including metadata.
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 900 * 1024) throw new NexusError(413, 'task_result_too_large', 'El checklist y los datos visibles son demasiado extensos para registrar la operación. Reducí su tamaño. No se guardó ningún cambio.');
}
export function publicTask(id, task, webUrl, projectId, workspaceId) {
  const fields = Object.keys(taskFields).filter(key => key !== 'attachments');
  const files = (task.attachments || []).map((file, existingIndex) => ({ existingIndex, name: file.name || `Adjunto ${existingIndex + 1}`, type: file.type || 'application/octet-stream' }));
  return { id, ...Object.fromEntries(fields.filter(k => task[k] !== undefined).map(k => [k, task[k]])), attachments: files, version: version(task), url: `${webUrl}#/project/${encodeURIComponent(projectId)}?workspace=${encodeURIComponent(workspaceId)}` };
}
