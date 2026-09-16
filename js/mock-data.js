/* ============================================================
   Mock Data (MOCK API LAYER)
   ------------------------------------------------------------
   This module simulates a backend REST API.
   Swap these functions for real fetch() calls later without
   touching the rest of the UI code. Subjects, staff, classes,
   attendance etc. are seeded here.
   ============================================================ */

window.DB = (() => {

  /* ---------- Departments, Classes, Subjects ---------- */

  const departments = [
    { id: 'dept-ai', code: 'AI&DS', name: 'Artificial Intelligence and Data Science' }
  ];

  const classesList = [
    { id: 'I', label: 'I Semester', section: 'UV', className: 'I Sem B.Tech AI&DS' },
    { id: 'II', label: 'II Semester', section: 'UV', className: 'II Sem B.Tech AI&DS' },
    { id: 'III', label: 'III Semester', section: 'UV', className: 'III Sem B.Tech AI&DS' },
    { id: 'IV', label: 'IV Semester', section: 'UV', className: 'IV Sem B.Tech AI&DS' }
  ];

  const subjects = [
    { id: 'sub-ai', code: 'AI', name: 'Artificial Intelligence', semester: '3' },
    { id: 'sub-ml', code: 'ML', name: 'Machine Learning', semester: '3' },
    { id: 'sub-ds', code: 'DS', name: 'Data Structures', semester: '3' },
    { id: 'sub-dssa', code: 'DSSA', name: 'Data Science Systems and Applications', semester: '7' },
    { id: 'sub-dbms', code: 'DBMS', name: 'Database Management Systems', semester: '5' }
  ];

  const academicYears = ['2024-2025', '2025-2026'];
  const semesters = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const sections = ['A', 'B', 'UV'];

  /* ---------- Users (Accounts) ---------- */

  const users = [
    // Students
    { id: 'u-1', userId: '2021AI001', password: 'student123', role: 'Student', personId: 'S1' },
    { id: 'u-2', userId: '2021AI002', password: 'student123', role: 'Student', personId: 'S2' },
    { id: 'u-3', userId: '2021AI003', password: 'student123', role: 'Student', personId: 'S3' },
    { id: 'u-4', userId: '2021AI004', password: 'student123', role: 'Student', personId: 'S4' },
    { id: 'u-5', userId: '2021AI005', password: 'student123', role: 'Student', personId: 'S5' },
    { id: 'u-6', userId: '2021AI006', password: 'student123', role: 'Student', personId: 'S6' },
    { id: 'u-7', userId: '2021AI007', password: 'student123', role: 'Student', personId: 'S7' },
    { id: 'u-8', userId: '2021AI008', password: 'student123', role: 'Student', personId: 'S8' },
    // Staff
    { id: 'u-9', userId: 'STAFF001', password: 'staff123', role: 'Staff', personId: 'F1' },
    { id: 'u-10', userId: 'STAFF002', password: 'staff123', role: 'Staff', personId: 'F2' },
    { id: 'u-11', userId: 'STAFF003', password: 'staff123', role: 'Staff', personId: 'F3' },
    // HOD
    { id: 'u-12', userId: 'HODAI001', password: 'hod123', role: 'HOD', personId: 'H1' }
  ];

  /* ---------- People: Students ---------- */

  const students = [
    { id: 'S1', registerNumber: '2021AI001', name: 'Arjun Nair', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'arjun.nair@student.edu', phone: '9876543210', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S2', registerNumber: '2021AI002', name: 'Divya Sharma', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'divya.sharma@student.edu', phone: '9876543211', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S3', registerNumber: '2021AI003', name: 'Rahul Krishnan', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'rahul.k@student.edu', phone: '9876543212', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S4', registerNumber: '2021AI004', name: 'Meera Pillai', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'meera.p@student.edu', phone: '9876543213', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S5', registerNumber: '2021AI005', name: 'Vikram Singh', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'vikram.s@student.edu', phone: '9876543214', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S6', registerNumber: '2021AI006', name: 'Ananya Iyer', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'ananya.i@student.edu', phone: '9876543215', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S7', registerNumber: '2021AI007', name: 'Karthik Menon', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'karthik.m@student.edu', phone: '9876543216', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S8', registerNumber: '2021AI008', name: 'Riya Thomas', department: 'AI&DS', year: 'IV', semester: '7', section: 'A', email: 'riya.t@student.edu', phone: '9876543217', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S9', registerNumber: '2022AI001', name: 'Aditya Verma', department: 'AI&DS', year: 'III', semester: '5', section: 'B', email: 'aditya.v@student.edu', phone: '9876543218', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S10', registerNumber: '2022AI002', name: 'Shreya Ghosh', department: 'AI&DS', year: 'III', semester: '5', section: 'B', email: 'shreya.g@student.edu', phone: '9876543219', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S11', registerNumber: '2022AI003', name: 'Nikhil Das', department: 'AI&DS', year: 'III', semester: '5', section: 'B', email: 'nikhil.d@student.edu', phone: '9876543220', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S12', registerNumber: '2022AI004', name: 'Lakshmi Nair', department: 'AI&DS', year: 'III', semester: '5', section: 'B', email: 'lakshmi.n@student.edu', phone: '9876543221', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S13', registerNumber: '2023AI001', name: 'Rohan Gupta', department: 'AI&DS', year: 'II', semester: '3', section: 'A', email: 'rohan.g@student.edu', phone: '9876543222', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S14', registerNumber: '2023AI002', name: 'Sneha Reddy', department: 'AI&DS', year: 'II', semester: '3', section: 'A', email: 'sneha.r@student.edu', phone: '9876543223', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S15', registerNumber: '2023AI003', name: 'Praveen Raj', department: 'AI&DS', year: 'II', semester: '3', section: 'A', email: 'praveen.r@student.edu', phone: '9876543224', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S16', registerNumber: '2023AI004', name: 'Fatima Khan', department: 'AI&DS', year: 'II', semester: '3', section: 'A', email: 'fatima.k@student.edu', phone: '9876543225', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S17', registerNumber: '2024AI001', name: 'Arvind Kumar', department: 'AI&DS', year: 'I', semester: '1', section: 'A', email: 'arvind.k@student.edu', phone: '9876543226', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S18', registerNumber: '2024AI002', name: 'Priya Varma', department: 'AI&DS', year: 'I', semester: '1', section: 'A', email: 'priya.v@student.edu', phone: '9876543227', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S19', registerNumber: '2024AI003', name: 'Sanjay Bhat', department: 'AI&DS', year: 'I', semester: '1', section: 'A', email: 'sanjay.b@student.edu', phone: '9876543228', profilePhoto: 'assets/images/default-student.png' },
    { id: 'S20', registerNumber: '2024AI004', name: 'Ishita Malhotra', department: 'AI&DS', year: 'I', semester: '1', section: 'A', email: 'ishita.m@student.edu', phone: '9876543229', profilePhoto: 'assets/images/default-student.png' }
  ];

  /* ---------- People: Staff ---------- */

  const staff = [
    { id: 'F1', staffId: 'STAFF001', name: 'Prof. Suresh Kumar', department: 'AI&DS', designation: 'Assistant Professor', email: 'suresh.kumar@college.edu', phone: '9812345670', subjects: ['Machine Learning', 'Data Science Systems and Applications'], classes: ['II', 'IV'], profilePhoto: 'assets/images/default-staff.png' },
    { id: 'F2', staffId: 'STAFF002', name: 'Dr. Anitha Ram', department: 'AI&DS', designation: 'Associate Professor', email: 'anitha.ram@college.edu', phone: '9812345671', subjects: ['Artificial Intelligence', 'Data Structures'], classes: ['III', 'II'], profilePhoto: 'assets/images/default-staff.png' },
    { id: 'F3', staffId: 'STAFF003', name: 'Prof. Kiran Rao', department: 'AI&DS', designation: 'Assistant Professor', email: 'kiran.rao@college.edu', phone: '9812345672', subjects: ['Database Management Systems', 'Data Structures'], classes: ['III', 'I'], profilePhoto: 'assets/images/default-staff.png' }
  ];

  /* ---------- People: HOD ---------- */

  const hods = [
    { id: 'H1', hodId: 'HODAI001', name: 'Dr. G. Ramesh Kumar', department: 'AI&DS', education: 'Ph.D. Computer Science', email: 'ramesh.kumar@college.edu', phone: '9812345673', profilePhoto: 'assets/images/default-hod.png' }
  ];

  /* ---------- Attendance Records ---------- */

  // Deterministic pseudo-random generator so data is stable across reloads
  const mulberry32 = (seed) => {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- Profile metadata enrichment (deterministic per record) ---------- */

  const hashStr = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (h >>> 0);
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDate = (y, m, d) => y + '-' + pad2(m) + '-' + pad2(d);

  const enrichPeople = () => {
    const schoolYear = 2026;
    students.forEach((st) => {
      const r = mulberry32(hashStr(st.registerNumber));
      const regYear = parseInt(st.registerNumber.slice(0, 4), 10) || 2021;
      st.gender = r() < 0.5 ? 'Male' : 'Female';
      st.dob = isoDate(regYear - 18, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 27));
      st.academicYear = parseInt(st.semester, 10) >= 5 ? '2024-2025' : '2025-2026';
      st.batch = st.year + ' Year';
      st.createdAt = isoDate(regYear, 7, 1 + Math.floor(r() * 28));
      st.lastUpdated = isoDate(schoolYear, 8, 1 + Math.floor(r() * 27));
      st.lastLogin = isoDate(schoolYear, new Date().getMonth() + 1, 1 + Math.floor(r() * 25));
      st.status = 'Active';
    });

    staff.forEach((f) => {
      const r = mulberry32(hashStr(f.staffId));
      f.gender = r() < 0.5 ? 'Male' : 'Female';
      f.dob = isoDate(1978 + Math.floor(r() * 12), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 27));
      f.qualification = ['M.Tech (CSE)', 'Ph.D. Computer Science', 'B.E., M.Tech (AI&DS)'][Math.floor(r() * 3)];
      f.joiningDate = isoDate(2014 + Math.floor(r() * 7), 7, 1 + Math.floor(r() * 28));
      f.experienceYears = schoolYear - parseInt(f.joiningDate.slice(0, 4), 10);
      f.academicYear = '2025-2026';
      f.createdAt = f.joiningDate;
      f.lastUpdated = isoDate(schoolYear, 7, 1 + Math.floor(r() * 28));
      f.lastLogin = isoDate(schoolYear, new Date().getMonth() + 1, 1 + Math.floor(r() * 25));
      f.status = 'Active';
    });

    hods.forEach((h) => {
      const r = mulberry32(hashStr(h.hodId));
      h.gender = r() < 0.5 ? 'Male' : 'Female';
      h.dob = isoDate(1972 + Math.floor(r() * 6), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 27));
      h.qualification = h.education || 'Ph.D. Computer Science';
      h.joiningDate = isoDate(2008 + Math.floor(r() * 6), 7, 1 + Math.floor(r() * 28));
      h.experienceYears = schoolYear - parseInt(h.joiningDate.slice(0, 4), 10);
      h.academicYear = '2025-2026';
      h.createdAt = h.joiningDate;
      h.lastUpdated = isoDate(schoolYear, 6, 1 + Math.floor(r() * 28));
      h.lastLogin = isoDate(schoolYear, new Date().getMonth() + 1, 1 + Math.floor(r() * 25));
      h.status = 'Active';
    });
  };

  enrichPeople();

  const HISTORY_DAYS = 90;
  const attendanceSeed = (() => {
    const records = [];
    const rand = mulberry32(202600);
    // Subject codes assigned per staff
    const staffSubjectMap = {
      F1: ['ML', 'DSSA'],
      F2: ['AI', 'DS'],
      F3: ['DBMS', 'DS']
    };
    const subjectOfClass = (classId) => {
      if (classId === 'I') return ['DBMS'];
      if (classId === 'II') return ['DS', 'ML', 'DBMS'];
      if (classId === 'III') return ['AI', 'DS'];
      return ['DSSA', 'ML'];
    };
    const hourOfSubject = (sub) => {
      const map = { AI: 'H2', ML: 'H3', DS: 'H4', DBMS: 'H1', DSSA: 'H2' };
      return map[sub] || 'H1';
    };

    const today = new Date();
    for (let d = HISTORY_DAYS; d >= 0; d--) {
      const dayDate = new Date(today);
      dayDate.setDate(today.getDate() - d);
      const day = dayDate.getDay();
      if (day === 0 || day === 6) continue; // skip weekends
      const dateStr = dayDate.toISOString().slice(0, 10);

      for (const cls of classesList) {
        const subList = subjectOfClass(cls.id);
        // students belonging to this class (year matches class id)
        const yearMap = { I: 'I', II: 'II', III: 'III', IV: 'IV' };
        const clsStudents2 = students.filter((s) => s.year === yearMap[cls.id]);
        for (const subCode of subList) {
          const staffPick = Object.keys(staffSubjectMap).find((fid) => staffSubjectMap[fid].includes(subCode));
          if (!staffPick) continue;
          const hour = hourOfSubject(subCode);
          // Each student in that class has attendance for this date/subject/hour (occasionally a class is "not conducted" ~3%)
          const isHeld = rand() > 0.03;
          if (!isHeld) continue;
          for (const stu of clsStudents2) {
            const r = rand();
            const status = r < 0.82 ? 'present' : (r < 0.93 ? 'absent' : 'late');
            records.push({
              id: `att-${dateStr}-${stu.id}-${subCode}-${hour}-${records.length}`,
              date: dateStr,
              studentId: stu.id,
              studentName: stu.name,
              registerNumber: stu.registerNumber,
              subjectCode: subCode,
              subjectName: subjects.find((s) => s.code === subCode)?.name || subCode,
              classId: cls.id,
              className: cls.className,
              semester: stu.semester,
              section: stu.section,
              hour: hour,
              status: status,
              staffId: staffPick
            });
          }
        }
      }
    }
    return records;
  })();

  const attendanceRecords = attendanceSeed;

  /* ---------- Timetable ---------- */

  const periods = ['09:00 - 10:00', '10:00 - 11:00', '11:15 - 12:15', '01:00 - 02:00', '02:00 - 03:00'];

  // Build timetable for each class
  const buildTimetable = () => {
    const result = [];
    const plan = {
      I: ['DBMS', 'Maths', 'English'],
      II: ['DS', 'ML', 'DBMS', 'Maths'],
      III: ['AI', 'DS', 'Open Elective'],
      IV: ['DSSA', 'ML', 'Project Lab']
    };
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    for (const cls of classesList) {
      const subs = plan[cls.id];
      days.forEach((day, dayIdx) => {
        periods.forEach((time, pIdx) => {
          const subName = subs[pIdx % subs.length];
          const subExists = subjects.find((s) => s.name === subName);
          const code = subExists ? subExists.code : (subName === 'Maths' ? 'MA' : subName === 'English' ? 'EN' : subName === 'Open Elective' ? 'OE' : 'PL');
          // Assign staff deterministically
          let staffName = 'Prof. Suresh Kumar';
          const staffForSub = staff.find((f) => f.subjects.some((s) => s === subName));
          if (staffForSub) staffName = staffForSub.name;
          result.push({
            id: `tt-${cls.id}-${day}-${pIdx}`,
            classId: cls.id,
            day: day,
            time: time,
            subjectName: subName,
            subjectCode: code,
            staffName: staffName,
            room: `Room ${100 + (dayIdx * 2 + pIdx)}`
          });
        });
      });
    }
    return result;
  };

  const timetableRecords = buildTimetable();

  /* ---------- API-Like Methods ---------- */

  const api = {
    /* Auth */
    login: (userId, password) => {
      let pwOverrides = {};
      try { pwOverrides = JSON.parse(localStorage.getItem('attendance_pw_overrides') || '{}'); } catch (_e) { /* ok */ }
      return new Promise((resolve) => {
        setTimeout(() => {
          const account = users.find((u) => u.userId.toLowerCase() === userId.toLowerCase());
          const match = account && (pwOverrides[account.userId] || account.password) === password;
          if (!match) {
            resolve({ success: false, message: 'Invalid User ID or Password.' });
            return;
          }
          let person = null;
          if (account.role === 'Student') person = students.find((s) => s.id === account.personId);
          else if (account.role === 'Staff') person = staff.find((f) => f.id === account.personId);
          else if (account.role === 'HOD') person = hods.find((h) => h.id === account.personId);
          resolve({
            success: true,
            user: {
              id: account.id,
              userId: account.userId,
              role: account.role,
              personId: account.personId,
              person: person,
              name: person.name,
              department: person.department,
              profilePhoto: person.profilePhoto || null
            }
          });
        }, 700);
      });
    },

    /* Getters */
    getStudents: () => JSON.parse(JSON.stringify(students)),
    getStaff: () => JSON.parse(JSON.stringify(staff)),
    getHODs: () => JSON.parse(JSON.stringify(hods)),
    getClasses: () => JSON.parse(JSON.stringify(classesList)),
    getSubjects: () => JSON.parse(JSON.stringify(subjects)),
    getDepartments: () => JSON.parse(JSON.stringify(departments)),
    getAcademicYears: () => [...academicYears],
    getSemesters: () => [...semesters],
    getSections: () => [...sections],
    getTimetable: () => JSON.parse(JSON.stringify(timetableRecords)),

    /* Attendance */
    getAttendance: () => JSON.parse(JSON.stringify(attendanceRecords)),

    getStudentAttendance: (studentId) => {
      return JSON.parse(JSON.stringify(attendanceRecords.filter((r) => r.studentId === studentId)));
    },

    getAttendanceByClass: (className) => {
      return JSON.parse(JSON.stringify(attendanceRecords.filter((r) => r.classId === className)));
    },

    getAttendanceByStaff: (staffId) => {
      return JSON.parse(JSON.stringify(attendanceRecords.filter((r) => r.staffId === staffId)));
    },

    /* Submit attendance (simulate POST) */
    submitAttendance: (payload) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          const { records } = payload;
          // Prevent duplicate: same date+class+subject+hour already exists?
          const first = records[0];
          const duplicate = attendanceRecords.some(
            (r) => r.date === first.date && r.classId === first.classId && r.subjectCode === first.subjectCode && r.hour === first.hour
          );
          if (duplicate) {
            resolve({ success: false, message: 'Attendance for this class and hour has already been submitted.' });
            return;
          }
          records.forEach((rec) => attendanceRecords.push({
            id: `att-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            subjectName: payload.subjectName || rec.subjectName || first.subjectCode,
            classId: rec.classId,
            section: rec.section,
            hour: rec.hour,
            ...rec,
            status: rec.status
          }));
          resolve({ success: true, message: 'Attendance submitted successfully.' });
        }, 1000);
      });
    },

    /* CRUD-ish helpers for HOD management (in-memory only) */
    addStudent: (data) => {
      const newId = `S${Date.now()}`;
      const newStudent = { id: newId, ...data };
      students.push(newStudent);
      users.push({ id: `u-${Date.now()}`, userId: data.registerNumber, password: 'student123', role: 'Student', personId: newId });
      return newStudent;
    },
    updateStudent: (id, data) => {
      const idx = students.findIndex((s) => s.id === id);
      if (idx > -1) {
        students[idx] = { ...students[idx], ...data, lastUpdated: new Date().toISOString().slice(0, 10) };
        const acc = users.find((u) => u.personId === id);
        if (acc && data.registerNumber) acc.userId = data.registerNumber;
      }
      return students.find((s) => s.id === id);
    },
    removeStudent: (id) => {
      const idx = students.findIndex((s) => s.id === id);
      if (idx > -1) students.splice(idx, 1);
      const accIdx = users.findIndex((u) => u.personId === id);
      if (accIdx > -1) users.splice(accIdx, 1);
    },
    addStaff: (data) => {
      const newId = `F${Date.now()}`;
      const newStaff = { id: newId, ...data };
      staff.push(newStaff);
      users.push({ id: `u-${Date.now()}`, userId: data.staffId, password: 'staff123', role: 'Staff', personId: newId });
      return newStaff;
    },
    updateStaff: (id, data) => {
      const idx = staff.findIndex((f) => f.id === id);
      if (idx > -1) {
        staff[idx] = { ...staff[idx], ...data, lastUpdated: new Date().toISOString().slice(0, 10) };
        const acc = users.find((u) => u.personId === id);
        if (acc && data.staffId) acc.userId = data.staffId;
      }
      return staff.find((f) => f.id === id);
    },
    addClass: (data) => {
      const newClass = { id: `${Date.now()}`, ...data };
      classesList.push(newClass);
      return newClass;
    },
    addSubject: (data) => {
      const newSubject = { id: `sub-${Date.now()}`, ...data };
      subjects.push(newSubject);
      return newSubject;
    },

    /* Password change (prototype: stores an override in localStorage so a
       backend can replace this with a real PATCH /api/account/password) */
    updatePassword: (userId, newPassword) => {
      let overrides = {};
      try { overrides = JSON.parse(localStorage.getItem('attendance_pw_overrides') || '{}'); } catch (_e) { /* ok */ }
      overrides[userId] = newPassword;
      try {
        localStorage.setItem('attendance_pw_overrides', JSON.stringify(overrides));
        const acc = users.find((u) => u.userId.toLowerCase() === String(userId).toLowerCase());
        if (acc) acc.password = newPassword;
        return { success: true, message: 'Password updated successfully.' };
      } catch (_e) {
        return { success: false, message: 'Could not save the new password.' };
      }
    }
  };

  return api;
})();