/** Developer inherits platform management, with its actual role retained for authorization and auditing. */
export const isPlatformAdmin = (role?: string | null) => role === 'SUPER_ADMIN' || role === 'DEVELOPER';
