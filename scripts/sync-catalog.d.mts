export interface SyncCatalogResult {
  plugin: string;
  version: string;
  repo: string;
  branch: string;
  dryRun: boolean;
  changed: boolean | null;
  commit: string | null;
  pushed: boolean;
}

export interface SyncCatalogOptions {
  layoutRoot?: string;
  repo?: string;
  branch?: string;
  dryRun?: boolean;
  push?: boolean;
  log?: (line: string) => void;
}

export function syncCatalog(
  options?: SyncCatalogOptions,
): Promise<SyncCatalogResult>;
