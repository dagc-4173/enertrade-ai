import { strict as assert } from 'node:assert';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { parse } = require('dotenv');
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const normalConfig = parse(readFileSync(join(repoRoot, 'backend/.env')));
const normal = new URL(normalConfig.DATABASE_URL);
const targetText = process.env.ENERTRADE_INTEGRATION_DATABASE_URL;
assert(targetText && process.env.ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE === 'true', 'Explicit disposable configuration required');
const target = new URL(targetText);
assert(['postgres:', 'postgresql:'].includes(target.protocol), 'PostgreSQL target required');
const targetDatabase = decodeURIComponent(target.pathname.slice(1));
assert(/^[A-Za-z0-9_-]+$/.test(targetDatabase) && /(?:^|[_-])(?:test|testing|disposable)(?:[_-]|$)/i.test(targetDatabase), 'Marked database name required');
const { assertSeparateDisposableDatabase, configureIsolatedIntegrationDatabase, postgresDatabaseIdentity } = await import('./integration-safety');
const targetIdentity = assertSeparateDisposableDatabase(normalConfig.DATABASE_URL, targetText).isolated;
assert(process.env.VALIDATION_ROOT && process.env.VALIDATION_RUN_ID, 'Unique validation directory/run required');
const validationRoot = resolve(process.env.VALIDATION_ROOT);
const pathFromTemp = relative(resolve(tmpdir()), validationRoot);
assert(pathFromTemp !== '..' && !pathFromTemp.startsWith(`..${sep}`) && !isAbsolute(pathFromTemp), 'Validation artifacts must remain under the operating-system temporary directory');
mkdirSync(validationRoot, { recursive: true });
 configureIsolatedIntegrationDatabase({ ...process.env, DATABASE_URL: normalConfig.DATABASE_URL });
