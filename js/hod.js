/* ============================================================
   HOD Module
   ------------------------------------------------------------
   Handles the HOD Dashboard, Student/Staff/Class/Subject
   management, and department-wide Attendance Monitoring.

   HOD can monitor department-wide attendance, view students,
   staff, and manage classes, subjects and timetable.
   ============================================================ */

const HodApp = (() => {

  const session = () => Auth.getSession();
  const isOnPage = (file) => window.location.pathname.split('/').pop() === file;

  const classLabel = (id) => ({ I: 'I Sem', II: 'II Sem', III: 'III Sem', IV: 'IV Sem' }[id] || id);

  /* ---------- Aggregation ---------- */

  const overallStats = (records) => {
    const stats = { total: records.length, present: 0, absent: 0, late: 0 };
    records.forEach((r) => { if (stats[r.status] !== undefined) stats[r.status] += 1; });
    stats.presentCount = stats.present + stats.late;
    stats.percentage = Utils.percentage(stats.presentCount, stats.total);
    return stats;
  };

  /* ---------- Dashboard ---------- */

  const renderDashboard = () => {
    if (!Auth.protectPage('hod.dashboard', 'HOD Dashboard')) return;
    AppLayout.init('hod-dashboard.html');

    const s = session();
    const person = s.person;
    const students = DB.getStudents();
    const staff = DB.getStaff();
    const allAtt = DB.getAttendance();
    const deptStats = overallStats(allAtt);

    document.getElementById('welcome').textContent = `Welcome, ${person.name.split(' ')[0]}!`;
    document.getElementById('hod-subtitle').textContent =
      `${person.hodId} · Head of Department - ${person.department}`;

    // Report threshold config (75%)
    const THRESHOLD = 75;

    // Stat cards
    const belowThreshold = students.filter((st) => {
      const recs = allAtt.filter((r) => r.studentId === st.id);
      const pct = Utils.percentage(recs.filter((r) => r.status !== 'absent').length, recs.length);
      return pct < THRESHOLD;
    }).length;

    document.getElementById('stat-grid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon i-primary"><i class="fas fa-user-graduate"></i></div>
        <div class="stat-info"><h3>${students.length}</h3><p>Total Students</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-info"><i class="fas fa-user-tie"></i></div>
        <div class="stat-info"><h3>${staff.length}</h3><p>Total Staff</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon i-gray"><i class="fas fa-school"></i></div>
        <div class="stat-info"><h3>${DB.getClasses().length}</h3><p>Total Classes</p></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${deptStats.percentage >= THRESHOLD ? 'i-success' : 'i-danger'}"><i class="fas fa-percent"></i></div>
        <div class="stat-info">
          <h3>${deptStats.percentage}%</h3>
          <p>Department Attendance</p>
        </div>
      </div>
    `;

    // Department chart (present vs absent vs late)
    const ctx = document.getElementById('dept-chart');
    if (ctx) {
      if (allAtt.length > 0) {
        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Present', 'Absent', 'Late'],
            datasets: [{
              data: [deptStats.present, deptStats.absent, deptStats.late],
              backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
              borderWidth: 0,
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '66%',
            plugins: {
              legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { weight: 600 } } },
              tooltip: { backgroundColor: '#0f172a' }
            }
          }
        });
      } else {
        ctx.parentElement.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-chart-pie"></i>
            <h4>No Attendance Records</h4>
            <span class="text-muted">Charts appear once attendance is marked.</span>
          </div>`;
      }
    }
    document.getElementById('dept-legend').innerHTML = `
      <span class="badge badge-success">Overall ${deptStats.percentage}%</span>
      <span class="text-muted">${deptStats.total.toLocaleString()} total records</span>
    `;

    // Class-wise attendance
    const clsRows = DB.getClasses().map((cls) => {
      const clsStudents = students.filter((st) => st.year === cls.id);
      const clsAtt = allAtt.filter((r) => r.classId === cls.id);
      const presentCount = clsAtt.filter((r) => r.status !== 'absent').length;
      const pct = Utils.percentage(presentCount, clsAtt.length);
      return { label: `${cls.id} Sem AI & DS`, count: clsStudents.length, pct, threshold: pct < THRESHOLD };
    });
    document.getElementById('class-wise-tbody').innerHTML = clsRows.length ? clsRows.map((c) => `
      <tr>
        <td><strong>${esc(c.label)}</strong></td>
        <td>${c.count}</td>
        <td>
          <span class="attendance-pct" style="color:${Utils.pctColor(c.pct)}">${c.pct}%</span>
          ${c.threshold ? '<span class="badge badge-danger ml-10">Low</span>' : ''}
          <div class="progress mt-10"><div class="progress-bar" style="width:${c.pct}%;background:${Utils.pctColor(c.pct)}"></div></div>
        </td>
      </tr>
    `).join('') : TableRenderer.emptyState(6, 'No Classes Added');

    // Alerts
    const alerts = [];
    if (belowThreshold > 0) {
      alerts.push(`<div class="alert-item"><i class="fas fa-user-graduate"></i><span><strong>${belowThreshold} students</strong> have attendance below ${THRESHOLD}%.</span></div>`);
    }
    const lowClasses = clsRows.filter((c) => c.threshold);
    lowClasses.forEach((c) => {
      alerts.push(`<div class="alert-item danger-alert"><i class="fas fa-school"></i><span><strong>${esc(c.label)}</strong> attendance dropped below the department threshold (${c.pct}%).</span></div>`);
    });
    if (alerts.length === 0) {
      alerts.push(`<div class="alert-item" style="background:var(--secondary-light);border-color:rgba(16,185,129,0.3);color:#065f46"><i class="fas fa-circle-check"></i><span>All student attendance meets the department threshold.</span></div>`);
    }
    document.getElementById('alert-list').innerHTML = alerts.join('');
  };

  /* ---------- Student Management (HOD) ---------- */

  const renderStudentManagement = () => {
    if (!Auth.protectPage('students.management', 'Students')) return;
    AppLayout.init('students.html');

    const mount = document.getElementById('students-tbody');
    if (!mount) return;

    const allAtt = DB.getAttendance();
    const students = DB.getStudents();

    document.getElementById('students-subtitle').textContent =
      `${students.length} students · Department of AI & DS`;

    let filtered = [...students];
    let page = 1;
    const PER_PAGE = 10;

    const summary = (studentId) => {
      const recs = allAtt.filter((r) => r.studentId === studentId);
      const pct = Utils.percentage(recs.filter((r) => r.status !== 'absent').length, recs.length);
      return { pct };
    };

    const render = () => {
      const tbody = document.getElementById('students-tbody');
      const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
      const rows = Utils.paginate(filtered, page, PER_PAGE);

      if (rows.length === 0) {
        tbody.innerHTML = TableRenderer.emptyState(7, 'No Students Added');
      } else {
        tbody.innerHTML = rows.map((st) => {
          const pct = summary(st.id).pct;
          const statusB = Utils.pctStatus(pct);
          return `
            <tr>
              <td><strong>${esc(st.registerNumber)}</strong></td>
              <td>
                <div class="flex items-center gap-10">
                  ${window.ProfilePhoto ? ProfilePhoto.avatarBadge({ userId: st.registerNumber, name: st.name, role: 'Student' }) : `<div class="avatar" style="width:34px;height:34px;font-size:12px">${esc(Utils.initials(st.name))}</div>`}
                  <span>${esc(st.name)}</span>
                </div>
              </td>
              <td>${esc(st.year)} Sem</td>
              <td>${esc(st.section)}</td>
              <td style="min-width:130px">
                <span class="attendance-pct" style="color:${Utils.pctColor(pct)}">${pct}%</span>
                <div class="progress mt-10"><div class="progress-bar" style="width:${Math.max(2, pct)}%;background:${Utils.pctColor(pct)}"></div></div>
              </td>
              <td><span class="badge ${statusB.cls}">${statusB.text}</span></td>
              <td class="actions">
                <button class="btn btn-sm btn-outline" onclick="HodApp.editStudent('${esc(st.id)}')"><i class="fas fa-pen"></i>Edit</button>
                <button class="btn btn-sm btn-outline" onclick="StaffApp.viewStudentAttendance('${esc(st.id)}')"><i class="fas fa-clipboard-list"></i>Att</button>
                <button class="btn btn-sm btn-danger" onclick="HodApp.removeStudent('${esc(st.id)}')"><i class="fas fa-trash"></i></button>
              </td>
            </tr>
          `;
        }).join('');
      }

      const pagEl = document.getElementById('students-pagination');
      pagEl.innerHTML = TableRenderer.paginationHtml({ page, pages, total: filtered.length, perPage: PER_PAGE });
      TableRenderer.attachPagination(pagEl, (p) => { page = p; render(); });
    };

    // Search
    document.getElementById('students-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      filtered = students.filter((st) =>
        !q || st.registerNumber.toLowerCase().includes(q) || st.name.toLowerCase().includes(q)
      );
      page = 1;
      render();
    });

    // Filters (HOD toolbar)
    const toolbar = document.querySelector('.table-toolbar');
    const existingChips = toolbar.querySelector('.filter-chip-group');
    if (existingChips) existingChips.remove();
    toolbar.insertAdjacentHTML('beforeend', `
      <div class="filter-chip-group" style="display:flex;gap:10px;flex-wrap:wrap">
        <select id="f-year" class="form-control" style="width:auto"><option value="">All Years</option>
          ${['I', 'II', 'III', 'IV'].map((y) => `<option>${y}</option>`).join('')}</select>
        <select id="f-section" class="form-control" style="width:auto"><option value="">All Sections</option>
          ${DB.getSections().map((s) => `<option>${esc(s)}</option>`).join('')}</select>
        <button class="btn btn-primary" id="btn-add-student" style="height:38px"><i class="fas fa-plus"></i> Add Student</button>
      </div>
    `);

    document.getElementById('f-year').addEventListener('change', () => applyFilters());
    document.getElementById('f-section').addEventListener('change', () => applyFilters());

    const applyFilters = () => {
      const year = document.getElementById('f-year').value;
      const section = document.getElementById('f-section').value;
      const q = document.getElementById('students-search').value.trim().toLowerCase();
      filtered = students.filter((st) => {
        if (year && st.year !== year) return false;
        if (section && st.section !== section) return false;
        if (q && !st.registerNumber.toLowerCase().includes(q) && !st.name.toLowerCase().includes(q)) return false;
        return true;
      });
      page = 1;
      render();
    };

    document.getElementById('btn-add-student').addEventListener('click', () => addStudentModal());

    render();
  };

  /* ---------- Add / Edit Student modals ---------- */

  const addStudentModal = () => {
    Modal.open({
      title: 'Add Student',
      body: `
        <form id="student-form" novalidate>
          <p class="text-muted" style="margin-bottom:14px">The default login password will be the <strong>register number</strong>.</p>
          <div class="form-group">
            <label>Register Number <span class="required">*</span></label>
            <input type="text" class="form-control" id="sf-reg" placeholder="e.g. 2024AI005">
            <div class="form-error" id="err-sf-reg">Register Number is required.</div>
          </div>
          <div class="form-group">
            <label>Full Name <span class="required">*</span></label>
            <input type="text" class="form-control" id="sf-name" placeholder="Student name">
            <div class="form-error" id="err-sf-name">Name is required.</div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Year</label>
              <select class="form-control" id="sf-year">
                ${['I', 'II', 'III', 'IV'].map((y) => `<option>${y}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Semester</label>
              <select class="form-control" id="sf-sem">
                ${DB.getSemesters().map((s) => `<option>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Section</label>
              <select class="form-control" id="sf-sec">
                ${DB.getSections().map((s) => `<option>${esc(s)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Department</label>
              <input type="text" class="form-control" id="sf-dept" value="AI&DS">
            </div>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" class="form-control" id="sf-email" placeholder="student@college.edu">
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input type="tel" class="form-control" id="sf-phone" placeholder="10-digit mobile number">
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-outline" data-student-cancel>Cancel</button>
        <button class="btn btn-primary" id="student-save"><i class="fas fa-save"></i> Save</button>
      `
    });

    const ov = document.querySelector('.modal-overlay.active');
    ov.querySelector('[data-student-cancel]').addEventListener('click', Modal.close);

    document.getElementById('student-save').addEventListener('click', () => {
      const reg = document.getElementById('sf-reg').value.trim();
      const name = document.getElementById('sf-name').value.trim();
      const valid = [
        ['sf-reg', 'err-sf-reg', reg],
        ['sf-name', 'err-sf-name', name]
      ].every(([id, errId, val]) => {
        const el = document.getElementById(id);
        const err = document.getElementById(errId);
        if (!val) { el.classList.add('invalid'); err.classList.add('show'); return false; }
        el.classList.remove('invalid'); err.classList.remove('show'); return true;
      });
      if (!valid) return;

      const result = DB.addStudent({
        registerNumber: reg,
        name,
        year: document.getElementById('sf-year').value,
        semester: document.getElementById('sf-sem').value,
        section: document.getElementById('sf-sec').value,
        department: document.getElementById('sf-dept').value || 'AI&DS',
        email: document.getElementById('sf-email').value.trim(),
        phone: document.getElementById('sf-phone').value.trim()
      });
      if (!result.ok) { Toast.error(result.message); return; }
      Modal.close();
      Toast.success(result.message);
      renderStudentManagement();
    });
  };

  const editStudent = (studentId) => {
    const st = DB.getStudents().find((s) => s.id === studentId);
    if (!st) { Toast.error('Student not found.'); return; }

    Modal.open({
      title: 'Edit Student',
      body: `
        <form id="student-form" novalidate>
          <div class="form-group">
            <label>Register Number <span class="required">*</span></label>
            <input type="text" class="form-control" id="sf-reg" value="${esc(st.registerNumber)}">
          </div>
          <div class="form-group">
            <label>Full Name <span class="required">*</span></label>
            <input type="text" class="form-control" id="sf-name" value="${esc(st.name)}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Year</label>
              <select class="form-control" id="sf-year">${['I', 'II', 'III', 'IV'].map((y) => `<option ${st.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label>Semester</label>
              <select class="form-control" id="sf-sem">${DB.getSemesters().map((s2) => `<option ${st.semester === s2 ? 'selected' : ''}>${s2}</option>`).join('')}</select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Section</label>
              <select class="form-control" id="sf-sec">${DB.getSections().map((s) => `<option ${st.section === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
            </div>
            <div class="form-group">
              <label>Department</label>
              <input type="text" class="form-control" id="sf-dept" value="${esc(st.department)}">
            </div>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" class="form-control" id="sf-email" value="${esc(st.email || '')}">
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input type="tel" class="form-control" id="sf-phone" value="${esc(st.phone || '')}">
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-outline" data-student-cancel>Cancel</button>
        <button class="btn btn-primary" id="student-save"><i class="fas fa-save"></i> Update</button>
      `
    });

    const ov = document.querySelector('.modal-overlay.active');
    ov.querySelector('[data-student-cancel]').addEventListener('click', Modal.close);

    document.getElementById('student-save').addEventListener('click', () => {
      const reg = document.getElementById('sf-reg').value.trim();
      const name = document.getElementById('sf-name').value.trim();
      if (!reg || !name) { Toast.warning('Register Number and Name are required.'); return; }

      const result = DB.updateStudent(studentId, {
        registerNumber: reg,
        name,
        year: document.getElementById('sf-year').value,
        semester: document.getElementById('sf-sem').value,
        section: document.getElementById('sf-sec').value,
        department: document.getElementById('sf-dept').value || 'AI&DS',
        email: document.getElementById('sf-email').value.trim(),
        phone: document.getElementById('sf-phone').value.trim()
      });
      if (!result.ok) { Toast.error(result.message); return; }
      Modal.close();
      Toast.success(result.message);
      renderStudentManagement();
    });
  };

  const removeStudent = (studentId) => {
    const st = DB.getStudents().find((s) => s.id === studentId);
    Confirm.show({
      title: 'Remove Student?',
      message: `Remove <strong>${st ? esc(st.name) : 'this student'}</strong> from the department? This cannot be undone.`,
      confirmText: 'Remove',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        DB.removeStudent(studentId);
        Toast.success('Student removed.');
        renderStudentManagement();
      }
    });
  };

  /* ---------- Staff Management (HOD) ---------- */

  const renderStaffManagement = () => {
    if (!Auth.protectPage('staff.management', 'Staff')) return;
    AppLayout.init('staff.html');

    const staff = DB.getStaff();
    const mount = document.getElementById('staff-tbody');
    if (!mount) return;

    document.getElementById('staff-subtitle').textContent = `${staff.length} faculty members · Department of AI & DS`;

    mount.innerHTML = staff.length ? staff.map((f) => `
      <tr>
        <td><strong>${esc(f.staffId)}</strong></td>
        <td>
          <div class="flex items-center gap-10">
            ${window.ProfilePhoto ? ProfilePhoto.avatarBadge({ userId: f.staffId, name: f.name, role: 'Staff' }) : `<div class="avatar" style="width:34px;height:34px;font-size:12px">${esc(Utils.initials(f.name))}</div>`}
            <span><strong>${esc(f.name)}</strong></span>
          </div>
        </td>
        <td>${esc(f.department)}</td>
        <td>${esc(f.designation)}</td>
        <td>
          ${(f.subjects || []).map((s) => `<span class="badge badge-primary mb-10" style="margin:2px">${esc(s)}</span>`).join(' ')}
        </td>
        <td>
          ${(f.classes || []).map((c) => `<span class="badge badge-gray mb-10" style="margin:2px">${esc(classLabel(c))}</span>`).join(' ')}
        </td>
        <td><span class="badge badge-success">Active</span></td>
        <td class="actions">
          <button class="btn btn-sm btn-outline" onclick="HodApp.viewStaff('${esc(f.id)}')"><i class="fas fa-eye"></i>View</button>
          <button class="btn btn-sm btn-outline" onclick="HodApp.editStaff('${esc(f.id)}')"><i class="fas fa-pen"></i>Edit</button>
        </td>
      </tr>
    `).join('') : TableRenderer.emptyState(8, 'No Staff Added');

    document.getElementById('btn-add-staff').addEventListener('click', () => addStaffModal());
  };

  const addStaffModal = () => {
    Modal.open({
      title: 'Add Staff',
      body: `
        <form novalidate>
          <p class="text-muted" style="margin-bottom:14px">The default login password will be the <strong>Staff ID</strong>.</p>
          <div class="form-group">
            <label>Staff ID <span class="required">*</span></label>
            <input type="text" class="form-control" id="sf2-id" placeholder="e.g. STAFF004">
            <div class="form-error" id="err-sf2-id">Staff ID is required.</div>
          </div>
          <div class="form-group">
            <label>Full Name <span class="required">*</span></label>
            <input type="text" class="form-control" id="sf2-name" placeholder="Staff name">
            <div class="form-error" id="err-sf2-name">Name is required.</div>
          </div>
          <div class="form-group">
            <label>Designation <span class="required">*</span></label>
            <select class="form-control" id="sf2-desig">
              <option>Assistant Professor</option>
              <option>Associate Professor</option>
              <option>Professor</option>
              <option>HOD</option>
            </select>
          </div>
          <div class="form-group">
            <label>Assigned Subjects</label>
            <input type="text" class="form-control" id="sf2-subs" placeholder="Comma separated, e.g. Artificial Intelligence, Machine Learning">
          </div>
          <div class="form-group">
            <label>Assigned Classes</label>
            <input type="text" class="form-control" id="sf2-cls" placeholder="Comma separated, e.g. I, II">
          </div>
          <div class="form-row">
            <div class="form-group"><label>Email</label><input type="email" class="form-control" id="sf2-email" placeholder="staff@college.edu"></div>
            <div class="form-group"><label>Phone</label><input type="tel" class="form-control" id="sf2-phone" placeholder="10-digit mobile"></div>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-outline" data-sf2-cancel>Cancel</button>
        <button class="btn btn-primary" id="sf2-save"><i class="fas fa-save"></i> Save</button>
      `
    });

    const ov = document.querySelector('.modal-overlay.active');
    ov.querySelector('[data-sf2-cancel]').addEventListener('click', Modal.close);

    document.getElementById('sf2-save').addEventListener('click', () => {
      const id = document.getElementById('sf2-id').value.trim();
      const name = document.getElementById('sf2-name').value.trim();
      if (!id || !name) { Toast.warning('Staff ID and name are required.'); return; }

      const result = DB.addStaff({
        staffId: id,
        name,
        department: 'AI&DS',
        designation: document.getElementById('sf2-desig').value,
        subjects: document.getElementById('sf2-subs').value.split(',').map((s) => s.trim()).filter(Boolean),
        classes: document.getElementById('sf2-cls').value.split(',').map((s) => s.trim()).filter(Boolean),
        email: document.getElementById('sf2-email').value.trim(),
        phone: document.getElementById('sf2-phone').value.trim()
      });
      if (!result.ok) { Toast.error(result.message); return; }
      Modal.close();
      Toast.success(result.message);
      renderStaffManagement();
    });
  };

  const editStaff = (staffId) => {
    const f = DB.getStaff().find((x) => x.id === staffId);
    if (!f) { Toast.error('Staff not found.'); return; }

    Modal.open({
      title: 'Edit Staff',
      body: `
        <form novalidate>
          <div class="form-group"><label>Staff ID</label><input type="text" class="form-control" id="sf2-id" value="${esc(f.staffId)}"></div>
          <div class="form-group"><label>Full Name</label><input type="text" class="form-control" id="sf2-name" value="${esc(f.name)}"></div>
          <div class="form-group">
            <label>Designation</label>
            <select class="form-control" id="sf2-desig">
              ${['Assistant Professor', 'Associate Professor', 'Professor', 'HOD'].map((d) => `<option ${f.designation === d ? 'selected' : ''}>${d}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Assigned Subjects</label><input type="text" class="form-control" id="sf2-subs" value="${esc((f.subjects || []).join(', '))}"></div>
          <div class="form-group"><label>Assigned Classes</label><input type="text" class="form-control" id="sf2-cls" value="${esc((f.classes || []).join(', '))}"></div>
          <div class="form-row">
            <div class="form-group"><label>Email</label><input type="email" class="form-control" id="sf2-email" value="${esc(f.email || '')}"></div>
            <div class="form-group"><label>Phone</label><input type="tel" class="form-control" id="sf2-phone" value="${esc(f.phone || '')}"></div>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-outline" data-sf2-cancel>Cancel</button>
        <button class="btn btn-primary" id="sf2-save"><i class="fas fa-save"></i> Update</button>
      `
    });

    const ov = document.querySelector('.modal-overlay.active');
    ov.querySelector('[data-sf2-cancel]').addEventListener('click', Modal.close);

    document.getElementById('sf2-save').addEventListener('click', () => {
      const result = DB.updateStaff(staffId, {
        staffId: document.getElementById('sf2-id').value.trim(),
        name: document.getElementById('sf2-name').value.trim(),
        designation: document.getElementById('sf2-desig').value,
        subjects: document.getElementById('sf2-subs').value.split(',').map((s) => s.trim()).filter(Boolean),
        classes: document.getElementById('sf2-cls').value.split(',').map((s) => s.trim()).filter(Boolean),
        email: document.getElementById('sf2-email').value.trim(),
        phone: document.getElementById('sf2-phone').value.trim()
      });
      if (!result.ok) { Toast.error(result.message); return; }
      Modal.close();
      Toast.success(result.message);
      renderStaffManagement();
    });
  };

  const viewStaff = (staffId) => {
    const f = DB.getStaff().find((x) => x.id === staffId);
    if (!f) return;
    const recs = DB.getAttendanceByStaff(staffId);
    const stats = overallStats(recs);
    Modal.open({
      title: `Staff Profile - ${esc(f.name)}`,
      body: `
        <div class="profile-info-grid">
          <div class="info-box"><label>Staff ID</label><p>${esc(f.staffId)}</p></div>
          <div class="info-box"><label>Designation</label><p>${esc(f.designation)}</p></div>
          <div class="info-box"><label>Email</label><p>${esc(f.email || '—')}</p></div>
          <div class="info-box"><label>Phone</label><p>${esc(f.phone || '—')}</p></div>
          <div class="info-box"><label>Classes</label><p>${esc((f.classes || []).join(', '))}</p></div>
          <div class="info-box"><label>Attendance Marked</label><p>${recs.length} records · ${stats.percentage}% present</p></div>
        </div>
      `
    });
  };

  /* ---------- Classes Management (HOD) ---------- */

  const renderClasses = () => {
    if (!Auth.protectPage('classes', 'Classes')) return;
    AppLayout.init('classes.html');

    const mount = document.getElementById('app-content');
    if (!mount) return;

    const cls = DB.getClasses();
    const acYears = DB.getAcademicYears();
    const semesters = DB.getSemesters();
    const sections = DB.getSections();
    const departments = DB.getDepartments();

    mount.innerHTML = `
      <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <h1>Classes & Academic Setup</h1>
          <p>Manage classes, sections, academic years, semesters and departments.</p>
        </div>
        <button class="btn btn-danger btn-sm" id="reset-all-data" style="height:38px">
          <i class="fas fa-trash-can"></i> Delete All Data
        </button>
      </div>

      <div class="tabs" id="cfg-tabs">
        <button class="tab active" data-tab="classes">Classes</button>
        <button class="tab" data-tab="sections">Sections</button>
        <button class="tab" data-tab="academic">Academic Year</button>
        <button class="tab" data-tab="semesters">Semesters</button>
        <button class="tab" data-tab="departments">Departments</button>
      </div>

      <div id="cfg-content"></div>
    `;

    const renderTab = (tab) => {
      document.querySelectorAll('#cfg-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
      const content = document.getElementById('cfg-content');
      let rowsHtml = '';

      if (tab === 'classes') {
        rowsHtml = cls.map((c) => `
          <tr>
            <td><strong>${esc(c.id)}</strong></td>
            <td>${esc(c.className || `${c.id} Sem B.Tech AI&DS`)}</td>
            <td>${esc(c.section || 'A')}</td>
          </tr>`).join('');
        content.innerHTML = `
          <div class="card">
            <div class="card-header">
              <div class="card-title"><i class="fas fa-school"></i>Classes</div>
              <button class="btn btn-primary btn-sm" id="add-class"><i class="fas fa-plus"></i> Add Class</button>
            </div>
            <div class="table-responsive">
              <table class="table">
                <thead><tr><th>Class ID</th><th>Class Name</th><th>Section</th></tr></thead>
                <tbody>${rowsHtml || TableRenderer.emptyState(3, 'No Classes Added')}</tbody>
              </table>
            </div>
          </div>`;
        document.getElementById('add-class').addEventListener('click', () => {
          Modal.open({
            title: 'Add Class',
            body: `
              <div class="form-group"><label>Class ID</label><input class="form-control" id="new-class-id" placeholder="V"></div>
              <div class="form-group"><label>Class Name</label><input class="form-control" id="new-class-name" placeholder="V Sem B.Tech AI&DS"></div>
              <div class="form-group"><label>Section</label>
                <select class="form-control" id="new-class-sec">${sections.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
              </div>`,
            footer: `<button class="btn btn-outline" data-cancel>Cancel</button>
                     <button class="btn btn-primary" id="save-class"><i class="fas fa-save"></i> Save</button>`
          });
          const ov = document.querySelector('.modal-overlay.active');
          ov.querySelector('[data-cancel]').addEventListener('click', Modal.close);
          document.getElementById('save-class').addEventListener('click', () => {
            const id = document.getElementById('new-class-id').value.trim();
            if (!id) { Toast.warning('Class ID is required.'); return; }
            const result = DB.addClass({ id, section: document.getElementById('new-class-sec').value, className: document.getElementById('new-class-name').value.trim() || `${id} Sem B.Tech AI&DS` });
            if (!result.ok) { Toast.error(result.message); return; }
            Modal.close();
            Toast.success(result.message);
            renderClasses();
          });
        });
      } else if (tab === 'sections') {
        rowsHtml = sections.map((s) => `<tr><td><span class="badge badge-gray">${esc(s)}</span></td></tr>`).join('');
        content.innerHTML = `
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fas fa-table-cells"></i>Sections</div></div>
            <div class="table-responsive"><table class="table"><thead><tr><th>Section</th></tr></thead>
            <tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      } else if (tab === 'academic') {
        rowsHtml = acYears.map((y) => `<tr><td><strong>${esc(y)}</strong></td><td><span class="badge badge-success">Active</span></td></tr>`).join('');
        content.innerHTML = `
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fas fa-calendar"></i>Academic Years</div>
            <button class="btn btn-primary btn-sm" id="add-acyr"><i class="fas fa-plus"></i> Add Year</button></div>
            <div class="table-responsive"><table class="table"><thead><tr><th>Academic Year</th><th>Status</th></tr></thead>
            <tbody>${rowsHtml}</tbody></table></div>
          </div>`;
        document.getElementById('add-acyr').addEventListener('click', () => {
          Modal.open({
            title: 'Add Academic Year',
            body: `<div class="form-group"><label>Academic Year</label><input class="form-control" id="new-year" placeholder="e.g. 2026-2027"></div>`,
            footer: `<button class="btn btn-outline" data-cancel>Cancel</button>
                     <button class="btn btn-primary" id="save-year"><i class="fas fa-save"></i> Save</button>`
          });
          const ov = document.querySelector('.modal-overlay.active');
          ov.querySelector('[data-cancel]').addEventListener('click', Modal.close);
          document.getElementById('save-year').addEventListener('click', () => {
            const y = document.getElementById('new-year').value.trim();
            if (!y) { Toast.warning('Enter an academic year.'); return; }
            const result = DB.addAcademicYear(y);
            Modal.close();
            if (result.ok) {
              Toast.success(result.message);
            } else {
              Toast.error(result.message);
            }
            renderClasses();
          });
        });
      } else if (tab === 'semesters') {
        rowsHtml = semesters.map((s) => `<tr><td><span class="badge badge-gray">Semester ${esc(s)}</span></td></tr>`).join('');
        content.innerHTML = `
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fas fa-layer-group"></i>Semesters</div></div>
            <div class="table-responsive"><table class="table"><thead><tr><th>Semester</th></tr></thead>
            <tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      } else {
        rowsHtml = departments.map((d) => `
          <tr><td><strong>${esc(d.code)}</strong></td><td>${esc(d.name)}</td></tr>`).join('');
        content.innerHTML = `
          <div class="card">
            <div class="card-header"><div class="card-title"><i class="fas fa-building-columns"></i>Departments</div></div>
            <div class="table-responsive"><table class="table"><thead><tr><th>Code</th><th>Name</th></tr></thead>
            <tbody>${rowsHtml}</tbody></table></div>
          </div>`;
      }
    };

    document.querySelectorAll('#cfg-tabs .tab').forEach((t) => {
      t.addEventListener('click', () => renderTab(t.dataset.tab));
    });

    // Destroy all stored data (hard reset back to a fresh empty system)
    document.getElementById('reset-all-data').addEventListener('click', () => {
      Confirm.show({
        title: 'Delete All Data?',
        message: 'This will permanently delete all students, staff, HOD accounts, classes, subjects, academic years, timetable entries and attendance records. This cannot be undone.',
        confirmText: 'Delete Everything',
        confirmClass: 'btn-danger',
        onConfirm: () => {
          DB.resetAllData();
          Toast.success('All data has been deleted.');
          setTimeout(() => Auth.logout(), 600);
        }
      });
    });

    renderTab('classes');
  };

  /* ---------- Subjects Management (HOD) ---------- */

  const renderSubjects = () => {
    if (!Auth.protectPage('subjects', 'Subjects')) return;
    AppLayout.init('subjects.html');

    const mount = document.getElementById('app-content');
    if (!mount) return;

    const subs = DB.getSubjects();
    const semesters = DB.getSemesters();

    const render = () => {
      mount.innerHTML = `
        <div class="page-header">
          <div>
            <h1>Subjects</h1>
            <p>Manage subjects offered by the department.</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fas fa-book-open"></i>Subject List</div>
            <button class="btn btn-primary btn-sm" id="add-subject"><i class="fas fa-plus"></i> Add Subject</button>
          </div>
          <div class="table-responsive">
            <table class="table">
              <thead><tr><th>Code</th><th>Subject Name</th><th>Semester</th></tr></thead>
              <tbody>
                ${DB.getSubjects().map((s) => `
                  <tr>
                    <td><span class="badge badge-info">${esc(s.code)}</span></td>
                    <td><strong>${esc(s.name)}</strong></td>
                    <td>Semester ${esc(s.semester)}</td>
                  </tr>`).join('') || TableRenderer.emptyState(3, 'No Subjects Added')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('add-subject').addEventListener('click', () => {
        Modal.open({
          title: 'Add Subject',
          body: `
            <div class="form-group"><label>Subject Code</label><input class="form-control" id="new-sub-code" placeholder="e.g. NLP"></div>
            <div class="form-group"><label>Subject Name</label><input class="form-control" id="new-sub-name" placeholder="e.g. Natural Language Processing"></div>
            <div class="form-group"><label>Semester</label>
              <select class="form-control" id="new-sub-sem">${semesters.map((s) => `<option>${s}</option>`).join('')}</select>
            </div>`,
          footer: `<button class="btn btn-outline" data-cancel>Cancel</button>
                   <button class="btn btn-primary" id="save-subject"><i class="fas fa-save"></i> Save</button>`
        });
        const ov = document.querySelector('.modal-overlay.active');
        ov.querySelector('[data-cancel]').addEventListener('click', Modal.close);
        document.getElementById('save-subject').addEventListener('click', () => {
          const code = document.getElementById('new-sub-code').value.trim().toUpperCase();
          const name = document.getElementById('new-sub-name').value.trim();
          if (!code || !name) { Toast.warning('Code and name are required.'); return; }
          const result = DB.addSubject({ code, name, semester: document.getElementById('new-sub-sem').value });
          if (!result.ok) { Toast.error(result.message); return; }
          Modal.close();
          Toast.success(result.message);
          render();
        });
      });
    };
    render();
  };

  /* ---------- Attendance Monitoring (HOD) ---------- */

  const renderMonitor = () => {
    if (!Auth.protectPage('attendance.monitor', 'Attendance Monitoring')) return;
    AppLayout.init('attendance.html?mode=monitor');

    const mount = document.getElementById('app-content');
    if (!mount) return;

    const allAtt = DB.getAttendance();

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Attendance Monitoring</h1>
          <p>Department-wide attendance overview and drill-down.</p>
        </div>
      </div>

      <div class="filters-bar">
        <div class="form-group">
          <label for="mon-year">Year</label>
          <select class="form-control" id="mon-year">
            <option value="">All Years</option>
            ${['I', 'II', 'III', 'IV'].map((y) => `<option>${y}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="mon-subject">Subject</label>
          <select class="form-control" id="mon-subject">
            <option value="">All Subjects</option>
            ${DB.getSubjects().map((s) => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="mon-staff">Staff</label>
          <select class="form-control" id="mon-staff">
            <option value="">All Staff</option>
            ${DB.getStaff().map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" id="mon-apply"><i class="fas fa-filter"></i> Apply</button>
        <button class="btn btn-outline" id="mon-reset"><i class="fas fa-rotate"></i> Reset</button>
      </div>

      <div class="stat-grid" id="mon-stats" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"></div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-bottom:24px">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-percent"></i>Monthly Trend</div></div>
          <div class="chart-container"><canvas id="mon-chart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fas fa-triangle-exclamation"></i>At-Risk Students</div></div>
          <div class="alert-list" id="mon-alerts"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-table"></i>Class-wise Detail</div></div>
        <div class="table-responsive">
          <table class="table">
            <thead><tr><th>Class</th><th>Total Records</th><th>Present</th><th>Absent</th><th>Late</th><th>Percentage</th></tr></thead>
            <tbody id="mon-table"></tbody>
          </table>
        </div>
      </div>
    `;

    const THRESHOLD = 75;

    const applyMonitor = () => {
      const year = document.getElementById('mon-year').value;
      const subject = document.getElementById('mon-subject').value;
      const staff = document.getElementById('mon-staff').value;

      let recs = [...allAtt];
      if (year) recs = recs.filter((r) => r.classId === year);
      if (subject) recs = recs.filter((r) => r.subjectCode === subject);
      if (staff) recs = recs.filter((r) => r.staffId === staff);

      const stats = overallStats(recs);

      document.getElementById('mon-stats').innerHTML = `
        <div class="stat-card"><div class="stat-icon i-primary"><i class="fas fa-clipboard-check"></i></div>
          <div class="stat-info"><h3>${stats.percentage}%</h3><p>Attendance</p></div></div>
        <div class="stat-card"><div class="stat-icon i-gray"><i class="fas fa-calendar-day"></i></div>
          <div class="stat-info"><h3>${stats.total.toLocaleString()}</h3><p>Records</p></div></div>
        <div class="stat-card"><div class="stat-icon i-success"><i class="fas fa-user-check"></i></div>
          <div class="stat-info"><h3>${stats.present + stats.late}</h3><p>Present</p></div></div>
        <div class="stat-card"><div class="stat-icon i-danger"><i class="fas fa-user-xmark"></i></div>
          <div class="stat-info"><h3>${stats.absent}</h3><p>Absent</p></div></div>
      `;

      // Monthly trend
      const monthMap = {};
      recs.forEach((r) => {
        const m = r.date.slice(0, 7);
        monthMap[m] = monthMap[m] || { present: 0, total: 0 };
        monthMap[m].total += 1;
        if (r.status !== 'absent') monthMap[m].present += 1;
      });
      const months = Object.keys(monthMap).sort();
      const pctTrend = months.map((m) => Math.round((monthMap[m].present / monthMap[m].total) * 100));

      const ch = document.getElementById('mon-chart');
      if (ch._chart) ch._chart.destroy();

      if (months.length) {
        ch._chart = new Chart(ch, {
          type: 'line',
          data: {
            labels: months.map((m) => {
              const [y, mo] = m.split('-');
              const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              return `${names[parseInt(mo, 10) - 1]} ${y}`;
            }),
            datasets: [{
              label: 'Attendance %',
              data: pctTrend,
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.12)',
              fill: true,
              tension: 0.35,
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a' } },
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } }, x: { grid: { display: false } } }
          }
        });
      } else {
        ch.parentElement.innerHTML = `<div class="empty-state"><i class="fas fa-chart-line"></i><h4>No Attendance Records</h4></div>`;
      }

      // At-risk students
      const studMap = {};
      recs.forEach((r) => {
        if (!studMap[r.studentId]) studMap[r.studentId] = { name: r.studentName, reg: r.registerNumber, present: 0, total: 0 };
        studMap[r.studentId].total += 1;
        if (r.status !== 'absent') studMap[r.studentId].present += 1;
      });
      const atRisk = Object.values(studMap)
        .filter((x) => Utils.percentage(x.present, x.total) < THRESHOLD)
        .sort((a, b) => Utils.percentage(a.present, a.total) - Utils.percentage(b.present, b.total));

      document.getElementById('mon-alerts').innerHTML = atRisk.length
        ? atRisk.slice(0, 6).map((x) => `
            <div class="alert-item danger-alert">
              <i class="fas fa-user-graduate"></i>
              <span><strong>${esc(x.name)}</strong> (${esc(x.reg)}) · ${Utils.percentage(x.present, x.total)}% below threshold.</span>
            </div>`).join('')
        : `<div class="alert-item" style="background:var(--secondary-light);border-color:rgba(16,185,129,0.3);color:#065f46"><i class="fas fa-circle-check"></i><span>No students below ${THRESHOLD}%.</span></div>`;

      // Class-wise table
      const clsMap = {};
      recs.forEach((r) => {
        if (!clsMap[r.classId]) clsMap[r.classId] = { present: 0, absent: 0, late: 0, total: 0 };
        clsMap[r.classId][r.status] += 1;
        clsMap[r.classId].total += 1;
      });
      document.getElementById('mon-table').innerHTML = DB.getClasses().length ? DB.getClasses().map((c) => {
        const g = clsMap[c.id];
        if (!g) return `<tr><td>${esc(classLabel(c.id))}</td><td colspan="5" class="text-muted">No data</td></tr>`;
        const pct = Utils.percentage(g.present + g.late, g.total);
        return `
          <tr>
            <td><strong>${esc(classLabel(c.id))} AI &amp; DS</strong></td>
            <td>${g.total.toLocaleString()}</td>
            <td class="text-success">${g.present}</td>
            <td class="text-danger">${g.absent}</td>
            <td class="text-warning">${g.late}</td>
            <td style="min-width:140px">
              <span class="attendance-pct" style="color:${Utils.pctColor(pct)}">${pct}%</span>
              <div class="progress mt-10"><div class="progress-bar" style="width:${pct}%;background:${Utils.pctColor(pct)}"></div></div>
            </td>
          </tr>`;
      }).join('') : TableRenderer.emptyState(6, 'No Classes Added');
    };

    document.getElementById('mon-apply').addEventListener('click', applyMonitor);
    document.getElementById('mon-reset').addEventListener('click', () => {
      ['mon-year', 'mon-subject', 'mon-staff'].forEach((id) => { document.getElementById(id).value = ''; });
      applyMonitor();
    });

    applyMonitor();
  };

  /* ---------- Boot ---------- */

  const init = () => {
    if (Auth.getRole() !== 'HOD') return;
    if (isOnPage('hod-dashboard.html')) {
      renderDashboard();
    } else if (isOnPage('students.html')) {
      renderStudentManagement();
    } else if (isOnPage('staff.html')) {
      renderStaffManagement();
    } else if (isOnPage('classes.html')) {
      renderClasses();
    } else if (isOnPage('subjects.html')) {
      renderSubjects();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    renderDashboard,
    renderStudentManagement,
    addStudentModal,
    editStudent,
    removeStudent,
    renderStaffManagement,
    addStaffModal,
    editStaff,
    viewStaff,
    renderClasses,
    renderSubjects,
    renderMonitor
  };
})();

window.HodApp = HodApp;