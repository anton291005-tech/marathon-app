import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anton.myrace',
  appName: 'MyRace',
  webDir: 'dist',
  // Kein server.url — App lädt gebündelte Assets aus webDir (nicht localhost/Vercel remote).
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
