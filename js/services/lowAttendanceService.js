/* ============================================================
   Low Attendance Service
   ------------------------------------------------------------
   Thin layer over the persistence API in js/mock-data.js plus the
   shared UI components (dashboard sections, student detail modal,
   reminder modal) used by the dashboards and the dedicated
   low-attendance page.

   Business rule (fixed, decided by the project):
     A student is a LOW-ATTENDANCE student when their CURRENT
     OVERALL attendance is STRICTLY below 80% (79.9% alerts,
     80% does not). All data is computed live from real
     attendance records - nothing is hard-coded.

   NOTE: role scoping implemented here AND in the data layer is
   frontend-only. The real backend must enforce the same rules.
   ============================================================ */

window.LowAttendanceService = (() => {

  /* ---------- Spec API ---------- */

  const getLowAttendanceStudents = () => DB.getLowAttendanceStudents();
  const getStudentLowAttendance = (studentId) => DB.getStudentLowAttendance(studentId);
  const getStaffLowAttendance = (staffId) => DB.getStaffLowAttendance(staffId);
  const getHODLowAttendance = (hodId) => DB.getHODLowAttendance(hodId);
  const checkAttendanceThreshold = (studentId) => DB.checkAttendanceThreshold(studentId);
  const createLowAttendanceAlert = (studentId) => DB.createLowAttendanceAlert(studentId);
  const removeLowAttendanceAlert = (studentId) => {
    const removed = DB.removeLowAttendanceAlert(studentId);
    RealtimeService.emit('lowattendance.updated', { action: 'remove', studentId, ts: Date.now() });
    return removed;
  };

  const recomputeAll = () => {
    const alerts = DB.recomputeLowAttendanceAlerts();
    RealtimeService.emit('lowattendance.updated', { action: 'recompute', alerts, ts: Date.now() });
    return alerts;
  };

  const pctStatus = (p) => {
    const n = Number(p);
    if (n >= 80) return 'Normal';
    if (n >= 70) return 'Warning';
    return 'Critical';
  };

  /* Number used by the notification badge for the current role. */
  const badgeCount = () => {
    const session = Auth.getSession();
    if (!session) return 0;
    if (session.role === 'HOD') return getHODLowAttendance(session.personId).length;
    if (session.role === 'Staff') return getStaffLowAttendance(session.personId).length;
    return 0;
  };

  /* ---------- Shared UI ---------- */

  const mounted = [];

  const register = (render) => { mounted.push(render); return () => { const i = mounted.indexOf(render); if (i > -1) mounted.splice(i, 1); }; };
  const refreshSections = () => { mounted.forEach((r) => { try { r(); } catch (_e) { /* ignore render errors */ } }); };

  const pctChip = (p) => {
    const status = pctStatus(p);
    const cls = status === 'Normal' ? 'badge-success' : (status === 'Warning' ? 'badge-warning' : 'badge-danger');
    return `<span class="badge ${cls}" title="${status}">${esc(p)}%</span>`;
  };

  const emptyBlock = (msg) => `
    <div class="lowatt-empty">
      <i class="fas fa-check-circle"></i>
      <p>${esc(msg || 'No students are currently below 80% attendance.')}</p>
    </div>`;

  const rowActions = (alert) => `
    <div class="lowatt-actions">
      <button class="btn btn-outline btn-sm" data-lowatt-view="${esc(alert.studentId)}" title="View details">
        <i class="fas fa-eye"></i> Details
      </button>
      <button class="btn btn-primary btn-sm" data-lowatt-remind="${esc(alert.studentId)}" title="Send a reminder">
        <i class="fas fa-paper-plane"></i> Reminder
      </button>
    </div>`;

  const tableRows = (alerts, includeStaff) => alerts.map((a) => `
    <tr>
      <td>${esc(a.registerNumber)}</td>
      <td>${esc(a.name)}</td>
      <td>${esc(a.classLabel)}</td>
      <td>${pctChip(a.attendancePercentage)}</td>
      <td>${esc(a.lastAttendanceDate || '—')}</td>
      ${includeStaff ? `<td>${esc(a.staffName || '—')}</td>` : ''}
      <td>${rowActions(a)}</td>
    </tr>`).join('');

  const renderTable = (alerts, includeStaff) => `
    <div class="lowatt-table-wrap">
      <table class="table lowatt-table">
        <thead>
          <tr>
            <th>Register No</th>
            <th>Name</th>
            <th>Class</th>
            <th>Attendance</th>
            <th>Last Attendance</th>
            ${includeStaff ? '<th>Assigned Staff</th>' : ''}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${alerts.length ? tableRows(alerts, includeStaff) : ''}</tbody>
      </table>
      ${alerts.length ? '' : `<div class="lowatt-none">No results for the current filters.</div>`}
    </div>`;

  const summaryChips = (alerts) => {
    const between = alerts.filter((a) => a.attendancePercentage >= 70 && a.attendancePercentage < 80).length;
    const critical = alerts.filter((a) => a.attendancePercentage < 70).length;
    return `
      <div class="lowatt-chips">
        <span class="lowatt-chip lowatt-chip-total">${alerts.length} below 80%</span>
        <span class="lowatt-chip lowatt-chip-warn">${between} between 70–79%</span>
        <span class="lowatt-chip lowatt-chip-crit">${critical} below 70%</span>
      </div>`;
  };

  /* Click delegation shared by dashboard sections + full page */
  const bindHostActions = (host) => {
    host.addEventListener('click', (e) => {
      const view = e.target.closest('[data-lowatt-view]');
      const remind = e.target.closest('[data-lowatt-remind]');
      if (!view && !remind) return;
      const studentId = (view ? view.getAttribute('data-lowatt-view') : remind.getAttribute('data-lowatt-remind'));
      const alert = getStudentLowAttendance(studentId);
      if (!alert) { Toast.info('This student is no longer below the 80% threshold.'); refreshSections(); return; }
      if (view) openStudentDetail(alert);
      else openReminderModal(alert);
    });
  };

  /* ---------- Dashboard: HOD section ---------- */

  const renderHodSection = (hostId, opts = {}) => {
    const host = document.getElementById(hostId);
    if (!host) return null;
    const session = Auth.getSession();
    const rowLimit = opts.limit || 8;
    bindHostActions(host);
    const render = () => {
      const current = session && session.role === 'HOD' ? getHODLowAttendance(session.personId) : getLowAttendanceStudents();
      const list = current.slice(0, rowLimit);
      host.innerHTML = `
        <div class="lowatt-section">
          <div class="lowatt-head">
            <div>
              <h3><i class="fas fa-triangle-exclamation"></i> Low Attendance Students</h3>
              <p>Students currently below the 80% attendance threshold.</p>
            </div>
            ${current.length ? summaryChips(current) : ''}
          </div>
          ${current.length
            ? `<div class="lowatt-table-wrap">${renderTable(list, true)}
                 ${current.length > rowLimit ? `<div class="lowatt-more"><a href="low-attendance.html">View all ${current.length} students <i class="fas fa-arrow-right"></i></a></div>` : ''}
               </div>`
            : emptyBlock()}
        </div>`;
    };
    render();
    return register(render);
  };

  /* ---------- Dashboard: Staff section ---------- */

  const renderStaffSection = (hostId, staffId, opts = {}) => {
    const host = document.getElementById(hostId);
    if (!host) return null;
    const rowLimit = opts.limit || 8;
    bindHostActions(host);
    const render = () => {
      const alerts = getStaffLowAttendance(staffId);
      const list = alerts.slice(0, rowLimit);
      host.innerHTML = `
        <div class="lowatt-section">
          <div class="lowatt-head">
            <div>
              <h3><i class="fas fa-triangle-exclamation"></i> Low Attendance in Your Classes</h3>
              <p>Students in your assigned classes currently below the 80% threshold.</p>
            </div>
            ${alerts.length ? summaryChips(alerts) : ''}
          </div>
          ${alerts.length
            ? `<div class="lowatt-table-wrap">${renderTable(list, false)}
                 ${alerts.length > rowLimit ? `<div class="lowatt-more"><a href="low-attendance.html">View all ${alerts.length} students <i class="fas fa-arrow-right"></i></a></div>` : ''}
               </div>`
            : emptyBlock()}
        </div>`;
    };
    render();
    return register(render);
  };

  /* Delegated actions for the full-page table (root is the app content) */
  const bindPageActions = (rootEl, onRefresh) => {
    bindHostActions(rootEl);
    if (onRefresh) register(onRefresh);
  };

  /* ---------- Student detail modal ---------- */

  /* Live subject-wise attendance for the detail modal. */
  const subjectRows = (studentId) => {
    const recs = DB.getStudentAttendance(studentId);
    const map = {};
    recs.forEach((r) => {
      const key = r.subjectCode || r.subjectName || 'Other';
      const e = map[key] = map[key] || { subjectCode: r.subjectCode || '', subjectName: r.subjectName || key, total: 0, present: 0 };
      e.total += 1;
      if (r.status !== 'Absent') e.present += 1;
    });
    return Object.values(map).sort((a, b) => (a.present / a.total) - (b.present / b.total));
  };

  const subjectTableHTML = (studentId) => {
    const rows = subjectRows(studentId);
    if (!rows.length) return `<div class="lowatt-subject-label">Subject-wise Attendance</div><div class="lowatt-none">No attendance records yet.</div>`;
    return `
      <div class="lowatt-subject-label"><i class="fas fa-book"></i> Subject-wise Attendance</div>
      <div class="lowatt-subject-table">
        <table class="table">
          <thead><tr><th>Subject</th><th>Present / Late</th><th>Total</th><th>Attendance</th></tr></thead>
          <tbody>${rows.map((s) => `
            <tr>
              <td><strong>${esc(s.subjectName)}</strong></td>
              <td>${s.present}</td>
              <td>${s.total}</td>
              <td>${pctChip(Math.round((s.present / s.total) * 100))}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
  };

  const openStudentDetail = (alert) => {
    Modal.open({
      title: `<i class="fas fa-user-graduate"></i> Student Details`,
      body: `
        <div class="lowatt-detail">
          <div class="lowatt-detail-head">
            <div>
              <h4>${esc(alert.name)}</h4>
              <p>${esc(alert.registerNumber)} · ${esc(alert.classLabel)}</p>
            </div>
            ${pctChip(alert.attendancePercentage)}
          </div>
          <div class="lowatt-detail-grid">
            <div><span>Overall Attendance</span><strong>${alert.attendancePercentage}%</strong></div>
            <div><span>Threshold</span><strong>${alert.threshold}%</strong></div>
            <div><span>Total Classes</span><strong>${alert.totalClasses}</strong></div>
            <div><span>Present / Late</span><strong>${alert.present}${alert.late ? ` (+${alert.late} late)` : ''}</strong></div>
            <div><span>Absent</span><strong>${alert.absent}</strong></div>
            <div><span>Last Attendance</span><strong>${esc(alert.lastAttendanceDate || '—')}</strong></div>
            <div><span>Assigned Staff</span><strong>${esc(alert.staffName || '—')}</strong></div>
            <div><span>Alert Status</span><strong>${esc(alert.status || 'Active')}</strong></div>
          </div>
          ${subjectTableHTML(alert.studentId)}
        </div>`,
      footer: `
        <button class="btn btn-outline" data-detail-close>Close</button>
        <button class="btn btn-primary" data-detail-remind><i class="fas fa-paper-plane"></i> Send Reminder</button>`
    });
    const ov = document.querySelector('.modal-overlay.active');
    ov.querySelector('[data-detail-close]').addEventListener('click', Modal.close);
    ov.querySelector('[data-detail-remind]').addEventListener('click', () => { Modal.close(); openReminderModal(alert); });
  };

  /* ---------- Reminder modal ---------- */

  const reminderPreviewFor = (role, studentId) => {
    const session = Auth.getSession();
    try {
      if (role === 'hod') return DB.getReminderMessagePreview('hod', session ? session.personId : '', new Date().toISOString().slice(0, 10));
      if (role === 'staff') return DB.getReminderMessagePreview('staff', session ? session.personId : '', new Date().toISOString().slice(0, 10));
      if (role === 'parent') return DB.getReminderMessagePreview('parent', studentId, '');
      return DB.getReminderMessagePreview('student', studentId, '');
    } catch (_e) { return ''; }
  };

  const alreadyToday = (role, registerNumber) => {
    const date = new Date().toISOString().slice(0, 10);
    const session = Auth.getSession();
    let rid = '';
    if (role === 'hod' && session) rid = `LOWATT-HOD-${date}`;
    else if (role === 'staff' && session) rid = `LOWATT-STAFF-${date}-${session.personId}`;
    else if (role === 'student') rid = `LOWATT-STUDENT-${date}-${registerNumber}`;
    else if (role === 'parent') rid = `LOWATT-PARENT-${date}-${registerNumber}`;
    if (!rid) return false;
    return DB.reminderFinished(rid);
  };

  const openReminderModal = (alert) => {
    const session = Auth.getSession();
    const isStudentAlert = !!alert && !!alert.studentId;
    const onlyMyBulk = window.location.pathname.endsWith('staff-dashboard.html');
    let recipients = [];
    if (onlyMyBulk) recipients = ['staff'];
    else recipients = isStudentAlert ? ['student', 'parent'] : ['hod', 'staff'];

    const hasParentContact = isStudentAlert && DB.getStudents().find((s) => s.id === alert.studentId).whatsappNumber && DB.getStudents().find((s) => s.id === alert.studentId).whatsappConsent;

    let body = `
      <div class="lowatt-reminder">
        ${isStudentAlert ? `<p class="lowatt-reminder-subject">Reminder for <strong>${esc(alert.name)}</strong> (${esc(alert.registerNumber)}) — <strong>${alert.attendancePercentage}%</strong> attendance.</p>` : `<p class="lowatt-reminder-subject">Reminder covering all students currently below 80%.</p>`}
        <label class="lowatt-field-label">Recipient</label>
        <select id="lowatt-recipient" class="form-select">
          ${recipients.includes('hod') ? `<option value="hod">HOD — full department list</option>` : ''}
          ${recipients.includes('staff') ? `<option value="staff">Staff — my assigned classes</option>` : ''}
          ${recipients.includes('student') ? `<option value="student">Student — ${esc(alert.name)}</option>` : ''}
          ${recipients.includes('parent') && hasParentContact ? `<option value="parent">Parent/Guardian — ${esc(alert.name)}</option>` : ''}
        </select>
        <div class="lowatt-recipient-note" id="lowatt-note"></div>
        <div class="lowatt-preview" id="lowatt-preview-wrap" style="display:none">
          <div class="lowatt-preview-head">
            <span>Message preview</span>
            <button type="button" class="btn btn-outline btn-sm" id="lowatt-toggle-preview"><i class="fas fa-eye-slash"></i> Hide</button>
          </div>
          <pre class="lowatt-preview-body" id="lowatt-preview">${esc(reminderPreviewFor(recipients[0], isStudentAlert ? alert.studentId : ''))}</pre>
        </div>
        <div class="lowatt-duplicate" id="lowatt-duplicate" style="display:none">
          <i class="fas fa-info-circle"></i> Today's reminder has already been sent. Use <strong>Resend</strong> to send again anyway.
        </div>
      </div>`;

    Modal.open({
      title: `<i class="fas fa-paper-plane"></i> Send Low Attendance Reminder`,
      body,
      footer: `
        <button class="btn btn-outline" data-remind-cancel>Cancel</button>
        <button class="btn btn-outline" data-remind-resend style="display:none"><i class="fas fa-rotate-right"></i> Resend</button>
        <button class="btn btn-primary" data-remind-preview><i class="fas fa-eye"></i> Preview</button>
        <button class="btn btn-primary" data-remind-send><i class="fas fa-paper-plane"></i> Send</button>`
    });

    const ov = document.querySelector('.modal-overlay.active');
    const recipientEl = ov.querySelector('#lowatt-recipient');
    const noteEl = ov.querySelector('#lowatt-note');
    const dupEl = ov.querySelector('#lowatt-duplicate');
    const resendBtn = ov.querySelector('[data-remind-resend]');
    const sendBtn = ov.querySelector('[data-remind-send]');
    const previewWrap = ov.querySelector('#lowatt-preview-wrap');
    const previewBody = ov.querySelector('#lowatt-preview');
    let force = false;

    const update = () => {
      const role = recipientEl.value;
      const studentId = isStudentAlert ? alert.studentId : '';
      noteEl.innerHTML = '';
      if (alreadyToday(role, isStudentAlert ? alert.registerNumber : '')) { dupEl.style.display = 'flex'; resendBtn.style.display = ''; }
      else { dupEl.style.display = 'none'; resendBtn.style.display = 'none'; }
      previewBody.textContent = reminderPreviewFor(role, studentId);
      sendBtn.style.display = force ? 'none' : '';
    };

    recipientEl.addEventListener('change', update);
    ov.querySelector('[data-remind-cancel]').addEventListener('click', Modal.close);
    ov.querySelector('[data-remind-resend]').addEventListener('click', () => { force = true; dupEl.style.display = 'none'; sendBtn.style.display = ''; resendBtn.style.display = 'none'; });
    ov.querySelector('[data-remind-preview]').addEventListener('click', () => {
      previewWrap.style.display = previewWrap.style.display === 'none' ? 'block' : 'none';
      previewBody.textContent = reminderPreviewFor(recipientEl.value, isStudentAlert ? alert.studentId : '');
    });
    ov.querySelector('[data-remind-toggle-preview]').addEventListener('click', () => { previewWrap.style.display = 'none'; });
    sendBtn.addEventListener('click', async () => {
      const role = recipientEl.value;
      const opts = { force };
      sendBtn.disabled = true;
      const result = await dispatchSend(role, session, alert, opts);
      sendBtn.disabled = false;
      if (result && !result.ok) { Toast.error(result.message || 'Could not send the reminder.'); return; }
      Toast.success(`Reminder ${force ? 'resent' : 'queued'} for delivery.`);
      Modal.close();
      refreshSections();
    });
    update();
  };

  const dispatchSend = async (role, session, alert, opts) => {
    const RS = window.ReminderService;
    if (!RS) return { ok: false, message: 'Reminder service is not loaded.' };
    if (role === 'hod') return RS.sendHODReminder(session ? session.personId : '', opts);
    if (role === 'staff') return RS.sendStaffReminder(session ? session.personId : '', opts);
    if (role === 'student') return RS.sendStudentReminder(alert.studentId, opts);
    if (role === 'parent') return RS.sendParentReminder(alert.studentId, opts);
    return { ok: false, message: 'Unknown reminder recipient.' };
  };

  /* ---------- Realtime refresh ---------- */

  RealtimeService.subscribe('session.completed', () => recomputeAll());
  RealtimeService.subscribe('attendance.updated', () => recomputeAll());
  RealtimeService.subscribe('lowattendance.updated', () => refreshSections());

  /* ---------- Public API ---------- */

  return {
    getLowAttendanceStudents,
    getStudentLowAttendance,
    getStaffLowAttendance,
    getHODLowAttendance,
    checkAttendanceThreshold,
    createLowAttendanceAlert,
    removeLowAttendanceAlert,
    recomputeAll,
    pctStatus,
    badgeCount,
    renderHodSection,
    renderStaffSection,
    renderTable,
    bindPageActions,
    openStudentDetail,
    openReminderModal,
    refreshSections
  };
})();