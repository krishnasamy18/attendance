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
    reportSettings: 'attendance_report_settings'
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
    return { autoEnabled: false, dailyReportTime: '18:00', threshold: 75 };
  };
  const writeReportSettings = (cfg) => {
    try { localStorage.setItem(STORE_KEYS.reportSettings, JSON.stringify(cfg)); }
    catch (_e) { /* storage full / unavailable */ }
  };

  const DEFAULT_SETTINGS = { autoEnabled: false, dailyReportTime: '18:00', threshold: 75 };

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
      subjects: recs.map((r) => ({
        subjectCode: r.subjectCode,
        subjectName: r.subjectName || subjectNameFor(r.subjectCode),
        hour: r.hour,
        className: r.className || classNameFor(r.classId),
        status: r.status
      })).sort((a, b) => Number(a.hour) - Number(b.hour))
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

    const camSessions = sessionsForDate(date, staffId);
    const cameraCompleted = camSessions.filter((s) => s.status === 'COMPLETED').length;
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
      cameraSessionsFailed: cameraFailed
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
      cameraIssues
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
      persistAll();
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
          source: 'camera-attendance'
        });
      });
      persistAll();

      return {
        session: { ...session },
        presentCount: session.presentCount,
        absentCount: session.absentCount
      };
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