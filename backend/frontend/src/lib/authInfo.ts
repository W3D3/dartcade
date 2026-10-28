import { loadOnce } from './loadOnce.js'
import { createApi } from './api/client.js'

const quietApi = createApi({ onUnauthorized: () => undefined })

/** Whether this deployment sends mail and requires email verification, its contact email, whether it takes bug reports and has Sign in with Discord (GET /api/auth-info), loaded once for the whole app. */
export const authInfo = loadOnce(
  async () => {
    const { data } = await quietApi.GET('/api/auth-info')
    return data ?? { mail: false, verification: false, contactEmail: null, feedback: false, discord: false }
  },
  { mail: false, verification: false, contactEmail: null, feedback: false, discord: false },
)
