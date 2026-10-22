import {apiRequest,ApiError} from './apiClient'
export async function changeOwnPassword(currentPassword:string,newPassword:string) {
 const {data}=await apiRequest('/auth/change-password',{method:'POST',credentials:'include',json:{currentPassword,newPassword}})
 if(!data || typeof data!=='object' || !('message' in data) || typeof data.message!=='string')throw new ApiError('response','La respuesta del cambio de contraseña no es válida.')
 return data.message
}
