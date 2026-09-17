/* ============================================================
   Realtime Service — transport abstraction
   ------------------------------------------------------------
   UI components MUST NOT talk to WebSocket / Socket.IO directly.
   They subscribe to high-level events through this service and
   receive payloads via the `subscribe()` API.

   Transport backends:
     - "local" (default for the current frontend-only build):
       in-page CustomEvent bus + a localStorage cross-tab bridge
       so that a Staff session and an HOD monitor in another
       browser tab receive the same real events without refresh.
     - "websocket" / "socket.io": swap the internals of
       `connect()` / the inbound message handler later. Because
       UI code only uses `subscribe()`, no UI rewrite is needed.

   Event names used by the live monitoring module:
     session.started        payload: AttendanceSession
     session.completed      payload: AttendanceSession
     attendance.updated     payload: { sessionId, studentId, status, timestamp, method, session }
     camera.status          payload: { sessionId, status, previousStatus, session }
     session.notification   payload: { type, title, message, sessionId, ts }
   ============================================================ */

window.RealtimeService = (() => {
  const BUS_KEY = 'attendance_realtime_bus';
  const bus = new EventTarget();
  const wrapped = new WeakMap();

  let connected = false;
  let transportName = 'local'; // 'websocket' | 'socket.io' when backend arrives

  const dispatch = (name, payload) => {
    bus.dispatchEvent(new CustomEvent(name, { detail: payload == null ? {} : payload }));
  };

  /* ---------- Transport lifecycle ---------- */

  const connect = (opts = {}) => {
    // ----------------------------------------------------------------
    // REAL BACKEND INTEGRATION POINT
    // When the backend is ready, open the socket here, e.g.:
    //
    //   transportName = 'websocket';
    //   this._socket = new WebSocket((opts.wsUrl || '') + '/realtime');
    //   this._socket.onmessage = (msg) => {
    //     const evt = JSON.parse(msg.data);
    //     dispatch(evt.event, evt.payload);
    //   };
    //
    // Inbound server events are routed through dispatch() so all
    // existing UI subscriptions keep working unchanged.
    // ----------------------------------------------------------------
    connected = true;
    return Promise.resolve({ transport: transportName, connected: true });
  };

  const disconnect = () => {
    connected = false;
  };

  /* ---------- Subscribe / unsubscribe ---------- */

  const subscribe = (name, handler) => {
    const h = (e) => handler(e.detail);
    wrapped.set(handler, h);
    bus.addEventListener(name, h);
    return () => bus.removeEventListener(name, h);
  };

  const unsubscribe = (name, handler) => {
    const h = wrapped.get(handler);
    if (h) {
      bus.removeEventListener(name, h);
      wrapped.delete(handler);
    }
  };

  /* ---------- Emit (INTERNAL — used only by service modules) ---------- */

  const emit = (name, payload) => {
    dispatch(name, payload);
    if (!connected) return;
    // Cross-tab bridge so the demo works across browser tabs.
    // When a real socket transport is active this becomes a no-op
    // (the server broadcasts to other connected clients instead).
    try {
      localStorage.setItem(BUS_KEY, JSON.stringify({ name, payload: payload || {}, ts: Date.now() }));
    } catch (_e) { /* storage unavailable */ }
  };

  /* ---------- Inbound bridge (other tabs) ---------- */

  window.addEventListener('storage', (e) => {
    if (e.key !== BUS_KEY || !e.newValue) return;
    try {
      const m = JSON.parse(e.newValue);
      if (m && m.name) dispatch(m.name, m.payload);
    } catch (_e) { /* malformed message */ }
  });

  return {
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    emit, // internal — do not call from UI components
    getTransportName: () => transportName
  };
})();