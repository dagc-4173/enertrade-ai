import {apiRequest,ApiError} from './apiClient'
async function message(path:string,json:unknown) {
 const {data}=await apiRequest(path,{method:'POST',json,credentials:'include'})
 if(!data || typeof data!=='object' || !('message' in data) || typeof data.message!=='string')throw new ApiError('response','La respuesta de recuperación no es válida.')
 return data.message
}
export const requestPasswordRecovery=(email:string)=>message('/auth/forgot-password',{email})
export const resetPassword=(token:string,password:string)=>message('/auth/reset-password',{token,password})
export function recoveryTokenFromHash(hash:string):string|null {
 if(!hash.startsWith('#recuperar='))return null
 const token=hash.slice('#recuperar='.length)
 return /^[A-Za-z0-9_-]{43}$/.test(token)?token:''
}
