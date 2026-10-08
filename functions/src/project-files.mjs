import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { idSchema, parse, hash, NexusError } from './validation.mjs';
import { NexusService } from './nexus-service.mjs';
import { projectForLink, linkPermissions } from './collaborator-links.mjs';

const unavailable = () => new NexusError(404, 'file_unavailable', 'El archivo no está disponible para este acceso.');
const credentials = { projectId: idSchema, token: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/).optional() };
const fileId = z.string().regex(/^[a-f0-9]{32,64}$/);
export const downloadSchema = z.object({ ...credentials, fileId }).strict();
export const uploadSchema = z.object({ ...credentials, name: z.string().min(1).max(300), type: z.string().regex(/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/).max(150), data: z.string().max(14 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict();
export const fileReference = (baseUrl, projectId, id) => `${baseUrl}/v1/project-files/${projectId}/${id}`;
export const safeFileType = type => /^(image\/(png|jpeg|gif|webp|avif|bmp)|application\/pdf|text\/plain)$/.test(type) ? type : 'application/octet-stream';

export class ProjectFiles {
  constructor(repo, config, now = () => Date.now()) { this.repo = repo; this.config = config; this.now = now; }
  async access(input, actor, write = false) {
    const { ownerUid, project } = await projectForLink(this.repo, input.projectId);
    if (input.token) {
      const sharingToken = await this.repo.get(`project_data/${input.projectId}/sharingToken`);
      const permission = await linkPermissions(this.repo, input.projectId, input.token, { sharingToken }, ownerUid);
      if (write && permission.readOnly) throw new NexusError(403, 'read_only_link', 'Este enlace es de solo lectura.');
      if (write && project.status === 'inactive') throw new NexusError(409, 'archived_project', 'El proyecto está archivado.');
      return { shared: true, readOnly: permission.readOnly, uploader: hash(`link:${input.token}`) };
    }
    if (!actor?.uid) throw new NexusError(401, 'invalid_token', 'Se requiere iniciar sesión.');
    await new NexusService(this.repo, this.config.webUrl).project(actor, ownerUid, input.projectId, write);
    return { shared: false, uploader: hash(`user:${actor.uid}`) };
  }
  async upload(input, actor) {
    parse(uploadSchema, input);
    const access = await this.access(input, actor, true);
    const bytes = Buffer.from(input.data, 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes.toString('base64') !== input.data) throw new NexusError(413, 'invalid_file', 'El archivo debe tener contenido y pesar como máximo 10 MB.');
    const id = randomBytes(16).toString('hex'), objectKey = `project-files/${input.projectId}/${id}`;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await this.repo.saveFile(objectKey, bytes, input.type);
    await this.repo.privatePut('files', `${input.projectId}_${id}`, { projectId: input.projectId, objectKey, sha256, size: bytes.length, type: input.type, name: input.name, uploader: access.uploader, createdAt: this.now() });
    return { url: fileReference(this.config.baseUrl, input.projectId, id), size: bytes.length };
  }
  async download(input, actor) {
    parse(downloadSchema, input);
    const access = await this.access(input, actor);
    const metadata = await this.repo.privateGet('files', `${input.projectId}_${input.fileId}`);
    if (!metadata || metadata.projectId !== input.projectId || !metadata.objectKey.startsWith(`project-files/${input.projectId}/`)) throw unavailable();
    if (access.shared) {
      // Check current visibility and the stored reference, including recurring copies.
      // Projects contain only metadata after migration; no file bytes are read here.
      const source = await this.repo.get(`project_data/${input.projectId}`) || {};
      const url = fileReference(this.config.baseUrl, input.projectId, input.fileId);
      let referenced = false, visible = false;
      for (const [kind, values] of [['tasks', source.tasks], ['assets', source.assets]]) {
        for (const item of Object.values(values || {})) {
          const files = kind === 'tasks' ? item.attachments : item.documents;
          const uses = (kind === 'assets' && item.image === url) || (files || []).some(file => file?.data === url || file?.url === url);
          if (uses) { referenced = true; if (!item.confidential && (kind === 'assets' || item.rubro !== 'Eliminado')) visible = true; }
        }
      }
      const ownPreview = !referenced && !access.readOnly && metadata.uploader === access.uploader && metadata.createdAt + 3_600_000 > this.now();
      if (!visible && !ownPreview) throw unavailable();
    }
    const bytes = await this.repo.readFile(metadata.objectKey);
    if (bytes.length !== metadata.size || createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw new NexusError(502, 'file_integrity_failed', 'No se pudo verificar el archivo.');
    return { bytes, type: safeFileType(metadata.type), name: metadata.name || 'adjunto' };
  }
}
