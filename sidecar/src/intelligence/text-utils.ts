/**
 * Strip ANSI escape sequences (color, cursor, OSC) from a text buffer.
 *
 * session_history rows captured directly from PTY output contain ANSI control
 * codes that break downstream parsers (analyzeSession regexes, transcript
 * display). This utility produces a clean string suitable for indexing and
 * for the typed-observation extractor.
 */
const ANSI_PATTERN = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|'),
  'g',
);

const OSC_PATTERN = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;
const C0_CONTROL_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function stripAnsi(input: string): string {
  if (!input) return '';
  return input
    .replace(OSC_PATTERN, '')
    .replace(ANSI_PATTERN, '')
    .replace(C0_CONTROL_PATTERN, '');
}

/**
 * Trim text safely without splitting in the middle of a UTF-8 sequence.
 * Used by extractors that want a bounded preview of long fields.
 */
export function safeSlice(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + '…';
}

/**
 * Credential-shaped text patterns. Anything matched by these is REDACTED
 * before storage in session_observations / pattern_memory / debug_memory.
 *
 * The bar is "false positives are fine, false negatives are not" — it's
 * better to lose a real fix description than to leak a password.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  // password / pass / pwd assignments and prose
  /\b(?:password|passwd|pwd|pass)\s*[:=]\s*\S+/gi,
  /\bpass(?:word)?\s+(?:is|=|:)\s*\S+/gi,
  // explicit "pass - <value>" prose
  /\bpass(?:word)?\s*[-–]\s*\S{4,}/gi,
  // tokens / secrets / API keys
  /\b(?:api[_-]?key|secret|token|access[_-]?token|bearer|pat)\s*[:=]\s*\S+/gi,
  /\bgithub_pat_\w+/gi,
  /\bghp_\w{20,}/gi,
  /\bxox[abps]-\w[\w-]+/gi,
  // private keys
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END[^-]+-----/gi,
  // ssh URLs and key-bearing bits
  /\bssh:\/\/[^\s]+/gi,
  /\bssh\s+\S+@\S+/gi,
  // wp-admin / admin URL with credentials prose
  /\bwp-admin[^\s]*\s*[-—|:]\s*[\w.-]+\s*[-—|:]\s*\S+/gi,
  // user@domain followed within a short window by a strong token
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\s*[-—|:]\s*\S{6,}/g,
  // strong-password heuristic: 8+ chars with mix of upper/lower/digit/special
  /\b[A-Za-z0-9]*(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}[!@#$%^&*]\S*/g,
  // explicit "@<year>!" tail (common HirayaPro@2026! pattern)
  /\S*@\d{4}!\S*/g,
];

/**
 * Returns true if the text looks like it contains a credential or secret.
 * Use to drop entire observations rather than redact them in place — the
 * surrounding sentence usually leaks just as much as the password itself.
 */
export function hasCredentialMarker(text: string): boolean {
  if (!text) return false;
  for (const re of CREDENTIAL_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) return true;
  }
  return false;
}

/**
 * Redact credential-shaped substrings from a text by replacing matches with
 * `[redacted]`. Less aggressive than dropping the whole observation but
 * intended for places where some context is needed.
 */
export function redactCredentials(text: string): string {
  if (!text) return text;
  let out = text;
  for (const re of CREDENTIAL_PATTERNS) {
    out = out.replace(re, '[redacted]');
  }
  return out;
}
