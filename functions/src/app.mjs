import express from 'express';
import { z } from 'zod';
import { NexusService } from './nexus-service.mjs';
import { NexusOAuth } from './oauth.mjs';
import { handleMcp } from './mcp.mjs';
import { NexusError, parse, idSchema } from './validation.mjs';
import { openapi } from './openapi.mjs';
import { sharedProject, sharedProjectSchema } from './shared-project.mjs';

export function createApp(repo, config) {
  const app = express();
  const service = new NexusService(repo, config.webUrl);
  const oauth = new NexusOAuth(repo, service, config);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const allowedOrigins = new Set([new URL(config.webUrl).origin, new URL(config.baseUrl).origin, 'https://chatgpt.com', 'https://claude.ai', 'https://gemini.google.com']);
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'origin_not_allowed' });
    if (origin) { res.set('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
    res.set({ 'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Protocol-Version' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  const smallJson = express.json({ limit: '128kb' });
  const taskJson = express.json({ limit: '30mb' });
  app.use((req, res, next) => (req.path === '/mcp' || /^\/v1\/workspaces\/[^/]+\/projects\/[^/]+\/tasks(?:\/[^/]+)?$/.test(req.path) ? taskJson : smallJson)(req, res, next));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  const bearer = req => {
    const match = /^Bearer ([A-Za-z0-9_.-]{20,4096})$/.exec(req.get('authorization') || '');
    if (!match) throw new NexusError(401, 'invalid_token', 'Se requiere iniciar sesión.');
    return match[1];
  };
  const firebaseAuth = async (req, res, next) => {
    try { const user = await repo.verifyFirebase(bearer(req)); await service.user(user.uid); req.actor = { uid: user.uid }; next(); }
    catch (error) { next(error instanceof NexusError ? error : new NexusError(401, 'invalid_token', 'La sesión de Nexus venció.')); }
  };
  const oauthAuth = async (req, res, next) => {
    try { req.actor = await oauth.authenticate(bearer(req)); next(); }
    catch (error) { next(error); }
  };
  const throttled = (bucket, limit) => async (req, res, next) => {
    try { if (repo.throttle) await repo.throttle(`${bucket}:${req.ip}`, limit, 60_000); next(); } catch (error) { next(error); }
  };
  app.get('/health', async (req, res) => {
    await repo.privateGet('health', 'readiness');
    await repo.get('nexus_assistant_health');
    res.json({ ok: true, apiVersion: '1.1', transport: 'streamable-http' });
  });
  app.get('/.well-known/oauth-authorization-server', (req, res) => res.json(oauth.metadata()));
  app.get('/openapi.json', (req, res) => res.json(openapi(config.baseUrl)));
  app.post('/v1/shared-project', throttled('shared-project', 60), async (req, res) => res.json(await sharedProject(repo, parse(sharedProjectSchema, req.body))));
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (req, res) => res.json(oauth.resourceMetadata()));
  app.post('/oauth/register', throttled('registration', 20), async (req, res) => res.status(201).json(await oauth.register(req.body)));
  app.get('/oauth/authorize', throttled('authorize', 30), async (req, res) => res.redirect(await oauth.begin(req.query)));
  app.post('/oauth/token', throttled('token', 60), async (req, res) => res.json(await oauth.token(req.body)));
  app.post('/oauth/revoke', throttled('revoke', 30), async (req, res) => { await oauth.revokeToken(req.body); res.sendStatus(200); });
  app.get('/v1/authorization/:ticket', firebaseAuth, async (req, res) => res.json(await oauth.request(req.params.ticket, req.actor.uid)));
  app.post('/v1/authorization/:ticket', firebaseAuth, async (req, res) => {
    const input = parse(z.object({ workspaceIds: z.array(idSchema).min(1).max(50), allowWrite: z.boolean() }).strict(), req.body);
    res.json(await oauth.approve(req.params.ticket, req.actor.uid, input.workspaceIds, input.allowWrite));
  });
  app.get('/v1/connections', firebaseAuth, async (req, res) => {
    const rows = await repo.privateList('grants', req.actor.uid);
    res.json({ connections: rows.filter(row => !row.revokedAt && row.expiresAt > Date.now()).map(({ id, clientName, workspaceIds, scopes, createdAt, expiresAt }) => ({ id, clientName, workspaceIds, scopes, createdAt, expiresAt })) });
  });
  app.delete('/v1/connections/:id', firebaseAuth, async (req, res) => { await oauth.revokeGrant(req.actor.uid, req.params.id); res.sendStatus(204); });
  app.get('/v1/history', firebaseAuth, async (req, res) => {
    const rows = await repo.privateList('audit', req.actor.uid);
    const allowed = new Set((await service.workspaces(req.actor.uid)).map(w => w.id));
    res.json({ history: rows.filter(row => allowed.has(row.workspaceId)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(({ operation, workspaceId, projectId, createdAt, result }) => ({ operation, workspaceId, projectId, createdAt, task: result.task })), limit: 50 });
  });
  app.use('/v1/workspaces', oauthAuth);
  app.get('/v1/workspaces', async (req, res) => res.json(await service.listWorkspaces(req.actor)));
  app.get('/v1/workspaces/:workspaceId/projects', async (req, res) => res.json(await service.projects(req.actor, req.params.workspaceId)));
  app.get('/v1/workspaces/:workspaceId/projects/:projectId', async (req, res) => res.json(await service.details(req.actor, req.params.workspaceId, req.params.projectId)));
  const tasksPath = '/v1/workspaces/:workspaceId/projects/:projectId/tasks';
  app.get(tasksPath, async (req, res) => {
    const options = parse(z.object({ cursor: idSchema.optional(), limit: z.coerce.number().int().min(1).max(100).default(50), query: z.string().max(300).default(''), estado: z.enum(['Pendiente', 'En Proceso', 'Realizado', 'Suspendido']).optional() }).strict(), req.query);
    res.json(await service.tasks(req.actor, req.params.workspaceId, req.params.projectId, options));
  });
  app.get(`${tasksPath}/:taskId`, async (req, res) => res.json(await service.task(req.actor, req.params.workspaceId, req.params.projectId, req.params.taskId)));
  app.post(tasksPath, async (req, res) => {
    const input = parse(z.object({ task: z.record(z.string(), z.unknown()), requestId: z.string() }).strict(), req.body);
    res.status(201).json(await service.createTask(req.actor, req.params.workspaceId, req.params.projectId, input.task, input.requestId));
  });
  app.patch(`${tasksPath}/:taskId`, async (req, res) => {
    const input = parse(z.object({ changes: z.record(z.string(), z.unknown()), expectedVersion: z.string(), requestId: z.string() }).strict(), req.body);
    res.json(await service.updateTask(req.actor, req.params.workspaceId, req.params.projectId, req.params.taskId, input.changes, input.expectedVersion, input.requestId));
  });
  app.post('/mcp', oauthAuth, async (req, res) => handleMcp(req, res, service, req.actor, config.baseUrl));
  app.all('/mcp', oauthAuth, (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' }));
  app.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const known = error instanceof NexusError;
    const status = known ? error.status : error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    if (status === 401) res.set('WWW-Authenticate', `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource", error="invalid_token"`);
    res.status(status).json({ error: known ? error.code : status === 400 ? 'invalid_json' : 'internal_error', message: known ? error.message : status === 400 ? 'Contenido inválido.' : 'No se pudo completar la acción.' });
  });
  return app;
}
