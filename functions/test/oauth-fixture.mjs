import { createHash } from 'node:crypto';
import { NexusOAuth } from '../src/oauth.mjs';
import { NexusService } from '../src/nexus-service.mjs';
import { MemoryRepository, config } from './fixture.mjs';
export async function linked({ write = true, provider = 'Claude' } = {}) {
  const repo = new MemoryRepository(), service = new NexusService(repo, config.webUrl), oauth = new NexusOAuth(repo, service, config);
  const redirect = provider === 'Claude' ? 'https://claude.ai/api/mcp/auth_callback' : 'https://chatgpt.com/connector/oauth/test-client';
  const client = await oauth.register({ redirect_uris: [redirect], token_endpoint_auth_method: 'none' });
  const verifier = 'a'.repeat(64), challenge = createHash('sha256').update(verifier).digest('base64url');
  const authorization = await oauth.begin({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', resource: `${config.baseUrl}/mcp`, scope: 'tasks:read tasks:write', state: 'state-fixture' });
  const ticket = new URLSearchParams(authorization.split('?')[1]).get('request');
  const approval = await oauth.approve(ticket, 'alice', ['owner'], write);
  const callback = new URL(approval.redirectUrl), code = callback.searchParams.get('code');
  const exchange = { client_id: client.client_id, redirect_uri: redirect, grant_type: 'authorization_code', code, code_verifier: verifier, resource: `${config.baseUrl}/mcp` };
  const tokens = await oauth.token(exchange);
  return { repo, service, oauth, client, tokens, exchange, ticket, callback };
}