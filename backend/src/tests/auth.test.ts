import { afterAll, beforeEach, expect, test } from 'bun:test';
import express from 'express';
import { createAuthService, type AuthRepository, type AuthUser } from '../services/auth.service';
import { createAuthRouter } from '../controllers/auth.controller';
let users = new Map<string, AuthUser & { passwordHash: string }>();
let sessions = new Map<string, { expiresAt: Date; user: AuthUser }>();
let clock = new Date();
let fail = false;
const repo: AuthRepository = {
 async createUser(data) {
  if (fail) throw new Error('secret database internals');
  if (users.has(data.email)) throw { code: 'P2002' };
  const user = { ...data, id: crypto.randomUUID(), createdAt: clock }; users.set(data.email, user);
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
 },
 async findUser(email) { return users.get(email) ?? null },
 async createSession(data) {
  const user = [...users.values()].find(user => user.id === data.userId)!;
  sessions.set(data.tokenHash, { expiresAt: data.expiresAt, user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } });
 },
 async findSession(hash) { return sessions.get(hash) ?? null },
 async deleteSession(hash) { sessions.delete(hash) },
};
const service = createAuthService(repo, () => clock);
const app = express(); app.use('/auth', createAuthRouter(service));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test server');
const base = `http://127.0.0.1:${address.port}/auth`;
const input = { email: 'demo@example.test', name: 'Demo', password: 'test-only-long-passphrase' };
async function request(path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
 return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function login() {
 await service.register(input);
 return request('/login', { email: input.email, password: input.password });
}
beforeEach(() => { users = new Map(); sessions = new Map(); clock = new Date(); fail = false });
afterAll(() => server.close());
test('register persists Argon2id and only exposes public user', async () => {
 const response = await request('/register', { ...input, email: ' Demo@Example.Test ' });
 expect(response.status).toBe(201);
 expect(await response.json()).toEqual({ user: { id: users.get(input.email)!.id, email: input.email, name: 'Demo', createdAt: clock.toISOString() } });
 expect(users.get(input.email)!.passwordHash.startsWith('$argon2id$')).toBe(true);
 expect(await Bun.password.verify(input.password, users.get(input.email)!.passwordHash)).toBe(true);
 expect(sessions.size).toBe(0);
});
test('duplicate normalized email returns 409', async () => {
 await service.register(input);
 expect((await request('/register', input)).status).toBe(409); expect(users.size).toBe(1);
});
test.each([{ ...input, email: 'bad' }, { ...input, password: 'short' }, { ...input, name: '' }, { ...input, password: 12 }])('invalid registration %j', async body => {
 expect((await request('/register', body)).status).toBe(400); expect(users.size).toBe(0);
});
test('login cookie, me and logout revoke the session', async () => {
 const response = await login(); expect(response.status).toBe(200);
 const cookie = response.headers.get('set-cookie')!;
 expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('SameSite=Lax'); expect(cookie).toContain('Path=/auth');
 const token = cookie.split(';')[0]!;
 expect([...sessions.keys()][0]).not.toBe(token.split('=')[1]);
 expect((await request('/me', undefined, token)).status).toBe(200);
 const logout = await request('/logout', {}, token); expect(logout.status).toBe(204); expect(logout.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
 expect((await request('/me', undefined, token)).status).toBe(401); expect(sessions.size).toBe(0);
});
test('invalid credentials have identical envelopes for unknown email and wrong password', async () => {
 await service.register(input);
 const a = await request('/login', { email: input.email, password: 'wrong' });
 const b = await request('/login', { email: 'absent@example.test', password: 'wrong' });
 expect(a.status).toBe(401); expect(b.status).toBe(401); expect(await a.json()).toEqual(await b.json()); expect(sessions.size).toBe(0);
});
test('me rejects absent, forged and expired sessions', async () => {
 expect((await request('/me')).status).toBe(401);
 expect((await request('/me', undefined, 'enertrade_session=forged')).status).toBe(401);
 const response = await login(); const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
 clock = new Date(clock.getTime() + 9 * 3600000); expect((await request('/me', undefined, cookie)).status).toBe(401);
});
test('login rotates a previous authenticated token', async () => {
 const response = await login(); const old = response.headers.get('set-cookie')!.split(';')[0]!;
 const next = await request('/login', { email: input.email, password: input.password }, old);
 expect(next.headers.get('set-cookie')).not.toContain(old); expect((await request('/me', undefined, old)).status).toBe(401); expect(sessions.size).toBe(1);
});
test('cross-origin writes and non-JSON writes are rejected', async () => {
 expect((await request('/register', input, undefined, { Origin: 'https://evil.test' })).status).toBe(403);
 expect((await request('/login', input, undefined, { 'Content-Type': 'text/plain' })).status).toBe(415);
 expect(users.size).toBe(0);
});
test('parser and internal errors are safe', async () => {
 const malformed = await fetch(base + '/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
 expect(malformed.status).toBe(400);
 fail = true; const response = await request('/register', input); expect(response.status).toBe(500); expect(await response.text()).not.toContain('secret');
});
