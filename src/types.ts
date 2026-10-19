export type Severity = "fail" | "warn" | "info" | "allow";

export interface PackedFile {
  path: string;
  size: number;
}

export interface Finding {
  path: string;
  rule: string;
  severity: Severity;
  message: string;
  size?: number;
  /** 1-based line of the first match (content rules only). */
  line?: number;
  /** 1-based column of the first match (content rules only). */
  column?: number;
  /** Redacted preview of the match, e.g. `AKIA…MPLE`. Never the full secret. */
  redacted?: string;
  /** How many times the rule matched in this file. */
  matches?: number;
}

export interface PackfenceConfig {
  allow?: string[];
  deny?: string[];
  severity?: Record<string, Severity>;
  maxFileBytes?: number;
  maxFileWarnBytes?: number;
  maxTotalBytes?: number;
  contentScanMaxBytes?: number;
}

export interface ScanResult {
  files: PackedFile[];
  findings: Finding[];
  totalBytes: number;
  failed: boolean;
  warned: boolean;
}

/** One screened package ("bag") with where it lives relative to the report root. */
export interface PackageReport {
  name: string;
  version?: string;
  /** Absolute package directory. */
  dir: string;
  /** Package directory relative to the report root, POSIX, "" for the root itself. */
  relDir: string;
  result: ScanResult;
}

export interface SkippedPackage {
  name: string;
  relDir: string;
  reason: string;
}

export interface MultiScanResult {
  packages: PackageReport[];
  skipped: SkippedPackage[];
  failed: boolean;
  warned: boolean;
  /** True when the root declares workspaces but they were not expanded. */
  workspacesHint?: boolean;
  /** True when a private workspace root was expanded into its workspaces automatically. */
  autoWorkspaces?: boolean;
}
