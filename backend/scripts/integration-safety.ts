import 'dotenv/config';

export function configureIsolatedIntegrationDatabase(environment: Record<string, string | undefined> = process.env) {
  const normal = environment.DATABASE_URL;
  const isolated = environment.ENERTRADE_INTEGRATION_DATABASE_URL;
  if (!normal || !isolated || environment.ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE !== 'true') {
    throw new Error('Integration requires an explicitly disposable, separate database.');
  }
  const identity = (text: string) => {
    let url: URL;
    try { url = new URL(text); } catch { throw new Error('Invalid integration database configuration.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/') throw new Error('Invalid integration database configuration.');
    if ([...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'port', 'database', 'dbname', 'service'].includes(key.toLowerCase()))) throw new Error('Database routing overrides are not allowed for integration.');
    return decodeURIComponent(url.pathname);
  };
  if (identity(normal) === identity(isolated)) throw new Error('Integration must not use the normal database.');
  const target = new URL(isolated);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname.toLowerCase())) throw new Error('Integration requires an authorized loopback host.');
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (!/^[A-Za-z0-9_-]+$/.test(databaseName) || !/(?:^|[_-])(?:test|testing|disposable)(?:[_-]|$)/i.test(databaseName)) throw new Error('Integration database name must have an explicit test/testing/disposable marker.');
  environment.DATABASE_URL = isolated;
}