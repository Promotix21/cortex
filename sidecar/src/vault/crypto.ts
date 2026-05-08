import { spawnSync } from 'child_process';
import crypto from 'crypto';

/**
 * Cortex credential vault crypto.
 *
 * - Master key lives in libsecret (Pop!_OS / GNOME Keyring) under
 *     service=cortex, account=vault-master.
 * - Auto-generated on first use; never written to disk.
 * - Each credential is encrypted with AES-256-GCM (96-bit IV, 128-bit tag).
 * - Plaintext fields NEVER touch SQLite — only ciphertext + iv + auth_tag.
 */

const SECRET_SERVICE = 'cortex';
const SECRET_ACCOUNT = 'vault-master';
const SECRET_LABEL = 'Cortex vault master key';

let cachedKey: Buffer | null = null;

function tryLookup(): Buffer | null {
  const result = spawnSync(
    'secret-tool',
    ['lookup', 'service', SECRET_SERVICE, 'account', SECRET_ACCOUNT],
    { encoding: 'utf8', timeout: 5000 },
  );
  if (result.status !== 0) return null;
  const out = result.stdout.trim();
  if (!out) return null;
  try {
    const buf = Buffer.from(out, 'base64');
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

function generateAndStore(): Buffer {
  const key = crypto.randomBytes(32);
  const b64 = key.toString('base64');
  const result = spawnSync(
    'secret-tool',
    ['store', '--label', SECRET_LABEL, 'service', SECRET_SERVICE, 'account', SECRET_ACCOUNT],
    { input: b64 + '\n', encoding: 'utf8', timeout: 8000 },
  );
  if (result.status !== 0) {
    throw new Error(
      `[vault] Failed to store master key in libsecret: ${result.stderr || 'no error message'}. ` +
        `Is gnome-keyring or a libsecret-compatible service running?`,
    );
  }
  return key;
}

export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  let key = tryLookup();
  if (!key) {
    console.log('[vault] No master key found in libsecret — generating a new one.');
    key = generateAndStore();
  }
  cachedKey = key;
  return key;
}

export function isVaultAvailable(): { available: boolean; reason?: string } {
  // Probe presence with a real, harmless secret-tool invocation. We can't rely on
  // exit code being 0 — `secret-tool --help` and `secret-tool` both exit 1, so the
  // only reliable signal is `error.code === 'ENOENT'` (binary missing) vs anything
  // else (binary present, may have spat usage to stderr).
  const probe = spawnSync('secret-tool', ['lookup', 'service', 'cortex-probe', 'account', 'noop'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return { available: false, reason: 'secret-tool not installed (apt install libsecret-tools)' };
  }
  // If we got here the binary ran. A non-zero exit just means the test key isn't
  // present (expected); a zero exit would also be fine.
  try {
    getMasterKey();
    return { available: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { available: false, reason: message };
  }
}

export interface SealedFields {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function seal(plaintext: Record<string, unknown>): SealedFields {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const json = JSON.stringify(plaintext);
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function unseal(sealed: SealedFields): Record<string, unknown> {
  const key = getMasterKey();
  const iv = Buffer.from(sealed.iv, 'base64');
  const authTag = Buffer.from(sealed.authTag, 'base64');
  const ciphertext = Buffer.from(sealed.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as Record<string, unknown>;
}
