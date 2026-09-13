export interface PluginLayoutResult {
  name: string;
  version: string;
  outputRoot: string;
  pluginRoot: string;
  entryPath: string;
}

export function isStrictChild(parent: string, child: string): boolean;

export function validatePluginLayout(options?: {
  outputRoot?: string;
}): Promise<PluginLayoutResult>;

export function assemblePluginLayout(options?: {
  sourceRoot?: string;
  outputRoot?: string;
}): Promise<PluginLayoutResult>;
