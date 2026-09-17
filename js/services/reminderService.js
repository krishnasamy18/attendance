/* ============================================================
   Low Attendance Reminder Service
   ------------------------------------------------------------
   Frontend wrapper around the reminder persistence layer
   (js/mock-data.js) plus honest WhatsApp transport.

   IMPORTANT (no fake WhatsApp):
     - Frontend JavaScript cannot send WhatsApp messages by
       itself. Real delivery goes:
         Frontend -> Backend API -> WhatsApp Business/Cloud API
         -> Recipient WhatsApp Number
     - This build runs in DEV/MOCK mode: CONFIG.configured=false.
       No sent/delivered/read state is ever fabricated. Send
       attempts before integration return an honest failure:
       "WhatsApp integration is not configured yet."
     - Duplicate prevention follows the business rule reminder IDs:
         LOWATT-HOD-[DATE]
         LOWATT-STAFF-[DATE]-[STAFF_ID]
         LOWATT-STUDENT-[DATE]-[STUDENT_ID]
         LOWATT-PARENT-[DATE]-[STUDENT_ID]
       "Today's reminder has already been sent." is returned unless
       an authorized user explicitly passes force:true (Resend).

   Backend API contract (adapt to the real backend):
     POST /api/reminders/low-attendance/hod
     POST /api/reminders/low-attendance/staff
     POST /api/reminders/low-attendance/student
     POST /api/reminders/low-attendance/parent
     GET  /api/reminders/status
     POST /api/reminders/retry
   ============================================================ */

