import { ApiError } from '../api/client';
import type { TFn } from '../i18n';

const VAULT_ERROR_CODES = ['empty', 'notAbsolute', 'otherDistro', 'notDirectory', 'network'] as const;

/** Server errors on a vault switch carry a `vaultPath.*` code; show the
 * translated sentence for known ones, the raw message otherwise. */
export function vaultErrorMessage(err: unknown, t: TFn): string {
  if (err instanceof ApiError && err.code?.startsWith('vaultPath.')) {
    const code = err.code.slice('vaultPath.'.length);
    if ((VAULT_ERROR_CODES as readonly string[]).includes(code)) {
      return t(`settings.vaultError.${code as (typeof VAULT_ERROR_CODES)[number]}`);
    }
  }
  return err instanceof Error ? err.message : String(err);
}
