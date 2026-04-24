/**
 * PulseUp Research Tracker
 *
 * Activates when ?research_session=SESSION_ID is present in the URL.
 * Tracks behavioral zones, events, buy clicks, and favorites.
 * Forwards all events to the parent frame via postMessage.
 *
 * Zone map (matches research spec):
 *   event_feed   → .results-list (default)
 *   filters      → .v2-sidebar-filters (interaction)
 *   chat         → .v2-chat-section (interaction)
 *   map          → .map-column
 *   calendar     → .datebar-wrapper (interaction)
 *   event_page   → .event-detail-overlay (when open)
 */

export type ResearchZone =
  | "event_feed"
  | "filters"
  | "chat"
  | "map"
  | "calendar"
  | "event_page";

export type ResearchEventType =
  | "tracker_ready"
  | "zone_enter"
  | "zone_exit"
  | "event_opened"
  | "event_closed"
  | "scroll_depth"
  | "favorite_toggled"
  | "buy_clicked"
  | "filter_opened"
  | "filter_applied"
  | "calendar_selected"
  | "chat_message_sent";

export interface ResearchEvent {
  type: ResearchEventType;
  session_id: string;
  ts: number;           // ms since tracker init
  abs_ts: number;       // epoch ms
  zone?: ResearchZone;
  prev_zone?: ResearchZone;
  dwell_ms?: number;
  event_id?: string;
  scroll_depth?: number;
  favorite?: boolean;
  favorite_type?: "intentional" | "accidental";
}

// ─────────────────────────────────────────────────────────────────────────────

let _sessionId = "";
let _initTs    = 0;
let _active    = false;

// zone state
let _currentZone: ResearchZone = "event_feed";
let _zoneEnterTs = 0;

// current open event
let _openEventId: string | null = null;
let _eventOpenTs  = 0;
let _eventScrollPeak = 0;

// dwell tracking for favorite quality
const _eventDwellMap: Record<string, number> = {};   // event_id → total ms
const _eventScrollMap: Record<string, number> = {};  // event_id → max scroll %

function post(event: ResearchEvent) {
  if (typeof window === "undefined") return;
  try {
    window.parent.postMessage({ __research: true, ...event }, "*");
  } catch { /* cross-origin, shouldn't happen */ }
}

function now(): number {
  return Date.now() - _initTs;
}

// ── Zone helpers ──────────────────────────────────────────────────────────────

function enterZone(zone: ResearchZone) {
  if (zone === _currentZone) return;
  const dwell_ms = Date.now() - _zoneEnterTs;
  post({
    type: "zone_exit",
    session_id: _sessionId,
    ts: now(),
    abs_ts: Date.now(),
    zone: _currentZone,
    dwell_ms,
  });
  const prev = _currentZone;
  _currentZone = zone;
  _zoneEnterTs = Date.now();
  post({
    type: "zone_enter",
    session_id: _sessionId,
    ts: now(),
    abs_ts: Date.now(),
    zone,
    prev_zone: prev,
  });
}

// ── Event page tracking ───────────────────────────────────────────────────────

function onEventOpened(eventId: string) {
  _openEventId    = eventId;
  _eventOpenTs    = Date.now();
  _eventScrollPeak = 0;
  if (!_eventDwellMap[eventId]) _eventDwellMap[eventId] = 0;
  if (!_eventScrollMap[eventId]) _eventScrollMap[eventId] = 0;

  enterZone("event_page");
  post({
    type: "event_opened",
    session_id: _sessionId,
    ts: now(),
    abs_ts: Date.now(),
    event_id: eventId,
  });
}

function onEventClosed() {
  if (!_openEventId) return;
  const dwell_ms = Date.now() - _eventOpenTs;
  _eventDwellMap[_openEventId] = (_eventDwellMap[_openEventId] ?? 0) + dwell_ms;
  _eventScrollMap[_openEventId] = Math.max(
    _eventScrollMap[_openEventId] ?? 0,
    _eventScrollPeak,
  );

  post({
    type: "event_closed",
    session_id: _sessionId,
    ts: now(),
    abs_ts: Date.now(),
    event_id: _openEventId,
    dwell_ms,
    scroll_depth: _eventScrollPeak,
  });

  _openEventId = null;
  enterZone("event_feed");
}

