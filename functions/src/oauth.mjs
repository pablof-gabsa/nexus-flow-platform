import { randomBytes, timingSafeEqual } from 'node:crypto';
import { NexusError, hash, parse, idSchema } from './validation.mjs';

const opaque = () => randomBytes(32).toString('base64url');
const supportedScopes = ['tasks:read', 'tasks:write'];
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function scopes(value = 'tasks:read') {
  if (typeof value !== 'string') throw new NexusError(400, 'invalid_scope', 'Permisos inválidos.');
  const result = [...new Set(value.split(' ').filter(Boolean))];
  if (!result.includes('tasks:read') || result.some(s => !supportedScopes.includes(s))) throw new NexusError(400, 'invalid_scope', 'Permisos no admitidos.');
  return result;
}
export function clientProvider(redirect) {
  let url;
  try { url = new URL(redirect); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.search) return null;
  if (url.hostname === 'chatgpt.com' && (/^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(url.pathname) || url.pathname === '/connector_platform_oauth_redirect')) return 'ChatGPT';
  if (url.hostname === 'claude.ai' && url.pathname === '/api/mcp/auth_callback') return 'Claude';
  if (url.hostname === 'gemini.google.com' && /^\/.*(?:oauth|auth_complete|callback)/.test(url.pathname)) return 'Gemini';
  return null;
}
export class NexusOAuth {
  constructor(repo, service, config, now = () => Date.now()) { Object.assign(this, { repo, service, config, now }); }
  metadata() { return { issuer: this.config.baseUrl, authorization_endpoint: `${this.config.baseUrl}/oauth/authorize`, token_endpoint: `${this.config.baseUrl}/oauth/token`, registration_endpoint: `${this.config.baseUrl}/oauth/register`, revocation_endpoint: `${this.config.baseUrl}/oauth/revoke`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], scopes_supported: supportedScopes }; }
  resourceMetadata() { return { resource: `${this.config.baseUrl}/mcp`, authorization_servers: [this.config.baseUrl], scopes_supported: supportedScopes, bearer_methods_supported: ['header'], resource_name: 'Nexus' }; }
  async register(input) {
    if (!input || !Array.isArray(input.redirect_uris) || input.redirect_uris.length < 1 || input.redirect_uris.length > 5 || input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none') throw new NexusError(400, 'invalid_client_metadata', 'Se requiere un cliente público con redirect_uris.');
    const providers = input.redirect_uris.map(clientProvider);
    if (providers.some(p => !p) || new Set(providers).size !== 1) throw new NexusError(400, 'invalid_redirect_uri', 'Sólo se admiten callbacks oficiales de los asistentes compatibles.');
    const id = opaque();
    const client = { client_id: id, client_name: providers[0], redirect_uris: input.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: Math.floor(this.now() / 1000) };
    await this.repo.privatePut('clients', id, client);
    return client;
  }
  async begin(input) {
    const client = await this.repo.privateGet('clients', parse(idSchema, input.client_id));
    if (!client || !client.redirect_uris.includes(input.redirect_uri)) throw new NexusError(400, 'invalid_redirect_uri', 'Cliente o callback no válido.');
    if (input.response_type !== 'code' || input.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge || '') || input.resource !== `${this.config.baseUrl}/mcp`) throw new NexusError(400, 'invalid_request', 'Se requiere authorization_code, PKCE S256 y el recurso MCP de Nexus.');
    if (typeof input.state !== 'string' || input.state.length < 1 || input.state.length > 1000) throw new NexusError(400, 'invalid_request', 'Se requiere state.');
    const ticket = opaque();
    await this.repo.privatePut('requests', hash(ticket), { clientId: client.client_id, clientName: client.client_name, redirectUri: input.redirect_uri, challenge: input.code_challenge, state: input.state, resource: input.resource, scopes: scopes(input.scope), expiresAt: this.now() + 5 * 60_000 });
    return `${this.config.webUrl}#/assistants/authorize?request=${ticket}`;
  }
  async request(ticket, uid) {
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new NexusError(400, 'invalid_request', 'Solicitud no válida.');
    const request = await this.repo.privateGet('requests', hash(ticket));
    if (!request || request.expiresAt <= this.now()) throw new NexusError(410, 'request_expired', 'La solicitud venció. Iniciá la conexión de nuevo desde tu asistente.');
    return { clientName: request.clientName, scopes: request.scopes, workspaces: await this.service.workspaces(uid) };
  }
  async approve(ticket, uid, workspaceIds, allowWrite) {
    const available = await this.request(ticket, uid);
    if (!Array.isArray(workspaceIds) || !workspaceIds.length || workspaceIds.some(id => !available.workspaces.some(w => w.id === id))) throw new NexusError(400, 'invalid_workspaces', 'Seleccioná al menos un espacio al que tengas acceso.');
    if (allowWrite && !available.scopes.includes('tasks:write')) throw new NexusError(400, 'invalid_scope', 'El asistente no pidió permiso de modificación.');
    const request = await this.repo.privateConsume('requests', hash(ticket), data => data.expiresAt > this.now());
    if (!request) throw new NexusError(410, 'request_expired', 'La solicitud ya se usó o venció.');
    const grantId = opaque();
    const grantedScopes = allowWrite ? ['tasks:read', 'tasks:write'] : ['tasks:read'];
    await this.repo.privatePut('grants', grantId, { uid, clientId: request.clientId, clientName: request.clientName, workspaceIds: [...new Set(workspaceIds)], scopes: grantedScopes, createdAt: this.now(), expiresAt: this.now() + 30 * 86400_000 });
    const code = opaque();
    await this.repo.privatePut('codes', hash(code), { uid, grantId, clientId: request.clientId, redirectUri: request.redirectUri, challenge: request.challenge, resource: request.resource, scopes: grantedScopes, expiresAt: this.now() + 60_000 });
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set('code', code); redirect.searchParams.set('state', request.state);
    return { redirectUrl: redirect.toString() };
  }
  async token(input) {
    if (input.resource !== `${this.config.baseUrl}/mcp`) throw new NexusError(400, 'invalid_target', 'Recurso incorrecto.');
    const client = await this.repo.privateGet('clients', parse(idSchema, input.client_id));
    if (!client) throw new NexusError(400, 'invalid_client', 'Cliente no reconocido.');
    let data;
    if (input.grant_type === 'authorization_code') {
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier || '') || typeof input.code !== 'string') throw new NexusError(400, 'invalid_grant', 'Código o verificador no válido.');
      const challenge = Buffer.from(hash(input.code_verifier), 'hex').toString('base64url');
      data = await this.repo.privateConsume('codes', hash(input.code), value => value.expiresAt > this.now() && value.clientId === client.client_id && value.redirectUri === input.redirect_uri && value.resource === input.resource && same(value.challenge, challenge));
    } else if (input.grant_type === 'refresh_token' && typeof input.refresh_token === 'string') {
      data = await this.repo.privateConsume('refresh', hash(input.refresh_token), value => value.expiresAt > this.now() && value.clientId === client.client_id && value.resource === input.resource);
    } else throw new NexusError(400, 'unsupported_grant_type', 'Tipo de autorización no admitido.');
    if (!data) throw new NexusError(400, 'invalid_grant', 'El código o token venció, ya se usó o no corresponde al cliente.');
    const grant = await this.repo.privateGet('grants', data.grantId);
    if (!grant || grant.uid !== data.uid || grant.revokedAt || grant.expiresAt <= this.now()) throw new NexusError(400, 'invalid_grant', 'La conexión fue revocada o venció.');
    await this.service.user(data.uid);
    const tokenScopes = input.scope ? scopes(input.scope) : data.scopes;
    if (tokenScopes.some(s => !data.scopes.includes(s) || !grant.scopes.includes(s))) throw new NexusError(400, 'invalid_scope', 'No se pueden ampliar los permisos.');
    const accessToken = opaque(), refreshToken = opaque();
    const base = { uid: data.uid, clientId: client.client_id, grantId: data.grantId, scopes: tokenScopes, resource: data.resource };
    await this.repo.privatePut('tokens', hash(accessToken), { ...base, expiresAt: this.now() + 3600_000 });
    await this.repo.privatePut('refresh', hash(refreshToken), { ...base, expiresAt: Math.min(grant.expiresAt, this.now() + 30 * 86400_000) });
    return { access_token: accessToken, token_type: 'Bearer', expires_in: 3600, refresh_token: refreshToken, scope: tokenScopes.join(' ') };
  }
  async authenticate(token) {
    const data = await this.repo.privateGet('tokens', hash(token));
    if (!data || data.expiresAt <= this.now() || data.resource !== `${this.config.baseUrl}/mcp`) throw new NexusError(401, 'invalid_token', 'Se requiere iniciar sesión.');
    const grant = await this.repo.privateGet('grants', data.grantId);
    if (!grant || grant.uid !== data.uid || grant.revokedAt || grant.expiresAt <= this.now()) throw new NexusError(401, 'invalid_token', 'Conexión revocada o vencida.');
    await this.service.user(data.uid);
    return { uid: data.uid, grantId: data.grantId, scopes: data.scopes };
  }
  async revokeGrant(uid, grantId) {
    parse(idSchema, grantId);
    const grant = await this.repo.privateGet('grants', grantId);
    if (!grant || grant.uid !== uid) throw new NexusError(404, 'grant_not_found', 'Conexión no encontrada.');
    await this.repo.privatePut('grants', grantId, { ...grant, revokedAt: this.now() });
  }
  async revokeToken(input) {
    if (typeof input.token !== 'string' || typeof input.client_id !== 'string') throw new NexusError(400, 'invalid_request', 'Se requiere token y client_id.');
    const data = await this.repo.privateGet('tokens', hash(input.token)) || await this.repo.privateGet('refresh', hash(input.token));
    if (data && data.clientId === input.client_id) await this.revokeGrant(data.uid, data.grantId);
  }
}
