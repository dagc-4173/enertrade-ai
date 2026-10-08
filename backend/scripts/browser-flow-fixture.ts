import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PrismaClient } from '../src/generated/prisma/client';
import { configureIsolatedIntegrationDatabase } from './integration-safety';

type FixtureFiles = {
	createDirectory(root: string): Promise<string>;
	write(path: string, content: string): Promise<void>;
	remove(directory: string): Promise<void>;
};
function assertTemporaryRoot(root: string) {
	const pathFromTemp = relative(resolve(tmpdir()), resolve(root));
	if (pathFromTemp === '..' || pathFromTemp.startsWith(`..${sep}`) || isAbsolute(pathFromTemp)) throw new Error('Browser fixture credentials must remain under the operating-system temporary directory.');
}
const temporaryFiles: FixtureFiles = {
	createDirectory: async root => { assertTemporaryRoot(root); await mkdir(root, { recursive: true }); return mkdtemp(join(root, 'enertrade-browser-')); },
	write: (path, content) => writeFile(path, content, { mode: 0o600 }),
	remove: directory => rm(directory, { recursive: true, force: true }),
};
type BrowserFixture = {
	runId: string; password: string; filePath: string; dates: readonly string[]; date: string | undefined;
	seller: { id: string; email: string }; buyer: { id: string; email: string };
};

export async function withBrowserFlowFixture(database: PrismaClient, use: (fixture: BrowserFixture) => Promise<void>, options: { dates: readonly string[]; directory?: string; files?: FixtureFiles; hashPassword?: (password: string) => Promise<string> }) {
	const files = options.files ?? temporaryFiles;
	const users: string[] = [];
	let directory: string | undefined;
	try {
		const root = options.directory ?? tmpdir();
		assertTemporaryRoot(root);
		directory = await files.createDirectory(root);
		const runId = randomBytes(6).toString('hex');
		const password = randomBytes(18).toString('base64url');
		const passwordHash = await (options.hashPassword ?? (value => Bun.password.hash(value, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 2 })))(password);
		const actor = async (role: string) => {
			const user = await database.user.create({ data: { email: `e2e-${role}-${runId}@example.test`, name: `Browser fixture ${role}`, passwordHash } });
			users.push(user.id);
			return { id: user.id, email: user.email };
		};
		const seller = await actor('seller');
		const buyer = await actor('buyer');
		const fixture = { runId, password, seller, buyer, dates: options.dates, date: options.dates[6], filePath: join(directory, 'browser-flow-fixture.json') };
		await files.write(fixture.filePath, JSON.stringify(fixture, null, 2));
		await use(fixture);
	} finally {
		const failures: unknown[] = [];
		try {
			if (users.length) {
				for (let attempt = 0; attempt < 3; attempt += 1) {
					try {
						await database.$transaction(async transaction => {
							const owners = { in: [...users] };
							const agreements = await transaction.energyTransaction.findMany({ where: { sellerUserId: owners, buyerUserId: owners, offer: { userId: owners }, demand: { userId: owners } }, select: { id: true } });
							const transactionIds = { in: agreements.map(value => value.id) };
							const traces = await transaction.aiQueryTrace.findMany({ where: { requesterId: owners, resourceType: 'matching_execution' }, select: { resourceId: true } });
							await transaction.simulatedPaymentAttempt.deleteMany({ where: { transactionId: transactionIds } });
							await transaction.publicationVerification.deleteMany({ where: { userId: owners } });
							await transaction.energyTransactionRevision.deleteMany({ where: { transactionId: transactionIds } });
							await transaction.energyTransaction.deleteMany({ where: { id: transactionIds } });
							await transaction.energyOffer.deleteMany({ where: { userId: owners } });
							await transaction.energyDemand.deleteMany({ where: { userId: owners } });
							await transaction.energyPublication.deleteMany({ where: { userId: owners } });
							await transaction.simulationCapacityProfile.deleteMany({ where: { userId: owners } });
							await transaction.aiQueryTrace.deleteMany({ where: { requesterId: owners } });
							await transaction.matchingExecution.deleteMany({ where: { id: { in: traces.map(value => value.resourceId).filter((value): value is string => value !== null) } } });
							await transaction.authSession.deleteMany({ where: { userId: owners } });
							await transaction.user.deleteMany({ where: { id: owners } });
						}, { timeout: 30000 });
						break;
					} catch (error) { if (attempt === 2) failures.push(error); }
				}
			}
		} finally {
			if (directory) {
				for (let attempt = 0; attempt < 3; attempt += 1) {
					try { await files.remove(directory); break; }
					catch (error) { if (attempt === 2) failures.push(error); }
				}
			}
		}
		if (failures.length) throw new AggregateError(failures, 'Browser fixture cleanup failed.');
	}
}

if (import.meta.main) {
	configureIsolatedIntegrationDatabase();
	process.env.FRONTEND_ORIGIN ??= 'http://127.0.0.1:5174';
	const { prisma } = await import('../src/lib/prisma');
	const { createApp } = await import('../src/app');
	const { publicationWindow } = await import('../src/services/hourly-publication.contract');
	const stop = new AbortController();
	const requestStop = () => stop.abort();
	process.once('SIGINT', requestStop);
	process.once('SIGTERM', requestStop);
	try {
		await withBrowserFlowFixture(prisma, async fixture => {
			const app = createApp({ expirationScope: { userIds: [fixture.seller.id, fixture.buyer.id] } });
			const server = app.listen(3001, '127.0.0.1');
			try {
				await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
				console.log(JSON.stringify({ ready: true, fixtureAccounts: 2, port: 3001, credentialsFile: 'temporary' }));
				await new Promise<void>(resolve => { if (stop.signal.aborted) resolve(); else stop.signal.addEventListener('abort', () => resolve(), { once: true }); });
			} finally {
				server.closeAllConnections();
				if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
			}
		}, { dates: publicationWindow().dates, directory: process.env.ENERTRADE_BROWSER_FIXTURE_DIRECTORY });
	} catch {
		console.error(JSON.stringify({ status: 'failed', code: 'BROWSER_FIXTURE_OR_CLEANUP_FAILED' }));
		process.exitCode = 1;
	} finally {
		process.removeListener('SIGINT', requestStop);
		process.removeListener('SIGTERM', requestStop);
		await prisma.$disconnect();
	}
}
