// Code shared by the backend and the frontend (imported there as `$shared/...`).
// Keep modules here dependency-free: the frontend bundles them as-is.

/** Close codes the game WebSocket (/ws) sends to the browser. */
export const WS_CLOSE = {
  missingSession: 4400,
  unauthorized: 4401,
  forbidden: 4403,
  notFound: 4404,
  internalError: 4500,
} as const
