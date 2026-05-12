export type AppEnvironmentName = "development" | "production";

export type AppEnvironment = {
  appEnv: AppEnvironmentName;
  cloudBaseUrl: string | null;
  enableDebugUi: boolean;
  exposeProcessedAudioArtifacts: boolean;
  posthogHost: string;
  posthogPublicKey: string | null;
};

type RawEnvironment = Record<string, unknown>;

const SECRET_ENV_NAME_PATTERN = /(api[_-]?key|secret|token|password|private[_-]?key)/i;
const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PUBLIC_FRONTEND_ENV_NAMES = new Set(["VITE_POSTHOG_PUBLIC_KEY"]);
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

export function parseAppEnvironment(
  raw: RawEnvironment,
  mode = "development",
): AppEnvironment {
  assertNoFrontendSecrets(raw);

  const appEnv = parseAppEnv(readOptionalString(raw, "VITE_APP_ENV"), mode);
  const cloudBaseUrl = parseCloudBaseUrl(
    readOptionalString(raw, "VITE_CLOUD_BASE_URL"),
    appEnv,
  );
  const enableDebugUi = parseBoolean(
    readOptionalString(raw, "VITE_ENABLE_DEBUG_UI"),
    "VITE_ENABLE_DEBUG_UI",
  );
  const posthogPublicKey = readOptionalString(raw, "VITE_POSTHOG_PUBLIC_KEY");
  const posthogHost = parseServiceUrl(
    readOptionalString(raw, "VITE_POSTHOG_HOST") ?? DEFAULT_POSTHOG_HOST,
    "VITE_POSTHOG_HOST",
    appEnv,
  );

  if (appEnv === "production" && enableDebugUi) {
    throw new Error("VITE_ENABLE_DEBUG_UI cannot enable debug UI in production");
  }

  return {
    appEnv,
    cloudBaseUrl,
    enableDebugUi,
    exposeProcessedAudioArtifacts:
      shouldExposeProcessedAudioArtifacts(appEnv),
    posthogHost,
    posthogPublicKey,
  };
}

export function shouldExposeProcessedAudioArtifacts(
  appEnv: AppEnvironmentName,
): boolean {
  return appEnv === "development";
}

export const appEnvironment = parseAppEnvironment(
  import.meta.env,
  import.meta.env.MODE,
);

function assertNoFrontendSecrets(raw: RawEnvironment): void {
  for (const key of Object.keys(raw)) {
    if (
      key.startsWith("VITE_") &&
      !PUBLIC_FRONTEND_ENV_NAMES.has(key) &&
      SECRET_ENV_NAME_PATTERN.test(key)
    ) {
      throw new Error(`${key} must not expose secrets to the frontend bundle`);
    }
  }
}

function parseAppEnv(
  value: string | null,
  mode: string,
): AppEnvironmentName {
  if (value === null) {
    return mode.trim().toLowerCase() === "production"
      ? "production"
      : "development";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "production") {
    return "production";
  }

  if (normalized === "development") {
    return "development";
  }

  throw new Error("VITE_APP_ENV must be development or production");
}

function parseCloudBaseUrl(
  value: string | null,
  appEnv: AppEnvironmentName,
): string | null {
  if (value === null) {
    return null;
  }

  return parseServiceUrl(value, "VITE_CLOUD_BASE_URL", appEnv);
}

function parseServiceUrl(
  value: string,
  key: string,
  appEnv: AppEnvironmentName,
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute URL`);
  }

  if (parsed.protocol === "https:") {
    return parsed.toString().replace(/\/$/, "");
  }

  const isLocalHttp =
    appEnv === "development" &&
    parsed.protocol === "http:" &&
    LOCAL_HTTP_HOSTS.has(parsed.hostname);
  if (isLocalHttp) {
    return parsed.toString().replace(/\/$/, "");
  }

  throw new Error(`${key} must use https outside local development`);
}

function parseBoolean(value: string | null, key: string): boolean {
  if (value === null) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  throw new Error(`${key} must be true or false`);
}

function readOptionalString(raw: RawEnvironment, key: string): string | null {
  const value = raw[key];
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
