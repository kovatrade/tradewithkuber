/** Keep notification text safe for lock screens and inbox previews. */
export function notificationText(text: string, demo = false): string {
  let result = text;
  if (!demo) result = result
    .replace(/\s*\((?:simulated|virtual)\b[^)]*\)/gi, '')
    .replace(/\b(?:simulated|virtual)\b\s*/gi, '')
    .replace(/\s+([.,;:])/g, '$1').trim();
  return result
    .replace(/((?:₹|\bINR\b|\bRs\.?)[ \t]*)[+-]?\d[\d,]*(?:\.\d+)?/gi, '$1••••')
    .replace(/(@\s*)[+-]?\d[\d,]*(?:\.\d+)?/g, '$1••••')
    .replace(/(\b(?:amount|balance|paid|credited|debited|loss|profit|price)\s*(?:(?:of|is)\s+|[:=]\s*)?)\d[\d,]*(?:\.\d+)?(?![\d,.%])/gi, '$1••••');
}

export function presentNotification<N extends { title: string; body: string }>(notification: N): N {
  const demo = /^Demo[: —]/i.test(notification.title);
  return { ...notification, title: notificationText(notification.title, demo), body: notificationText(notification.body, demo) };
}
