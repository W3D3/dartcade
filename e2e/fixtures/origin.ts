/** The e2e stack's frontend, from the port the stack was started with. */
export const E2E_ORIGIN = `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 5174}`
export const E2E_WS_ORIGIN = E2E_ORIGIN.replace(/^http/, 'ws')
