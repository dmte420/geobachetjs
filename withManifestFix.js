const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withManifestFix(config) {
  return withAndroidManifest(config, async config => {
    const manifest = config.modResults.manifest;
    const app = manifest.application[0];

    manifest.$ = {
  ...manifest.$,
      'xmlns:tools': 'http://schemas.android.com/tools'
    };

    if (app['meta-data']) {
      app['meta-data'] = app['meta-data'].filter(
        item => item.$['android:name']!== 'com.facebook.soloader.enabled'
      );
    }

    return config;
  });
};
