import express, { Router, type ErrorRequestHandler, type Request } from 'express';
import { AuthError, createAuthService, sessionLifetimeMs } from '@/services/auth.service';
const cookieName = 'enertrade_session';
function token(req: Request) {
 return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
export function createAuthRouter(service = createAuthService()) {
 const router = Router();
 const attempts = new Map<string, { count: number; until: number }>();
 const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/auth' };
 router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'POST') {
   const origin = req.get('Origin');
   const allowed = process.env.FRONTEND_ORIGIN?.trim();
   if (req.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== allowed && origin !== `${req.protocol}://${req.get('host')}`))
    return next(new AuthError(403, 'AUTH_ORIGIN_FORBIDDEN', 'El origen de la solicitud no está autorizado.'));
   if (!req.is('application/json')) return next(new AuthError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Se requiere Content-Type application/json.'));
   if (req.path === '/login' || req.path === '/register') {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
    const key = req.ip ?? 'unknown';
    const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
    entry.count++; attempts.set(key, entry);
    if (entry.count > 30) {
     res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
     return next(new AuthError(429, 'AUTH_RATE_LIMITED', 'Demasiados intentos. Inténtalo de nuevo más tarde.'));
    }
   }
  }
  next();
 });
 router.use(express.json({ limit: '8kb' }));
 router.post('/register', async (req, res) => { res.status(201).json({ user: await service.register(req.body) }); });
 router.post('/login', async (req, res) => {
  const session = await service.login(req.body, token(req));
  res.cookie(cookieName, session.token, { ...cookieOptions, maxAge: sessionLifetimeMs });
  res.json({ user: session.user });
 });
 router.get('/me', async (req, res) => { res.json({ user: await service.me(token(req)) }); });
 router.post('/logout', async (req, res) => {
  await service.logout(token(req));
  res.clearCookie(cookieName, cookieOptions).status(204).end();
 });
 const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AuthError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
  if (error !== null && typeof error === 'object' && 'type' in error) {
   if (error.type === 'entity.parse.failed') { res.status(400).json({ error: 'INVALID_AUTH_REQUEST', message: 'El cuerpo debe contener JSON válido.' }); return; }
   if (error.type === 'entity.too.large') { res.status(413).json({ error: 'AUTH_REQUEST_TOO_LARGE', message: 'La solicitud es demasiado grande.' }); return; }
   if ('status' in error && error.status === 415) { res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'La codificación del contenido no está admitida.' }); return; }
  }
  res.status(500).json({ error: 'AUTH_FAILED', message: 'No fue posible completar la autenticación.' });
 };
 router.use(errors);
 return router;
}
export const router = createAuthRouter();