window.ReminderService = (() => {
  'use strict';

  const CONFIG = { configured: false, provider: 'none' };
  const LAST_RUN_KEY = 'attendance_reminder_last_auto_run';

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const isWhatsAppConfigured = () =>
    (window.WhatsAppService && typeof WhatsAppService.getConfig === 'function')
      ? WhatsAppService.getConfig().configured
      : CONFIG.configured;

  const readLastRun = () => {
    try { return localStorage.getItem(LAST_RUN_KEY) || ''; } catch (_e) { return ''; }
  };
  const writeLastRun = (iso) => {
    try { localStorage.setItem(LAST_RUN_KEY, iso || new Date().toISOString()); } catch (_e) { /* no-op */ }
  };

  /* ------------------------------------------------------------
     Transport — the ONLY component allowed to move a reminder to
     queued/sent/delivered/read. Honest when not configured.
     ------------------------------------------------------------ */
  const dispatchTransport = (record) => {
    // REAL BACKEND INTEGRATION POINT
    // Wire this to your authenticated backend route, e.g.:
    //   fetch('/api/reminders/low-attendance/' + roleOf(record), {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ reminderId: record.reminderId,
    //                            recipientPhone: record.recipientPhone,
    //                            message: record.message })
    //   })
    // The backend holds the WhatsApp credentials and is the only
    // component that may report an authoritative status. Until an
    // adapter is registered this is never reached because preflight()
    // stops on "not-configured".
    return Promise.resolve({
      ok: false,
      code: 'not-configured',
      message: 'WhatsApp integration is not configured yet.',
      record: DB.updateReminderStatus(record.reminderId, {
        status: 'failed',
        error: 'WhatsApp integration is not configured yet.'
      })
    });
  };

  const preflight = (r) => {
    if (!r) return { ok: false, code: 'no-recipient', message: 'Recipient not found.' };
    if (!r.recipientPhone) {
      return { ok: false, code: 'no-phone', message: `No WhatsApp number configured for this ${r.recipientRole || 'recipient'}.` };
    }
    if (!isWhatsAppConfigured()) {
      return { ok: false, code: 'not-configured', message: 'WhatsApp integration is not configured yet.' };
    }
    return { ok: true };
  };

  const dispatch = async (record) => {
    const pre = preflight(record);
    if (!pre.ok) {
      DB.updateReminderStatus(record.reminderId, { status: 'failed', error: pre.message });
      return { ok: false, code: pre.code, message: pre.message, record: DB.getReminderById(record.reminderId) };
    }
    DB.updateReminderStatus(record.reminderId, { status: 'sending', sentAt: new Date().toISOString() });
    const res = await dispatchTransport(DB.getReminderById(record.reminderId) || record);
    return res;
  };

  /* Generate + queue + dispatch a single reminder. Duplicate checks
     happen inside DB.generateLowAttendanceReminder (unique reminder
     IDs). Pass force:true only for authorized Resend. */
  const buildAndSend = async (payload) => {
    const gen = DB.generateLowAttendanceReminder(payload);
    if (!gen.ok) return gen;

    DB.updateReminderStatus(gen.record.reminderId, { status: 'queued' });
    const live = DB.getReminderById(gen.record.reminderId) || gen.record;
    const res = await dispatch(live);

    if (window.RealtimeService && typeof RealtimeService.emit === 'function') {
      RealtimeService.emit('reminders.updated', {
        reminderId: live.reminderId,
        role: live.recipientRole,
        status: res.record ? res.record.status : live.status,
        ts: Date.now()
      });
    }
    return { ok: res.ok, code: res.code, message: res.message, record: res.record || live, duplicate: !!gen.duplicate };
  };

  /* ------------------------------------------------------------
     Public send API
     ------------------------------------------------------------ */

  const sendHODReminder = async (hodId, opts = {}) => {
    const hods = DB.getHODs();
    const hod = hods.find((h) => h.id === hodId) || hods[0];
    if (!hod) return { ok: false, code: 'no-recipient', message: 'No HOD account found.', record: null };
    return buildAndSend({
      role: 'hod',
      recipientId: hod.id,
      date: opts.date || todayISO(),
      force: !!opts.force,
      messageStyle: opts.messageStyle || 'whatsapp'
    });
  };

  const sendStaffReminder = async (staffId, opts = {}) =>
    buildAndSend({
      role: 'staff',
      recipientId: staffId,
      date: opts.date || todayISO(),
      force: !!opts.force,
      messageStyle: opts.messageStyle || 'whatsapp'
    });

  const sendStudentReminder = async (studentId, opts = {}) =>
    buildAndSend({
      role: 'student',
      recipientId: studentId,
      date: opts.date || todayISO(),
      force: !!opts.force,
      messageStyle: opts.messageStyle || 'whatsapp'
    });

  const sendParentReminder = async (studentId, opts = {}) =>
    buildAndSend({
      role: 'parent',
      recipientId: studentId,
      date: opts.date || todayISO(),
      force: !!opts.force,
      messageStyle: opts.messageStyle || 'whatsapp'
    });

  /* ------------------------------------------------------------
     Status / retry
     ------------------------------------------------------------ */

  const getReminderStatus = (filters) => DB.getReminders(filters || {});

  const getTodayStatus = (role) => {
    const date = todayISO();
    return DB.getReminders({ date }).filter((r) => !role || r.recipientRole === role);
  };

  const retryReminder = async (reminderId, opts = {}) => {
    const found = DB.getReminderById(reminderId);
    if (!found) return { ok: false, code: 'no-reminder', message: 'Reminder not found.', record: null };

    const roleMap = { hod: 'hod', staff: 'staff', student: 'student', parent: 'parent' };
    const role = roleMap[String(found.recipientRole || '').toLowerCase()];
    if (!role) return { ok: false, code: 'bad-role', message: 'Unknown reminder role.', record: null };

    const common = { date: found.date, force: true, messageStyle: found.messageType || 'whatsapp' };
    if (role === 'hod') return sendHODReminder(found.recipientId, common);
    if (role === 'staff') return sendStaffReminder(found.recipientId, common);
    if (role === 'student') return sendStudentReminder(found.recipientId, common);
    return sendParentReminder(found.recipientId, common);
  };

  /* ------------------------------------------------------------
     Daily / weekly scheduler (client-side approximation)
     ------------------------------------------------------------
     The real deployment runs the timed job on the backend scheduler
     (node-cron / deployed cron). This scheduler mirrors the same
     business rule so the prototype works standalone:
       - frequency 'daily'  -> run once per day at reminderTime
       - frequency 'weekly' -> run on Monday at reminderTime
       - frequency 'manual' -> never runs automatically
     "Today's reminder has already been sent." guard per reminder ID
     makes repeated runs safe (no duplicate reminders).
     ------------------------------------------------------------ */

  const settings = () => DB.getReminderSettings();

  const shouldRunToday = () => {
    const cfg = settings();
    if (!cfg.autoEnabled) return false;     // scheduled delivery disabled
    if (cfg.frequency === 'manual') return false;
    if (cfg.frequency === 'weekly' && new Date().getDay() !== 1) return false; // Monday only

    const now = new Date();
    const parts = String(cfg.reminderTime || '18:00').split(':').map(Number);
    const target = (parts[0] || 0) * 60 + (parts[1] || 0);
    const current = now.getHours() * 60 + now.getMinutes();
    return current >= target;
  };

  /* Generate + queue the HOD summary and a reminder for every staff
     member (each scoped to their assigned classes). Called by the
     scheduler and by the manual "Run now" control. */
  const runHODAndStaffDailyReminders = async (opts = {}) => {
    const date = todayISO();
    const results = [];

    const hodRes = await sendHODReminder('', { messageStyle: opts.messageStyle || 'daily' });
    results.push({ role: 'hod', result: hodRes });

    for (const f of DB.getStaff()) {
      const r = await sendStaffReminder(f.id, { messageStyle: opts.messageStyle || 'daily' });
      results.push({ role: 'staff', staffId: f.id, result: r });
    }

    if (results.length) writeLastRun(new Date().toISOString());
    return {
      ran: true,
      date,
      results,
      sent: results.filter((x) => x.result.ok).length,
      skipped: results.filter((x) => x.result.code === 'already-sent').length,
      failed: results.filter((x) => !x.result.ok && x.result.code !== 'already-sent').length
    };
  };

  const autoRun = async () => {
    if (!shouldRunToday()) return;
    await runHODAndStaffDailyReminders({ messageStyle: 'daily' });
  };

  let _timer = null;
  const startScheduler = (intervalSec = 60) => {
    if (_timer) return _timer;
    _timer = setInterval(() => { autoRun(); }, (intervalSec || 60) * 1000);
    setTimeout(() => autoRun(), 4000); // first check shortly after page load
    return _timer;
  };

  /* Auto-start once the DOM is ready (dashboard + low-attendance page). */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => startScheduler());
  } else {
    setTimeout(() => startScheduler(), 2500);
  }

  /* ---------- Helpers for the UI ---------- */

  const statusBadge = (status) => {
    const map = {
      prepared: ['badge-gray', 'Prepared'],
      queued: ['badge-gray', 'Queued'],
      sending: ['badge-info', 'Sending'],
      sent: ['badge-primary', 'Sent'],
      delivered: ['badge-success', 'Delivered'],
      read: ['badge-success', 'Read'],
      failed: ['badge-danger', 'Failed']
    };
    const p = map[status] || ['badge-gray', status || '—'];
    return `<span class="badge ${p[0]}">${p[1]}</span>`;
  };

  /* ---------- Public API ---------- */

  return {
    getConfig: () => ({ ...CONFIG, configured: isWhatsAppConfigured() }),
    sendHODReminder,
    sendStaffReminder,
    sendStudentReminder,
    sendParentReminder,
    getReminderStatus,
    getTodayStatus,
    retryReminder,
    runHODAndStaffDailyReminders,
    startScheduler,
    settings,
    statusBadge
  };
})();