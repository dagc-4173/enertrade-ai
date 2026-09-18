import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
};