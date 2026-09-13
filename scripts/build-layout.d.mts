export interface MarketplaceEntry {
  name: string;
  source: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  strict: boolean;
  description_i18n: { en: string; "zh-CN": string };
}

export interface PluginLayoutResult {
  name: string;
  version: string;
  outputRoot: string;
  pluginRoot: string;
  marketplacePath: string;
}

export interface AssemblePluginLayoutResult extends PluginLayoutResult {
  entry: MarketplaceEntry;
}

export function isStrictChild(parent: string, child: string): boolean;

export function validatePluginLayout(options?: {
  outputRoot?: string;
}): Promise<PluginLayoutResult>;

export function assemblePluginLayout(options?: {
  sourceRoot?: string;
  outputRoot?: string;
}): Promise<AssemblePluginLayoutResult>;
