/* ============================================================
   WhatsApp Service — delivery through a real backend
   ------------------------------------------------------------
   IMPORTANT (no fake WhatsApp):

    - Frontend JavaScript can never send WhatsApp messages by
      itself. Real delivery goes:
        Frontend  ->  Backend API  ->  WhatsApp Business/Cloud API
        ->  Recipient WhatsApp Number
    - This build runs in DEV/MOCK mode: `configured = false`.
      No sent/delivered/read state is ever fabricated.
    - Sending attempts before integration return an honest error:
      "WhatsApp integration is not configured yet."

   Backend API contract (adapt to the real backend):
     POST /api/whatsapp/send/student-report
     POST /api/whatsapp/send/staff-report
     POST /api/whatsapp/send/hod-report
     GET  /api/whatsapp/delivery-status
     POST /api/whatsapp/retry

   All credentials (tokens, secrets) live on the server only.
   ============================================================ */

window.WhatsAppService = (() => {

  const CONFIG = { configured: false, provider: 'none' };

  const personFor = (report) => {
    if (!report) return null;
    if (report.role === 'student') {
      const person = DB.getStudents().find((s) => s.id === report.studentId);
      return { person, code: report.registerNumber, role: 'student' };
    }
    if (report.role === 'staff') {
      const person = DB.getStaff().find((s) => s.id === report.staffId);
      return { person, code: report.staffCode, role: 'staff' };
    }
    const person = DB.getHODs().find((s) => s.id === report.hodId);
    return { person, code: report.hodCode, role: 'hod' };
  };

  const DELIVERED = ['sent', 'delivered', 'read'];

  const alreadySent = (report) => {
    return DB.getDeliveries({ date: report.date })
      .some((d) => d.reportId === report.reportId && DELIVERED.includes(d.status));
  };

  const buildDeliveryRecord = (report, personInfo, status, error) => ({
    reportId: report.reportId,
    reportRole: report.role,
    recipientId: personInfo.person.id,
    recipientRole: personInfo.role,
    recipientName: report.role === 'student' ? report.name : report.role === 'staff' ? report.staffName : report.hodName,
    recipientCode: personInfo.code,
    phoneNumber: personInfo.person.whatsappNumber || '',
    date: report.date,
    status,
    error: error || ''
  });

  /* ------------------------------------------------------------
     Preflight checks (order matters — honest, staged errors)
     ------------------------------------------------------------ */
  const preflight = (report, opts = {}) => {
    const info = personFor(report);
    if (!info || !info.person) return { ok: false, code: 'no-recipient', message: 'Recipient not found.' };

    if (!info.person.whatsappConsent) {
      return { ok: false, code: 'no-consent', message: 'WhatsApp attendance reports are disabled.', info };
    }
    if (!info.person.whatsappNumber) {
      return { ok: false, code: 'no-phone', message: 'No WhatsApp number configured for this user.', info };
    }
    if (!CONFIG.configured) {
      return { ok: false, code: 'not-configured', message: 'WhatsApp integration is not configured yet.', info };
    }
    if (!opts.resend && alreadySent(report)) {
      return { ok: false, code: 'already-sent', message: "Today's report has already been sent.", info };
    }
    return { ok: true, info };
  };

  /* ------------------------------------------------------------
     Actual transport — backend adapter
     ------------------------------------------------------------ */
  const transportDispatch = (delivery, report) => {
    // REAL BACKEND INTEGRATION POINT
    // Wire this to your authenticated backend route:
    //   fetch('/api/whatsapp/send', { method:'POST', headers:{'Content-Type':'application/json'},
    //     body: JSON.stringify({ reportId: report.reportId, recipientPhone: delivery.phoneNumber }) })
    // The backend holds the WhatsApp Business/Cloud API credentials
    // and reports an authoritative status (queued/sent/delivered/read/failed).
    //
    // Until an adapter is registered this is never reached because
    // preflight() stops on "not-configured".
    return Promise.resolve({
      ok: false,
      code: 'not-configured',
      message: 'WhatsApp integration is not configured yet.',
      delivery: DB.updateDelivery(delivery.deliveryId, { status: 'failed', error: 'WhatsApp integration is not configured yet.' })
    });
  };

  const sendReport = (report, opts = {}) => {
    if (!report) return Promise.resolve({ ok: false, code: 'no-report', message: 'Report is missing.' });
    const pre = preflight(report, opts);
    if (!pre.ok) return Promise.resolve({ ok: false, code: pre.code, message: pre.message, delivery: null });

    const delivery = DB.createDelivery(buildDeliveryRecord(report, pre.info, 'queued', ''));
    DB.updateDelivery(delivery.deliveryId, { status: 'sending', sentAt: new Date().toISOString() });
    return transportDispatch(delivery, report);
  };

  const retryFailedReport = (deliveryId) => {
    const found = DB.getDeliveries().find((d) => d.deliveryId === deliveryId);
    if (!found) return Promise.resolve({ ok: false, code: 'no-delivery', message: 'Delivery record not found.' });
    if (found.status !== 'failed') {
      return Promise.resolve({ ok: false, code: 'no-failed', message: 'This delivery is not in a failed state.' });
    }

    const report = DB.getDailyReportById(found.reportId);
    if (!report) {
      return Promise.resolve({ ok: false, code: 'no-report', message: 'The report for this delivery no longer exists.' });
    }
    return sendReport(report, { resend: true });
  };

  /* ---------- Public API ---------- */

  const getConfig = () => ({ ...CONFIG });

  const sendStudentReport = (report, opts) => sendReport(report, opts);
  const sendStaffReport = (report, opts) => sendReport(report, opts);
  const sendHODReport = (report, opts) => sendReport(report, opts);

  const sendDailyReports = (date) => {
    // Bulk send prepared reports for a date. With no integration the
    // batch refuses honestly; nothing is faked.
    if (!CONFIG.configured) {
      return Promise.resolve({
        ok: false,
        code: 'not-configured',
        message: 'WhatsApp integration is not configured yet.',
        generated: 0,
        sent: 0,
        deliveries: []
      });
    }
    const generated = DB.generateAllDailyReports(date).reports;
    const results = [];
    generated.forEach((report) => {
      results.push(sendReport(report));
    });
    return Promise.all(results).then((rs) => ({
      ok: true,
      code: 'ok',
      generated: generated.length,
      sent: rs.filter((r) => r.ok).length,
      failed: rs.filter((r) => !r.ok).length,
      deliveries: rs
    }));
  };

  const getDeliveryStatus = (filters) => DB.getDeliveries(filters);
  const getDeliveryStats = (date) => DB.getDeliveryStats(date);

  return {
    getConfig,
    sendStudentReport,
    sendStaffReport,
    sendHODReport,
    sendDailyReports,
    getDeliveryStatus,
    getDeliveryStats,
    retryFailedReport
  };
})();