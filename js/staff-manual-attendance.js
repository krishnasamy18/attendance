/* ============================================================
   Manual Attendance — staff correction of camera results
   ------------------------------------------------------------
   Reviews a completed camera session (date + class + section +
   subject + hour) and lets the staff correct missed or wrongly
   identified students. Corrections always target the EXISTING
   session by sessionId — never duplicated — and each correction
   is confirmed, audited (who/when/from/to/why) and reflected in
   final attendance, reports, WhatsApp and low-attendance in real
   time (realtime bus).
   ============================================================ */

window.ManualAttendanceApp = (() => {
  'use strict';

  const svc = () => window.ManualAttendanceService;

  const state = {
    selection: null,
    session: null,
    search: '',
    filter: 'all', // all | not-detected | corrected
    selected: new Set()
  };

  const escAttr = (s) => esc(String(s == null ? '' : s));
  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const statusBadge = (status) => {
    const map = {
      present: { label: 'Present', cls: 'badge-success' },
      absent: { label: 'Absent', cls: 'badge-danger' },
      late: { label: 'Late', cls: 'badge-warning' },
      pending: { label: 'Pending', cls: 'badge-gray' }
    };
    const b = map[status] || map.pending;
    return `<span class="badge ${b.cls}">${b.label}</span>`;
  };

  const methodChip = (st) => {
    if (st.manuallyCorrected) return `<span class="ma-method ma-method--corrected">Manually corrected</span>`;
    if (st.method === 'manual') return `<span class="ma-method ma-method--manual">Manual</span>`;
    return `<span class="ma-method ma-method--camera">Camera</span>`;
  };

  const detectionChip = (st) => {
    if (st.manuallyCorrected) return `<span class="ma-detect ma-detect--corrected"><i class="fas fa-user-check"></i> Manually corrected</span>`;
    if (st.notDetected) return `<span class="ma-detect ma-detect--missed"><i class="fas fa-video-slash"></i> Not Detected</span>`;
    return `<span class="ma-detect ma-detect--ok"><i class="fas fa-video"></i> Detected</span>`;
  };

  const classOptions = { I: 'I Sem', II: 'II Sem', III: 'III Sem', IV: 'IV Sem' };
  const HOUR_PRESETS = [
    ['H1', 'Hour 1 (9:00 - 10:00)'],
    ['H2', 'Hour 2 (10:00 - 11:00)'],
    ['H3', 'Hour 3 (11:15 - 12:15)'],
    ['H4', 'Hour 4 (1:00 - 2:00)'],
    ['H5', 'Hour 5 (2:00 - 3:00)']
  ];

  /* ============================================================
     Page render
     ============================================================ */

  const inputErr = (id, msg, on) => {
    const el = document.getElementById(id);
    const box = document.getElementById('err-' + id);
    if (el) el.classList.toggle('invalid', on);
    if (box) box.classList.toggle('show', on);
    return msg;
  };

  const renderPage = () => {
    if (!Auth.protectPage('attendance.manual', 'Manual Attendance')) return;
    AppLayout.init('staff-manual-attendance.html');

    const session = Auth.getSession();
    const person = session.person;
    const assignedClasses = person.classes || [];
    const assignedSubjects = DB.getSubjects().filter((s) => (person.subjects || []).includes(s.name));

    const mount = document.getElementById('app-content');
    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Manual Attendance</h1>
          <p>Review and correct attendance when camera recognition misses or incorrectly identifies a student.</p>
        </div>
        <button class="btn btn-outline hidden" id="ma-new" type="button"><i class="fas fa-rotate-left"></i> New Selection</button>
      </div>

      <div id="ma-feedback"></div>

      <div class="card" id="ma-step-1">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-sliders"></i>Select Session</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="ma-date">Date <span class="required">*</span></label>
            <input type="date" class="form-control" id="ma-date" value="${escAttr(Utils.todayISO())}">
            <div class="form-error" id="err-ma-date">Please select a valid date.</div>
          </div>
          <div class="form-group">
            <label for="ma-class">Class <span class="required">*</span></label>
            <select class="form-control" id="ma-class">
              <option value="">Select class</option>
              ${assignedClasses.map((c) => `<option value="${escAttr(c)}">${escAttr(classOptions[c] || c)} AI &amp; DS</option>`).join('')}
            </select>
            <div class="form-error" id="err-ma-class">Please select a class.</div>
          </div>
          <div class="form-group">
            <label for="ma-section">Section</label>
            <select class="form-control" id="ma-section">
              ${DB.getSections().map((sec) => `<option value="${escAttr(sec)}">${escAttr(sec)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="ma-subject">Subject <span class="required">*</span></label>
            <select class="form-control" id="ma-subject">
              <option value="">Select subject</option>
              ${assignedSubjects.map((x) => `<option value="${escAttr(x.code)}">${escAttr(x.name)}</option>`).join('')}
            </select>
            <div class="form-error" id="err-ma-subject">Please select a subject.</div>
          </div>
          <div class="form-group">
            <label for="ma-hour">Hour <span class="required">*</span></label>
            <select class="form-control" id="ma-hour">
              <option value="">Select hour</option>
              ${HOUR_PRESETS.map(([v, l]) => `<option value="${escAttr(v)}">${escAttr(l)}</option>`).join('')}
            </select>
            <div class="form-error" id="err-ma-hour">Please select an hour.</div>
          </div>
        </div>
        <div class="flex justify-between items-center mt-16">
          <span class="text-muted" id="ma-hint">The existing camera session for this slot is loaded — corrections are applied to it directly.</span>
          <button class="btn btn-primary" id="ma-load"><i class="fas fa-file-import"></i> Load Attendance</button>
        </div>
      </div>

      <div class="card hidden" id="ma-step-2">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-user-shield"></i>Manual Attendance — <span id="ma-context"></span></div>
        </div>
        <div id="ma-session-banner"></div>
        <div id="ma-session-meta"></div>

        <div class="filters-bar" id="ma-toolbar">
          <div class="form-group" style="flex:1;max-width:300px;margin:0">
            <input type="text" class="form-control" id="ma-search" placeholder="Search register no / name...">
          </div>
          <div class="ma-filter-chips" id="ma-filter-chips">
            <button type="button" class="ma-filter-chip is-active" data-filter="all">All</button>
            <button type="button" class="ma-filter-chip" data-filter="not-detected">Not Detected</button>
            <button type="button" class="ma-filter-chip" data-filter="corrected">Manually Corrected</button>
          </div>
        </div>

        <div class="ma-summary" id="ma-summary"></div>

        <div class="table-responsive">
          <table class="table table-cards">
            <thead>
              <tr>
                <th style="width:40px"><input type="checkbox" id="ma-check-all" title="Select all visible"></th>
                <th>Register No</th>
                <th>Student Name</th>
                <th>Camera Result</th>
                <th>Method</th>
                <th>Detected At</th>
                <th>Reason / Correction</th>
                <th style="min-width:150px">Final Status</th>
              </tr>
            </thead>
            <tbody id="ma-tbody"></tbody>
          </table>
        </div>
        <div class="live-empty" id="ma-empty" style="display:none"></div>

        <div class="ma-bulk-bar" id="ma-bulk-bar">
          <span class="text-muted" style="font-size:13px"><span id="ma-bulk-count">0</span> selected</span>
          <div class="form-group" style="margin:0;max-width:180px">
            <select class="form-control" id="ma-bulk-status">
              <option value="present">Mark Present</option>
              <option value="absent">Mark Absent</option>
              <option value="late">Mark Late</option>
            </select>
          </div>
          <button class="btn btn-primary" id="ma-bulk-apply"><i class="fas fa-check-double"></i> Apply to Selected</button>
        </div>

        <div class="flex justify-between items-center mt-16 flex-wrap gap-10" id="ma-finalize-row">
          <span class="text-muted" id="ma-progress"></span>
          <button class="btn btn-success btn-lg" id="ma-finalize" style="padding:11px 26px;font-size:15px">
            <i class="fas fa-lock"></i> Finalize Attendance
          </button>
        </div>
      </div>

      <div class="card hidden" id="ma-history-card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-history"></i>Correction History — <span id="ma-history-context"></span></div>
        </div>
        <div class="table-responsive">
          <table class="table table-cards">
            <thead>
              <tr><th>Register No</th><th>Student</th><th>From</th><th>To</th><th>Reason</th><th>Corrected By</th><th>At</th></tr>
            </thead>
            <tbody id="ma-history-tbody"></tbody>
          </table>
        </div>
      </div>
    `;

    wireForm();
    wireStep2();
  };

  /* ============================================================
     Form wiring
     ============================================================ */

  const wireForm = () => {
    const loadBtn = document.getElementById('ma-load');
    const newBtn = document.getElementById('ma-new');

    newBtn.addEventListener('click', () => {
      state.session = null;
      state.selection = null;
      state.selected = new Set();
      document.getElementById('ma-feedback').innerHTML = '';
      document.getElementById('ma-step-1').classList.remove('hidden');
      document.getElementById('ma-step-2').classList.add('hidden');
      document.getElementById('ma-history-card').classList.add('hidden');
      newBtn.classList.add('hidden');
      document.getElementById('header-title').textContent = 'Manual Attendance';
    });

    loadBtn.addEventListener('click', () => {
      const dateEl = document.getElementById('ma-date');
      const classEl = document.getElementById('ma-class');
      const subjectEl = document.getElementById('ma-subject');
      const hourEl = document.getElementById('ma-hour');
      const section = document.getElementById('ma-section');

      let valid = true;
      [['ma-date', () => !dateEl.value], ['ma-class', () => !classEl.value], ['ma-subject', () => !subjectEl.value], ['ma-hour', () => !hourEl.value]]
        .forEach(([id, cond]) => {
          if (cond()) { inputErr(id, '', true); valid = false; } else { inputErr(id, '', false); }
        });
      if (!valid) {
        Toast.warning('Please fill the required fields.');
        return;
      }

      const selection = {
        date: dateEl.value,
        classId: classEl.value,
        section: section.value,
        subjectCode: subjectEl.value.toUpperCase(),
        hour: hourEl.value
      };

      Buttons.loading(loadBtn, 'Loading session...');
      const result = svc().loadAttendanceSession(selection);

      setTimeout(() => {
        Buttons.reset(loadBtn);
        if (!result.ok) {
          state.session = null;
          state.selection = null;
          newBtn.classList.add('hidden');
          document.getElementById('header-title').textContent = 'Manual Attendance';
          document.getElementById('ma-step-2').classList.add('hidden');
          document.getElementById('ma-history-card').classList.add('hidden');
          renderFeedback(result.code, result.message);
          return;
        }
        state.selection = selection;
        state.search = '';
        state.filter = 'all';
        state.selected = new Set();
        state.session = result.session;
        document.getElementById('ma-feedback').innerHTML = '';
        document.getElementById('ma-step-1').classList.add('hidden');
        document.getElementById('ma-step-2').classList.remove('hidden');
        document.getElementById('ma-history-card').classList.remove('hidden');
        newBtn.classList.remove('hidden');
        document.getElementById('header-title').textContent = 'Manual Attendance — ' + result.session.subjectName;
        renderContext();
        renderSessionState();
        renderSummary();
        renderStudents();
        renderHistory();
        syncCheckAll();
      }, 120);
    });
  };

  const renderFeedback = (code, message) => {
    const el = document.getElementById('ma-feedback');
    const hints = {
      'no-session': 'No camera session exists for this selection. Start the camera session first, or record attendance from Mark Attendance.',
      'in-progress': 'You can correct this session after the camera session ends.',
      'closed': '',
      'finalized': 'This session is finalized.',
      'denied': 'This session belongs to another staff member.'
    };
    const hint = hints[code] || '';
    el.innerHTML = `
      <div class="ma-feedback __${escAttr(code || '')}">
        <i class="fas ${code === 'no-session' ? 'fa-folder-open' : code === 'closed' ? 'fa-lock' : code === 'denied' ? 'fa-shield-halved' : 'fa-circle-info'}"></i>
        <div>
          <strong>${esc(message)}</strong>
          ${hint ? `<p>${esc(hint)}</p>` : ''}
        </div>
      </div>`;
  };

  /* ============================================================
     Session + student rendering
     ============================================================ */

  const renderContext = () => {
    const s = state.session;
    const subj = DB.getSubjects().find((x) => x.code === s.subjectCode);
    document.getElementById('ma-context').innerHTML =
      `${escAttr(classOptions[s.classId] || s.classId)} AI &amp; DS - Sec ${escAttr(s.section)} - ${escAttr(subj ? subj.name : s.subjectName)} - ${escAttr(String(s.hour).replace('H', ''))} Hour`;
    document.getElementById('ma-history-context').innerHTML =
      `${escAttr(s.subjectName)} (${escAttr(s.subjectCode)}) · ${escAttr(s.classLabel || s.classId)} · Sec ${escAttr(s.section)} · ${fmtDate(s.startedAt)}`;
  };

  const renderSessionState = () => {
    const s = state.session;

    const meta = `
      <div class="ma-session-meta">
        <span><i class="fas fa-user-tie"></i> ${esc(s.staffName || 'Staff')}</span>
        <span><i class="fas fa-door-open"></i> Room ${esc(s.room || '—')}</span>
        <span><i class="fas fa-stopwatch"></i> Started ${fmtTime(s.startedAt)}</span>
        <span><i class="fas fa-flag-checkered"></i> Ended ${fmtTime(s.endedAt)}</span>
        <span><i class="fas fa-hourglass-half"></i> Correction window: ${s.correctionWindowMins} min</span>
        ${s.windowOpen ? '<span class="ma-open-tag"><i class="fas fa-circle-check"></i> Window open</span>' : '<span class="ma-closed-tag"><i class="fas fa-lock"></i> Window closed</span>'}
      </div>`;
    document.getElementById('ma-session-meta').innerHTML = meta;

    const banner = s.finalized
      ? `<div class="ma-banner ma-banner--finalized"><i class="fas fa-lock"></i> Attendance corrected, finalized and locked on ${fmtDate(s.finalizedAt)} — further corrections are not allowed.</div>`
      : `<div class="ma-banner ma-banner--info"><i class="fas fa-circle-info"></i> Corrections below apply directly to the camera session (same session is used — never duplicated) and update the final attendance in real time.</div>`;
    document.getElementById('ma-session-banner').innerHTML = banner;

    const finalizeRow = document.getElementById('ma-finalize-row');
    const finalizeBtn = document.getElementById('ma-finalize');
    if (s.finalized) {
      finalizeRow.classList.add('hidden');
    } else {
      finalizeRow.classList.remove('hidden');
    }
    if (finalizeBtn) finalizeBtn.disabled = !s.windowOpen || !!s.finalized;
  };

  const renderSummary = () => {
    const s = state.session;
    const students = s.students || [];
    const present = students.filter((x) => x.status === 'present').length;
    const absent = students.filter((x) => x.status === 'absent').length;
    const late = students.filter((x) => x.status === 'late').length;
    const notDetected = students.filter((x) => x.notDetected).length;
    const corrected = students.filter((x) => x.manuallyCorrected).length;
    const total = students.length;
    const pct = total ? Math.round(((present + late) / total) * 100) : 0;

    document.getElementById('ma-summary').innerHTML = `
      <div class="ma-stat"><span class="ma-stat-val">${present}</span><span class="ma-stat-lbl">Present</span></div>
      <div class="ma-stat"><span class="ma-stat-val">${absent}</span><span class="ma-stat-lbl">Absent</span></div>
      <div class="ma-stat"><span class="ma-stat-val">${late}</span><span class="ma-stat-lbl">Late</span></div>
      <div class="ma-stat"><span class="ma-stat-val ma-stat-warn">${notDetected}</span><span class="ma-stat-lbl">Not Detected</span></div>
      <div class="ma-stat"><span class="ma-stat-val ma-stat-acc">${corrected}</span><span class="ma-stat-lbl">Corrected</span></div>
      <div class="ma-stat"><span class="ma-stat-val">${pct}%</span><span class="ma-stat-lbl">Attendance</span></div>
    `;

    document.getElementById('ma-progress').textContent =
      `${total} student(s) · ${corrected} correction(s) applied · ${notDetected} still not detected by camera`;
  };

  const visibleStudents = () => {
    const q = state.search.trim().toLowerCase();
    return (state.session.students || []).filter((st) => {
      if (state.filter === 'not-detected' && !st.notDetected) return false;
      if (state.filter === 'corrected' && !st.manuallyCorrected) return false;
      if (q && !(st.registerNumber + ' ' + st.name).toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const renderStudents = () => {
    const s = state.session;
    const tbody = document.getElementById('ma-tbody');
    const empty = document.getElementById('ma-empty');
    const locked = !!s.finalized;
    const list = visibleStudents();

    tbody.innerHTML = list.map((st) => `
      <tr class="${st.notDetected ? '__notdetected' : ''}${st.manuallyCorrected ? ' __corrected' : ''}" data-student-id="${escAttr(st.studentId)}">
        <td>
          <input type="checkbox" class="ma-row-check" value="${escAttr(st.studentId)}"
            ${state.selected.has(st.studentId) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        </td>
        <td>${esc(st.registerNumber)}</td>
        <td><strong>${esc(st.name)}</strong></td>
        <td>${statusBadge(st.status)} ${detectionChip(st)}</td>
        <td>${methodChip(st)}</td>
        <td>${fmtTime(st.detectedAt)}</td>
        <td class="ma-reason-cell">
          ${st.reason ? `<span class="ma-reason">${esc(st.reason)}</span>` : (st.correctionCount > 0 ? '<span class="text-muted" style="font-size:12px">No reason recorded</span>' : '<span class="text-muted" style="font-size:12px">—</span>')}
          ${st.wasCamera && !st.manuallyCorrected ? '<span class="ma-req-reason" title="A reason is required when changing a camera result">reason required *</span>' : ''}
        </td>
        <td>
          <select class="form-control ma-status-select" data-student-id="${escAttr(st.studentId)}" ${locked ? 'disabled' : ''}>
            <option value="present" ${st.status === 'present' ? 'selected' : ''}>Present</option>
            <option value="absent" ${st.status === 'absent' ? 'selected' : ''}>Absent</option>
            <option value="late" ${st.status === 'late' ? 'selected' : ''}>Late</option>
          </select>
        </td>
      </tr>`).join('');

    empty.style.display = list.length ? 'none' : '';
    empty.innerHTML = list.length ? '' :
      `<i class="fas fa-search"></i><h4>No students match your search / filter</h4>`;
  };

  const renderHistory = () => {
    const tbody = document.getElementById('ma-history-tbody');
    const corrections = (state.session.corrections || []);
    tbody.innerHTML = corrections.length === 0
      ? `<tr><td colspan="7" class="dr-empty">No corrections recorded for this session.</td></tr>`
      : corrections.map((c) => `
          <tr>
            <td>${esc(c.registerNumber)}</td>
            <td><strong>${esc(c.name)}</strong></td>
            <td>${statusBadge(c.originalStatus)}</td>
            <td>${statusBadge(c.newStatus)}</td>
            <td class="ma-reason-cell">${esc(c.reason || '—')}</td>
            <td>${esc(c.correctedBy || '—')}</td>
            <td>${fmtTime(c.correctedAt)}</td>
          </tr>`).join('');
  };

  /* ============================================================
     Edit + bulk + finalize
     ============================================================ */

  const openEditModal = (st, presetStatus) => {
    const s = state.session;
    if (s.finalized) { Toast.warning('Attendance is finalized and locked.'); return; }
    const current = st.status;
    const status = presetStatus || current;
    const reasonRequired = st.wasCamera;

    Modal.open({
      title: 'Confirm Attendance Correction',
      body: `
        <div class="ma-edit-student">
          <div>
            <strong>${esc(st.name)}</strong>
            <div class="text-muted" style="font-size:12px">${esc(st.registerNumber)} · Sec ${escAttr(st.section)}</div>
          </div>
          <div class="ma-edit-current">
            Camera result
            <span>${statusBadge(current)}</span> ${methodChip(st)}
          </div>
        </div>
        <div class="form-group">
          <label>New Status</label>
          <select class="form-control" id="ma-edit-status">
            <option value="present" ${status === 'present' ? 'selected' : ''}>Present</option>
            <option value="absent" ${status === 'absent' ? 'selected' : ''}>Absent</option>
            <option value="late" ${status === 'late' ? 'selected' : ''}>Late</option>
          </select>
        </div>
        <div class="form-group">
          <label>Reason for correction <span class="required">${reasonRequired ? '*' : ''}</span></label>
          <textarea class="form-control" id="ma-edit-reason" rows="3"
            placeholder="${reasonRequired ? 'e.g. student was present but not detected by camera' : 'Optional note'}"
            ${reasonRequired ? 'required' : ''}></textarea>
          ${reasonRequired ? '<div class="form-error show">A reason is required when correcting a camera result.</div>' : ''}
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()"><i class="fas fa-xmark"></i> Cancel</button>
        <button class="btn btn-primary" id="ma-edit-save"><i class="fas fa-check"></i> Confirm Attendance Correction?</button>
      `
    });

    document.getElementById('ma-edit-save').addEventListener('click', () => {
      const newStatus = document.getElementById('ma-edit-status').value;
      const reason = document.getElementById('ma-edit-reason').value.trim();
      if (reasonRequired && !reason) { Toast.warning('A reason is required when correcting a camera result.'); return; }
      const res = svc().updateAttendanceStatus({ sessionId: state.session.sessionId, studentId: st.studentId, newStatus, reason });
      if (res.ok) {
        Toast.success(res.message);
        Modal.close();
        state.session = res.session;
        renderSessionState();
        renderSummary();
        renderStudents();
        renderHistory();
      } else {
        Toast.error(res.message);
        if (res.code === 'closed' || res.code === 'finalized' || res.code === 'in-progress') { Modal.close(); reloadLoadedSession(); }
      }
    });
  };

  const openBulkModal = (selectedStudents, chosenStatus) => {
    const s = state.session;
    const anyCamera = selectedStudents.some((st) => st.wasCamera && !st.manuallyCorrected);
    Modal.open({
      title: 'Apply Bulk Correction',
      body: `
        <p style="font-size:14px;color:var(--gray-600);margin-bottom:12px">Approve a correction for <strong>${selectedStudents.length} student(s)</strong>. A reason is shared across all of them.</p>
        <div class="form-group">
          <label>Status to apply</label>
          <select class="form-control" id="ma-bulk-modal-status">
            <option value="${escAttr(chosenStatus)}" selected>${chosenStatus === 'present' ? 'Present' : chosenStatus === 'absent' ? 'Absent' : 'Late'}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Reason <span class="required">${anyCamera ? '*' : ''}</span></label>
          <textarea class="form-control" id="ma-bulk-modal-reason" rows="3"
            placeholder="${anyCamera ? 'Required when changing a camera result' : 'Optional note'}"
            ${anyCamera ? 'required' : ''}></textarea>
          ${anyCamera ? '<div class="form-error show">A reason is required when correcting a camera result.</div>' : ''}
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()"><i class="fas fa-xmark"></i> Cancel</button>
        <button class="btn btn-primary" id="ma-bulk-confirm"><i class="fas fa-check-double"></i> Apply attendance correction to ${selectedStudents.length} students?</button>
      `
    });

    document.getElementById('ma-bulk-confirm').addEventListener('click', () => {
      const reason = document.getElementById('ma-bulk-modal-reason').value.trim();
      if (anyCamera && !reason) { Toast.warning('A reason is required when correcting a camera result.'); return; }
      const res = svc().bulkUpdateAttendance({
        sessionId: state.session.sessionId,
        entries: selectedStudents.map((st) => ({ studentId: st.studentId, newStatus: chosenStatus, reason }))
      });
      if (res.ok) {
        Toast.success(res.message);
        Modal.close();
        state.selected = new Set();
        state.session = res.session;
        renderSessionState();
        renderSummary();
        renderStudents();
        renderHistory();
        syncSelected();
        syncCheckAll();
      } else {
        Toast.error(res.message);
        if (res.code === 'closed' || res.code === 'finalized' || res.code === 'in-progress') { Modal.close(); reloadLoadedSession(); }
      }
    });
  };

  const openFinalizeModal = () => {
    const s = state.session;
    const students = s.students || [];
    const present = students.filter((x) => x.status === 'present').length;
    const absent = students.filter((x) => x.status === 'absent').length;
    const late = students.filter((x) => x.status === 'late').length;
    const corrected = students.filter((x) => x.manuallyCorrected).length;

    Confirm.show({
      title: 'Finalize Attendance?',
      message: `
        Final status for this session:
        Present <strong>${present}</strong> · Absent <strong>${absent}</strong> · Late <strong>${late}</strong> · Manual corrections <strong>${corrected}</strong>.
        Finalizing locks the session, closes the correction window and is what flows into reports, WhatsApp and low-attendance.`,
      confirmText: 'Finalize Attendance',
      confirmClass: 'btn-success',
      onConfirm: () => {
        const res = svc().finalizeAttendance({ sessionId: state.session.sessionId });
        if (res.ok) {
          Toast.success(res.message);
          state.session = res.session;
          renderSessionState();
          renderSummary();
          renderStudents();
          renderHistory();
          syncCheckAll();
        } else {
          Toast.error(res.message);
        }
      }
    });
  };

  /* ============================================================
     Selection helpers
     ============================================================ */

  const selectedStudentIds = () => {
    const set = new Set();
    document.querySelectorAll('.ma-row-check:checked').forEach((cb) => set.add(cb.value));
    return set;
  };

  const syncSelected = () => {
    const set = selectedStudentIds();
    state.selected = set;
    document.getElementById('ma-bulk-count').textContent = set.size;
  };

  const syncCheckAll = () => {
    const checks = document.querySelectorAll('.ma-row-check');
    const all = document.getElementById('ma-check-all');
    if (!all) return;
    const visible = visibleStudents().map((x) => x.studentId);
    const visibleChecks = Array.from(checks).filter((cb) => visible.includes(cb.value));
    all.checked = visibleChecks.length > 0 && visibleChecks.every((cb) => cb.checked || cb.disabled);
    all.indeterminate = !all.checked && visibleChecks.some((cb) => cb.checked);
  };

  const reloadLoadedSession = () => {
    if (!state.selection) return;
    const result = svc().loadAttendanceSession(state.selection);
    if (result.ok) {
      state.session = result.session;
      renderSessionState();
      renderSummary();
      renderStudents();
      renderHistory();
    }
  };

  /* ============================================================
     Event wiring on the loaded UI
     ============================================================ */

  const wireStep2 = () => {
    const search = document.getElementById('ma-search');
    if (search) search.addEventListener('input', () => {
      state.search = search.value;
      renderStudents();
      syncCheckAll();
    });

    document.getElementById('ma-filter-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      document.querySelectorAll('.ma-filter-chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.filter = chip.getAttribute('data-filter');
      renderStudents();
      syncCheckAll();
    });

    document.getElementById('ma-tbody').addEventListener('change', (e) => {
      const cb = e.target.closest('.ma-row-check');
      const sel = e.target.closest('.ma-status-select');
      if (cb) { syncSelected(); syncCheckAll(); return; }
      if (sel) {
        const student = (state.session.students || []).find((x) => x.studentId === sel.getAttribute('data-student-id'));
        if (student) {
          sel.value = student.status;
          openEditModal(student, sel.value);
        }
        return;
      }
    });

    const checkAll = document.getElementById('ma-check-all');
    if (checkAll) checkAll.addEventListener('change', () => {
      const ids = visibleStudents().map((x) => x.studentId);
      document.querySelectorAll('.ma-row-check').forEach((cb) => {
        if (ids.includes(cb.value)) cb.checked = checkAll.checked;
      });
      syncSelected();
    });

    document.getElementById('ma-bulk-apply').addEventListener('click', () => {
      const ids = selectedStudentIds();
      if (!ids.size) { Toast.warning('Select at least one student.'); return; }
      const students = (state.session.students || []).filter((x) => ids.has(x.studentId));
      const status = document.getElementById('ma-bulk-status').value;
      openBulkModal(students, status);
    });

    document.getElementById('ma-finalize').addEventListener('click', openFinalizeModal);
  };

  /* ============================================================
     Realtime updates
     ============================================================ */

  const onRealtimeEvent = (payload) => {
    if (!payload || !state.session) return;
    if (payload.sessionId && payload.sessionId === state.session.sessionId) {
      reloadLoadedSession();
    }
  };

  /* ============================================================
     Boot
     ============================================================ */

  const init = () => {
    renderPage();
    if (window.RealtimeService) {
      RealtimeService.connect();
      RealtimeService.subscribe('corrections.updated', onRealtimeEvent);
      RealtimeService.subscribe('attendance.updated', onRealtimeEvent);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { renderPage };
})();