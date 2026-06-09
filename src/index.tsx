import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import AppMain from './AppMain';
import { AuthScreen } from './components/AuthScreen';
import { SplashScreen } from './SplashScreen';
import reportWebVitals from './reportWebVitals';
import { registerServiceWorker } from './registerServiceWorker';
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';

if (Capacitor.isNativePlatform()) {
  void Keyboard.setResizeMode({ mode: KeyboardResize.Body });
}

function AppRoot() {
  const [splashDone, setSplashDone] = useState(false);
  const { user, loading } = useAuth();

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

  if (!user) {
    return <AuthScreen />;
  }

  return <AppMain />;
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <AppRoot />
    </AuthProvider>
  </React.StrictMode>
);

registerServiceWorker();

reportWebVitals();
