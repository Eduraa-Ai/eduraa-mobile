export type ApiTarget = "local" | "remote";

export type ApiConfigOptions = {
  platform: string;
  isDevelopment: boolean;
  universalUrl?: string;
  webUrl?: string;
  nativeUrl?: string;
  webHostname?: string;
  webProtocol?: string;
};

export type ResolvedApiConfig = {
  baseUrl: string;
  target: ApiTarget;
};

type ReleaseApiEnvironment = Pick<
  ApiConfigOptions,
  "universalUrl" | "webUrl" | "nativeUrl"
>;

const runtime = require("./apiConfig.cjs") as {
  resolveApiConfig: (options: ApiConfigOptions) => ResolvedApiConfig;
  resolveReleaseApiBaseUrl: (environment: ReleaseApiEnvironment) => string;
};

export const resolveApiConfig = runtime.resolveApiConfig;
export const resolveReleaseApiBaseUrl = runtime.resolveReleaseApiBaseUrl;
