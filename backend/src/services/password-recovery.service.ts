import {createHash,randomBytes} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {AuthError} from './auth.service';
import {recoveryLink,recoveryMailer,type RecoveryMailer} from '@/integrations/recovery-mail';
export const resetLifetimeMs=30*60*1000;
export const recoveryNotice='Si el correo corresponde a una cuenta habilitada, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de correo no deseado.';
export const resetHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function recoveryEmail(body:unknown) {
 if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==1 || !('email' in body) || typeof body.email!=='string' || body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))throw new AuthError(400,'INVALID_EMAIL','Introduce un correo electrónico válido.');
 return body.email.trim().toLowerCase();
}
export function resetInput(body:unknown) {
 if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!['token','password'].includes(key)) || !('token' in body) || typeof body.token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token))throw new AuthError(400,'INVALID_RESET_LINK','El enlace no es válido o ya venció. Solicita uno nuevo.');
 if(!('password' in body) || typeof body.password!=='string' || body.password.length<12 || body.password.length>128)throw new AuthError(400,'INVALID_PASSWORD','La contraseña debe tener entre 12 y 128 caracteres.');
 return {token:body.token,password:body.password};
}
export interface RecoveryRepository {
 issue(email:string,tokenHash:string,expiresAt:Date):Promise<{id:string;email:string}|null>;
 revoke(tokenHash:string):Promise<unknown>;
 consume(tokenHash:string,passwordHash:string,now:Date):Promise<boolean>;
}
export function createRecoveryRepository(database=prisma):RecoveryRepository {
 return {
  issue:(email,tokenHash,expiresAt)=>database.$transaction(async tx=>{
   const users=await tx.$queryRaw<Array<{id:string;email:string;status:string}>>`SELECT "id","email","status" FROM "User" WHERE "email"=${email} FOR UPDATE`;
   const user=users[0];if(!user || user.status!=='ACTIVE')return null;
   await tx.passwordReset.deleteMany({where:{userId:user.id}});
   await tx.passwordReset.create({data:{userId:user.id,tokenHash,expiresAt}});return {id:user.id,email:user.email};
  },{maxWait:10000,timeout:15000}),
  revoke:tokenHash=>database.passwordReset.deleteMany({where:{tokenHash}}),
  consume:(tokenHash,passwordHash,now)=>database.$transaction(async tx=>{
   const reset=await tx.passwordReset.findUnique({where:{tokenHash}});if(!reset)return false;
   const users=await tx.$queryRaw<Array<{status:string}>>`SELECT "status" FROM "User" WHERE "id"=${reset.userId}::uuid FOR UPDATE`;
   const current=await tx.passwordReset.findUnique({where:{tokenHash}});
   if(users[0]?.status!=='ACTIVE' || !current || current.expiresAt<=new Date(Math.max(now.getTime(),Date.now())))return false;
   await tx.user.update({where:{id:reset.userId},data:{passwordHash}});
   await tx.passwordReset.deleteMany({where:{userId:reset.userId}});
   await tx.authSession.deleteMany({where:{userId:reset.userId}});return true;
  },{maxWait:10000,timeout:15000})
 };
}
export function createPasswordRecoveryService(repo:RecoveryRepository=createRecoveryRepository(),mailer:RecoveryMailer=recoveryMailer,now=()=>new Date(),origin=()=>process.env.FRONTEND_ORIGIN!) {
 return {
  ready:()=>mailer.ready(),
  async request(email:string) {
   const token=randomBytes(32).toString('base64url'),tokenHash=resetHash(token);
   const user=await repo.issue(email,tokenHash,new Date(now().getTime()+resetLifetimeMs));if(!user)return;
   try{await mailer.send(user.email,recoveryLink(origin(),token));}
   catch{await repo.revoke(tokenHash);throw Error('RECOVERY_MAIL_FAILED');}
  },
  async reset(body:unknown) {
   const {token,password}=resetInput(body);
   const passwordHash=await Bun.password.hash(password,{algorithm:'argon2id',memoryCost:65536,timeCost:2});
   if(!await repo.consume(resetHash(token),passwordHash,now()))throw new AuthError(400,'INVALID_RESET_LINK','El enlace no es válido o ya venció. Solicita uno nuevo.');
  }
 };
}
