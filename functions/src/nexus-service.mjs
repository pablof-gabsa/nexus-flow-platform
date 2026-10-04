import { parse, idSchema, createTaskSchema, updateTaskSchema, NexusError, hash, canonical, publicTask, version } from './validation.mjs';

export class NexusService {
  constructor(repo, webUrl, now = () => new Date()) { this.repo = repo; this.webUrl = webUrl; this.now = now; }
  async user(uid) {
    const user = await this.repo.getUser(uid);
    if (!user || user.disabled || !user.emailVerified || !user.email) throw new NexusError(403, 'account_unavailable', 'Se requiere una cuenta de Nexus con correo verificado.');
    return user;
  }
  async workspaces(uid) {
    const user = await this.user(uid);
    const emailKey = user.email.replace(/\./g, ',');
    const map = await this.repo.get(`admin_map/${emailKey}`) || {};
    const candidates = typeof map.ownerId === 'string' ? [map.ownerId] : Object.keys(map).filter(id => map[id] === true);
    const spaces = [{ id: uid, name: 'Mi espacio personal', role: 'owner' }];
    for (const ownerId of [...new Set(candidates)]) {
      if (ownerId === uid || !idSchema.safeParse(ownerId).success) continue;
      const config = await this.repo.get(`users/${ownerId}/config`) || {};
      const legacy = await this.repo.get(`users/${ownerId}/authorized_admins/${emailKey}`);
      if (!config.admins?.[emailKey] && !legacy) continue;
      spaces.push({ id: ownerId, name: config.companyName || 'Espacio compartido', role: 'admin' });
    }
    return spaces;
  }
  async access(actor, workspaceId, write = false) {
    parse(idSchema, workspaceId);
    if (actor.grantId) {
      const grant = await this.repo.privateGet('grants', actor.grantId);
      if (!grant || grant.uid !== actor.uid || grant.revokedAt || grant.expiresAt <= this.now().getTime()) throw new NexusError(401, 'invalid_token', 'La conexión venció o fue revocada.');
      if (!grant.workspaceIds.includes(workspaceId)) throw new NexusError(403, 'workspace_not_authorized', 'Este espacio no fue autorizado para la conexión.');
      const needed = write ? 'tasks:write' : 'tasks:read';
      if (!actor.scopes.includes(needed) || !grant.scopes.includes(needed)) throw new NexusError(403, 'insufficient_scope', 'La conexión no tiene permiso para esta acción.');
    }
    const spaces = await this.workspaces(actor.uid);
    if (!spaces.some(space => space.id === workspaceId)) throw new NexusError(403, 'access_denied', 'Ya no tenés acceso a este espacio.');
  }
  async listWorkspaces(actor) {
    let spaces = await this.workspaces(actor.uid);
    if (actor.grantId) {
      const grant = await this.repo.privateGet('grants', actor.grantId);
      if (!grant || grant.uid !== actor.uid || grant.revokedAt || grant.expiresAt <= this.now().getTime() || !grant.scopes.includes('tasks:read') || !actor.scopes.includes('tasks:read')) throw new NexusError(401, 'invalid_token', 'Conexión no disponible.');
      spaces = spaces.filter(space => grant.workspaceIds.includes(space.id));
    }
    return { workspaces: spaces };
  }
  async project(actor, workspaceId, projectId, write = false) {
    parse(idSchema, projectId);
    await this.access(actor, workspaceId, write);
    const project = await this.repo.get(`users/${workspaceId}/projects/${projectId}`);
    if (!project || project.owner !== workspaceId) throw new NexusError(404, 'project_not_found', 'El proyecto no pertenece al espacio seleccionado.');
    if (write && project.status === 'inactive') throw new NexusError(409, 'archived_project', 'Abrí el proyecto archivado en Nexus antes de modificarlo.');
    return project;
  }
  async projects(actor, workspaceId) {
    await this.access(actor, workspaceId);
    const projects = await this.repo.get(`users/${workspaceId}/projects`) || {};
    return { projects: Object.entries(projects).filter(([, p]) => p.owner === workspaceId).map(([id, p]) => ({ id, name: p.name, status: p.status, url: `${this.webUrl}#/project/${encodeURIComponent(id)}?workspace=${encodeURIComponent(workspaceId)}` })) };
  }
  async details(actor, workspaceId, projectId) {
    const project = await this.project(actor, workspaceId, projectId);
    const data = await this.repo.get(`project_data/${projectId}`) || {};
    return { id: projectId, name: project.name, rubros: data.rubros || [], responsables: data.responsables || [] };
  }
  async tasks(actor, workspaceId, projectId, { cursor = '', limit = 50, query = '', estado = '' } = {}) {
    await this.project(actor, workspaceId, projectId);
    const data = await this.repo.get(`project_data/${projectId}/tasks`) || {};
    const rows = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).filter(([, t]) => (!estado || t.estado === estado) && (!query || `${t.requerimiento} ${t.description || ''}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))));
    const remaining = rows.filter(([id]) => !cursor || id.localeCompare(cursor) > 0);
    const page = remaining.slice(0, limit);
    return { tasks: page.map(([id, task]) => publicTask(id, task, this.webUrl, projectId, workspaceId)), total: rows.length, nextCursor: remaining.length > limit ? page.at(-1)[0] : null };
  }
  async task(actor, workspaceId, projectId, taskId) {
    parse(idSchema, taskId);
    await this.project(actor, workspaceId, projectId);
    const task = await this.repo.get(`project_data/${projectId}/tasks/${taskId}`);
    if (!task) throw new NexusError(404, 'task_not_found', 'Tarea no encontrada.');
    return publicTask(taskId, task, this.webUrl, projectId, workspaceId);
  }
  async validateLabels(projectId, task) {
    const data = await this.repo.get(`project_data/${projectId}`) || {};
    if (task.rubro && !(data.rubros || []).includes(task.rubro)) throw new NexusError(400, 'unknown_rubro', 'Elegí un rubro existente del proyecto.');
    if (task.responsable && !(data.responsables || []).includes(task.responsable)) throw new NexusError(400, 'unknown_responsable', 'Elegí un responsable existente del proyecto.');
  }
  async mutate(actor, workspaceId, projectId, requestId, operation, payload, change) {
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(requestId)) throw new NexusError(400, 'request_id_required', 'Se requiere requestId estable para evitar duplicados.');
    await this.project(actor, workspaceId, projectId, true);
    const opId = hash(`${actor.uid}:${actor.grantId || 'nexus'}:${workspaceId}:${projectId}:${requestId}`);
    const fingerprint = hash(canonical({ operation, payload }));
    const recorded = await this.repo.privateGet('audit', opId);
    if (recorded) {
      if (recorded.fingerprint !== fingerprint) throw new NexusError(409, 'request_id_reused', 'Este requestId ya se usó para otra acción.');
      return recorded.result;
    }
    const result = await change(opId, fingerprint);
    await this.repo.privatePut('audit', opId, { uid: actor.uid, grantId: actor.grantId || null, workspaceId, projectId, operation, fingerprint, createdAt: this.now().getTime(), result });
    return result;
  }
  async createTask(actor, workspaceId, projectId, input, requestId) {
    const task = parse(createTaskSchema, input);
    await this.project(actor, workspaceId, projectId, true);
    await this.validateLabels(projectId, task);
    return this.mutate(actor, workspaceId, projectId, requestId, 'create_task', task, async (opId, fingerprint) => {
      const id = `ai_${opId}`;
      const user = await this.user(actor.uid);
      const value = { ...task, estado: 'Pendiente', recurrence: { type: 'none' }, subtasks: [], attachments: [], resources: 1, hh_estimated: 0, hh_executed: 0, start_date: '', real_start_date: '', end_date: '', createdBy: user.email, createdAt: this.now().toISOString(), source: 'assistant', _assistantOperation: { id: opId, fingerprint } };
      const saved = await this.repo.taskTransaction(projectId, id, current => {
        if (current && current._assistantOperation?.fingerprint !== fingerprint) throw new NexusError(409, 'task_conflict', 'La tarea ya existe con otros datos.');
        return current || value;
      });
      return { task: publicTask(id, saved, this.webUrl, projectId, workspaceId), saved: true };
    });
  }
  async updateTask(actor, workspaceId, projectId, taskId, input, expectedVersion, requestId) {
    parse(idSchema, taskId);
    if (typeof expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(expectedVersion)) throw new NexusError(400, 'version_required', 'Consultá la tarea antes de editarla.');
    const changes = parse(updateTaskSchema, input);
    await this.project(actor, workspaceId, projectId, true);
    await this.validateLabels(projectId, changes);
    return this.mutate(actor, workspaceId, projectId, requestId, 'update_task', { taskId, changes, expectedVersion }, async (opId, fingerprint) => {
      const saved = await this.repo.taskTransaction(projectId, taskId, current => {
        if (!current) throw new NexusError(404, 'task_not_found', 'Tarea no encontrada.');
        if (current._assistantOperation?.id === opId && current._assistantOperation.fingerprint === fingerprint) return current;
        if (version(current) !== expectedVersion) throw new NexusError(409, 'version_conflict', 'La tarea cambió. Consultala de nuevo antes de editarla.');
        if (changes.estado && current.recurrence?.type && current.recurrence.type !== 'none') throw new NexusError(409, 'recurring_status_requires_nexus', 'Cambiá el estado de esta tarea recurrente desde Nexus para conservar su próxima ejecución.');
        const extra = {};
        const day = this.now().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
        if (changes.estado === 'En Proceso' && !current.real_start_date) extra.real_start_date = day;
        if (changes.estado === 'Realizado') {
          extra.end_date = day;
          if (current.real_start_date) extra.hh_executed = businessHours(current.real_start_date, day) * (current.resources || 1);
        }
        else if (changes.estado && current.estado === 'Realizado') { extra.end_date = ''; extra.hh_executed = 0; }
        return { ...current, ...changes, ...extra, updatedAt: this.now().toISOString(), _assistantOperation: { id: opId, fingerprint } };
      });
      return { task: publicTask(taskId, saved, this.webUrl, projectId, workspaceId), saved: true };
    });
  }
}

// Same inclusive 8h Monday-Friday convention used by Utils.calculateBusinessHours.
function businessHours(start, end) {
  const first = new Date(`${start}T12:00:00Z`), last = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || first > last) return 0;
  const days = Math.round((last - first) / 86400_000) + 1;
  if (days === 1) return 8;
  let weekdays = Math.floor(days / 7) * 5;
  for (let offset = 0; offset < days % 7; offset++) { const day = (first.getUTCDay() + offset) % 7; if (day !== 0 && day !== 6) weekdays++; }
  return weekdays * 8;
}
