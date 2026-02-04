import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plantalk.app',
  appName: 'PlanTalk',
  webDir: 'dist',
  server: {
    allowNavigation: ['plantalk-app.vercel.app']
  }
};

export default config;
