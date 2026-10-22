import { prisma } from '../src/lib/prisma';
const email = process.argv[2]?.trim().toLowerCase();
try {
 if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Uso: bun run scripts/bootstrap-admin.ts correo');
 await prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(41820719)`;
  if (await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })) throw new Error('Ya existe un administrador activo. Usa Administración para nuevos permisos.');
  const user = await tx.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') throw new Error('Primero registra una cuenta activa desde la aplicación.');
  await tx.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  await tx.authSession.deleteMany({ where: { userId: user.id } });
  await tx.adminAudit.create({ data: { actorId: user.id, targetId: user.id, action: 'FIRST_ADMIN_BOOTSTRAP', reason: 'Alta inicial mediante comando local autorizado por el responsable.', before: { role: user.role, status: user.status }, after: { role: 'ADMIN', status: 'ACTIVE' } } });
 });
 console.log('Administrador inicial activado. Inicia sesión nuevamente.');
} catch (error) { console.error(error instanceof Error ? error.message : 'No fue posible activar el administrador.'); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
