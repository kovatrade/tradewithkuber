const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Leave RAM for Gradle/R8 on release builders. Local development keeps Expo's default.
if (process.env.CI) config.maxWorkers = 2;
module.exports = config;