// ── Scroll tracker on event detail ───────────────────────────────────────────

function attachScrollTracker(overlay: Element) {
  let lastReported = 0;
  const onScroll = () => {
    if (!_openEventId) return;
    const el        = overlay as HTMLElement;
    const scrolled  = el.scrollTop;
    const total     = el.scrollHeight - el.clientHeight;
    if (total <= 0) return;
    const pct = Math.round((scrolled / total) * 100);
    _eventScrollPeak = Math.max(_eventScrollPeak, pct);
    if (pct - lastReported >= 10) {
      lastReported = pct;
      post({
        type: "scroll_depth",
        session_id: _sessionId,
        ts: now(),
        abs_ts: Date.now(),
        event_id: _openEventId,
        scroll_depth: pct,
      });
    }
  };
  overlay.addEventListener("scroll", onScroll, { passive: true });
}

// ── Favorite quality classification ──────────────────────────────────────────

function classifyFavorite(eventId: string): "intentional" | "accidental" {
  const dwell_ms = _eventDwellMap[eventId] ?? 0;
  const scroll   = _eventScrollMap[eventId] ?? 0;
  // intentional = viewed >10s AND scrolled >40%
  if (dwell_ms >= 10_000 && scroll >= 40) return "intentional";
  // anything faster/shallower = accidental
  return "accidental";
}

// ── DOM observers ─────────────────────────────────────────────────────────────

