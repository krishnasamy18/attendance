/* ============================================================
   Live Attendance — real-time classroom camera monitoring UI
   ------------------------------------------------------------
   Renders the HOD live monitoring section, the HOD live
   monitoring page/monitor view and the staff live-session
   control panel. All data enters through the service layer
   (RealtimeService bus) — UI code never talks to a socket or
   localStorage store directly.

   No fake live data is produced anywhere:
     - camera stays "disconnected" until a real backend stream
       arrives (placeholder message always shown otherwise);
     - statuses/counters come from real user actions and real
       elapsed time.
   ============================================================ */

window.LiveAttendance = (() => {
  'use strict';

  const service = () => window.AttendanceSessionService;
  const camSvc = () => window.CameraService;

  const isOnPage = (file) => window.location.pathname.split('/').pop() === file;

  const classLabel = (id) => {
    const map = { I: 'I Sem', II: 'II Sem', III: 'III Sem', IV: 'IV Sem' };
    return map[id] || id;
  };

  const activeCount = () => (window.DB && DB.getActiveSessions ? DB.getActiveSessions().length : 0);

  /* ---------- Small render helpers ---------- */

  const pill = (status) => {
    const map = {
      WAITING: { icon: 'fa-clock', cls: 'is-waiting', label: 'Waiting' },
      CONNECTING: { icon: 'fa-link', cls: 'is-connecting', label: 'Connecting' },
      LIVE: { icon: 'fa-video', cls: 'is-live', label: 'Live' },
      PAUSED: { icon: 'fa-pause', cls: 'is-paused', label: 'Paused' },
      COMPLETED: { icon: 'fa-circle-check', cls: 'is-completed', label: 'Completed' },
      DISCONNECTED: { icon: 'fa-plug-circle-xmark', cls: 'is-disconnected', label: 'Disconnected' },
      ERROR: { icon: 'fa-circle-exclamation', cls: 'is-error', label: 'Error' }
    };
    const p = map[status] || map.DISCONNECTED;
    return `<span class="live-pill ${p.cls}">${p.label}</span>`;
  };

  const camChip = (cam) => {
    if (!cam) return `<span class="cam-chip is-disconnected">Waiting</span>`;
    const map = {
      connected: { cls: 'is-connected', label: 'Connected' },
      connecting: { cls: 'is-connecting', label: 'Connecting' },
      disconnected: { cls: 'is-disconnected', label: 'Disconnected' },
      error: { cls: 'is-error', label: 'Error' }
    };
    const c = map[cam.status] || map.disconnected;
    return `<span class="cam-chip ${c.cls}">${c.label}</span>`;
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

  const methodLabel = (m) => {
    if (m === 'manual') return 'Staff';
    if (m === 'camera-attendance') return 'Camera';
    return '—';
  };

  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const countsHtml = (s) => `
    <div class="live-counts">
      <div class="live-count live-count--green">
        <div class="live-count-value" data-live-count="present">${s.presentCount || 0}</div>
        <div class="live-count-label">Present</div>
      </div>
      <div class="live-count live-count--red">
        <div class="live-count-value" data-live-count="absent">${s.absentCount || 0}</div>
        <div class="live-count-label">Absent</div>
      </div>
      <div class="live-count live-count--amber">
        <div class="live-count-value" data-live-count="late">${s.lateCount || 0}</div>
        <div class="live-count-label">Late</div>
      </div>
      <div class="live-count live-count--gray">
        <div class="live-count-value" data-live-count="pending">${s.pendingCount || 0}</div>
        <div class="live-count-label">Pending</div>
      </div>
    </div>
  `;

  const progressHtml = (s) => `
    <div class="live-progress-row">
      <span>Attendance</span>
      <span class="val">${s.attendancePercentage || 0}%</span>
    </div>
    <div class="progress"><div class="progress-bar ${(s.attendancePercentage || 0) < 75 ? 'warning' : ''}" style="width:${s.attendancePercentage || 0}%"></div></div>
  `;

  const monitorInfoRows = (s) => `
    <div class="row"><i class="fas fa-school"></i><span class="k">Class</span><span class="v">${esc(s.classLabel)} AI &amp; DS</span></div>
    <div class="row"><i class="fas fa-book-open"></i><span class="k">Subject</span><span class="v">${esc(s.subjectName)} (${esc(s.subjectCode)})</span></div>
    <div class="row"><i class="fas fa-users"></i><span class="k">Section</span><span class="v">${esc(s.section || '—')}</span></div>
    <div class="row"><i class="fas fa-clock"></i><span class="k">Hour</span><span class="v">Hour ${esc(s.hour)}</span></div>
    <div class="row"><i class="fas fa-door-open"></i><span class="k">Room</span><span class="v">${esc(s.room || '—')}</span></div>
    <div class="row"><i class="fas fa-user-tie"></i><span class="k">Staff</span><span class="v">${esc(s.staffName || '—')}</span></div>
    <div class="row"><i class="fas fa-stopwatch"></i><span class="k">Duration</span><span class="v"><span class="live-duration" data-live-duration data-live-start="${esc(s.startedAt)}">${Utils.clock(s.startedAt)}</span></span></div>
    <div class="row"><i class="fas fa-video"></i><span class="k">Camera</span><span class="v">${esc(s.cameraName)}</span></div>
  `;

  const sessionCard = (s) => `
    <div class="live-card" data-session-card="${esc(s.sessionId)}">
      <div class="live-card-top">
        <div>
          <div class="live-card-classline">${esc(s.classLabel)} AI &amp; DS <span style="color:var(--gray-500);font-weight:500">· Sec ${esc(s.section || '—')}</span></div>
          <div class="live-card-subj">${esc(s.subjectName)} (${esc(s.subjectCode)})</div>
        </div>
        ${pill(s.status)}
      </div>
      <div class="live-card-body">
        <div class="live-card-meta">
          <div class="row"><i class="fas fa-clock"></i>Hour ${esc(s.hour)} · Room ${esc(s.room || '—')}</div>
          <div class="row"><i class="fas fa-user-tie"></i>${esc(s.staffName || 'Staff')}</div>
          <div class="row"><i class="fas fa-stopwatch"></i>Started ${fmtd(s.startedAt)}</div>
          <div class="row"><i class="fas fa-video"></i>${esc(s.cameraName)} ${camChip(s.camera)}</div>
        </div>
        ${countsHtml(s)}
        ${progressHtml(s)}
      </div>
      <div class="live-card-actions">
        <button type="button" class="btn btn-sm btn-primary" onclick="window.LiveAttendance.openMonitor('${esc(s.sessionId)}')"><i class="fas fa-expand"></i> Monitor</button>
      </div>
    </div>
  `;

  const fmtd = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  /* ---------- Global refresh helpers ---------- */

  const refreshSidebarBadge = () => {
    document.querySelectorAll('[data-live-badge]').forEach((b) => {
      const n = activeCount();
      b.textContent = n;
      b.classList.toggle('hidden', n === 0);
    });
  };

  const refreshHeaderIndicator = () => {
    const el = document.getElementById('hod-live-header');
    if (!el) return;
    const n = activeCount();
    el.classList.toggle('live-header-link', n > 0);
    el.innerHTML = n > 0
      ? `<i class="fas fa-video"></i> <span class="live-status-dot is-live"></span> ${n} Live`
      : `<i class="fas fa-video"></i> Live Monitoring`;
  };

  const refreshProfileIndicator = () => {
    const el = document.getElementById('hod-live-indicator');
    if (!el) return;
    const active = DB.getActiveSessions();
    if (active.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <a class="btn btn-outline live-header-link" href="hod-live-monitoring.html" style="width:100%;justify-content:flex-start">
        <span class="live-status-dot is-live"></span> ${active.length} live classroom session(s) — monitor now
      </a>
    `;
  };

  const refreshNotifications = () => {
    const list = document.getElementById('notif-list');
    if (!list) return;
    const s = window.Auth && Auth.getSession();
    if (!s) return;
    list.innerHTML = buildNotifications(s);
    const badge = document.getElementById('notif-badge');
    if (badge) {
      const c = list.querySelectorAll('.notif-item').length;
      badge.textContent = c;
      badge.style.display = c ? '' : 'none';
    }
  };

  const refreshAll = () => {
    refreshSidebarBadge();
    refreshHeaderIndicator();
    refreshProfileIndicator();
    if (isOnPage('hod-dashboard.html')) renderDashboardSection();
    if (isOnPage('staff-dashboard.html')) renderStaffPanel();
  };

  /* ---------- Duration ticker (one global interval) ---------- */

  let ticker = null;
  const startTicker = () => {
    if (ticker) return;
    ticker = setInterval(() => {
      document.querySelectorAll('[data-live-duration]').forEach((el) => {
        const start = el.getAttribute('data-live-start');
        if (start) el.textContent = Utils.clock(start);
      });
    }, 1000);
  };

  /* ============================================================
     HOD dashboard section
     ============================================================ */

  const renderDashboardSection = () => {
    const mount = document.getElementById('live-monitoring-section');
    if (!mount) return;
    const active = DB.getActiveSessions();

    if (active.length === 0) {
      mount.innerHTML = `
        <div class="card live-monitor-section">
          <div class="card-header">
            <div class="card-title"><i class="fas fa-video"></i>Live Classroom Monitoring</div>
            <a class="btn btn-sm btn-outline" href="hod-live-monitoring.html"><i class="fas fa-expand"></i> Open Live Monitoring</a>
          </div>
          <div class="live-empty">
            <i class="fas fa-video-slash"></i>
            <h4>No Active Attendance Sessions</h4>
            <p>Live classroom camera sessions started by staff will appear here in real time.</p>
          </div>
        </div>`;
    } else {
      mount.innerHTML = `
        <div class="card live-monitor-section">
          <div class="card-header">
            <div class="card-title"><i class="fas fa-video"></i>Live Classroom Monitoring</div>
            <a class="btn btn-sm btn-primary" href="hod-live-monitoring.html"><i class="fas fa-expand"></i> Open Live Monitoring</a>
          </div>
          <div class="live-active-count"><span>${active.length}</span> active session(s) running now</div>
          <div class="live-card-grid">${active.map((s) => sessionCard({ ...s })).join('')}</div>
        </div>`;
    }
  };

  /* ============================================================
     HOD Live Monitoring page
     ============================================================ */

  let currentMonitorId = null;
  let listSearch = '';

  const openMonitor = (sessionId) => {
    window.location.href = `hod-live-monitoring.html?monitor=${encodeURIComponent(sessionId)}`;
  };

  const matchesSearch = (s) => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return true;
    return (s.subjectName + ' ' + s.subjectCode + ' ' + s.classLabel + ' ' + (s.staffName || '') + ' ' + s.cameraName + ' ' + s.section).toLowerCase().includes(q);
  };

  const recentRow = (s) => `
    <tr>
      <td><strong>${esc(s.classLabel)} AI &amp; DS</strong> <span style="color:var(--gray-500);font-size:12px">Sec ${esc(s.section || '—')}</span></td>
      <td>${esc(s.subjectName)} <span style="color:var(--gray-500);font-size:12px">(${esc(s.subjectCode)})</span></td>
      <td>${esc(s.staffName || '—')}</td>
      <td>Hour ${esc(s.hour)}</td>
      <td>${fmtTime(s.startedAt)}</td>
      <td>
        <strong style="color:var(--secondary)">${s.presentCount || 0}</strong> P ·
        <strong style="color:var(--danger)">${s.absentCount || 0}</strong> A
        <span style="font-size:12px;color:var(--gray-500)">(${s.attendancePercentage || 0}%)</span>
      </td>
      <td>${pill(s.status)}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm btn-outline" onclick="window.LiveAttendance.openMonitor('${esc(s.sessionId)}')"><i class="fas fa-eye"></i> View</button>
      </td>
    </tr>`;

  const applyListFilter = () => {
    const all = DB.getRecentSessions(100);
    const activeGrid = document.getElementById('live-active-grid');
    const recentTbody = document.getElementById('live-recent-tbody');

    if (activeGrid) {
      const activeShown = all.filter((s) => s.status !== 'COMPLETED' && matchesSearch(s));
      activeGrid.innerHTML = activeShown.length
        ? activeShown.map((s) => sessionCard({ ...s })).join('')
        : `<div class="live-empty"><i class="fas fa-search"></i><h4>No active sessions match your search</h4></div>`;
    }
    if (recentTbody) {
      const recentShown = all.filter((s) => s.status === 'COMPLETED' && matchesSearch(s));
      recentTbody.innerHTML = recentShown.length === 0
        ? TableRenderer.emptyState(8, 'No completed sessions yet. Live sessions will appear here once completed.')
        : recentShown.map(recentRow).join('');
    }
  };

  const renderListPage = () => {
    const mount = document.getElementById('app-content');
    if (!mount) return;

    const active = DB.getActiveSessions();

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Live Monitoring</h1>
          <p>Monitor ongoing classroom camera attendance sessions in real time.</p>
        </div>
        <span class="live-inactive-chip"><i class="fas fa-shield-halved"></i> HOD only</span>
      </div>

      <div class="privacy-note"><i class="fas fa-shield-halved"></i> Live classroom monitoring is available only to authorized users. Camera streams are not recorded.</div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-video"></i>Active Attendance Sessions
            <span class="live-active-count" style="margin:0;display:inline-flex;align-items:center;gap:8px">(<span id="live-active-count-n">${active.length}</span> running)</span>
          </div>
        </div>
        ${active.length === 0
          ? `<div class="live-empty"><i class="fas fa-video-slash"></i><h4>No Active Attendance Sessions</h4><p>No live classroom sessions right now.</p></div>`
          : `<div class="live-card-grid" id="live-active-grid">${active.map((s) => sessionCard({ ...s })).join('')}</div>`}
      </div>

      <div class="filters-bar" style="margin-bottom:16px">
        <div class="form-group" style="flex:1">
          <input type="text" class="form-control" id="live-search" placeholder="Search class, subject, camera, staff..." value="${esc(listSearch)}">
        </div>
        <button type="button" class="btn btn-outline" id="live-search-clear"><i class="fas fa-rotate-left"></i> Clear</button>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-clock-rotate-left"></i>Recent Sessions</div>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr><th>Class</th><th>Subject</th><th>Staff</th><th>Hour</th><th>Started</th><th>Attendance</th><th>Status</th><th></th></tr>
            </thead>
            <tbody id="live-recent-tbody">
              ${DB.getRecentSessions(100).filter((s) => s.status === 'COMPLETED').length === 0
                ? TableRenderer.emptyState(8, 'No completed sessions yet. Live sessions will appear here once completed.')
                : DB.getRecentSessions(100).filter((s) => s.status === 'COMPLETED' && matchesSearch(s)).map(recentRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const searchInput = document.getElementById('live-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => { listSearch = searchInput.value; applyListFilter(); });
    }
    const clearBtn = document.getElementById('live-search-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => { listSearch = ''; applyListFilter(); });
  };

  const studentRows = (s) => {
    const students = [...(s.students || [])];
    const q = listSearch.trim().toLowerCase();
    const list = q
      ? students.filter((st) => (st.registerNumber + ' ' + st.name + ' ' + st.section).toLowerCase().includes(q))
      : students;
    if (list.length === 0) return '';
    return list.map((st) => `
      <tr>
        <td>${esc(st.registerNumber)}</td>
        <td><strong>${esc(st.name)}</strong></td>
        <td>${statusBadge(st.status)}</td>
        <td>${escapeHTML(methodLabel(st.method))}</td>
        <td>${fmtTime(st.timestamp)}</td>
      </tr>`).join('');
  };

  const fillMonitorStats = (s) => {
    const statsEl = document.getElementById('monitor-stats');
    if (statsEl) statsEl.innerHTML = countsHtml({ ...s });
    const tbody = document.getElementById('monitor-tbody');
    if (tbody) tbody.innerHTML = studentRows(s);
    const empty = document.getElementById('monitor-empty');
    if (empty) {
      const students = s.students || [];
      const q = listSearch.trim().toLowerCase();
      const visible = q ? students.filter((st) => (st.registerNumber + ' ' + st.name + ' ' + st.section).toLowerCase().includes(q)) : students;
      empty.style.display = visible.length ? 'none' : '';
      empty.innerHTML = visible.length ? '' : `<i class="fas fa-search"></i><h4>No students match your search</h4>`;
    }
    const badge = document.getElementById('monitor-status');
    if (badge) badge.innerHTML = pill(s.status);
    const progressBlock = document.getElementById('monitor-progress');
    if (progressBlock) progressBlock.innerHTML = progressHtml({ ...s });
  };

  const updateCameraUI = (sessionId) => {
    const session = service().getSession(sessionId);
    if (!session) return;
    const video = document.getElementById('monitor-cam');
    const placeholder = document.getElementById('monitor-placeholder');
    const camStatus = document.getElementById('monitor-cam-status');

    const stream = camSvc().getStream(sessionId);
    if (stream && video) {
      camSvc().attachStreamToVideo(sessionId, video);
      if (placeholder) placeholder.style.display = 'none';
    } else if (placeholder) {
      if (video) camSvc().detachStreamFromVideo(sessionId, video);
      placeholder.style.display = 'flex';
      placeholder.style.position = 'absolute';
    }
    if (camStatus) camStatus.innerHTML = camChip(session.camera);
  };

  const renderMonitorPage = (sessionId) => {
    currentMonitorId = sessionId;
    const session = service().getSession(sessionId);
    const mount = document.getElementById('app-content');
    if (!mount) return;

    if (!session) {
      Toast.error('Session not found. It may have been removed.');
      renderListPage();
      return;
    }

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Live Monitor — ${esc(session.subjectName)}</h1>
          <p>${esc(session.classLabel)} AI &amp; DS · Sec ${esc(session.section || '—')} · Hour ${esc(session.hour)}</p>
        </div>
        <button type="button" class="btn btn-outline" onclick="history.back()"><i class="fas fa-arrow-left"></i> Back</button>
      </div>

      <div class="privacy-note"><i class="fas fa-shield-halved"></i> Live classroom monitoring is available only to authorized users. Camera streams are not recorded.</div>

      <div class="monitor-grid">
        <div class="camera-stage">
          <video class="camera-video" id="monitor-cam" autoplay muted playsinline></video>
          <div class="camera-placeholder" id="monitor-placeholder">
            <i class="fas fa-video-slash"></i>
            <h4>Camera Feed Unavailable</h4>
            <p>Waiting for classroom camera connection...</p>
          </div>
          <div class="camera-live-badge" id="monitor-status">${pill(session.status)}</div>
          <div class="camera-footer">
            <span><i class="fas fa-video"></i> <strong>${esc(session.cameraName)}</strong></span>
            <span id="monitor-cam-status">${camChip(session.camera)}</span>
          </div>
        </div>

        <div class="card monitor-side">
          <div class="live-card-classline">Session Overview</div>
          <div class="monitor-info">${monitorInfoRows({ ...session })}</div>
          <div id="monitor-progress">${progressHtml({ ...session })}</div>
          <div class="monitor-stats" id="monitor-stats">${countsHtml({ ...session })}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-users"></i>Student Activity <span style="color:var(--gray-500);font-size:12px;font-weight:500">${session.totalStudents} student(s)</span></div>
          <input type="text" class="form-control" id="monitor-search" placeholder="Search register no / name..." style="max-width:280px">
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Register No</th><th>Name</th><th>Status</th><th>Source</th><th>Marked At</th></tr></thead>
            <tbody id="monitor-tbody"></tbody>
          </table>
        </div>
        <div class="live-empty" id="monitor-empty" style="display:none"></div>
      </div>
    `;

    fillMonitorStats({ ...session });
    startTicker();

    // Attempt the classroom camera connection (honest: no stream yet in
    // this frontend-only build). A backend may supply a real stream via
    // CameraService.receiveStream() / attachStreamToVideo().
    camSvc().connectCamera(sessionId, session.cameraId).then(() => updateCameraUI(sessionId));

    const search = document.getElementById('monitor-search');
    if (search) search.addEventListener('input', () => {
      listSearch = search.value;
      fillMonitorStats(service().getSession(sessionId) || session);
    });
  };

  const renderPage = () => {
    if (!Auth.protectPage('hod.live-monitoring', 'Live Monitoring')) return;
    AppLayout.init('hod-live-monitoring.html');
    const params = new URLSearchParams(window.location.search);
    const id = params.get('monitor');
    if (id) renderMonitorPage(id); else renderListPage();
    refreshSidebarBadge();
    refreshHeaderIndicator();
  };

  /* ============================================================
     Staff live-session control panel
     ============================================================ */

  const renderStaffPanel = () => {
    const mount = document.getElementById('staff-live-panel');
    if (!mount) return;
    const s = window.Auth && Auth.getSession();
    if (!s || !s.person || s.role !== 'Staff') return;
    const personId = s.person.id;

    const mine = DB.getActiveSessions().filter((x) => x.staffId === personId);
    if (mine.length === 0) { mount.innerHTML = ''; return; }

    const session = mine[0];

    mount.innerHTML = `
      <div class="card live-monitor-section" style="margin-bottom:20px" data-staff-session="${esc(session.sessionId)}">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-video"></i>Live Classroom Session ${pill(session.status)}</div>
          <span class="text-muted" style="font-size:13px">Attendance is recorded in real time.</span>
        </div>
        <div class="staff-live-alert">
          <i class="fas fa-circle-info"></i>
          <span class="staff-live-tier">${session.subjectName} (${session.subjectCode}) · ${esc(session.classLabel)} AI &amp; DS · Sec ${esc(session.section || '—')} · Room ${esc(session.room || '—')} · ${esc(session.cameraName)} ${camChip(session.camera)}</span>
          <span style="margin-left:auto" class="live-duration" data-live-duration data-live-start="${esc(session.startedAt)}">${Utils.clock(session.startedAt)}</span>
        </div>
        <div class="staff-live-grid">
          <div>
            <div class="monitor-info" style="margin-bottom:14px">
              <div class="row"><i class="fas fa-clock"></i><span class="k">Hour</span><span class="v">Hour ${esc(session.hour)}</span></div>
              <div class="row"><i class="fas fa-stopwatch"></i><span class="k">Started</span><span class="v">${fmtTime(session.startedAt)}</span></div>
            </div>
            ${countsHtml({ ...session })}
            <div style="margin-top:14px">${progressHtml({ ...session })}</div>
          </div>
          <div class="staff-live-right">
            <div class="card" style="margin:0">
              <div class="card-header">
                <div class="card-title"><i class="fas fa-users"></i>Student Activity</div>
              </div>
              <div class="table-responsive" style="max-height:320px;overflow:auto">
                <table class="table">
                  <thead><tr><th>Register No</th><th>Name</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    ${(session.students || []).map((st) => `
                      <tr data-student-row="${esc(st.studentId)}">
                        <td>${esc(st.registerNumber)}</td>
                        <td><strong>${esc(st.name)}</strong></td>
                        <td id="stu-status-${esc(st.studentId)}">${statusBadge(st.status)}</td>
                        <td class="actions">
                          <button type="button" class="live-toggle present ${st.status === 'present' ? 'is-active' : ''}" data-set-status="present" data-student-id="${esc(st.studentId)}">Present</button>
                          <button type="button" class="live-toggle absent ${st.status === 'absent' ? 'is-active' : ''}" data-set-status="absent" data-student-id="${esc(st.studentId)}">Absent</button>
                        </td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </div>
            <div class="staff-live-actions">
              <button type="button" class="btn btn-danger" data-end-session><i class="fas fa-stop"></i> End Session</button>
              <span style="font-size:12px;color:var(--gray-500)">Marked students keep their status; pending become absent.</span>
            </div>
          </div>
        </div>
      </div>
    `;
    startTicker();
  };

  const wireStaffPanel = () => {
    const mount = document.getElementById('staff-live-panel');
    if (!mount) return;

    mount.addEventListener('click', (e) => {
      const statusBtn = e.target.closest('[data-set-status]');
      const endBtn = e.target.closest('[data-end-session]');
      if (!statusBtn && !endBtn) return;

      const panel = mount.querySelector('[data-staff-session]');
      const sessionId = panel && panel.getAttribute('data-staff-session');
      if (!sessionId) return;

      if (statusBtn) {
        const studentId = statusBtn.getAttribute('data-student-id');
        const status = statusBtn.getAttribute('data-set-status');
        const session = service().getSession(sessionId);
        if (!session) { Toast.error('Session no longer active.'); renderStaffPanel(); return; }

        const current = (session.students || []).find((st) => st.studentId === studentId);
        if (current && current.status === status) return; // no-op

        service().recordAttendanceEvent(sessionId, studentId, status);
        renderStaffPanel();
        refreshAll();
        return;
      }

      if (endBtn) {
        Confirm.show({
          title: 'End live attendance session?',
          message: `This will stop the live session for ${session.subjectName} (${session.classLabel} AI & DS). Students still pending will be marked absent and the attendance will be saved.`,
          confirmText: 'End Session',
          confirmClass: 'btn-danger',
          onConfirm: () => {
            const done = service().endSession(sessionId);
            if (done) Toast.success('Session ended and attendance saved.');
            renderStaffPanel();
            refreshAll();
            if (window.StaffApp && StaffApp.renderDashboard) StaffApp.renderDashboard();
          }
        });
      }
    });
  };

  /* ============================================================
     Start camera attendance session (Staff)
     ============================================================ */

  const openStartSessionModal = (classId, subjectCode, room) => {
    if (!window.Auth || !Auth.getSession() || Auth.getRole() !== 'Staff') return;
    const person = Auth.getSession().person;

    const cls = DB.getClasses().find((c) => c.id === classId);
    const label = classLabel(classId);
    const sections = DB.getSections();
    const subject = DB.getSubjects().find((s) => s.code === (subjectCode || '').toUpperCase());
    const hours = ['1', '2', '3', '4', '5', '6', '7', '8'];

    Modal.open({
      title: 'Start Camera Attendance',
      body: `
        <div class="staff-live-alert" style="margin:0 0 16px">
          <i class="fas fa-circle-info"></i> Starting a live classroom session connects the classroom camera. Only authorized staff can start or manage it.
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Class</label>
            <input type="text" class="form-control" value="${esc(label)} AI &amp; DS" disabled>
          </div>
          <div class="form-group">
            <label>Section</label>
            <select class="form-control" id="ls-section">${sections.map((sec) => `<option value="${esc(sec)}">Sec ${esc(sec)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" class="form-control" value="${esc((subject && subject.name) || subjectCode || '')}" disabled>
          </div>
          <div class="form-group">
            <label>Hour</label>
            <select class="form-control" id="ls-hour">${hours.map((h) => `<option value="${h}">Hour ${h}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label>Room</label>
            <input type="text" class="form-control" id="ls-room" value="${esc(room || '')}">
          </div>
          <div class="form-group">
            <label>Classroom Camera</label>
            <select class="form-control" id="ls-camera">
              ${[1, 2, 3, 4].map((i) => `<option value="cam-classroom-0${i}">Classroom Camera 0${i}</option>`).join('')}
            </select>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()"><i class="fas fa-xmark"></i> Cancel</button>
        <button class="btn btn-primary" id="ls-start"><i class="fas fa-video"></i> Start Live Session</button>
      `
    });

    document.getElementById('ls-start').addEventListener('click', () => {
      const section = document.getElementById('ls-section').value;
      const hour = document.getElementById('ls-hour').value;
      const cameraId = document.getElementById('ls-camera').value;
      const roomVal = (document.getElementById('ls-room').value || room || '').trim();

      const startBtn = document.getElementById('ls-start');
      Buttons.loading(startBtn, 'Starting session...');

      const students = DB.getStudents()
        .filter((st) => st.year === classId && st.section === section)
        .map((st) => ({ studentId: st.id, registerNumber: st.registerNumber, name: st.name, section: st.section, status: 'pending', timestamp: null, method: null }));

      const payload = {
        staffId: person.id,
        staffName: person.name,
        classId,
        classLabel: label,
        section,
        subjectCode: (subjectCode || '').toUpperCase(),
        subjectName: subject ? subject.name : subjectCode,
        hour,
        room: roomVal,
        cameraId,
        cameraName: `Classroom Camera ${(parseInt(cameraId.slice(-1), 10) || 1).toString().padStart(2, '0')}`,
        students,
        date: Utils.todayISO()
      };

      const session = service().startSession(payload);
      if (!session) {
        Buttons.reset(startBtn);
        Toast.error('A live session for this class, subject and hour is already running.');
        return;
      }

      // Session is live the moment the staff starts it; the classroom
      // camera remains disconnected until a real stream is available.
      service().setCameraStatus(session.sessionId, 'disconnected', 'Waiting for classroom camera connection…');
      service().setSessionStatus(session.sessionId, 'LIVE');

      Modal.close();
      Toast.success(`Live session started — ${session.subjectName} (${session.classLabel} AI & DS).`);
      refreshAll();
      if (isOnPage('staff-dashboard.html')) renderStaffPanel();
    });
  };

  /* ============================================================
     Event handling + boot
     ============================================================ */

  const handleEvent = (name, payload) => {
    refreshAll();

    if (isOnPage('hod-live-monitoring.html')) {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('monitor');
      if (id && id === currentMonitorId) {
        const session = service().getSession(id);
        if (session) {
          fillMonitorStats(session);
          updateCameraUI(id);
          if (session.status === 'COMPLETED') {
            Toast.info('This session has been completed.');
            setTimeout(() => { window.location.href = 'hod-live-monitoring.html'; }, 1200);
          }
        }
      } else {
        const countEl = document.getElementById('live-active-count-n');
        if (countEl) countEl.textContent = DB.getActiveSessions().length;
        applyListFilter();
      }
    }

    if (name === 'session.started' || name === 'session.completed') {
      refreshNotifications();
      if (name === 'session.started' && payload && payload.sessionId) {
        Toast.success(`${payload.subjectName} (${payload.classLabel}) is now live on ${payload.cameraName}.`);
      }
      if (name === 'session.completed' && payload && payload.sessionId) {
        Toast.success(`${payload.subjectName} (${payload.classLabel}) completed — ${payload.presentCount} present, ${payload.absentCount} absent.`);
      }
    }
  };

  const init = () => {
    const role = window.Auth ? Auth.getRole() : null;
    if (!role || role === 'Student') return; // students are excluded from monitoring

    window.RealtimeService && RealtimeService.connect();
    startTicker();

    const svc = service();
    if (svc) {
      svc.subscribe('session.started', (p) => handleEvent('session.started', p));
      svc.subscribe('session.completed', (p) => handleEvent('session.completed', p));
      svc.subscribe('attendance.updated', (p) => handleEvent('attendance.updated', p));
      svc.subscribe('camera.status', (p) => handleEvent('camera.status', p));
      svc.subscribe('session.notification', (p) => handleEvent('session.notification', p));
    }

    wireStaffPanel();

    if (isOnPage('hod-dashboard.html')) renderDashboardSection();
    else if (isOnPage('staff-dashboard.html')) renderStaffPanel();
    else if (isOnPage('hod-live-monitoring.html')) renderPage();

    refreshSidebarBadge();
    refreshHeaderIndicator();
    refreshProfileIndicator();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    openStartSessionModal,
    openMonitor,
    renderHodProfileIndicator: refreshProfileIndicator,
    renderDashboardSection
  };
})();