process.env.DATABASE_URL = targetText;
const runId = process.env.VALIDATION_RUN_ID;
const reportPath = join(validationRoot, 'validation-results.json');
const report: any = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {
  runId, startedAt: new Date().toISOString(), baseline: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  target: { host: targetIdentity.host === 'loopback' ? 'loopback' : 'Neon endpoint redacted', port: targetIdentity.port, database: targetDatabase },
  habitual: { host: 'redacted', database: 'redacted', connected: false }, cases: [], checkpoints: {},
};
assert(report.runId === runId && report.target.database === target.pathname.slice(1), 'Existing evidence belongs to another database/run');
const database = new Client({ connectionString: targetText });
const tables = ['User', 'AuthSession', 'EnergyPublication', 'EnergyOffer', 'EnergyDemand', 'EnergyTransaction', 'EnergyTransactionRevision', 'SimulationCapacityProfile', 'PublicationVerification', 'SimulatedPaymentAttempt', 'MatchingExecution', 'AiQueryTrace'];
const sanitizeLocalPaths = (value: any): any => typeof value === 'string' ? value.replace(/\b[A-Za-z]:\\[^\r\n"'<>]+/g, '[local path redacted]') : Array.isArray(value) ? value.map(sanitizeLocalPaths) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeLocalPaths(child)])) : value;
const save = () => writeFileSync(reportPath, JSON.stringify(sanitizeLocalPaths(report), null, 2));
const record = (id: string, component: string, expected: string, obtained: unknown, status = 'PASSED') => {
  if (status === 'PASSED') for (const previous of report.cases) if (previous.id === `PG-${process.argv[2]}-FAILURE` && previous.status === 'FAILED') previous.supersededBy = id;
  report.cases.push({ id, component, expected, obtained: sanitizeLocalPaths(obtained), status, timestamp: new Date().toISOString() });
  save(); console.log(JSON.stringify({ id, status }));
};

async function counts() {
  const result: Record<string, number | null> = {};
  for (const table of tables) {
    const exists = (await database.query('SELECT to_regclass($1) AS name', [`public."${table}"`])).rows[0].name;
    result[table] = exists ? Number((await database.query(`SELECT count(*) FROM "${table}"`)).rows[0].count) : null;
  }
  return result;
}

async function controls() {
  const result: Record<string, unknown> = {};
  for (const [table, field, ids] of [
    ['User', 'id', report.controls.userIds], ['EnergyOffer', 'id', report.controls.offerIds],
    ['EnergyDemand', 'id', report.controls.demandIds], ['EnergyTransaction', 'id', report.controls.transactionIds],
    ['EnergyPublication', 'id', report.controls.publicationIds ?? []],
  ] as const) {
    if (!ids.length) continue;
    result[table] = (await database.query(`SELECT to_jsonb(row) AS value FROM "${table}" row WHERE "${field}" = ANY($1::uuid[]) ORDER BY "id"`, [ids])).rows.map((row: any) => row.value);
  }
  return result;
}

function protectedHashes() {
  const files = new Set<string>();
  const gitFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\0');
  for (const path of gitFiles) if (/hu-?06|demand-v5|demand-forecast|demand-ridge|demandasin/i.test(path)) files.add(path);
  const walk = (path: string) => {
    if (!existsSync(join(repoRoot, path))) return;
    for (const entry of readdirSync(join(repoRoot, path), { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(child); else if (entry.isFile()) files.add(child);
    }
  };
  walk('docs/evidencias/hu-06-demandasin');
  return Object.fromEntries([...files].sort().filter(path => existsSync(join(repoRoot, path))).map(path => [path, createHash('sha256').update(readFileSync(join(repoRoot, path))).digest('hex')]));
}

async function bootstrap() {
  assert(!report.controls, 'Control fixtures already exist; do not duplicate');
  report.protectedBefore = protectedHashes();
  report.initialCounts = await counts();
  const seller = randomUUID(), buyer = randomUUID(), offer = randomUUID(), demand = randomUUID(), transaction = randomUUID();
  report.controls = { userIds: [seller, buyer], offerIds: [offer], demandIds: [demand], transactionIds: [transaction], publicationIds: [] };
  save();
  await database.query('BEGIN');
  try {
    for (const [id, role] of [[seller, 'seller'], [buyer, 'buyer']]) await database.query('INSERT INTO "User" ("id","email","name","passwordHash","updatedAt") VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)', [id, `${runId}-control-${role}@example.test`, `${runId}:external-control:${role}`, 'disabled-validation-control']);
    await database.query('INSERT INTO "EnergyOffer" ("id","userId","quantityKwh","pricePerKwh","deliveryDate","updatedAt") VALUES ($1,$2,10.25,900,$3,CURRENT_TIMESTAMP)', [offer, seller, '2026-10-06']);
    await database.query('INSERT INTO "EnergyDemand" ("id","userId","quantityKwh","maxPricePerKwh","deliveryDate","updatedAt") VALUES ($1,$2,10.25,950,$3,CURRENT_TIMESTAMP)', [demand, buyer, '2026-10-06']);
    await database.query('INSERT INTO "EnergyTransaction" ("id","offerId","demandId","sellerUserId","buyerUserId","quantityKwh","pricePerKwh","totalAmountCop","deliveryDate","updatedAt") VALUES ($1,$2,$3,$4,$5,1.25,900,1125,$6,CURRENT_TIMESTAMP)', [transaction, offer, demand, seller, buyer, '2026-10-06']);
    await database.query('COMMIT');
  } catch (error) { await database.query('ROLLBACK'); throw error; }
  report.legacyBefore = await controls();
  report.controlCounts = await counts();
  record('PG-LEGACY-SETUP', 'Legacy', 'Legacy control rows before hourly columns exist', { counts: report.controlCounts, protectedFiles: Object.keys(report.protectedBefore).length });
}

async function catalog(label: string) {
  const constraints = (await database.query(`SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype, c.convalidated, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON c.connamespace=n.oid WHERE n.nspname='public' ORDER BY table_name,c.conname`)).rows;
  const indexes = (await database.query(`SELECT t.relname AS table_name,i.relname AS index_name,x.indisunique,x.indisvalid,pg_get_indexdef(i.oid) AS definition,pg_get_expr(x.indpred,x.indrelid) AS predicate FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,i.relname`)).rows;
  const columns = (await database.query(`SELECT table_name,column_name,is_nullable,data_type,udt_name,numeric_precision,numeric_scale,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
  const migrations = (await database.query('SELECT migration_name,checksum,started_at,finished_at,rolled_back_at,applied_steps_count FROM "_prisma_migrations" ORDER BY started_at')).rows;
  assert(migrations.every((row: any) => row.finished_at && !row.rolled_back_at), 'Unfinished migration found');
  for (const row of migrations) {
    const sql = readFileSync(join(repoRoot, 'backend/prisma/migrations', row.migration_name, 'migration.sql'));
    assert.equal(row.checksum, createHash('sha256').update(sql).digest('hex'), `Migration checksum mismatch: ${row.migration_name}`);
  }
  const current: any = await controls();
  for (const [table, previous] of Object.entries(report.legacyBefore) as [string, any[]][]) {
    for (const prior of previous) {
      const next = current[table].find((row: any) => row.id === prior.id);
      assert(next, 'Legacy row disappeared');
      assert.deepEqual(Object.fromEntries(Object.keys(prior).map(key => [key, next[key]])), prior, 'Legacy values changed during migration');
      for (const key of ['hour', 'publicationId', 'batchId']) if (key in next) assert.equal(next[key], null, 'Migration inferred legacy identity');
    }
  }
  report.checkpoints[label] = { at: new Date().toISOString(), constraints, indexes, columns, migrations, counts: await counts() };
  record(`PG-MIGRATION-${label}`, 'Migration/catalog', 'Finished migration/checksum and legacy unchanged', { migrations: migrations.length, constraints: constraints.length, indexes: indexes.length });
}

async function prepare() {
  const current = report.checkpoints.payments;
  assert(current && current.migrations.length === 19, 'Final migration checkpoint required');
  const checks = ['EnergyPublication_kind_check', 'EnergyOffer_hour_check', 'EnergyOffer_hour_parent_check', 'EnergyDemand_hour_check', 'EnergyDemand_hour_parent_check', 'EnergyTransaction_hour_check', 'SimulationCapacityProfile_version_check', 'SimulationCapacityProfile_kind_check', 'SimulationCapacityProfile_source_check', 'PublicationVerification_target_check', 'PublicationVerification_status_check', 'SimulatedPaymentAttempt_amountCop_check', 'SimulatedPaymentAttempt_currency_check', 'SimulatedPaymentAttempt_receipt_check', 'SimulatedPaymentAttempt_resolution_check'];
  for (const name of checks) assert(current.constraints.some((row: any) => row.conname === name && row.contype === 'c' && row.convalidated), `Missing validated CHECK: ${name}`);
  const foreignKeys = ['EnergyPublication_userId_fkey', 'EnergyOffer_publicationId_fkey', 'EnergyDemand_publicationId_fkey', 'SimulationCapacityProfile_userId_fkey', 'PublicationVerification_userId_fkey', 'PublicationVerification_offerId_fkey', 'PublicationVerification_demandId_fkey', 'PublicationVerification_profileId_fkey', 'SimulatedPaymentAttempt_transactionId_fkey', 'SimulatedPaymentAttempt_payerUserId_fkey'];
  for (const name of foreignKeys) assert(current.constraints.some((row: any) => row.conname === name && row.contype === 'f' && row.convalidated && row.definition.includes('ON DELETE RESTRICT')), `Missing restrictive FK: ${name}`);
  const uniqueIndexes = ['EnergyPublication_userId_kind_deliveryDate_key', 'EnergyOffer_publicationId_hour_key', 'EnergyDemand_publicationId_hour_key', 'SimulationCapacityProfile_userId_kind_version_key', 'SimulatedPaymentAttempt_transactionId_requestKey_key', 'SimulatedPaymentAttempt_receiptReference_key'];
  for (const name of uniqueIndexes) assert(current.indexes.some((row: any) => row.index_name === name && row.indisunique && row.indisvalid), `Missing unique index: ${name}`);
  for (const [name, status] of [['SimulatedPaymentAttempt_one_approved', 'APPROVED'], ['SimulatedPaymentAttempt_one_pending', 'PENDING']]) {
    const index = current.indexes.find((row: any) => row.index_name === name);
    assert(index?.indisunique && index.indisvalid && index.predicate?.includes(status) && index.definition.includes('"transactionId"'), `Missing partial index: ${name}`);
  }
  for (const [table, fields] of [['EnergyOffer', ['hour', 'publicationId']], ['EnergyDemand', ['hour', 'publicationId']], ['EnergyTransaction', ['hour', 'batchId']], ['PublicationVerification', ['offerId', 'demandId', 'profileId']], ['SimulatedPaymentAttempt', ['receiptReference', 'resolvedAt']]] as const) {
    for (const field of fields) assert(current.columns.some((row: any) => row.table_name === table && row.column_name === field && row.is_nullable === 'YES'), `Wrong nullability: ${table}.${field}`);
  }
  for (const table of ['EnergyOffer', 'EnergyDemand', 'EnergyTransaction']) {
    assert(current.columns.some((row: any) => row.table_name === table && row.column_name === 'quantityKwh' && row.numeric_precision === 20 && row.numeric_scale === 2), 'Quantity precision/scale changed');
  }
  assert(current.columns.some((row: any) => row.table_name === 'SimulatedPaymentAttempt' && row.column_name === 'amountCop' && row.numeric_precision === 38 && row.numeric_scale === 7), 'Payment precision changed');
  report.sqlOnlyGuarantees = { checks, partialIndexes: ['SimulatedPaymentAttempt_one_approved', 'SimulatedPaymentAttempt_one_pending'] };
  report.drift = { schemaVsReal: readFileSync(join(process.env.VALIDATION_ROOT!, 'schema-vs-real.sql'), 'utf8'), migrationsVsReal: readFileSync(join(process.env.VALIDATION_ROOT!, 'migrations-vs-real.sql'), 'utf8'), caveat: 'Prisma diff excludes unsupported SQL guarantees; checked separately against pg_catalog and negative writes.' };
  assert(report.drift.schemaVsReal.includes('empty migration') && report.drift.migrationsVsReal.includes('empty migration'), 'Representable drift found');
  record('PG-SCHEMA-GUARANTEES', 'Schema/drift', '15 CHECK, 10 FK, 6 unique, 2 partial indexes, nullable legacy columns and unchanged scales', { checks: checks.length, foreignKeys: foreignKeys.length, uniqueIndexes: uniqueIndexes.length, partialIndexes: 2, representableDrift: false });
  if (!report.controls.hourlyPrepared) {
    const [seller, buyer] = report.controls.userIds;
    const offerPublication = randomUUID(), demandPublication = randomUUID(), offer = randomUUID(), demand = randomUUID(), transaction = randomUUID();
    await database.query('BEGIN');
    try {
      for (const [id, user, kind] of [[offerPublication, seller, 'offer'], [demandPublication, buyer, 'demand']]) await database.query('INSERT INTO "EnergyPublication" ("id","userId","kind","deliveryDate") VALUES ($1,$2,$3,$4)', [id, user, kind, '2026-10-06']);
      await database.query('INSERT INTO "EnergyOffer" ("id","userId","quantityKwh","pricePerKwh","deliveryDate","hour","publicationId","updatedAt") VALUES ($1,$2,10,900,$3,8,$4,CURRENT_TIMESTAMP)', [offer, seller, '2026-10-06', offerPublication]);
      await database.query('INSERT INTO "EnergyDemand" ("id","userId","quantityKwh","maxPricePerKwh","deliveryDate","hour","publicationId","updatedAt") VALUES ($1,$2,10,950,$3,8,$4,CURRENT_TIMESTAMP)', [demand, buyer, '2026-10-06', demandPublication]);
      await database.query('INSERT INTO "EnergyTransaction" ("id","offerId","demandId","sellerUserId","buyerUserId","quantityKwh","pricePerKwh","totalAmountCop","deliveryDate","hour","updatedAt") VALUES ($1,$2,$3,$4,$5,1,900,900,$6,8,CURRENT_TIMESTAMP)', [transaction, offer, demand, seller, buyer, '2026-10-06']);
      await database.query('COMMIT');
    } catch (error) { await database.query('ROLLBACK'); throw error; }
    report.controls.offerIds.push(offer); report.controls.demandIds.push(demand); report.controls.transactionIds.push(transaction); report.controls.publicationIds.push(offerPublication, demandPublication); report.controls.hourlyPrepared = true;
  }
  report.controlsSnapshot = await controls();
  report.beforeIntegrationCounts = await counts();
  record('PG-EXTERNAL-CONTROLS', 'Isolation', 'Legacy and expired hourly controls remain ACTIVE/pending, outside every fixture scope', { counts: report.beforeIntegrationCounts });
}

async function runIntegrationScripts() {
  assert(report.controlsSnapshot, 'External control snapshot required');
  report.scriptOutputs ??= {};
  for (const script of ['hourly-integration.ts', 'verification-integration.ts', 'verification-gate-integration.ts', 'payment-integration.ts']) {
    const before = await counts();
    const result = Bun.spawnSync([process.execPath, join(repoRoot, 'backend/scripts', script)], {
      cwd: join(repoRoot, 'backend'),
      env: { ...process.env, DATABASE_URL: `postgresql://safety_reference@127.0.0.1:1/${normal.pathname.slice(1)}`, ENERTRADE_INTEGRATION_DATABASE_URL: targetText!, ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' },
      stdout: 'pipe', stderr: 'pipe',
    });
    const output = new TextDecoder().decode(result.stdout);
    const events = output.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    const summary = events.find(value => value.status === 'passed' && typeof value.tests === 'number');
    const after = await counts();
    const intact = JSON.stringify(await controls()) === JSON.stringify(report.controlsSnapshot);
    const clean = JSON.stringify(before) === JSON.stringify(after);
    report.scriptOutputs[script] = { exitCode: result.exitCode, events, stderr: new TextDecoder().decode(result.stderr), before, after, externalControlsIntact: intact, cleanupCountsEqual: clean };
    record(`PG-SCRIPT-${script}`, 'HTTP integration', 'Script passes, cleanup restores counts and external controls remain intact', { exitCode: result.exitCode, tests: summary?.tests ?? null, clean, intact }, result.exitCode === 0 && summary && clean && intact ? 'PASSED' : 'FAILED');
  }
  record('PG-HU20-FULL-SCRIPT', 'HU-20 integration', 'Keep non-portable legacy runner outside current C4 execution', 'NOT_RUN: fixed PreparedDataset IDs/versions and legacy matching setup; execute only after a dedicated HU-20 dataset fixture exists.', 'NOT_RUN');
}

async function flows() {
  const { prisma } = await import('../src/lib/prisma');
  const { Prisma } = await import('../src/generated/prisma/client');
  const { createApp } = await import('../src/app');
  const { authCookieName } = await import('../src/services/auth.service');
  const { publicationWindow } = await import('../src/services/hourly-publication.contract');
  const { buildMatchingSuggestions } = await import('../src/services/matching.service');
  const { createEnergyTransactionService } = await import('../src/services/energy-transaction.service');
  const { expireActivePublications } = await import('../src/services/publication-expiration.service');
  const { withBrowserFlowFixture } = await import('./browser-flow-fixture');
  const { configureIsolatedIntegrationDatabase } = await import('./integration-safety');
  const users: string[] = [];
  const matchingIds: string[] = [];
  const before = await counts();
  report.workflowUserIds = users;
  const errorInfo = (error: any) => ({ name: error?.name, ...(error?.code ? { code: error.code } : {}), ...(error?.status ? { status: error.status } : {}), ...(error?.constraint ? { constraint: error.constraint } : {}), ...(error?.meta?.driverAdapterError?.cause?.originalCode ? { sqlState: error.meta.driverAdapterError.cause.originalCode } : {}), message: error instanceof Error ? error.message.slice(0, 800) : 'Validation failed' });
  const check = async (id: string, component: string, expected: string, work: () => Promise<unknown>) => {
    try { record(id, component, expected, await work()); }
    catch (error) { record(id, component, expected, errorInfo(error), 'FAILED'); }
  };
  const sqlReject = async (id: string, expected: string, sql: string, parameters: unknown[]) => {
    await check(id, 'PostgreSQL constraints', `SQLSTATE ${expected}; statement rolled back`, async () => {
      await database.query('BEGIN');
      try {
        let failure: any;
        try { await database.query(sql, parameters); } catch (error) { failure = error; }
        assert(failure, 'PostgreSQL accepted an invalid fixture write');
        assert.equal(failure.code, expected);
        return { sqlState: failure.code, constraint: failure.constraint ?? null };
      } finally { await database.query('ROLLBACK'); }
    });
  };
  const actor = async (role: string) => {
    const user = await prisma.user.create({ data: { email: `${runId}-${role}@example.test`, name: `${runId}:workflow:${role}`, passwordHash: 'disabled-validation-fixture' } });
    users.push(user.id); save();
    const token = randomBytes(32).toString('base64url');
    await prisma.authSession.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, cookie: `${authCookieName}=${token}` };
  };
  const server = createApp({ expirationScope: { userIds: users } }).listen(0, '127.0.0.1');
  await new Promise<void>((resolveListening, reject) => { if (server.listening) resolveListening(); else { server.once('listening', resolveListening); server.once('error', reject); } });
  const address = server.address(); assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const request = async (cookie: string, path: string, body?: unknown, method?: string) => {
    const response = await fetch(base + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: response.status, data: await response.json() as any };
  };
  try {
    const seller = await actor('seller'), buyer = await actor('buyer');
    const dates = publicationWindow().dates;
    const deliveryDate = dates[0]!;
    const publish = async (cookie: string, kind: string, hours: number[], quantity = 10.25) => {
      const result = await request(cookie, '/publications', { kind, days: [{ deliveryDate, hours: hours.map(hour => ({ hour, quantityKwh: quantity, pricePerKwh: kind === 'offer' ? 900 : 1100 })) }] });
      assert.equal(result.status, 201);
    };
    await publish(seller.cookie, 'offer', [8]);
    await publish(seller.cookie, 'demand', [8]);
    await publish(buyer.cookie, 'demand', [8]);
    await publish(seller.cookie, 'offer', [9, 10, 11, 12, 13], 10);
    await publish(buyer.cookie, 'demand', [9, 10, 11, 12, 13], 10);
    const offer = await prisma.energyOffer.findFirstOrThrow({ where: { userId: seller.id, hour: 8 } });
    const demand = await prisma.energyDemand.findFirstOrThrow({ where: { userId: buyer.id, hour: 8 } });
    const selfDemand = await prisma.energyDemand.findFirstOrThrow({ where: { userId: seller.id, hour: 8 } });
    await prisma.energyDemand.update({ where: { id: selfDemand.id }, data: { createdAt: new Date(demand.createdAt.getTime() - 1000) } });
    let profileId = '', verificationId = '';
    await check('PG-VERIFY-OFFER-DEMAND', 'Verification', 'Exact limits, versioned snapshots and NO_REFERENCE for both kinds', async () => {
      for (const [kind, actorValue, publication] of [['offer', seller, offer], ['demand', buyer, demand]] as const) {
        const absent = await request(actorValue.cookie, `/publication-verifications/${kind}/${publication.id}`, {});
        assert.equal(absent.status, 201); assert.equal(absent.data.verification.status, 'NO_REFERENCE');
        const profile = await request(actorValue.cookie, '/publication-verifications/profiles', { kind, limits: [{ hour: 8, maxQuantityKwh: '10.25' }] });
        assert.equal(profile.status, 201); assert.equal(profile.data.profile.version, 1);
        const verified = await request(actorValue.cookie, `/publication-verifications/${kind}/${publication.id}`, {});
        assert.equal(verified.data.verification.status, 'APPROVED');
        const stored = await prisma.publicationVerification.findUniqueOrThrow({ where: { id: verified.data.verification.id } });
        assert.equal(stored.ruleId, 'declared-hourly-capacity'); assert.equal(stored.ruleVersion, '1.0.0');
        assert.equal((stored.inputSnapshot as any).quantityKwh, '10.25'); assert.equal((stored.inputSnapshot as any).hour, 8);
        if (kind === 'offer') { profileId = profile.data.profile.id; verificationId = stored.id; }
      }
      const selfProfile = await request(seller.cookie, '/publication-verifications/profiles', { kind: 'demand', limits: [{ hour: 8, maxQuantityKwh: '10.25' }] });
      assert.equal(selfProfile.status, 201);
      const selfVerified = await request(seller.cookie, `/publication-verifications/demand/${selfDemand.id}`, {});
      assert.equal(selfVerified.data.verification.status, 'APPROVED');
      const lower = await request(seller.cookie, '/publication-verifications/profiles', { kind: 'offer', limits: [{ hour: 8, maxQuantityKwh: '10.24' }] });
      assert.equal(lower.data.profile.version, 2);
      const list = await request(seller.cookie, '/offers/mine'); assert.equal(list.data.offers.find((row: any) => row.id === offer.id).verification.status, 'OUTDATED');
      const rejected = await request(seller.cookie, `/publication-verifications/offer/${offer.id}`, {}); assert.equal(rejected.data.verification.status, 'REJECTED');
      assert.equal((await prisma.simulationCapacityProfile.findUniqueOrThrow({ where: { id: profileId } })).version, 1);
      return { kinds: ['offer', 'demand'], exactLimit: '10.25', lowerLimit: '10.24', originalVersionIntact: true };
    });
    let executionId = '';
    await check('PG-MATCHING-BLOCKED', 'Matching/gate', 'A rejected current verification excludes its hourly publication from matching', async () => {
      const matching = await request(seller.cookie, '/matches/suggest', {}); assert.equal(matching.status, 200); assert.equal(matching.data.trace.persistence, 'persisted');
      executionId = matching.data.trace.executionId; matchingIds.push(executionId);
      const stored = await prisma.matchingExecution.findUniqueOrThrow({ where: { id: executionId } });
      assert.equal(stored.criteriaVersion, 'matching-hourly-v2');
      const input = stored.inputSnapshot as any;
      const replay = buildMatchingSuggestions(input.offers.map((row: any) => ({ ...row, status: 'ACTIVE' })), input.demands.map((row: any) => ({ ...row, status: 'ACTIVE' })));
      assert.deepEqual(replay, stored.resultSnapshot);
      assert(!matching.data.matches.some((row: any) => row.offerId === offer.id));
      for (const user of users) assert(!JSON.stringify(input).includes(user));
      assert(!JSON.stringify(input).includes('email') && !JSON.stringify(input).includes('password') && !JSON.stringify(input).includes('userId'));
      return { executionId, method: stored.criteriaVersion, replayEqual: true, rejectedPublicationExcluded: true };
    });
    let confirmedId = '';
    await check('PG-NEGOTIATION-BATCH', 'Transactions', 'Hourly batch reservation, counter, exact amount, acceptance and internal batchId', async () => {
      const deliveryDateValue = new Date(`${deliveryDate}T00:00:00.000Z`);
      const allOffers = await prisma.energyOffer.findMany({ where: { userId: seller.id, deliveryDate: deliveryDateValue }, orderBy: { hour: 'asc' } });
      const allDemands = await prisma.energyDemand.findMany({ where: { userId: buyer.id, deliveryDate: deliveryDateValue }, orderBy: { hour: 'asc' } });
      assert.equal(allOffers.length, 6); assert.equal(allDemands.length, 6);
      for (const [actorValue, kind, rows] of [[seller, 'offer', allOffers], [buyer, 'demand', allDemands]] as const) {
        const profile = await request(actorValue.cookie, '/publication-verifications/profiles', { kind, limits: rows.map(row => ({ hour: row.hour, maxQuantityKwh: row.hour === 8 ? '10.25' : '10' })) });
        assert.equal(profile.status, 201);
        for (const row of rows) assert.equal((await request(actorValue.cookie, `/publication-verifications/${kind}/${row.id}`, {})).data.verification.status, 'APPROVED');
      }
      const selfProfile = await request(seller.cookie, '/publication-verifications/profiles', { kind: 'demand', limits: [{ hour: 8, maxQuantityKwh: '10.25' }] });
      assert.equal(selfProfile.status, 201);
      assert.equal((await request(seller.cookie, `/publication-verifications/demand/${selfDemand.id}`, {})).data.verification.status, 'APPROVED');
      const matching = await request(seller.cookie, '/matches/suggest', {}); assert.equal(matching.status, 200);
      executionId = matching.data.trace.executionId; matchingIds.push(executionId);
      assert(matching.data.matches.some((row: any) => row.offerId === offer.id && row.demandId === demand.id && row.hour === 8));
      assert(!matching.data.matches.some((row: any) => row.offerId === offer.id && row.demandId === selfDemand.id));
      const matchingExecution = await prisma.matchingExecution.findUniqueOrThrow({ where: { id: executionId } });
      const matchingInput = matchingExecution.inputSnapshot as any;
      assert.equal(matchingExecution.criteriaVersion, 'matching-hourly-v2');
      assert.equal(matchingInput.offers.find((row: any) => row.id === offer.id).participantKey, matchingInput.demands.find((row: any) => row.id === selfDemand.id).participantKey);
      const created = await request(seller.cookie, '/transactions/batch', { proposals: [{ offerId: offer.id, demandId: demand.id, quantityKwh: 2, pricePerKwh: 900, ...(executionId ? { matchingExecutionId: executionId } : {}) }] });
      assert.equal(created.status, 201); assert.equal(created.data.transactions[0].hour, 8); assert(!('batchId' in created.data.transactions[0]));
      const id = created.data.transactions[0].id;
      assert.equal((await prisma.energyTransaction.findUniqueOrThrow({ where: { id } })).batchId, created.data.batchId);
      assert.equal((await request(seller.cookie, '/offers/mine')).data.offers.find((row: any) => row.id === offer.id).reservedQuantityKwh, 2);
      const counter = await request(buyer.cookie, `/transactions/${id}/counter`, { quantityKwh: '1.25', pricePerKwh: '980.12345' }); assert.equal(counter.status, 200);
      const accepted = await request(seller.cookie, `/transactions/${id}/accept`, {}); assert.equal(accepted.status, 200); assert.equal(accepted.data.transaction.status, 'CONFIRMED');
      assert.equal(accepted.data.transaction.totalAmountCop, new Prisma.Decimal('1.25').times('980.12345').toString());
      assert.equal(await prisma.energyTransactionRevision.count({ where: { transactionId: id } }), 2);
      confirmedId = id;
      return { hour: 8, batchIdInternal: created.data.batchId, confirmed: true, exactAmount: accepted.data.transaction.totalAmountCop, revisions: 2 };
    });

    await sqlReject('PG-CHECK-OFFER-HOUR', '23514', 'UPDATE "EnergyOffer" SET "hour"=24 WHERE "id"=$1', [offer.id]);
    await sqlReject('PG-CHECK-DEMAND-HOUR', '23514', 'UPDATE "EnergyDemand" SET "hour"=-1 WHERE "id"=$1', [demand.id]);
    await sqlReject('PG-CHECK-OFFER-PARENT', '23514', 'UPDATE "EnergyOffer" SET "publicationId"=NULL WHERE "id"=$1', [offer.id]);
    await sqlReject('PG-CHECK-DEMAND-PARENT', '23514', 'UPDATE "EnergyDemand" SET "hour"=NULL WHERE "id"=$1', [demand.id]);
    await sqlReject('PG-CHECK-PUBLICATION-KIND', '23514', 'UPDATE "EnergyPublication" SET "kind"=$1 WHERE "id"=$2', ['unsupported', offer.publicationId]);
    await sqlReject('PG-FK-PUBLICATION', '23503', 'UPDATE "EnergyOffer" SET "publicationId"=$1 WHERE "id"=$2', [randomUUID(), offer.id]);
    await sqlReject('PG-UNIQUE-PUBLICATION', '23505', 'INSERT INTO "EnergyPublication" ("id","userId","kind","deliveryDate") VALUES ($1,$2,$3,$4)', [randomUUID(), seller.id, 'offer', deliveryDate]);
    await sqlReject('PG-UNIQUE-OFFER-HOUR', '23505', 'INSERT INTO "EnergyOffer" ("id","userId","quantityKwh","pricePerKwh","deliveryDate","hour","publicationId","updatedAt") VALUES ($1,$2,1,1,$3,8,$4,CURRENT_TIMESTAMP)', [randomUUID(), seller.id, deliveryDate, offer.publicationId]);
    await sqlReject('PG-UNIQUE-DEMAND-HOUR', '23505', 'INSERT INTO "EnergyDemand" ("id","userId","quantityKwh","maxPricePerKwh","deliveryDate","hour","publicationId","updatedAt") VALUES ($1,$2,1,1,$3,8,$4,CURRENT_TIMESTAMP)', [randomUUID(), buyer.id, deliveryDate, demand.publicationId]);
    if (profileId && verificationId) {
      await sqlReject('PG-CHECK-PROFILE-VERSION', '23514', 'UPDATE "SimulationCapacityProfile" SET "version"=0 WHERE "id"=$1', [profileId]);
      await sqlReject('PG-CHECK-PROFILE-KIND', '23514', 'UPDATE "SimulationCapacityProfile" SET "kind"=$1 WHERE "id"=$2', ['unsupported', profileId]);
      await sqlReject('PG-CHECK-PROFILE-SOURCE', '23514', 'UPDATE "SimulationCapacityProfile" SET "source"=$1 WHERE "id"=$2', ['PHYSICAL_MEASUREMENT', profileId]);
      await sqlReject('PG-UNIQUE-PROFILE-VERSION', '23505', 'INSERT INTO "SimulationCapacityProfile" ("id","userId","kind","version","limits") VALUES ($1,$2,$3,1,$4)', [randomUUID(), seller.id, 'offer', '[]']);
      await sqlReject('PG-CHECK-VERIFICATION-TARGET', '23514', 'UPDATE "PublicationVerification" SET "demandId"=$1 WHERE "id"=$2', [demand.id, verificationId]);
      await sqlReject('PG-CHECK-VERIFICATION-STATUS', '23514', 'UPDATE "PublicationVerification" SET "resultStatus"=$1 WHERE "id"=$2', ['OUTDATED', verificationId]);
      await sqlReject('PG-FK-PROFILE-RESTRICT', '23001', 'DELETE FROM "SimulationCapacityProfile" WHERE "id"=$1', [profileId]);
    }
    const pair = async (hour: number) => ({ offer: await prisma.energyOffer.findFirstOrThrow({ where: { userId: seller.id, hour } }), demand: await prisma.energyDemand.findFirstOrThrow({ where: { userId: buyer.id, hour } }) });
    const proposal = (value: Awaited<ReturnType<typeof pair>>, quantity = 8) => ({ offerId: value.offer.id, demandId: value.demand.id, quantityKwh: quantity, pricePerKwh: 900 });
    await check('PG-CONCURRENCY-A', 'Concurrency', 'Two capacity proposals: one accepted reservation, one conflict, sum <= capacity', async () => {
      const value = await pair(9);
      const race = await Promise.all([request(seller.cookie, '/transactions', proposal(value, 8)), request(buyer.cookie, '/transactions', proposal(value, 7))]);
      assert.equal(race.filter(value => value.status === 201).length, 1); assert.equal(race.filter(value => value.status === 409).length, 1);
      const rows = await prisma.energyTransaction.findMany({ where: { offerId: value.offer.id } });
      const total = rows.reduce((sum, row) => sum.plus(row.quantityKwh), new Prisma.Decimal(0)); assert(total.lte(10)); assert.equal(rows.length, 1);
      return { statuses: race.map(value => value.status), conflictCodes: race.filter(value => value.status === 409).map(value => value.data.error), reserved: total.toString() };
    });
    await check('PG-CONCURRENCY-C', 'Concurrency', 'Two multi-hour batches: one atomic winner, one conflict; failed batch leaves no partial reservation', async () => {
      const first = await pair(11), second = await pair(12);
      const rejected = await request(seller.cookie, '/transactions/batch', { proposals: [proposal(first, 4), proposal(second, 11)] }); assert.equal(rejected.status, 409);
      assert.equal(await prisma.energyTransaction.count({ where: { offerId: { in: [first.offer.id, second.offer.id] } } }), 0);
      const body = { proposals: [proposal(first), proposal(second)] };
      const race = await Promise.all([request(seller.cookie, '/transactions/batch', body), request(buyer.cookie, '/transactions/batch', body)]);
      assert.equal(race.filter(value => value.status === 201).length, 1); assert.equal(race.filter(value => value.status === 409).length, 1);
      const rows = await prisma.energyTransaction.findMany({ where: { offerId: { in: [first.offer.id, second.offer.id] } } }); assert.equal(rows.length, 2); assert.equal(new Set(rows.map(row => row.batchId)).size, 1);
      assert(rows.every(row => row.quantityKwh.equals(8)));
      return { statuses: race.map(value => value.status), conflictCodes: race.filter(value => value.status === 409).map(value => value.data.error), transactions: rows.length, failedBatchRolledBack: true };
    });
    const rawAgreement = async (value: Awaited<ReturnType<typeof pair>>, quantity = '1', status: 'CONFIRMED' | 'PENDING_ACCEPTANCE' = 'CONFIRMED') => prisma.energyTransaction.create({ data: { offerId: value.offer.id, demandId: value.demand.id, sellerUserId: seller.id, buyerUserId: buyer.id, proposedByUserId: seller.id, quantityKwh: quantity, pricePerKwh: '900', totalAmountCop: new Prisma.Decimal(quantity).times(900), deliveryDate: value.offer.deliveryDate, hour: value.offer.hour, status, sellerAcceptedAt: new Date(), buyerAcceptedAt: status === 'CONFIRMED' ? new Date() : null, confirmedAt: status === 'CONFIRMED' ? new Date() : null } });
    await check('PG-CONCURRENCY-B', 'Concurrency', 'SQL-prepared incompatible pending commitments: concurrent acceptance must not confirm more than capacity', async () => {
      const value = await pair(10);
      const first = await rawAgreement(value, '7', 'PENDING_ACCEPTANCE'), second = await rawAgreement(value, '7', 'PENDING_ACCEPTANCE');
      const service = createEnergyTransactionService(undefined, undefined, { userIds: users });
      const race = await Promise.allSettled([service.accept(buyer.id, first.id), service.accept(buyer.id, second.id)]);
      const observed = race.map(value => value.status === 'fulfilled' ? { status: value.value.status } : errorInfo(value.reason));
      for (const id of [first.id, second.id]) {
        const row = await prisma.energyTransaction.findUniqueOrThrow({ where: { id } });
        if (row.status === 'PENDING_ACCEPTANCE') {
          try { await service.accept(buyer.id, id); } catch (error) { observed.push(errorInfo(error)); }
        }
      }
      const total = (await prisma.energyTransaction.aggregate({ where: { offerId: value.offer.id, status: 'CONFIRMED' }, _sum: { quantityKwh: true } }))._sum.quantityKwh ?? new Prisma.Decimal(0);
      report.incompatibleAcceptance = { precondition: 'Two deliberately SQL-prepared pending quantities 7+7 on capacity 10; not created by public proposal API', observed, confirmed: total.toString(), capacity: '10' }; save();
      assert(total.lte(10), `Confirmed ${total.toString()} exceeds capacity 10 for incompatible pending fixtures`);
      return report.incompatibleAcceptance;
    });
    if (confirmedId) {
      let requestKey = '', rejectedAttemptId = '', approvedAttemptId = '';
      await check('PG-CONCURRENCY-D', 'Concurrency/payments', 'Same transaction/requestKey yields one persistent attempt and a safe replay', async () => {
        requestKey = randomUUID();
        const body = { transactionId: confirmedId, requestKey, scenario: 'REJECTED' };
        const race = await Promise.all([request(buyer.cookie, '/simulated-payments', body), request(buyer.cookie, '/simulated-payments', body)]);
        assert(race.every(value => [200, 201, 409].includes(value.status)) && race.some(value => value.status === 201));
        const replay = await request(buyer.cookie, '/simulated-payments', body); assert.equal(replay.status, 200);
        assert.equal(await prisma.simulatedPaymentAttempt.count({ where: { transactionId: confirmedId, requestKey } }), 1);
        rejectedAttemptId = replay.data.attempt.id;
        return { statuses: race.map(value => value.status), replay: replay.status, attempts: 1, conflictCodes: race.filter(value => value.status === 409).map(value => value.data.error) };
      });
      await check('PG-CONCURRENCY-E', 'Concurrency/payments', 'Different APPROVED attempts yield one winner and one approved row', async () => {
        const race = await Promise.all([request(buyer.cookie, '/simulated-payments', { transactionId: confirmedId, requestKey: randomUUID(), scenario: 'APPROVED' }), request(buyer.cookie, '/simulated-payments', { transactionId: confirmedId, requestKey: randomUUID(), scenario: 'APPROVED' })]);
        assert.equal(race.filter(value => value.status === 201).length, 1); assert.equal(race.filter(value => value.status === 409).length, 1);
        const approved = await prisma.simulatedPaymentAttempt.findMany({ where: { transactionId: confirmedId, status: 'APPROVED' } }); assert.equal(approved.length, 1);
        approvedAttemptId = approved[0]!.id;
        const history = await request(seller.cookie, `/simulated-payments/transactions/${confirmedId}`); assert.equal(history.data.simulated, true); assert.equal(history.data.status, 'PAID'); assert(history.data.attempts.every((value: any) => value.simulated === true));
        return { statuses: race.map(value => value.status), approvedRows: 1, simulated: true, conflictCodes: race.filter(value => value.status === 409).map(value => value.data.error) };
      });
      await sqlReject('PG-CHECK-TRANSACTION-HOUR', '23514', 'UPDATE "EnergyTransaction" SET "hour"=24 WHERE "id"=$1', [confirmedId]);
      if (approvedAttemptId) {
        await sqlReject('PG-CHECK-PAYMENT-AMOUNT', '23514', 'UPDATE "SimulatedPaymentAttempt" SET "amountCop"=0 WHERE "id"=$1', [approvedAttemptId]);
        await sqlReject('PG-CHECK-PAYMENT-CURRENCY', '23514', 'UPDATE "SimulatedPaymentAttempt" SET "currency"=$1 WHERE "id"=$2', ['USD', approvedAttemptId]);
        await sqlReject('PG-CHECK-PAYMENT-RECEIPT', '23514', 'UPDATE "SimulatedPaymentAttempt" SET "receiptReference"=NULL WHERE "id"=$1', [approvedAttemptId]);
        await sqlReject('PG-CHECK-PAYMENT-RESOLUTION', '23514', 'UPDATE "SimulatedPaymentAttempt" SET "resolvedAt"=NULL WHERE "id"=$1', [approvedAttemptId]);
        const insertAttempt = 'INSERT INTO "SimulatedPaymentAttempt" ("id","transactionId","payerUserId","requestKey","scenario","status","amountCop","contractSnapshot","receiptReference","resolvedAt") VALUES ($1,$2,$3,$4,$5,$5,1,$6,$7,$8)';
        await sqlReject('PG-PARTIAL-ONE-APPROVED', '23505', insertAttempt, [randomUUID(), confirmedId, buyer.id, randomUUID(), 'APPROVED', '{}', `SIM-${randomUUID()}`, new Date()]);
        const pendingAgreement = await rawAgreement(await pair(13));
        const pending = await request(buyer.cookie, '/simulated-payments', { transactionId: pendingAgreement.id, requestKey: randomUUID(), scenario: 'PENDING' }); assert.equal(pending.status, 201);
        await sqlReject('PG-PARTIAL-ONE-PENDING', '23505', insertAttempt, [randomUUID(), pendingAgreement.id, buyer.id, randomUUID(), 'PENDING', '{}', null, null]);
        await sqlReject('PG-UNIQUE-PAYMENT-REQUESTKEY', '23505', insertAttempt, [randomUUID(), confirmedId, buyer.id, requestKey, 'REJECTED', '{}', null, new Date()]);
        const approved = await prisma.simulatedPaymentAttempt.findUniqueOrThrow({ where: { id: approvedAttemptId } });
        await sqlReject('PG-UNIQUE-RECEIPT', '23505', insertAttempt, [randomUUID(), pendingAgreement.id, buyer.id, randomUUID(), 'APPROVED', '{}', approved.receiptReference, new Date()]);
        await sqlReject('PG-FK-PAYMENT-TARGET', '23503', insertAttempt, [randomUUID(), randomUUID(), buyer.id, randomUUID(), 'REJECTED', '{}', null, new Date()]);
        await check('PG-PENDING-RESOLUTION', 'Simulated payments', 'Pending resolves as rejected, final result is immutable and agreement remains CONFIRMED', async () => {
          const resolved = await request(buyer.cookie, `/simulated-payments/${pending.data.attempt.id}/resolve`, { outcome: 'REJECTED' }); assert.equal(resolved.status, 200); assert.equal(resolved.data.attempt.status, 'REJECTED');
          const incompatible = await request(buyer.cookie, `/simulated-payments/${pending.data.attempt.id}/resolve`, { outcome: 'APPROVED' }); assert.equal(incompatible.status, 409);
          assert.equal((await prisma.energyTransaction.findUniqueOrThrow({ where: { id: pendingAgreement.id } })).status, 'CONFIRMED');
          return { pendingResolved: 'REJECTED', incompatibleResolution: 409, transactionStatus: 'CONFIRMED' };
        });
      }
      assert(rejectedAttemptId || report.cases.some((value: any) => value.id === 'PG-CONCURRENCY-D' && value.status === 'FAILED'));
    }
    await check('PG-BROWSER-GUARDS', 'Browser fixture safety', 'Reject habitual, missing permission, and unmarked database before connecting', async () => {
      for (const environment of [
        { DATABASE_URL: 'postgresql://reference@127.0.0.1:1/neondb', ENERTRADE_INTEGRATION_DATABASE_URL: 'postgresql://fixture@127.0.0.1:55432/neondb', ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' },
        { DATABASE_URL: 'postgresql://reference@127.0.0.1:1/neondb', ENERTRADE_INTEGRATION_DATABASE_URL: targetText!, ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'false' },
        { DATABASE_URL: 'postgresql://reference@127.0.0.1:1/neondb', ENERTRADE_INTEGRATION_DATABASE_URL: 'postgresql://fixture@127.0.0.1:55432/unmarked_database', ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' },
      ]) {
        let rejected = false;
        try { configureIsolatedIntegrationDatabase(environment); } catch { rejected = true; }
        assert(rejected, 'Integration guard accepted an unmarked/unauthorized database configuration (no connection attempted)');
      }
      return { rejectedConfigurations: 3, connectionsAttempted: 0 };
    });
    await check('PG-BROWSER-LIFECYCLE', 'Browser fixture lifecycle', 'Real temporary file and fixture cleanup on success/failure, no browser/server fixture startup', async () => {
      const initial = await counts();
      const paths: string[] = [];
      for (const intentionalFailure of [false, true]) {
        try {
          await withBrowserFlowFixture(prisma, async fixture => {
            assert(existsSync(fixture.filePath));
            assert(resolve(fixture.filePath).startsWith(resolve(process.env.VALIDATION_ROOT!) + '\\'));
            const contents = JSON.parse(readFileSync(fixture.filePath, 'utf8')); assert.equal(contents.runId, fixture.runId); assert.equal(typeof contents.password, 'string');
            paths.push(fixture.filePath);
            assert.equal(await prisma.user.count({ where: { id: { in: [fixture.seller.id, fixture.buyer.id] } } }), 2);
            if (intentionalFailure) throw new Error('Intentional lifecycle test failure');
          }, { dates, directory: join(process.env.VALIDATION_ROOT!, 'browser-lifecycle') });
          assert(!intentionalFailure, 'Expected lifecycle failure missing');
        } catch (error) { if (!intentionalFailure || !(error instanceof Error) || error.message !== 'Intentional lifecycle test failure') throw error; }
      }
      assert(paths.every(path => !existsSync(path))); assert.deepEqual(await counts(), initial);
      report.browserFixtureCleanup = { temporaryFilesCreated: paths.length, remainingFiles: 0, storage: 'operating-system temporary directory' };
      return { browserStarted: false, temporaryFilesCreated: paths.length, remainingFiles: 0, countsRestored: true };
    });
    await check('PG-HOURLY-CLOSURE', 'Hourly closure/isolation', 'Close fixture pending rows only, preserve confirmed and external legacy/hourly controls', async () => {
      const cutoff = new Date(`${deliveryDate}T05:00:00.000Z`);
      const pending = await prisma.energyTransaction.findFirst({ where: { sellerUserId: { in: users }, status: 'PENDING_ACCEPTANCE' } }); assert(pending);
      const service = createEnergyTransactionService(undefined, () => cutoff, { userIds: users });
      await assert.rejects(service.accept(buyer.id, pending.id), (error: any) => error.code === 'HOURLY_MARKET_CLOSED');
      const confirmedBefore = await prisma.energyTransaction.count({ where: { sellerUserId: { in: users }, status: 'CONFIRMED' } });
      await expireActivePublications(prisma, cutoff, { userIds: users });
      assert.equal(await prisma.energyTransaction.count({ where: { sellerUserId: { in: users }, status: 'PENDING_ACCEPTANCE' } }), 0);
      assert.equal(await prisma.energyTransaction.count({ where: { sellerUserId: { in: users }, status: 'CONFIRMED' } }), confirmedBefore);
      assert.deepEqual(await controls(), report.controlsSnapshot);
      const reserved = await prisma.energyTransaction.aggregate({ where: { offerId: pending.offerId, status: { in: ['PENDING_ACCEPTANCE', 'CONFIRMED'] } }, _sum: { quantityKwh: true } }); assert((reserved._sum.quantityKwh ?? new Prisma.Decimal(0)).equals(0));
      return { pendingClosed: true, confirmedPreserved: confirmedBefore, externalControlsIntact: true, pendingReservationReleased: true };
    });
    record('PG-HU20-FULL-SCRIPT', 'Scope restriction', 'Do not execute HU-06 forecasting/model paths', 'Full hu20-integration.ts excluded; its marketplace/matching flow executed above', 'NOT_RUN');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    try {
      await prisma.$transaction(async transaction => {
        const owners = { in: users };
        const agreements = await transaction.energyTransaction.findMany({ where: { sellerUserId: owners, buyerUserId: owners }, select: { id: true } });
        const ids = { in: agreements.map(value => value.id) };
        await transaction.simulatedPaymentAttempt.deleteMany({ where: { transactionId: ids } });
        await transaction.publicationVerification.deleteMany({ where: { userId: owners } });
        await transaction.energyTransactionRevision.deleteMany({ where: { transactionId: ids } });
        await transaction.energyTransaction.deleteMany({ where: { id: ids } });
        await transaction.energyOffer.deleteMany({ where: { userId: owners } });
        await transaction.energyDemand.deleteMany({ where: { userId: owners } });
        await transaction.energyPublication.deleteMany({ where: { userId: owners } });
        await transaction.simulationCapacityProfile.deleteMany({ where: { userId: owners } });
        await transaction.aiQueryTrace.deleteMany({ where: { requesterId: owners } });
        await transaction.matchingExecution.deleteMany({ where: { id: { in: matchingIds } } });
        await transaction.authSession.deleteMany({ where: { userId: owners } });
        await transaction.user.deleteMany({ where: { id: owners } });
      }, { timeout: 30000 });
      const after = await counts();
      report.workflowCountsBefore = before; report.workflowCountsAfter = after;
      assert.deepEqual(after, before, 'Workflow cleanup counts differ'); assert.deepEqual(await controls(), report.controlsSnapshot);
      record('PG-WORKFLOW-CLEANUP', 'Cleanup', 'Only workflow fixtures removed; all counts restored and controls untouched', { before, after, remainingWorkflowUsers: await prisma.user.count({ where: { id: { in: users } } }) });
    } catch (error) { record('PG-WORKFLOW-CLEANUP', 'Cleanup', 'Counts restored and controls untouched', errorInfo(error), 'FAILED'); }
    await prisma.$disconnect();
  }
}

async function boundaries() {
  const { prisma } = await import('../src/lib/prisma');
  const { createApp } = await import('../src/app');
  const { authCookieName } = await import('../src/services/auth.service');
  const { publicationWindow } = await import('../src/services/hourly-publication.contract');
  const before = await counts();
  const user = await prisma.user.create({ data: { email: `${runId}-boundaries@example.test`, name: `${runId}:boundaries`, passwordHash: 'disabled-validation-fixture' } });
  const token = randomBytes(32).toString('base64url');
  const server = createApp({ expirationScope: { userIds: [user.id] } }).listen(0, '127.0.0.1');
  try {
    await prisma.authSession.create({ data: { userId: user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    await new Promise<void>(resolveListening => server.listening ? resolveListening() : server.once('listening', resolveListening));
    const address = server.address(); assert(address && typeof address !== 'string');
    const dates = publicationWindow().dates;
    const post = async (days: unknown) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/publications`, { method: 'POST', headers: { Cookie: `${authCookieName}=${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'offer', days }) });
      return { status: response.status, data: await response.json() as any };
    };
    const slots = [{ hour: 0, quantityKwh: 0.01, pricePerKwh: 0.12345 }, { hour: 23, quantityKwh: 2.25, pricePerKwh: 900 }];
    assert.equal((await post([dates[0], dates[6]].map(deliveryDate => ({ deliveryDate, hours: slots })))).status, 201);
    const rows = await prisma.energyOffer.findMany({ where: { userId: user.id }, orderBy: [{ deliveryDate: 'asc' }, { hour: 'asc' }] });
    assert.deepEqual(rows.map(row => row.hour), [0, 23, 0, 23]); assert.equal(rows[0]!.quantityKwh.toString(), '0.01'); assert.equal(rows[0]!.pricePerKwh.toString(), '0.12345');
    const outside = new Date(`${dates[6]}T00:00:00Z`); outside.setUTCDate(outside.getUTCDate() + 1);
    assert.equal((await post([{ deliveryDate: outside.toISOString().slice(0, 10), hours: slots }])).status, 400);
    assert.equal((await post([{ deliveryDate: dates[0], hours: [{ ...slots[0], hour: 24 }] }])).status, 400);
    assert.equal((await post([{ deliveryDate: dates[0], hours: [{ hour: 1, quantityKwh: 1, pricePerKwh: 1 }, slots[0]] }])).status, 409);
    assert.equal(await prisma.energyOffer.count({ where: { userId: user.id, hour: 1 } }), 0);
    record('PG-HOURLY-BOUNDARIES', 'Hourly API', 'D+1/D+7, hours 0/23 and decimals persist; D+8/hour24 rejected; duplicate rolls back entire request', { days: [dates[0], dates[6]], hours: rows.map(row => row.hour), invalidDatesHours: 400, duplicate: 409, partialRows: 0 });
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    try {
      await prisma.$transaction(async transaction => {
        await transaction.energyOffer.deleteMany({ where: { userId: user.id } });
        await transaction.energyPublication.deleteMany({ where: { userId: user.id } });
        await transaction.authSession.deleteMany({ where: { userId: user.id } });
        await transaction.user.delete({ where: { id: user.id } });
      });
      assert.deepEqual(await counts(), before); assert.deepEqual(await controls(), report.controlsSnapshot);
      record('PG-BOUNDARY-CLEANUP', 'Cleanup', 'Boundary fixtures removed; external controls preserved', { countsRestored: true });
    } finally { await prisma.$disconnect(); }
  }
}

async function revalidate() {
  const { prisma } = await import('../src/lib/prisma');
  const { Prisma } = await import('../src/generated/prisma/client');
  const { createEnergyTransactionService } = await import('../src/services/energy-transaction.service');
  const { publicationWindow } = await import('../src/services/hourly-publication.contract');
  const { publicationVerificationRule, verifyDeclaredCapacity } = await import('../src/services/publication-verification.rules');
  const before = await counts();
  assert.deepEqual(before, report.finalCounts, 'Retained database counts changed');
  assert.deepEqual(await controls(), report.controlsSnapshot, 'Retained external controls changed');
  assert.deepEqual(protectedHashes(), report.protectedBefore, 'Protected HU-06/V5/environment artifacts changed');
  const migrations = (await database.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at')).rows;
  assert.equal(migrations.length, 19);
  assert(migrations.every((row: any) => row.finished_at && !row.rolled_back_at));
  for (const row of migrations) assert.equal(row.checksum, createHash('sha256').update(readFileSync(join(repoRoot, 'backend/prisma/migrations', row.migration_name, 'migration.sql'))).digest('hex'));
  const expected = report.checkpoints.payments;
  const actualConstraints = (await database.query(`SELECT c.conrelid::regclass::text AS table_name,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON c.connamespace=n.oid WHERE n.nspname='public' ORDER BY table_name,c.conname`)).rows;
  const actualIndexes = (await database.query(`SELECT t.relname AS table_name,i.relname AS index_name,x.indisunique,x.indisvalid,pg_get_indexdef(i.oid) AS definition,pg_get_expr(x.indpred,x.indrelid) AS predicate FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,i.relname`)).rows;
  assert.deepEqual(actualConstraints, expected.constraints); assert.deepEqual(actualIndexes, expected.indexes);
  const revision: any = { id: `${runId}-capacity-fix-${randomUUID()}`, startedAt: new Date().toISOString(), previousSummary: { ...report.summary }, previousDecision: report.decision, migrationsReapplied: false, iterations: [], capacityRegressions: [], errorsObserved: [], protectedFiles: Object.keys(report.protectedBefore).length };
  report.revalidations ??= []; report.revalidations.push(revision); save();
  const users: string[] = [];
  const now = new Date(); const deliveryDateText = publicationWindow().dates[0]!; const deliveryDate = new Date(`${deliveryDateText}T00:00:00.000Z`);
  const errorInfo = (error: any) => ({ name: error?.name, code: error?.code ?? null, status: error?.status ?? null, sqlState: error?.meta?.driverAdapterError?.cause?.originalCode ?? error?.meta?.driverAdapterError?.cause?.code ?? null });
  const retryable = (error: any) => error?.code === 'P2034' || error?.code === '40001' || error?.meta?.driverAdapterError?.cause?.originalCode === '40001';
  try {
    for (const role of ['seller', 'buyer']) {
      const user = await prisma.user.create({ data: { email: `${revision.id}-${role}@example.test`, name: `${revision.id}:${role}`, passwordHash: 'disabled-revalidation-fixture' } });
      users.push(user.id); revision.userIds = [...users]; save();
    }
    const seller = users[0]!, buyer = users[1]!;
    const service = createEnergyTransactionService(undefined, undefined, { userIds: users });
    const setup = async (offerCapacity: string, demandCapacity: string, quantities: string[], alreadyConfirmed = '0') => {
      const offerPublication = await prisma.energyPublication.create({ data: { userId: seller, kind: 'offer', deliveryDate } });
      const demandPublication = await prisma.energyPublication.create({ data: { userId: buyer, kind: 'demand', deliveryDate } });
      const offer = await prisma.energyOffer.create({ data: { userId: seller, publicationId: offerPublication.id, hour: 8, quantityKwh: offerCapacity, pricePerKwh: '1', deliveryDate } });
      const demand = await prisma.energyDemand.create({ data: { userId: buyer, publicationId: demandPublication.id, hour: 8, quantityKwh: demandCapacity, maxPricePerKwh: '1', deliveryDate } });
      const offerProfile = await prisma.simulationCapacityProfile.create({ data: { userId: seller, kind: 'offer', version: 1, source: publicationVerificationRule.source, limits: [{ hour: 8, maxQuantityKwh: offerCapacity }] } });
      const demandProfile = await prisma.simulationCapacityProfile.create({ data: { userId: buyer, kind: 'demand', version: 1, source: publicationVerificationRule.source, limits: [{ hour: 8, maxQuantityKwh: demandCapacity }] } });
      for (const [kind, userId, publication, profile, capacity] of [['offer', seller, offer, offerProfile, offerCapacity], ['demand', buyer, demand, demandProfile, demandCapacity]] as const) {
        const verdict = verifyDeclaredCapacity(publication.quantityKwh.toString(), publication.hour, [{ hour: 8, maxQuantityKwh: capacity }]);
        assert.equal(verdict.status, 'APPROVED');
        await prisma.publicationVerification.create({ data: { userId, ...(kind === 'offer' ? { offerId: publication.id } : { demandId: publication.id }), profileId: profile.id, ruleId: verdict.ruleId, ruleVersion: verdict.ruleVersion, resultStatus: verdict.status, inputSnapshot: { quantityKwh: publication.quantityKwh.toString(), deliveryDate: deliveryDateText, hour: publication.hour, profileVersion: profile.version }, resultSnapshot: verdict } });
      }
      const seed = (quantity: string, confirmed: boolean) => prisma.energyTransaction.create({ data: { offerId: offer.id, demandId: demand.id, sellerUserId: seller, buyerUserId: buyer, proposedByUserId: seller, quantityKwh: quantity, pricePerKwh: '1', totalAmountCop: quantity, deliveryDate, hour: 8, status: confirmed ? 'CONFIRMED' : 'PENDING_ACCEPTANCE', sellerAcceptedAt: now, buyerAcceptedAt: confirmed ? now : null, confirmedAt: confirmed ? now : null } });
      if (!new Prisma.Decimal(alreadyConfirmed).isZero()) await seed(alreadyConfirmed, true);
      const pending = [];
      for (const quantity of quantities) pending.push(await seed(quantity, false));
      return { offer, demand, pending, offerPublication, demandPublication };
    };
    const cleanup = async () => prisma.$transaction(async transaction => {
      const owners = { in: users };
      const rows = await transaction.energyTransaction.findMany({ where: { sellerUserId: owners, buyerUserId: owners }, select: { id: true } });
      const ids = { in: rows.map(value => value.id) };
      await transaction.energyTransactionRevision.deleteMany({ where: { transactionId: ids } });
      await transaction.energyTransaction.deleteMany({ where: { id: ids } });
      await transaction.publicationVerification.deleteMany({ where: { userId: owners } });
      await transaction.simulationCapacityProfile.deleteMany({ where: { userId: owners } });
      await transaction.energyOffer.deleteMany({ where: { userId: owners } });
      await transaction.energyDemand.deleteMany({ where: { userId: owners } });
      await transaction.energyPublication.deleteMany({ where: { userId: owners } });
    }, { timeout: 30000 });
    const attempts = async (id: string) => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try { return { result: await service.accept(buyer, id), attempts: attempt }; }
        catch (error) {
          revision.errorsObserved.push({ transactionId: id, attempt, ...errorInfo(error) });
          if (!retryable(error) || attempt === 5) throw error;
        }
      }
      throw new Error('Retry boundary unreachable');
    };
    for (let iteration = 1; iteration <= 10; iteration += 1) {
      const fixture = await setup('10', '10', ['7', '7']);
      const initial = fixture.pending;
      try {
        const race = await Promise.allSettled(initial.map(row => attempts(row.id)));
        assert.equal(race.filter(value => value.status === 'fulfilled').length, 1, 'Must have exactly one winner after retries');
        const rejected = race.find(value => value.status === 'rejected') as PromiseRejectedResult;
        assert.equal(rejected.reason.code, 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED'); assert.equal(rejected.reason.status, 409);
        const rows = await prisma.energyTransaction.findMany({ where: { offerId: fixture.offer.id }, orderBy: { id: 'asc' } });
        const confirmed = rows.filter(row => row.status === 'CONFIRMED'); const pending = rows.filter(row => row.status === 'PENDING_ACCEPTANCE');
        assert.equal(confirmed.length, 1); assert.equal(pending.length, 1);
        const total = confirmed.reduce((sum, row) => sum.plus(row.quantityKwh), new Prisma.Decimal(0)); assert(total.lte(10)); assert(total.equals(7));
        assert.deepEqual(pending[0], initial.find(row => row.id === pending[0]!.id), 'Losing transaction partially changed');
        assert(confirmed[0]!.buyerAcceptedAt && confirmed[0]!.sellerAcceptedAt && confirmed[0]!.confirmedAt);
        const errorsBefore = revision.errorsObserved.length;
        await assert.rejects(attempts(pending[0]!.id), (error: any) => error.code === 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED');
        assert(revision.errorsObserved.length > errorsBefore);
        assert.deepEqual(await prisma.energyTransaction.findUniqueOrThrow({ where: { id: pending[0]!.id } }), pending[0], 'Manual retry changed losing transaction');
        assert.equal((await prisma.energyOffer.findUniqueOrThrow({ where: { id: fixture.offer.id } })).status, 'ACTIVE');
        assert.equal((await prisma.energyDemand.findUniqueOrThrow({ where: { id: fixture.demand.id } })).status, 'ACTIVE');
        revision.iterations.push({ iteration, capacity: '10', confirmed: total.toString(), winners: 1, losers: 1, loserCode: rejected.reason.code, loserUnchanged: true, retryRevalidated: true, outcomes: race.map(value => value.status === 'fulfilled' ? { status: value.value.result.status, attempts: value.value.attempts } : errorInfo(value.reason)) });
        save(); console.log(JSON.stringify({ id: 'PG-CONCURRENCY-B-REVALIDATION', iteration, status: 'PASSED', confirmed: total.toString() }));
      } finally { await cleanup(); }
    }
    assert.equal(revision.iterations.length, 10);
    record('PG-CONCURRENCY-B', 'Concurrency', 'Ten iterations: one winner, confirmed <= capacity, domain loser, full revalidation on retry and no partial rows', { iterations: revision.iterations, errorsObserved: revision.errorsObserved });
    for (const scenario of [
      { name: 'B/E-exact', capacity: '10', demand: '10', confirmed: '3', pending: '7', code: null },
      { name: 'C-offer', capacity: '10', demand: '20', confirmed: '3', pending: '7.01', code: 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED' },
      { name: 'C-demand', capacity: '20', demand: '10', confirmed: '3', pending: '7.01', code: 'DEMAND_CONFIRMATION_CAPACITY_EXCEEDED' },
      { name: 'F-exact', capacity: '999999999999999999.99', demand: '999999999999999999.99', confirmed: '999999999999999999.98', pending: '0.01', code: null },
      { name: 'F-exceeds', capacity: '999999999999999999.99', demand: '999999999999999999.99', confirmed: '999999999999999999.98', pending: '0.02', code: 'OFFER_CONFIRMATION_CAPACITY_EXCEEDED' },
    ]) {
      const fixture = await setup(scenario.capacity, scenario.demand, [scenario.pending], scenario.confirmed);
      try {
        if (scenario.code) {
          await assert.rejects(attempts(fixture.pending[0]!.id), (error: any) => error.code === scenario.code);
          assert.deepEqual(await prisma.energyTransaction.findUniqueOrThrow({ where: { id: fixture.pending[0]!.id } }), fixture.pending[0]);
        } else assert.equal((await attempts(fixture.pending[0]!.id)).result.status, 'CONFIRMED');
        const rows = await prisma.energyTransaction.findMany({ where: { offerId: fixture.offer.id, status: 'CONFIRMED' } });
        const total = rows.reduce((sum, row) => sum.plus(row.quantityKwh), new Prisma.Decimal(0)); assert(total.lte(scenario.capacity)); assert(total.lte(scenario.demand));
        revision.capacityRegressions.push({ scenario: scenario.name, confirmed: total.toString(), expectedCode: scenario.code, status: 'PASSED' }); save();
      } finally { await cleanup(); }
    }
    record('PG-ACCEPTANCE-REGRESSIONS', 'Capacity', 'Exact equality, own transaction once, both capacities and full Decimal(20,2) centesimal boundary', revision.capacityRegressions);
    const guarded = (name: string, host = '127.0.0.1') => ({ DATABASE_URL: `postgresql://reference@127.0.0.1:1/${normal.pathname.slice(1)}`, ENERTRADE_INTEGRATION_DATABASE_URL: `postgresql://fixture@${host}:55432/${name}`, ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: 'true' });
    const unsafe = [guarded(normal.pathname.slice(1)), { ...guarded('enertrade_test'), ENERTRADE_INTEGRATION_DATABASE_DISPOSABLE: undefined }, guarded('unmarked_database'), guarded('enertrade_development'), guarded('enertrade_contest'), guarded('enertrade_testament'), guarded('enertrade_tested'), guarded('enertrade_testingground'), guarded('enertrade_test', 'production.invalid'), { ...guarded('enertrade_test'), ENERTRADE_INTEGRATION_DATABASE_URL: 'postgresql://fixture@127.0.0.1:55432/enertrade_test?host=production.invalid' }];
    for (const configuration of unsafe) { const unchanged = { ...configuration }; assert.throws(() => configureIsolatedIntegrationDatabase(configuration)); assert.deepEqual(configuration, unchanged); }
    const safeNames = ['enertrade_marketplace_test_run', 'enertrade_integration_disposable_run', 'example_test', 'example_testing', 'example_disposable'];
    for (const name of safeNames) { const configuration = guarded(name); configureIsolatedIntegrationDatabase(configuration); assert.equal(configuration.DATABASE_URL, configuration.ENERTRADE_INTEGRATION_DATABASE_URL); }
    revision.guard = { unsafeRejected: unsafe.length, validAccepted: safeNames.length, unauthorizedConnectionsAttempted: 0 };
    record('PG-BROWSER-GUARDS', 'Browser fixture safety', 'Require separated loopback target, explicit disposable flag and whole-token name marker', revision.guard);
  } finally {
    try {
      const owners = { in: users };
      await prisma.$transaction(async transaction => {
        const rows = await transaction.energyTransaction.findMany({ where: { sellerUserId: owners, buyerUserId: owners }, select: { id: true } });
        const ids = { in: rows.map(value => value.id) };
        await transaction.energyTransactionRevision.deleteMany({ where: { transactionId: ids } });
        await transaction.energyTransaction.deleteMany({ where: { id: ids } });
        await transaction.publicationVerification.deleteMany({ where: { userId: owners } });
        await transaction.simulationCapacityProfile.deleteMany({ where: { userId: owners } });
        await transaction.energyOffer.deleteMany({ where: { userId: owners } });
        await transaction.energyDemand.deleteMany({ where: { userId: owners } });
        await transaction.energyPublication.deleteMany({ where: { userId: owners } });
        await transaction.user.deleteMany({ where: { id: owners } });
      }, { timeout: 30000 });
      revision.countsAfter = await counts(); assert.deepEqual(revision.countsAfter, before); assert.deepEqual(await controls(), report.controlsSnapshot);
      assert.deepEqual(protectedHashes(), report.protectedBefore);
      revision.cleanup = 'PASSED'; revision.completedAt = new Date().toISOString(); save();
      record('PG-REVALIDATION-CLEANUP', 'Cleanup', 'Retained control rows/counts/hashes unchanged and no revalidation users', { counts: revision.countsAfter, protectedHashesEqual: true, temporaryUsers: 0 });
    } finally { await prisma.$disconnect(); }
  }
  const latest = [...new Map(report.cases.filter((value: any) => !value.supersededBy).map((value: any) => [value.id, value])).values()] as any[];
  report.summary = Object.fromEntries(['PASSED', 'FAILED', 'BLOCKED', 'NOT_RUN'].map(status => [status, latest.filter(value => value.status === status).length]));
  report.decision = latest.some(value => value.status === 'FAILED') ? 'NEW_REGRESSION_FOUND' : 'READY_FOR_COMMIT_PLAN';
  report.finishedAt = new Date().toISOString(); report.runtime.serverStopped = false; report.runtime.cleanShutdownObserved = false; save();
  process.exitCode = report.decision === 'READY_FOR_COMMIT_PLAN' ? 0 : 1;
  console.log(JSON.stringify({ summary: report.summary, decision: report.decision, iterations: revision.iterations.length }));
}

async function finish() {
  assert(process.env.VALIDATION_SHADOW_DATABASE_URL, 'Disposable shadow URL required');
  const shadowUrl = new URL(process.env.VALIDATION_SHADOW_DATABASE_URL);
  const primaryIdentity = postgresDatabaseIdentity(targetText!);
  const shadowIdentity = postgresDatabaseIdentity(process.env.VALIDATION_SHADOW_DATABASE_URL);
  assertSeparateDisposableDatabase(normalConfig.DATABASE_URL, process.env.VALIDATION_SHADOW_DATABASE_URL);
  assert.equal(shadowIdentity.host, primaryIdentity.host); assert.equal(shadowIdentity.port, primaryIdentity.port); assert.equal(shadowIdentity.user, primaryIdentity.user); assert.notEqual(shadowIdentity.database, primaryIdentity.database);
  const shadow = new Client({ connectionString: process.env.VALIDATION_SHADOW_DATABASE_URL });
  await shadow.connect();
  try {
    const schemaQueries = {
      constraints: `SELECT t.relname AS table_name,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname <> '_prisma_migrations' ORDER BY t.relname,c.conname`,
      indexes: `SELECT t.relname AS table_name,i.relname AS index_name,x.indisunique,x.indisvalid,pg_get_indexdef(i.oid) AS definition,pg_get_expr(x.indpred,x.indrelid) AS predicate FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname <> '_prisma_migrations' ORDER BY t.relname,i.relname`,
      columns: `SELECT table_name,column_name,is_nullable,data_type,udt_name,numeric_precision,numeric_scale,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name,ordinal_position`,
      enums: `SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder`,
    };
    report.shadowCatalogComparison = {};
    for (const [name, sql] of Object.entries(schemaQueries)) {
      const actual = (await database.query(sql)).rows;
      const expected = (await shadow.query(sql)).rows;
      assert.deepEqual(actual, expected, `SQL catalog drift found: ${name}`);
      report.shadowCatalogComparison[name] = { equal: true, rows: actual.length };
    }
    record('PG-CATALOG-SHADOW', 'SQL drift', 'Actual catalog equals replayed migrations including CHECK and partial indexes', report.shadowCatalogComparison);
  } finally { await shadow.end(); }
  const protectedAfter = protectedHashes();
  assert.deepEqual(protectedAfter, report.protectedBefore, 'HU-06/V5/environment artifacts changed');
  report.protectedAfter = protectedAfter;
  report.journalProtected = Object.fromEntries(Object.entries(protectedAfter).filter(([path]) => /prospective.*\.jsonl|journal/i.test(path)));
  record('PG-PROTECTED-FILES', 'HU-06/V5 artifacts', 'Academic artifacts remain unchanged; habitual database identity is compared without connection and .env hashes are not exported', { files: Object.keys(protectedAfter).length, journalFiles: Object.keys(report.journalProtected) });
  assert.deepEqual(await counts(), report.beforeIntegrationCounts); assert.deepEqual(await controls(), report.controlsSnapshot);
  const remaining = (await database.query('SELECT count(*) FROM "User" WHERE "id" <> ALL($1::uuid[])', [report.controls.userIds])).rows[0].count;
  assert.equal(Number(remaining), 0);
  assert(report.browserFixtureCleanup?.remainingFiles === 0 || (Array.isArray(report.browserTemporaryPaths) && report.browserTemporaryPaths.every((path: string) => !existsSync(path))));
  report.finalCounts = await counts();
  record('PG-FINAL-CLEANUP', 'Cleanup', 'Zero non-control users, fixture counts restored, external controls unchanged and temporary credentials removed', { counts: report.finalCounts, remainingNonControlUsers: 0, controlsRetained: report.controls.userIds.length, remainingTemporaryFiles: 0 });
  record('PG-BROWSER-REAL', 'Excluded execution', 'Do not start actual browser workflow', 'No browser or browser fixture server started; lifecycle function only', 'NOT_RUN');
  report.finishedAt = new Date().toISOString();
  const latest = [...new Map(report.cases.filter((value: any) => !value.supersededBy).map((value: any) => [value.id, value])).values()] as any[];
  report.summary = Object.fromEntries(['PASSED', 'FAILED', 'BLOCKED', 'NOT_RUN'].map(status => [status, latest.filter(value => value.status === status).length]));
  report.decision = latest.some(value => value.status === 'FAILED' && value.component === 'Cleanup') ? 'CLEANUP_PROBLEM' : latest.some(value => value.status === 'FAILED' && value.component.includes('Concurrency')) ? 'CONCURRENCY_PROBLEM' : latest.some(value => value.status === 'FAILED') ? 'NEEDS_FIXES_AFTER_INTEGRATION' : 'READY_FOR_COMMIT_PLAN';
  report.runtime = { source: 'https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip', sha256: '80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F', root: '[local temporary path redacted]', shadowDatabase: shadowUrl.pathname.slice(1), initialPublicTables: 0, initialIdentityObservedAt: '2026-10-07T01:54:03.170283-05:00', serviceInstalled: false, dataDirectoriesDeleted: false, pgCtlBlockedByApplicationControl: true, startupMethod: 'Direct postgres.exe, loopback only, no policy change/elevation' };
  save(); console.log(JSON.stringify({ summary: report.summary, decision: report.decision, report: reportPath }));
  process.exitCode = report.decision === 'READY_FOR_COMMIT_PLAN' ? 0 : 1;
}

await database.connect();
try {
  const identity = (await database.query('SELECT current_database() AS database, host(inet_server_addr()) AS host, inet_server_port() AS port, current_user AS user, version() AS version')).rows[0];
  assert.equal(identity.database, targetIdentity.database); assert.equal(identity.port, targetIdentity.port); assert.equal(identity.user, targetIdentity.user);
  if (targetIdentity.host === 'loopback') assert(['127.0.0.1', '::1'].includes(identity.host));
  report.server = { ...identity, host: targetIdentity.host === 'loopback' ? 'loopback' : 'Neon endpoint redacted', user: undefined }; save();
  const mode = process.argv[2];
  if (mode === 'bootstrap') await bootstrap();
  else if (mode === 'catalog') await catalog(process.argv[3] ?? 'final');
  else if (mode === 'prepare') await prepare();
  else if (mode === 'scripts') await runIntegrationScripts();
  else if (mode === 'flows') await flows();
  else if (mode === 'boundaries') await boundaries();
  else if (mode === 'finish') await finish();
  else if (mode === 'revalidate') await revalidate();
  else if (mode === 'controls') {
    assert.deepEqual(await controls(), report.controlsSnapshot, 'External controls modified');
    record('PG-CONTROLS-UNCHANGED', 'Isolation', 'External controls byte-equivalent', { counts: await counts() });
  } else throw new Error('Unknown validation mode');
} catch (error) {
  record(`PG-${process.argv[2]}-FAILURE`, 'Validation', 'Successful stage', { name: (error as any)?.name, code: (error as any)?.code, message: error instanceof Error ? error.message : 'Validation failed' }, 'FAILED');
  process.exitCode = 1;
} finally { await database.end(); save(); }