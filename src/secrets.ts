import type { Severity } from "./types.js";

export interface ContentRule {
  rule: string;
  re: RegExp;
  message: string;
  severity: Severity;
  /** Optional extra check on the matched text; return false to discard. */
  accept?: (match: RegExpExecArray) => boolean;
  /** Which capture group holds the secret (for redaction). Default: whole match. */
  group?: number;
}

/** Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function charClasses(s: string): number {
  let n = 0;
  if (/[a-z]/.test(s)) n++;
  if (/[A-Z]/.test(s)) n++;
  if (/[0-9]/.test(s)) n++;
  return n;
}

const PLACEHOLDER =
  /^(?:x+|\*+|\.+|<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|%[A-Z_]+%|your[_-]?.*|changeme|change[_-]?me|example.*|placeholder|redacted|dummy|test|password|passwd|pass|secret|token|pwd|user(?:name)?)$/i;

/** True if a value looks like a real random credential rather than a placeholder or identifier. */
export function looksRandom(value: string, minEntropy = 4.0): boolean {
  if (value.length < 20) return false;
  if (PLACEHOLDER.test(value)) return false;
  if (/^(.)\1+$/.test(value)) return false;
  // Pure lowercase words joined by separators read as identifiers, not keys.
  if (/^[a-z]+(?:[-_.][a-z]+)*$/.test(value)) return false;
  if (charClasses(value) < 2) return false;
  return shannonEntropy(value) >= minEntropy;
}

/**
 * Content heuristics. Specific, high-confidence token formats are `fail`
 * (Anthropic-class defaults: secrets never ship). Fuzzy heuristics that can
 * hit docs or public client keys are `warn`, so they surface without
 * blocking until a human looks.
 */
export const CONTENT_RULES: ContentRule[] = [
  {
    rule: "content-aws-key",
    re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    message: "Looks like an AWS access key id",
    severity: "fail",
  },
  {
    rule: "content-private-key",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
    message: "Contains a private key PEM header",
    severity: "fail",
  },
  {
    rule: "content-github-token",
    re: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
    message: "Looks like a GitHub token",
    severity: "fail",
  },
  {
    rule: "content-npm-token",
    re: /\bnpm_[A-Za-z0-9]{36,}\b/g,
    message: "Looks like an npm access token",
    severity: "fail",
  },
  {
    rule: "content-slack-token",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    message: "Looks like a Slack token",
    severity: "fail",
  },
  {
    rule: "content-slack-webhook",
    re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,}/g,
    message: "Looks like a Slack incoming-webhook URL",
    severity: "fail",
  },
  {
    rule: "content-stripe-key",
    re: /\b(?:sk|rk)_live_[0-9A-Za-z]{24,}\b/g,
    message: "Looks like a live Stripe secret key",
    severity: "fail",
  },
  {
    rule: "content-anthropic-key",
    re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{32,}/g,
    message: "Looks like an Anthropic API key",
    severity: "fail",
  },
  {
    rule: "content-openai-key",
    re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{16,}T3BlbkFJ[A-Za-z0-9_-]{16,}/g,
    message: "Looks like an OpenAI API key",
    severity: "fail",
  },
  {
    rule: "content-huggingface-token",
    re: /\bhf_[A-Za-z0-9]{34,}\b/g,
    message: "Looks like a Hugging Face access token",
    severity: "fail",
    accept: (m) => charClasses(m[0].slice(3)) >= 2,
  },
  {
    rule: "content-gitlab-token",
    re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    message: "Looks like a GitLab personal access token",
    severity: "fail",
  },
  {
    rule: "content-sendgrid-key",
    re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    message: "Looks like a SendGrid API key",
    severity: "fail",
  },
  {
    rule: "content-google-api-key",
    re: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    message:
      "Looks like a Google API key (often public in Firebase web config; confirm it is restricted)",
    severity: "warn",
  },
  {
    rule: "content-url-credentials",
    re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/([^\s:@/"'`]{1,64}):([^\s:@/"'`]{6,128})@[A-Za-z0-9.-]+/g,
    message: "URL embeds a username:password pair",
    severity: "warn",
    group: 2,
    accept: (m) => {
      const pass = m[2] ?? "";
      return !PLACEHOLDER.test(pass) && !/^\$|^%|^<|^\{/.test(pass);
    },
  },
  {
    rule: "content-high-entropy",
    re: /\b[A-Za-z0-9_]*(?:secret|token|passw(?:or)?d|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?key)[A-Za-z0-9_]*["']?\s*[:=]\s*["'`]([A-Za-z0-9+/=_.-]{20,200})["'`]/gi,
    message: "High-entropy string assigned to a secret-looking name",
    severity: "warn",
    group: 1,
    accept: (m) => looksRandom(m[1] ?? ""),
  },
];

/** Redact a secret for display: keep a short prefix/suffix, never the middle. */
export function redact(secret: string): string {
  const s = secret.trim();
  if (s.length <= 8) return "•".repeat(Math.max(4, s.length));
  const head = s.startsWith("-----") ? s.slice(0, 16) : s.slice(0, 4);
  if (s.startsWith("-----")) return `${head}…`;
  return `${head}…${s.slice(-4)}`;
}

export interface ContentHit {
  rule: string;
  severity: Severity;
  message: string;
  line: number;
  column: number;
  redacted: string;
  matches: number;
}

function lineCol(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, column: index - last };
}

/** Scan text with every content rule; one hit per rule with first location and match count. */
export function scanText(text: string, rules: ContentRule[] = CONTENT_RULES): ContentHit[] {
  const hits: ContentHit[] = [];
  for (const r of rules) {
    const re = new RegExp(r.re.source, r.re.flags.includes("g") ? r.re.flags : r.re.flags + "g");
    let first: RegExpExecArray | undefined;
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (r.accept && !r.accept(m)) continue;
      count++;
      if (!first) first = m;
      if (count >= 1000) break;
    }
    if (!first) continue;
    const secret = r.group ? (first[r.group] ?? first[0]) : first[0];
    const offset = r.group ? first.index + first[0].indexOf(secret) : first.index;
    const { line, column } = lineCol(text, offset);
    hits.push({
      rule: r.rule,
      severity: r.severity,
      message: r.message,
      line,
      column,
      redacted: redact(secret),
      matches: count,
    });
  }
  return hits;
}
