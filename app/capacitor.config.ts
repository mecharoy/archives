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
    /* The status-bar icon: the app's book mark in white (res/drawable/ic_stat_khata.xml), tinted the app's
       green in the shade. Without one, many phones show a blank square. */
    LocalNotifications: {
      smallIcon: 'ic_stat_khata',
      iconColor: '#0E5E4E',
    },
  },
}

export default config
