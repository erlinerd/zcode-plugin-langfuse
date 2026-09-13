export interface PluginRootResult {
  name: string;
  version: string;
  pluginRoot: string;
  runtimeEntry: string;
}

export function validatePluginRoot(
  pluginRoot?: string,
): Promise<PluginRootResult>;
