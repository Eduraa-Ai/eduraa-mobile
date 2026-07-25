import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiConfig } from "../src/api/apiConfig";

test("uses the browser host for local web development", () => {
  assert.deepEqual(
    resolveApiConfig({
      platform: "web",
      isDevelopment: true,
      webHostname: "192.168.1.20",
      webProtocol: "http:",
    }),
    { baseUrl: "http://192.168.1.20:8000", target: "local" },
  );
});

test("uses the Android emulator host alias for local development", () => {
  assert.deepEqual(
    resolveApiConfig({ platform: "android", isDevelopment: true }),
    {
      baseUrl: "http://10.0.2.2:8000",
      target: "local",
    },
  );
});

test("uses localhost for iOS local development", () => {
  assert.deepEqual(resolveApiConfig({ platform: "ios", isDevelopment: true }), {
    baseUrl: "http://localhost:8000",
    target: "local",
  });
});

test("normalizes an explicit remote URL", () => {
  assert.deepEqual(
    resolveApiConfig({
      platform: "android",
      isDevelopment: false,
      universalUrl: " https://api.example.com/// ",
    }),
    { baseUrl: "https://api.example.com", target: "remote" },
  );
});

test("prefers the platform URL over the universal URL during development", () => {
  assert.deepEqual(
    resolveApiConfig({
      platform: "web",
      isDevelopment: true,
      universalUrl: "https://native.example.com",
      webUrl: "https://web.example.com",
    }),
    { baseUrl: "https://web.example.com", target: "remote" },
  );
});

test("rejects platform-specific overrides in release builds", () => {
  assert.throws(
    () =>
      resolveApiConfig({
        platform: "web",
        isDevelopment: false,
        universalUrl: "https://api.example.com",
        webUrl: "https://web-api.example.com",
      }),
    /use only EXPO_PUBLIC_API_URL/,
  );
});

test("rejects a release build without an API URL", () => {
  assert.throws(
    () => resolveApiConfig({ platform: "android", isDevelopment: false }),
    /EXPO_PUBLIC_API_URL is required/,
  );
});

for (const localUrl of [
  "https://localhost:8000",
  "https://localhost.:8000",
  "https://api.localhost:8000",
  "https://127.20.30.40:8000",
  "https://0.0.0.0:8000",
  "https://10.0.2.2:8000",
  "https://169.254.10.20:8000",
  "https://172.20.0.5:8000",
  "https://192.168.1.20:8000",
  "https://198.51.100.20:8000",
  "https://api.local:8000",
  "https://api.internal:8000",
  "https://api.lan:8000",
  "https://api.home.arpa:8000",
  "https://[::1]:8000",
  "https://[::ffff:192.168.1.20]:8000",
  "https://[100::1]:8000",
  "https://[2001:2::1]:8000",
  "https://[2001:db8::1]:8000",
  "https://[fd00::1]:8000",
  "https://[fe80::1]:8000",
]) {
  test(`rejects non-public release URL ${localUrl}`, () => {
    assert.throws(
      () =>
        resolveApiConfig({
          platform: "web",
          isDevelopment: false,
          universalUrl: localUrl,
        }),
      /require a public API hostname/,
    );
  });
}

test("allows public DNS names that begin with an IPv6-looking prefix", () => {
  assert.deepEqual(
    resolveApiConfig({
      platform: "android",
      isDevelopment: false,
      universalUrl: "https://fc-api.example.com",
    }),
    { baseUrl: "https://fc-api.example.com", target: "remote" },
  );
});

test("does not reject the public portion of 198.51.0.0/16", () => {
  assert.deepEqual(
    resolveApiConfig({
      platform: "android",
      isDevelopment: false,
      universalUrl: "https://198.51.1.20",
    }),
    { baseUrl: "https://198.51.1.20", target: "remote" },
  );
});

test("allows a public IPv6 unicast endpoint", () => {
  assert.deepEqual(
    resolveApiConfig({
      platform: "android",
      isDevelopment: false,
      universalUrl: "https://[2606:4700:4700::1111]",
    }),
    { baseUrl: "https://[2606:4700:4700::1111]", target: "remote" },
  );
});

test("rejects plain HTTP API URLs in release builds", () => {
  assert.throws(
    () =>
      resolveApiConfig({
        platform: "android",
        isDevelopment: false,
        universalUrl: "http://api.example.com",
      }),
    /require an HTTPS API URL/,
  );
});

test("rejects credentials embedded in an API URL", () => {
  assert.throws(
    () =>
      resolveApiConfig({
        platform: "android",
        isDevelopment: true,
        universalUrl: "https://user:password@api.example.com",
      }),
    /cannot contain credentials/,
  );
});

for (const malformedOrigin of [
  "https://api.example.com/base",
  "https://api.example.com?tenant=one",
  "https://api.example.com#fragment",
]) {
  test(`rejects API URL components outside the origin: ${malformedOrigin}`, () => {
    assert.throws(
      () =>
        resolveApiConfig({
          platform: "android",
          isDevelopment: true,
          universalUrl: malformedOrigin,
        }),
      /must contain only an origin/,
    );
  });
}

test("rejects non-http API URLs", () => {
  assert.throws(
    () =>
      resolveApiConfig({
        platform: "android",
        isDevelopment: true,
        universalUrl: "file:///tmp/api",
      }),
    /must use http or https/,
  );
});
