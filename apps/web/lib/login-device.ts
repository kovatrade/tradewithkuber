let memory: string | undefined;
/** Browser-profile identifier, retained across account switches. */
export function loginDeviceId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const saved = localStorage.getItem('td.login.device');
    if (saved) return saved;
    memory ??= crypto.randomUUID();
    localStorage.setItem('td.login.device', memory);
    return memory;
  } catch { return memory; }
}
