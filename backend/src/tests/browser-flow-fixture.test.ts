import { expect, test } from 'bun:test';
import { withBrowserFlowFixture } from '../../scripts/browser-flow-fixture';

function fixture(options: { secondUserFails?: boolean; cleanupFailures?: number; writeFails?: boolean; removeFailures?: number } = {}) {
  const users: string[] = [];
  const deletions: { table: string; where: any }[] = [];
  let cleanupAttempts = 0;
  let written = '';
  let removed = false;
  let removalAttempts = 0;
  const transaction: any = {};
  for (const table of ['simulatedPaymentAttempt', 'publicationVerification', 'energyTransactionRevision', 'energyTransaction', 'energyOffer', 'energyDemand', 'energyPublication', 'simulationCapacityProfile', 'aiQueryTrace', 'matchingExecution', 'authSession', 'user']) {
    transaction[table] = { deleteMany: async ({ where }: any) => { deletions.push({ table, where }); } };
  }
  transaction.energyTransaction.findMany = async ({ where }: any) => { expect(where.sellerUserId.in).toEqual(users); expect(where.buyerUserId.in).toEqual(users); expect(where.offer.userId.in).toEqual(users); expect(where.demand.userId.in).toEqual(users); return [{ id: 'owned-agreement' }]; };
  transaction.aiQueryTrace.findMany = async ({ where }: any) => { expect(where.requesterId.in).toEqual(users); return [{ resourceId: 'owned-matching' }]; };
  const database: any = {
    user: { create: async ({ data }: any) => { if (options.secondUserFails && users.length === 1) throw new Error('Second actor failed'); const id = `fixture-${users.length + 1}`; users.push(id); return { id, email: data.email }; } },
    $transaction: async (action: any) => { cleanupAttempts += 1; if (cleanupAttempts <= (options.cleanupFailures ?? 0)) throw new Error('Cleanup temporarily unavailable'); return action(transaction); },
  };
  const files = {
    createDirectory: async () => 'fake-temp/enertrade-browser-run',
    write: async (_path: string, content: string) => { written = content; if (options.writeFails) throw new Error('Write failed'); },
    remove: async (directory: string) => { expect(directory).toBe('fake-temp/enertrade-browser-run'); removalAttempts += 1; if (removalAttempts <= (options.removeFailures ?? 0)) throw new Error('Removal unavailable'); removed = true; },
  };
  return { database, files, users, deletions, state: () => ({ cleanupAttempts, written, removed, removalAttempts }), options: { dates: ['2026-10-08'], files, hashPassword: async () => 'disabled-unit-test-hash' } };
}

test('BROWSER-LIFECYCLE-01: credenciales exclusivamente generadas y cleanup limitado a fixtures', async () => {
  const memory = fixture();
  await withBrowserFlowFixture(memory.database, async value => { expect(value.password).toHaveLength(24); expect(value.seller.email).toEndWith('@example.test'); }, memory.options);
  expect(memory.state().removed).toBe(true);
  expect(memory.deletions.find(value => value.table === 'user')?.where).toEqual({ id: { in: memory.users } });
  expect(memory.deletions.find(value => value.table === 'energyTransaction')?.where).toEqual({ id: { in: ['owned-agreement'] } });
  expect(memory.deletions.find(value => value.table === 'matchingExecution')?.where).toEqual({ id: { in: ['owned-matching'] } });
});

test('BROWSER-LIFECYCLE-02: fallo parcial de provision elimina solo el primer usuario y el archivo temporal', async () => {
  const memory = fixture({ secondUserFails: true });
  await expect(withBrowserFlowFixture(memory.database, async () => {}, memory.options)).rejects.toThrow('Second actor failed');
  expect(memory.users).toEqual(['fixture-1']);
  expect(memory.deletions.find(value => value.table === 'user')?.where.id.in).toEqual(['fixture-1']);
  expect(memory.state().removed).toBe(true);
});

test('BROWSER-LIFECYCLE-03: fallo de escritura y cierre ejecutan finally, con reintento de cleanup', async () => {
  for (const writeFails of [true, false]) {
    const memory = fixture({ writeFails, cleanupFailures: 1 });
    await expect(withBrowserFlowFixture(memory.database, async () => { throw new Error('Server failed'); }, memory.options)).rejects.toThrow(writeFails ? 'Write failed' : 'Server failed');
    expect(memory.state().cleanupAttempts).toBe(2);
    expect(memory.state().removed).toBe(true);
  }
});

test('BROWSER-LIFECYCLE-04: fallo persistente de BD se informa y aun elimina credenciales temporales', async () => {
  const memory = fixture({ cleanupFailures: 3 });
  await expect(withBrowserFlowFixture(memory.database, async () => {}, memory.options)).rejects.toThrow('Browser fixture cleanup failed');
  expect(memory.state().cleanupAttempts).toBe(3);
  expect(memory.state().removed).toBe(true);
});

test('BROWSER-LIFECYCLE-05: reintenta retiro temporal y reporta un fallo permanente sin fingir cleanup', async () => {
  const transient = fixture({ removeFailures: 1 });
  await withBrowserFlowFixture(transient.database, async () => {}, transient.options);
  expect(transient.state().removed).toBe(true);
  expect(transient.state().removalAttempts).toBe(2);
  const permanent = fixture({ removeFailures: 3 });
  await expect(withBrowserFlowFixture(permanent.database, async () => {}, permanent.options)).rejects.toThrow('Browser fixture cleanup failed');
  expect(permanent.state().removed).toBe(false);
  expect(permanent.state().removalAttempts).toBe(3);
});

test('BROWSER-LIFECYCLE-06: rechaza guardar credenciales fuera del directorio temporal del sistema', async () => {
  const memory = fixture();
  await expect(withBrowserFlowFixture(memory.database, async () => {}, { ...memory.options, directory: process.cwd() })).rejects.toThrow('must remain under the operating-system temporary directory');
  expect(memory.users).toEqual([]);
  expect(memory.state().written).toBe('');
  expect(memory.state().removed).toBe(false);
});