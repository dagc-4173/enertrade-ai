import { afterEach, expect, spyOn, test } from 'bun:test'
import process from 'node:process'
import { renderToStaticMarkup } from 'react-dom/server'
import * as api from '../src/services/authService'
import { ApiError } from '../src/services/apiClient'
import { createAuthStore } from '../src/auth/authStore'
import { AuthView } from '../src/auth/AuthGate'
import { AuthPage } from '../src/pages/AuthPage'
process.env.VITE_API_BASE_URL = 'http://enertrade.test'
const user = { id: 'demo', email: 'demo@example.test', name: 'Demo', createdAt: '2026-09-16T00:00:00.000Z' }
const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original })
test('auth service uses cookies and parses public user without returning secrets', async () => {
 const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ user: { ...user, passwordHash: 'should-not-leak' } }))
 expect(await api.login({ email: user.email, password: 'test-only-password' })).toEqual(user)
 expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('include')
 expect(await api.register({ email: user.email, password: 'test-only-password', name: 'Demo' })).toEqual(user)
 expect(await api.me()).toEqual(user)
})
test.each([null, {}, { user: null }, { user: { ...user, id: 1 } }])('rejects malformed response %j', data => {
 expect(() => api.parseAuthUser(data)).toThrow(ApiError)
})
test('backend errors remain visible and logout sends credentials', async () => {
 spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ error: 'INVALID_CREDENTIALS', message: 'Credenciales incorrectas.' }, { status: 401 }))
 try { await api.login({ email: user.email, password: 'wrong' }); throw new Error('Expected rejection') }
 catch (error) { expect(api.authErrorMessage(error)).toBe('Credenciales incorrectas.') }
 const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
 await api.logout(); expect(fetch.mock.calls.at(-1)?.[1]?.credentials).toBe('include')
})
test('store restores session, logs out and accepts login', async () => {
 const store = createAuthStore({ ...api, me: async () => user, login: async () => user, logout: async () => {} })
 await store.refresh(); expect(store.getSnapshot().status).toBe('authenticated')
 await store.logout(); expect(store.getSnapshot().user).toBeNull()
 await store.login({ email: user.email, password: 'test-only-password' }); expect(store.getSnapshot().user).toEqual(user)
})
test('unauthorized bootstrap is anonymous and network failure blocks dashboard', async () => {
 const store = createAuthStore({ ...api, me: async () => { throw new ApiError('http', 'Unauthorized', 401) } })
 await store.refresh(); expect(store.getSnapshot().status).toBe('anonymous')
 const failed = createAuthStore({ ...api, me: async () => { throw new ApiError('network', 'Sin conexion') } })
 await failed.refresh(); expect(failed.getSnapshot().status).toBe('error')
})
test('failed logout does not pretend server session was revoked', async () => {
 const store = createAuthStore({ ...api, me: async () => user, logout: async () => { throw new Error('offline') } })
 await store.refresh(); await expect(store.logout()).rejects.toThrow(); expect(store.getSnapshot().status).toBe('authenticated')
})
test.each(['checking', 'anonymous', 'error'] as const)('guard hides principal UI during %s', status => {
 const html = renderToStaticMarkup(<AuthView state={{ status, user: null, error: 'Visible error' }} retry={() => {}}>PRIVATE DASHBOARD</AuthView>)
 expect(html).not.toContain('PRIVATE DASHBOARD')
 if (status === 'error') expect(html).toContain('role="alert"')
})
test('authenticated guard renders principal UI', () => {
 expect(renderToStaticMarkup(<AuthView state={{ status: 'authenticated', user, error: null }} retry={() => {}}>PRIVATE DASHBOARD</AuthView>)).toContain('PRIVATE DASHBOARD')
})
test('forms provide required fields, password autocomplete and navigation', () => {
 const login = renderToStaticMarkup(<AuthPage />); const register = renderToStaticMarkup(<AuthPage initialMode="register" />)
 expect(login).toContain('current-password'); expect(login).toContain('Crear cuenta'); expect(login).not.toContain('name="name"')
 expect(register).toContain('new-password'); expect(register).toContain('minLength="12"'); expect(register).toContain('name="name"'); expect(register).toContain('Iniciar')
})
