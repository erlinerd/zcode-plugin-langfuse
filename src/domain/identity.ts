/**
 * Stable plugin identifier shared by the Hook runtime (diagnostics prefix),
 * the local state directory fallback, and the Langfuse SDK integration
 * metadata. Must match the `name` in `.zcode-plugin/plugin.json` and the
 * first plugin entry in `marketplace.json`; test/identity.test.ts pins this
 * contract so the identifiers cannot drift apart again.
 */
export const PLUGIN_ID = "zcode-plugin-langfuse";
