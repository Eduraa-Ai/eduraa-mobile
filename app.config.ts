import type { ConfigContext, ExpoConfig } from "expo/config";

const { resolveReleaseApiBaseUrl } = require("./src/api/apiConfig.cjs") as {
  resolveReleaseApiBaseUrl: (environment: {
    universalUrl?: string;
    webUrl?: string;
    nativeUrl?: string;
  }) => string;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  const requiresReleaseApi = buildProfile
    ? buildProfile !== "development"
    : process.env.NODE_ENV === "production";
  const usesAnonymousExpoGo =
    process.env.EDURAA_EXPO_GO_ANONYMOUS === "1" && !requiresReleaseApi;

  if (!config.name || !config.slug) {
    throw new Error("app.json must define expo.name and expo.slug.");
  }

  if (requiresReleaseApi) {
    resolveReleaseApiBaseUrl({
      universalUrl: process.env.EXPO_PUBLIC_API_URL,
      webUrl: process.env.EXPO_PUBLIC_WEB_API_URL,
      nativeUrl: process.env.EXPO_PUBLIC_NATIVE_API_URL,
    });
  }

  const resolvedConfig: ExpoConfig = {
    ...config,
    name: config.name,
    slug: config.slug,
  };

  if (!usesAnonymousExpoGo) {
    return resolvedConfig;
  }

  const { owner: _owner, ...anonymousConfig } = resolvedConfig;
  const { eas: _eas, ...anonymousExtra } = anonymousConfig.extra ?? {};

  return {
    ...anonymousConfig,
    extra:
      Object.keys(anonymousExtra).length > 0 ? anonymousExtra : undefined,
  };
};
