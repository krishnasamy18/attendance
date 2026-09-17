/* ============================================================
   Low Attendance & Reminders — page logic (low-attendance.html)
   ------------------------------------------------------------
   Role-routed page shared by HOD and Staff:
     - HOD:  sees all low-attendance students + full reminder
             management + reminder settings
     - Staff: sees only students in their assigned classes;
             Settings tab is hidden (HOD-configured)
   ============================================================ */

window.LowAttendanceApp = (() => {

  const $ = (sel) => document.querySelector(sel);

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const fmtDT = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const state = { classId: '', section: '', band: 'all', q: '' };

  const isHod = () => {
    const s = Auth.getSession();
    return !!s && s.role === 'HOD';
  };

  const alertsFor = () => {
    const s = Auth.getSession();
    if (!s) return [];
    return isHod()
      ? LowAttendanceService.getHODLowAttendance(s.personId)
      : LowAttendanceService.getStaffLowAttendance(s.personId);
  };

  const classOptions = () =>
    DB.getClasses().map((c) => `<option value="${esc(c.id)}" ${state.classId === c.id ? 'selected' : ''}>${esc(c.label)} (${esc(c.section)})</option>`).join('');

  /* ---------- Page shell ---------- */

  const renderPage = (mount) => {
    const hod = isHod();
    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Low Attendance &amp; Reminders</h1>
          <p>Monitor students below the attendance threshold and manage reminder delivery</p>
        </div>
        <div class="la-page-head-note">
          <i class="fas fa-circle-info"></i> Live data — updates automatically as attendance is recorded.
        </div>
      </div>
      <div class="la-rule-banner">
        <i class="fas fa-triangle-exclamation"></i>
        <div>
          <strong>Threshold: below 80% current overall attendance</strong>
          A student alerts when their current overall attendance is strictly below 80%&nbsp;(79.9% alerts, 80% does not). Present and Late count as attended.
        </div>
      </div>
      <div class="la-summary-grid" id="la-summary"></div>

      <div class="la-tabs" role="tablist">
        <button class="la-tab active" data-la-tab="students" role="tab">Students</button>
        ${hod ? '<button class="la-tab" data-la-tab="staff" role="tab">Staff Below 80%</button>' : ''}
        <button class="la-tab" data-la-tab="reminders" role="tab">Reminders</button>
        ${hod ? '<button class="la-tab" data-la-tab="settings" role="tab">Settings</button>' : ''}
      </div>

      <div class="la-tab-panel active" id="la-panel-students"></div>
      ${hod ? '<div class="la-tab-panel" id="la-panel-staff"></div>' : ''}
      <div class="la-tab-panel" id="la-panel-reminders"></div>
      ${hod ? '<div class="la-tab-panel" id="la-panel-settings"></div>' : ''}`;

    const tabs = mount.querySelectorAll('.la-tab');
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('active', x === t));
      ['students', 'staff', 'reminders', 'settings'].forEach((k) => {
        const p = document.getElementById('la-panel-' + k);
        if (p) p.classList.toggle('active', t.dataset.laTab === k);
      });
    }));

    renderSummary();
    renderStudentsTab(mount);
    if (hod) renderStaffTab(mount);
    renderRemindersTab(mount);
    if (hod) renderSettingsTab(mount);

    // Live refresh when staff attendance is marked anywhere
    if (window.RealtimeService && typeof RealtimeService.subscribe === 'function') {
      RealtimeService.subscribe('staffattendance.updated', () => {
        if (isHod()) refreshAll();
      });
    }

    // Register a refresh with the shared service so that realtime
    // events (lowattendance.updated / attendance.updated / reminders.updated)
    // re-render this page without a reload.
    LowAttendanceService.bindPageActions(mount, refreshAll);
  };

  /* ---------- Summary stat cards ---------- */

  const renderSummary = () => {
    const holder = $('#la-summary');
    if (!holder) return;
    const alerts = alertsFor();
    const warn = alerts.filter((a) => a.attendancePercentage >= 70 && a.attendancePercentage < 80).length;
    const crit = alerts.filter((a) => a.attendancePercentage < 70).length;

    let totalCnt = 0;
    let totalLabel = 'Total Students';
    if (isHod()) {
      totalCnt = (DB.getLowAttendanceStats && DB.getLowAttendanceStats().totalStudents) || DB.getStudents().length;
    } else {
      totalLabel = 'Assigned Students';
      const s = Auth.getSession();
      const sel = s && s.personId ? DB.getStaff().find((f) => f.id === s.personId) : null;
      const cls = (sel && sel.classes) || [];
      totalCnt = DB.getStudents().filter((st) => cls.includes(st.classId)).length;
    }

    holder.innerHTML = `
      <div class="la-stat la-stat--total"><div class="la-stat-icon"><i class="fas fa-users"></i></div><div><h3>${totalCnt}</h3><p>${totalLabel}</p></div></div>
      <div class="la-stat la-stat--warn"><div class="la-stat-icon"><i class="fas fa-triangle-exclamation"></i></div><div><h3>${alerts.length}</h3><p>Below 80%</p></div></div>
      <div class="la-stat la-stat--warn"><div class="la-stat-icon"><i class="fas fa-temperature-half"></i></div><div><h3>${warn}</h3><p>70–79.9%</p></div></div>
      <div class="la-stat la-stat--crit"><div class="la-stat-icon"><i class="fas fa-circle-xmark"></i></div><div><h3>${crit}</h3><p>Below 70%</p></div></div>`;
  };

  /* ---------- Students tab ---------- */

  const renderStudentsTab = (mount) => {
    const holder = $('#la-panel-students');
    if (!holder) return;

    holder.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-users"></i> Low Attendance Students</div></div>
        <div class="card-body">
          <div class="la-toolbar">
            <div class="form-group">
              <label>Class</label>
              <select class="form-control" id="la-filter-class"><option value="">All Classes</option>${classOptions()}</select>
            </div>
            <div class="form-group">
              <label>Section</label>
              <select class="form-control" id="la-filter-section">
                <option value="">All Sections</option><option>A</option><option>B</option><option>UV</option><option>—</option>
              </select>
            </div>
            <div class="form-group">
              <label>Attendance Band</label>
              <select class="form-control" id="la-filter-band">
                <option value="">All Bands</option><option value="warn">70–79.9% (Warning)</option><option value="crit">Below 70% (Critical)</option>
              </select>
            </div>
            <div class="form-group search">
              <label>Search</label>
              <input type="text" class="form-control" id="la-filter-q" placeholder="Name or register number...">
            </div>
            <button class="btn btn-primary" id="la-refresh"><i class="fas fa-rotate"></i> Refresh</button>
          </div>
          <div id="la-students-body"></div>
        </div>
      </div>`;

    $('#la-filter-class').addEventListener('change', () => { state.classId = $('#la-filter-class').value; renderStudentsBody(); });
    $('#la-filter-section').addEventListener('change', () => { state.section = $('#la-filter-section').value; renderStudentsBody(); });
    $('#la-filter-band').addEventListener('change', () => { state.band = $('#la-filter-band').value; renderStudentsBody(); });
    const q = $('#la-filter-q');
    q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(() => { state.q = q.value; renderStudentsBody(); }, 200); });
    $('#la-refresh').addEventListener('click', () => { state.q = q.value; LowAttendanceService.recomputeAll(); renderStudentsBody(); renderSummary(); });

    renderStudentsBody();
  };

  const renderStudentsBody = () => {
    const body = $('#la-students-body');
    if (!body) return;

    let list = alertsFor();
    const total = list.length;

    const q = String(state.q || '').trim().toLowerCase();
    list = list.filter((a) => {
      if (state.classId && a.classId !== state.classId) return false;
      if (state.section !== '' && a.section !== state.section) return false;
      if (state.band === 'warn' && !(a.attendancePercentage >= 70 && a.attendancePercentage < 80)) return false;
      if (state.band === 'crit' && !(a.attendancePercentage < 70)) return false;
      if (q && !(String(a.name || '').toLowerCase().includes(q) || String(a.registerNumber || '').toLowerCase().includes(q))) return false;
      return true;
    });

    if (total === 0) {
      body.innerHTML = `<div class="lowatt-empty"><i class="fas fa-check-circle"></i><p>No students are currently below the 80% attendance threshold.</p></div>`;
      return;
    }

    if (!list.length) {
      body.innerHTML = LowAttendanceService.renderTable([]);
      return;
    }

    body.innerHTML = LowAttendanceService.renderTable(list, isHod());
  };

  /* ---------- Staff tab (HOD: below 80%) ---------- */

  const renderStaffTab = (mount) => {
    const holder = $('#la-panel-staff');
    if (!holder) return;

    holder.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-user-tie"></i> Staff Below 80% Attendance</div></div>
        <div class="card-body">
          <div class="la-toolbar">
            <div class="form-group">
              <label>Attendance Band</label>
              <select class="form-control" id="la-sfilter-band">
                <option value="">All Bands</option><option value="warn">70–79.9% (Warning)</option><option value="crit">Below 70% (Critical)</option>
              </select>
            </div>
            <div class="form-group search">
              <label>Search</label>
              <input type="text" class="form-control" id="la-sfilter-q" placeholder="Name or staff ID...">
            </div>
            <button class="btn btn-primary" id="la-srefresh"><i class="fas fa-rotate"></i> Refresh</button>
          </div>
          <div id="la-staff-body"></div>
        </div>
      </div>`;

    $('#la-sfilter-band').addEventListener('change', renderStaffBody);
    const q = $('#la-sfilter-q');
    q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(renderStaffBody, 200); });
    $('#la-srefresh').addEventListener('click', () => { renderStaffBody(); renderSummary(); });

    renderStaffBody();
  };

  const renderStaffBody = () => {
    const body = $('#la-staff-body');
    if (!body) return;

    const qEl = $('#la-sfilter-q');
    const bandEl = $('#la-sfilter-band');
    const q = (qEl ? String(qEl.value || '') : '').trim().toLowerCase();
    const band = bandEl ? bandEl.value : '';

    const allLow = DB.getStaffLowAttendanceMembers();
    let list = allLow;
    if (band === 'warn') list = list.filter((x) => x.attendancePercentage >= 70 && x.attendancePercentage < 80);
    if (band === 'crit') list = list.filter((x) => x.attendancePercentage < 70);
    if (q) {
      list = list.filter((x) =>
        String(x.name || '').toLowerCase().includes(q) || String(x.staffCode || '').toLowerCase().includes(q));
    }

    if (DB.getStaff().length === 0) {
      body.innerHTML = `<div class="lowatt-empty"><i class="fas fa-user-slash"></i><p>No staff members added yet — add staff from the <strong>Staff</strong> page first.</p></div>`;
      return;
    }
    if (allLow.length === 0) {
      body.innerHTML = `<div class="lowatt-empty"><i class="fas fa-circle-check"></i><p>No staff members are currently below the 80% attendance threshold.</p></div>`;
      return;
    }
    if (!list.length) {
      body.innerHTML = `<div class="lowatt-empty"><i class="fas fa-filter-circle-xmark"></i><p>No staff match your filters.</p></div>`;
      return;
    }

    body.innerHTML = `
      <div class="table-responsive">
        <table class="table table-cards">
          <thead>
            <tr><th>Staff ID</th><th>Staff Name</th><th>Department</th><th>Designation</th><th>Working Days</th><th>Present</th><th>Absent</th><th>Attendance %</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${list.map((x) => {
              const pct = x.attendancePercentage;
              const crit = pct < 70;
              return `
                <tr>
                  <td><strong>${esc(x.staffCode)}</strong></td>
                  <td><strong>${esc(x.name)}</strong></td>
                  <td>${esc(x.department)}</td>
                  <td>${esc(x.designation || '—')}</td>
                  <td>${x.workingDays}</td>
                  <td>${x.present}</td>
                  <td>${x.absent}</td>
                  <td>
                    <span class="attendance-pct" style="color:${Utils.pctColor(pct)}">${pct}%</span>
                    <div class="progress mt-10" style="height:5px"><div class="progress-bar" style="width:${Math.max(2, pct)}%;background:${Utils.pctColor(pct)}"></div></div>
                  </td>
                  <td><span class="badge ${crit ? 'badge-danger' : 'badge-warning'}">${crit ? 'Critical' : 'Warning'}</span></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  };

  /* ---------- Reminders tab ---------- */

  const renderRemindersTab = (mount) => {
    const holder = $('#la-panel-reminders');
    if (!holder) return;
    const hod = isHod();

    holder.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-paper-plane"></i> Reminder Delivery</div></div>
        <div class="card-body">
          <div class="lowatt-reminders-toolbar">
            <div class="la-toolbar" style="margin-bottom:0">
              <div class="form-group">
                <label>Date</label>
                <input type="date" class="form-control" id="la-rem-date" value="${esc(todayISO())}">
              </div>
              <div class="form-group search">
                <label>Search</label>
                <input type="text" class="form-control" id="la-rem-q" placeholder="Recipient, role or message...">
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-outline" id="la-rem-refresh"><i class="fas fa-rotate"></i> Refresh</button>
              ${hod ? '<button class="btn btn-primary" id="la-rem-run"><i class="fas fa-play"></i> Run Daily Reminders</button>' : ''}
            </div>
          </div>
          <div id="la-reminders-body"></div>
        </div>
      </div>`;

    if (hod) $('#la-rem-run').addEventListener('click', async () => {
      const btn = $('#la-rem-run');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
      const res = await ReminderService.runHODAndStaffDailyReminders();
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> Run Daily Reminders';
      Toast.success(`Daily reminders queued — ${res.sent} new, ${res.skipped} already sent, ${res.failed} failed.`);
      renderRemindersBody();
    });

    $('#la-rem-refresh').addEventListener('click', renderRemindersBody);
    const rq = $('#la-rem-q');
    rq.addEventListener('input', () => { clearTimeout(rq._t); rq._t = setTimeout(renderRemindersBody, 200); });
    $('#la-rem-date').addEventListener('change', renderRemindersBody);

    renderRemindersBody();
  };

  const renderRemindersBody = () => {
    const body = $('#la-reminders-body');
    if (!body) return;

    const dateEl = $('#la-rem-date');
    const qEl = $('#la-rem-q');
    const date = dateEl ? dateEl.value || todayISO() : todayISO();
    const q = (qEl ? String(qEl.value || '') : '').trim().toLowerCase();

    let list = ReminderService.getReminderStatus({ date });
    if (q) {
      list = list.filter((r) =>
        String(r.recipientName || '').toLowerCase().includes(q) ||
        String(r.recipientCode || '').toLowerCase().includes(q) ||
        String(r.recipientRole || '').toLowerCase().includes(q) ||
        String(r.message || '').toLowerCase().includes(q));
    }

    if (!list.length) {
      body.innerHTML = `<div class="lowatt-empty"><i class="fas fa-inbox"></i><p>No reminders for ${esc(date)}. Use the Students tab or "Run Daily Reminders" (HOD) to send one.</p></div>`;
      return;
    }

    body.innerHTML = list.map((r) => `
      <div class="lowatt-reminder-row" style="border:1px solid var(--gray-100);border-radius:var(--radius-sm);padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="reminder-recipient"><i class="fas fa-user"></i> ${esc(r.recipientName)}</span>
          <span class="badge badge-gray">${esc(r.recipientRole)}</span>
          <span class="badge badge-info">${r.messageType === 'daily' ? 'Daily digest' : 'WhatsApp'}</span>
          ${ReminderService.statusBadge(r.status)}
          <span class="text-muted" style="font-size:11px;margin-left:auto">${esc(r.recipientCode || '')} · ${fmtDT(r.sentAt || r.createdAt)}</span>
        </div>
        <div class="reminder-risks" style="margin-top:6px">
          ${r.studentIds && r.studentIds.length ? `<i class="fas fa-users"></i> ${r.studentIds.length} student(s) covered · ${esc(r.reminderId)}` : `<span class="text-muted">${esc(r.reminderId)}</span>`}
        </div>
        <div class="reminder-message">${esc((r.message || '').split('\n')[0])}</div>
        ${r.error ? `<div style="margin-top:6px;font-size:12px;color:#b91c1c"><i class="fas fa-circle-exclamation"></i> ${esc(r.error)}</div>` : ''}
        ${r.status === 'failed' ? `<div style="margin-top:8px"><button class="btn btn-xs btn-outline" data-la-retry="${esc(r.reminderId)}"><i class="fas fa-rotate"></i> Retry</button></div>` : ''}
      </div>`).join('');

    body.querySelectorAll('[data-la-retry]').forEach((b) => b.addEventListener('click', async () => {
      const res = await ReminderService.retryReminder(b.dataset.laRetry);
      if (!res.ok) { Toast.error(res.message); return; }
      Toast.success('Reminder retried for delivery.');
      renderRemindersBody();
    }));
  };

  /* ---------- Settings tab (HOD only) ---------- */

  const renderSettingsTab = (mount) => {
    const holder = $('#la-panel-settings');
    if (!holder) return;
    const cfg = DB.getReminderSettings();

    holder.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-gear"></i> Reminder Settings</div></div>
        <div class="card-body la-settings">
          <div class="form-group">
            <label class="la-field-label">Reminder Frequency</label>
            <select class="form-control" id="la-cfg-frequency">
              <option value="daily" ${cfg.frequency === 'daily' ? 'selected' : ''}>Daily — HOD summary + every staff member</option>
              <option value="weekly" ${cfg.frequency === 'weekly' ? 'selected' : ''}>Weekly — every Monday</option>
              <option value="manual" ${cfg.frequency === 'manual' ? 'selected' : ''}>Manual — only when I click "Run Daily Reminders"</option>
            </select>
          </div>
          <div class="form-group">
            <label class="la-field-label">Reminder Time</label>
            <input type="time" class="form-control" id="la-cfg-time" value="${esc(cfg.reminderTime || '18:00')}">
            <span class="pf-field-hint">Used by the scheduler to decide when a daily/weekly run is due.</span>
          </div>
          <div class="la-toggle-row">
            <div class="la-toggle-label">
              <strong>Automatic reminders</strong>
              <span>Generate + queue HOD/Staff reminders at the scheduled time.</span>
            </div>
            <button type="button" class="la-switch ${cfg.autoEnabled ? 'on' : ''}" id="la-cfg-auto" aria-label="Toggle automatic reminders"></button>
          </div>
          <div class="la-toggle-row">
            <div class="la-toggle-label">
              <strong>Parent messaging</strong>
              <span>Allow reminders to parents/guardians (requires their WhatsApp number &amp; consent).</span>
            </div>
            <button type="button" class="la-switch ${cfg.parentEnabled ? 'on' : ''}" id="la-cfg-parent" aria-label="Toggle parent messaging"></button>
          </div>
          <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="la-cfg-save"><i class="fas fa-save"></i> Save Settings</button>
          </div>
          <div class="la-backend-note">
            <i class="fa-solid fa-circle-info"></i>
            <div>
              The timed daily/weekly run is executed by the <strong>backend scheduler</strong> (node-cron on the deployed server). This page stores the configuration and also provides the manual "Run Daily Reminders" control so the prototype works standalone. Duplicate-safe reminder IDs prevent double-sends.
            </div>
          </div>
        </div>
      </div>`;

    document.querySelectorAll('#la-cfg-auto, #la-cfg-parent').forEach((sw) => sw.addEventListener('click', () => sw.classList.toggle('on')));

    $('#la-cfg-save').addEventListener('click', () => {
      const res = DB.saveReminderSettings({
        frequency: $('#la-cfg-frequency').value,
        reminderTime: $('#la-cfg-time').value,
        autoEnabled: $('#la-cfg-auto').classList.contains('on'),
        parentEnabled: $('#la-cfg-parent').classList.contains('on')
      });
      if (!res.ok) Toast.error(res.message);
      else Toast.success(res.message);
    });
  };

  /* ---------- Refresh on realtime events ---------- */

  const refreshAll = () => {
    renderSummary();
    renderStudentsBody();
    renderStaffBody();
    renderRemindersBody();
  };

  /* ---------- init ---------- */

  const init = () => {
    const s = Auth.getSession();
    if (!s) { window.location.href = 'index.html'; return; }
    if (!Auth.protectPage('low-attendance', 'Low Attendance')) return;

    AppLayout.init('low-attendance.html');

    const mount = document.getElementById('app-content');
    if (!mount) return;

    renderPage(mount);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, refreshAll };
})();