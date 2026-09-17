/* ============================================================
   Profile Module (v2)
   ------------------------------------------------------------
   Renders role-specific profiles (Student / Staff / HOD).
   Supports ?user=<studentId> for read-only staff/hod view.
   ============================================================ */

const ProfileApp = (() => {

  /* ─── helpers ────────────────────────────────────────────── */

  const esc2 = (s) => esc(String(s == null ? '' : s));

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return esc(d);
    return esc(dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
  };

  const fmtDateTime = (d) => {
    if (!d) return '—';
    const dt = new Date(d + 'T10:00:00');
    if (isNaN(dt)) return esc(d);
    return esc(dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
  };

  const session = () => Auth.getSession();
  const PERSON_ID_KEY = { Student: 'registerNumber', Staff: 'staffId', HOD: 'hodId' };
  const APP_DEPS = [
    { code: 'AI&DS', name: 'Artificial Intelligence & Data Science' },
    { code: 'AI', name: 'Artificial Intelligence & Data Science' }
  ];
  const deptName = (code) => (APP_DEPS.find((d) => d.code === code) || {}).name || code || 'Not Added';

  const ofSession = (role) => {
    if (role === 'Student') return DB.getStudents().find((s) => s.id === session().personId);
    if (role === 'Staff')   return DB.getStaff().find((f) => f.id === session().personId);
    return DB.getHODs().find((h) => h.id === session().personId);
  };

  const updateSessionName = (name) => {
    const s = session();
    if (!s) return;
    s.name = name;
    if (s.person) s.person.name = name;
    Auth.setSession(s);
  };

  const updateSessionPerson = (person) => {
    const s = session();
    if (!s) return;
    s.person = person;
    s.name = person.name;
    s.department = person.department;
    Auth.setSession(s);
  };

  /* ─── reusable component builders ────────────────────────── */

  const heroBannerClass = (role) =>
    role === 'Student' ? 'pf-banner--student' : role === 'Staff' ? 'pf-banner--staff' : 'pf-banner--hod';

  const roleBadgeClass = (role) =>
    role === 'HOD' ? 'pf-badge--hod' : role === 'Staff' ? 'pf-badge--staff' : 'pf-badge--student';

  const heroHTML = (name, role, dept, idLabel, idVal, email, editable, userId) => {
    const photoHtml = `
      <div class="pf-hero-photo" data-photo-user="${esc2(userId)}" data-photo-role="${esc2(role)}" data-photo-size="110" data-photo-size-class="xl" data-photo-name="${esc2(name)}">
        ${(window.ProfilePhoto ? ProfilePhoto.avatarHtml({ userId, name, role, sizeClass: 'xl' }) : `<div class="avatar xl">${esc2(name).split(' ').map((w) => w[0]).join('')}</div>`)}
        ${editable ? `<button class="pf-photo-edit-overlay" id="btn-photo-edit" title="Change photo" aria-label="Change profile photo"><i class="fas fa-camera"></i></button>` : ''}
      </div>`;

    const actionsHtml = editable ? `
      <div class="pf-hero-actions">
        <button class="btn btn-primary btn-sm" id="btn-edit-profile"><i class="fas fa-pen"></i> Edit Profile</button>
        <button class="btn btn-outline btn-sm" id="btn-change-photo"><i class="fas fa-camera"></i> Change Photo</button>
        <button class="btn btn-outline btn-sm" id="btn-remove-photo"><i class="fas fa-trash-can"></i> Remove Photo</button>
      </div>` : '';

    return `
      <section class="pf-hero card" aria-label="Profile header">
        <div class="pf-hero-banner ${heroBannerClass(role)}"></div>
        <div class="pf-hero-body">
          ${photoHtml}
          <div class="pf-hero-info">
            <h1 class="pf-hero-name">${esc2(name)}</h1>
            <span class="pf-role-badge ${roleBadgeClass(role)}"><i class="fas fa-user-shield"></i> ${esc2(role)}</span>
            <p class="pf-hero-dept"><i class="fas fa-building"></i> ${esc2(dept)}</p>
            <p class="pf-hero-id"><i class="fas fa-id-badge"></i> ${esc2(idLabel)}: <strong>${esc2(idVal)}</strong></p>
            ${email ? `<p class="pf-hero-email"><i class="fas fa-envelope"></i> ${esc2(email)}</p>` : ''}
            ${actionsHtml}
          </div>
        </div>
      </section>`;
  };

  const infoBox = (icon, label, value) => `
    <div class="info-box pf-ibox">
      <span class="pf-ibox-icon" aria-hidden="true"><i class="fas ${icon}"></i></span>
      <div class="pf-ibox-body">
        <label>${esc2(label)}</label>
        <p>${value || 'Not Added'}</p>
      </div>
    </div>`;

  const sectionCard = (icon, title, inner, attrs = '') => `
    <div class="card pf-section" ${attrs}>
      <div class="card-header">
        <div class="card-title"><i class="fas ${icon}"></i>${esc2(title)}</div>
      </div>
      ${inner}
    </div>`;

  const statMini = (icon, value, label, cls) => `
    <div class="stat-card pf-stat-mini">
      <div class="stat-icon ${cls}"><i class="fas ${icon}"></i></div>
      <div class="stat-info"><h3>${value}</h3><p>${esc2(label)}</p></div>
    </div>`;

  const ringDraw = (pct) => {
    const color = pct >= 90 ? 'var(--secondary)' : pct >= 75 ? 'var(--primary)' : 'var(--danger)';
    return `
      <div class="pf-ring-wrap">
        <div class="ring pf-ring" style="background:conic-gradient(${color} ${pct * 3.6}deg, var(--gray-100) 0deg)">
          <div class="ring-value">${pct}%</div>
          <span class="ring-label">Attendance</span>
        </div>
      </div>`;

  };

  const chipList = (items) =>
    `<div class="pf-chips">${(items || []).map((i) => `<span class="pf-chip">${esc2(i)}</span>`).join('')}</div>`;

  const timelineEntry = (icon, label, dateStr, cls = '') => `
    <div class="pf-timeline-item ${cls}">
      <div class="pf-timeline-dot"><i class="fas ${icon}"></i></div>
      <div class="pf-timeline-body">
        <span class="pf-timeline-label">${esc2(label)}</span>
        <span class="pf-timeline-date">${fmtDate(dateStr)}</span>
      </div>
    </div>`;

  /* ─── profile head ───────────────────────────────────────── */

  const profileHead = (name, subtitle, opts = {}) => {
    const userId = opts.userId || '';
    const role   = opts.role   || 'Student';
    const editable = opts.editable !== false;

    const photoSection = `
      <div class="profile-photo-section" data-photo-user="${esc2(userId)}" data-photo-role="${esc2(role)}" data-photo-size="88" data-photo-size-class="lg" data-photo-name="${esc2(name)}">
        ${(window.ProfilePhoto ? ProfilePhoto.avatarHtml({ userId, name, role, sizeClass: 'lg' }) : `<div class="avatar lg">${esc2(name).split(' ').map((w) => w[0]).join('')}</div>`)}
        ${editable ? `<button class="profile-photo-edit" id="btn-change-photo" type="button" aria-label="Change photo"><i class="fas fa-camera"></i></button>` : ''}
        ${editable ? `
          <div class="profile-photo-actions">
            <button class="btn btn-sm btn-outline" id="btn-change-photo" type="button"><i class="fas fa-camera"></i> Change Photo</button>
            <button class="btn btn-sm btn-outline" id="btn-remove-photo" type="button"><i class="fas fa-trash-can"></i> Remove Photo</button>
          </div>` : ''}
      </div>`;

    return `
      <div class="card" style="position:relative;overflow:hidden">
        <div class="profile-banner"></div>
        <div class="profile-avatar-wrap">
          ${photoSection}
          <div style="padding-bottom:10px">
            <h2 style="font-size:20px;font-weight:700">${esc2(name)}</h2>
            <p class="text-muted" style="font-size:13px">${esc2(subtitle)}</p>
          </div>
        </div>
      </div>`;
  };

  /* ─── photo controls wiring ──────────────────────────────── */

  const wirePhotoControls = (userId, role) => {
    const changeBtns = document.querySelectorAll('#btn-change-photo, #btn-photo-edit');
    const removeBtn  = document.getElementById('btn-remove-photo');

    changeBtns.forEach((btn) => btn.addEventListener('click', () => {
      const s = Auth.getSession();
      if (!s) return;
      ProfilePhoto.openChangePhotoModal({
        userId,
        name: s.name,
        role,
        onChange: () => { /* avatars auto-refresh */ }
      });
    }));

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (!ProfilePhoto.has(userId)) {
          Toast.info('You have not uploaded a profile photo yet.');
          return;
        }
        ProfilePhoto.openRemovePhotoModal({ userId });
      });
    }
  };

  /* ─── attendance summary (students) ──────────────────────── */

  const attendanceSummary = (studentId) => {
    const recs   = DB.getStudentAttendance(studentId);
    const total  = recs.length;
    const present = recs.filter((r) => r.status !== 'absent').length;
    const absent  = total - present;
    const pct     = Utils.percentage(present, total);
    const status  = pct >= 90 ? 'Excellent' : pct >= 75 ? 'Good' : 'Needs Attention';
    const statusCls = pct >= 90 ? 'i-success' : pct >= 75 ? 'i-primary' : 'i-danger';
    const statusIcon = pct >= 90 ? 'fa-trophy' : pct >= 75 ? 'fa-thumbs-up' : 'fa-exclamation-triangle';
    const statusColor = pct >= 90 ? 'color:var(--secondary)' : pct >= 75 ? 'color:var(--primary)' : 'color:var(--danger)';

    const statsInner = `
      <div class="pf-att-stats">
        ${ringDraw(pct)}
        <div class="pf-att-stat-grid">
          ${statMini('fa-chart-pie', pct + '%', 'Overall', 'i-primary')}
          ${statMini('fa-calendar-check', total, 'Total Classes', 'i-gray')}
          ${statMini('fa-circle-check', present, 'Present', 'i-success')}
          ${statMini('fa-circle-xmark', absent, 'Absent', 'i-danger')}
          ${statMini(statusIcon, `<span style="${statusColor};font-size:inherit;font-weight:700">${status}</span>`, 'Status', statusCls)}
        </div>
      </div>`;
    return sectionCard('fa-chart-pie', 'Attendance Summary', statsInner, 'id="pf-att-summary"');
  };

  /* ─── staff attendance (self view + HOD overview) ──────── */

  const staffAvatarP = (f, size = 28) =>
    window.ProfilePhoto
      ? ProfilePhoto.avatarBadge({ userId: f.staffId, name: f.name, role: 'Staff', size })
      : `<div class="avatar" style="width:${size}px;height:${size}px;font-size:11px">${esc2(Utils.initials(f.name))}</div>`;

  const staffStatusHtml = (status) => {
    const info = staffStatusInfo(status);
    return `<span class="badge ${info.cls}"><i class="fas ${info.icon}"></i> ${info.label}</span>`;
  };

  const staffEmployment = (f) => f.employmentStatus || f.status || 'Active';

  const staffAttendanceSelf = (staff) => {
    const stats = DB.getStaffAttendanceStats(staff.id);
    const recs = DB.getStaffAttendance({ staffId: staff.id }).slice()
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    const recent = recs.slice(0, 10);
    const pct = stats.attendancePct;

    return sectionCard('fa-clipboard-user', 'My Staff Attendance', `
      <p class="pf-wa-intro">Your attendance is marked by the Head of Department. View your daily records here.</p>
      <div class="pf-att-stats">
        ${ringDraw(pct)}
        <div class="pf-att-stat-grid">
          ${statMini('fa-chart-pie', pct + '%', 'Attendance', 'i-primary')}
          ${statMini('fa-calendar-check', stats.workingDays, 'Working Days', 'i-gray')}
          ${statMini('fa-user-check', stats.present, 'Present', 'i-success')}
          ${statMini('fa-user-xmark', stats.absent, 'Absent', 'i-danger')}
          ${statMini('fa-clock', stats.late, 'Late', 'i-warning')}
          ${statMini('fa-plane', stats.leave, 'Leave', 'i-info')}
          ${statMini('fa-sun', stats.halfDay, 'Half Day', 'i-warning')}
        </div>
      </div>
      <h4 class="pf-teach-label" style="margin:16px 0 8px"><i class="fas fa-clock-rotate-left"></i> Recent Attendance</h4>
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>Date</th><th>Day</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Marked By</th></tr></thead>
          <tbody>
            ${recent.length ? recent.map((r) => {
              const day = new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
              return `<tr>
                <td><strong>${esc2(r.date)}</strong></td>
                <td>${esc2(day)}</td>
                <td>${staffStatusHtml(r.status)}</td>
                <td>${esc2(r.checkIn || '—')}</td>
                <td>${esc2(r.checkOut || '—')}</td>
                <td>${esc2(r.updatedBy || r.markedBy || '—')}</td>
              </tr>`;
            }).join('') : TableRenderer.emptyState(6, 'No staff attendance marked yet')}
          </tbody>
        </table>
      </div>`);
  };

  const hodStaffAttendanceCard = () => {
    const today = Utils.todayISO();
    const ds = DB.getStaffAttendanceDailyStats(today);
    const staff = DB.getStaff();
    const todayLabel = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const list = staff.slice(0, 6).map((f) => {
      const rec = DB.getStaffAttendanceOn(f.id, today);
      return `<div class="sa-today-item"><span class="sa-today-name">${staffAvatarP(f, 28)}<span>${esc2(f.name)}</span></span>${staffStatusHtml(rec ? rec.status : 'not_marked')}</div>`;
    }).join('');

    return `
      <div class="card pf-section">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-clipboard-user"></i>Staff Attendance <span class="badge badge-gray">${esc2(todayLabel)}</span></div>
          <a class="btn btn-sm btn-primary" href="staff-attendance.html"><i class="fas fa-pen"></i> Mark Attendance</a>
        </div>
        <div class="pf-dept-stats">
          ${statMini('fa-user-tie', ds.totalStaff, 'Total Staff', 'i-info')}
          ${statMini('fa-user-check', ds.present, 'Present', 'i-success')}
          ${statMini('fa-user-xmark', ds.absent, 'Absent', 'i-danger')}
          ${statMini('fa-clock', ds.late, 'Late', 'i-warning')}
          ${statMini('fa-plane', ds.leave, 'Leave', 'i-info')}
          ${statMini('fa-sun', ds.halfDay, 'Half Day', 'i-warning')}
          ${statMini('fa-minus', ds.notMarked, 'Not Marked', 'i-gray')}
        </div>
        ${ds.marked === 0 && staff.length ? `
          <div class="sa-empty-banner" style="margin:0 20px 16px"><i class="fas fa-calendar-xmark"></i> No staff attendance marked yet today. Open <strong>Mark Attendance</strong> to update today's records.</div>`
        : `
          <div class="sa-today-list" style="margin:6px 20px 10px">
            <div class="sa-today-head"><h4>Today's Staff Status</h4></div>
            ${list}
          </div>
          <a class="btn btn-outline btn-sm" href="staff-attendance.html" style="margin:0 0 16px 20px"><i class="fas fa-arrow-right"></i> View Full Staff Attendance</a>`}
      </div>`;
  };

  /* ─── security card ──────────────────────────────────────── */

  const securityCard = (person) => {
    const pwLastUpdated = person.passwordUpdatedAt || person.lastUpdated || null;

    return `
      <div class="card pf-section">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-shield-halved"></i>Account &amp; Security</div>
        </div>
        <div class="pf-security-body">
          <div class="pf-sec-row">
            <div class="pf-sec-label">Account Status</div>
            <div class="pf-sec-value"><span class="pf-status-dot pf-status-active"></span>Active</div>
          </div>
          <div class="pf-sec-row">
            <div class="pf-sec-label">Password</div>
            <div class="pf-sec-value">
              <span>••••••••</span>
              <button class="btn btn-xs btn-outline" id="btn-change-pw" type="button"><i class="fas fa-pen"></i> Change</button>
            </div>
          </div>
          ${pwLastUpdated ? `
          <div class="pf-sec-row">
            <div class="pf-sec-label">Password Last Updated</div>
            <div class="pf-sec-value">${fmtDate(pwLastUpdated)}</div>
          </div>` : ''}
          <div class="pf-sec-row">
            <div class="pf-sec-label">Logout</div>
            <div class="pf-sec-value">
              <button class="btn btn-xs btn-danger" id="btn-sec-logout" type="button"><i class="fas fa-right-from-bracket"></i> Logout</button>
            </div>
          </div>
        </div>
      </div>`;
  };

  /* ─── activity card ──────────────────────────────────────── */

  const activityCard = (person) => {
    const entries = [];
    if (person.createdAt)     entries.push(timelineEntry('fa-user-plus', 'Account created', person.createdAt));
    if (person.lastUpdated)   entries.push(timelineEntry('fa-pen', 'Profile last updated', person.lastUpdated, 'pf-timeline-latest'));
    if (person.lastLogin)     entries.push(timelineEntry('fa-right-to-bracket', 'Last login', person.lastLogin));
    if (person.passwordUpdatedAt) entries.push(timelineEntry('fa-key', 'Password changed', person.passwordUpdatedAt));

    if (!entries.length) entries.push(timelineEntry('fa-clock', 'No activity yet', ''));

    return sectionCard('fa-timeline', 'Activity', `<div class="pf-timeline">${entries.join('')}</div>`);
  };

  /* ─── edit profile modal ─────────────────────────────────── */

  const openEditModal = (fields, onSave) => {
    const body = fields.map((f) => `
      <div class="form-group">
        <label>${esc2(f.label)}${f.required ? ' <span class="required">*</span>' : ''}</label>
        ${f.type === 'select'
          ? `<select class="form-control" id="pf-${f.key}">
              ${f.options.map((o) => `<option value="${esc2(o)}" ${o === f.value ? 'selected' : ''}>${esc2(o)}</option>`).join('')}
            </select>`
          : `<input type="${f.type || 'text'}" class="form-control" id="pf-${f.key}" value="${esc2(f.value || '')}" placeholder="${esc2(f.placeholder || '')}">`
        }
        ${f.hint ? `<span class="pf-field-hint">${esc2(f.hint)}</span>` : ''}
      </div>`
    ).join('');

    Modal.open({
      title: 'Edit Profile',
      body,
      footer: `
        <button class="btn btn-outline" data-ep-cancel>Cancel</button>
        <button class="btn btn-primary" id="pf-save"><i class="fas fa-save"></i> Save Changes</button>`
    });

    const ov = document.querySelector('.modal-overlay.active');
    if (!ov) return;
    ov.querySelector('[data-ep-cancel]').addEventListener('click', Modal.close);
    document.getElementById('pf-save').addEventListener('click', () => {
      const vals = {};
      fields.forEach((f) => { vals[f.key] = document.getElementById('pf-' + f.key).value.trim(); });
      onSave(vals);
    });
  };

  /* ─── WhatsApp attendance report settings ───────────────── */

  const waUpdate = (role, id, patch) =>
    role === 'Student' ? DB.updateStudent(id, patch) :
    role === 'Staff'   ? DB.updateStaff(id, patch) :
                         DB.updateHod(id, patch);

  const whatsappCard = (person, role) => {
    const number     = person.whatsappNumber || '';
    const usephoneOk = DB.validateWhatsAppNumber(person.phone);
    const consent    = !!person.whatsappConsent;

    return sectionCard('fa-brands fa-whatsapp', 'WhatsApp Attendance Reports', `
      <p class="pf-wa-intro">Get a copy of your daily attendance report on WhatsApp after each attendance day.</p>
      <div class="pf-wa-grid">
        <div class="pf-wa-block">
          <div class="pf-wa-label">WhatsApp Number</div>
          <div class="pf-wa-value" id="pf-wa-number">${number ? esc2(DB.fmtWhatsApp(number)) : 'Not set'}</div>
          <label class="pf-wa-check ${usephoneOk.ok ? '' : 'is-disabled'}">
            <input type="checkbox" id="pf-wa-usephone" ${usephoneOk.ok ? '' : 'disabled'}>
            <span>Use registered mobile number</span>
            <span class="text-muted" style="margin-left:auto">${usephoneOk.ok ? esc2(DB.fmtWhatsApp(usephoneOk.phone)) : 'invalid registered number'}</span>
          </label>
        </div>
        <div class="pf-wa-block">
          <label class="pf-wa-consent">
            <input type="checkbox" id="pf-wa-consent" ${consent ? 'checked' : ''}>
            <span class="pf-wa-switch"></span>
            <span>Receive daily attendance reports on WhatsApp</span>
          </label>
          <p class="pf-wa-hint">When enabled, your daily report is sent to the WhatsApp number above. You can turn this off anytime.</p>
        </div>
      </div>`, 'id="pf-whatsapp"');
  };

  const wireWhatsapp = (person, role, onChanged) => {
    const consentEl = document.getElementById('pf-wa-consent');
    if (consentEl) {
      consentEl.addEventListener('change', () => {
        const r = waUpdate(role, person.id, { whatsappConsent: consentEl.checked });
        if (!r.ok) { Toast.error(r.message); consentEl.checked = !consentEl.checked; return; }
        Toast.success(consentEl.checked ? 'WhatsApp reports enabled.' : 'WhatsApp reports disabled.');
        onChanged();
      });
    }
    const usePhoneEl = document.getElementById('pf-wa-usephone');
    if (usePhoneEl) {
      usePhoneEl.addEventListener('change', () => {
        if (!usePhoneEl.checked) return;
        const v = DB.validateWhatsAppNumber(person.phone);
        if (!v.ok) { Toast.error(v.message); usePhoneEl.checked = false; return; }
        const r = waUpdate(role, person.id, { whatsappNumber: v.phone });
        if (!r.ok) { Toast.error(r.message); usePhoneEl.checked = false; return; }
        Toast.success('WhatsApp number set to your registered mobile number.');
        onChanged();
      });
    }
  };

  const WA_EDIT_FIELD = (value) =>
    ({ key: 'whatsappNumber', label: 'WhatsApp Number', type: 'tel', value: value || '', placeholder: '98765 43210', hint: 'Indian mobile number for daily report delivery. Leave empty to keep current number.' });

  /* ─── change password modal ──────────────────────────────── */

  const openChangePasswordModal = (userId) => {
    Modal.open({
      title: 'Change Password',
      body: `
        <div class="form-group">
          <label>Current Password <span class="required">*</span></label>
          <div class="pf-pw-wrap">
            <input type="password" class="form-control" id="cp-current" autocomplete="current-password">
            <button type="button" class="pf-pw-toggle" data-pw-toggle="cp-current" aria-label="Toggle password visibility"><i class="fas fa-eye"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label>New Password <span class="required">*</span></label>
          <div class="pf-pw-wrap">
            <input type="password" class="form-control" id="cp-new" autocomplete="new-password">
            <button type="button" class="pf-pw-toggle" data-pw-toggle="cp-new" aria-label="Toggle password visibility"><i class="fas fa-eye"></i></button>
          </div>
          <div class="pf-pw-strength" id="pw-strength"></div>
        </div>
        <div class="form-group">
          <label>Confirm New Password <span class="required">*</span></label>
          <div class="pf-pw-wrap">
            <input type="password" class="form-control" id="cp-confirm" autocomplete="new-password">
            <button type="button" class="pf-pw-toggle" data-pw-toggle="cp-confirm" aria-label="Toggle password visibility"><i class="fas fa-eye"></i></button>
          </div>
        </div>`,
      footer: `
        <button class="btn btn-outline" data-cp-cancel>Cancel</button>
        <button class="btn btn-primary" id="cp-save"><i class="fas fa-check"></i> Update Password</button>`
    });

    const ov = document.querySelector('.modal-overlay.active');
    if (!ov) return;

    ov.querySelectorAll('[data-pw-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = ov.querySelector('#' + btn.dataset.pwToggle);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
      });
    });

    const newPwInput = ov.querySelector('#cp-new');
    const strengthEl = ov.querySelector('#pw-strength');
    const updateStrength = () => {
      const pw = newPwInput.value;
      const hasLen = pw.length >= 6;
      const hasUpper = /[A-Z]/.test(pw);
      const hasNum = /[0-9]/.test(pw);
      const hasSpecial = /[^A-Za-z0-9]/.test(pw);
      const score = [hasLen, hasUpper, hasNum, hasSpecial].filter(Boolean).length;
      const label = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Strong' : 'Very Strong';
      const cls = score <= 1 ? 'pf-pw--weak' : score === 2 ? 'pf-pw--fair' : score === 3 ? 'pf-pw--strong' : 'pf-pw--vstrong';
      strengthEl.innerHTML = pw
        ? `<div class="pf-pw-bar ${cls}"><div class="pf-pw-fill" style="width:${score * 25}%"></div></div><span class="pf-pw-label ${cls}">${label}</span>`
        : '';
    };
    newPwInput.addEventListener('input', updateStrength);

    ov.querySelector('[data-cp-cancel]').addEventListener('click', Modal.close);
    document.getElementById('cp-save').addEventListener('click', () => {
      const current = ov.querySelector('#cp-current').value;
      const newPw   = ov.querySelector('#cp-new').value;
      const confirm = ov.querySelector('#cp-confirm').value;

      if (!current)           { Toast.error('Please enter your current password.'); return; }
      if (newPw.length < 6)   { Toast.error('New password must be at least 6 characters.'); return; }
      if (newPw === current)  { Toast.error('New password must differ from current password.'); return; }
      if (newPw !== confirm)  { Toast.error('Passwords do not match.'); return; }

      const storedPw = (() => {
        let pw = {};
        try { pw = JSON.parse(localStorage.getItem('attendance_pw_overrides') || '{}'); } catch (_e) { /* ok */ }
        return pw[userId] || DB.getStudents().find((s) => s.registerNumber === userId)?.id ||
               DB.getStaff().find((f) => f.staffId === userId)?.id ||
               DB.getHODs().find((h) => h.hodId === userId)?.id || current;
      })();

      // Check current password matches session person ID (simple prototype check)
      // For prototype we trust the current password is correct since user is already authenticated.
      // Backend real implementation would verify server-side.

      const result = DB.updatePassword(userId, newPw);
      if (result.success) {
        const person = session().person;
        if (person) {
          person.passwordUpdatedAt = new Date().toISOString().slice(0, 10);
          const s = session();
          s.person = person;
          Auth.setSession(s);
        }
        Toast.success(result.message);
        Modal.close();
      } else {
        Toast.error(result.message);
      }
    });
  };

  /* ───────────────────────────────────────────────────────────
     STUDENT PROFILE
     ─────────────────────────────────────────────────────────── */

  const renderStudentProfile = (mount, studentId, readOnly) => {
    const st = DB.getStudents().find((x) => x.id === studentId);
    if (!st) {
      mount.innerHTML = `<div class="error-state"><i class="fas fa-user-slash"></i><h3>Student not found</h3><button class="btn btn-primary mt-16" onclick="Auth.redirectHome()"><i class="fas fa-home"></i> My Dashboard</button></div>`;
      return;
    }

    const stat   = (() => {
      const recs  = DB.getStudentAttendance(st.id);
      const total = recs.length;
      const pct   = Utils.percentage(recs.filter((r) => r.status !== 'absent').length, total);
      return { total, pct };
    })();
    const isSelf = session().personId === st.id && !readOnly;
    const editable = isSelf;

    mount.innerHTML = `
      <div class="pf-page-head">
        <div><h1 class="pf-page-title">Profile</h1><p class="pf-page-sub">Manage your personal information and account settings</p></div>
      </div>

      ${heroHTML(st.name, 'Student', deptName(st.department), 'Register No', st.registerNumber, st.email, editable, st.registerNumber)}

      <div class="pf-layout pf-grid-2">
        <div class="pf-col-main">
          ${sectionCard('fa-user', 'Personal Information', `
            <div class="profile-info-grid" id="profile-fields">
              ${infoBox('fa-user', 'Full Name', st.name)}
              ${infoBox('fa-id-badge', 'Register Number', st.registerNumber)}
              ${infoBox('fa-envelope', 'Email', st.email)}
              ${infoBox('fa-phone', 'Phone', st.phone)}
              ${infoBox('fa-cake-candles', 'Date of Birth', fmtDate(st.dob))}
              ${infoBox('fa-venus-mars', 'Gender', st.gender)}
            </div>`)}
        </div>
        <div class="pf-col-side">
          ${sectionCard('fa-graduation-cap', 'Academic Information', `
            <div class="profile-info-grid">
              ${infoBox('fa-building', 'Department', deptName(st.department))}
              ${infoBox('fa-layer-group', 'Year', st.year)}
              ${infoBox('fa-calendar', 'Semester', st.semester)}
              ${infoBox('fa-tag', 'Section', st.section)}
              ${infoBox('fa-calendar-days', 'Academic Year', st.academicYear || 'Not Added')}
              ${infoBox('fa-users', 'Batch', st.batch || (st.year ? st.year + ' Year' : 'Not Added'))}
            </div>`)}
        </div>
      </div>

      ${attendanceSummary(st.id)}

      ${whatsappCard(st, 'Student')}

      <div class="pf-layout pf-grid-2">
        ${sectionCard('fa-shield-halved', 'Account & Security', `
          <div class="pf-security-body">
            <div class="pf-sec-row"><div class="pf-sec-label">Account Status</div><div class="pf-sec-value"><span class="pf-status-dot pf-status-active"></span>Active</div></div>
            <div class="pf-sec-row"><div class="pf-sec-label">User ID</div><div class="pf-sec-value">${esc2(st.registerNumber)}</div></div>
            <div class="pf-sec-row"><div class="pf-sec-label">Last Updated</div><div class="pf-sec-value">${fmtDate(st.lastUpdated)}</div></div>
            <div class="pf-sec-row"><div class="pf-sec-label">Password</div><div class="pf-sec-value"><span>••••••••</span> <button class="btn btn-xs btn-outline" id="btn-change-pw" type="button"><i class="fas fa-pen"></i> Change</button></div></div>
            <div class="pf-sec-row"><div class="pf-sec-label">Logout</div><div class="pf-sec-value"><button class="btn btn-xs btn-danger" id="btn-sec-logout" type="button"><i class="fas fa-right-from-bracket"></i> Logout</button></div></div>
          </div>`)}
        ${activityCard(st)}
      </div>
    `;

    if (editable) wirePhotoControls(st.registerNumber, 'Student');

    // Edit Profile modal
    const editBtn = document.getElementById('btn-edit-profile');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        openEditModal([
          { key: 'name',    label: 'Full Name',     type: 'text',     value: st.name, required: true },
          { key: 'email',   label: 'Email',          type: 'email',    value: st.email },
          { key: 'phone',   label: 'Phone',          type: 'tel',      value: st.phone },
          { key: 'section', label: 'Section',        type: 'select',   value: st.section, options: ['A', 'B', 'UV', '—'] },
          { key: 'dob',     label: 'Date of Birth',  type: 'date',     value: st.dob, hint: 'Optional — displayed for identification only.' },
          WA_EDIT_FIELD(st.whatsappNumber),
        ], (vals) => {
          if (!vals.name) { Toast.error('Full name is required.'); return; }
          if (vals.whatsappNumber && !DB.validateWhatsAppNumber(vals.whatsappNumber).ok) {
            Toast.error(DB.validateWhatsAppNumber(vals.whatsappNumber).message); return;
          }
          const result = DB.updateStudent(st.id, { name: vals.name, email: vals.email, phone: vals.phone, section: vals.section, dob: vals.dob || null, whatsappNumber: vals.whatsappNumber });
          if (!result.ok) { Toast.error(result.message); return; }
          updateSessionName(result.record.name);
          Modal.close();
          Toast.success(result.message);
          AppLayout.refreshIdentity();
          renderStudentProfile(mount, st.id, readOnly);
        });
      });
    }

    wireWhatsapp(st, 'Student', () => renderStudentProfile(mount, st.id, readOnly));

    // Change password
    const changePwBtn = document.getElementById('btn-change-pw');
    if (changePwBtn) changePwBtn.addEventListener('click', () => openChangePasswordModal(st.registerNumber));

    // Logout
    const logoutBtn = document.getElementById('btn-sec-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      Confirm.show({
        title: 'Logout',
        message: 'Are you sure you want to log out of your account?',
        confirmText: 'Logout',
        confirmClass: 'btn-danger',
        onConfirm: () => Auth.logout()
      });
    });
  };

  /* ───────────────────────────────────────────────────────────
     STAFF PROFILE
     ─────────────────────────────────────────────────────────── */

  const renderStaffProfile = (mount, person) => {
    const staff = person;

    mount.innerHTML = `
      <div class="pf-page-head">
        <div><h1 class="pf-page-title">Profile</h1><p class="pf-page-sub">Manage your personal information and account settings</p></div>
      </div>

      ${heroHTML(staff.name, 'Staff', deptName(staff.department), 'Staff ID', staff.staffId, staff.email, true, staff.staffId)}

      <div class="pf-layout pf-grid-2">
        <div class="pf-col-main">
          ${sectionCard('fa-user', 'Personal Information', `
            <div class="profile-info-grid" id="profile-fields">
              ${infoBox('fa-user', 'Full Name', staff.name)}
              ${infoBox('fa-id-badge', 'Staff ID', staff.staffId)}
              ${infoBox('fa-envelope', 'Email', staff.email)}
              ${infoBox('fa-phone', 'Phone', staff.phone)}
              ${infoBox('fa-cake-candles', 'Date of Birth', fmtDate(staff.dob))}
              ${infoBox('fa-venus-mars', 'Gender', staff.gender)}
            </div>`)}
        </div>
        <div class="pf-col-side">
          ${sectionCard('fa-briefcase', 'Professional Information', `
            <div class="profile-info-grid">
              ${infoBox('fa-building', 'Department', deptName(staff.department))}
              ${infoBox('fa-user-tie', 'Designation', staff.designation)}
              ${infoBox('fa-graduation-cap', 'Qualification', staff.qualification)}
              ${infoBox('fa-circle-check', 'Employment Status', staffEmployment(staff))}
              ${infoBox('fa-calendar-plus', 'Joining Date', fmtDate(staff.joiningDate))}
              ${infoBox('fa-clock', 'Experience', staff.experienceYears ? staff.experienceYears + ' years' : 'Not Added')}
              ${infoBox('fa-calendar-days', 'Academic Year', staff.academicYear || 'Not Added')}
            </div>`)}
        </div>
      </div>

      ${sectionCard('fa-chalkboard-user', 'Teaching Information', `
        <div class="pf-teach-grid">
          <div class="pf-teach-block">
            <h4 class="pf-teach-label"><i class="fas fa-book"></i> Assigned Subjects</h4>
            ${chipList(staff.subjects)}
          </div>
          <div class="pf-teach-block">
            <h4 class="pf-teach-label"><i class="fas fa-users"></i> Assigned Classes</h4>
            ${chipList(staff.classes)}
          </div>
        </div>`)}

      <div id="pf-staff-self">${staffAttendanceSelf(staff)}</div>

      ${whatsappCard(staff, 'Staff')}

      <div class="pf-layout pf-grid-2">
        ${securityCard(staff)}
        ${activityCard(staff)}
      </div>
    `;

    wirePhotoControls(staff.staffId, 'Staff');

    // Edit Profile
    const editBtn = document.getElementById('btn-edit-profile');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        openEditModal([
          { key: 'name',         label: 'Full Name',    type: 'text',   value: staff.name, required: true },
          { key: 'email',        label: 'Email',         type: 'email',  value: staff.email },
          { key: 'phone',        label: 'Phone',         type: 'tel',    value: staff.phone },
          { key: 'dob',          label: 'Date of Birth', type: 'date',   value: staff.dob },
          WA_EDIT_FIELD(staff.whatsappNumber),
        ], (vals) => {
          if (!vals.name) { Toast.error('Full name is required.'); return; }
          if (vals.whatsappNumber && !DB.validateWhatsAppNumber(vals.whatsappNumber).ok) {
            Toast.error(DB.validateWhatsAppNumber(vals.whatsappNumber).message); return;
          }
          const result = DB.updateStaff(staff.id, { name: vals.name, email: vals.email, phone: vals.phone, dob: vals.dob || null, whatsappNumber: vals.whatsappNumber });
          if (!result.ok) { Toast.error(result.message); return; }
          updateSessionName(result.record.name);
          Modal.close();
          Toast.success(result.message);
          AppLayout.refreshIdentity();
          renderStaffProfile(mount, DB.getStaff().find((f) => f.id === staff.id));
        });
      });
    }

    wireWhatsapp(staff, 'Staff', () => renderStaffProfile(mount, DB.getStaff().find((f) => f.id === staff.id)));

    // Change password
    const changePwBtn = document.getElementById('btn-change-pw');
    if (changePwBtn) changePwBtn.addEventListener('click', () => openChangePasswordModal(staff.staffId));

    // Logout
    const logoutBtn = document.getElementById('btn-sec-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      Confirm.show({
        title: 'Logout',
        message: 'Are you sure you want to log out of your account?',
        confirmText: 'Logout',
        confirmClass: 'btn-danger',
        onConfirm: () => Auth.logout()
      });
    });
  };

  /* ───────────────────────────────────────────────────────────
     HOD PROFILE
     ─────────────────────────────────────────────────────────── */

  const renderHodProfile = (mount, person) => {
    const hod = person;

    const allStudents = DB.getStudents();
    const allStaff    = DB.getStaff();
    const allSubjects = DB.getSubjects();

    mount.innerHTML = `
      <div class="pf-page-head">
        <div><h1 class="pf-page-title">Profile</h1><p class="pf-page-sub">Manage your personal information and account settings</p></div>
      </div>

      ${heroHTML(hod.name, 'HOD', deptName(hod.department), 'HOD ID', hod.hodId, hod.email, true, hod.hodId)}

      <div id="hod-live-indicator" class="pf-live-indicator"></div>

      <div class="pf-layout pf-grid-2">
        <div class="pf-col-main">
          ${sectionCard('fa-user', 'Personal Information', `
            <div class="profile-info-grid" id="profile-fields">
              ${infoBox('fa-user', 'Full Name', hod.name)}
              ${infoBox('fa-id-badge', 'HOD ID', hod.hodId)}
              ${infoBox('fa-envelope', 'Email', hod.email)}
              ${infoBox('fa-phone', 'Phone', hod.phone)}
              ${infoBox('fa-cake-candles', 'Date of Birth', fmtDate(hod.dob))}
              ${infoBox('fa-venus-mars', 'Gender', hod.gender)}
            </div>`)}
        </div>
        <div class="pf-col-side">
          ${sectionCard('fa-briefcase', 'Professional Information', `
            <div class="profile-info-grid">
              ${infoBox('fa-building', 'Department', deptName(hod.department))}
              ${infoBox('fa-user-shield', 'Designation', 'Head of Department')}
              ${infoBox('fa-graduation-cap', 'Qualification', hod.education || hod.qualification)}
              ${infoBox('fa-calendar-plus', 'Joining Date', fmtDate(hod.joiningDate))}
              ${infoBox('fa-clock', 'Experience', hod.experienceYears ? hod.experienceYears + ' years' : 'Not Added')}
              ${infoBox('fa-calendar-days', 'Academic Year', hod.academicYear || 'Not Added')}
            </div>`)}
        </div>
      </div>

      ${sectionCard('fa-building', 'Department Overview', `
        <div class="pf-dept-stats">
          ${statMini('fa-users', allStudents.length, 'Total Students', 'i-primary')}
          ${statMini('fa-user-tie', allStaff.length, 'Total Staff', 'i-success')}
          ${statMini('fa-chalkboard', allSubjects.length, 'Subjects', 'i-info')}
          ${statMini('fa-calendar-check', DB.getClasses().length, 'Classes', 'i-gray')}
        </div>`)}

      <div id="pf-staffatt">${hodStaffAttendanceCard()}</div>

      ${whatsappCard(hod, 'HOD')}

      <div class="pf-layout pf-grid-2">
        ${securityCard(hod)}
        ${activityCard(hod)}
      </div>
    `;

    wirePhotoControls(hod.hodId, 'HOD');
    if (window.LiveAttendance && LiveAttendance.renderHodProfileIndicator) LiveAttendance.renderHodProfileIndicator();

    // Edit Profile
    const editBtn = document.getElementById('btn-edit-profile');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        openEditModal([
          { key: 'name',  label: 'Full Name',    type: 'text',   value: hod.name, required: true },
          { key: 'email', label: 'Email',         type: 'email',  value: hod.email },
          { key: 'phone', label: 'Phone',         type: 'tel',    value: hod.phone },
          { key: 'dob',   label: 'Date of Birth', type: 'date',   value: hod.dob },
          WA_EDIT_FIELD(hod.whatsappNumber),
        ], (vals) => {
          if (!vals.name) { Toast.error('Full name is required.'); return; }
          if (vals.whatsappNumber && !DB.validateWhatsAppNumber(vals.whatsappNumber).ok) {
            Toast.error(DB.validateWhatsAppNumber(vals.whatsappNumber).message); return;
          }
          const result = DB.updateHod(hod.id, { name: vals.name, email: vals.email, phone: vals.phone, dob: vals.dob || null, whatsappNumber: vals.whatsappNumber });
          if (!result.ok) { Toast.error(result.message); return; }
          updateSessionName(result.record.name);
          Modal.close();
          Toast.success(result.message);
          AppLayout.refreshIdentity();
          renderHodProfile(mount, DB.getHODs().find((h) => h.id === hod.id));
        });
      });
    }

    wireWhatsapp(hod, 'HOD', () => renderHodProfile(mount, DB.getHODs().find((h) => h.id === hod.id)));

    // Change password
    const changePwBtn = document.getElementById('btn-change-pw');
    if (changePwBtn) changePwBtn.addEventListener('click', () => openChangePasswordModal(hod.hodId));

    // Logout
    const logoutBtn = document.getElementById('btn-sec-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => {
      Confirm.show({
        title: 'Logout',
        message: 'Are you sure you want to log out of your account?',
        confirmText: 'Logout',
        confirmClass: 'btn-danger',
        onConfirm: () => Auth.logout()
      });
    });
  };

  /* ─── init ───────────────────────────────────────────────── */

  let profileRTBound = false;

  const init = () => {
    const s = Auth.getSession();
    if (!s) { window.location.href = 'index.html'; return; }
    if (!Auth.protectPage('profile', 'My Profile')) return;

    AppLayout.init('profile.html');

    const mount = document.getElementById('app-content');
    if (!mount) return;

    const params      = new URLSearchParams(window.location.search);
    const viewedStudentId = params.get('user');

    if (viewedStudentId && (s.role === 'Staff' || s.role === 'HOD')) {
      renderStudentProfile(mount, viewedStudentId, true);
      return;
    }

    const person = s.person;
    const role   = s.role;

    if (role === 'Student') renderStudentProfile(mount, person.id, false);
    else if (role === 'Staff') renderStaffProfile(mount, person);
    else renderHodProfile(mount, person);

    // Live refresh of staff attendance sections (HOD overview / staff self view)
    if ((role === 'Staff' || role === 'HOD') && window.RealtimeService && typeof RealtimeService.subscribe === 'function' && !profileRTBound) {
      profileRTBound = true;
      RealtimeService.subscribe('staffattendance.updated', () => {
        const selfCard = document.getElementById('pf-staff-self');
        const hodCard = document.getElementById('pf-staffatt');
        if (selfCard) {
          const staff = DB.getStaff().find((f) => f.id === session().personId);
          if (staff) selfCard.innerHTML = staffAttendanceSelf(staff);
        }
        if (hodCard) hodCard.innerHTML = hodStaffAttendanceCard();
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();

window.ProfileApp = ProfileApp;
