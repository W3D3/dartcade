import createClient from 'openapi-fetch'
import type { paths } from './schema'

type ApiOptions = {
  baseUrl?: string
  fetch?: (request: Request) => Promise<Response>
  /** Called on any 401; defaults to the login page. */
  onUnauthorized?: () => void
}

/** Typed client for schema/api-v1.yaml. Paths, params, bodies and responses are checked at compile time. */
export function createApi({ baseUrl = '', fetch, onUnauthorized }: ApiOptions = {}) {
  const client = createClient<paths>({ baseUrl, ...(fetch && { fetch }) })
  const goToLogin =
    onUnauthorized ??
    (() => {
      window.location.hash = '#/login'
    })
  client.use({
    onResponse({ response }) {
      if (response.status === 401) goToLogin()
    },
  })
  return client
}

export const api = createApi()
