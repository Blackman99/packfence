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
