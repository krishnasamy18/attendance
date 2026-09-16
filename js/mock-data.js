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
    academicYears: 'attendance_academic_years'
  };

  // Generic academic configuration (not sample records).
  const departments = [
    { id: 'dept-ai', code: 'AI&DS', name: 'Artificial Intelligence and Data Science' }
  ];
  const semesters = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const sections = ['A', 'B', 'UV'];

  const DUPLICATE_ID = 'A record with this ID already exists.';
  const DUPLICATE_EMAIL = 'A record with this email already exists.';

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