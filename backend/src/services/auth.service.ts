import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
export const sessionLifetimeMs = 8 * 60 * 60 * 1000;
export type AuthUser = { id: string; email: string; name: string; createdAt: Date };
type StoredUser = AuthUser & { passwordHash: string };
export interface AuthRepository {
 createUser(data: { email: string; name: string; passwordHash: string }): Promise<AuthUser>;
 findUser(email: string): Promise<StoredUser | null>;
 createSession(data: { tokenHash: string; userId: string; expiresAt: Date }): Promise<unknown>;
 findSession(tokenHash: string): Promise<{ expiresAt: Date; user: AuthUser } | null>;
 deleteSession(tokenHash: string): Promise<unknown>;
}
const select = { id: true, email: true, name: true, createdAt: true } as const;
const repository: AuthRepository = {
 createUser: data => prisma.user.create({ data, select }),
 findUser: email => prisma.user.findUnique({ where: { email } }),
 createSession: data => prisma.authSession.create({ data }),
 findSession: tokenHash => prisma.authSession.findUnique({ where: { tokenHash }, select: { expiresAt: true, user: { select } } }),
 deleteSession: tokenHash => prisma.authSession.deleteMany({ where: { tokenHash } }),
};
export class AuthError extends Error {
 constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function object(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function credentials(body: unknown, register: boolean) {
 if (!object(body) || Object.keys(body).some(key => !['email', 'password', ...(register ? ['name'] : [])].includes(key)))
  throw new AuthError(400, 'INVALID_AUTH_REQUEST', 'La solicitud de autenticación no es válida.');
 if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))
  throw new AuthError(400, 'INVALID_EMAIL', 'Introduce un correo electrónico válido.');
 if (typeof body.password !== 'string' || body.password.length < (register ? 12 : 1) || body.password.length > 128)
  throw new AuthError(400, 'INVALID_PASSWORD', register ? 'La contraseña debe tener entre 12 y 128 caracteres.' : 'Introduce una contraseña válida.');
 if (register && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100))
  throw new AuthError(400, 'INVALID_NAME', 'Introduce un nombre de entre 1 y 100 caracteres.');
 return { email: body.email.trim().toLowerCase(), password: body.password, name: typeof body.name === 'string' ? body.name.trim() : '' };
}
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const validToken = (token?: string): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
const hashPassword = (password: string) => Bun.password.hash(password, { algorithm: 'argon2id', memoryCost: 65536, timeCost: 2 });
let dummyHash: Promise<string> | undefined;
export function createAuthService(repo: AuthRepository = repository, now: () => Date = () => new Date()) {
 return {
  async register(body: unknown) {
   const { email, name, password } = credentials(body, true);
   const passwordHash = await hashPassword(password);
   try { return await repo.createUser({ email, name, passwordHash }); }
   catch (error) {
    if (object(error) && error.code === 'P2002') throw new AuthError(409, 'EMAIL_ALREADY_REGISTERED', 'El correo electrónico ya está registrado.');
    throw error;
   }
  },
  async login(body: unknown, previousToken?: string) {
   const { email, password } = credentials(body, false);
   const user = await repo.findUser(email);
   dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
   const matches = await Bun.password.verify(password, user?.passwordHash ?? await dummyHash);
   if (!user || !matches) throw new AuthError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
   const token = randomBytes(32).toString('base64url');
   if (validToken(previousToken)) await repo.deleteSession(hashToken(previousToken));
   await repo.createSession({ tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(now().getTime() + sessionLifetimeMs) });
   return { token, user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } };
  },
  async me(token?: string) {
   const session = validToken(token) ? await repo.findSession(hashToken(token)) : null;
   if (!session || session.expiresAt <= now()) throw new AuthError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.');
   return session.user;
  },
  async logout(token?: string) { if (validToken(token)) await repo.deleteSession(hashToken(token)); },
 };
}
