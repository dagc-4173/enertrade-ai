import nodemailer from 'nodemailer';
export type RecoveryMailer = { ready(): boolean; send(to: string, link: string): Promise<void> };
export function recoveryMailConfig(env: NodeJS.ProcessEnv = process.env) {
 const host=env.SMTP_HOST?.trim(), user=env.SMTP_USER?.trim(), pass=env.SMTP_PASSWORD, from=env.MAIL_FROM?.trim();
 const port=Number(env.SMTP_PORT ?? '587');
 let origin: URL;
 try {origin=new URL(env.FRONTEND_ORIGIN ?? '');}catch{return null;}
 const local=['localhost','127.0.0.1','[::1]'].includes(origin.hostname);
 if (!host || !user || !pass || !from || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || ![465,587].includes(port) || origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/' || (origin.protocol!=='https:' && !(env.NODE_ENV!=='production' && local && origin.protocol==='http:')))return null;
 return {host,port,user,pass,from,origin:origin.origin};
}
export function recoveryLink(origin: string, token: string) {
 const url=new URL(origin);url.hash=`recuperar=${token}`;return url.href;
}
export const recoveryMailer: RecoveryMailer = {
 ready:()=>recoveryMailConfig()!==null,
 async send(to,link) {
  const config=recoveryMailConfig();if(!config)throw Error('MAIL_NOT_CONFIGURED');
  const transport=nodemailer.createTransport({host:config.host,port:config.port,secure:config.port===465,requireTLS:true,auth:{user:config.user,pass:config.pass},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,logger:false,debug:false});
  const result=await transport.sendMail({from:config.from,to,subject:'Recupera tu contraseña de EnerTrade AI',text:`Recibimos una solicitud para restablecer tu contraseña de EnerTrade AI.\n\nAbre este enlace (vence en 30 minutos y solo puede usarse una vez):\n${link}\n\nSi no lo solicitaste, ignora este correo. Tu contraseña no cambia hasta completar el formulario. EnerTrade AI nunca te pedirá que envíes tu contraseña por correo.`,disableFileAccess:true,disableUrlAccess:true});
  if(!result.accepted?.length)throw Error('MAIL_DELIVERY_REJECTED');
 }
};
