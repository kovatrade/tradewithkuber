import { CONFIG_REGISTRY, type ConfigKey, isConfigKey } from './registry';

/** Human wording is shared by web and mobile; internal keys and storage units never become labels. */
export const SETTING_TEXT: Record<ConfigKey, [string, string]> = {
  'demo.enabled': ['Demo accounts', 'Allow people to create a demo account.'],
  'demo.initialBalanceMinor': ['Demo opening balance', 'Starting credit for each new demo account.'],
  'trading.intradayMarginPerMiniLot': ['Intraday margin per Mini lot', 'Fixed rupee amount held for each Mini lot. Two lots require twice this amount.'],
  'trading.intradayMarginPerMegaLot': ['Intraday margin per Mega lot', 'Fixed rupee amount held for each Mega lot. Two lots require twice this amount.'],
  'trading.carryForwardMarginBps': ['Carry-forward margin', 'Percentage of the order value required to carry a position forward.'],
  'trading.carryForwardMarginPerMiniLot': ['Carry-forward margin per mini lot', 'Set a fixed amount for one mini lot, or use the percentage margin.'],
  'trading.carryForwardMarginPerMegaLot': ['Carry-forward margin per mega lot', 'Set a fixed amount for one mega lot, or use the percentage margin.'],
  'trading.maxQtyPerOrder': ['Maximum lots per order', 'Largest number of lots allowed in a single order.'],
  'trading.maxQtyPerInstrument': ['Maximum open lots per instrument', 'Largest open position allowed for one instrument.'],
  'trading.watchlistExchanges': ['Watchlist markets', 'Markets whose instruments traders can add to their watchlists.'],
  'trading.autoCutAtClose': ['Close intraday positions at market close', 'Automatically close positions that have not been carried forward.'],
  'trading.autoCutExchanges': ['Markets for automatic closing', 'Markets where intraday positions close automatically at the end of the session.'],
  'trading.autoCutWindowMinutes': ['Automatic closing retry period (minutes)', 'How long to retry a position closing that could not be completed.'],
  'trading.minQty': ['Minimum lots per order', 'Smallest number of lots allowed in an order.'],
  'trading.brokeragePerLot': ['Brokerage per mini lot', 'Amount charged for each mini lot on entry and again on exit.'],
  'trading.brokeragePerMegaLot': ['Brokerage per mega lot', 'Amount charged for each mega lot on entry and again on exit.'],
  'trading.brokerageBps': ['Additional brokerage', 'Extra percentage of order value charged on entry and exit. Set zero for per-lot charges only.'],
  'trading.enforceMarketHours': ['Enforce market timings', 'Allow orders only during configured sessions, excluding weekends and holidays.'],
  'trading.marketHolidays': ['Market holidays', 'Dates when trading is closed.'],
  'trading.marketHours': ['Market timings', 'Opening and closing times in Indian Standard Time. A closing time before the opening time means the session ends the following day.'],
  'payments.minDepositMinor': ['Minimum deposit', 'Smallest amount accepted in an add-funds request.'],
  'payments.maxDepositMinor': ['Maximum deposit', 'Largest amount accepted in a single add-funds request.'],
  'payments.maxWithdrawalMinor': ['Maximum withdrawal', 'Largest amount accepted in a single withdrawal request.'],
  'payments.brokerMaySubmit': ['Allow brokers to request fund transfers', 'Brokers can submit deposit and withdrawal requests for their traders.'],
  'broker.commissionShareBps': ['Broker commission share', 'Percentage used only when the broker has no fixed per-lot commission.'],
  'broker.commissionPerMiniLot': ['Broker commission per mini lot', 'Amount earned by the broker per mini lot on entry and exit.'],
  'broker.commissionPerMegaLot': ['Broker commission per mega lot', 'Amount earned by the broker per mega lot on entry and exit.'],
  'risk.warnLossPct': ['Loss warning threshold', 'Notify the trader inside the app when losses reach this percentage of their funds.'],
  'risk.autoCutLossPct': ['Automatic closing loss threshold', 'Close open trades and pause new trades when losses reach this percentage of the account funds.'],
  'security.adminMfaRequired': ['Require two-step verification for administrators', 'Administrators must verify sign-ins with their authenticator.'],
  'security.maxFailedLogins': ['Failed sign-in attempt limit', 'Number of incorrect attempts allowed before the account is temporarily locked.'],
  'security.sessionPolicy': ['Sign-in and device rules', 'Set device limits, inactivity periods and maximum sign-in duration for each account type.'],
  'security.lockoutMinutes': ['Sign-in lock duration (minutes)', 'How long an account stays locked after too many failed attempts.'],
  'logs.activityRetentionDays': ['Activity history retention (days)', 'How long activity records remain available before moving to the archive.'],
  'logs.requireArchiveBeforePurge': ['Archive activity before removing old records', 'Require a verified archive before removing older activity from the active history.'],
  'logs.quietOperations': ['Routine updates excluded from activity history', 'Read-only update names to exclude from activity history. Account changes are always recorded.'],
  'ui.tickerMessages': ['Scrolling announcements', 'Messages shown in the announcement bar.'],
  'ui.termsRules': ['Trading rules', 'Rules traders must accept after signing in.'],
  'site.courses': ['Course catalogue', 'Courses, fees and lesson details shown on the website.'],
  'site.broker': ['Broker website details', 'Public business information, registrations, account types and brokerage.'],
  'site.enquiriesOpen': ['Accept course enquiries', 'Allow visitors to send enrolment and callback requests.'],
  'ui.guidelinesHi': ['Hindi trading guidelines', 'Guidance shown from the rules button on the mobile Positions screen.'],
  'algo.enabled': ['Automated strategies', 'Allow traders to create, test and run automated strategies.'],
  'algo.maxRunningPerUser': ['Maximum running strategies per trader', 'Number of strategies a trader can run at the same time.'],
  'algo.maxStrategiesPerUser': ['Maximum saved strategies per trader', 'Number of strategies a trader can save.'],
  'signup.enabled': ['Trader account applications', 'Allow people to apply for a trader account. Administrator approval is required.'],
  'ui.helplineUrl': ['Support link', 'The support or WhatsApp link shown to users. Leave empty to hide it.'],
};

