const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /@opentelemetry\/.*/,
  /.*\/node_modules\/@opentelemetry\/.*/,
];

module.exports = config;
