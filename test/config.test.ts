import { describe, expect, it } from "vitest";
import { isConfigured, readConfig } from "../src/application/config.js";

describe("configuration", () => {
  it("reads ZCode userConfig variables and normalizes the base URL", () => {
    const config = readConfig(
      {
        ZCODE_USER_CONFIG_LANGFUSE_PUBLIC_KEY: "public-user-config",
        ZCODE_USER_CONFIG_LANGFUSE_SECRET_KEY: "secret-user-config",
        ZCODE_USER_CONFIG_LANGFUSE_BASE_URL: "https://langfuse.example.test///",
        ZCODE_USER_CONFIG_CAPTURE_PROMPTS: "false",
        ZCODE_USER_CONFIG_MAX_CAPTURE_CHARS: "512",
        ZCODE_USER_CONFIG_DEBUG: "true",
      },
      {},
    );

    expect(config).toMatchObject({
      publicKey: "public-user-config",
      secretKey: "secret-user-config",
      baseUrl: "https://langfuse.example.test",
      capturePrompts: false,
      maxCaptureChars: 512,
      debug: true,
    });
    expect(isConfigured(config)).toBe(true);
  });

  it("falls back to standard Langfuse environment variables", () => {
    const config = readConfig(
      {
        LANGFUSE_PUBLIC_KEY: "public-env",
        LANGFUSE_SECRET_KEY: "secret-env",
        LANGFUSE_ENABLED: "0",
      },
      {},
    );

    expect(config.publicKey).toBe("public-env");
    expect(config.secretKey).toBe("secret-env");
    expect(isConfigured(config)).toBe(false);
  });

  it("fails closed for malformed URLs and incomplete credentials", () => {
    const config = readConfig(
      {
        ZCODE_USER_CONFIG_LANGFUSE_PUBLIC_KEY: "public-only",
        ZCODE_USER_CONFIG_LANGFUSE_BASE_URL: "file:///tmp/langfuse",
      },
      {},
    );

    expect(config.baseUrl).toBe("https://cloud.langfuse.com");
    expect(isConfigured(config)).toBe(false);
  });

  it("reads plugin options persisted by ZCode", () => {
    const config = readConfig(
      { ZCODE_PLUGIN_ID: "langfuse-observability@zcode-langfuse-community" },
      {
        langfuse_public_key: "stored-public",
        langfuse_secret_key: "stored-secret",
        langfuse_base_url: "https://stored.example.test",
        capture_prompts: false,
      },
    );

    expect(config).toMatchObject({
      publicKey: "stored-public",
      secretKey: "stored-secret",
      baseUrl: "https://stored.example.test",
      capturePrompts: false,
    });
  });
});
