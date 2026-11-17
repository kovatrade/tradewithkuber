/** System notifications are reserved for real staff accounts. Every account keeps its in-app inbox. */
export const externalPushAllowed = (account: { role: string; isDemo: boolean }) =>
  !account.isDemo && (account.role === 'SUPER_ADMIN' || account.role === 'BROKER');
