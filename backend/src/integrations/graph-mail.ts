import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

export const graphScopes = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access';
export const microsoftAuthority = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
export type GraphConfig = { clientId: string; from: string; tokenFile: string };
type Credential = { clientId: string; from: string; refreshToken: string };
export function graphMailConfig(env: NodeJS.ProcessEnv = process.env): GraphConfig | null {
  const clientId = env.GRAPH_CLIENT_ID?.trim(), from = env.MAIL_FROM?.trim().toLowerCase(), tokenFile = env.GRAPH_TOKEN_FILE?.trim();
  if (!clientId || !/^[a-f0-9-]{36}$/i.test(clientId) || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || !tokenFile || !isAbsolute(tokenFile)) return null;
  try {
    const origin = new URL(env.FRONTEND_ORIGIN ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || (origin.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && local && origin.protocol === 'http:'))) return null;
  } catch { return null; }
  return { clientId, from, tokenFile };
}
export async function saveGraphCredential(config: GraphConfig, refreshToken: string) {
  await mkdir(dirname(config.tokenFile), { recursive: true, mode: 0o700 });
  const temp = `${config.tokenFile}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify({ clientId: config.clientId, from: config.from, refreshToken }), { mode: 0o600, flag: 'wx' });
    await rename(temp, config.tokenFile);
  } finally { await unlink(temp).catch(() => {}); }
}
export function createGraphMail(config: GraphConfig, request: typeof fetch = fetch) {
  let accessToken = '', expiresAt = 0;
  let pending: Promise<string> | undefined;
  async function refresh() {
    try {
      const saved: Credential = JSON.parse(await readFile(config.tokenFile, 'utf8'));
      if (saved.clientId !== config.clientId || saved.from !== config.from || !saved.refreshToken) throw Error();
      const response = await request(`${microsoftAuthority}/token`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), body: new URLSearchParams({ client_id: config.clientId, grant_type: 'refresh_token', refresh_token: saved.refreshToken, scope: graphScopes }) });
      if (!response.ok) throw Error();
      const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
      if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in! <= 60 || !result.scope?.split(' ').some(s => /(^|\/)Mail.Send$/i.test(s))) throw Error();
      if (result.refresh_token) await saveGraphCredential(config, result.refresh_token);
      accessToken = result.access_token;
      expiresAt = Date.now() + (result.expires_in! - 60) * 1000;
      return accessToken;
    } catch { throw Error('GRAPH_AUTHORIZATION_FAILED'); }
  }
  async function token() {
    if (accessToken && Date.now() < expiresAt) return accessToken;
    if (!pending) pending = refresh().finally(() => { pending = undefined; });
    return pending;
  }
  return {
    ready: () => existsSync(config.tokenFile),
    async send(to: string, text: string) {
      try {
        const response = await request('https://graph.microsoft.com/v1.0/me/sendMail', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { subject: 'Recupera tu contraseña de EnerTrade AI', body: { contentType: 'Text', content: text }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true }) });
        if (response.status === 401) { accessToken = ''; expiresAt = 0; }
        if (response.status !== 202) throw Error();
      } catch { throw Error('GRAPH_MAIL_FAILED'); }
    }
  };
}
