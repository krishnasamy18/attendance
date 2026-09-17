/* ============================================================
   Staff Attendance (HOD)
   ------------------------------------------------------------
   Dedicated HOD page for daily staff attendance. Staff attendance
   is kept completely separate from student attendance records.

   - Date picker (default today), department / designation / status
     filters and staff search.
   - Staff are never auto-marked: every row starts as "Not Marked".
   - Marking or editing goes through one modal (photo, name, id,
     department, date, status, check-in, check-out, remarks).
   - Unique key is staffId + date: an existing entry is EDITED, never
     duplicated ("Attendance already marked" -> Edit Attendance).
   - Full history with monthly summary inside the modal.
   - Live refresh via the shared realtime bus (staffattendance.updated).
   ============================================================ */

window.StaffAttendanceApp = (() => {

  const $ = (sel) => document.querySelector(sel);

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const session = () => Auth.getSession();

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return esc(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
  };

  const fmtDT = (iso) => {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (isNaN(dt)) return esc(String(iso));
    return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const state = {
    date: todayISO(),
    department: '',
    designation: '',
    status: '',
    q: '',
    staffId: ''
  };

  const avatarFor = (f, size = 34) =>
    (window.ProfilePhoto ? ProfilePhoto.avatarBadge({ userId: f.staffId, name: f.name, role: 'Staff', size }) : `<div class="avatar" style="width:${size}px;height:${size}px;font-size:12px">${esc(Utils.initials(f.name))}</div>`);

  const statusPill = (status) => {
    const info = staffStatusInfo(status);
    return `<span class="badge ${info.cls}"><i class="fas ${info.icon}"></i> ${esc(info.label)}</span>`;
  };

  /* ---------- Data helpers ---------- */

  const staffList = () => {
    const s = session();
    let list = DB.getStaff();
    if (state.department) list = list.filter((f) => f.department === state.department);
    if (state.designation) list = list.filter((f) => f.designation === state.designation);
    if (state.status) {
      if (state.status === 'not_marked') list = list.filter((f) => !recordFor(f.id));
      else list = list.filter((f) => { const r = recordFor(f.id); return r && r.status === state.status; });
    }
    const q = state.q.trim().toLowerCase();
    if (q) {
      list = list.filter((f) =>
        f.staffId.toLowerCase().includes(q) || f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q));
    }
    return list;
  };

  const recordFor = (staffId) => DB.getStaffAttendanceOn(staffId, state.date);

  /* ---------- Page ---------- */

  const renderPage = (mount) => {
    mount.innerHTML = `
      <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <h1>Staff Attendance</h1>
          <p>Mark and manage daily attendance for your faculty.</p>
        </div>
        <div class="sa-page-note">
          <i class="fas fa-circle-info"></i> Live data — updates automatically.
        </div>
      </div>

      <div class="filters-bar">
        <div class="form-group">
          <label for="sa-date">Date</label>
          <input type="date" class="form-control" id="sa-date" value="${esc(state.date)}" max="${esc(todayISO())}">
        </div>
        <div class="form-group">
          <label for="sa-dept">Department</label>
          <select class="form-control" id="sa-dept">
            <option value="">All Departments</option>
            ${departments().map((d) => `<option value="${esc(d)}" ${state.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="sa-desig">Designation</label>
          <select class="form-control" id="sa-desig">
            <option value="">All Designations</option>
            ${designations().map((d) => `<option value="${esc(d)}" ${state.designation === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="sa-status">Status</label>
          <select class="form-control" id="sa-status">
            <option value="">All Statuses</option>
            ${['not_marked', ...STAFF_STATUS_OPTIONS].map((s) => `<option value="${s}" ${state.status === s ? 'selected' : ''}>${esc(staffStatusInfo(s).label)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group sa-search">
          <label for="sa-q">Search</label>
          <input type="text" class="form-control" id="sa-q" value="${esc(state.q)}" placeholder="Name, staff ID or email...">
        </div>
        <button class="btn btn-primary" id="sa-today" style="height:38px"><i class="fas fa-calendar-day"></i> Today</button>
      </div>

      <div class="sa-stats-grid" id="sa-stats"></div>

      <div id="sa-message"></div>

      <div class="card">
        <div class="table-responsive">
          <table class="table staff-rich-table">
            <thead>
              <tr>
                <th>Staff ID</th>
                <th>Staff Name</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Status</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="sa-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    $('#sa-date').addEventListener('change', (e) => { state.date = e.target.value || todayISO(); renderBody(); });
    $('#sa-dept').addEventListener('change', (e) => { state.department = e.target.value; renderBody(); });
    $('#sa-desig').addEventListener('change', (e) => { state.designation = e.target.value; renderBody(); });
    $('#sa-status').addEventListener('change', (e) => { state.status = e.target.value; renderBody(); });
    const q = $('#sa-q');
    q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(() => { state.q = q.value; renderBody(); }, 200); });
    $('#sa-today').addEventListener('click', () => {
      state.date = todayISO();
      $('#sa-date').value = state.date;
      renderBody();
    });

    renderBody();

    // Optional deep-link from HOD profile / staff management:
    // staff-attendance.html?staff=<staffId>&date=YYYY-MM-DD
    if (state.staffId && DB.getStaff().some((f) => f.id === state.staffId)) {
      setTimeout(() => openMarkModal(state.staffId), 120);
    }
  };

  const renderBody = () => {
    renderStats();
    const staff = staffList();
    const tbody = $('#sa-tbody');
    const msg = $('#sa-message');

    const all = DB.getStaff();
    if (all.length === 0) {
      msg.innerHTML = `<div class="sa-empty-banner"><i class="fas fa-user-slash"></i> No staff members added yet — add staff from the <a href="staff.html" style="font-weight:700;color:var(--primary)">Staff</a> page first.</div>`;
    } else {
      const marked = DB.getStaffAttendanceDailyStats(state.date).marked;
      msg.innerHTML = marked === 0
        ? `<div class="sa-empty-banner"><i class="fas fa-calendar-xmark"></i> No staff attendance has been marked for ${esc(fmtDate(state.date))}.</div>`
        : '';
    }

    if (staff.length === 0) {
      tbody.innerHTML = TableRenderer.emptyState(8, 'No Staff Found');
      return;
    }

    tbody.innerHTML = staff.map((f) => {
      const rec = recordFor(f.id);
      const status = rec ? rec.status : 'not_marked';
      const canEdit = !!rec;
      return `
        <tr>
          <td><strong>${esc(f.staffId)}</strong></td>
          <td>
            <div class="flex items-center gap-10">
              ${avatarFor(f)}
              <span><strong>${esc(f.name)}</strong></span>
            </div>
          </td>
          <td>${esc(f.department)}</td>
          <td>${esc(f.designation || '—')}</td>
          <td>
            <div class="sa-status-cell">
              ${statusPill(status)}
              <select class="sa-quick-select" data-sa-quick="${esc(f.id)}" aria-label="Quick mark status">
                <option value="">Quick set…</option>
                ${STAFF_STATUS_OPTIONS.map((s) => `<option value="${s}">Mark ${esc(staffStatusInfo(s).label)}</option>`).join('')}
              </select>
            </div>
          </td>
          <td>${esc(rec && rec.checkIn || '—')}</td>
          <td>${esc(rec && rec.checkOut || '—')}</td>
          <td class="actions">
            <button class="btn btn-sm ${canEdit ? 'btn-outline' : 'btn-primary'}" data-sa-mark="${esc(f.id)}">
              <i class="fas ${canEdit ? 'fa-pen' : 'fa-plus'}"></i>${canEdit ? 'Edit' : 'Mark'}
            </button>
            <button class="btn btn-sm btn-outline" data-sa-history="${esc(f.id)}"><i class="fas fa-clock-rotate-left"></i>History</button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-sa-quick]').forEach((sel) => {
      sel.addEventListener('change', () => {
        if (!sel.value) { sel.value = ''; return; }
        openMarkModal(sel.dataset.saQuick, sel.value);
        sel.value = '';
      });
    });

    tbody.addEventListener('click', (e) => {
      const mark = e.target.closest('[data-sa-mark]');
      const hist = e.target.closest('[data-sa-history]');
      if (mark) { openMarkModal(mark.dataset.saMark); return; }
      if (hist) { openHistoryModal(hist.dataset.saHistory); }
    });
  };

  const renderStats = () => {
    const holder = $('#sa-stats');
    if (!holder) return;
    const s = DB.getStaffAttendanceDailyStats(state.date);

    const statCard = (cls, icon, label, value) => `
      <div class="sa-stat">
        <div class="sa-stat-icon ${cls}"><i class="fas ${icon}"></i></div>
        <div class="sa-stat-info"><h3>${value}</h3><p>${label}</p></div>
      </div>`;

    holder.innerHTML =
      statCard('i-info', 'fa-user-tie', 'Total Staff', s.totalStaff) +
      statCard('i-success', 'fa-user-check', 'Present', s.present) +
      statCard('i-danger', 'fa-user-xmark', 'Absent', s.absent) +
      statCard('i-warning', 'fa-clock', 'Late', s.late) +
      statCard('i-gray', 'fa-plane', 'Leave', s.leave) +
      statCard('i-warning', 'fa-sun', 'Half Day', s.halfDay) +
      statCard('i-gray', 'fa-minus', 'Not Marked', s.notMarked);
  };

  const departments = () => [...new Set(DB.getStaff().map((f) => (f.department || 'AI&DS')))].filter(Boolean).sort();
  const designations = () => [...new Set(DB.getStaff().map((f) => (f.designation || '')))].filter(Boolean).sort();

  /* ---------- Mark / Edit modal ---------- */

  const openMarkModal = (staffId, presetStatus) => {
    const s = session();
    const f = DB.getStaff().find((x) => x.id === staffId);
    if (!f) { Toast.error('Staff member not found.'); return; }

    const rec = DB.getStaffAttendanceOn(staffId, state.date);
    const status = presetStatus || (rec && rec.status) || 'present';
    const editing = !!rec;

    Modal.open({
      title: `${editing ? 'Edit Attendance' : 'Mark Attendance'} — ${esc(state.date)}`,
      body: `
        <div class="sa-modal-head">
          <div class="sa-big-avatar" data-photo-user="${esc(f.staffId)}" data-photo-role="Staff" data-photo-size="72" data-photo-name="${esc(f.name)}">
            ${avatarFor(f, 72)}
          </div>
          <div>
            <h4>${esc(f.name)}</h4>
            <p>${esc(f.staffId)} · ${esc(f.department)} · ${esc(f.designation || '—')}</p>
          </div>
        </div>

        ${editing ? `<div class="sa-already"><i class="fas fa-circle-info"></i> Attendance already marked as <strong>${esc(staffStatusInfo(rec.status).label)}</strong> for ${esc(fmtDate(state.date))}. Adjust the details below to update.</div>` : ''}

        <div class="form-group">
          <label>Status <span class="required">*</span></label>
          <select class="form-control" id="sam-status">
            ${STAFF_STATUS_OPTIONS.map((st) => `<option value="${st}" ${status === st ? 'selected' : ''}>${esc(staffStatusInfo(st).label)}</option>`).join('')}
          </select>
        </div>
        <div class="sa-time-row">
          <div class="form-group">
            <label>Check In</label>
            <input type="time" class="form-control" id="sam-in" value="${esc(rec && rec.checkIn || '')}">
          </div>
          <div class="form-group">
            <label>Check Out</label>
            <input type="time" class="form-control" id="sam-out" value="${esc(rec && rec.checkOut || '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Remarks</label>
          <textarea class="form-control" id="sam-remarks" rows="2" placeholder="Optional note for this entry">${esc(rec && rec.remarks || '')}</textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-cancel>Cancel</button>
        <button class="btn btn-primary" id="sam-save"><i class="fas fa-save"></i> ${editing ? 'Update Attendance' : 'Save Attendance'}</button>
      `
    });

    const ov = document.querySelector('.modal-overlay.active');
    const statusEl = ov.querySelector('#sam-status');
    const inEl = ov.querySelector('#sam-in');
    const outEl = ov.querySelector('#sam-out');
    const remarksEl = ov.querySelector('#sam-remarks');
    const saveBtn = ov.querySelector('#sam-save');

    ov.querySelector('[data-cancel]').addEventListener('click', Modal.close);

    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true;
      const res = DB.markStaffAttendance({
        staffId,
        date: state.date,
        status: statusEl.value,
        checkIn: inEl.value,
        checkOut: outEl.value,
        remarks: remarksEl.value,
        role: 'HOD',
        markedBy: (s && s.name) || 'HOD'
      });
      if (!res.ok) {
        saveBtn.disabled = false;
        Toast.error(res.message);
        return;
      }
      RealtimeService.emit('staffattendance.updated', {
        source: 'staff-attendance',
        staffId,
        date: state.date,
        status: statusEl.value,
        isUpdate: res.existed,
        markedBy: (s && s.name) || 'HOD',
        ts: Date.now()
      });
      Toast.success(res.message);
      Modal.close();
      renderBody();
    });
  };

  /* ---------- History modal ---------- */

  const openHistoryModal = (staffId) => {
    const f = DB.getStaff().find((x) => x.id === staffId);
    if (!f) { Toast.error('Staff member not found.'); return; }

    const histState = { from: '', to: '', status: '' };

    Modal.open({
      title: `Attendance History — ${esc(f.name)}`,
      body: `
        <div class="sa-modal-head">
          <div class="sa-big-avatar">${avatarFor(f, 72)}</div>
          <div>
            <h4>${esc(f.name)}</h4>
            <p>${esc(f.staffId)} · ${esc(f.department)} · ${esc(f.designation || '—')}</p>
          </div>
        </div>

        <div class="sa-history-filters">
          <div class="form-group">
            <label>From</label>
            <input type="date" class="form-control" id="sah-from">
          </div>
          <div class="form-group">
            <label>To</label>
            <input type="date" class="form-control" id="sah-to">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select class="form-control" id="sah-status">
              <option value="">All Statuses</option>
              ${STAFF_STATUS_OPTIONS.map((s2) => `<option value="${s2}">${esc(staffStatusInfo(s2).label)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div id="sah-summary" class="sa-summary-row"></div>
        <div id="sah-body"></div>
      `,
      footer: `<button class="btn btn-outline" data-cancel>Close</button>`
    });

    const ov = document.querySelector('.modal-overlay.active');
    ov.querySelector('[data-cancel]').addEventListener('click', Modal.close);

    const renderHistory = () => {
      const list = DB.getStaffAttendance({
        staffId,
        from: histState.from || undefined,
        to: histState.to || undefined,
        status: histState.status || undefined
      }).slice().reverse();

      const summaryEl = ov.querySelector('#sah-summary');
      const body = ov.querySelector('#sah-body');

      // Monthly summary chips
      const months = {};
      list.forEach((r) => {
        const key = r.date.slice(0, 7);
        const m = months[key] = months[key] || { working: 0, present: 0, absent: 0, late: 0, leave: 0, halfDay: 0 };
        if (r.status === 'not_marked') return;
        m.working += 1;
        if (m[r.status] !== undefined) m[r.status] += 1;
      });

      summaryEl.innerHTML = Object.keys(months).sort().reverse().map((key) => {
        const m = months[key];
        const attended = m.present + m.late;
        const pct = m.working ? Math.round((attended / m.working) * 100) : 0;
        const label = new Date(key + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        return `
          <span class="sa-month"><i class="fas fa-calendar"></i>${esc(label)}
            <span class="muted">— ${m.working} working days · Present ${m.present} · Absent ${m.absent} · Late ${m.late} · Leave ${m.leave} · Half Day ${m.halfDay} · ${pct}%</span>
          </span>`;
      }).join('') || '<span class="text-muted" style="font-size:13px">No records in the selected range.</span>';

      if (!list.length) {
        body.innerHTML = `<div class="lowatt-empty"><i class="fas fa-inbox"></i><p>No staff attendance marked ${esc(fmtDate(histState.from || '') + ' – ' + fmtDate(histState.to || ''))}.</p></div>`;
        return;
      }

      body.innerHTML = `
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr><th>Date</th><th>Day</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Remarks</th><th>Marked By</th><th>Last Updated</th></tr>
            </thead>
            <tbody>
              ${list.map((r) => `
                <tr>
                  <td><strong>${esc(r.date)}</strong></td>
                  <td>${esc(fmtDate(r.date).split(',')[0])}</td>
                  <td>${statusPill(r.status)}</td>
                  <td>${esc(r.checkIn || '—')}</td>
                  <td>${esc(r.checkOut || '—')}</td>
                  <td>${esc(r.remarks || '—')}</td>
                  <td>${esc(r.updatedBy || r.markedBy || '—')}</td>
                  <td>${fmtDT(r.updatedAt || r.createdAt)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    };

    ov.querySelector('#sah-from').addEventListener('change', (e) => { histState.from = e.target.value; renderHistory(); });
    ov.querySelector('#sah-to').addEventListener('change', (e) => { histState.to = e.target.value; renderHistory(); });
    ov.querySelector('#sah-status').addEventListener('change', (e) => { histState.status = e.target.value; renderHistory(); });

    renderHistory();
  };

  /* ---------- Realtime ---------- */

  // eslint-disable-next-line no-unused-vars
  const unsub = RealtimeService.subscribe('staffattendance.updated', () => {
    renderStats();
    renderBody();
  });

  /* ---------- init ---------- */

  const init = () => {
    if (Auth.getRole() !== 'HOD') return;
    if (window.location.pathname.split('/').pop() !== 'staff-attendance.html') return;

    if (!Auth.protectPage('staff.attendance', 'Staff Attendance')) return;
    AppLayout.init('staff-attendance.html');

    const params = new URLSearchParams(window.location.search);
    if (params.get('date')) state.date = params.get('date');
    if (params.get('staff')) state.staffId = params.get('staff');
    if (params.get('department')) state.department = params.get('department');

    const mount = document.getElementById('app-content');
    if (!mount) return;
    renderPage(mount);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, renderBody, openMarkModal, openHistoryModal };
})();