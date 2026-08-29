import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.sitekhata.app',
  appName: 'Site Khata',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      backgroundColor: '#0D1316',
      showSpinner: false,
    },
  },
}

export default config
