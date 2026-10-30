import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGraphMail, graphMailConfig, saveGraphCredential } from '../integrations/graph-mail';

test('GRAPH-01: exige origen seguro, remitente válido y ruta absoluta', () => {
 const env={GRAPH_CLIENT_ID:'311d4504-af1b-415a-b68e-3a32635f02d5',MAIL_FROM:'sender@hotmail.com',GRAPH_TOKEN_FILE:join(tmpdir(),'test-graph.json'),FRONTEND_ORIGIN:'https://enertrade.example.test',NODE_ENV:'production'};
 expect(graphMailConfig(env)).not.toBeNull();
 expect(graphMailConfig({...env,GRAPH_TOKEN_FILE:'relative.json'})).toBeNull();
 expect(graphMailConfig({...env,FRONTEND_ORIGIN:'http://enertrade.example.test'})).toBeNull();
 expect(graphMailConfig({...env,MAIL_FROM:'bad\r\nheader'})).toBeNull();
});
test('GRAPH-02: renueva una vez en concurrencia, persiste rotación y envía por Graph', async () => {
 const dir=await mkdtemp(join(tmpdir(),'enertrade-graph-'));
 const config={clientId:'fixture',from:'sender@hotmail.com',tokenFile:join(dir,'private','graph.json')};
 let refreshes=0,sends=0;
 const request=(async (url: string | URL | Request, init?: RequestInit) => {
  if(String(url).endsWith('/token')) {refreshes++;expect(String(init?.body)).toContain('grant_type=refresh_token');await Bun.sleep(10);return Response.json({access_token:'fixture-access',refresh_token:'rotated-fixture',expires_in:3600,scope:'Mail.Send User.Read'});}
  sends++;expect(String(url)).toBe('https://graph.microsoft.com/v1.0/me/sendMail');expect((init?.headers as Record<string,string>).Authorization).toBe('Bearer fixture-access');
  const body=JSON.parse(String(init?.body));expect(body.message.toRecipients[0].emailAddress.address).toBe('recipient@example.test');expect(body.message.body.content).toBe('fixture-link');return new Response(null,{status:202});
 }) as typeof fetch;
 try {
  const mail=createGraphMail(config,request);expect(mail.ready()).toBe(false);
  await saveGraphCredential(config,'initial-fixture');expect(mail.ready()).toBe(true);
  await Promise.all([mail.send('recipient@example.test','fixture-link'),mail.send('recipient@example.test','fixture-link')]);
  expect(refreshes).toBe(1);expect(sends).toBe(2);expect(JSON.parse(await readFile(config.tokenFile,'utf8')).refreshToken).toBe('rotated-fixture');
  if(process.platform!=='win32')expect((await stat(config.tokenFile)).mode & 0o777).toBe(0o600);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('GRAPH-03: rechaza cuenta distinta y oculta respuestas privadas', async () => {
 const dir=await mkdtemp(join(tmpdir(),'enertrade-graph-'));
 const config={clientId:'fixture',from:'sender@hotmail.com',tokenFile:join(dir,'graph.json')};let calls=0;
 try {
  await saveGraphCredential({...config,from:'other@hotmail.com'},'fixture');
  const request=(async()=>{calls++;return new Response('private-provider-detail',{status:400});}) as unknown as typeof fetch;
  await expect(createGraphMail(config,request).send('test@example.test','link')).rejects.toThrow('GRAPH_MAIL_FAILED');expect(calls).toBe(0);
  await saveGraphCredential(config,'fixture');
  await expect(createGraphMail(config,request).send('test@example.test','link')).rejects.toThrow('GRAPH_MAIL_FAILED');expect(calls).toBe(1);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('GRAPH-04: un rechazo del envío no se reporta como éxito', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'enertrade-graph-'));const config={clientId:'fixture',from:'sender@hotmail.com',tokenFile:join(dir,'graph.json')};
 try {
  await saveGraphCredential(config,'fixture');
  const request=(async(url: string | URL | Request)=>String(url).endsWith('/token')?Response.json({access_token:'fixture',expires_in:3600,scope:'Mail.Send'}):new Response('private',{status:429})) as typeof fetch;
  await expect(createGraphMail(config,request).send('test@example.test','link')).rejects.toThrow('GRAPH_MAIL_FAILED');
 }finally{await rm(dir,{recursive:true,force:true});}
});
