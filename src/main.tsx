import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './styles/thermal-receipt.css';
import App from './App.tsx';

// A newly deployed Vite build uses new hashed chunk names. If an already-open
// PWA requests a chunk from the previous deployment, reload once so it receives
// the current index and asset manifest instead of remaining on a blank screen.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = 'vite-preload-recovery';
  const lastReload = Number(sessionStorage.getItem(reloadKey) ?? 0);
  if (Date.now() - lastReload < 60_000) return;
  sessionStorage.setItem(reloadKey, String(Date.now()));
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
