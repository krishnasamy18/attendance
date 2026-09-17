/* ============================================================
   Data Store (Client-side persistence layer)
   ------------------------------------------------------------
   Replaces the old mock API. Data is persisted in localStorage
   under namespaced keys and starts completely EMPTY — no sample
   students, staff, HODs, subjects, classes, attendance or
   timetable records are seeded.

   The UI creates records through the CRUD methods below, which
   also enforce duplicate-free IDs and emails. Swap these
   functions for real fetch() calls later without touching the
   rest of the UI code.
   ============================================================ */

window.DB = (() => {
  'use strict';

  /* ---------- Storage keys & config ---------- */

  const STORE_KEYS = {
    students: 'attendance_students',
    staff: 'attendance_staff',
    hod: 'attendance_hod',
    attendance: 'attendance_records',
    subjects: 'attendance_subjects',
    classes: 'attendance_classes',
    timetable: 'attendance_timetable',
    academicYears: 'attendance_academic_years',
    sessions: 'attendance_sessions',
    dailyReports: 'attendance_daily_reports',
    deliveries: 'attendance_whatsapp_deliveries',
    corrections: 'attendance_corrections',
    reportSettings: 'attendance_report_settings',
    lowAttendanceAlerts: 'attendance_lowatt_alerts',
    reminders: 'attendance_reminders',
    reminderSettings: 'attendance_reminder_settings',
    staffAttendance: 'attendance_staff_attendance',
    staffAudit: 'attendance_staff_audit'
  };

  // Generic academic configuration (not sample records).
  const departments = [
    { id: 'dept-ai', code: 'AI&DS', name: 'Artificial Intelligence and Data Science' }
  ];
  const semesters = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const sections = ['A', 'B', 'UV'];

  const DUPLICATE_ID = 'A record with this ID already exists.';
  const DUPLICATE_EMAIL = 'A record with this email already exists.';

  /* ---------- WhatsApp number helpers ---------- */

  const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

  const validateWhatsAppNumber = (input) => {
    const d = digitsOnly(input);
    if (!d) return { ok: false, phone: '', message: 'Enter a WhatsApp number.' };
    let normalized = d;
    if (d.length === 10) {
      if (!/^[6-9]/.test(d)) return { ok: false, phone: '', message: 'Invalid Indian mobile number.' };
      normalized = '91' + d;
    } else if (d.length === 11 && d.startsWith('0')) {
      normalized = '91' + d.slice(1);
    } else if (d.length === 12 && d.startsWith('91')) {
      if (!/^[6-9]/.test(d.slice(2))) return { ok: false, phone: '', message: 'Invalid Indian mobile number.' };
    } else {
      return { ok: false, phone: '', message: 'Enter a valid Indian mobile number (e.g., 98765 43210).' };
    }
    return { ok: true, phone: normalized, message: '' };
  };

  const fmtWhatsApp = (phone) => {
    if (!phone) return '';
    const d = String(phone).replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) {
      return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
    }
    return d ? '+' + d : '';
  };

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(STORE_KEYS[key]);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_e) { return fallback; }
  };

  const write = (key, value) => {
    try { localStorage.setItem(STORE_KEYS[key], JSON.stringify(value)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const today = () => new Date().toISOString().slice(0, 10);
  const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const readPwOverrides = () => {
    try { return JSON.parse(localStorage.getItem('attendance_pw_overrides') || '{}'); }
    catch (_e) { return {}; }
  };
  const writePwOverrides = (overrides) => {
    try { localStorage.setItem('attendance_pw_overrides', JSON.stringify(overrides)); }
    catch (_e) { /* ignore */ }
  };

  /* ---------- Attendance sessions (cross-tab safe, no mirror) ----------
     Sessions are read/written fresh from localStorage on every call so
     that a Staff session and an HOD monitor in another tab always see
     the same real state. */

  const readSessions = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.sessions) || '[]'); }
    catch (_e) { return []; }
  };

  const writeSessions = (list) => {
    try { localStorage.setItem(STORE_KEYS.sessions, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const ACTIVE_STATUSES = ['WAITING', 'CONNECTING', 'LIVE', 'PAUSED', 'DISCONNECTED', 'ERROR'];

  const recomputeCounts = (session) => {
    const students = session.students || [];
    const presentCount = students.filter((s) => s.status === 'present').length;
    const absentCount = students.filter((s) => s.status === 'absent').length;
    const pendingCount = students.filter((s) => s.status === 'pending').length;
    const lateCount = students.filter((s) => s.status === 'late').length;
    const totalStudents = students.length;
    session.totalStudents = totalStudents;
    session.presentCount = presentCount;
    session.absentCount = absentCount;
    session.pendingCount = pendingCount;
    session.lateCount = lateCount;
    session.attendancePercentage = totalStudents ? Math.round(((presentCount + lateCount) / totalStudents) * 100) : 0;
    return session;
  };

  /* ---------- Daily report / WhatsApp delivery stores (fresh reads) ---------- */

  const readReports = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.dailyReports) || '[]'); }
    catch (_e) { return []; }
  };
  const writeReports = (list) => {
    try { localStorage.setItem(STORE_KEYS.dailyReports, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const readDeliveries = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.deliveries) || '[]'); }
    catch (_e) { return []; }
  };
  const writeDeliveries = (list) => {
    try { localStorage.setItem(STORE_KEYS.deliveries, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const readReportSettings = () => {
    try {
      const raw = localStorage.getItem(STORE_KEYS.reportSettings);
      if (raw) return JSON.parse(raw);
    } catch (_e) { /* fallthrough */ }
    return { autoEnabled: false, dailyReportTime: '18:00', threshold: 75, correctionWindowMins: 120 };
  };
  const writeReportSettings = (cfg) => {
    try { localStorage.setItem(STORE_KEYS.reportSettings, JSON.stringify(cfg)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const DEFAULT_SETTINGS = { autoEnabled: false, dailyReportTime: '18:00', threshold: 75, correctionWindowMins: 120 };

  /* ============================================================
     Low Attendance Alerts & Reminders (client persistence layer)
     ------------------------------------------------------------
     Business rule (fixed): a student whose CURRENT OVERALL
     attendance is STRICTLY below 80% is a low-attendance student.
       79.9% / 79% / 75% / 60%  ->  Alert
       80% / 81%                ->  No alert
     Everything below is computed LIVE from real attendance
     records — no hard-coded names or percentages.
     ============================================================ */

  const LOWATT_THRESHOLD = 80;

  const DEFAULT_REMINDER_SETTINGS = {
    frequency: 'daily',      // 'daily' | 'weekly' | 'manual'
    autoEnabled: false,      // automatic daily/weekly night-run enabled
    reminderTime: '18:00',   // HH:MM used by the scheduler
    parentEnabled: false     // parent/guardian messaging is off by default
  };

  const readAlerts = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.lowAttendanceAlerts) || '[]'); }
    catch (_e) { return []; }
  };
  const writeAlerts = (list) => {
    try { localStorage.setItem(STORE_KEYS.lowAttendanceAlerts, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const readReminders = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.reminders) || '[]'); }
    catch (_e) { return []; }
  };
  const writeReminders = (list) => {
    try { localStorage.setItem(STORE_KEYS.reminders, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const readReminderSettings = () => {
    try {
      const raw = localStorage.getItem(STORE_KEYS.reminderSettings);
      if (raw) return { ...DEFAULT_REMINDER_SETTINGS, ...JSON.parse(raw) };
    } catch (_e) { /* fallthrough */ }
    return { ...DEFAULT_REMINDER_SETTINGS };
  };
  const writeReminderSettings = (cfg) => {
    try { localStorage.setItem(STORE_KEYS.reminderSettings, JSON.stringify(cfg)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  /* A record counts as attended when the status is Present or Late.
     Statuses may arrive either lowercase (manual UI) or capitalized
     (camera session completion); both are honoured. */
  const isMissing = (r) => r && (r.status === 'Absent' || r.status === 'absent');
  const isPresentRec = (r) => r && !isMissing(r);

  /* Canonical capitalized status used when syncing corrected session
     values back into the persisted attendance records. */
  const capStatus = (s) => (s === 'late' ? 'Late' : s === 'present' ? 'Present' : 'Absent');

  /* ---------- Attendance corrections (manual fallback) store ---------- */

  const readCorrections = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.corrections) || '[]'); }
    catch (_e) { return []; }
  };
  const writeCorrections = (list) => {
    try { localStorage.setItem(STORE_KEYS.corrections, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  /* ---------- Staff daily attendance store ----------
     Kept physically separate from the student attendance records
     (attendanceRecords). A staff attendance record represents the
     daily attendance of a staff member, NOT the sessions they taught.
     Reads are always fresh from localStorage so that every open tab
     (HOD dashboard, profile, staff attendance page, reports) sees the
     same real state without a reload. */

  const STAFF_ATT_STATUSES = ['present', 'absent', 'late', 'leave', 'half_day'];

  const readStaffAttendance = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.staffAttendance) || '[]'); }
    catch (_e) { return []; }
  };
  const writeStaffAttendance = (list) => {
    try { localStorage.setItem(STORE_KEYS.staffAttendance, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const readStaffAudit = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEYS.staffAudit) || '[]'); }
    catch (_e) { return []; }
  };
  const writeStaffAudit = (list) => {
    try { localStorage.setItem(STORE_KEYS.staffAudit, JSON.stringify(list)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const pushStaffAudit = (entry) => {
    const list = readStaffAudit();
    list.unshift(Object.assign({ id: uid('au') }, entry));
    writeStaffAudit(list.slice(0, 2000));
  };

  /* Live aggregate stats for one staff member's own attendance.
     Attended = present + late. Leave / half day / absent are shown
     but do not count as attended. Days with no record (or an explicit
     'not_marked' entry) are not working days. */
  const staffAttStatsOf = (staffId, from, to) => {
    const list = readStaffAttendance().filter((r) => r.staffId === staffId);
    const range = list.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    });
    const working = range.filter((r) => r.status !== 'not_marked');
    const present = working.filter((r) => r.status === 'present').length;
    const absent  = working.filter((r) => r.status === 'absent').length;
    const late    = working.filter((r) => r.status === 'late').length;
    const leave   = working.filter((r) => r.status === 'leave').length;
    const halfDay = working.filter((r) => r.status === 'half_day').length;
    const attended = present + late;
    let lastDate = '';
    working.forEach((r) => { if (String(r.date) > lastDate) lastDate = String(r.date); });
    return {
      staffId,
      total: range.length,
      workingDays: working.length,
      present, absent, late, leave, halfDay,
      attended,
      attendancePct: working.length ? Math.round((attended / working.length) * 100) : 0,
      lastAttendanceDate: lastDate || null
    };
  };

  /* Live overall stats for one student. The floored percentage keeps
     threshold checks honest: an exact 79.9% displays as 79% and alerts,
     while an exact 80.0% displays as 80% and does not. */
  const studentStatsOf = (studentId) => {
    const recs = attendanceRecords.filter((r) => r.studentId === studentId);
    let present = 0, absent = 0, late = 0, lastDate = '';
    recs.forEach((r) => {
      if (String(r.date) > lastDate) lastDate = String(r.date);
      if (r.status === 'Late' || r.status === 'late') late += 1;
      if (isPresentRec(r)) present += 1; else absent += 1;
    });
    const raw = recs.length ? (present / recs.length) * 100 : 0;
    return { total: recs.length, present, absent, late, percentage: Math.floor(raw), rawPercentage: raw, lastDate };
  };

  const departmentNameOf = () => (departments && departments[0] && departments[0].name) || 'Artificial Intelligence and Data Science';

  /* Primary assigned staff for a class/student: the staff member whose
     assigned classes cover the class and who has marked the most
     attendance for that student (falling back to the first assigned). */
  const assignedStaffForClass = (classId, studentId) => {
    const candidates = staff.filter((f) => (f.classes || []).includes(classId));
    if (!candidates.length) return '';
    if (studentId) {
      const ranked = [...candidates].sort((a, b) => {
        const ca = attendanceRecords.filter((r) => r.staffId === a.id && r.studentId === studentId).length;
        const cb = attendanceRecords.filter((r) => r.staffId === b.id && r.studentId === studentId).length;
        return cb - ca;
      });
      return ranked[0].id;
    }
    return candidates[0].id;
  };

  const classLabelOf = (st) => {
    const cls = classesList.find((c) => c.id === (st && st.year));
    return cls ? cls.className : `${(st && st.year) || ''} Sem AI&DS`.trim();
  };

  const enrichAlert = (a) => {
    const st = students.find((s) => s.id === a.studentId);
    if (!st) return null;
    const stats = studentStatsOf(a.studentId);
    const staffMember = staff.find((f) => f.id === a.staffId);
    return {
      alertId: a.alertId,
      studentId: a.studentId,
      registerNumber: st.registerNumber,
      name: st.name,
      classId: st.year || a.classId,
      className: classLabelOf(st),
      classLabel: `${st.year || ''} AI & DS-${st.section || ''}`.replace(/^\-/, ''),
      section: st.section || '',
      departmentId: st.department || 'AI&DS',
      department: st.department || 'AI&DS',
      attendancePercentage: stats.total ? stats.percentage : (a.attendancePercentage || 0),
      totalClasses: stats.total,
      present: stats.present,
      absent: stats.absent,
      late: stats.late,
      lastAttendanceDate: stats.lastDate || a.lastAttendanceDate || '',
      threshold: LOWATT_THRESHOLD,
      staffId: a.staffId || '',
      staffName: staffMember ? staffMember.name : '—',
      status: a.status || 'Active',
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    };
  };

  const getAlertsEnriched = () => readAlerts().map(enrichAlert).filter(Boolean);

  const removeAlertFor = (studentId) => {
    writeAlerts(readAlerts().filter((a) => a.studentId !== studentId));
  };

  const createAlertFor = (studentId, percentage, lastDate) => {
    const st = students.find((s) => s.id === studentId);
    if (!st) return null;
    const list = readAlerts();
    const idx = list.findIndex((a) => a.studentId === studentId);
    const now = new Date().toISOString();
    const record = {
      alertId: idx > -1 ? list[idx].alertId : uid('LA'),
      studentId,
      classId: st.year,
      staffId: assignedStaffForClass(st.year, studentId),
      departmentId: st.department || 'AI&DS',
      attendancePercentage: percentage,
      threshold: LOWATT_THRESHOLD,
      status: 'Active',
      lastAttendanceDate: lastDate || '',
      createdAt: idx > -1 ? list[idx].createdAt : now,
      updatedAt: now
    };
    if (idx > -1) list[idx] = record; else list.push(record);
    writeAlerts(list);
    return { ...record };
  };

  /* Full re-scan: one active alert per student who is strictly below
     80%. Students at/above 80% (and students without any attendance
     records) get no alert, so stale alerts never linger. */
  const recomputeAllAlerts = () => {
    const next = [];
    students.forEach((st) => {
      const stats = studentStatsOf(st.id);
      if (stats.total === 0) return;
      if (stats.percentage < LOWATT_THRESHOLD) next.push(st.id);
    });
    const fresh = [];
    next.forEach((studentId) => {
      const created = createAlertFor(studentId, studentStatsOf(studentId).percentage, studentStatsOf(studentId).lastDate);
      if (created) fresh.push(created);
    });
    writeAlerts(fresh);
    return fresh;
  };

  /* ---------- Reminder message builders (real data only) ---------- */

  const buildHODReminderMessage = (date) => {
    const alerts = getAlertsEnriched().sort((a, b) => a.attendancePercentage - b.attendancePercentage);
    const lines = [];
    lines.push('⚠ Low Attendance Reminder');
    lines.push('');
    lines.push('Department:');
    lines.push(departmentNameOf());
    lines.push('');
    lines.push('Date:');
    lines.push(date);
    lines.push('');
    lines.push('Students below 80%:');
    if (!alerts.length) lines.push('None — no students are currently below 80% attendance.');
    else alerts.forEach((a) => lines.push(`• ${a.name} — ${a.classLabel} — ${a.attendancePercentage}%`));
    lines.push('');
    lines.push('Total:');
    lines.push(`[${alerts.length}] students below 80%.`);
    lines.push('');
    lines.push('Please review the attendance status.');
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  const buildStaffReminderMessage = (date, staffId) => {
    const person = staff.find((f) => f.id === staffId);
    const alerts = getAlertsEnriched()
      .filter((a) => (person ? (person.classes || []).includes(a.classId) : false))
      .sort((a, b) => a.attendancePercentage - b.attendancePercentage);
    const lines = [];
    lines.push('⚠ Low Attendance Reminder');
    lines.push('');
    lines.push(`Dear ${person ? person.name : 'Staff Member'},`);
    lines.push('');
    lines.push('Students below 80% in your assigned classes:');
    if (!alerts.length) lines.push('None — no students in your assigned classes are below 80%.');
    else alerts.forEach((a) => lines.push(`• ${a.name} — ${a.attendancePercentage}%`));
    lines.push('');
    lines.push('Please review their attendance.');
    lines.push('');
    lines.push('Date:');
    lines.push(date);
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  const buildStudentReminderMessage = (studentId) => {
    const st = students.find((s) => s.id === studentId);
    if (!st) return '';
    const stats = studentStatsOf(studentId);
    const lines = [];
    lines.push('⚠ Attendance Reminder');
    lines.push('');
    lines.push(`Dear ${st.name},`);
    lines.push('');
    lines.push(`Your current attendance is ${stats.percentage}%, which is below the required ${LOWATT_THRESHOLD}% threshold.`);
    lines.push('');
    lines.push('Please review your attendance and maintain regular class attendance.');
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  const buildParentReminderMessage = (studentId) => {
    const st = students.find((s) => s.id === studentId);
    if (!st) return '';
    const stats = studentStatsOf(studentId);
    const lines = [];
    lines.push('⚠ Attendance Reminder');
    lines.push('');
    lines.push(`Dear Parent/Guardian of ${st.name} (${st.registerNumber}),`);
    lines.push('');
    lines.push(`Your ward's current attendance is ${stats.percentage}%, which is below the required ${LOWATT_THRESHOLD}% threshold.`);
    lines.push('');
    lines.push('Please encourage regular class attendance.');
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  const buildHODDailyReminderMessage = (date) => {
    const alerts = getAlertsEnriched().sort((a, b) => a.attendancePercentage - b.attendancePercentage);
    const lines = [];
    lines.push('⚠ LOW ATTENDANCE DAILY REMINDER');
    lines.push('');
    lines.push('Date: ' + date);
    lines.push('');
    lines.push('Department:');
    lines.push(departmentNameOf());
    lines.push('');
    lines.push('Students below 80%:');
    if (!alerts.length) lines.push('None — no students are currently below 80% attendance.');
    else alerts.forEach((a, i) => lines.push(`${i + 1}. ${a.name} — ${a.attendancePercentage}% — ${a.classLabel}`));
    lines.push('');
    lines.push('Total students below 80%:');
    lines.push(`[${alerts.length}]`);
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    return lines.join('\n');
  };

  const buildStaffDailyReminderMessage = (date, staffId) => {
    const person = staff.find((f) => f.id === staffId);
    const alerts = getAlertsEnriched()
      .filter((a) => (person ? (person.classes || []).includes(a.classId) : false))
      .sort((a, b) => a.attendancePercentage - b.attendancePercentage);
    const lines = [];
    lines.push('⚠ LOW ATTENDANCE REMINDER');
    lines.push('');
    lines.push(`Dear ${person ? person.name : 'Staff Member'},`);
    lines.push('');
    lines.push('The following students from your assigned classes are currently below 80% attendance:');
    if (!alerts.length) lines.push('None — no students in your assigned classes are below 80%.');
    else alerts.forEach((a) => lines.push(`${a.name} — ${a.attendancePercentage}%`));
    lines.push('');
    lines.push('Please review their attendance.');
    lines.push('');
    lines.push('Class:');
    lines.push([...(new Set(alerts.map((a) => a.className)))].join(', ') || '—');
    lines.push('');
    lines.push('Date:');
    lines.push(date);
    lines.push('');
    lines.push('Regards,');
    lines.push('Attendance Management System');
    lines.push('R P Sarathy Institute of Technology');
    return lines.join('\n');
  };

  /* ---------- Report id + generation helpers ---------- */

  const RID_TAG = { student: 'STU', staff: 'STF', hod: 'HOD' };
  const roleTag = (role) => RID_TAG[role] || role.toUpperCase();

  const makeReportId = (role, date) => {
    const tag = roleTag(role);
    const seq = readReports().filter((r) => r.reportId && r.reportId.startsWith(tag + '-' + date)).length + 1;
    return `${role.toUpperCase()}-${date}-${tag}${String(seq).padStart(3, '0')}`;
  };

  const sessionKey = (r) => `${r.classId}|${r.section || ''}|${r.subjectCode}|${r.hour}`;

  const pct = (p, t) => (t ? Math.round((p / t) * 100) : 0);

  const subjectNameFor = (code) => {
    const s = subjects.find((x) => x.code === (code || '').toUpperCase());
    return s ? s.name : String(code || '');
  };

  const classNameFor = (id) => {
    const c = classesList.find((x) => x.id === id);
    return c ? c.className : String(id || '');
  };

  const buildClassSummary = (records) => {
    const out = [];
    const byClass = {};
    records.forEach((r) => {
      (byClass[r.classId] = byClass[r.classId] || []).push(r);
    });
    Object.keys(byClass).sort().forEach((classId) => {
      const rs = byClass[classId];
      const present = rs.filter((r) => r.status === 'Present' || r.status === 'Late').length;
      out.push({
        classId,
        className: classNameFor(classId),
        students: new Set(rs.map((r) => r.studentId)).size,
        present,
        absent: rs.length - present,
        percentage: pct(present, rs.length)
      });
    });
    return out;
  };

  const buildSubjectSummary = (records) => {
    const out = [];
    const by = {};
    records.forEach((r) => {
      const key = String(r.subjectCode || '').toUpperCase();
      (by[key] = by[key] || []).push(r);
    });
    Object.keys(by).sort().forEach((code) => {
      const rs = by[code];
      const present = rs.filter((r) => r.status === 'Present' || r.status === 'Late').length;
      out.push({
        subjectCode: code,
        subjectName: subjectNameFor(code),
        sessions: new Set(rs.map(sessionKey)).size,
        present,
        absent: rs.length - present,
        percentage: pct(present, rs.length)
      });
    });
    return out;
  };

  const buildStaffSummary = (records) => {
    const out = [];
    const by = {};
    records.forEach((r) => {
      (by[r.staffId] = by[r.staffId] || []).push(r);
    });
    Object.keys(by).forEach((staffId) => {
      const rs = by[staffId];
      const present = rs.filter((r) => r.status === 'Present' || r.status === 'Late').length;
      const member = staff.find((f) => f.id === staffId);
      out.push({
        staffId,
        name: member ? member.name : 'Unknown Staff',
        sessions: new Set(rs.map(sessionKey)).size,
        completed: new Set(rs.map(sessionKey)).size,
        studentsHandled: new Set(rs.map((r) => r.studentId)).size,
        present,
        absent: rs.length - present,
        percentage: pct(present, rs.length)
      });
    });
    return out.sort((a, b) => (a.name).localeCompare(b.name));
  };

  const sessionsForDate = (date, staffId) => {
    return readSessions().filter((s) => s.date === date && (!staffId || s.staffId === staffId));
  };

  /* ---------- Student report ---------- */

  const buildStudentReport = (date, studentId) => {
    const st = students.find((x) => x.id === studentId);
    if (!st) return null;
    const recs = attendanceRecords.filter((r) => r.date === date && r.studentId === studentId);
    if (recs.length === 0) return null;

    const present = recs.filter((r) => r.status === 'Present').length;
    const absent = recs.filter((r) => r.status === 'Absent').length;
    const late = recs.filter((r) => r.status === 'Late').length;

    const all = attendanceRecords.filter((r) => r.studentId === studentId);
    const overallPresent = all.filter((r) => r.status !== 'Absent').length;
    const corrections = readCorrections()
      .filter((c) => c.date === date && c.studentId === studentId)
      .sort((a, b) => String(b.correctedAt).localeCompare(String(a.correctedAt)));

    const report = {
      reportId: makeReportId('student', date),
      role: 'student',
      date,
      studentId,
      registerNumber: st.registerNumber,
      name: st.name,
      department: st.department,
      year: st.year,
      semester: st.semester,
      section: st.section,
      totalClasses: recs.length,
      present,
      absent,
      late,
      percentage: pct(present + late, recs.length),
      overallPercentage: pct(overallPresent, all.length),
      currentAttendance: all.length ? pct(overallPresent, all.length) : 0,
      lowAttendance: all.length > 0 && pct(overallPresent, all.length) < LOWATT_THRESHOLD,
      lowAttendanceStatus: all.length === 0 ? 'no-data'
        : pct(overallPresent, all.length) >= LOWATT_THRESHOLD ? 'normal'
        : pct(overallPresent, all.length) >= 70 ? 'warning' : 'critical',
      subjects: recs.map((r) => ({
        subjectCode: r.subjectCode,
        subjectName: r.subjectName || subjectNameFor(r.subjectCode),
        hour: r.hour,
        className: r.className || classNameFor(r.classId),
        status: r.status,
        method: r.method || 'camera'
      })).sort((a, b) => Number(a.hour) - Number(b.hour)),
      corrections: corrections.map((c) => ({
        sessionId: c.sessionId,
        className: c.className,
        subjectName: c.subjectName,
        originalStatus: c.originalStatus,
        newStatus: c.newStatus,
        reason: c.reason,
        correctedBy: c.correctedBy,
        correctedAt: c.correctedAt
      })),
      manuallyCorrected: corrections.length > 0
    };
    return report;
  };

  /* ---------- Staff report ---------- */

  const buildStaffReport = (date, staffId) => {
    const member = staff.find((x) => x.id === staffId);
    if (!member) return null;
    const recs = attendanceRecords.filter((r) => r.date === date && r.staffId === staffId);
    if (recs.length === 0) return null;

    const by = {};
    recs.forEach((r) => {
      const key = sessionKey(r);
      (by[key] = by[key] || { className: '', classId: r.classId, section: r.section, subjectCode: r.subjectCode, subjectName: r.subjectName || subjectNameFor(r.subjectCode), hour: r.hour, records: [] }).records.push(r);
      by[key].className = by[key].className || r.className || classNameFor(r.classId);
    });

    const sessions = Object.values(by).sort((a, b) => Number(a.hour) - Number(b.hour)).map((g) => {
      const present = g.records.filter((r) => r.status === 'Present' || r.status === 'Late').length;
      return {
        className: g.className,
        classId: g.classId,
        section: g.section,
        subjectCode: g.subjectCode,
        subjectName: g.subjectName,
        hour: g.hour,
        students: g.records.length,
        present,
        absent: g.records.length - present,
        camera: g.records.filter((r) => (r.method || 'camera') === 'camera').length,
        manual: g.records.filter((r) => r.method === 'manual').length,
        manualCorrections: g.records.filter((r) => r.method === 'camera_corrected').length,
        status: 'Completed'
      };
    });

    const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date + 'T00:00:00').getDay()];
    const handledKeys = new Set(recs.map(sessionKey));
    const assignedCodes = (member.subjects || []).map((n) => {
      const s = subjects.find((x) => x.name === n);
      return s ? s.code : null;
    }).filter(Boolean);
    const pendingRecs = timetableRecords.filter((t) => {
      return t.day === dayAbbr && (assignedCodes.length ? assignedCodes.includes(t.subjectCode) : true) &&
             (!member.classes || member.classes.length === 0 || member.classes.includes(t.classId)) &&
             !handledKeys.has(`${t.classId}|${t.section || ''}|${t.subjectCode}|${t.hour}`);
    });

    const totalStudents = sessions.reduce((a, s) => a + s.students, 0);
    const present = sessions.reduce((a, s) => a + s.present, 0);
    const absent = sessions.reduce((a, s) => a + s.absent, 0);

    const myStudents = students.filter((s) => (member.classes || []).includes(s.classId));
    const lowAlerts = getAlertsEnriched().filter((a) => (member.classes || []).includes(a.classId));

    const camSessions = sessionsForDate(date, staffId);
    const cameraCompleted = camSessions.filter((s) => s.status === 'COMPLETED').length;
    const corrections = readCorrections().filter((c) => c.date === date && c.staffId === staffId)
      .sort((a, b) => String(b.correctedAt).localeCompare(String(a.correctedAt)));
    const cameraFailed = camSessions.filter((s) => s.status === 'ERROR' || s.status === 'PAUSED' || s.status === 'DISCONNECTED' || (s.camera && (s.camera.status === 'error' || s.camera.status === 'disconnected' && s.status === 'COMPLETED'))).length;

    return {
      reportId: makeReportId('staff', date),
      role: 'staff',
      date,
      staffId,
      staffName: member.name,
      staffCode: member.staffId,
      department: member.department,
      sessions,
      completedSessions: sessions.length,
      pendingSessions: pendingRecs.length,
      totalStudents,
      present,
      absent,
      percentage: pct(present, present + absent),
      cameraSessionsCompleted: cameraCompleted,
      cameraSessionsFailed: cameraFailed,
      totalCorrections: corrections.length,
      corrections: corrections.map((c) => ({
        sessionId: c.sessionId,
        className: c.className,
        subjectName: c.subjectName,
        registerNumber: c.registerNumber,
        studentName: c.name,
        originalStatus: c.originalStatus,
        newStatus: c.newStatus,
        reason: c.reason,
        correctedBy: c.correctedBy,
        correctedAt: c.correctedAt
      })),
      assignedStudentsCount: myStudents.length,
      lowAttendanceCount: lowAlerts.length,
      lowAttendance: lowAlerts.map((a) => ({
        studentId: a.studentId,
        registerNumber: a.registerNumber,
        name: a.name,
        classId: a.classId,
        className: a.className,
        classLabel: a.classLabel,
        attendancePercentage: a.attendancePercentage,
        staffName: a.staffName
      }))
    };
  };

  /* ---------- HOD report ---------- */

  const buildHODReport = (date, hodId) => {
    const hod = hods.find((x) => x.id === hodId);
    if (!hod) return null;
    const records = attendanceRecords.filter((r) => r.date === date);
    if (records.length === 0) return null;

    const camSessions = sessionsForDate(date);
    const completed = camSessions.filter((s) => s.status === 'COMPLETED').length;
    const interrupted = camSessions.filter((s) => s.status !== 'COMPLETED' || (s.camera && s.camera.status === 'error') || (s.camera && s.camera.status === 'disconnected')) .length;
    const corrections = readCorrections().filter((c) => c.date === date)
      .sort((a, b) => String(b.correctedAt).localeCompare(String(a.correctedAt)));
    const correctionsBySession = {};
    corrections.forEach((c) => {
      (correctionsBySession[c.sessionId] = correctionsBySession[c.sessionId] || { sessionId: c.sessionId, className: c.className, subjectName: c.subjectName, count: 0 }).count += 1;
    });
    const sessionMeta = {};
    camSessions.forEach((s) => { sessionMeta[s.sessionId] = s; });

    const threshold = (readReportSettings() || DEFAULT_SETTINGS).threshold || 75;
    const alerts = students.map((st) => {
      const all = attendanceRecords.filter((r) => r.studentId === st.id);
      if (!all.length) return null;
      const present = all.filter((r) => r.status !== 'Absent').length;
      const percentage = pct(present, all.length);
      if (percentage >= threshold) return null;
      return { studentId: st.id, registerNumber: st.registerNumber, name: st.name, percentage };
    }).filter(Boolean);

    const cameraIssues = camSessions.map((s) => ({
      sessionId: s.sessionId,
      className: s.classLabel,
      subjectName: s.subjectName,
      cameraName: s.cameraName,
      status: s.status,
      cameraStatus: s.camera ? s.camera.status : 'unknown'
    }));

    /* 80%-based low-attendance view (fixed business rule) for the
       HOD report — distinct from the configurable alerts section. */
    const lowAlerts = getAlertsEnriched();
    const lowAttendanceSummary = {
      totalStudents: students.length,
      below80: lowAlerts.length,
      between70and79: lowAlerts.filter((a) => a.attendancePercentage >= 70).length,
      below70: lowAlerts.filter((a) => a.attendancePercentage < 70).length
    };

    return {
      reportId: makeReportId('hod', date),
      role: 'hod',
      date,
      hodId,
      hodName: hod.name,
      hodCode: hod.hodId,
      departmentId: hod.department || 'dept-ai',
      department: hod.department || 'AI&DS',
      totalStudents: students.length,
      totalStaff: staff.length,
      totalClasses: classesList.length,
      totalSessions: new Set(records.map(sessionKey)).size,
      completedSessions: completed || new Set(records.map(sessionKey)).size,
      interruptedSessions: interrupted,
      departmentPercentage: pct(records.filter((r) => r.status === 'Present' || r.status === 'Late').length, records.length),
      classSummary: buildClassSummary(records),
      subjectSummary: buildSubjectSummary(records),
      staffSummary: buildStaffSummary(records),
      alerts,
      lowAttendanceSummary,
      lowAttendanceCount: lowAlerts.length,
      lowAttendance: lowAlerts.map((a) => ({
        studentId: a.studentId,
        registerNumber: a.registerNumber,
        name: a.name,
        classId: a.classId,
        className: a.className,
        classLabel: a.classLabel,
        attendancePercentage: a.attendancePercentage,
        staffName: a.staffName
      })),
      cameraIssues,
      totalCorrections: corrections.length,
      correctionsSummary: {
        total: corrections.length,
        sessionsWithCorrections: Object.keys(correctionsBySession).length,
        sessions: Object.values(correctionsBySession).map((s) => {
          const meta = sessionMeta[s.sessionId] || {};
          return { ...s, className: s.className || meta.classLabel, subjectName: s.subjectName || meta.subjectName, section: meta.section, hour: meta.hour };
        })
      }
    };
  };

  /* ---------- In-memory mirrors (loaded from localStorage) ---------- */

  let students = read('students', []);
  let staff = read('staff', []);
  let hods = read('hod', []);
  let attendanceRecords = read('attendance', []);
  let subjects = read('subjects', []);
  let classesList = read('classes', []);
  let timetableRecords = read('timetable', []);
  let academicYears = read('academicYears', []);

  const persistAll = () => {
    write('students', students);
    write('staff', staff);
    write('hod', hods);
    write('attendance', attendanceRecords);
    write('subjects', subjects);
    write('classes', classesList);
    write('timetable', timetableRecords);
    write('academicYears', academicYears);
  };

  /* ---------- Duplicate guards ---------- */

  const norm = (v) => String(v || '').trim().toLowerCase();

  const existsStudentId = (reg, excludeId) =>
    students.some((s) => s.id !== excludeId && norm(s.registerNumber) === norm(reg));
  const existsStudentEmail = (email, excludeId) => {
    const e = String(email || '').trim().toLowerCase();
    return !!e && students.some((s) => s.id !== excludeId && norm(s.email) === e);
  };
  const existsStaffId = (id, excludeId) =>
    staff.some((f) => f.id !== excludeId && norm(f.staffId) === norm(id));
  const existsStaffEmail = (email, excludeId) => {
    const e = String(email || '').trim().toLowerCase();
    return !!e && staff.some((f) => f.id !== excludeId && norm(f.email) === e);
  };
  const existsHodId = (id, excludeId) =>
    hods.some((h) => h.id !== excludeId && norm(h.hodId) === norm(id));
  const existsHodEmail = (email, excludeId) => {
    const e = String(email || '').trim().toLowerCase();
    return !!e && hods.some((h) => h.id !== excludeId && norm(h.email) === e);
  };
  const existsClassId = (id, excludeId) =>
    classesList.some((c) => c.id !== excludeId && norm(c.id) === norm(id));
  const existsSubjectCode = (code, excludeId) =>
    subjects.some((s) => s.id !== excludeId && norm(s.code) === norm(code));
  const existsAcademicYear = (y) => academicYears.some((a) => norm(a) === norm(y));

  /* ---------- API ---------- */

  const api = {

    /* ===== Auth ===== */

    login: (userId, password) => new Promise((resolve) => {
      setTimeout(() => {
        const id = String(userId || '').trim();
        if (!id || !password) { resolve({ success: false, message: 'Invalid User ID or Password.' }); return; }

        const student = students.find((s) => s.registerNumber && norm(s.registerNumber) === norm(id));
        const member  = staff.find((f) => f.staffId && norm(f.staffId) === norm(id));
        const hod     = hods.find((h) => h.hodId && norm(h.hodId) === norm(id));

        const person = student || member || hod;
        if (!person) { resolve({ success: false, message: 'Invalid User ID or Password.' }); return; }

        const role = student ? 'Student' : member ? 'Staff' : 'HOD';
        const personUserId = person.registerNumber || person.staffId || person.hodId;
        const overrides = readPwOverrides();
        const expected = overrides[String(personUserId)] || person.password;

        if (expected !== password) {
          resolve({ success: false, message: 'Invalid User ID or Password.' });
          return;
        }

        person.lastLogin = today();
        persistAll();

        resolve({
          success: true,
          user: {
            id: person.id,
            userId: personUserId,
            role,
            personId: person.id,
            person,
            name: person.name,
            department: person.department,
            profilePhoto: null
          }
        });
      }, 400);
    }),

    /* ===== Getters ===== */

    getStudents: () => students.map((s) => ({ ...s })),
    getStaff: () => staff.map((f) => ({ ...f })),
    getHODs: () => hods.map((h) => ({ ...h })),
    getClasses: () => classesList.map((c) => ({ ...c })),
    getSubjects: () => subjects.map((s) => ({ ...s })),
    getDepartments: () => departments.map((d) => ({ ...d })),
    getAcademicYears: () => [...academicYears],
    getSemesters: () => [...semesters],
    getSections: () => [...sections],
    getTimetable: () => timetableRecords.map((t) => ({ ...t })),

    getAttendance: () => attendanceRecords.map((r) => ({ ...r })),
    getStudentAttendance: (studentId) => attendanceRecords.filter((r) => r.studentId === studentId).map((r) => ({ ...r })),
    getAttendanceByClass: (className) => attendanceRecords.filter((r) => r.classId === className).map((r) => ({ ...r })),
    getAttendanceByStaff: (staffId) => attendanceRecords.filter((r) => r.staffId === staffId).map((r) => ({ ...r })),

    /* ===== Students ===== */

    addStudent: (data) => {
      const reg = String(data.registerNumber || '').trim();
      if (!reg) return { ok: false, message: 'Register Number is required.', record: null };
      if (existsStudentId(reg)) return { ok: false, message: DUPLICATE_ID, record: null };
      if (existsStudentEmail(data.email)) return { ok: false, message: DUPLICATE_EMAIL, record: null };

      const record = {
        id: uid('S'),
        registerNumber: reg,
        password: String(data.password || '').trim() || reg,
        name: String(data.name || '').trim(),
        department: String(data.department || '').trim() || 'AI&DS',
        year: String(data.year || '').trim() || 'I',
        semester: String(data.semester || '').trim(),
        section: String(data.section || '').trim(),
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
        whatsappNumber: (validateWhatsAppNumber(data.whatsappNumber).ok ? data.whatsappNumber : '').trim(),
        whatsappConsent: !!data.whatsappConsent,
        status: 'Active',
        createdAt: today()
      };

      students.push(record);
      persistAll();
      return { ok: true, message: 'Student added successfully.', record };
    },

    updateStudent: (id, data) => {
      const idx = students.findIndex((s) => s.id === id);
      if (idx === -1) return { ok: false, message: 'Student not found.', record: null };

      const current = students[idx];
      const reg = String(data.registerNumber || current.registerNumber || '').trim();

      if (existsStudentId(reg, id)) return { ok: false, message: DUPLICATE_ID, record: null };
      if (existsStudentEmail(data.email, id)) return { ok: false, message: DUPLICATE_EMAIL, record: null };

      const regChanged = reg !== current.registerNumber;
      current.registerNumber = reg;
      current.name = String(data.name ?? current.name).trim();
      current.department = String(data.department ?? current.department).trim() || 'AI&DS';
      current.year = String(data.year ?? current.year).trim();
      current.semester = String(data.semester ?? current.semester).trim();
      current.section = String(data.section ?? current.section).trim();
      current.email = String(data.email ?? current.email).trim();
      current.phone = String(data.phone ?? current.phone).trim();
      if (data.whatsappNumber !== undefined) {
        if (String(data.whatsappNumber).trim() === '') {
          current.whatsappNumber = '';
        } else {
          const v = validateWhatsAppNumber(data.whatsappNumber);
          if (v.ok) current.whatsappNumber = v.phone;
        }
      }
      if (data.whatsappConsent !== undefined) current.whatsappConsent = !!data.whatsappConsent;
      current.dob = data.dob ?? current.dob;
      current.lastUpdated = today();
      if (regChanged) {
        // Login ID changed -> reset the initial password to the new ID.
        current.password = reg;
        const overrides = readPwOverrides();
        delete overrides[current.registerNumber];
        writePwOverrides(overrides);
      }

      persistAll();
      return { ok: true, message: 'Student updated successfully.', record: current };
    },

    removeStudent: (id) => {
      const idx = students.findIndex((s) => s.id === id);
      if (idx > -1) students.splice(idx, 1);
      attendanceRecords = attendanceRecords.filter((r) => r.studentId !== id);
      removeAlertFor(id);
      writeReminders(readReminders().filter((r) => !(r.studentIds || []).includes(id)));
      persistAll();
    },

    /* ===== Staff ===== */

    addStaff: (data) => {
      const id = String(data.staffId || '').trim();
      if (!id) return { ok: false, message: 'Staff ID is required.', record: null };
      if (existsStaffId(id)) return { ok: false, message: DUPLICATE_ID, record: null };
      if (existsStaffEmail(data.email)) return { ok: false, message: DUPLICATE_EMAIL, record: null };

      const record = {
        id: uid('F'),
        staffId: id,
        password: String(data.password || '').trim() || id,
        name: String(data.name || '').trim(),
        department: String(data.department || '').trim() || 'AI&DS',
        designation: String(data.designation || '').trim(),
        qualification: String(data.qualification || '').trim(),
        experienceYears: String(data.experienceYears ?? data.experience).trim(),
        joiningDate: String(data.joiningDate || '').trim(),
        employmentStatus: String(data.employmentStatus || '').trim() || 'Active',
        subjects: Array.isArray(data.subjects) ? data.subjects.map(String) : [],
        classes: Array.isArray(data.classes) ? data.classes.map(String) : [],
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
        whatsappNumber: (validateWhatsAppNumber(data.whatsappNumber).ok ? data.whatsappNumber : '').trim(),
        whatsappConsent: !!data.whatsappConsent,
        status: 'Active',
        createdAt: today()
      };

      staff.push(record);
      persistAll();
      return { ok: true, message: 'Staff added successfully.', record };
    },

    updateStaff: (id, data) => {
      const idx = staff.findIndex((f) => f.id === id);
      if (idx === -1) return { ok: false, message: 'Staff not found.', record: null };

      const current = staff[idx];
      const staffId = String(data.staffId || current.staffId || '').trim();

      if (existsStaffId(staffId, id)) return { ok: false, message: DUPLICATE_ID, record: null };
      if (existsStaffEmail(data.email, id)) return { ok: false, message: DUPLICATE_EMAIL, record: null };

      const idChanged = staffId !== current.staffId;
      current.staffId = staffId;
      current.name = String(data.name ?? current.name).trim();
      current.designation = String(data.designation ?? current.designation).trim();
      current.qualification = data.qualification !== undefined ? String(data.qualification).trim() : current.qualification;
      current.experienceYears = data.experienceYears !== undefined ? String(data.experienceYears).trim() : current.experienceYears;
      current.joiningDate = data.joiningDate !== undefined ? String(data.joiningDate).trim() : current.joiningDate;
      current.employmentStatus = data.employmentStatus !== undefined ? (String(data.employmentStatus).trim() || 'Active') : current.employmentStatus;
      current.subjects = Array.isArray(data.subjects) ? data.subjects.map(String) : current.subjects;
      current.classes = Array.isArray(data.classes) ? data.classes.map(String) : current.classes;
      current.email = String(data.email ?? current.email).trim();
      current.phone = String(data.phone ?? current.phone).trim();
      if (data.whatsappNumber !== undefined) {
        if (String(data.whatsappNumber).trim() === '') {
          current.whatsappNumber = '';
        } else {
          const v = validateWhatsAppNumber(data.whatsappNumber);
          if (v.ok) current.whatsappNumber = v.phone;
        }
      }
      if (data.whatsappConsent !== undefined) current.whatsappConsent = !!data.whatsappConsent;
      current.dob = data.dob ?? current.dob;
      current.lastUpdated = today();
      if (idChanged) {
        current.password = staffId;
        const overrides = readPwOverrides();
        delete overrides[current.staffId];
        writePwOverrides(overrides);
      }

      persistAll();
      return { ok: true, message: 'Staff updated successfully.', record: current };
    },

    removeStaff: (id) => {
      const idx = staff.findIndex((f) => f.id === id);
      if (idx > -1) staff.splice(idx, 1);
      // Cascade: drop the staff member's daily attendance + audit trail.
      writeStaffAttendance(readStaffAttendance().filter((r) => r.staffId !== id));
      writeStaffAudit(readStaffAudit().filter((a) => a.staffId !== id));
      persistAll();
    },

    /* ===== Staff Daily Attendance ===== */

    getStaffAttendance: (filters = {}) => {
      let list = readStaffAttendance();
      if (filters.staffId) list = list.filter((r) => r.staffId === filters.staffId);
      if (filters.date) list = list.filter((r) => r.date === filters.date);
      if (filters.from) list = list.filter((r) => r.date >= filters.from);
      if (filters.to) list = list.filter((r) => r.date <= filters.to);
      if (filters.status) list = list.filter((r) => r.status === filters.status);
      return list.map((r) => ({ ...r }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.staffId).localeCompare(String(b.staffId)));
    },

    getStaffAttendanceOn: (staffId, date) => {
      const rec = readStaffAttendance().find((r) => r.staffId === staffId && r.date === date);
      return rec ? { ...rec } : null;
    },

    /* Unique key = staffId + date. Existing entries are UPDATED in
       place — never duplicated. Every change appends an audit entry
       recording who marked/changed it and from what status. Only an
       HOD session may mark or edit staff attendance. */
    markStaffAttendance: (payload = {}) => {
      const staffId = String(payload.staffId || '').trim();
      const date = String(payload.date || '').trim();
      const status = String(payload.status || '').trim().toLowerCase();
      const role = String(payload.role || '').trim();
      if (!staff.find((f) => f.id === staffId)) return { ok: false, message: 'Staff member not found.', record: null };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: 'Invalid date.', record: null };
      if (!STAFF_ATT_STATUSES.includes(status)) return { ok: false, message: 'Invalid attendance status.', record: null };
      if (role !== 'HOD') return { ok: false, message: 'Only the HOD can mark or edit staff attendance.', record: null };

      const list = readStaffAttendance();
      const idx = list.findIndex((r) => r.staffId === staffId && r.date === date);
      const existed = idx > -1;
      const nowIso = new Date().toISOString();
      const markedBy = String(payload.markedBy || '').trim() || 'HOD';
      const reason = String(payload.remarks || payload.reason || '').trim();

      let record;
      if (existed) {
        const old = list[idx];
        record = {
          ...old,
          status,
          checkIn: payload.checkIn !== undefined ? String(payload.checkIn).trim() : (old.checkIn || ''),
          checkOut: payload.checkOut !== undefined ? String(payload.checkOut).trim() : (old.checkOut || ''),
          remarks: payload.remarks !== undefined ? String(payload.remarks).trim() : (old.remarks || ''),
          updatedAt: nowIso,
          updatedBy: markedBy
        };
        list[idx] = record;
        pushStaffAudit({ staffId, date, oldStatus: old.status, newStatus: status, action: 'update', markedBy, timestamp: nowIso, reason });
      } else {
        record = {
          attendanceId: uid('sa'),
          staffId,
          date,
          status,
          checkIn: String(payload.checkIn || '').trim(),
          checkOut: String(payload.checkOut || '').trim(),
          remarks: reason,
          markedBy,
          createdBy: markedBy,
          createdAt: nowIso,
          updatedAt: null,
          updatedBy: null
        };
        list.push(record);
        pushStaffAudit({ staffId, date, oldStatus: 'not_marked', newStatus: status, action: 'create', markedBy, timestamp: nowIso, reason });
      }

      writeStaffAttendance(list);
      return { ok: true, message: existed ? 'Staff attendance updated.' : 'Staff attendance marked.', record: { ...record }, existed };
    },

    getStaffAttendanceStats: (staffId) => staffAttStatsOf(staffId),

    /* Today-style rollup used by the HOD dashboard / profile summary. */
    getStaffAttendanceDailyStats: (date) => {
      const members = staff;
      const recMap = {};
      readStaffAttendance().filter((r) => r.date === date).forEach((r) => { recMap[r.staffId] = r; });
      const stats = { totalStaff: members.length, present: 0, absent: 0, late: 0, leave: 0, halfDay: 0, notMarked: 0, marked: 0, averagePct: 0 };
      let attendedSum = 0, workingSum = 0;
      members.forEach((f) => {
        const s = staffAttStatsOf(f.id);
        attendedSum += s.attended;
        workingSum += s.workingDays;
        const rec = recMap[f.id];
        const st = rec ? rec.status : 'not_marked';
        if (st === 'not_marked') { stats.notMarked += 1; }
        else { stats.marked += 1; if (stats[st] !== undefined) stats[st] += 1; }
      });
      stats.averagePct = workingSum ? Math.round((attendedSum / workingSum) * 100) : 0;
      return stats;
    },

    /* Staff-wise rollup for the Reports "Staff Attendance" report. */
    getStaffAttendanceReport: (filters = {}) => {
      let members = [...staff];
      if (filters.staffId) members = members.filter((f) => f.id === filters.staffId);
      if (filters.department) members = members.filter((f) => norm(f.department) === norm(String(filters.department)));
      if (filters.designation) members = members.filter((f) => norm(f.designation) === norm(String(filters.designation)));
      return members.map((f) => {
        const s = staffAttStatsOf(f.id, filters.from, filters.to);
        return {
          staffId: f.id,
          staffCode: f.staffId,
          name: f.name,
          department: f.department || 'AI&DS',
          designation: f.designation || '',
          ...s
        };
      });
    },

    /* Staff members whose real attendance is STRICTLY below 80%
       (exactly 80% is not flagged). Staff with no marked days are
       "not marked" — they are NOT reported as low attendance. */
    getStaffLowAttendanceMembers: () => staff.map((f) => {
      const s = staffAttStatsOf(f.id);
      return {
        staffId: f.id,
        staffCode: f.staffId,
        name: f.name,
        department: f.department || 'AI&DS',
        designation: f.designation || '',
        attendancePercentage: s.attendancePct,
        workingDays: s.workingDays,
        present: s.present,
        absent: s.absent,
        lastAttendanceDate: s.lastAttendanceDate
      };
    }).filter((x) => x.workingDays > 0 && x.attendancePercentage < 80),

    getStaffAttendanceAudit: (filters = {}) => {
      let list = readStaffAudit();
      if (filters.staffId) list = list.filter((a) => a.staffId === filters.staffId);
      if (filters.date) list = list.filter((a) => a.date === filters.date);
      return list.map((a) => ({ ...a }))
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    },

    /* ===== HOD ===== */

    createHOD: (data) => {
      const id = String(data.hodId || '').trim();
      if (!id) return { ok: false, message: 'HOD ID is required.', record: null };
      if (existsHodId(id)) return { ok: false, message: DUPLICATE_ID, record: null };
      if (existsHodEmail(data.email)) return { ok: false, message: DUPLICATE_EMAIL, record: null };
      if (!data.password || String(data.password).length < 6) return { ok: false, message: 'Password must be at least 6 characters.', record: null };

      const record = {
        id: uid('H'),
        hodId: id,
        password: String(data.password),
        name: String(data.name || '').trim(),
        department: String(data.department || '').trim() || 'AI&DS',
        designation: 'Head of Department',
        email: String(data.email || '').trim(),
        phone: String(data.phone || '').trim(),
        whatsappNumber: (validateWhatsAppNumber(data.whatsappNumber).ok ? data.whatsappNumber : '').trim(),
        whatsappConsent: !!data.whatsappConsent,
        status: 'Active',
        createdAt: today()
      };

      hods.push(record);
      persistAll();
      return { ok: true, message: 'HOD account created successfully.', record };
    },

    updateHod: (id, data) => {
      const idx = hods.findIndex((h) => h.id === id);
      if (idx === -1) return { ok: false, message: 'HOD not found.', record: null };

      const current = hods[idx];
      const hodId = String(data.hodId || current.hodId || '').trim();

      if (existsHodId(hodId, id)) return { ok: false, message: DUPLICATE_ID, record: null };
      if (existsHodEmail(data.email, id)) return { ok: false, message: DUPLICATE_EMAIL, record: null };

      const idChanged = hodId !== current.hodId;
      current.hodId = hodId;
      current.name = String(data.name ?? current.name).trim();
      current.email = String(data.email ?? current.email).trim();
      current.phone = String(data.phone ?? current.phone).trim();
      if (data.whatsappNumber !== undefined) {
        if (String(data.whatsappNumber).trim() === '') {
          current.whatsappNumber = '';
        } else {
          const v = validateWhatsAppNumber(data.whatsappNumber);
          if (v.ok) current.whatsappNumber = v.phone;
        }
      }
      if (data.whatsappConsent !== undefined) current.whatsappConsent = !!data.whatsappConsent;
      current.dob = data.dob ?? current.dob;
      current.lastUpdated = today();
      if (idChanged) {
        current.password = hodId;
        const overrides = readPwOverrides();
        delete overrides[current.hodId];
        writePwOverrides(overrides);
      }

      persistAll();
      return { ok: true, message: 'HOD profile updated successfully.', record: current };
    },

    /* ===== Classes / Subjects / Academic Years ===== */

    addClass: (data) => {
      const id = String(data.id || '').trim();
      if (!id) return { ok: false, message: 'Class ID is required.', record: null };
      if (existsClassId(id)) return { ok: false, message: DUPLICATE_ID, record: null };

      const record = {
        id,
        label: String(data.label || '').trim(),
        section: String(data.section || '').trim(),
        className: String(data.className || '').trim() || `${id} Sem B.Tech AI&DS`
      };
      classesList.push(record);
      persistAll();
      return { ok: true, message: 'Class added successfully.', record };
    },

    addSubject: (data) => {
      const code = String(data.code || '').trim().toUpperCase();
      if (!code) return { ok: false, message: 'Subject code is required.', record: null };
      if (existsSubjectCode(code)) return { ok: false, message: DUPLICATE_ID, record: null };

      const record = {
        id: uid('sub'),
        code,
        name: String(data.name || '').trim(),
        semester: String(data.semester || '').trim()
      };
      subjects.push(record);
      persistAll();
      return { ok: true, message: 'Subject added successfully.', record };
    },

    addAcademicYear: (year) => {
      const y = String(year || '').trim();
      if (!y) return { ok: false, message: 'Enter an academic year.', record: null };
      if (existsAcademicYear(y)) return { ok: false, message: DUPLICATE_ID, record: null };
      academicYears.push(y);
      persistAll();
      return { ok: true, message: `Academic year ${y} added.`, record: y };
    },

    /* ===== Attendance ===== */

    submitAttendance: (payload) => new Promise((resolve) => {
      setTimeout(() => {
        const records = payload && payload.records;
        if (!records || !records.length) { resolve({ success: false, message: 'No attendance records provided.' }); return; }

        const first = records[0];
        const duplicate = attendanceRecords.some(
          (r) => r.date === first.date && r.classId === first.classId && r.subjectCode === first.subjectCode && r.hour === first.hour
        );
        if (duplicate) { resolve({ success: false, message: 'Attendance for this class and hour has already been submitted.' }); return; }

        const cls = classesList.find((c) => c.id === first.classId);
        const subject = subjects.find((s) => s.code === first.subjectCode);

        records.forEach((rec) => {
          attendanceRecords.push({
            id: `att-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            date: rec.date || first.date,
            studentId: rec.studentId,
            studentName: rec.studentName,
            registerNumber: rec.registerNumber,
            subjectCode: rec.subjectCode || first.subjectCode,
            subjectName: rec.subjectName || (subject ? subject.name : first.subjectCode),
            classId: rec.classId || first.classId,
            className: cls ? cls.className : '',
            semester: rec.semester || first.semester || '',
            section: rec.section || first.section || '',
            hour: rec.hour || first.hour,
            status: rec.status,
            staffId: rec.staffId || first.staffId
          });
        });

        persistAll();

        // Bridge the manual submit into the realtime bus so that open
        // tabs (dashboards / live monitor) recompute low-attendance
        // alerts without a manual refresh.
        if (window.RealtimeService && typeof RealtimeService.emit === 'function') {
          RealtimeService.emit('attendance.updated', {
            source: 'manual',
            count: records.length,
            date: first.date,
            classId: first.classId,
            subjectCode: first.subjectCode,
            ts: Date.now()
          });
        }

        resolve({ success: true, message: 'Attendance submitted successfully.' });
      }, 500);
    }),

    /* ===== Password ===== */

    updatePassword: (userId, newPassword) => {
      const id = String(userId || '').trim();
      const person = students.find((s) => norm(s.registerNumber) === norm(id))
        || staff.find((f) => norm(f.staffId) === norm(id))
        || hods.find((h) => norm(h.hodId) === norm(id));

      if (!person) return { success: false, message: 'Account not found.' };
      if (!newPassword || String(newPassword).length < 6) return { success: false, message: 'New password must be at least 6 characters.' };

      person.password = String(newPassword);
      person.passwordUpdatedAt = today();
      const overrides = readPwOverrides();
      overrides[person.registerNumber || person.staffId || person.hodId] = String(newPassword);
      writePwOverrides(overrides);
      persistAll();
      return { success: true, message: 'Password updated successfully.' };
    },

    /* ===== Attendance Sessions (live camera monitoring) ===== */

    createAttendanceSession: (payload) => {
      const date = payload.date || today();
      const classId = String(payload.classId || '').trim();
      const section = String(payload.section || '').trim();
      const subjectCode = String(payload.subjectCode || '').trim().toUpperCase();
      const hour = String(payload.hour || '').trim();

      // Duplicate guard — one live session per class + subject + hour per day.
      const existing = readSessions().some(
        (s) => s.date === date && s.classId === classId && s.section === section &&
               s.subjectCode === subjectCode && s.hour === hour && ACTIVE_STATUSES.includes(s.status)
      );
      if (existing) return null;

      const sessionStudents = Array.isArray(payload.students) && payload.students.length
        ? payload.students
        : students.filter((s) => s.year === (payload.classLabel || classId) && s.section === section)
            .map((s) => ({ studentId: s.id, registerNumber: s.registerNumber, name: s.name, section: s.section, status: 'pending', timestamp: null, method: null }));

      const session = {
        sessionId: uid('sess'),
        staffId: String(payload.staffId || '').trim(),
        staffName: String(payload.staffName || '').trim(),
        classId,
        classLabel: String(payload.classLabel || classId).trim(),
        section,
        subjectCode,
        subjectName: String(payload.subjectName || subjectCode).trim(),
        hour,
        room: String(payload.room || '').trim(),
        cameraId: String(payload.cameraId || 'cam-classroom-01').trim(),
        cameraName: String(payload.cameraName || 'Classroom Camera 01').trim(),
        date,
        status: 'WAITING',
        startedAt: new Date().toISOString(),
        endedAt: null,
        students: sessionStudents,
        camera: {
          cameraId: String(payload.cameraId || 'cam-classroom-01').trim(),
          status: 'disconnected',
          connectionQuality: null,
          lastSignal: null,
          message: 'Waiting for classroom camera connection…'
        }
      };

      recomputeCounts(session);

      const list = readSessions();
      list.push(session);
      writeSessions(list);
      return session;
    },

    getActiveSessions: () => {
      const now = today();
      return readSessions()
        .filter((s) => s.date === now && ACTIVE_STATUSES.includes(s.status))
        .map((s) => ({ ...s }));
    },

    getRecentSessions: (limit) => {
      const all = readSessions();
      return all
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
        .slice(0, limit || 10)
        .map((s) => ({ ...s }));
    },

    getSessionById: (id) => {
      const session = readSessions().find((s) => s.sessionId === id);
      return session ? { ...session } : null;
    },

    applyAttendanceEvent: (sessionId, studentId, status) => {
      const list = readSessions();
      const session = list.find((s) => s.sessionId === sessionId);
      if (!session) return null;
      if (!['present', 'absent', 'late', 'pending'].includes(status)) return null;

      const student = (session.students || []).find((st) => st.studentId === studentId);
      if (!student) return null;

      student.status = status;
      student.timestamp = new Date().toISOString();
      student.method = status === 'pending' ? null : 'manual';

      recomputeCounts(session);
      writeSessions(list);

      return {
        session: { ...session },
        event: { sessionId, studentId, status, timestamp: student.timestamp, method: student.method }
      };
    },

    setCameraStatus: (sessionId, status, message) => {
      const list = readSessions();
      const session = list.find((s) => s.sessionId === sessionId);
      if (!session) return null;

      const previousStatus = session.camera.status;
      session.camera.status = status;
      session.camera.lastSignal = new Date().toISOString();
      session.camera.connectionQuality = status === 'connected' ? 'excellent' : null;
      if (message !== undefined) session.camera.message = message;

      writeSessions(list);
      return { session: { ...session }, previousStatus };
    },

    setSessionStatus: (sessionId, status) => {
      const list = readSessions();
      const session = list.find((s) => s.sessionId === sessionId);
      if (!session) return null;
      if (!['WAITING', 'CONNECTING', 'LIVE', 'PAUSED', 'DISCONNECTED', 'ERROR', 'COMPLETED'].includes(status)) return null;

      session.status = status;
      if (status === 'COMPLETED') session.endedAt = new Date().toISOString();

      writeSessions(list);
      return { ...session };
    },

    completeAttendanceSession: (sessionId) => {
      const list = readSessions();
      const session = list.find((s) => s.sessionId === sessionId);
      if (!session) return null;
      if (session.status === 'COMPLETED') return null;

      // Any student left pending when the session ends is marked absent.
      (session.students || []).forEach((st) => {
        if (st.status === 'pending') {
          st.status = 'absent';
          st.timestamp = new Date().toISOString();
          st.method = 'camera-attendance';
        }
      });

      recomputeCounts(session);
      session.status = 'COMPLETED';
      session.endedAt = new Date().toISOString();
      writeSessions(list);

      // Persist the concrete attendance records for the completed session.
      const subject = subjects.find((s) => s.code === session.subjectCode);
      const cls = classesList.find((c) => c.id === session.classId);
      (session.students || []).forEach((st) => {
        if (st.status !== 'present' && st.status !== 'absent' && st.status !== 'late') return;
        const alreadySaved = attendanceRecords.some(
          (r) => r.sessionId === session.sessionId && r.studentId === st.studentId
        );
        if (alreadySaved) return;
        attendanceRecords.push({
          id: uid('att'),
          sessionId: session.sessionId,
          date: session.date,
          studentId: st.studentId,
          studentName: st.name,
          registerNumber: st.registerNumber,
          subjectCode: session.subjectCode,
          subjectName: subject ? subject.name : session.subjectName,
          classId: session.classId,
          className: cls ? cls.className : session.classLabel,
          semester: cls ? cls.label : session.classLabel,
          section: session.section,
          hour: session.hour,
          status: st.status === 'late' ? 'Late' : st.status === 'present' ? 'Present' : 'Absent',
          staffId: session.staffId,
          source: st.method === 'manual' ? 'manual' : 'camera',
          method: st.method === 'manual' ? 'manual' : 'camera',
          detectedAt: st.timestamp || null,
          updatedAt: null,
          updatedBy: null
        });
      });
      persistAll();

      return {
        session: { ...session },
        presentCount: session.presentCount,
        absentCount: session.absentCount
      };
    },

    /* ===== Manual Attendance Corrections (staff fallback) =====
       Corrects an EXISTING completed camera session by sessionId —
       never duplicates a session. Corrections carry an audit trail
       (who, when, from, to, why) and flow through to the persisted
       attendance records so reports / WhatsApp / low-attendance use
       the FINAL result. */

    getCorrectionSettings: () => ({
      correctionWindowMins: Number((readReportSettings() || DEFAULT_SETTINGS).correctionWindowMins) || 120
    }),

    saveCorrectionSettings: (patch) => {
      const cfg = { ...DEFAULT_SETTINGS, ...(readReportSettings() || DEFAULT_SETTINGS), ...patch };
      writeReportSettings(cfg);
      return { ok: true, message: 'Attendance correction settings saved.' };
    },

    /* Find the existing session (any status) for a date + class +
       section + subject + hour selection. Manual corrections REUSE
       this sessionId — a matching camera session is never duplicated. */
    findAttendanceSession: (criteria) => {
      const date = String((criteria && criteria.date) || '').trim();
      const classId = String((criteria && criteria.classId) || '').trim();
      const section = String((criteria && criteria.section) || '').trim();
      const subjectCode = String((criteria && criteria.subjectCode) || '').trim().toUpperCase();
      const hour = String((criteria && criteria.hour) || '').trim();
      if (!date || !classId || !subjectCode || !hour) return null;
      const session = readSessions().find(
        (s) => s.date === date && s.classId === classId && s.section === section &&
               s.subjectCode === subjectCode && s.hour === hour
      );
      return session ? recomputeCounts({ ...session }) : null;
    },

    getAttendanceCorrections: (filters) => {
      const list = readCorrections().filter((c) => {
        if (filters && filters.sessionId && c.sessionId !== filters.sessionId) return false;
        if (filters && filters.date && c.date !== filters.date) return false;
        if (filters && filters.staffId && c.staffId !== filters.staffId) return false;
        return true;
      }).sort((a, b) => String(b.correctedAt).localeCompare(String(a.correctedAt)));

      return list.map((c) => {
        const st = students.find((x) => x.id === c.studentId);
        const s = readSessions().find((x) => x.sessionId === c.sessionId) || null;
        return {
          ...c,
          registerNumber: c.registerNumber || (st && st.registerNumber) || '',
          name: c.name || (st && st.name) || '',
          className: s ? s.classLabel : (c.className || ''),
          subjectName: s && s.subjectName ? s.subjectName : (c.subjectName || '')
        };
      });
    },

    applyAttendanceCorrection: (payload) => {
      const sessionId = String(payload && payload.sessionId).trim();
      const studentId = String(payload && payload.studentId).trim();
      const newStatus = String(payload && payload.newStatus).toLowerCase();
      const correctedBy = String(payload && payload.correctedBy).trim();
      const reason = String(payload && payload.reason).trim();
      if (!sessionId || !studentId || !['present', 'absent', 'late'].includes(newStatus)) {
        return { ok: false, message: 'Invalid correction request.' };
      }
      if (String(payload && payload.role).trim() !== 'Staff') {
        return { ok: false, message: 'Only staff can correct attendance.' };
      }

      const list = readSessions();
      const session = list.find((s) => s.sessionId === sessionId);
      if (!session) return { ok: false, message: 'Attendance session not found.' };
      const student = (session.students || []).find((st) => st.studentId === studentId);
      if (!student) return { ok: false, message: 'Student not found in this session.' };

      const nowIso = new Date().toISOString();
      const wasCamera = student.method !== 'manual';
      const method = wasCamera ? 'camera_corrected' : 'manual';
      if (wasCamera && !reason) return { ok: false, message: 'A reason is required when correcting a camera result.' };
      const previousStatus = student.status;

      student.status = newStatus;
      student.method = method;
      student.reason = reason;
      student.updatedAt = nowIso;
      student.updatedBy = correctedBy;
      student.correctionCount = (student.correctionCount || 0) + 1;
      recomputeCounts(session);
      writeSessions(list);

      const rec = attendanceRecords.find((r) => r.sessionId === sessionId && r.studentId === studentId);
      if (rec) {
        rec.status = capStatus(newStatus);
        rec.method = method;
        rec.updatedAt = nowIso;
        rec.updatedBy = correctedBy;
        rec.reason = reason;
        if (!rec.detectedAt) rec.detectedAt = student.timestamp || null;
      }

      const correction = {
        correctionId: uid('corr'),
        attendanceId: rec ? rec.id : uid('att'),
        sessionId,
        date: session.date,
        studentId,
        registerNumber: student.registerNumber,
        name: student.name,
        className: session.classLabel,
        subjectName: session.subjectName,
        staffId: session.staffId,
        originalStatus: previousStatus,
        newStatus,
        reason,
        correctedBy,
        correctedAt: nowIso,
        method
      };
      const corrList = readCorrections();
      corrList.push(correction);
      writeCorrections(corrList);

      persistAll();

      return { ok: true, message: 'Attendance correction saved.', session: { ...session }, record: rec || null, correction };
    },

    bulkApplyAttendanceCorrections: (payload) => {
      const sessionId = String(payload && payload.sessionId).trim();
      const entries = Array.isArray(payload && payload.entries) ? payload.entries : [];
      const correctedBy = String(payload && payload.correctedBy).trim();
      const doBulk = String(payload && payload.role).trim() === 'Staff';
      const safe = (e) => ({
        studentId: String(e && e.studentId).trim(),
        newStatus: String(e && e.newStatus).toLowerCase(),
        reason: String(e && e.reason).trim()
      });
      if (!sessionId || !entries.length) return { ok: false, message: 'Invalid correction request.' };
      if (!doBulk) return { ok: false, message: 'Only staff can correct attendance.' };

      const list = readSessions();
      const session = list.find((s) => s.sessionId === sessionId);
      if (!session) return { ok: false, message: 'Attendance session not found.' };

      const applied = [];
      const nowIso = new Date().toISOString();
      entries.forEach((e) => {
        const se = safe(e);
        if (!se.studentId || !['present', 'absent', 'late'].includes(se.newStatus)) return;
        const student = (session.students || []).find((st) => st.studentId === se.studentId);
        if (!student) return;
        const wasCamera = student.method !== 'manual';
        if (wasCamera && !se.reason) return;
        const method = wasCamera ? 'camera_corrected' : 'manual';
        const previousStatus = student.status;

        student.status = se.newStatus;
        student.method = method;
        student.reason = se.reason;
        student.updatedAt = nowIso;
        student.updatedBy = correctedBy;
        student.correctionCount = (student.correctionCount || 0) + 1;

        const rec = attendanceRecords.find((r) => r.sessionId === sessionId && r.studentId === se.studentId);
        if (rec) {
          rec.status = capStatus(se.newStatus);
          rec.method = method;
          rec.updatedAt = nowIso;
          rec.updatedBy = correctedBy;
          rec.reason = se.reason;
          if (!rec.detectedAt) rec.detectedAt = student.timestamp || null;
        }

        applied.push({
          correction: {
            correctionId: uid('corr'),
            attendanceId: rec ? rec.id : uid('att'),
            sessionId,
            date: session.date,
            studentId: se.studentId,
            registerNumber: student.registerNumber,
            name: student.name,
            className: session.classLabel,
            subjectName: session.subjectName,
            staffId: session.staffId,
            originalStatus: previousStatus,
            newStatus: se.newStatus,
            reason: se.reason,
            correctedBy,
            correctedAt: nowIso,
            method
          }
        });
      });

      if (!applied.length) return { ok: false, message: 'No valid corrections to apply.' };

      recomputeCounts(session);
      writeSessions(list);
      const corrList = readCorrections();
      corrList.push(...applied.map((a) => a.correction));
      writeCorrections(corrList);
      persistAll();

      return {
        ok: true,
        count: applied.length,
        message: `Attendance corrections applied to ${applied.length} student(s).`,
        session: { ...session },
        corrections: applied.map((a) => a.correction)
      };
    },

    finalizeAttendanceSession: (sessionId) => {
      const list = readSessions();
      const session = list.find((s) => s.sessionId === sessionId);
      if (!session) return { ok: false, message: 'Attendance session not found.' };
      if (session.status !== 'COMPLETED') return { ok: false, message: 'Only completed sessions can be finalized.' };
      if (session.finalized) return { ok: false, message: 'Attendance has already been finalized.' };
      session.finalized = true;
      session.finalizedAt = new Date().toISOString();
      recomputeCounts(session);
      writeSessions(list);
      return { ok: true, session: { ...session } };
    },

    /* ===== Daily Reports & WhatsApp Delivery ===== */

    validateWhatsAppNumber,
    fmtWhatsApp,

    reportExists: (date, role, userId) => {
      const key = role === 'student' ? 'studentId' : role === 'staff' ? 'staffId' : 'hodId';
      return !!readReports().find((r) => r.role === role && r.date === date && r[key] === userId);
    },

    getDailyReportByUser: (date, role, userId) => {
      const key = role === 'student' ? 'studentId' : role === 'staff' ? 'staffId' : 'hodId';
      return readReports().find((r) => r.role === role && r.date === date && r[key] === userId) || null;
    },

    getDailyReportById: (reportId) => {
      return readReports().find((r) => r.reportId === reportId) || null;
    },

    generateStudentReport: (date, studentId) => {
      const report = buildStudentReport(date, studentId);
      if (!report) return null;
      const list = readReports();
      const existing = list.find((r) => r.role === 'student' && r.date === date && r.studentId === studentId);
      if (existing) return existing;
      list.push(report);
      writeReports(list);
      return report;
    },

    generateStaffReport: (date, staffId) => {
      const report = buildStaffReport(date, staffId);
      if (!report) return null;
      const list = readReports();
      const existing = list.find((r) => r.role === 'staff' && r.date === date && r.staffId === staffId);
      if (existing) return existing;
      list.push(report);
      writeReports(list);
      return report;
    },

    generateHODReport: (date, hodId) => {
      const report = buildHODReport(date, hodId);
      if (!report) return null;
      const list = readReports();
      const existing = list.find((r) => r.role === 'hod' && r.date === date && r.hodId === hodId);
      if (existing) return existing;
      list.push(report);
      writeReports(list);
      return report;
    },

    generateAllDailyReports: (date) => {
      const list = readReports();
      const target = date || today();
      const generated = [];
      let skipped = 0;

      students.forEach((st) => {
        if (!attendanceRecords.some((r) => r.date === target && r.studentId === st.id)) { skipped++; return; }
        if (list.some((r) => r.role === 'student' && r.date === target && r.studentId === st.id)) { skipped++; return; }
        const report = buildStudentReport(target, st.id);
        if (report) { list.push(report); generated.push(report); }
      });

      staff.forEach((f) => {
        if (!attendanceRecords.some((r) => r.date === target && r.staffId === f.id)) { skipped++; return; }
        if (list.some((r) => r.role === 'staff' && r.date === target && r.staffId === f.id)) { skipped++; return; }
        const report = buildStaffReport(target, f.id);
        if (report) { list.push(report); generated.push(report); }
      });

      hods.forEach((h) => {
        if (!attendanceRecords.some((r) => r.date === target)) { skipped++; return; }
        if (list.some((r) => r.role === 'hod' && r.date === target && r.hodId === h.id)) { skipped++; return; }
        const report = buildHODReport(target, h.id);
        if (report) { list.push(report); generated.push(report); }
      });

      writeReports(list);
      return { ok: true, generated: generated.length, skipped, reports: generated };
    },

    getDailyReports: (filters = {}) => {
      let list = readReports();
      if (filters.date) list = list.filter((r) => r.date === filters.date);
      if (filters.role) list = list.filter((r) => r.role === filters.role);
      if (filters.role !== 'student' && filters.staffId) list = list.filter((r) => r.staffId === filters.staffId);
      if (filters.role === 'student') {
        if (filters.classId) list = list.filter((r) => {
          const st = students.find((x) => x.id === r.studentId);
          return st && st.year === filters.classId;
        });
        if (filters.section) list = list.filter((r) => {
          const st = students.find((x) => x.id === r.studentId);
          return st && st.section === filters.section;
        });
        if (filters.q) {
          const q = filters.q.trim().toLowerCase();
          list = list.filter((r) => (r.registerNumber + ' ' + r.name + ' ' + r.section).toLowerCase().includes(q));
        }
      }
      return list.map((r) => ({ ...r }));
    },

    getReportSettings: () => ({ ...(readReportSettings() || DEFAULT_SETTINGS) }),

    saveReportSettings: (patch) => {
      const cfg = { ...DEFAULT_SETTINGS, ...(readReportSettings() || DEFAULT_SETTINGS), ...patch };
      if (cfg.dailyReportTime && !/^\d{2}:\d{2}$/.test(cfg.dailyReportTime)) {
        return { ok: false, message: 'Report time must be a valid HH:MM value.' };
      }
      writeReportSettings(cfg);
      return { ok: true, message: 'Report settings saved.', settings: { ...cfg } };
    },

    createDelivery: (rec) => {
      const list = readDeliveries();
      const record = {
        deliveryId: uid('del'),
        reportId: rec.reportId,
        reportRole: rec.reportRole,
        recipientId: rec.recipientId,
        recipientRole: rec.recipientRole,
        recipientName: rec.recipientName,
        recipientCode: rec.recipientCode,
        phoneNumber: rec.phoneNumber,
        date: rec.date,
        status: 'queued',
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        recordedAt: new Date().toISOString(),
        error: rec.error || ''
      };
      list.push(record);
      writeDeliveries(list);
      return { ...record };
    },

    updateDelivery: (deliveryId, patch) => {
      const list = readDeliveries();
      const idx = list.findIndex((d) => d.deliveryId === deliveryId);
      if (idx === -1) return null;
      Object.assign(list[idx], patch);
      writeDeliveries(list);
      return { ...list[idx] };
    },

    getDeliveries: (filters = {}) => {
      let list = readDeliveries();
      if (filters.date) list = list.filter((d) => d.date === filters.date);
      if (filters.role) list = list.filter((d) => d.recipientRole === filters.role);
      if (filters.status) list = list.filter((d) => d.status === filters.status);
      if (filters.q) {
        const q = filters.q.trim().toLowerCase();
        list = list.filter((d) =>
          (d.recipientName + ' ' + d.recipientCode + ' ' + d.phoneNumber + ' ' + d.reportRole).toLowerCase().includes(q));
      }
      return list.map((r) => ({ ...r })).sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)));
    },

    getDeliveryStats: (date) => {
      const deliveries = readDeliveries().filter((d) => d.date === date);
      const sentStatuses = ['sent', 'delivered', 'read'];
      const deliveredStatuses = ['delivered', 'read'];
      return {
        generated: readReports().filter((r) => r.date === date).length,
        sent: deliveries.filter((d) => sentStatuses.includes(d.status)).length,
        delivered: deliveries.filter((d) => deliveredStatuses.includes(d.status)).length,
        failed: deliveries.filter((d) => d.status === 'failed').length,
        queued: deliveries.filter((d) => d.status === 'queued' || d.status === 'sending').length
      };
    },

    /* ===== Low Attendance Alerts ===== */

    getLowAttendanceStudents: () => getAlertsEnriched(),

    getStudentLowAttendance: (studentId) => getAlertsEnriched().find((a) => a.studentId === studentId) || null,

    /* Staff can only see low-attendance students belonging to the
       classes assigned to them (frontend restriction; the real backend
       must enforce the same rule). */
    getStaffLowAttendance: (staffId) => {
      const person = staff.find((f) => f.id === staffId);
      const classes = (person && person.classes) || [];
      return getAlertsEnriched().filter((a) => classes.includes(a.classId));
    },

    getHODLowAttendance: (hodId) => {
      const hod = hods.find((h) => h.id === hodId);
      const dept = (hod && hod.department) || '';
      return getAlertsEnriched().filter((a) => !dept || a.departmentId === dept || a.department === dept);
    },

    getStudentAttendanceStats: (studentId) => studentStatsOf(studentId),

    /* Recalculate one student's percentage against the 80% rule and
       create/update or remove their active alert accordingly. */
    checkAttendanceThreshold: (studentId) => {
      const stats = studentStatsOf(studentId);
      const result = {
        studentId,
        percentage: stats.percentage,
        totalClasses: stats.total,
        belowThreshold: stats.total > 0 && stats.percentage < LOWATT_THRESHOLD
      };
      if (result.belowThreshold) {
        result.alert = createAlertFor(studentId, stats.percentage, stats.lastDate);
      } else {
        removeAlertFor(studentId);
        result.alert = null;
      }
      return result;
    },

    createLowAttendanceAlert: (studentId) => {
      const stats = studentStatsOf(studentId);
      if (stats.total === 0 || stats.percentage >= LOWATT_THRESHOLD) return null;
      return createAlertFor(studentId, stats.percentage, stats.lastDate);
    },

    removeLowAttendanceAlert: (studentId) => {
      removeAlertFor(studentId);
      return true;
    },

    /* Re-evaluate every student after any attendance change. Students
       back at/above 80% automatically lose their alert. */
    recomputeLowAttendanceAlerts: () => recomputeAllAlerts(),

    getLowAttendanceStats: (studentId) => {
      const alerts = getAlertsEnriched();
      const total = alerts.length;
      const between = alerts.filter((a) => a.attendancePercentage >= 70 && a.attendancePercentage < 80).length;
      const below = alerts.filter((a) => a.attendancePercentage < 70).length;
      const all = students.length;
      return { totalStudents: all, below80: total, between70and79: between, below70: below };
    },

    /* ===== Low Attendance Reminders ===== */

    getReminderSettings: () => ({ ...readReminderSettings() }),

    saveReminderSettings: (patch) => {
      const cfg = { ...DEFAULT_REMINDER_SETTINGS, ...readReminderSettings(), ...patch };
      if (cfg.frequency && !['daily', 'weekly', 'manual'].includes(cfg.frequency)) {
        return { ok: false, message: 'Reminder frequency must be daily, weekly or manual.' };
      }
      if (cfg.reminderTime && !/^\d{2}:\d{2}$/.test(String(cfg.reminderTime || ''))) {
        return { ok: false, message: 'Reminder time must be a valid HH:MM value.' };
      }
      writeReminderSettings(cfg);
      return { ok: true, message: 'Reminder settings saved.', settings: { ...cfg } };
    },

    getReminders: (filters = {}) => {
      let list = readReminders();
      if (filters.date) list = list.filter((r) => r.date === filters.date);
      if (filters.role) list = list.filter((r) => r.recipientRole === filters.role);
      if (filters.status) list = list.filter((r) => r.status === filters.status);
      return list
        .map((r) => ({ ...r }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    getReminderById: (reminderId) => readReminders().find((r) => r.reminderId === reminderId) || null,

    reminderExists: (reminderId) => readReminders().some((r) => r.reminderId === reminderId),

    /* A reminder is considered "already sent" once it reaches a
       terminal/final queued state — it will not be re-created. */
    reminderFinished: (reminderId) => {
      const r = readReminders().find((x) => x.reminderId === reminderId);
      return !!r && ['queued', 'sent', 'delivered', 'read'].includes(r.status);
    },

    createReminder: (rec) => {
      const record = {
        reminderId: rec.reminderId,
        recipientId: rec.recipientId,
        recipientRole: rec.recipientRole,
        recipientName: rec.recipientName || '',
        recipientCode: rec.recipientCode || '',
        recipientPhone: rec.recipientPhone || '',
        studentIds: rec.studentIds || [],
        date: rec.date || today(),
        channel: rec.channel || 'whatsapp',
        status: rec.status || 'prepared',
        createdAt: new Date().toISOString(),
        sentAt: rec.sentAt || null,
        message: rec.message || '',
        messageType: rec.messageType || 'whatsapp',
        error: rec.error || ''
      };
      const list = readReminders();
      const idx = list.findIndex((r) => r.reminderId === record.reminderId);
      if (idx > -1) { list[idx] = record; } else { list.push(record); }
      writeReminders(list);
      return { ...record };
    },

    updateReminderStatus: (reminderId, patch) => {
      const list = readReminders();
      const idx = list.findIndex((r) => r.reminderId === reminderId);
      if (idx === -1) return null;
      Object.assign(list[idx], patch);
      writeReminders(list);
      return { ...list[idx] };
    },

    /* Generate the reminder record for today. Duplicate detection is
       keyed by the unique reminder IDs defined by the business rules:
         LOWATT-HOD-[DATE]
         LOWATT-STAFF-[DATE]-[STAFF_ID]
         LOWATT-STUDENT-[DATE]-[STUDENT_ID]
       Pass force:true when an authorized user explicitly resends. */
    generateLowAttendanceReminder: (payload) => {
      const date = (payload && payload.date) || today();
      const role = payload && payload.role; // 'hod' | 'staff' | 'student' | 'parent'
      const style = (payload && payload.messageStyle) === 'daily' ? 'daily' : 'whatsapp';
      let record = null;

      if (role === 'hod') {
        const hod = hods.find((h) => h.id === payload.recipientId) || hods[0];
        if (!hod) return { ok: false, code: 'no-recipient', message: 'No HOD account found.', record: null };
        const alerts = getAlertsEnriched();
        record = {
          reminderId: `LOWATT-HOD-${date}`,
          recipientId: hod.id,
          recipientRole: 'HOD',
          recipientName: hod.name,
          recipientCode: hod.hodId,
          recipientPhone: hod.whatsappNumber || '',
          studentIds: alerts.map((a) => a.studentId),
          date,
          channel: 'whatsapp',
          messageType: style,
          status: 'prepared',
          message: style === 'daily' ? buildHODDailyReminderMessage(date) : buildHODReminderMessage(date)
        };
      } else if (role === 'staff') {
        const person = staff.find((f) => f.id === payload.recipientId);
        if (!person) return { ok: false, code: 'no-recipient', message: 'Staff member not found.', record: null };
        const alerts = getAlertsEnriched().filter((a) => (person.classes || []).includes(a.classId));
        record = {
          reminderId: `LOWATT-STAFF-${date}-${person.id}`,
          recipientId: person.id,
          recipientRole: 'Staff',
          recipientName: person.name,
          recipientCode: person.staffId,
          recipientPhone: person.whatsappNumber || '',
          studentIds: alerts.map((a) => a.studentId),
          date,
          channel: 'whatsapp',
          messageType: style,
          status: 'prepared',
          message: style === 'daily' ? buildStaffDailyReminderMessage(date, person.id) : buildStaffReminderMessage(date, person.id)
        };
      } else if (role === 'student') {
        const st = students.find((s) => s.id === payload.recipientId);
        const stats = st ? studentStatsOf(st.id) : { total: 0, percentage: 0 };
        if (!st || stats.total === 0 || stats.percentage >= LOWATT_THRESHOLD) {
          return { ok: false, code: 'no-alert', message: 'This student is not below the 80% attendance threshold.', record: null };
        }
        record = {
          reminderId: `LOWATT-STUDENT-${date}-${st.registerNumber}`,
          recipientId: st.id,
          recipientRole: 'Student',
          recipientName: st.name,
          recipientCode: st.registerNumber,
          recipientPhone: st.whatsappNumber || '',
          studentIds: [st.id],
          date,
          channel: 'whatsapp',
          status: 'prepared',
          message: buildStudentReminderMessage(st.id)
        };
      } else if (role === 'parent') {
        const st = students.find((s) => s.id === payload.recipientId);
        const stats = st ? studentStatsOf(st.id) : { total: 0, percentage: 0 };
        if (!st || stats.total === 0 || stats.percentage >= LOWATT_THRESHOLD) {
          return { ok: false, code: 'no-alert', message: 'This student is not below the 80% attendance threshold.', record: null };
        }
        // Parent messaging is never auto-enabled: it requires a valid
        // WhatsApp number AND consent AND explicit configuration.
        if (!st.whatsappNumber || !st.whatsappConsent) {
          return { ok: false, code: 'no-parent-contact', message: 'Parent messaging requires a valid WhatsApp number and consent.', record: null };
        }
        record = {
          reminderId: `LOWATT-PARENT-${date}-${st.registerNumber}`,
          recipientId: st.id,
          recipientRole: 'Parent',
          recipientName: st.name,
          recipientCode: st.registerNumber,
          recipientPhone: st.whatsappNumber || '',
          studentIds: [st.id],
          date,
          channel: 'whatsapp',
          status: 'prepared',
          message: buildParentReminderMessage(st.id)
        };
      }

      if (!record) return { ok: false, code: 'no-role', message: 'Unknown reminder role.', record: null };

      if (!payload.force && api.reminderFinished(record.reminderId)) {
        return { ok: false, code: 'already-sent', message: "Today's reminder has already been sent.", record: api.getReminderById(record.reminderId) };
      }
      const saved = api.createReminder(record);
      return { ok: true, record: saved, duplicate: payload.force ? false : api.reminderExists(record.reminderId) };
    },

    getReminderMessagePreview: (role, recipientId, date) => {
      if (role === 'hod') return buildHODReminderMessage(date || today());
      if (role === 'staff') return buildStaffReminderMessage(date || today(), recipientId);
      if (role === 'student') return buildStudentReminderMessage(recipientId);
      if (role === 'parent') return buildParentReminderMessage(recipientId);
      return '';
    },

    /* ===== Maintenance ===== */

    hasAccounts: () => students.length > 0 || staff.length > 0 || hods.length > 0,

    resetAllData: () => {
      students = [];
      staff = [];
      hods = [];
      attendanceRecords = [];
      subjects = [];
      classesList = [];
      timetableRecords = [];
      academicYears = [];
      Object.values(STORE_KEYS).forEach((key) => { try { localStorage.removeItem(key); } catch (_e) { /* no-op */ } });
      try { localStorage.removeItem('attendance_pw_overrides'); } catch (_e) { /* no-op */ }
      return { ok: true, message: 'All data has been deleted.' };
    }
  };

  return api;
})();