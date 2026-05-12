import posthog from "posthog-js";

import { appEnvironment } from "@/config/app-env";

import { createAnalytics } from "./analytics";

export const analytics = createAnalytics({
  appVersion: __APP_VERSION__,
  environment: appEnvironment,
  posthog,
  storage: window.localStorage,
});
