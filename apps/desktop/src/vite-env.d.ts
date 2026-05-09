/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: "development" | "production";
  readonly VITE_CLOUD_BASE_URL?: string;
  readonly VITE_ENABLE_DEBUG_UI?: string;
}
