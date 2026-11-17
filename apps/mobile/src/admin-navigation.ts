import type { IconName } from './icons';
/** Every web administration destination has a native destination. */
export const ADMIN_NAV: { web: string; href: string; label: string; icon: IconName }[] = [
  { web: '/admin', href: '/(admin)', label: 'Overview', icon: 'grid' },
  { web: '/admin/market-data', href: '/(admin)/market-data', label: 'Market data', icon: 'activity' },
  { web: '/admin/commissions', href: '/(admin)/commissions', label: 'Commissions', icon: 'download' },
  { web: '/admin/users', href: '/(admin)/users', label: 'Accounts', icon: 'users' },
  { web: '/admin/payments', href: '/(admin)/payments', label: 'Transactions', icon: 'rupee' },
  { web: '/admin/config', href: '/admin-tools/config', label: 'Configuration', icon: 'settings' },
  { web: '/admin/lots', href: '/admin-tools/lots', label: 'Mini & mega lots', icon: 'briefcase' },
  { web: '/admin/activity', href: '/admin-tools/activity', label: 'Activity log', icon: 'activity' },
  { web: '/admin/logins', href: '/admin-tools/logins', label: 'Login & consent', icon: 'lock' },
  { web: '/admin/audit', href: '/admin-tools/audit', label: 'Audit trail', icon: 'file' },
  { web: '/admin/reconciliation', href: '/admin-tools/reconciliation', label: 'Reconciliation', icon: 'shield' },
  { web: '/admin/fees', href: '/admin-fees', label: 'Fees · bank & UPI', icon: 'wallet' },
  { web: '/admin/app-releases', href: '/admin-tools/releases', label: 'App downloads', icon: 'download' },
  { web: '/admin/enquiries', href: '/admin-tools/enquiries', label: 'Course enquiries', icon: 'users' },
  { web: '/admin/reset', href: '/admin-reset', label: 'Data reset', icon: 'alert' },
];
