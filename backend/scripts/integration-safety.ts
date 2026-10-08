import 'dotenv/config';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export type PostgreSQLDatabaseIdentity = { host: string; port: number; database: string; user: string };

export function postgresDatabaseIdentity(text: string): PostgreSQLDatabaseIdentity {
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('Invalid integration database configuration.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/') throw new Error('Invalid integration database configuration.');
  if ([...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'port', 'database', 'dbname', 'service', 'user'].includes(key.toLowerCase()))) throw new Error('Database routing overrides are not allowed for integration.');
  const hostname = url.hostname.toLowerCase();
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ? 'loopback' : hostname;
  return { host, port: Number(url.port || '5432'), database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username) };
}

export function assertSeparateDisposableDatabase(normalText: string, isolatedText: string): { normal: PostgreSQLDatabaseIdentity; isolated: PostgreSQLDatabaseIdentity } {
  const normal = postgresDatabaseIdentity(normalText);
  const isolated = postgresDatabaseIdentity(isolatedText);
  if (normal.host === isolated.host && normal.port === isolated.port && normal.database === isolated.database) {
    throw new Error('Integration must not use the normal database, regardless of database user.');
  }
  return { normal, isolated };
}

function isNeonHost(host: string) {
  return host.toLowerCase().endsWith('.neon.tech');
}

function isUnderTemporaryDirectory(path: string) {
  const relativePath = relative(resolve(tmpdir()), resolve(path));
  return relativePath.length > 0 && relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

export function assertNeonC4DisposableDatabase(environment: Record<string, string | undefined>, normalText: string, isolatedText: string) {
  if (environment.ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE !== 'true') throw new Error('Neon C4 integration requires the explicit disposable marker.');
  const primary = postgresDatabaseIdentity(isolatedText);
  if (!isNeonHost(primary.host)) throw new Error('Remote integration is allowed only for Neon C4 databases.');
  if (!/^enertrade_c4_(?:test|disposable)(?:_(?!shadow(?:_|$))[a-z0-9]+)*$/i.test(primary.database)) throw new Error('Neon C4 primary database name is not explicitly disposable.');
  const { normal } = assertSeparateDisposableDatabase(normalText, isolatedText);
  if (normal.host === primary.host && normal.port === primary.port && normal.database === primary.database) throw new Error('Neon C4 primary identity matches the protected habitual database.');

  const shadowText = environment.VALIDATION_SHADOW_DATABASE_URL;
  if (!shadowText) throw new Error('Neon C4 integration requires a separate shadow database.');
  const shadow = postgresDatabaseIdentity(shadowText);
  if (!isNeonHost(shadow.host)) throw new Error('Neon C4 shadow database must also be hosted by Neon.');
  if (!/^enertrade_c4_(?:(?:shadow)_(?:test|disposable)|(?:test|disposable)_shadow)(?:_[a-z0-9]+)*$/i.test(shadow.database)) throw new Error('Neon C4 shadow database name must explicitly identify a shadow.');
  if (shadow.host !== primary.host || shadow.port !== primary.port) throw new Error('Neon C4 primary and shadow must belong to the same Neon branch endpoint.');
  if (shadow.database === primary.database) throw new Error('Neon C4 primary and shadow databases must be distinct.');
  const habitual = postgresDatabaseIdentity(normalText);
  if (shadow.host === habitual.host && shadow.port === habitual.port && shadow.database === habitual.database) throw new Error('Neon C4 shadow identity matches the protected habitual database.');

  if (!environment.VALIDATION_ROOT || !isUnderTemporaryDirectory(environment.VALIDATION_ROOT)) throw new Error('Neon C4 validation artifacts must remain under the operating-system temporary directory.');
  if (!environment.VALIDATION_RUN_ID || !/^[A-Za-z0-9_-]{1,128}$/.test(environment.VALIDATION_RUN_ID)) throw new Error('Neon C4 integration requires a valid validation run ID.');
  return { primary, shadow };
}

export function configureIsolatedIntegrationDatabase(environment: Record<string, string | undefined> = process.env) {
  const normal = environment.DATABASE_URL;
  const isolated = environment.ENERTRADE_INTEGRATION_DATABASE_URL;
  if (!normal || !isolated || environment.ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE !== 'true') {
    throw new Error('Integration requires an explicitly disposable, separate database.');
  }
  assertSeparateDisposableDatabase(normal, isolated);
  const target = new URL(isolated);
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (['localhost', '127.0.0.1', '[::1]'].includes(target.hostname.toLowerCase())) {
    if (!/^[A-Za-z0-9_-]+$/.test(databaseName) || !/(?:^|[_-])(?:test|testing|disposable)(?:[_-]|$)/i.test(databaseName)) throw new Error('Integration database name must have an explicit test/testing/disposable marker.');
  } else {
    assertNeonC4DisposableDatabase(environment, normal, isolated);
  }
  environment.DATABASE_URL = isolated;
}