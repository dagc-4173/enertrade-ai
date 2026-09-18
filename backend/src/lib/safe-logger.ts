import type { Request } from 'express';

export type SafeErrorEvent = {
  timestamp: string;
  level: 'error';
  requestId: string;
  method: string;
  path: string;
  status: 500;
  errorCode: string;
  errorName: string;
};

export type SafeLogger = { error(event: SafeErrorEvent): void };

export const safeLogger: SafeLogger = {
  error: event => console.error(JSON.stringify(event)),
};

export function logUnexpectedError(logger: SafeLogger, req: Request, error: unknown, errorCode: string): void {
  logger.error({
    timestamp: new Date().toISOString(),
    level: 'error',
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status: 500,
    errorCode,
    errorName: error instanceof Error ? error.name : typeof error,
  });
}