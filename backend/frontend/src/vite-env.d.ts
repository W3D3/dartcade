/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_EMAIL?: string
  readonly VITE_DEV_PASSWORD?: string
  // The build stamp, set by backend/Dockerfile (unset in dev)
  readonly VITE_APP_VERSION?: string
  readonly VITE_APP_COMMIT?: string
  readonly VITE_APP_BUILD_TIME?: string
}
