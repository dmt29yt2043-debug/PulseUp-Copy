/**
 * PulseUp client analytics library.
 *
 * Public API:
 *   initAnalytics()                  — call once on app mount
 *   trackEvent(eventName, props?)    — log a custom event
 *   trackPageView(extraProps?)       — log a page_view (auto on init)
 *   track(eventName, props?)         — alias for trackEvent (legacy)
 *
 * Stores:
 *   localStorage   pu_anon_id        — persistent anonymous_id
 *   localStorage   pu_first_touch    — { utm_*, referrer, landing_page, ts }
 *   sessionStorage pu_session_id     — current session id
 *   sessionStorage pu_session_last   — last activity ts (30-min timeout)
 */

const ENDPOINT = '/api/analytics/event';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_BATCH_SIZE = 10;

type Props = Record<string, unknown>;

interface FirstTouch {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  referrer?: string | null;
  landing_page?: string | null;
  ts?: number;
}

interface QueuedEvent {
  event_name: string;
  event_version: number;
  anonymous_id: string;
  session_id: string;
  page_url: string;
  page_path: string;
  referrer: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  device_type: string;
  browser: string;
  os: string;
  screen_width: number;
  screen_height: number;
  event_props: Props;
  client_ts: number;
}

let initialized = false;
let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let cachedEnv: { device_type: string; browser: string; os: string } | null = null;

// ─── safe storage ───
function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string): void { try { localStorage.setItem(k, v); } catch {} }
function ssGet(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k: string, v: string): void { try { sessionStorage.setItem(k, v); } catch {} }

function uuid(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ─── env detection ───
function detectEnv() {
  if (cachedEnv) return cachedEnv;
  if (typeof navigator === 'undefined') {
    return (cachedEnv = { device_type: 'unknown', browser: 'unknown', os: 'unknown' });
  }
  const ua = navigator.userAgent || '';
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);
  const device_type = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let browser = 'other';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  let os = 'other';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac OS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return (cachedEnv = { device_type, browser, os });
}

// ─── UTM / first touch ───
function parseUtm() {
  if (typeof window === 'undefined') {
    return { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null };
  }
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get('utm_source'),
    utm_medium: p.get('utm_medium'),
    utm_campaign: p.get('utm_campaign'),
    utm_term: p.get('utm_term'),
    utm_content: p.get('utm_content'),
  };
}

function getFirstTouch(): FirstTouch {
  const raw = lsGet('pu_first_touch');
  if (raw) { try { return JSON.parse(raw) as FirstTouch; } catch {} }
  return {};
}

function ensureFirstTouch(): FirstTouch {
  const existing = getFirstTouch();
  if (existing && existing.ts) return existing;
  const utm = parseUtm();
  const ft: FirstTouch = {
    ...utm,
    referrer: (typeof document !== 'undefined' && document.referrer) || null,
    landing_page: typeof window !== 'undefined' ? window.location.href : null,
    ts: Date.now(),
  };
  lsSet('pu_first_touch', JSON.stringify(ft));
  return ft;
}

// ─── identity ───
function ensureIdentity(): { anonymous_id: string; session_id: string; is_new_session: boolean; is_returning: boolean } {
  let anon = lsGet('pu_anon_id');
  const had_anon_before = !!anon;
  if (!anon) { anon = uuid(); lsSet('pu_anon_id', anon); }

  let session = ssGet('pu_session_id');
  const lastRaw = ssGet('pu_session_last');
  const last = lastRaw ? parseInt(lastRaw, 10) : 0;
  const now = Date.now();
  let is_new_session = false;
  if (!session || !last || now - last > SESSION_TIMEOUT_MS) {
    session = uuid();
    is_new_session = true;
    ssSet('pu_session_id', session);
  }
  ssSet('pu_session_last', String(now));
  return { anonymous_id: anon, session_id: session, is_new_session, is_returning: had_anon_before };
}

// ─── build event ───
function buildEvent(event_name: string, props: Props = {}): QueuedEvent | null {
  if (typeof window === 'undefined') return null;
  const id = ensureIdentity();
  ssSet('pu_session_last', String(Date.now()));
  const env = detectEnv();
  const ft = getFirstTouch();
  return {
    event_name,
    event_version: 1,
    anonymous_id: id.anonymous_id,
    session_id: id.session_id,
    page_url: window.location.href,
    page_path: window.location.pathname,
    referrer: (typeof document !== 'undefined' && document.referrer) || null,
    landing_page: ft.landing_page ?? window.location.href,
    utm_source: ft.utm_source ?? null,
    utm_medium: ft.utm_medium ?? null,
    utm_campaign: ft.utm_campaign ?? null,
    utm_term: ft.utm_term ?? null,
    utm_content: ft.utm_content ?? null,
    device_type: env.device_type,
    browser: env.browser,
    os: env.os,
    screen_width: window.innerWidth || 0,
    screen_height: window.innerHeight || 0,
    event_props: props || {},
    client_ts: Date.now(),
  };
}

// ─── send ───
function flush(useBeacon = false): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  const body = JSON.stringify({ events: batch });
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(ENDPOINT, blob);
      if (ok) return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { queue = [...batch, ...queue]; });
  } catch {
    queue = [...batch, ...queue];
  }
}

function enqueue(ev: QueuedEvent | null): void {
  if (!ev) return;
  queue.push(ev);
  if (queue.length >= FLUSH_BATCH_SIZE) flush();
}

// ─── public API ───
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  ensureFirstTouch();
  const id = ensureIdentity();

  if (id.is_new_session) {
    enqueue(buildEvent('session_started', { is_returning: id.is_returning }));
    if (id.is_returning) enqueue(buildEvent('return_visit', {}));
  }

  trackPageView();

  if (!flushTimer) flushTimer = setInterval(() => flush(), FLUSH_INTERVAL_MS);

  window.addEventListener('pagehide', () => flush(true));
  window.addEventListener('beforeunload', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
}

export function trackEvent(event_name: string, props: Props = {}): void {
  enqueue(buildEvent(event_name, props));
}

export function trackPageView(extraProps: Props = {}): void {
  if (typeof window === 'undefined') return;
  enqueue(buildEvent('page_view', {
    title: typeof document !== 'undefined' ? document.title : undefined,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    ...extraProps,
  }));
}

// Legacy alias for older instrumentation calls.
export function track(event_name: string, props?: Props): void {
  trackEvent(event_name, props || {});
}
