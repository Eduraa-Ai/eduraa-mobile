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

  return { ...config, name: config.name, slug: config.slug };
};
