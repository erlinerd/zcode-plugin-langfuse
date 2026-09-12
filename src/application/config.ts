import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HookConfig } from "../domain/types.js";

const DEFAULT_BASE_URL = "https://cloud.langfuse.com";
const DEFAULT_RELEASE = "0.1.0";
const DEFAULT_MAX_CAPTURE_CHARS = 20_000;

export type StoredOption = string | number | boolean;
export type StoredOptions = Record<string, StoredOption>;
type ConfigValue = StoredOption | undefined;

function asText(value: ConfigValue): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : String(value);
}

function firstNonEmpty(...values: ConfigValue[]): string | undefined {
  return values
    .map(asText)
    .find((value) => value !== undefined && value.trim().length > 0)
    ?.trim();
}

function userConfig(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const normalized = name.toUpperCase();
  return firstNonEmpty(
    env[`ZCODE_USER_CONFIG_${normalized}`],
    env[`ZCODE_PLUGIN_CONFIG_${normalized}`],
  );
}

function isStoredOption(value: unknown): value is StoredOption {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function parseStoredOptions(value: unknown): StoredOptions {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  const options: StoredOptions = {};
  for (const [key, option] of Object.entries(value)) {
    if (isStoredOption(option)) options[key] = option;
  }
  return options;
}

function readStoredOptions(env: NodeJS.ProcessEnv): StoredOptions {
  const configPaths = [
    env.ZCODE_CONFIG_PATH,
    join(homedir(), ".zcode", "cli", "config.json"),
  ].filter((path): path is string => Boolean(path));
  const configuredPluginId = env.ZCODE_PLUGIN_ID;

  for (const configPath of configPaths) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        continue;
      const plugins = (parsed as Record<string, unknown>).plugins;
      if (
        typeof plugins !== "object" ||
        plugins === null ||
        Array.isArray(plugins)
      )
        continue;
      const options = (plugins as Record<string, unknown>).options;
      if (
        typeof options !== "object" ||
        options === null ||
        Array.isArray(options)
      )
        continue;
      const optionEntries = options as Record<string, unknown>;
      const pluginId =
        configuredPluginId && optionEntries[configuredPluginId]
          ? configuredPluginId
          : Object.keys(optionEntries).find((key) =>
              key.startsWith("langfuse-observability@"),
            );
      if (pluginId) return parseStoredOptions(optionEntries[pluginId]);
    } catch {
      // A missing or unreadable user config must not block a ZCode hook.
    }
  }
  return {};
}

function option(
  env: NodeJS.ProcessEnv,
  storedOptions: StoredOptions,
  name: string,
  environmentName: string,
): string | undefined {
  return firstNonEmpty(
    userConfig(env, name),
    storedOptions[name],
    env[environmentName],
  );
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return fallback;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 1_000_000);
}

function normalizeBaseUrl(value: string | undefined): string {
  const candidate = value ?? DEFAULT_BASE_URL;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return DEFAULT_BASE_URL;
    return candidate.replace(/\/+$/, "");
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
  storedOptions: StoredOptions = readStoredOptions(env),
): HookConfig {
  const enabled = parseBoolean(
    option(env, storedOptions, "enabled", "LANGFUSE_ENABLED"),
    true,
  );
  const publicKey =
    option(env, storedOptions, "langfuse_public_key", "LANGFUSE_PUBLIC_KEY") ??
    null;
  const secretKey =
    option(env, storedOptions, "langfuse_secret_key", "LANGFUSE_SECRET_KEY") ??
    null;

  return {
    publicKey,
    secretKey,
    baseUrl: normalizeBaseUrl(
      option(env, storedOptions, "langfuse_base_url", "LANGFUSE_BASE_URL"),
    ),
    userId:
      option(env, storedOptions, "langfuse_user_id", "LANGFUSE_USER_ID") ??
      null,
    environment:
      option(
        env,
        storedOptions,
        "langfuse_environment",
        "LANGFUSE_ENVIRONMENT",
      ) ?? "development",
    release:
      option(env, storedOptions, "langfuse_release", "LANGFUSE_RELEASE") ??
      DEFAULT_RELEASE,
    enabled,
    capturePrompts: parseBoolean(
      option(env, storedOptions, "capture_prompts", "LANGFUSE_CAPTURE_PROMPTS"),
      true,
    ),
    captureToolInputs: parseBoolean(
      option(
        env,
        storedOptions,
        "capture_tool_inputs",
        "LANGFUSE_CAPTURE_TOOL_INPUTS",
      ),
      true,
    ),
    captureToolOutputs: parseBoolean(
      option(
        env,
        storedOptions,
        "capture_tool_outputs",
        "LANGFUSE_CAPTURE_TOOL_OUTPUTS",
      ),
      true,
    ),
    maxCaptureChars: parsePositiveInteger(
      option(
        env,
        storedOptions,
        "max_capture_chars",
        "LANGFUSE_MAX_CAPTURE_CHARS",
      ),
      DEFAULT_MAX_CAPTURE_CHARS,
    ),
    debug: parseBoolean(
      option(env, storedOptions, "debug", "LANGFUSE_DEBUG"),
      false,
    ),
  };
}

export function isConfigured(config: HookConfig): boolean {
  return config.enabled && Boolean(config.publicKey && config.secretKey);
}
