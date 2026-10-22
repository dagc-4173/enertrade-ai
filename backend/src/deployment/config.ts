import {isAbsolute} from 'node:path';
export function deploymentConfig(env:NodeJS.ProcessEnv=process.env){
 const port=Number(env.PORT??'8080'),hops=Number(env.TRUST_PROXY_HOPS??'0'),production=env.NODE_ENV==='production';
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_DEPLOYMENT_PORT');
 if(!Number.isInteger(hops)||hops<0||hops>2)throw Error('INVALID_TRUST_PROXY_HOPS');
 if(!env.DATABASE_URL?.trim())throw Error('DEPLOYMENT_DATABASE_REQUIRED');
 const directory=env.FRONTEND_DIST_DIR;
 if(!directory || !isAbsolute(directory))throw Error('FRONTEND_DIST_DIRECTORY_REQUIRED');
 let origin:URL;try{origin=new URL(env.FRONTEND_ORIGIN??'')}catch{throw Error('PUBLIC_ORIGIN_REQUIRED')}
 if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!['https:','http:'].includes(origin.protocol)||(production&&origin.protocol!=='https:'))throw Error('INVALID_PUBLIC_ORIGIN');
 return {port,hops,production,directory};
}
