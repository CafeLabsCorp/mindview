import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ReindexProvider } from './context/ReindexContext';
import { SettingsProvider } from './context/SettingsContext';
import { AppStateEventsProvider } from './context/AppStateEvents';
import { hasToken } from './api/client';
import './styles/global.css';

const root = createRoot(document.getElementById('root')!);

if (!hasToken()) {
  root.render(
    <div style={{ padding: 40, fontFamily: 'monospace', color: '#f0655c' }}>
      <h1>MindView — token ausente</h1>
      <p>
        Não recebi o token de sessão do servidor. Confirme que <code>npm run dev -w server</code> está rodando e recarregue
        esta página.
      </p>
      <button onClick={() => location.reload()}>Recarregar</button>
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