const words: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', DEVELOPER: 'Developer', BROKER: 'Broker', TRADER: 'Trader', US_INDEX: 'US indices',
  maxConcurrent: 'Maximum signed-in devices (zero means unlimited)', onLimit: 'When the device limit is reached',
  idleMinutes: 'Sign out after inactivity (minutes)', maxHours: 'Maximum sign-in duration (hours)',
  open: 'Opening time', close: 'Closing time', mode: 'Website visibility', legalName: 'Registered business name',
  sebiRegNo: 'SEBI registration number', dpRegNo: 'Depository participant registration number', cin: 'Company registration number',
  memberId: 'Exchange membership number', complianceEmail: 'Compliance email', grievanceEmail: 'Grievance email',
  fo: 'Futures and options brokerage', delivery: 'Delivery brokerage', intraday: 'Intraday brokerage',
  accountOpening: 'Account opening charges', slug: 'Course link name', fee: 'Course fee',
  maxRunningPerUser: 'Maximum running strategies per trader',
};
const choices: Record<string, [string, string][]> = {
  'logs.quietOperations': [['quotes', 'Price updates'], ['accountSummary', 'Account balance updates'], ['positions', 'Position updates'], ['orders', 'Order updates'], ['marketPulse', 'Market overview updates'], ['appSettings', 'Application settings updates'], ['tradingRules', 'Trading rules updates'], ['unreadNotificationCount', 'Unread notification counts']],
  onLimit: [['ask', 'Ask before signing out another device'], ['replace_oldest', 'Sign out the oldest device automatically'], ['block', 'Refuse the new sign-in']],
  mode: [['off', 'Education website only'], ['preview', 'Preview for administrators'], ['live', 'Public broker website']],
  offerings: [['STOCKS', 'Stocks'], ['FO', 'Futures and options'], ['COMMODITY', 'Commodities'], ['CURRENCY', 'Currencies'], ['IPO', 'Initial public offerings'], ['MUTUAL_FUNDS', 'Mutual funds']],
  accountTypes: [['INDIVIDUAL', 'Individual'], ['HUF', 'Hindu undivided family'], ['NRI', 'Non-resident Indian'], ['MINOR', 'Minor'], ['CORPORATE', 'Corporate']],
};
const title = (key: string) => words[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

export interface SettingField {
  label: string;
  type: 'boolean' | 'number' | 'text' | 'date' | 'time' | 'select' | 'object' | 'array';
  value?: string | boolean | null;
  unit?: string;
  scale?: number;
  stringNumber?: boolean;
  nullable?: boolean;
  nullLabel?: string;
  options?: { value: string; label: string }[];
  fields?: { key: string; field: SettingField }[];
  items?: SettingField[];
  template?: SettingField;
}

export function settingEditor(key: string, value: unknown): SettingField {
  const build = (v: any, sample: any, fieldKey: string, root = false): SettingField => {
    const label = isConfigKey(fieldKey) ? SETTING_TEXT[fieldKey][0] : title(fieldKey);
    if (Array.isArray(v)) {
      let exemplar = sample?.[0] ?? v[0] ?? '';
      if (fieldKey === 'exchanges' && !v.length) exemplar = { name: 'NSE', memberId: '' };
      const blank = (x: any): any => Array.isArray(x) ? [] : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, val]) => [k, blank(val)])) : typeof x === 'number' ? 0 : typeof x === 'boolean' ? false : '';
      return { label, type: 'array', items: v.map(item => build(item, exemplar, fieldKey)), template: build(blank(exemplar), exemplar, fieldKey) };
    }
    if (v && typeof v === 'object') return { label, type: 'object', fields: Object.entries(v).map(([k, val]) => ({ key: k, field: build(val, sample?.[k], k) })) };
    if (typeof v === 'boolean') return { label, type: 'boolean', value: v };
    if (choices[fieldKey]) return { label, type: 'select', value: String(v || choices[fieldKey][0][0]), options: [...choices[fieldKey], ...(v && !choices[fieldKey].some(o => o[0] === v) ? [[String(v), title(String(v))] as [string, string]] : [])].map(([value, label]) => ({ value, label })) };
    const minor = root && key.endsWith('Minor');
    const bps = root && key.endsWith('Bps');
    const fixedMargin = root && /(?:carryForward|intraday)MarginPer/.test(key);
    const nullableMargin = root && /carryForwardMarginPer/.test(key);
    const money = minor || fixedMargin || root && /brokeragePer|commissionPer/.test(key) || fieldKey === 'fee';
    if (typeof v === 'number' || minor || fixedMargin || fieldKey === 'fee') {
      const scale = minor || bps ? 100 : 1;
      const input = v == null ? null : scale === 100 ? (Number(v) / 100).toFixed(2) : String(v);
      return { label, type: 'number', value: input, scale, stringNumber: minor || fieldKey === 'fee', unit: money ? '₹' : bps || root && key.endsWith('Pct') ? '%' : undefined,
        nullable: nullableMargin || undefined, nullLabel: nullableMargin ? 'Use percentage margin' : undefined };
    }
    return { label, type: fieldKey.endsWith('marketHolidays') ? 'date' : ['open', 'close'].includes(fieldKey) ? 'time' : 'text', value: String(v ?? '') };
  };
  return build(value, isConfigKey(key) ? CONFIG_REGISTRY[key].default : value, key, true);
}

export function settingDisplay(key: string, value: unknown): string {
  const render = (f: SettingField): string => {
    if (f.type === 'object') return f.fields!.map(x => `${x.field.label}: ${render(x.field)}`).join('\n');
    if (f.type === 'array') return f.items!.length ? f.items!.map(render).join('\n') : 'None selected';
    if (f.value === null) return f.nullLabel ?? 'Not set';
    if (f.type === 'boolean') return f.value ? 'Enabled' : 'Disabled';
    if (f.type === 'select') return f.options?.find(o => o.value === f.value)?.label ?? String(f.value);
    if (f.unit === '₹') return `₹${Number(f.value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (f.unit === '%') return `${Number(f.value)}%`;
    return String(f.value || 'Not set');
  };
  return render(settingEditor(key, value));
}
