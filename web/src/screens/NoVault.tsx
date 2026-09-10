import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { navigate } from '../lib/hashRoute';
import { useT } from '../i18n/useT';

interface ConfigResponse {
  vaultPath: string;
}

// Shown in place of the routed screen when the tree loads empty — the
// common first-run case for someone who installed the app but has no Mind
// vault. Decided (2026-09-09, "opção C"): point them at cloning the
// template, then at the vault picker that already lives in Settings.
const CLONE_CMD = 'git clone https://github.com/CafeLabsCorp/mind-template.git mind';

export function NoVault() {
  const t = useT();
  const { data: config } = useApi<ConfigResponse>('/config');
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(CLONE_CMD).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  return (
    <div className="no-vault">
      <h2>{t('noVault.title')}</h2>
      <p>{t('noVault.body', { path: config?.vaultPath ?? '…' })}</p>

      <p className="no-vault-step">{t('noVault.cloneIntro')}</p>
      <div className="no-vault-cmd">
        <code>{CLONE_CMD}</code>
        <button className="btn btn-ghost btn-sm" onClick={copy}>
          {copied ? t('noVault.copied') : t('noVault.copy')}
        </button>
      </div>

      <p className="no-vault-step">{t('noVault.thenPick')}</p>
      <button className="btn btn-primary" onClick={() => navigate('ajustes')}>
        {t('noVault.openSettings')}
      </button>
    </div>
  );
}
