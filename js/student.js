/* ============================================================
   Student Module
   ------------------------------------------------------------
   Handles the Student Dashboard, My Attendance and Attendance
   History views for the Student role.

   Students can only VIEW their own attendance. They cannot
   mark, edit or delete attendance.
   ============================================================ */

const StudentApp = (() => {

  const session = () => Auth.getSession();

  const isOnPage = (file) => window.location.pathname.split('/').pop() === file;

  /* ---------- Aggregation helpers ---------- */

  const attendanceStats = (records) => {
    const stats = { total: records.length, present: 0, absent: 0, late: 0 };
    records.forEach((r) => {
      if (stats[r.status] !== undefined) stats[r.status] += 1;
    });
    stats.presentCount = stats.present + stats.late; // present or late count as attended for percentage
    stats.percentage = Utils.percentage(stats.presentCount, stats.total);
    return stats;
  };

  const subjectWise = (records) => {
    const map = {};
    records.forEach((r) => {
      if (!map[r.subjectCode]) map[r.subjectCode] = { subject: r.subjectName, code: r.subjectCode, total: 0, present: 0, absent: 0, late: 0 };
      map[r.subjectCode].total += 1;
      map[r.subjectCode][r.status] += 1;
    });
    return Object.values(map).map((s) => {
      s.percentage = Utils.percentage(s.present + s.late, s.total);
      return s;
    });
  };

  /* ---------- Ring drawing ---------- */

  const drawRing = (el, pct) => {
    el.style.background = `conic-gradient(${Utils.pctColor(pct)} ${pct * 3.6}deg, var(--gray-100) 0deg)`;
    el.innerHTML = `
      <div class="ring-value">${pct}%</div>
      <span class="ring-label">Attendance</span>
    `;
  };

  /* ---------- Shared layout init ---------- */

  const initLayout = () => {
    AppLayout.init('student-dashboard.html');
  };

  /* ---------- Dashboard ---------- */

  const renderDashboard = () => {
    if (!Auth.protectPage('student.dashboard', 'Student Dashboard')) return;
    initLayout();

    const s = session();
    const person = s.person;
    if (!person) return;

    const records = DB.getStudentAttendance(person.id) || [];

    const stats = attendanceStats(records);

    document.getElementById('welcome').textContent = `Hello, ${person.name.split(' ')[0]}!`;
    document.getElementById('student-subtitle').textContent =
      `${person.registerNumber} · ${person.department} · ${person.year} Year · Semester ${person.semester} · Section ${person.section}`;

    // Stat cards
    document.getElementById('stat-grid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon i-primary"><i class="fas fa-clipboard-check"></i></div>
        <div class="stat-info">
          <h3>${stats.percentage}%</h3>
          <p>Overall Attendance</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-gray"><i class="fas fa-calendar-day"></i></div>
        <div class="stat-info">
          <h3>${stats.total}</h3>
          <p>Total Classes</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-success"><i class="fas fa-user-check"></i></div>
        <div class="stat-info">
          <h3>${stats.present + stats.late}</h3>
          <p>Present</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-danger"><i class="fas fa-user-xmark"></i></div>
        <div class="stat-info">
          <h3>${stats.absent}</h3>
          <p>Absent</p>
        </div>
      </div>
    `;

    drawRing(document.getElementById('attendance-ring'), stats.percentage);
    const threshold = stats.percentage >= 75;
    document.getElementById('ring-subtitle').textContent = stats.total === 0
      ? 'No attendance records yet.'
      : threshold
        ? 'Above the 75% attendance threshold. Well done!'
        : 'Below the 75% attendance threshold. Please attend more classes.';

    // Subject-wise
    const subjectRows = subjectWise(records);
    const tbody = document.querySelector('#subject-attendance-table tbody');
    tbody.innerHTML = subjectRows.length ? subjectRows.map((s) => {
      const st = Utils.pctStatus(s.percentage);
      return `
        <tr>
          <td><strong>${esc(s.subject)}</strong></td>
          <td>${s.total}</td>
          <td class="text-success">${s.present + s.late}</td>
          <td class="text-danger">${s.absent}</td>
          <td>
            <span class="attendance-pct" style="color:${Utils.pctColor(s.percentage)}">${s.percentage}%</span>
            <div class="progress mt-10"><div class="progress-bar ${s.percentage < 75 ? (s.percentage < 75 ? 'danger' : 'warning') : ''}" style="width:${s.percentage}%"></div></div>
          </td>
          <td><span class="badge ${st.cls}">${st.text}</span></td>
        </tr>
      `;
    }).join('') : TableRenderer.emptyState(6, 'No Attendance Records');

    // Recent attendance (last 8)
    const recent = [...records].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
    const recentBody = document.querySelector('#recent-attendance-table tbody');
    recentBody.innerHTML = recent.length ? recent.map((r) => {
      const st = Utils.statusInfo(r.status);
      const staffName = DB.getStaff().find((f) => f.id === r.staffId)?.name || '—';
      return `
        <tr>
          <td><span class="status-dot ${st.dot}"></span>${esc(Utils.formatDate(r.date))}</td>
          <td><strong>${esc(r.subjectName)}</strong></td>
          <td>Hour ${r.hour.replace('H', '')}</td>
          <td>${esc(staffName)}</td>
          <td><span class="badge ${st.cls}">${st.label}</span></td>
        </tr>
      `;
    }).join('') : TableRenderer.emptyState(5, 'No Attendance Records');
  };

  /* ---------- My Attendance (view) ---------- */

  const renderMyAttendance = () => {
    if (!Auth.protectPage('attendance.view', 'My Attendance')) return;
    AppLayout.init('attendance.html');
    const s = session();
    const person = s.person;
    const records = DB.getStudentAttendance(person.id);
    const stats = attendanceStats(records);

    // Build page content inside app-content if present; otherwise the page has its own markup.
    // attendance.html loads this function.
    const mount = document.getElementById('app-content');
    if (!mount) return;

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>My Attendance</h1>
          <p>View-only. Attendance is marked by your staff.</p>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-icon i-primary"><i class="fas fa-percent"></i></div>
          <div class="stat-info"><h3>${stats.percentage}%</h3><p>Overall Attendance</p></div></div>
        <div class="stat-card"><div class="stat-icon i-gray"><i class="fas fa-calendar-day"></i></div>
          <div class="stat-info"><h3>${stats.total}</h3><p>Total Classes</p></div></div>
        <div class="stat-card"><div class="stat-icon i-success"><i class="fas fa-user-check"></i></div>
          <div class="stat-info"><h3>${stats.present + stats.late}</h3><p>Present</p></div></div>
        <div class="stat-card"><div class="stat-icon i-danger"><i class="fas fa-user-xmark"></i></div>
          <div class="stat-info"><h3>${stats.absent}</h3><p>Absent</p></div></div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-book-open"></i>Subject-wise Attendance</div>
        </div>
        <div class="table-responsive">
          <table class="table" id="att-view-table">
            <thead><tr><th>Subject</th><th>Total Classes</th><th>Present</th><th>Absent</th><th>Percentage</th><th>Status</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    const rows = subjectWise(records);
    document.querySelector('#att-view-table tbody').innerHTML = rows.length ? rows.map((x) => {
      const st = Utils.pctStatus(x.percentage);
      return `
        <tr>
          <td><strong>${esc(x.subject)}</strong> <span class="badge badge-gray">${esc(x.code)}</span></td>
          <td>${x.total}</td>
          <td class="text-success">${x.present + x.late}</td>
          <td class="text-danger">${x.absent}</td>
          <td style="min-width:140px">
            <span class="attendance-pct" style="color:${Utils.pctColor(x.percentage)}">${x.percentage}%</span>
            <div class="progress mt-10"><div class="progress-bar" style="width:${x.percentage}%;background:${Utils.pctColor(x.percentage)}"></div></div>
          </td>
          <td><span class="badge ${st.cls}">${st.text}</span></td>
        </tr>
      `;
    }).join('') : TableRenderer.emptyState(6, 'No Attendance Records');
  };

  /* ---------- Attendance History ---------- */

  const renderHistory = () => {
    if (!Auth.protectPage('attendance.view', 'Attendance History')) return;
    AppLayout.init('attendance.html?view=history');

    const s = session();
    const person = s.person;
    const all = DB.getStudentAttendance(person.id).sort((a, b) => (a.date < b.date ? 1 : -1));

    const mount = document.getElementById('app-content');
    if (!mount) return;

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Attendance History</h1>
          <p>${person.registerNumber} · ${person.name}</p>
        </div>
      </div>

      <div class="filters-bar" id="history-filters">
        <div class="form-group">
          <label for="hf-date">Date</label>
          <input type="date" class="form-control" id="hf-date">
        </div>
        <div class="form-group">
          <label for="hf-subject">Subject</label>
          <select class="form-control" id="hf-subject">
            <option value="">All Subjects</option>
          </select>
        </div>
        <div class="form-group">
          <label for="hf-status">Status</label>
          <select class="form-control" id="hf-status">
            <option value="">All Status</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
          </select>
        </div>
        <div class="form-group">
          <label for="hf-search">Search</label>
          <input type="text" class="form-control" id="hf-search" placeholder="Subject, staff...">
        </div>
        <button class="btn btn-primary" id="hf-apply"><i class="fas fa-filter"></i> Apply</button>
        <button class="btn btn-outline" id="hf-reset"><i class="fas fa-rotate"></i> Reset</button>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-clock-rotate-left"></i>Records</div>
          <span class="text-muted" id="hist-count"></span>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="cursor:pointer" data-sort="date">Date <i class="fas fa-sort" style="font-size:10px;color:var(--gray-300)"></i></th>
                <th style="cursor:pointer" data-sort="subjectName">Subject <i class="fas fa-sort" style="font-size:10px;color:var(--gray-300)"></i></th>
                <th data-sort="hour">Hour</th>
                <th data-sort="staff">Staff</th>
                <th data-sort="status">Status</th>
              </tr>
            </thead>
            <tbody id="history-tbody"></tbody>
          </table>
        </div>
        <div id="history-pagination"></div>
      </div>
    `;

    // Fill subject options
    const subjects = [...new Set(all.map((r) => r.subjectName))];
    document.getElementById('hf-subject').innerHTML += subjects.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');

    let filtered = [...all];
    let page = 1;
    const PER_PAGE = 12;
    let sortKey = 'date';
    let sortDir = -1;

    const applyFilters = () => {
      const date = document.getElementById('hf-date').value;
      const subject = document.getElementById('hf-subject').value;
      const status = document.getElementById('hf-status').value;
      const search = document.getElementById('hf-search').value.trim().toLowerCase();

      filtered = all.filter((r) => {
        if (date && r.date !== date) return false;
        if (subject && r.subjectName !== subject) return false;
        if (status && r.status !== status) return false;
        if (search) {
          const staffName = (DB.getStaff().find((f) => f.id === r.staffId)?.name || '').toLowerCase();
          if (!r.subjectName.toLowerCase().includes(search) && !staffName.includes(search)) return false;
        }
        return true;
      });
      page = 1;
      renderTable();
    };

    const renderTable = () => {
      const tbody = document.getElementById('history-tbody');

      const list = [...filtered].sort((a, b) => {
        if (sortKey === 'date') return sortDir * (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        if (sortKey === 'hour') return sortDir * a.hour.localeCompare(b.hour);
        if (sortKey === 'staff') {
          const sa = DB.getStaff().find((f) => f.id === a.staffId)?.name || '';
          const sb = DB.getStaff().find((f) => f.id === b.staffId)?.name || '';
          return sortDir * sa.localeCompare(sb);
        }
        return sortDir * String(a[sortKey]).localeCompare(String(b[sortKey]));
      });

      const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
      const rows = Utils.paginate(list, page, PER_PAGE);

      document.getElementById('hist-count').textContent = `${list.length} record(s)`;

      if (rows.length === 0) {
        tbody.innerHTML = TableRenderer.emptyState(5, 'No Attendance Records');
      } else {
        tbody.innerHTML = rows.map((r) => {
          const st = Utils.statusInfo(r.status);
          const staffName = DB.getStaff().find((f) => f.id === r.staffId)?.name || '—';
          return `
            <tr>
              <td><span class="status-dot ${st.dot}"></span>${esc(Utils.formatDate(r.date))}</td>
              <td><strong>${esc(r.subjectName)}</strong></td>
              <td>Hour ${r.hour.replace('H', '')}</td>
              <td>${esc(staffName)}</td>
              <td><span class="badge ${st.cls}">${st.label}</span></td>
            </tr>
          `;
        }).join('');
      }

      const pagEl = document.getElementById('history-pagination');
      pagEl.innerHTML = TableRenderer.paginationHtml({ page, pages, total: list.length, perPage: PER_PAGE });
      TableRenderer.attachPagination(pagEl, (p) => { page = p; renderTable(); });
    };

    document.getElementById('hf-apply').addEventListener('click', applyFilters);
    document.getElementById('hf-reset').addEventListener('click', () => {
      document.getElementById('hf-date').value = '';
      document.getElementById('hf-subject').value = '';
      document.getElementById('hf-status').value = '';
      document.getElementById('hf-search').value = '';
      applyFilters();
    });

    // Sorting listeners
    document.getElementById('history-tbody').closest('table').querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortDir = -sortDir;
        } else {
          sortKey = key;
          sortDir = key === 'date' ? -1 : 1;
        }
        renderTable();
      });
    });

    renderTable();
  };

  /* ---------- Router for attendance.html ---------- */

  const initAttendancePage = () => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'history') renderHistory();
    else renderMyAttendance();
  };

  /* ---------- Boot based on current page ---------- */

  const init = () => {
    if (Auth.getRole() === 'Student' && isOnPage('student-dashboard.html')) {
      renderDashboard();
    }
    // NOTE: attendance.html routing is handled by the page's inline role router.
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { renderDashboard, renderMyAttendance, renderHistory, initAttendancePage };
})();

window.StudentApp = StudentApp;