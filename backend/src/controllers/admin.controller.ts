import express, { type ErrorRequestHandler } from 'express';
import { prisma } from '@/lib/prisma';
import { AdminError, adminUserSelect, changeUser } from '@/services/admin.service';
import { adminOrigin, requireAdmin } from '@/middlewares/admin.middleware';
import type { RequestHandler } from 'express';
import type { Prisma } from '@/generated/prisma/client';
export function createAdminRouter(database = prisma, auth: RequestHandler[] = requireAdmin()) {
const router = express.Router();
router.use(...auth, adminOrigin);
router.use((req,res,next) => { if (req.method === 'PATCH' && !req.is('application/json')) {res.status(415).json({error:'UNSUPPORTED_MEDIA_TYPE',message:'Se requiere Content-Type application/json.'});return;} next(); });
router.use(express.json({ limit: '4kb' }));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get('/users', async (req, res) => {
 if (Object.keys(req.query).some(key => !['search','role','status','page'].includes(key))) throw new AdminError(400,'INVALID_ADMIN_QUERY','Los filtros no son válidos.');
 const { search = '', role, status, page = '1' } = req.query;
 if (typeof search !== 'string' || search.length > 100 || typeof page !== 'string' || !/^[1-9][0-9]{0,4}$/.test(page) || (role !== undefined && (typeof role !== 'string' || !['USER','ADMIN'].includes(role))) || (status !== undefined && (typeof status !== 'string' || !['ACTIVE','BLOCKED'].includes(status)))) throw new AdminError(400,'INVALID_ADMIN_QUERY','Los filtros no son válidos.');
 const where: Prisma.UserWhereInput = { ...(role ? { role: role as 'USER'|'ADMIN' } : {}), ...(status ? { status: status as 'ACTIVE'|'BLOCKED' } : {}), ...(search.trim() ? { OR: [{ email: { contains: search.trim(), mode: 'insensitive' } }, { name: { contains: search.trim(), mode: 'insensitive' } }] } : {}) };
 const [users, total] = await database.$transaction([database.user.findMany({ where, select: adminUserSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (Number(page)-1)*25, take: 25 }), database.user.count({where})]);
 res.json({ users, total, page: Number(page), pageSize: 25 });
});
router.patch('/users/:id', async (req, res) => {
 const id = String(req.params.id);
 if (!uuid.test(id)) throw new AdminError(400,'INVALID_USER_ID','El identificador no es válido.');
 res.json(await changeUser(req.authUser!.id, id, req.body, database));
});
router.get('/audit', async (req, res) => {
 const page = req.query.page ?? '1';
 if (Object.keys(req.query).some(key => key !== 'page') || typeof page !== 'string' || !/^[1-9][0-9]{0,4}$/.test(page)) throw new AdminError(400,'INVALID_ADMIN_QUERY','La página no es válida.');
 const [entries,total] = await database.$transaction([database.adminAudit.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (Number(page)-1)*25, take: 25, include: { actor: { select: { name: true, email: true } }, target: { select: { name: true, email: true } } } }),database.adminAudit.count()]);
 res.json({ entries, total, page: Number(page), pageSize: 25 });
});
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
 if (error instanceof AdminError) { res.status(error.status).json({ error: error.code, message: error.message }); return; }
 if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') { res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'INVALID_ADMIN_REQUEST', message: 'El cuerpo debe ser JSON válido de hasta 4 KB.' }); return; }
 if (error?.code === 'P2034' || error?.code === '40P01') { res.status(409).json({ error: 'ADMIN_CHANGE_CONFLICT', message: 'Hubo un cambio simultáneo. Actualiza e inténtalo de nuevo.' }); return; }
 res.status(500).json({ error: 'ADMIN_OPERATION_FAILED', message: 'No fue posible completar la operación administrativa.' });
};
router.use(errors);
return router;
}
export const router = createAdminRouter();
