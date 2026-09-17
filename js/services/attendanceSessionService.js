/* ============================================================
   Attendance Session Service — high-level session API
   ------------------------------------------------------------
   All session lifecycle actions go through this module so UI
   components stay transport-agnostic. Every action is persisted
   to the local store (DAL in mock-data.js) and published on the
   RealtimeService events:

     session.started        -> AttendanceSession
     session.completed      -> AttendanceSession
     attendance.updated     -> { sessionId, studentId, status, timestamp, method, session }
     camera.status          -> { sessionId, status, previousStatus, session }
     session.notification   -> { type, title, message, sessionId, ts }
   ============================================================ */

window.AttendanceSessionService = (() => {
  const Realtime = window.RealtimeService;

  /* ---------- Lifecycle ---------- */

  const startSession = (payload) => {
    const session = window.DB.createAttendanceSession(payload);
    if (!session) return null; // duplicate session rejected by store guard

    Realtime.emit('session.started', session);
    Realtime.emit('session.notification', {
      type: 'live',
      title: 'Live attendance started',
      message: `${session.subjectName} (${session.classLabel}) is now live on classroom camera ${session.cameraName}.`,
      sessionId: session.sessionId,
      ts: Date.now()
    });
    return session;
  };

  const endSession = (sessionId) => {
    const result = window.DB.completeAttendanceSession(sessionId);
    if (!result) return null;

    Realtime.emit('session.completed', result.session);
    Realtime.emit('session.notification', {
      type: 'completed',
      title: 'Session completed',
      message: `${result.session.subjectName} (${result.session.classLabel}) completed — ${result.presentCount} present, ${result.absentCount} absent.`,
      sessionId: result.session.sessionId,
      ts: Date.now()
    });
    return result.session;
  };

  /* ---------- Attendance events ---------- */

  const recordAttendanceEvent = (sessionId, studentId, status) => {
    const result = window.DB.applyAttendanceEvent(sessionId, studentId, status);
    if (!result) return null;
    const { session, event } = result;

    Realtime.emit('attendance.updated', {
      sessionId,
      studentId,
      status,
      timestamp: event.timestamp,
      method: event.method,
      session
    });
    return session;
  };

  /* ---------- Camera status ---------- */

  const setCameraStatus = (sessionId, status, message) => {
    const result = window.DB.setCameraStatus(sessionId, status, message);
    if (!result) return null;
    const { session, previousStatus } = result;

    Realtime.emit('camera.status', {
      sessionId,
      status,
      previousStatus,
      session
    });
    return session;
  };

  const setSessionStatus = (sessionId, status) => {
    const session = window.DB.setSessionStatus(sessionId, status);
    if (!session) return null;

    Realtime.emit('session.updated', {
      sessionId,
      status,
      session
    });
    return session;
  };

  /* ---------- Reads ---------- */

  const getSession = (sessionId) => window.DB.getSessionById(sessionId);
  const getActiveSessions = () => window.DB.getActiveSessions();
  const getRecentSessions = (limit) => window.DB.getRecentSessions(limit);

  /* ---------- Subscriptions ---------- */

  const subscribe = (name, handler) => Realtime.subscribe(name, handler);

  // Named subscriptions kept so a handler can target a single session.
  const subscribeToSession = (name, sessionId, handler) =>
    Realtime.subscribe(name, (payload) => {
      if (payload && payload.sessionId === sessionId) handler(payload);
    });

  const subscribeToAllActiveSessions = (name, handler) =>
    Realtime.subscribe(name, (payload) => {
      const active = window.DB.getActiveSessions();
      const hit = active.some((s) => s.sessionId === (payload && payload.sessionId));
      if (hit) handler(payload);
    });

  const unsubscribeFromSession = (name, handler) => Realtime.unsubscribe(name, handler);

  return {
    startSession,
    endSession,
    recordAttendanceEvent,
    setCameraStatus,
    setSessionStatus,
    getSession,
    getActiveSessions,
    getRecentSessions,
    subscribe,
    subscribeToSession,
    subscribeToAllActiveSessions,
    unsubscribeFromSession
  };
})();