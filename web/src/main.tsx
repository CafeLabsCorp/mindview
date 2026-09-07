import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ReindexProvider } from './context/ReindexContext';
import { SettingsProvider } from './context/SettingsContext';
import { AppStateEventsProvider } from './context/AppStateEvents';
import { hasToken } from './api/client';
import { detectLocale, makeT } from './i18n';
import './styles/global.css';

const root = createRoot(document.getElementById('root')!);

if (!hasToken()) {
  // Rendered before <SettingsProvider> exists, so there is no stored
  // language preference to read yet — the browser's own is all there is.
  const t = makeT(detectLocale());
  root.render(
    <div style={{ padding: 40, fontFamily: 'monospace', color: '#f0655c' }}>
      <h1>{t('app.tokenMissingTitle')}</h1>
      <p>
        {t('app.tokenMissingBefore')} <code>npm run dev -w server</code> {t('app.tokenMissingAfter')}
      </p>
      <button onClick={() => location.reload()}>{t('app.reload')}</button>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <SettingsProvider>
        <ReindexProvider>
          <AppStateEventsProvider>
            <App />
          </AppStateEventsProvider>
        </ReindexProvider>
      </SettingsProvider>
    </StrictMode>,
  );
}