function observeEventDetailModal() {
  // Watch for .event-detail-overlay getting/losing 'open' class
  // Also read event_id from the card that was clicked (data-event-id on backdrop)
  const observer = new MutationObserver(() => {
    const overlay = document.querySelector(".event-detail-overlay");
    if (!overlay) return;

    const isOpen = overlay.classList.contains("open") ||
      (overlay as HTMLElement).style.display !== "none";

    if (isOpen && !_openEventId) {
      // Try to get event_id from the overlay itself or from URL hash
      // EventDetail renders with data-event-id on inner element
      const inner = overlay.querySelector("[data-event-id]");
      const eventId = inner?.getAttribute("data-event-id") ??
        overlay.getAttribute("data-event-id") ??
        `unk_${Date.now()}`;
      onEventOpened(eventId);
      attachScrollTracker(overlay);
    } else if (!isOpen && _openEventId) {
      onEventClosed();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
}

function observeZones() {
  // Track map expand/collapse
  const mapObserver = new MutationObserver(() => {
    const mapCol = document.querySelector(".map-column");
    if (!mapCol) return;
    const isExpanded = mapCol.classList.contains("map-column--expanded");
    if (isExpanded && _currentZone !== "map" && _currentZone !== "event_page") {
      enterZone("map");
    } else if (!isExpanded && _currentZone === "map") {
      enterZone("event_feed");
    }
  });
  mapObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  // DateBar cell clicks → calendar zone
  document.addEventListener("click", (e) => {
    if (!_active) return;
    const target = e.target as HTMLElement;
    const dateCell = target.closest("[data-date]");
    if (dateCell) {
      enterZone("calendar");
      post({
        type: "calendar_selected",
        session_id: _sessionId,
        ts: now(),
        abs_ts: Date.now(),
      });
      // Return to feed after a beat
      setTimeout(() => { if (_currentZone === "calendar") enterZone("event_feed"); }, 800);
    }
  }, true);
}

function attachClickListeners() {
  document.addEventListener("click", (e) => {
    if (!_active) return;
    const target = e.target as HTMLElement;

    // ── Buy ticket ──
    const buyBtn = target.closest(".ed-cta");
    if (buyBtn) {
      const eventId = _openEventId ?? "unknown";
      post({
        type: "buy_clicked",
        session_id: _sessionId,
        ts: now(),
        abs_ts: Date.now(),
        event_id: eventId,
      });
      return;
    }

    // ── Favorite on card ──
    const favCard = target.closest(".event-card-v2-fav");
    if (favCard) {
      // The card's event_id is on the parent .event-card-v2
      const card    = favCard.closest("[data-event-id]");
      const eventId = card?.getAttribute("data-event-id") ?? "unknown";
      const isFaved = (favCard.querySelector("svg path") as SVGPathElement | null)
        ?.getAttribute("fill") !== "none";
      const faveType = classifyFavorite(eventId);
      post({
        type: "favorite_toggled",
        session_id: _sessionId,
        ts: now(),
        abs_ts: Date.now(),
        event_id: eventId,
        favorite: !isFaved,  // toggling — report new state
        favorite_type: faveType,
      });
      return;
    }

    // ── Favorite in event detail ──
    const favDetail = target.closest(".ed-topbar-btn");
    if (favDetail) {
      const eventId  = _openEventId ?? "unknown";
      const isLiked  = favDetail.classList.contains("ed-liked");
      const faveType = classifyFavorite(eventId);
      post({
        type: "favorite_toggled",
        session_id: _sessionId,
        ts: now(),
        abs_ts: Date.now(),
        event_id: eventId,
        favorite: !isLiked,
        favorite_type: faveType,
      });
      return;
    }

    // ── Filter open ──
    const filterItem = target.closest(".v2-filter-item");
    if (filterItem) {
      enterZone("filters");
      post({
        type: "filter_opened",
        session_id: _sessionId,
        ts: now(),
        abs_ts: Date.now(),
      });
      return;
    }

    // ── Chat ──
    const chatArea = target.closest(".v2-chat-section");
    if (chatArea) {
      enterZone("chat");
      return;
    }
  }, true);

  // Filter dialog close → back to feed
  document.addEventListener("click", (e) => {
    if (!_active) return;
    const target = e.target as HTMLElement;
    // Filter dialogs have "Apply" or close buttons
    const isApply = target.textContent?.trim().toLowerCase() === "apply" ||
      target.closest("[data-filter-apply]");
    if (isApply && _currentZone === "filters") {
      post({
        type: "filter_applied",
        session_id: _sessionId,
        ts: now(),
        abs_ts: Date.now(),
      });
      setTimeout(() => { if (_currentZone === "filters") enterZone("event_feed"); }, 300);
    }
  }, true);

  // Event card click → track event_id
  document.addEventListener("click", (e) => {
    if (!_active) return;
    const target  = e.target as HTMLElement;
    const card    = target.closest(".event-card-v2");
    if (card && !target.closest(".event-card-v2-fav")) {
      // Record dwell start for this event even before modal opens
      const eventId = card.getAttribute("data-event-id");
      if (eventId) {
        if (!_eventDwellMap[eventId]) _eventDwellMap[eventId] = 0;
        if (!_eventScrollMap[eventId]) _eventScrollMap[eventId] = 0;
      }
    }
  }, true);
}

// ── Public init ───────────────────────────────────────────────────────────────

export function initResearchTracker(): void {
  if (typeof window === "undefined") return;

  const params    = new URLSearchParams(window.location.search);
  const sessionId = params.get("research_session");
  if (!sessionId) return;

  _sessionId = sessionId;
  _initTs    = Date.now();
  _active    = true;
  _zoneEnterTs = Date.now();

  // Signal ready
  post({
    type: "tracker_ready",
    session_id: _sessionId,
    ts: 0,
    abs_ts: Date.now(),
    zone: "event_feed",
  });

  observeEventDetailModal();
  observeZones();
  attachClickListeners();

  // Flush on unload
  window.addEventListener("pagehide", () => {
    if (_openEventId) onEventClosed();
    post({
      type: "zone_exit",
      session_id: _sessionId,
      ts: now(),
      abs_ts: Date.now(),
      zone: _currentZone,
      dwell_ms: Date.now() - _zoneEnterTs,
    });
  });
}

// ── Expose event_behavior summary (call at session end) ──────────────────────

export interface EventBehaviorEntry {
  event_id: string;
  dwell_time_ms: number;
  scroll_depth: number;
  favorite: boolean;
  favorite_type: "intentional" | "accidental" | null;
}

export function getEventBehaviorSummary(): EventBehaviorEntry[] {
  return Object.keys(_eventDwellMap).map((id) => ({
    event_id:      id,
    dwell_time_ms: _eventDwellMap[id] ?? 0,
    scroll_depth:  _eventScrollMap[id] ?? 0,
    favorite:      false, // updated by favorite_toggled events
    favorite_type: null,
  }));
}
