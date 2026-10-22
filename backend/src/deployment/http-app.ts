import express,{type Express} from 'express';
import helmet from 'helmet';
import {extname,resolve} from 'node:path';
export function createDeploymentHttpApp(api:Express,frontendDirectory:string,options:{production?:boolean;trustedProxyHops?:number}={}) {
 const server=express();server.disable('x-powered-by');
 const hops=options.trustedProxyHops??0;
 if(!Number.isInteger(hops) || hops<0 || hops>2)throw Error('INVALID_TRUST_PROXY_HOPS');
 server.set('trust proxy',hops);api.set('trust proxy',hops);
 server.use(helmet({contentSecurityPolicy:false,strictTransportSecurity:options.production?{maxAge:31536000,includeSubDomains:false}:false,referrerPolicy:{policy:'no-referrer'}}));
 server.use('/api',api,(_req,res)=>{res.status(404).json({error:'API_ROUTE_NOT_FOUND',message:'La ruta solicitada no existe.'})});
 const root=resolve(frontendDirectory);
 server.use(express.static(root,{dotfiles:'deny',index:'index.html',setHeaders:(res,file)=>{res.setHeader('Cache-Control',file.includes('/assets/')||file.includes('\\assets\\')?'public, max-age=31536000, immutable':'no-cache')}}));
 server.use((req,res,next)=>{if(['GET','HEAD'].includes(req.method) && !extname(req.path) && !req.path.split('/').some(part=>part.startsWith('.')) && req.accepts('html')){res.set('Cache-Control','no-cache').sendFile(resolve(root,'index.html'));return;}next()});
 server.use((_req,res)=>{res.status(404).json({error:'NOT_FOUND',message:'El recurso solicitado no existe.'})});
 return server;
}
