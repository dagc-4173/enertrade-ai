export type ApiErrorKind = 'configuration' | 'request' | 'network' | 'aborted' | 'http' | 'response'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly code: string | null
  readonly serverMessage: string | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, code: string | null = null, serverMessage: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
    this.serverMessage = serverMessage
  }
}

export interface ApiResponse<T> {
  status: number
  data: T | null
}

export type ApiRequestOptions = Omit<RequestInit, 'body'> & { json?: unknown }

function requestUrl(path: string): string {
  const base: unknown = import.meta.env.VITE_API_BASE_URL
  if (typeof base !== 'string' || !base.trim()) {
    throw new ApiError('configuration', 'Falta configurar VITE_API_BASE_URL.')
  }
  try {
    const url = new URL(base.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error()
    }
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new ApiError('request', 'La ruta API debe comenzar con una sola barra.')
    }
    return `${url.href.replace(/\/$/, '')}${path}`
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('configuration', 'VITE_API_BASE_URL debe ser una URL HTTP válida sin credenciales, consulta ni fragmento.')
  }
}

/** T describes the expected JSON contract; it does not perform runtime validation. */
export async function apiRequest<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
  const url = requestUrl(path)
  const { json, ...init } = options
  let headers: Headers
  let body: string | undefined
  try {
    headers = new Headers(init.headers)
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
    if (json !== undefined) {
      body = JSON.stringify(json)
      if (body === undefined) throw new Error()
      headers.set('Content-Type', 'application/json')
    }
  } catch {
    throw new ApiError('request', 'No fue posible construir la solicitud JSON.')
  }

  let response: Response
  try {
    response = await fetch(url, { ...init, headers, body })
  } catch {
    if (init.signal?.aborted) throw new ApiError('aborted', 'La solicitud fue cancelada.')
    throw new ApiError('network', 'No fue posible comunicarse con la API.')
  }

  let text: string
  try {
    text = await response.text()
  } catch {
    if (init.signal?.aborted) throw new ApiError('aborted', 'La solicitud fue cancelada.', response.status)
    throw new ApiError('response', 'No fue posible leer la respuesta de la API.', response.status)
  }

  let data: unknown = null
  let validJson = true
  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      validJson = false
    }
  }
  if (!response.ok) {
    // Only retain the bounded plain-text message from a structured error envelope.
    // Raw bodies, stack fields and fetch internals are never exposed.
    const candidate = data !== null && typeof data === 'object' && 'error' in data ? data.error : null
    const code = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(candidate) ? candidate : null
    const message = data !== null && typeof data === 'object' && !('stack' in data) && 'message' in data ? data.message : null
    const serverMessage = code && typeof message === 'string' && message.trim() && message.length <= 500 && !/[<>\r\n]/.test(message)
      ? message : null
    throw new ApiError('http', `La API respondió con HTTP ${response.status}.`, response.status, code, serverMessage)
  }
  if (!validJson) {
    throw new ApiError('response', 'La API devolvió una respuesta que no es JSON válido.', response.status)
  }
  return { status: response.status, data: data as T | null }
}

/** Omit json entirely for endpoints whose contract requires an empty body. */
export function postJson<T = unknown>(path: string, json?: unknown, options: Omit<ApiRequestOptions, 'method' | 'json'> = {}) {
  return apiRequest<T>(path, { ...options, method: 'POST', json })
}

// Compatibility helper while modules still depend on mock data.
export async function resolveMock<T>(data: T): Promise<T> {
  return Promise.resolve(data)
}
