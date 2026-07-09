import type { CapacitorConfig } from '@capacitor/cli';

// Symmetry Personal Training — native shell config.
// THIN REMOTE SHELL: the native app loads the live Vercel deployment, so every
// web deploy updates the app instantly. This file is never imported by the
// Next.js app; it is only read by the Capacitor CLI when building native shells.
const config: CapacitorConfig = {
  appId: 'com.symmetry.app',
  appName: 'Symmetry',
  // Fallback assets only (shown if the device is offline before first load).
  // Kept separate from Next's routing so it can never shadow an app route.
  webDir: 'capacitor-web',
  server: {
    // Live production web app — single source of truth.
    url: 'https://symmetry-app-omega.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
