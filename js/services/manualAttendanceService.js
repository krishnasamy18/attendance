/* ============================================================
   Manual Attendance Service — camera fallback / staff correction
   ------------------------------------------------------------
   Staff correct attendance when camera recognition misses or
   incorrectly identifies a student. Corrections ALWAYS target the
   EXISTING camera session for the selection (date + class + section
   + subject + hour) — the session is NEVER duplicated.

   REST mapping (swap internals for real fetch() later):
     GET    /api/attendance/session?date&classId&section&subjectCode&hour
     GET    /api/attendance/session/:sessionId
     PATCH  /api/attendance/session/:sessionId/student/:studentId
     POST   /api/attendance/session/:sessionId/corrections
     GET    /api/attendance/corrections?sessionId&date
     POST   /api/attendance/session/:sessionId/finalize
     GET    /api/attendance/settings
     PUT    /api/attendance/settings

   No fake data is produced: corrections only ever mutate real
   camera session results, and every correction writes an audit
   trail record (who / when / from / to / why).
   ============================================================ */

window.ManualAttendanceService = (() => {
  'use strict';

  const db = () => window.DB;
  const bus = () => window.RealtimeService;

  const currentRole = () => (window.Auth && Auth.getRole ? Auth.getRole() : null);
  const currentPerson = () => {
    const s = window.Auth && Auth.getSession ? Auth.getSession() : null;
    return s && s.person ? s.person : null;
  };
  const isStaff = () => currentRole() === 'Staff';
  const isHOD = () => currentRole() === 'HOD';

  const windowMinutes = () =>
    (db().getCorrectionSettings ? Number(db().getCorrectionSettings().correctionWindowMins) || 120 : 120);

  /* Correction window opens when the camera session completes and
     stays open for the configured duration (backend setting, not
     hard-coded). */
  const correctionWindowOpen = (session) => {
    if (!session || session.status !== 'COMPLETED' || !session.endedAt) return false;
    const deadline = new Date(new Date(session.endedAt).getTime() + windowMinutes() * 60000);
    return Date.now() <= deadline.getTime();
  };

  const normalizeStudent = (st) => {
    const wasCamera = st.method !== 'manual';
    const method = wasCamera ? 'camera' : 'manual';
    const corrected = st.method === 'camera_corrected' || !!st.reason || (st.correctionCount || 0) > 0;
    const notDetected = wasCamera && st.status === 'absent' && !corrected;
    return {
      studentId: st.studentId,
      registerNumber: st.registerNumber,
      name: st.name,
      section: st.section,
      status: st.status,
      method,
      wasCamera,
      detectedAt: st.timestamp || null,
      updatedAt: st.updatedAt || null,
      updatedBy: st.updatedBy || '',
      reason: st.reason || '',
      correctionCount: st.correctionCount || 0,
      notDetected,
      manuallyCorrected: corrected
    };
  };

  const enrichSession = (session) => {
    if (!session) return null;
    return {
      ...session,
      students: (session.students || []).map(normalizeStudent),
      correctionWindowMins: windowMinutes(),
      windowOpen: correctionWindowOpen(session),
      finalized: !!session.finalized,
      corrections: db().getAttendanceCorrections ? db().getAttendanceCorrections({ sessionId: session.sessionId }) : []
    };
  };

  const emit = (name, payload) => {
    if (bus() && typeof bus().emit === 'function') bus().emit(name, payload);
  };

  /* Guard checks shared by all correction operations. */
  const guardCorrection = (session) => {
    const state = { ok: true, code: '', message: '' };
    if (!session) { state.ok = false; state.code = 'no-session'; state.message = 'Attendance session not found.'; }
    else if (session.status !== 'COMPLETED') { state.ok = false; state.code = 'in-progress'; state.message = 'The camera session for this slot is still in progress. Manual correction is available after the session ends.'; }
    else if (!correctionWindowOpen(session)) { state.ok = false; state.code = 'closed'; state.message = 'Attendance correction window has closed.'; }
    else if (session.finalized) { state.ok = false; state.code = 'finalized'; state.message = 'Attendance is finalized and can no longer be corrected.'; }
    return state;
  };

  return {

    getCorrectionSettings: () => (db().getCorrectionSettings ? db().getCorrectionSettings() : { correctionWindowMins: 120 }),

    saveCorrectionSettings: (patch) =>
      db().saveCorrectionSettings ? db().saveCorrectionSettings(patch) : { ok: false, message: 'Settings store unavailable.' },

    canCorrect: () => isStaff(),
    canView: () => isStaff() || isHOD(),

    /* Load the existing camera session for a staff selection. */
    loadAttendanceSession: ({ date, classId, section, subjectCode, hour }) => {
      if (!canView()) return { ok: false, code: 'denied', message: 'You are not authorized to view manual attendance.' };
      const session = db().findAttendanceSession({ date, classId, section, subjectCode, hour });
      if (!session) return { ok: false, code: 'no-session', message: 'No attendance session available.' };
      if (isStaff()) {
        const me = currentPerson();
        if (session.staffId && me && session.staffId !== me.id) {
          return { ok: false, code: 'denied', message: 'You can only correct attendance for your own sessions.' };
        }
      }
      return { ok: true, session: enrichSession(session) };
    },

    /* Correct one student in an existing session. A reason is
       REQUIRED when the camera produced the original result. */
    updateAttendanceStatus: ({ sessionId, studentId, newStatus, reason }) => {
      if (!isStaff()) return { ok: false, code: 'denied', message: 'Only staff can correct attendance.' };
      const session = db().getSessionById(sessionId);
      const guard = guardCorrection(session);
      if (!guard.ok) return guard;

      const me = currentPerson();
      if (session.staffId && me && session.staffId !== me.id) {
        return { ok: false, code: 'denied', message: 'You can only correct attendance for your own sessions.' };
      }
      const student = ((session.students || [])).find((st) => st.studentId === studentId);
      if (!student) return { ok: false, code: 'student', message: 'Student not found in this session.' };
      if (!['present', 'absent', 'late'].includes(String(newStatus).toLowerCase())) {
        return { ok: false, code: 'invalid', message: 'Invalid status selected.' };
      }
      const wasCamera = student.method !== 'manual';
      if (wasCamera && !String(reason || '').trim()) {
        return { ok: false, code: 'reason', message: 'A reason is required when correcting a camera result.' };
      }

      const res = db().applyAttendanceCorrection({
        sessionId,
        studentId,
        newStatus: String(newStatus).toLowerCase(),
        reason: String(reason || '').trim(),
        correctedBy: me ? me.name : 'Staff',
        role: 'Staff'
      });
      if (!res.ok) return res;
      emit('attendance.updated', {
        source: 'manual-correction',
        sessionId,
        studentId,
        status: res.correction.newStatus,
        timestamp: res.correction.correctedAt,
        method: res.correction.method,
        session: res.session
      });
      emit('corrections.updated', { action: 'add', sessionId, correction: res.correction });
      return { ok: true, message: res.message, session: enrichSession(res.session), correction: res.correction };
    },

    /* Apply the same status to many students (bulk). */
    bulkUpdateAttendance: ({ sessionId, entries }) => {
      if (!isStaff()) return { ok: false, code: 'denied', message: 'Only staff can correct attendance.' };
      const session = db().getSessionById(sessionId);
      const guard = guardCorrection(session);
      if (!guard.ok) return guard;
      if (!Array.isArray(entries) || !entries.length) return { ok: false, code: 'invalid', message: 'Select at least one student.' };

      const me = currentPerson();
      if (session.staffId && me && session.staffId !== me.id) {
        return { ok: false, code: 'denied', message: 'You can only correct attendance for your own sessions.' };
      }
      const clean = [];
      (session.students || []).forEach((st) => {
        const e = entries.find((x) => x && x.studentId === st.studentId);
        if (!e || !['present', 'absent', 'late'].includes(String(e.newStatus).toLowerCase())) return;
        if (st.method !== 'manual' && !String(e.reason || '').trim()) return;
        clean.push({ studentId: st.studentId, newStatus: String(e.newStatus).toLowerCase(), reason: String(e.reason || '').trim() });
      });
      if (!clean.length) return { ok: false, code: 'invalid', message: 'No valid corrections to apply. A reason is required for camera results.' };

      const res = db().bulkApplyAttendanceCorrections({
        sessionId,
        entries: clean,
        correctedBy: me ? me.name : 'Staff',
        role: 'Staff'
      });
      if (!res.ok) return res;
      emit('attendance.updated', { source: 'manual-correction', sessionId, count: res.count, session: res.session });
      emit('corrections.updated', { action: 'bulk', sessionId, count: res.count, corrections: res.corrections });
      return { ok: true, message: res.message, session: enrichSession(res.session), corrections: res.corrections };
    },

    getCorrectionHistory: ({ sessionId, date }) => {
      if (!canView()) return { ok: false, code: 'denied', message: 'You are not authorized to view corrections.' };
      const filters = {};
      if (sessionId) filters.sessionId = sessionId;
      if (date) filters.date = date;
      let corrections = db().getAttendanceCorrections(filters);
      if (isStaff()) {
        const me = currentPerson();
        corrections = corrections.filter((c) => c.correctedBy === (me ? me.name : '') || c.staffId === '');
      }
      return { ok: true, corrections, count: corrections.length };
    },

    /* Lock the session after corrections are complete. */
    finalizeAttendance: ({ sessionId }) => {
      if (!isStaff()) return { ok: false, code: 'denied', message: 'Only staff can finalize attendance.' };
      const session = db().getSessionById(sessionId);
      if (!session) return { ok: false, code: 'no-session', message: 'Attendance session not found.' };
      if (session.status !== 'COMPLETED') return { ok: false, code: 'in-progress', message: 'Only completed sessions can be finalized.' };
      const me = currentPerson();
      if (session.staffId && me && session.staffId !== me.id) {
        return { ok: false, code: 'denied', message: 'You can only finalize attendance for your own sessions.' };
      }
      const res = db().finalizeAttendanceSession(sessionId);
      if (!res.ok) return res;
      emit('attendance.updated', { source: 'manual-finalize', sessionId, session: res.session });
      emit('corrections.updated', { action: 'finalized', sessionId, session: res.session });
      return { ok: true, message: 'Attendance finalized.', session: enrichSession(res.session) };
    }
  };
})();