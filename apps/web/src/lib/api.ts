import type { ApiErrorBody } from '@osm/shared'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function fallbackMessage(status: number): string {
  let locale: string | null = null
  try {
    locale = window.localStorage.getItem('osm.locale')
  } catch {
    // Storage can be unavailable; fall back to the browser language.
  }
  const english = locale === 'en' || (locale === null && !navigator.language.startsWith('zh'))
  return english ? `Request failed (${status})` : `请求失败（${status}）`
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorBody
    const message = Array.isArray(body.message) ? body.message.join('；') : body.message
    return new ApiError(response.status, message || fallbackMessage(response.status))
  } catch {
    return new ApiError(response.status, fallbackMessage(response.status))
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers,
  })
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function parseXhrError(xhr: XMLHttpRequest): ApiError {
  const status = xhr.status || 0
  try {
    const body = JSON.parse(xhr.responseText) as ApiErrorBody
    const message = Array.isArray(body.message) ? body.message.join('；') : body.message
    return new ApiError(status, message || fallbackMessage(status))
  } catch {
    return new ApiError(status, fallbackMessage(status))
  }
}

/**
 * Multipart POST with upload progress. `fetch` cannot report upload progress,
 * so composing a message with attachments goes through XHR.
 */
function postFormWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    xhr.withCredentials = true
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!xhr.responseText) {
          resolve(undefined as T)
          return
        }
        try {
          resolve(JSON.parse(xhr.responseText) as T)
        } catch {
          resolve(undefined as T)
        }
        return
      }
      reject(parseXhrError(xhr))
    }
    xhr.onerror = () => reject(new ApiError(0, fallbackMessage(0)))
    xhr.onabort = () => reject(new ApiError(0, fallbackMessage(0)))
    xhr.send(form)
  })
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  },
  postForm<T>(path: string, form: FormData): Promise<T> {
    return request<T>(path, { method: 'POST', body: form })
  },
  postFormWithProgress<T>(
    path: string,
    form: FormData,
    onProgress: (percent: number) => void,
  ): Promise<T> {
    return postFormWithProgress<T>(path, form, onProgress)
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  },
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}
