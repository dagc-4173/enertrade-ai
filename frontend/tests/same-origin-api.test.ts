import {afterEach,expect,test} from 'bun:test'
import {apiRequest} from '../src/services/apiClient'
const originalFetch=globalThis.fetch,originalBase=process.env.VITE_API_BASE_URL
afterEach(()=>{globalThis.fetch=originalFetch;if(originalBase===undefined)delete process.env.VITE_API_BASE_URL;else process.env.VITE_API_BASE_URL=originalBase})
test('DEP-UI-01: /api usa rutas relativas y cookies sin fijar hostname',async()=>{
 process.env.VITE_API_BASE_URL='/api';let called='';globalThis.fetch=(async url=>{called=String(url);return Response.json({ok:true})}) as typeof fetch;await apiRequest('/auth/me',{credentials:'include'});expect(called).toBe('/api/auth/me');
})
test('DEP-UI-02: rechaza rutas externas y bases relativas no autorizadas',async()=>{
 process.env.VITE_API_BASE_URL='/api';for(const path of ['//foreign.example.test','https://foreign.example.test','/bad\\path']){let error;try{await apiRequest(path)}catch(reason){error=reason}expect(error).toMatchObject({kind:'request'})}
 process.env.VITE_API_BASE_URL='/other';let error;try{await apiRequest('/auth/me')}catch(reason){error=reason}expect(error).toMatchObject({kind:'configuration'})
})
