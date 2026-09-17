import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuthError, createAuthService, sessionTokenFromCookieHeader, type AuthUser } from '@/services/auth.service';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export interface AuthLookup {
  me(token?: string): Promise<AuthUser>;
}

export function requireAuth(service: AuthLookup = createAuthService()): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.authUser = await service.me(sessionTokenFromCookieHeader(req.headers.cookie));
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.status).json({ error: error.code, message: error.message });
        return;
      }
      res.status(500).json({ error: 'AUTH_FAILED', message: 'No fue posible validar la sesión.' });
    }
  };
}
