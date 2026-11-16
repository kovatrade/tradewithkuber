/** Android emulator loopback is the emulator; 10.0.2.2 reaches the development host. */
export function resolveApiUrl(configured: string, development: boolean, platform: string, physicalDevice: boolean): string {
  if (!development || platform !== 'android' || physicalDevice) return configured;
  return configured.replace(/^(https?:\/\/)(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i,
    (_match, scheme: string) => `${scheme}10.0.2.2`);
}
