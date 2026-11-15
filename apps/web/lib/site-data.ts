// Server components only (uses the internal API address).

/** Server-side reads for the public course website (rendered on the server, cached for 5 minutes). */
export interface Course {
  slug: string;
  title: string;
  level: string;
  duration: string;
  fee: string;
  format: string;
  summary: string;
  outcomes: string[];
  modules: { title: string; topics: string[] }[];
}

const API = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

async function query<T>(q: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'apollo-require-preflight': 'true' },
      body: JSON.stringify({ query: q }),
      next: { revalidate: 300 },
    });
    const j = (await r.json()) as { data?: T };
    return j.data ?? null;
  } catch {
    return null;
  }
}

export async function getCourses(): Promise<Course[] | null> {
  const d = await query<{ siteCourses: Course[] }>(`{ siteCourses { slug title level duration fee format summary outcomes modules { title topics } } }`);
  return d?.siteCourses ?? null;
}

export async function getSiteName(): Promise<{ name: string; helplineUrl: string }> {
  const d = await query<{ appSettings: { appName: string; helplineUrl: string } }>(`{ appSettings { appName helplineUrl } }`);
  return { name: d?.appSettings.appName || 'The K', helplineUrl: d?.appSettings.helplineUrl || '' };
}

export const rupees = (fee: string) => (Number(fee) === 0 ? 'Free' : `₹${Number(fee).toLocaleString('en-IN')}`);

export interface Broker {
  mode: 'off' | 'preview' | 'live';
  legalName: string; sebiRegNo: string; dpRegNo: string; cin: string;
  exchanges: { name: string; memberId: string }[];
  address: string; complianceEmail: string; grievanceEmail: string;
  offerings: string[]; accountTypes: string[];
  brokerage: { delivery: string; intraday: string; fo: string; accountOpening: string };
}

export async function getBroker(): Promise<Broker | null> {
  const d = await query<{ siteBroker: Broker }>(`{ siteBroker { mode legalName sebiRegNo dpRegNo cin exchanges { name memberId } address complianceEmail grievanceEmail offerings accountTypes brokerage { delivery intraday fo accountOpening } } }`);
  return d?.siteBroker ?? null;
}

/** "0" → "₹0", "20" → "₹20", anything else as written (e.g. "0.03%"). */
export const fee = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? `₹${v.trim()}` : v.trim());
