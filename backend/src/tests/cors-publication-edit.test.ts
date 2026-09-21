import { afterAll, expect, test } from 'bun:test';
import { app } from '@/app';

const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim() ?? '';
if (!frontendOrigin) throw new Error('FRONTEND_ORIGIN debe configurarse para probar CORS.');

const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No test server');
const base = `http://127.0.0.1:${address.port}`;

afterAll(() => server.close());

async function preflight(path: string, origin = frontendOrigin) {
  return fetch(`${base}${path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
}

test.each(['/offers/example', '/demands/example'])('preflight autorizado para PATCH en %s conserva CORS estricto', async path => {
  const response = await preflight(path);
  expect(response.status).toBe(204);
  expect(response.headers.get('access-control-allow-origin')).toBe(frontendOrigin);
  expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type, Accept');
  expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, PATCH, OPTIONS');
});

test('origin no autorizado no recibe cabeceras CORS permisivas', async () => {
  const response = await preflight('/offers/example', 'http://unauthorized.test');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('access-control-allow-credentials')).toBeNull();
  expect(response.headers.get('access-control-allow-methods')).toBeNull();
});