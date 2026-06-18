import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import AppMain from './AppMain';
import { AuthScreen } from './components/AuthScreen';
import { SplashScreen } from './SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import reportWebVitals from './reportWebVitals';
import { registerServiceWorker } from './registerServiceWorker';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { supabase } from './lib/supabase/client';
import { parseAuthTokensFromUrl } from './lib/supabase/passwordRecovery';

if (Capacitor.isNativePlatform()) {
  void Keyboard.setResizeMode({ mode: KeyboardResize.Body });
}

function AppRoot() {
  const [splashDone, setSplashDone] = useState(false);
  const { user, loading, passwordRecoveryPending } = useAuth();

  if (!splashDone) {
    return (
      <SplashScreen
        appReady={true}
        onDone={() => setSplashDone(true)}
      />
    );
  }

  if (loading) {
    return <div style={{ background: '#0b0b15', height: '100vh' }} />;
  }

  if (!user || passwordRecoveryPending) {
    return <AuthScreen />;
  }

  return <AppMain />;
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoot />
        </ErrorBoundary>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

if (Capacitor.isNativePlatform()) {
  void CapApp.addListener('appUrlOpen', async (event: { url: string }) => {
    if (!event.url.startsWith('myrace://auth/confirm')) return;
    const tokens = parseAuthTokensFromUrl(event.url);
    if (!tokens?.access_token || !tokens?.refresh_token) return;
    await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (event.url.includes('type=recovery')) {
      window.dispatchEvent(new CustomEvent('myrace:passwordRecovery'));
    }
  });
}

registerServiceWorker();

reportWebVitals();
