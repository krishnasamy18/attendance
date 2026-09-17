/* ============================================================
   Report Service — daily attendance report generation/export
   ------------------------------------------------------------
   Frontend wrapper around the report data layer. Kept transport
   ready: the generate() functions read real store data today but
   map 1:1 to the backend API contract:

     POST /api/reports/student/daily
     POST /api/reports/staff/daily
     POST /api/reports/hod/daily
     GET  /api/reports/daily

   Export helpers (Excel/PDF/Print) work fully in-browser and
   never require a backend.
   ============================================================ */

window.ReportService = (() => {

  const fmtDate = (date) => {
    const d = new Date(date + 'T00:00:00');
    if (isNaN(d)) return String(date || '');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  /* ---------- WhatsApp message builders (real data only) ---------- */

  const buildStudentMessage = (r) => {
    const lines = [];
    lines.push('Daily Attendance Report');
    lines.push('');
    lines.push(`Dear ${r.name},`);
    lines.push('');
    lines.push(`Date: ${fmtDate(r.date)}`);
    lines.push('');
    lines.push('Today\'s Attendance:');
    lines.push(`Present: ${r.present}`);
    lines.push(`Absent: ${r.absent}`);
    lines.push(`Late: ${r.late}`);
    if ((r.corrections || []).length) lines.push(`Manual corrections: ${r.corrections.length}`);
    lines.push('');
    lines.push(`Attendance: ${r.percentage}%`);
    lines.push(`Overall Attendance: ${r.overallPercentage}%`);
    lines.push('');
    lines.push('Subject-wise:');
    (r.subjects || []).forEach((s) => {
      lines.push(`${s.subjectName || s.subjectCode} - ${s.status}`);
    });
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  const buildStaffMessage = (r) => {
    const lines = [];
    lines.push('Daily Staff Attendance Report');
    lines.push('');
    lines.push(`Dear ${r.staffName},`);
    lines.push('');
    lines.push(`Date: ${fmtDate(r.date)}`);
    lines.push('');
    lines.push(`Sessions Handled: ${r.sessions.length}`);
    lines.push(`Completed: ${r.completedSessions}`);
    lines.push(`Pending: ${r.pendingSessions}`);
    lines.push('');
    lines.push(`Students Handled: ${r.totalStudents}`);
    lines.push(`Present: ${r.present}`);
    lines.push(`Absent: ${r.absent}`);
    lines.push('');
    lines.push(`Average Attendance: ${r.percentage}%`);
    lines.push('');
    lines.push(`Manual Corrections: ${r.totalCorrections || 0}`);
    lines.push(`Low Attendance in your classes: ${r.lowAttendanceCount || 0} student(s) below 80%.`);
    lines.push('');
    lines.push('Sessions:');
    (r.sessions || []).forEach((s) => {
      lines.push(`${s.className || s.classId} AI & DS-${s.section || ''} - ${s.subjectName} - ${s.status}`);
    });
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  const buildHODMessage = (r) => {
    const lines = [];
    lines.push('Daily Department Attendance Report');
    lines.push('');
    lines.push(`Dear ${r.hodName},`);
    lines.push('');
    lines.push(`Department: ${r.department}`);
    lines.push(`Date: ${fmtDate(r.date)}`);
    lines.push('');
    lines.push(`Total Students: ${r.totalStudents}`);
    lines.push(`Total Staff: ${r.totalStaff}`);
    lines.push(`Attendance Sessions: ${r.totalSessions}`);
    lines.push('');
    lines.push(`Department Attendance: ${r.departmentPercentage}%`);
    lines.push('');
    lines.push(`Completed Sessions: ${r.completedSessions}`);
    lines.push(`Interrupted Sessions: ${r.interruptedSessions}`);
    lines.push('');
    lines.push('Class-wise Attendance:');
    (r.classSummary || []).forEach((c) => {
      lines.push(`${c.className || c.classId} - ${c.percentage}%`);
    });
    lines.push('');
    lines.push(`Low Attendance Alerts: ${(r.alerts || []).length} student(s) below threshold`);
    lines.push(`Low Attendance (<80%): ${(r.lowAttendance || []).length} student(s) — ${(r.lowAttendanceSummary || {}).below70 || 0} below 70%.`);
    lines.push(`Camera/Session Issues: ${(r.cameraIssues || []).length}`);
    lines.push(`Manual Corrections: ${r.totalCorrections || 0} correction(s) in ${(r.correctionsSummary || {}).sessionsWithCorrections || 0} session(s).`);
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  const buildWhatsAppMessage = (report) => {
    if (!report) return '';
    if (report.role === 'student') return buildStudentMessage(report);
    if (report.role === 'staff') return buildStaffMessage(report);
    return buildHODMessage(report);
  };

  /* ---------- Report rendering (preview + print) ---------- */

  const section = (title, inner) => `
    <div class="dr-report-section">
      <h4 class="dr-report-head">${title}</h4>
      ${inner}
    </div>`;

  const table = (headRow, rows) => `
    <table class="dr-table">
      <thead>${headRow.map((h) => `<th>${h}</th>`).join('')}</thead>
      <tbody>${rows}</tbody>
    </table>`;

  const studentHTML = (r) => {
    const rows = (r.subjects || []).map((s) => `
      <tr>
        <td>${esc(s.subjectName || s.subjectCode)}</td>
        <td>${esc(s.subjectCode)}</td>
        <td>Hour ${esc(s.hour)}</td>
        <td>${s.status === 'Present' ? 'Present' : s.status === 'Late' ? 'Late' : 'Absent'}</td>
      </tr>`).join('');
    return `
      ${section('Student', `
        <div class="dr-kv">
          ${kv('Name', r.name)}
          ${kv('Register No', r.registerNumber)}
          ${kv('Department', r.department || 'Artificial Intelligence and Data Science')}
          ${kv('Year / Semester', `${r.year || '—'} / ${r.semester || '—'}`)}
          ${kv('Section', r.section || '—')}
          ${kv('Date', fmtDate(r.date))}
        </div>`)}
      ${section('Today\'s Attendance', `
        <div class="dr-num-grid">
          ${num('Total Classes', r.totalClasses)}
          ${num('Present', r.present, 'ok')}
          ${num('Absent', r.absent, 'bad')}
          ${num('Late', r.late)}
          ${num('Manual Corrections', (r.corrections || []).length)}
          ${num('Today %', r.percentage + '%')}
          ${num('Overall %', r.overallPercentage + '%')}
        </div>`)}
      ${section('Current Attendance Status', `
        <div class="dr-num-grid">
          ${num('Current Attendance', (r.currentAttendance || 0) + '%', r.lowAttendance && (r.currentAttendance || 0) < 70 ? 'bad' : r.lowAttendance ? 'bad' : 'ok')}
          ${num('Threshold', r.lowAttendance ? 'Below 80%' : '80%', r.lowAttendance ? 'bad' : 'ok')}
        </div>`)}
      ${section('Subject-wise Attendance', table(['Subject', 'Code', 'Hour', 'Status'], rows || `<tr><td colspan="4" class="dr-empty">No subjects recorded.</td></tr>`))}
      ${section('Manual Corrections', (r.corrections || []).length
        ? table(['Subject', 'From', 'To', 'Reason'],
            (r.corrections || []).map((c) => `
              <tr>
                <td>${esc(c.subjectName || c.className || '—')}</td>
                <td>${esc(c.originalStatus)}</td>
                <td>${esc(c.newStatus)}</td>
                <td style="max-width:220px">${esc(c.reason || '—')}</td>
              </tr>`).join(''))
        : '<div class="dr-empty" style="padding:10px 0">No manual corrections today.</div>')}`;
  };

  const staffHTML = (r) => {
    const rows = (r.sessions || []).map((s) => `
      <tr>
        <td>${esc(s.className || s.classId)}</td>
        <td>${esc(s.section || '—')}</td>
        <td>${esc(s.subjectName)}</td>
        <td>Hour ${esc(s.hour)}</td>
        <td>${s.students}</td>
        <td>${s.present}</td>
        <td>${s.absent}</td>
        <td><span class="badge badge-success">Completed</span></td>
      </tr>`).join('');
    return `
      ${section('Staff', `
        <div class="dr-kv">
          ${kv('Name', r.staffName)}
          ${kv('Staff ID', r.staffCode)}
          ${kv('Department', r.department || 'Artificial Intelligence and Data Science')}
          ${kv('Date', fmtDate(r.date))}
        </div>`)}
      ${section('Today\'s Sessions', `
        ${table(['Class', 'Sec', 'Subject', 'Hour', 'Students', 'Present', 'Absent', 'Status'],
          rows || `<tr><td colspan="8" class="dr-empty">No attendance sessions recorded today.</td></tr>`)}
        <div class="dr-num-grid">
          ${num('Sessions', r.sessions.length || 0)}
          ${num('Completed', r.completedSessions)}
          ${num('Pending', r.pendingSessions)}
          ${num('Students Handled', r.totalStudents)}
          ${num('Present', r.present, 'ok')}
          ${num('Absent', r.absent, 'bad')}
          ${num('Average %', r.percentage + '%')}
        </div>`)}
      ${section('Camera / Session Status', `
        <div class="dr-num-grid">
          ${num('Completed', r.cameraSessionsCompleted || 0)}
          ${num('Failed', r.cameraSessionsFailed || 0, 'bad')}
          ${num('Manual Corrections', r.totalCorrections || 0)}
        </div>`)}
      ${section('Manual Corrections', (r.corrections || []).length
        ? table(['Register No', 'Student', 'Subject', 'From', 'To', 'Reason'],
            (r.corrections || []).map((c) => `
              <tr>
                <td>${esc(c.registerNumber)}</td>
                <td>${esc(c.studentName)}</td>
                <td>${esc(c.subjectName)}</td>
                <td>${esc(c.originalStatus)}</td>
                <td>${esc(c.newStatus)}</td>
                <td style="max-width:220px">${esc(c.reason || '—')}</td>
              </tr>`).join(''))
        : '<div class="dr-empty" style="padding:10px 0">No manual corrections today.</div>')}
      ${section('Low Attendance in Your Classes (<80%)', `
        ${table(['Register No', 'Student', 'Class', 'Attendance %'],
          (r.lowAttendance || []).map((a) => `
            <tr><td>${esc(a.registerNumber)}</td><td>${esc(a.name)}</td><td>${esc(a.classLabel || a.className || '—')}</td><td><strong>${a.attendancePercentage}%</strong></td></tr>`).join('')
          || `<tr><td colspan="4" class="dr-empty">No students currently below 80%.</td></tr>`)}
        <div class="dr-num-grid">
          ${num('Below 80%', r.lowAttendanceCount || 0, (r.lowAttendanceCount || 0) ? 'bad' : 'ok')}
          ${num('Assigned Students', r.assignedStudentsCount || 0)}
        </div>`)}`;
  };

  const hodHTML = (r) => {
    const classRows = (r.classSummary || []).map((c) => `
      <tr><td>${esc(c.className || c.classId)}</td><td>${c.students}</td><td>${c.present}</td><td>${c.absent}</td><td>${c.percentage}%</td></tr>`).join('');
    const subjRows = (r.subjectSummary || []).map((s) => `
      <tr><td>${esc(s.subjectName)}</td><td>${s.sessions}</td><td>${s.present}</td><td>${s.absent}</td><td>${s.percentage}%</td></tr>`).join('');
    const staffRows = (r.staffSummary || []).map((s) => `
      <tr><td>${esc(s.name)}</td><td>${s.sessions}</td><td>${s.completed}</td><td>${s.percentage}%</td></tr>`).join('');
    const alertRows = (r.alerts || []).map((a) => `
      <tr><td>${esc(a.registerNumber)}</td><td>${esc(a.name)}</td><td>${a.percentage}%</td></tr>`).join('');
    const camRows = (r.cameraIssues || []).map((c) => `
      <tr><td>${esc(c.subjectName)}</td><td>${esc(c.className || '—')}</td><td>${esc(c.cameraName)}</td><td>${pill(c.status)}</td><td>${camStatus(c.cameraStatus)}</td></tr>`).join('');
    return `
      ${section('HOD', `
        <div class="dr-kv">
          ${kv('HOD', r.hodName)}
          ${kv('Department', r.department)}
          ${kv('Date', fmtDate(r.date))}
        </div>`)}
      ${section('Summary', `
        <div class="dr-num-grid">
          ${num('Students', r.totalStudents)}
          ${num('Staff', r.totalStaff)}
          ${num('Classes', r.totalClasses)}
          ${num('Sessions', r.totalSessions)}
          ${num('Completed', r.completedSessions, 'ok')}
          ${num('Interrupted', r.interruptedSessions, r.interruptedSessions ? 'bad' : 'ok')}
          ${num('Manual Corr.', r.totalCorrections || 0)}
          ${num('Dept %', r.departmentPercentage + '%')}
        </div>`)}
      ${section('Class-wise Attendance', table(['Class', 'Students', 'Present', 'Absent', 'Percentage'],
        classRows || `<tr><td colspan="5" class="dr-empty">No classes with data.</td></tr>`))}
      ${section('Subject-wise Attendance', table(['Subject', 'Sessions', 'Present', 'Absent', 'Percentage'],
        subjRows || `<tr><td colspan="5" class="dr-empty">No subject data.</td></tr>`))}
      ${section('Staff Session Summary', table(['Staff', 'Sessions', 'Completed', 'Attendance %'],
        staffRows || `<tr><td colspan="4" class="dr-empty">No staff data.</td></tr>`))}
      ${section('Attendance Alerts', table(['Register No', 'Student', 'Attendance %'],
        alertRows || `<tr><td colspan="3" class="dr-empty">No students below threshold.</td></tr>`))}
      ${section('Low Attendance Summary (<80%)', `
        <div class="dr-num-grid">
          ${num('Total Students', (r.lowAttendanceSummary || {}).totalStudents ?? r.totalStudents)}
          ${num('Below 80%', (r.lowAttendanceSummary || {}).below80 || 0, ((r.lowAttendanceSummary || {}).below80 || 0) ? 'bad' : 'ok')}
          ${num('70–79%', (r.lowAttendanceSummary || {}).between70and79 || 0, ((r.lowAttendanceSummary || {}).between70and79 || 0) ? 'bad' : 'ok')}
          ${num('Below 70%', (r.lowAttendanceSummary || {}).below70 || 0, ((r.lowAttendanceSummary || {}).below70 || 0) ? 'bad' : 'ok')}
        </div>
        ${table(['Register No', 'Student', 'Class', 'Attendance %', 'Assigned Staff'],
          (r.lowAttendance || []).map((a) => `
            <tr><td>${esc(a.registerNumber)}</td><td>${esc(a.name)}</td><td>${esc(a.classLabel || a.className || '—')}</td><td><strong>${a.attendancePercentage}%</strong></td><td>${esc(a.staffName || '—')}</td></tr>`).join('')
          || `<tr><td colspan="5" class="dr-empty">No students currently below 80%.</td></tr>`)}
      `)}
      ${section('Camera / Session Issues', table(['Subject', 'Class', 'Camera', 'Session', 'Camera'],
        camRows || `<tr><td colspan="5" class="dr-empty">No camera or session issues.</td></tr>`))}
      ${section('Manual Corrections', ((r.correctionsSummary || {}).sessions || []).length
        ? table(['Session', 'Class', 'Section', 'Hour', 'Corrections'],
            ((r.correctionsSummary || {}).sessions || []).map((s) => `
              <tr><td>${esc(s.subjectName)}</td><td>${esc(s.className || '—')}</td><td>${esc(s.section || '—')}</td><td>Hour ${esc(s.hour || '—')}</td><td><strong>${s.count}</strong></td></tr>`).join(''))
        : '<div class="dr-empty" style="padding:10px 0">No manual corrections today.</div>')}`;
  };

  const pill = (status) => {
    const map = {
      COMPLETED: ['badge-success', 'Completed'],
      ERROR: ['badge-danger', 'Error'],
      PAUSED: ['badge-warning', 'Paused'],
      DISCONNECTED: ['badge-gray', 'Disconnected']
    };
    const p = map[status] || ['badge-gray', status || '—'];
    return `<span class="badge ${p[0]}">${p[1]}</span>`;
  };

  const camStatus = (s) => {
    const map = { connected: 'ok', connecting: '', error: 'bad', disconnected: 'bad' };
    return `<span class="badge ${map[s] === 'ok' ? 'badge-success' : map[s] === 'bad' ? 'badge-danger' : 'badge-gray'}">${esc(s || '—')}</span>`;
  };

  const kv = (k, v) => `<div class="dr-kv-item"><span class="dr-kv-k">${k}</span><span class="dr-kv-v">${v == null ? '—' : esc(v)}</span></div>`;
  const num = (k, v, tone = '') => `<div class="dr-num dr-num--${tone}"><div class="dr-num-v">${esc(v)}</div><div class="dr-num-k">${k}</div></div>`;

  const reportHTML = (report) => {
    if (!report) return '';
    if (report.role === 'student') return studentHTML(report);
    if (report.role === 'staff') return staffHTML(report);
    return hodHTML(report);
  };

  /* ---------- Export helpers (Excel / PDF / Print) ---------- */

  const tablesFor = (report) => {
    const rows = [];
    const push = (head, body) => rows.push({ head, body: body.map((r) => r.map((c) => String(c))) });

    if (report.role === 'student') {
      push(['Subject', 'Code', 'Hour', 'Status'],
        (report.subjects || []).map((s) => [s.subjectName, s.subjectCode, 'Hour ' + s.hour, s.status]));
      push(['Total Classes', 'Present', 'Absent', 'Late', 'Today %', 'Overall %'],
        [[report.totalClasses, report.present, report.absent, report.late, report.percentage + '%', report.overallPercentage + '%']]);
      push(['Manual Corrections', 'Subject', 'From', 'To', 'Reason'],
        (report.corrections || []).map((c) => [c.subjectName || c.className || '—', c.subjectName || '—', c.originalStatus, c.newStatus, c.reason || '—']));
    } else if (report.role === 'staff') {
      push(['Class', 'Sec', 'Subject', 'Hour', 'Students', 'Present', 'Absent', 'Status'],
        (report.sessions || []).map((s) => [s.className, s.section, s.subjectName, 'Hour ' + s.hour, s.students, s.present, s.absent, s.status]));
      push(['Sessions', 'Completed', 'Pending', 'Students', 'Present', 'Absent', 'Avg %'],
        [[report.sessions.length, report.completedSessions, report.pendingSessions, report.totalStudents, report.present, report.absent, report.percentage + '%']]);
      push(['Manual Corrections', 'Register No', 'Student', 'Subject', 'From', 'To', 'Reason'],
        (report.corrections || []).map((c) => [report.corrections.length, c.registerNumber, c.studentName, c.subjectName, c.originalStatus, c.newStatus, c.reason || '—']));
      push(['RegNo', 'Student', 'Class', 'Attendance %'],
        (report.lowAttendance || []).map((a) => [a.registerNumber, a.name, a.classLabel || a.className, a.attendancePercentage + '%']));
    } else {
      push(['Class', 'Students', 'Present', 'Absent', '%'],
        (report.classSummary || []).map((c) => [c.className, c.students, c.present, c.absent, c.percentage + '%']));
      push(['Subject', 'Sessions', 'Present', 'Absent', '%'],
        (report.subjectSummary || []).map((s) => [s.subjectName, s.sessions, s.present, s.absent, s.percentage + '%']));
      push(['Staff', 'Sessions', 'Completed', '%'],
        (report.staffSummary || []).map((s) => [s.name, s.sessions, s.completed, s.percentage + '%']));
      push(['Dept%', 'Students', 'Staff', 'Classes', 'Completed', 'Interrupted'],
        [[report.departmentPercentage + '%', report.totalStudents, report.totalStaff, report.totalClasses, report.completedSessions, report.interruptedSessions]]);
      const ls = report.lowAttendanceSummary || {};
      push(['Low Attendance (<80%)', 'Total Students', 'Below 80%', '70–79%', 'Below 70%'],
        [[ls.totalStudents ?? report.totalStudents, ls.below80 || 0, ls.between70and79 || 0, ls.below70 || 0]]);
      push(['RegNo', 'Student', 'Class', 'Attendance %', 'Assigned Staff'],
        (report.lowAttendance || []).map((a) => [a.registerNumber, a.name, a.classLabel || a.className, a.attendancePercentage + '%', a.staffName]));
      const cs = report.correctionsSummary || {};
      push(['Manual Corrections', 'Total', 'Sessions With Corrections', 'Session', 'Class', 'Corrections'],
        (cs.sessions || []).map((s) => [cs.total || 0, s.sessionId, s.className || '—', s.subjectName || '—', s.hour || '—', String(s.count)]));
    }
    return rows;
  };

  const downloadExcel = (report) => {
    const title = `${report.role.toUpperCase()} REPORT - ${report.date}`;
    const cells = (row) => row.map((c) => `<td>${esc(c)}</td>`).join('');
    let html = `<html><head><meta charset="UTF-8"></head><body><h3>${esc(title)}</h3>`;
    tablesFor(report).forEach((t) => {
      html += `<table border="1"><thead><tr>${t.head.map(cells).join('')}</tr></thead>`;
      html += `<tbody>${t.body.map((r) => `<tr>${cells(r)}</tr>`).join('')}</tbody></table>`;
    });
    html += '</body></html>';
    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-${report.role}-report-${report.date}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const openPrintWindow = (report) => {
    const w = window.open('', '_blank', 'width=860,height=900');
    if (!w) { Toast && Toast.error('Please allow pop-ups to print this report.'); return; }
    w.document.write(`<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>${esc(report.role.toUpperCase())} Report - ${esc(report.date)}</title>
        <style>
          body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;margin:24px;font-size:13px}
          h2{color:#2563eb;margin:0 0 4px}
          h3{sub, margin:0 0 16px;font-weight:500;color:#64748b}
          .dr-report-head{margin:14px 0 8px;font-size:14px;color:#334155}
          .dr-kv{display:flex;flex-wrap:wrap;gap:8px 24px}
          .dr-kv-item span{display:block}
          .dr-kv-k{font-size:11px;color:#64748b;text-transform:uppercase}
          .dr-kv-v{font-weight:600}
          .dr-num-grid{display:flex;flex-wrap:wrap;gap:10px}
          .dr-num{background:#f1f5f9;border-radius:8px;padding:8px 14px;text-align:center;min-width:80px}
          .dr-num--ok .dr-num-v{color:#059669}
          .dr-num--bad .dr-num-v{color:#ef4444}
          .dr-num-v{font-size:20px;font-weight:800}
          .dr-num-k{font-size:11px;color:#64748b}
          table{width:100%;border-collapse:collapse;margin-top:6px}
          th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;font-size:12px}
          th{background:#f8fafc;font-weight:700}
          @media print{body{margin:12px}}
        </style>
      </head>
      <body>
        <h2>Daily ${esc(report.role)} Report</h2>
        <h3>${esc(fmtDate(report.date))}</h3>
        ${reportHTML(report)}
      </body>
      </html>`);
    w.document.close();
    return w;
  };

  const downloadReport = (report, format) => {
    if (format === 'excel') {
      downloadExcel(report);
      return { ok: true };
    }
    const w = openPrintWindow(report);
    if (format === 'pdf') {
      // In this static build the print dialog's "Save as PDF" produces the
      // PDF. When jsPDF is bundled on the page it could render server-side
      // PDFs instead; the backend /api/reports download route is the real
      // production path.
      setTimeout(() => { try { w && w.print(); } catch (_e) { /* no-op */ } }, 350);
      return { ok: true };
    }
    setTimeout(() => { try { w && w.print(); } catch (_e) { /* no-op */ } }, 350);
    return { ok: true };
  };

  const messagePreviewHTML = (report) => {
    const text = buildWhatsAppMessage(report);
    return `<pre class="dr-message">${esc(text)}</pre>`;
  };

  return {
    fmtDate,
    todayISO,
    buildWhatsAppMessage,
    messagePreviewHTML,
    reportHTML,
    downloadReport,
    downloadExcel,
    openPrintWindow,
    tablesFor,
    generateStudentReport: (date, studentId) => DB.generateStudentReport(date, studentId),
    generateStaffReport: (date, staffId) => DB.generateStaffReport(date, staffId),
    generateHODReport: (date, hodId) => DB.generateHODReport(date, hodId),
    generateAllDailyReports: (date) => DB.generateAllDailyReports(date),
    getDailyReports: (filters) => DB.getDailyReports(filters),
    getDailyReportByUser: (date, role, userId) => DB.getDailyReportByUser(date, role, userId),
    downloadExport: downloadReport
  };
})();