/* ============================================================
   Staff Module
   ------------------------------------------------------------
   Handles the Staff Dashboard, Mark Attendance, Attendance
   History and the Students page for the Staff role.

   Staff can mark attendance ONLY for their assigned classes
   and subjects. They cannot manage HOD accounts.
   ============================================================ */

const StaffApp = (() => {

  const session = () => Auth.getSession();
  const isOnPage = (file) => window.location.pathname.split('/').pop() === file;

  /* ---------- Helpers ---------- */

  const dayOfWeek = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[new Date().getDay()];
  };

  const subjectCodesFor = (staffPerson) => {
    const subs = staffPerson.subjects || [];
    return DB.getSubjects().filter((s) => subs.includes(s.name)).map((s) => s.code);
  };

  const attendanceStats = (records) => {
    const stats = { total: records.length, present: 0, absent: 0, late: 0 };
    records.forEach((r) => { if (stats[r.status] !== undefined) stats[r.status] += 1; });
    stats.presentCount = stats.present + stats.late;
    stats.percentage = Utils.percentage(stats.presentCount, stats.total);
    return stats;
  };

  /* ---------- Today's classes ---------- */

  const getTodaysClasses = (staffPerson) => {
    const today = dayOfWeek();
    const codes = subjectCodesFor(staffPerson);
    const tt = DB.getTimetable().filter((t) => t.day === today && codes.includes(t.subjectCode));
    return tt;
  };

  /* ---------- Dashboard ---------- */

  const renderDashboard = () => {
    if (!Auth.protectPage('staff.dashboard', 'Staff Dashboard')) return;
    AppLayout.init('staff-dashboard.html');

    const s = session();
    const person = s.person;

    // Assigned students = students in staff classes
    const assignedClasses = person.classes || [];
    const assignedStudents = DB.getStudents().filter((st) => assignedClasses.includes(st.year));
    const todayClasses = getTodaysClasses(person);

    const completedAtt = [];
    const pendingAtt = [];
    todayClasses.forEach((c) => {
      const submitted = DB.getAttendance().some(
        (r) => r.subjectCode === c.subjectCode && r.classId === c.classId && r.staffId === person.id && r.date === Utils.todayISO()
      );
      if (submitted) completedAtt.push(c); else pendingAtt.push(c);
    });

    document.getElementById('welcome').textContent = `Welcome, ${person.name}!`;
    document.getElementById('staff-subtitle').textContent =
      `${person.staffId} · ${person.designation} · ${person.department}`;

    document.getElementById('stat-grid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon i-primary"><i class="fas fa-chalkboard"></i></div>
        <div class="stat-info">
          <h3>${todayClasses.length}</h3>
          <p>Today's Classes</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-info"><i class="fas fa-users"></i></div>
        <div class="stat-info">
          <h3>${assignedStudents.length}</h3>
          <p>Assigned Students</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-success"><i class="fas fa-clipboard-check"></i></div>
        <div class="stat-info">
          <h3>${completedAtt.length}</h3>
          <p>Attendance Completed</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-warning"><i class="fas fa-clock-rotate-left"></i></div>
        <div class="stat-info">
          <h3>${pendingAtt.length}</h3>
          <p>Pending Attendance</p>
        </div>
      </div>
    `;

    // Today's classes table
    const tbody = document.querySelector('#today-classes-tbody');
    if (todayClasses.length === 0) {
      tbody.innerHTML = TableRenderer.emptyState(6, 'No classes scheduled for today.');
      return;
    }

    const classLabel = (id) => {
      const map = { I: 'I Sem', II: 'II Sem', III: 'III Sem', IV: 'IV Sem' };
      return map[id] || id;
    };

    tbody.innerHTML = todayClasses.map((c) => {
      const submitted = completedAtt.includes(c);
      return `
        <tr>
          <td>${esc(c.time)}</td>
          <td><strong>${esc(classLabel(c.classId))} AI &amp; DS</strong></td>
          <td>${esc(c.subjectName)}</td>
          <td>${esc(c.room)}</td>
          <td>
            ${submitted
              ? '<span class="badge badge-success">Completed</span>'
              : '<span class="badge badge-warning">Pending</span>'}
          </td>
          <td class="actions">
            ${submitted
              ? `<a class="btn btn-sm btn-outline" href="attendance.html"><i class="fas fa-eye"></i>View</a>`
              : `<a class="btn btn-sm btn-primary" href="attendance.html?mode=mark&class=${c.classId}&subject=${c.subjectCode}"><i class="fas fa-pen-to-square"></i>Mark Attendance</a>`}
          </td>
        </tr>
      `;
    }).join('');

    // Attendance summary mini cards (optional quick view)
    const myRecords = DB.getAttendanceByStaff(person.id);
    const stats = attendanceStats(myRecords);
    document.getElementById('my-attendance-summary').textContent = `${stats.percentage}% overall · ${myRecords.length} records marked`;
  };

  /* ---------- Mark Attendance ---------- */

  const renderMarkAttendance = (params) => {
    if (!Auth.protectPage('attendance.mark', 'Mark Attendance')) return;
    AppLayout.init('attendance.html?mode=mark');

    const s = session();
    const person = s.person;
    const mount = document.getElementById('app-content');

    const assignedClasses = person.classes || [];
    const subjectCodes = subjectCodesFor(person);
    const assignedSubjects = DB.getSubjects().filter((x) => subjectCodes.includes(x.code));

    const preselectClass = params.get('class');
    const preselectSub = params.get('subject');

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Mark Attendance</h1>
          <p>Select the class and subject to record today's attendance.</p>
        </div>
      </div>

      <div class="card" id="mark-step-1">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-sliders"></i>Class &amp; Subject</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="mk-date">Date <span class="required">*</span></label>
            <input type="date" class="form-control" id="mk-date" value="${Utils.todayISO()}">
            <div class="form-error" id="err-mk-date">Please select a valid date.</div>
          </div>
          <div class="form-group">
            <label for="mk-class">Class <span class="required">*</span></label>
            <select class="form-control" id="mk-class">
              <option value="">Select class</option>
              ${assignedClasses.map((c) => `<option value="${esc(c)}" ${c === preselectClass ? 'selected' : ''}>${esc(c)} Sem AI &amp; DS</option>`).join('')}
            </select>
            <div class="form-error" id="err-mk-class">Please select a class.</div>
          </div>
          <div class="form-group">
            <label for="mk-section">Section</label>
            <select class="form-control" id="mk-section">
              ${DB.getSections().map((sec) => `<option value="${esc(sec)}">${esc(sec)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="mk-subject">Subject <span class="required">*</span></label>
            <select class="form-control" id="mk-subject">
              <option value="">Select subject</option>
              ${assignedSubjects.map((x) => `<option value="${esc(x.code)}" ${x.code === preselectSub ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}
            </select>
            <div class="form-error" id="err-mk-subject">Please select a subject.</div>
          </div>
          <div class="form-group">
            <label for="mk-hour">Hour <span class="required">*</span></label>
            <select class="form-control" id="mk-hour">
              <option value="">Select hour</option>
              <option value="H1">Hour 1 (9:00 - 10:00)</option>
              <option value="H2">Hour 2 (10:00 - 11:00)</option>
              <option value="H3">Hour 3 (11:15 - 12:15)</option>
              <option value="H4">Hour 4 (1:00 - 2:00)</option>
              <option value="H5">Hour 5 (2:00 - 3:00)</option>
            </select>
            <div class="form-error" id="err-mk-hour">Please select an hour.</div>
          </div>
        </div>
        <div class="flex justify-between items-center mt-16">
          <span class="text-muted" id="mark-hint"></span>
          <button class="btn btn-primary" id="mk-load-students"><i class="fas fa-users"></i> Load Students</button>
        </div>
      </div>

      <div class="card hidden" id="mark-step-2">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-user-check"></i>Mark Attendance - <span id="mark-context"></span></div>
        </div>

        <div class="filters-bar" style="padding:12px;margin-bottom:14px">
          <div class="form-group" style="max-width:300px">
            <label for="mk-search">Search student</label>
            <input type="text" class="form-control" id="mk-search" placeholder="Register no or name...">
          </div>
          <button class="btn btn-outline btn-sm" id="mk-all-present" style="height:auto"><i class="fas fa-user-check"></i> Mark All Present</button>
          <button class="btn btn-outline btn-sm" id="mk-all-absent" style="height:auto"><i class="fas fa-user-xmark"></i> Mark All Absent</button>
          <button class="btn btn-outline btn-sm" id="mk-reset" style="height:auto"><i class="fas fa-rotate"></i> Reset</button>
        </div>

        <div class="table-responsive">
          <table class="table" id="mk-table">
            <thead>
              <tr>
                <th>Register No</th>
                <th>Student Name</th>
                <th style="min-width:220px">Status</th>
              </tr>
            </thead>
            <tbody id="mk-tbody"></tbody>
          </table>
        </div>

        <div class="flex justify-between items-center mt-16 flex-wrap gap-10">
          <span class="text-muted" id="mk-progress"></span>
          <button class="btn btn-success btn-lg" id="mk-submit" style="padding:11px 26px;font-size:15px">
            <i class="fas fa-paper-plane"></i> Submit Attendance
          </button>
        </div>
      </div>
    `;

    const dateEl = document.getElementById('mk-date');
    const classEl = document.getElementById('mk-class');
    const sectionEl = document.getElementById('mk-section');
    const subjectEl = document.getElementById('mk-subject');
    const hourEl = document.getElementById('mk-hour');
    const step1 = document.getElementById('mark-step-1');
    const step2 = document.getElementById('mark-step-2');

    let students = [];
    let statusMap = {}; // studentId -> 'present'|'absent'|'late'
    let editing = false;

    const classOptions = {
      I: 'I Sem', II: 'II Sem', III: 'III Sem', IV: 'IV Sem'
    };

    const getContextStr = () => {
      const cls = classEl.value;
      const sub = DB.getSubjects().find((x) => x.code === subjectEl.value);
      return `${classOptions[cls] || ''} AI &amp; DS - ${sub ? sub.name : ''} - ${hourEl.value.replace('H', '')} Hour`;
    };

    // Pre-select from URL params
    if (classEl.value && subjectEl.value) {
      document.getElementById('mark-hint').textContent = 'Preset from dashboard. Click Load Students to proceed.';
    }

    document.getElementById('mk-load-students').addEventListener('click', () => {
      let valid = true;

      const checkErrs = [
        ['mk-date', 'err-mk-date', () => !dateEl.value],
        ['mk-class', 'err-mk-class', () => !classEl.value],
        ['mk-subject', 'err-mk-subject', () => !subjectEl.value],
        ['mk-hour', 'err-mk-hour', () => !hourEl.value]
      ];

      checkErrs.forEach(([inputId, errId, cond]) => {
        const input = document.getElementById(inputId);
        const errEl = document.getElementById(errId);
        if (cond()) {
          input.classList.add('invalid');
          errEl.classList.add('show');
          valid = false;
          errEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } else {
          input.classList.remove('invalid');
          errEl.classList.remove('show');
        }
      });

      if (!valid) {
        Toast.warning('Please fill all required fields.');
        return;
      }

      // Load students for the chosen class
      const cls = classEl.value;
      students = DB.getStudents().filter((st) => st.year === cls);
      if (students.length === 0) {
        Toast.error('No students found for the selected class.');
        return;
      }
      statusMap = {};
      students.forEach((st) => { statusMap[st.id] = 'present'; });

      document.getElementById('mark-context').innerHTML = getContextStr();
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      editing = false;
      renderStudentRows();
    });

    const renderStudentRows = (query = '') => {
      const tbody = document.getElementById('mk-tbody');
      const q = query.trim().toLowerCase();
      const list = students.filter((st) =>
        !q || st.registerNumber.toLowerCase().includes(q) || st.name.toLowerCase().includes(q)
      );

      if (list.length === 0) {
        tbody.innerHTML = TableRenderer.emptyState(3, 'No students match your search.');
      } else {
        tbody.innerHTML = list.map((st) => {
          const stt = statusMap[st.id] || 'present';
          return `
            <tr>
              <td><strong>${esc(st.registerNumber)}</strong></td>
              <td>${esc(st.name)}</td>
              <td>
                <div class="radio-status" role="radiogroup" aria-label="Attendance status for ${esc(st.name)}">
                  <label class="status-btn ${stt === 'present' ? 'active present' : ''}">
                    <input type="radio" name="st-${esc(st.id)}" value="present" ${stt === 'present' ? 'checked' : ''}>
                    <i class="fas fa-check"></i> Present
                  </label>
                  <label class="status-btn ${stt === 'absent' ? 'active absent' : ''}">
                    <input type="radio" name="st-${esc(st.id)}" value="absent" ${stt === 'absent' ? 'checked' : ''}>
                    <i class="fas fa-xmark"></i> Absent
                  </label>
                  <label class="status-btn ${stt === 'late' ? 'active late' : ''}">
                    <input type="radio" name="st-${esc(st.id)}" value="late" ${stt === 'late' ? 'checked' : ''}>
                    <i class="fas fa-clock"></i> Late
                  </label>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }

      updateProgress();
    };

    const updateProgress = () => {
      if (!editing) return;
      const counts = { present: 0, absent: 0, late: 0 };
      students.forEach((st) => { counts[statusMap[st.id]] = (counts[statusMap[st.id]] || 0) + 1; });
      document.getElementById('mk-progress').innerHTML =
        `<span class="badge badge-success">Present: ${counts.present}</span> ` +
        `<span class="badge badge-warning">Late: ${counts.late}</span> ` +
        `<span class="badge badge-danger">Absent: ${counts.absent}</span>`;
    };

    // Event delegation for radio buttons + search
    document.getElementById('mk-tbody').addEventListener('change', (e) => {
      if (e.target.type === 'radio') {
        const name = e.target.name;
        const studentId = name.replace('st-', '');
        statusMap[studentId] = e.target.value;
        editing = true;
        updateProgress();
      }
    });

    document.getElementById('mk-search').addEventListener('input', (e) => renderStudentRows(e.target.value));

    document.getElementById('mk-all-present').addEventListener('click', () => {
      students.forEach((st) => { statusMap[st.id] = 'present'; });
      editing = true;
      renderStudentRows(document.getElementById('mk-search').value);
      Toast.info('All students marked as Present.');
    });

    document.getElementById('mk-all-absent').addEventListener('click', () => {
      students.forEach((st) => { statusMap[st.id] = 'absent'; });
      editing = true;
      renderStudentRows(document.getElementById('mk-search').value);
      Toast.info('All students marked as Absent.');
    });

    document.getElementById('mk-reset').addEventListener('click', () => {
      statusMap = {};
      students.forEach((st) => { statusMap[st.id] = 'present'; });
      editing = false;
      renderStudentRows(document.getElementById('mk-search').value);
      Toast.info('Attendance selections reset.');
    });

    // Submit with confirmation modal
    document.getElementById('mk-submit').addEventListener('click', () => {
      const payload = {
        date: dateEl.value,
        classId: classEl.value,
        section: sectionEl.value,
        subjectCode: subjectEl.value,
        subjectName: DB.getSubjects().find((x) => x.code === subjectEl.value)?.name,
        hour: hourEl.value,
        staffId: person.id,
        records: students.map((st) => ({
          studentId: st.id,
          studentName: st.name,
          registerNumber: st.registerNumber,
          status: statusMap[st.id] || 'present',
          classId: classEl.value,
          section: sectionEl.value,
          subjectCode: subjectEl.value,
          date: dateEl.value,
          hour: hourEl.value,
          staffId: person.id
        }))
      };

      Confirm.show({
        title: 'Submit Attendance?',
        message: `Are you sure you want to submit attendance for <strong>${getContextStr()}</strong> on ${esc(Utils.formatDate(dateEl.value))}?`,
        confirmText: 'Submit',
        confirmClass: 'btn-success',
        onConfirm: async () => {
          const btn = document.getElementById('mk-submit');
          Buttons.loading(btn, 'Submitting...');
          const result = await DB.submitAttendance(payload);
          Buttons.reset(btn);
          if (result.success) {
            Toast.success(result.message);
            step2.classList.add('hidden');
            step1.classList.remove('hidden');
            hourEl.value = '';
            renderMarkAttendance(new URLSearchParams());
          } else {
            Toast.error(result.message);
          }
        }
      });
    });
  };

  /* ---------- Attendance History (Staff + HOD view) ---------- */

  const renderHistory = () => {
    if (!Auth.protectPage('attendance.view', 'Attendance History')) return;
    const s = session();
    const mount = document.getElementById('app-content');
    if (!mount) return;

    let all = DB.getAttendance();
    if (s.role === 'Staff') {
      all = DB.getAttendanceByStaff(s.person.id);
      AppLayout.init('attendance.html');
    } else {
      AppLayout.init('attendance.html?view=history');
    }

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Attendance History</h1>
          <p>${s.role === 'Staff' ? 'Attendance you have marked for your assigned classes.' : 'Department-wide attendance records.'}</p>
        </div>
      </div>

      <div class="filters-bar">
        <div class="form-group">
          <label for="h-date">Date</label>
          <input type="date" class="form-control" id="h-date">
        </div>
        <div class="form-group">
          <label for="h-class">Class</label>
          <select class="form-control" id="h-class">
            <option value="">All Classes</option>
            <option value="I">I Sem</option><option value="II">II Sem</option>
            <option value="III">III Sem</option><option value="IV">IV Sem</option>
          </select>
        </div>
        <div class="form-group">
          <label for="h-section">Section</label>
          <select class="form-control" id="h-section">
            <option value="">All</option>
            ${DB.getSections().map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="h-subject">Subject</label>
          <select class="form-control" id="h-subject">
            <option value="">All Subjects</option>
            ${DB.getSubjects().map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="h-status">Status</label>
          <select class="form-control" id="h-status">
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
          </select>
        </div>
        <button class="btn btn-primary" id="h-apply"><i class="fas fa-filter"></i> Apply</button>
        <button class="btn btn-outline" id="h-reset"><i class="fas fa-rotate"></i> Reset</button>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-clock-rotate-left"></i>Records</div>
          <span class="text-muted" id="h-count"></span>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th style="cursor:pointer" data-sort="date">Date <i class="fas fa-sort" style="font-size:10px;color:var(--gray-300)"></i></th>
                <th style="cursor:pointer" data-sort="subjectName">Subject <i class="fas fa-sort" style="font-size:10px;color:var(--gray-300)"></i></th>
                <th style="cursor:pointer" data-sort="classId">Class <i class="fas fa-sort" style="font-size:10px;color:var(--gray-300)"></i></th>
                <th>Section</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Late</th>
                <th>Total</th>
                <th style="cursor:pointer" data-sort="percentage">Percentage <i class="fas fa-sort" style="font-size:10px;color:var(--gray-300)"></i></th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="h-tbody"></tbody>
          </table>
        </div>
        <div id="h-pagination"></div>
      </div>
    `;

    let filtered = [...all];
    let page = 1;
    const PER_PAGE = 12;
    let sortKey = 'date';
    let sortDir = -1;

    const groupBySession = (list) => {
      const map = new Map();
      const key = (r) => `${r.date}|${r.subjectCode}|${r.classId}|${r.section}|${r.hour}`;
      list.forEach((r) => {
        const k = key(r);
        if (!map.has(k)) {
          map.set(k, { date: r.date, subjectCode: r.subjectCode, subjectName: r.subjectName, classId: r.classId, section: r.section, present: 0, absent: 0, late: 0, total: 0, percentage: 0 });
        }
        const g = map.get(k);
        g[r.status] += 1;
        g.total += 1;
      });
      map.forEach((g) => { g.percentage = Utils.percentage(g.present + g.late, g.total); });
      return [...map.values()];
    };

    const classLabel = (id) => ({ I: 'I Sem', II: 'II Sem', III: 'III Sem', IV: 'IV Sem' }[id] || id);

    const applyFilters = () => {
      const date = document.getElementById('h-date').value;
      const cls = document.getElementById('h-class').value;
      const subject = document.getElementById('h-subject').value;
      const status = document.getElementById('h-status').value;
      const section = document.getElementById('h-section').value;

      filtered = all.filter((r) => {
        if (date && r.date !== date) return false;
        if (cls && r.classId !== cls) return false;
        if (subject && r.subjectCode !== subject) return false;
        if (status && r.status !== status) return false;
        if (section && r.section !== section) return false;
        return true;
      });
      page = 1;
      renderTable();
    };

    const renderTable = () => {
      let groups = groupBySession(filtered).sort((a, b) => (a.date < b.date ? 1 : -1));

      // Sorting
      groups.sort((a, b) => {
        let va = a[sortKey];
        let vb = b[sortKey];
        if (sortKey === 'date') {
          return sortDir * (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
        }
        if (typeof va === 'number' && typeof vb === 'number') return sortDir * (va - vb);
        return sortDir * String(va).localeCompare(String(vb));
      });

      const pages = Math.max(1, Math.ceil(groups.length / PER_PAGE));
      const rows = Utils.paginate(groups, page, PER_PAGE);
      const tbody = document.getElementById('h-tbody');

      document.getElementById('h-count').textContent = `${groups.length} session(s)`;

      if (rows.length === 0) {
        tbody.innerHTML = TableRenderer.emptyState(10, 'No attendance records found.');
      } else {
        tbody.innerHTML = rows.map((g) => `
          <tr>
            <td><span class="status-dot ${Utils.percentage(g.present + g.late, g.total) >= 75 ? 'present' : 'absent'}"></span>${esc(Utils.formatDate(g.date))}</td>
            <td><strong>${esc(g.subjectName)}</strong></td>
            <td>${esc(classLabel(g.classId))} AI &amp; DS</td>
            <td>${esc(g.section)}</td>
            <td class="text-success">${g.present}</td>
            <td class="text-danger">${g.absent}</td>
            <td class="text-warning">${g.late}</td>
            <td>${g.total}</td>
            <td style="min-width:130px">
              <span class="attendance-pct" style="color:${Utils.pctColor(g.percentage)}">${g.percentage}%</span>
              <div class="progress mt-10"><div class="progress-bar" style="width:${g.percentage}%;background:${Utils.pctColor(g.percentage)}"></div></div>
            </td>
            <td class="actions">
              <button class="btn btn-sm btn-outline" onclick="StaffApp.viewSession('${g.date}', '${esc(g.subjectCode)}', '${esc(g.classId)}', '${esc(g.section)}')">
                <i class="fas fa-eye"></i> View
              </button>
            </td>
          </tr>
        `).join('');
      }

      const pagEl = document.getElementById('h-pagination');
      pagEl.innerHTML = TableRenderer.paginationHtml({ page, pages, total: groups.length, perPage: PER_PAGE });
      TableRenderer.attachPagination(pagEl, (p) => { page = p; renderTable(); });
    };

    document.getElementById('h-apply').addEventListener('click', applyFilters);
    document.getElementById('h-reset').addEventListener('click', () => {
      ['h-date', 'h-class', 'h-section', 'h-subject', 'h-status'].forEach((id) => { document.getElementById(id).value = ''; });
      applyFilters();
    });

    // Sorting listeners
    document.getElementById('h-tbody').closest('table').querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortDir = -sortDir;
        } else {
          sortKey = key;
          sortDir = key === 'percentage' ? -1 : 1;
        }
        renderTable();
      });
    });

    renderTable();
  };

  /* ---------- Session detail modal ---------- */

  const viewSession = (date, subjectCode, classId, section) => {
    const records = DB.getAttendance().filter(
      (r) => r.date === date && r.subjectCode === subjectCode && r.classId === classId && r.section === section
    );
    const subjectName = records[0]?.subjectName || subjectCode;

    const rows = records.map((r) => {
      const st = Utils.statusInfo(r.status);
      return `<tr>
        <td>${esc(r.registerNumber)}</td>
        <td>${esc(r.studentName)}</td>
        <td><span class="badge ${st.cls}">${st.label}</span></td>
      </tr>`;
    }).join('');

    Modal.open({
      title: `Attendance - ${esc(Utils.formatDate(date))}`,
      body: `
        <p class="text-muted mb-16">${esc(subjectName)} · ${classId === 'I' ? 'I' : classId === 'II' ? 'II' : classId === 'III' ? 'III' : 'IV'} Sem AI &amp; DS · Section ${esc(section)}</p>
        <div class="table-responsive" style="max-height:320px;overflow-y:auto">
          <table class="table">
            <thead><tr><th>Register No</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="3"><div class="empty-state">No records.</div></td></tr>`}</tbody>
          </table>
        </div>
      `
    });
  };

  /* ---------- Students page (Staff) ---------- */

  const renderStudents = () => {
    if (!Auth.protectPage('students', 'Students')) return;
    AppLayout.init('students.html');

    const s = session();
    const person = s.person;
    const assignedClasses = person.classes || [];
    const students = DB.getStudents().filter((st) => assignedClasses.includes(st.year));
    const allAtt = DB.getAttendance();

    document.getElementById('students-subtitle').textContent =
      `${students.length} students in your assigned classes (${assignedClasses.join(', ')})`;

    const summary = (studentId) => {
      const recs = allAtt.filter((r) => r.studentId === studentId);
      return { total: recs.length, present: recs.filter((r) => r.status !== 'absent').length, pct: Utils.percentage(recs.filter((r) => r.status !== 'absent').length, recs.length) };
    };

    let filtered = [...students];
    let page = 1;
    const PER_PAGE = 12;

    const render = () => {
      const tbody = document.getElementById('students-tbody');
      const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
      const rows = Utils.paginate(filtered, page, PER_PAGE);

      if (rows.length === 0) {
        tbody.innerHTML = TableRenderer.emptyState(6, 'No students found.');
      } else {
        tbody.innerHTML = rows.map((st) => {
          const stat = summary(st.id);
          const statusB = Utils.pctStatus(stat.pct);
          return `
            <tr>
              <td><strong>${esc(st.registerNumber)}</strong></td>
              <td>${esc(st.name)}</td>
              <td>${esc(st.year)} Sem</td>
              <td>${esc(st.section)}</td>
              <td style="min-width:130px">
                <span class="attendance-pct" style="color:${Utils.pctColor(stat.pct)}">${stat.pct}%</span>
                <div class="progress mt-10"><div class="progress-bar" style="width:${stat.pct}%;background:${Utils.pctColor(stat.pct)}"></div></div>
              </td>
              <td><span class="badge ${statusB.cls}">${statusB.text}</span></td>
              <td class="actions">
                <button class="btn btn-sm btn-outline" onclick="StaffApp.viewStudentAttendance('${esc(st.id)}')"><i class="fas fa-clipboard-list"></i>View Attendance</button>
                <a class="btn btn-sm btn-outline" href="profile.html?user=${esc(st.id)}"><i class="fas fa-user"></i>View Profile</a>
              </td>
            </tr>
          `;
        }).join('');
      }

      const pagEl = document.getElementById('students-pagination');
      pagEl.innerHTML = TableRenderer.paginationHtml({ page, pages, total: filtered.length, perPage: PER_PAGE });
      TableRenderer.attachPagination(pagEl, (p) => { page = p; render(); });
    };

    document.getElementById('students-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      filtered = students.filter((st) =>
        !q || st.registerNumber.toLowerCase().includes(q) || st.name.toLowerCase().includes(q)
      );
      page = 1;
      render();
    });

    render();
  };

  const viewStudentAttendance = (studentId) => {
    const recs = DB.getStudentAttendance(studentId).sort((a, b) => (a.date < b.date ? 1 : -1));
    const student = DB.getStudents().find((st) => st.id === studentId);
    const rows = recs.slice(0, 15).map((r) => {
      const st = Utils.statusInfo(r.status);
      return `<tr><td>${esc(Utils.formatDate(r.date))}</td><td>${esc(r.subjectName)}</td><td><span class="badge ${st.cls}">${st.label}</span></td></tr>`;
    }).join('');

    Modal.open({
      title: `Attendance - ${student ? student.name : ''}`,
      body: `
        <p class="text-muted mb-16">${student ? student.registerNumber : ''} · Recent 15 records</p>
        <div class="table-responsive" style="max-height:340px;overflow-y:auto">
          <table class="table">
            <thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead>
            <tbody>${rows || TableRenderer.emptyState(3)}</tbody>
          </table>
        </div>
      `
    });
  };

  /* ---------- Router ---------- */

  const initAttendancePage = () => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'mark') renderMarkAttendance(params);
    else renderHistory();
  };

  /* ---------- Boot ---------- */

  const init = () => {
    if (Auth.getRole() !== 'Staff') return;
    if (isOnPage('staff-dashboard.html')) {
      renderDashboard();
    } else if (isOnPage('students.html')) {
      renderStudents();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    renderDashboard,
    renderMarkAttendance,
    renderHistory,
    renderStudents,
    viewStudentAttendance,
    viewSession,
    initAttendancePage
  };
})();

window.StaffApp = StaffApp;