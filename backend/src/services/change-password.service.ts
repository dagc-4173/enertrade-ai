import {createHash,randomBytes} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {AuthError} from './auth.service';
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
export function changePasswordInput(body:unknown) {
 if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==2 || Object.keys(body).some(key=>!['currentPassword','newPassword'].includes(key)) || !('currentPassword' in body) || !('newPassword' in body) || typeof body.currentPassword!=='string' || !body.currentPassword.length || body.currentPassword.length>128 || typeof body.newPassword!=='string' || body.newPassword.length<12 || body.newPassword.length>128)throw new AuthError(400,'INVALID_PASSWORD_CHANGE','Introduce tu contraseña actual y una nueva de 12 a 128 caracteres.');
 if(body.currentPassword===body.newPassword)throw new AuthError(400,'PASSWORD_UNCHANGED','La nueva contraseña debe ser diferente de la actual.');
 return {currentPassword:body.currentPassword,newPassword:body.newPassword};
}
export interface PasswordChangeRepository {
 snapshot(tokenHash:string):Promise<{userId:string;expiresAt:Date;user:{passwordHash:string;status:string}}|null>;
 commit(oldTokenHash:string,expectedPasswordHash:string,newPasswordHash:string,newTokenHash:string,now:Date):Promise<Date|null>;
}
export function createPasswordChangeRepository(database=prisma):PasswordChangeRepository {
 return {
  snapshot:tokenHash=>database.authSession.findUnique({where:{tokenHash},select:{userId:true,expiresAt:true,user:{select:{passwordHash:true,status:true}}}}),
  commit:(oldTokenHash,expectedPasswordHash,newPasswordHash,newTokenHash,now)=>database.$transaction(async tx=>{
   const snapshot=await tx.authSession.findUnique({where:{tokenHash:oldTokenHash}});if(!snapshot)return null;
   const users=await tx.$queryRaw<Array<{passwordHash:string;status:string}>>`SELECT "passwordHash","status" FROM "User" WHERE "id"=${snapshot.userId}::uuid FOR UPDATE`;
   const session=await tx.authSession.findUnique({where:{tokenHash:oldTokenHash}});
   if(!session || session.expiresAt<=new Date(Math.max(now.getTime(),Date.now())) || users[0]?.status!=='ACTIVE' || users[0].passwordHash!==expectedPasswordHash)return null;
   await tx.user.update({where:{id:snapshot.userId},data:{passwordHash:newPasswordHash}});
   await tx.passwordReset.deleteMany({where:{userId:snapshot.userId}});
   await tx.authSession.deleteMany({where:{userId:snapshot.userId}});
   await tx.authSession.create({data:{userId:snapshot.userId,tokenHash:newTokenHash,expiresAt:session.expiresAt}});
   return session.expiresAt;
  },{maxWait:10000,timeout:15000})
 };
}
export function createChangePasswordService(repo:PasswordChangeRepository=createPasswordChangeRepository(),now=()=>new Date()) {
 return {async change(body:unknown,token?:string) {
  const input=changePasswordInput(body);
  if(!token || !/^[A-Za-z0-9_-]{43}$/.test(token))throw new AuthError(401,'UNAUTHENTICATED','Debes iniciar sesión.');
  const oldHash=digest(token),snapshot=await repo.snapshot(oldHash);
  if(!snapshot || snapshot.expiresAt<=now() || snapshot.user.status!=='ACTIVE')throw new AuthError(401,'UNAUTHENTICATED','Debes iniciar sesión nuevamente.');
  if(!await Bun.password.verify(input.currentPassword,snapshot.user.passwordHash))throw new AuthError(400,'CURRENT_PASSWORD_INCORRECT','La contraseña actual no es correcta.');
  const passwordHash=await Bun.password.hash(input.newPassword,{algorithm:'argon2id',memoryCost:65536,timeCost:2});
  const newToken=randomBytes(32).toString('base64url');
  const expiresAt=await repo.commit(oldHash,snapshot.user.passwordHash,passwordHash,digest(newToken),now());
  if(!expiresAt)throw new AuthError(409,'PASSWORD_CHANGE_CONFLICT','La sesión o contraseña cambió durante la operación. Inicia sesión nuevamente.');
  return {token:newToken,expiresAt};
 }};
}
