import * as Sentry from "@sentry/react";
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
import { useNetworkStatus } from './hooks/useNetworkStatus';

Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN || "",
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV === "production" && Boolean(process.env.REACT_APP_SENTRY_DSN),
  tracesSampleRate: 0,
});

if (Capacitor.isNativePlatform()) {
  void Keyboard.setResizeMode({ mode: KeyboardResize.Body });
}

function AppRoot() {
  const [splashDone, setSplashDone] = useState(false);
  const { user, loading, passwordRecoveryPending } = useAuth();
  const isOnline = useNetworkStatus();

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

  return (
    <>
      {!isOnline ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "#1e293b",
            borderBottom: "1px solid #f59e0b",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
          }}
        >
          <span style={{ fontSize: 16 }}>📡</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24" }}>
            Keine Internetverbindung
          </span>
        </div>
      ) : null}
      <AppMain />
    </>
  );
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
