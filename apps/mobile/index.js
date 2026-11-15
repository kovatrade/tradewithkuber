const { Platform } = require('react-native');
const Constants = require('expo-constants').default;
if (Platform.OS !== 'web' && Constants.expoConfig?.extra?.[Platform.OS === 'android' ? 'firebaseAndroidEnabled' : 'firebaseIosEnabled']) {
  const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
  // Notification payloads are displayed by Android/iOS. Do not create a duplicate local notification.
  setBackgroundMessageHandler(getMessaging(), async () => {});
}
require('expo-router/entry');
