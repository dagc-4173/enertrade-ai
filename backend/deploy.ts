import 'dotenv/config';
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {app} from './src/app';
import {prisma} from './src/lib/prisma';
import {xmDailyScheduler} from './src/services/xm-daily-scheduler.service';
import {createDeploymentHttpApp} from './src/deployment/http-app';
import {deploymentConfig} from './src/deployment/config';
const config=deploymentConfig();
await access(resolve(config.directory,'index.html'));
const server=createDeploymentHttpApp(app,config.directory,{production:config.production,trustedProxyHops:config.hops}).listen(config.port,'0.0.0.0',()=>{
 console.log(`EnerTrade AI disponible en puerto ${config.port}; API /api`);
 if(process.env.XM_AUTO_SYNC_ENABLED!=='false')xmDailyScheduler.start();
});
let stopping=false;
function shutdown(){if(stopping)return;stopping=true;xmDailyScheduler.stop();server.close(()=>{void prisma.$disconnect().finally(()=>process.exit(0))});setTimeout(()=>process.exit(1),15000).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
