import type { RequestHandler } from 'express';
import { requireAuth, type AuthLookup } from './auth.middleware';
export const adminRole: RequestHandler = (req, res, next) => {
 if (req.authUser?.role !== 'ADMIN' || req.authUser.status === 'BLOCKED') { res.status(403).json({ error: 'ADMIN_REQUIRED', message: 'Esta función requiere una cuenta administradora activa.' }); return; }
 next();
};
export function requireAdmin(service?: AuthLookup): RequestHandler[] { return [requireAuth(service), adminRole]; }
export const adminOrigin: RequestHandler = (req, res, next) => {
 res.set('Cache-Control', 'no-store');
 if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
  const origin = req.get('Origin');
  if (req.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== process.env.FRONTEND_ORIGIN?.trim() && origin !== `${req.protocol}://${req.get('host')}`)) {
   res.status(403).json({ error: 'ADMIN_ORIGIN_FORBIDDEN', message: 'El origen de la solicitud no está autorizado.' }); return;
  }
 }
 next();
};
