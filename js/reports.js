/* ============================================================
   Reports Module
   ------------------------------------------------------------
   Role-aware reporting for Staff and HOD. Supports Daily,
   Weekly, Monthly, Student, Class, Subject, Staff and
   Department-wise report types with CSV/Excel/Print export
   and Chart.js visualisations.
   ============================================================ */

const ReportsApp = (() => {

  const init = () => {
    const s = Auth.getSession();
    if (!s) { window.location.href = 'index.html'; return; }
    if (!Auth.protectPage('reports', 'Reports')) return;

    AppLayout.init('reports.html');

    const mount = document.getElementById('app-content');
    if (!mount) return;

    const isHOD = s.role === 'HOD';

    const reportTypes = [
      { value: 'daily', label: 'Daily Attendance', icon: 'fa-calendar-day' },
      { value: 'weekly', label: 'Weekly Attendance', icon: 'fa-calendar-week' },
      { value: 'monthly', label: 'Monthly Attendance', icon: 'fa-calendar-alt' },
      { value: 'student', label: 'Student-wise', icon: 'fa-user-graduate' },
      { value: 'class', label: 'Class-wise', icon: 'fa-school' },
      { value: 'subject', label: 'Subject-wise', icon: 'fa-book-open' },
      { value: 'staff', label: 'Staff-wise', icon: 'fa-user-tie' },
      { value: 'department', label: 'Department-wise', icon: 'fa-building-columns' },
      { value: 'staffattendance', label: 'Staff Attendance', icon: 'fa-clipboard-user' }
    ];

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Reports</h1>
          <p>Generate and export attendance reports for your ${s.role === 'HOD' ? 'department' : 'assigned classes'}.</p>
        </div>
      </div>

      <div class="filters-bar">
        <div class="form-group">
          <label for="rp-type">Report Type <span class="required">*</span></label>
          <select class="form-control" id="rp-type">
            ${reportTypes.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="rp-from">From</label>
          <input type="date" class="form-control" id="rp-from">
        </div>
        <div class="form-group">
          <label for="rp-to">To</label>
          <input type="date" class="form-control" id="rp-to">
        </div>
        <div class="form-group">
          <label for="rp-class">Class</label>
          <select class="form-control" id="rp-class">
            <option value="">All Classes</option>
            ${DB.getClasses().map((c) => `<option value="${esc(c.id)}">${esc(c.id === 'I' ? 'I' : c.id === 'II' ? 'II' : c.id === 'III' ? 'III' : 'IV')} Sem</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="rp-subject">Subject</label>
          <select class="form-control" id="rp-subject">
            <option value="">All Subjects</option>
            ${DB.getSubjects().map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        ${isHOD ? `
        <div class="form-group">
          <label for="rp-staff">Staff</label>
          <select class="form-control" id="rp-staff">
            <option value="">All Staff</option>
            ${DB.getStaff().map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="rp-dept-wrap" style="display:none">
          <label for="rp-dept">Department</label>
          <select class="form-control" id="rp-dept">
            <option value="">All Departments</option>
            ${[...new Set(DB.getStaff().map((f) => f.department))].filter(Boolean).map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="rp-desig-wrap" style="display:none">
          <label for="rp-desig">Designation</label>
          <select class="form-control" id="rp-desig">
            <option value="">All Designations</option>
            ${[...new Set(DB.getStaff().map((f) => f.designation))].filter(Boolean).map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
          </select>
        </div>` : ''}
        <button class="btn btn-primary" id="rp-generate"><i class="fas fa-file-contract"></i> Generate Report</button>
      </div>

      <div class="card" id="rp-toolbar" style="display:none">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-chart-pie"></i><span id="rp-title"></span></div>
          <div class="flex items-center gap-10 no-print">
            <button class="btn btn-outline btn-sm" id="rp-csv"><i class="fas fa-file-csv"></i> Export CSV</button>
            <button class="btn btn-outline btn-sm" id="rp-excel"><i class="fas fa-file-excel"></i> Export Excel</button>
            <button class="btn btn-outline btn-sm" id="rp-print"><i class="fas fa-print"></i> Print</button>
          </div>
        </div>
        <div id="rp-summary" class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:0"></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-bottom:20px" id="rp-charts-wrap" class="no-print"></div>

      <div class="card" id="rp-table-card" style="display:none">
        <div class="table-responsive">
          <table class="table table-cards" id="rp-table"></table>
        </div>
      </div>

      <div class="card" id="rp-empty" style="display:none">
        <div class="empty-state">
          <i class="fas fa-file-import"></i>
          <h4 id="rp-empty-title">No report generated yet</h4>
          <p id="rp-empty-msg">Select your filters above and click <strong>Generate Report</strong>.</p>
        </div>
      </div>
    `;

    // Prefill date range: last 30 days → today
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 90);
    document.getElementById('rp-from').value = from.toISOString().slice(0, 10);
    document.getElementById('rp-to').value = today.toISOString().slice(0, 10);

    // Restrict report types per role
    if (!isHOD) {
      document.getElementById('rp-type').innerHTML = reportTypes
        .filter((t) => ['daily', 'weekly', 'monthly', 'student', 'class', 'subject'].includes(t.value))
        .map((t) => `<option value="${t.value}">${t.label}</option>`).join('');
    }

    document.getElementById('rp-generate').addEventListener('click', generate);
    document.getElementById('rp-print').addEventListener('click', () => window.print());
    document.getElementById('rp-csv').addEventListener('click', exportCsv);
    document.getElementById('rp-excel').addEventListener('click', exportExcel);

    // Staff Attendance filters (department / designation) only visible for that report type
    const toggleStaffAttFilters = () => {
      const show = document.getElementById('rp-type').value === 'staffattendance';
      const deptWrap = document.getElementById('rp-dept-wrap');
      const desigWrap = document.getElementById('rp-desig-wrap');
      if (deptWrap) deptWrap.style.display = show ? 'block' : 'none';
      if (desigWrap) desigWrap.style.display = show ? 'block' : 'none';
    };
    document.getElementById('rp-type').addEventListener('change', toggleStaffAttFilters);
    toggleStaffAttFilters();

    let currentReport = null;

    function getData() {
      const from = document.getElementById('rp-from').value;
      const to = document.getElementById('rp-to').value || Utils.todayISO();
      const classId = document.getElementById('rp-class').value;
      const subjectCode = document.getElementById('rp-subject').value;
      const staffFilter = isHOD ? document.getElementById('rp-staff').value : s.person.id;

      let recs = DB.getAttendance();
      if (from) recs = recs.filter((r) => r.date >= from);
      if (to) recs = recs.filter((r) => r.date <= to);
      if (classId) recs = recs.filter((r) => r.classId === classId);
      if (subjectCode) recs = recs.filter((r) => r.subjectCode === subjectCode);
      if (staffFilter) recs = recs.filter((r) => r.staffId === staffFilter);
      return recs;
    }

    function generate() {
      const type = document.getElementById('rp-type').value;

      if (type === 'staffattendance') {
        generateStaffAttendance();
        return;
      }

      const recs = getData();
      let columns, rows;

      const stat = (list) => {
        const p = list.filter((r) => r.status === 'present').length;
        const a = list.filter((r) => r.status === 'absent').length;
        const l = list.filter((r) => r.status === 'late').length;
        const tot = p + a + l;
        return { p, a, l, tot, pct: Utils.percentage(p + l, tot) };
      };

      const groupKey = {
        daily: (r) => r.date,
        weekly: (r) => {
          const d = new Date(r.date);
          const day = d.getDay();
          const monday = new Date(d);
          monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
          return monday.toISOString().slice(0, 10);
        },
        monthly: (r) => r.date.slice(0, 7),
        student: (r) => r.studentId,
        class: (r) => r.classId,
        subject: (r) => r.subjectCode,
        staff: (r) => r.staffId,
        department: (r) => 'AI&DS'
      }[type];

      const labelFor = {
        daily: (k) => Utils.formatDate(k),
        weekly: (k) => `Week of ${Utils.formatDate(k)}`,
        monthly: (k) => {
          const [y, m] = k.split('-');
          return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10) - 1]} ${y}`;
        },
        student: (k) => {
          const st = DB.getStudents().find((x) => x.id === k);
          return st ? `${st.registerNumber} - ${st.name}` : k;
        },
        class: (k) => `${k} Sem AI & DS`,
        subject: (k) => {
          const x = DB.getSubjects().find((z) => z.code === k);
          return x ? x.name : k;
        },
        staff: (k) => {
          const f = DB.getStaff().find((x) => x.id === k);
          return f ? f.name : k;
        },
        department: () => 'AI & Data Science Department'
      };

      if (type === 'daily') {
        columns = ['Date', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
        const map = {};
        recs.forEach((r) => { if (!map[r.date]) map[r.date] = []; map[r.date].push(r); });
        rows = Object.keys(map).sort().reverse().map((k) => {
          const z = stat(map[k]);
          return { label: labelFor.daily(k), cells: [Utils.formatDate(k), z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct };
        });
      } else if (type === 'weekly') {
        columns = ['Week', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
        const map = {};
        recs.forEach((r) => { const k = groupKey(r); if (!map[k]) map[k] = []; map[k].push(r); });
        rows = Object.keys(map).sort().reverse().map((k) => {
          const z = stat(map[k]);
          return { label: labelFor.weekly(k), cells: [utils_display(labelFor.weekly(k)), z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct };
        });
      } else if (type === 'monthly') {
        const map = {};
        recs.forEach((r) => { const k = groupKey(r); if (!map[k]) map[k] = []; map[k].push(r); });
        rows = Object.keys(map).sort().reverse().map((k) => {
          const z = stat(map[k]);
          return { label: labelFor.monthly(k), cells: [labelFor.monthly(k), z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct };
        });
        columns = ['Month', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
      } else if (type === 'student') {
        columns = ['Student', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
        const map = {};
        recs.forEach((r) => { const k = groupKey(r); if (!map[k]) map[k] = []; map[k].push(r); });
        rows = Object.values(Object.entries(map)).map(([k, list]) => {
          const z = stat(list);
          return { label: labelFor.student(k), cells: [labelFor.student(k), z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct };
        }).sort((a, b) => a.pct - b.pct);
      } else if (type === 'class') {
        columns = ['Class', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
        const map = {};
        recs.forEach((r) => { const k = groupKey(r); if (!map[k]) map[k] = []; map[k].push(r); });
        rows = Object.keys(map).map((k) => {
          const z = stat(map[k]);
          return { label: labelFor.class(k), cells: [labelFor.class(k), z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct };
        });
      } else if (type === 'subject') {
        columns = ['Subject', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
        const map = {};
        recs.forEach((r) => { const k = groupKey(r); if (!map[k]) map[k] = []; map[k].push(r); });
        rows = Object.keys(map).map((k) => {
          const z = stat(map[k]);
          return { label: labelFor.subject(k), cells: [labelFor.subject(k), z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct };
        });
      } else if (type === 'staff') {
        columns = ['Staff', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
        const map = {};
        recs.forEach((r) => { const k = groupKey(r); if (!map[k]) map[k] = []; map[k].push(r); });
        rows = Object.keys(map).map((k) => {
          const z = stat(map[k]);
          return { label: labelFor.staff(k), cells: [labelFor.staff(k), z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct };
        });
      } else {
        columns = ['Department', 'Present', 'Absent', 'Late', 'Total', 'Percentage'];
        const z = stat(recs);
        rows = [{ label: 'AI & Data Science', cells: ['AI & Data Science', z.p, z.a, z.l, z.tot, `${z.pct}%`], pct: z.pct }];
      }

      currentReport = { type, columns, rows, recs };

      if (recs.length === 0) {
        document.getElementById('rp-toolbar').style.display = 'none';
        document.getElementById('rp-table-card').style.display = 'none';
        document.getElementById('rp-charts-wrap').style.display = 'none';
        document.getElementById('rp-empty-title').textContent = 'No Report Data';
        document.getElementById('rp-empty-msg').textContent = 'No attendance records match the selected filters.';
        document.getElementById('rp-empty').style.display = 'block';
        Toast.info('No Report Data');
        return;
      }

      document.getElementById('rp-title').textContent = `${reportTypes.find((t) => t.value === type).label} Report`;
      document.getElementById('rp-toolbar').style.display = 'block';
      document.getElementById('rp-table-card').style.display = 'block';
      document.getElementById('rp-charts-wrap').style.display = 'grid';
      document.getElementById('rp-empty').style.display = 'none';

      // Summary
      const allStat = stat(recs);
      document.getElementById('rp-summary').innerHTML = `
        <div class="stat-card"><div class="stat-icon i-success"><i class="fas fa-user-check"></i></div>
          <div class="stat-info"><h3>${allStat.p + allStat.l}</h3><p>Present</p></div></div>
        <div class="stat-card"><div class="stat-icon i-danger"><i class="fas fa-user-xmark"></i></div>
          <div class="stat-info"><h3>${allStat.a}</h3><p>Absent</p></div></div>
        <div class="stat-card"><div class="stat-icon i-warning"><i class="fas fa-clock"></i></div>
          <div class="stat-info"><h3>${allStat.l}</h3><p>Late</p></div></div>
        <div class="stat-card"><div class="stat-icon i-primary"><i class="fas fa-percent"></i></div>
          <div class="stat-info"><h3>${allStat.pct}%</h3><p>Overall</p></div></div>
      `;

      // Table
      const tbody = rows.map((r) => `
        <tr>
          ${r.cells.map((c, i) => i === 0 ? `<td><strong>${esc(r.label)}</strong></td>` :
            i === r.cells.length - 1 ? `<td><span class="attendance-pct" style="color:${Utils.pctColor(r.pct)}">${c}</span></td>` : `<td>${c}</td>`).join('')}
        </tr>`).join('');
      document.getElementById('rp-table').innerHTML = `
        <thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${tbody}</tbody>
      `;

      renderCharts(type);
    }

    function generateStaffAttendance() {
      const from = document.getElementById('rp-from').value;
      const to = document.getElementById('rp-to').value || Utils.todayISO();
      const dept = document.getElementById('rp-dept') ? document.getElementById('rp-dept').value : '';
      const desig = document.getElementById('rp-desig') ? document.getElementById('rp-desig').value : '';
      const staffId = isHOD ? document.getElementById('rp-staff').value : s.person.id;

      const columns = ['Staff', 'Staff ID', 'Department', 'Designation', 'Working Days', 'Present', 'Absent', 'Late', 'Leave', 'Half Day', 'Attendance %'];
      const list = DB.getStaffAttendanceReport({
        staffId: staffId || undefined,
        department: dept || undefined,
        designation: desig || undefined,
        from: from || undefined,
        to: to || undefined
      });

      const rows = list.map((m) => ({
        label: m.name,
        cells: [m.name, m.staffCode, m.department, m.designation || '—', m.workingDays, m.present, m.absent, m.late, m.leave, m.halfDay, `${m.attendancePct}%`],
        pct: m.attendancePct
      })).sort((a, b) => a.pct - b.pct);

      currentReport = { type: 'staffattendance', columns, rows, recs: list };

      // No charts for this entity report — hide the charts row
      const wrap = document.getElementById('rp-charts-wrap');
      wrap.style.display = 'none';
      wrap.innerHTML = '';

      if (rows.length === 0) {
        document.getElementById('rp-toolbar').style.display = 'none';
        document.getElementById('rp-table-card').style.display = 'none';
        document.getElementById('rp-empty-title').textContent = 'No Report Data';
        document.getElementById('rp-empty-msg').textContent = 'No staff attendance records match the selected filters.';
        document.getElementById('rp-empty').style.display = 'block';
        Toast.info('No Report Data');
        return;
      }

      document.getElementById('rp-title').textContent = 'Staff Attendance Report';
      document.getElementById('rp-toolbar').style.display = 'block';
      document.getElementById('rp-table-card').style.display = 'block';
      document.getElementById('rp-empty').style.display = 'none';

      const total = rows.length;
      const working = rows.reduce((n, r) => n + r.cells[4], 0);
      const low = rows.filter((r) => r.pct < 80).length;
      const avg = total ? Math.round(rows.reduce((n, r) => n + r.pct, 0) / total) : 0;

      document.getElementById('rp-summary').innerHTML = `
        <div class="stat-card"><div class="stat-icon i-info"><i class="fas fa-user-tie"></i></div>
          <div class="stat-info"><h3>${total}</h3><p>Staff</p></div></div>
        <div class="stat-card"><div class="stat-icon i-gray"><i class="fas fa-layer-group"></i></div>
          <div class="stat-info"><h3>${working}</h3><p>Working Days</p></div></div>
        <div class="stat-card"><div class="stat-icon i-primary"><i class="fas fa-percent"></i></div>
          <div class="stat-info"><h3>${avg}%</h3><p>Avg Attendance</p></div></div>
        <div class="stat-card"><div class="stat-icon ${low ? 'i-danger' : 'i-success'}"><i class="fas ${low ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i></div>
          <div class="stat-info"><h3>${low}</h3><p>Below 80%</p></div></div>
      `;

      const tbody = rows.map((r) => `
        <tr>
          <td><strong>${esc(r.label)}</strong></td>
          ${r.cells.slice(1, -1).map((c) => `<td>${esc(String(c))}</td>`).join('')}
          <td>
            <span class="attendance-pct" style="color:${Utils.pctColor(r.pct)}">${r.cells[r.cells.length - 1]}</span>
            ${r.pct < 80 ? '<span class="badge badge-danger" style="margin-left:6px">Low</span>' : ''}
          </td>
        </tr>`).join('');
      document.getElementById('rp-table').innerHTML = `
        <thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${tbody}</tbody>
      `;
    }

    function renderCharts(type) {
      const wrap = document.getElementById('rp-charts-wrap');
      wrap.innerHTML = '';

      const labels = currentReport.rows.map((r) => r.label.length > 26 ? r.label.slice(0, 23) + '...' : r.label);
      const pcts = currentReport.rows.map((r) => r.pct);
      const presents = currentReport.rows.map((r) => parseInt(r.cells[1], 10));
      const absents = currentReport.rows.map((r) => parseInt(r.cells[2], 10));

      // Chart 1: percentage bar
      const c1 = document.createElement('div');
      c1.className = 'card';
      c1.innerHTML = `<div class="card-header"><div class="card-title"><i class="fas fa-percent"></i>Attendance Percentage</div></div><div class="chart-container"><canvas id="rp-pct"></canvas></div>`;
      wrap.appendChild(c1);

      // Chart 2: present vs absent (line/bar) - for time-based; for entity-based use donut
      const c2 = document.createElement('div');
      c2.className = 'card';
      const isTime = ['daily', 'weekly', 'monthly'].includes(type);
      c2.innerHTML = `<div class="card-header"><div class="card-title"><i class="fas fa-chart-column"></i>Present vs Absent</div></div><div class="chart-container"><canvas id="rp-pa"></canvas></div>`;
      wrap.appendChild(c2);

      Charts.bar(document.getElementById('rp-pct'), labels, pcts, { showLegend: false, max: 100 });

      new Chart(document.getElementById('rp-pa'), {
        type: isTime ? 'line' : 'bar',
        data: {
          labels,
          datasets: [
            { label: 'Present', data: presents, borderColor: '#10b981', backgroundColor: isTime ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.6)', tension: 0.3, fill: isTime, pointRadius: 2 },
            { label: 'Absent', data: absents, borderColor: '#ef4444', backgroundColor: isTime ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.6)', tension: 0.3, fill: isTime, pointRadius: 2 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { usePointStyle: true, padding: 12 } }, tooltip: { backgroundColor: '#0f172a' } },
          scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
        }
      });
    }

    function utils_display(s) { return s; }

    function exportCsv() {
      if (!currentReport || currentReport.rows.length === 0) { Toast.info('No report data to export. Generate a report first.'); return; }
      const { columns, rows } = currentReport;
      const lines = [columns.join(',')];
      rows.forEach((r) => lines.push(r.cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')));
      download(lines.join('\n'), `attendance-report-${Date.now()}.csv`, 'text/csv');
      Toast.success('Report exported as CSV.');
    }

    function exportExcel() {
      if (!currentReport || currentReport.rows.length === 0) { Toast.info('No report data to export. Generate a report first.'); return; }
      const { columns, rows } = currentReport;
      // Simple HTML-table based XLS (opens in Excel)
      let html = '<table border="1">';
      html += `<tr>${columns.map((c) => `<th style="background:#2563eb;color:#fff">${c}</th>`).join('')}</tr>`;
      rows.forEach((r) => { html += `<tr>${r.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`; });
      html += '</table>';
      const blob = new Blob([`\ufeff${html}`], { type: 'application/vnd.ms-excel' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `attendance-report-${Date.now()}.xls`;
      a.click();
      URL.revokeObjectURL(a.href);
      Toast.success('Report exported as Excel.');
    }

    function download(content, filename, mime) {
      const blob = new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();

window.ReportsApp = ReportsApp;