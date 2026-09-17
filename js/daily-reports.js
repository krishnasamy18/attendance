/* ============================================================
   Daily Reports & WhatsApp Delivery — page logic
   ------------------------------------------------------------
   Three page modes share this module:
     - HOD    (daily-reports.html)      Generate & Preview / Delivery Status / Settings
     - Staff  (staff-daily-reports.html) own reports + send/export + consent
     - Student(daily-report.html)        own report + send/export + consent
   ============================================================ */

window.DailyReportsApp = (() => {

  const $ = (sel) => document.querySelector(sel);

  const modeOf = () => {
    const page = window.location.pathname.split('/').pop().split('?')[0];
    if (page === 'daily-reports.html') return 'hod';
    if (page === 'staff-daily-reports.html') return 'staff';
    return 'student';
  };

  const TITLES = { hod: 'Daily Reports', staff: 'My Daily Reports', student: 'Daily Attendance Report' };
  const KEYS = { hod: 'daily-reports.html', staff: 'staff-daily-reports.html', student: 'daily-report.html' };
  const ROUTES = { hod: 'daily.reports', staff: 'staff.daily-reports', student: 'daily-report' };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const fmtDT = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  /* ---------- WhatsApp integration banner (honest) ---------- */

  const waBanner = () => {
    const cfg = (window.WhatsAppService || {}).getConfig ? WhatsAppService.getConfig() : { configured: false };
    if (cfg.configured) {
      return `<div class="dr-wa-banner"><i class="fa-brands fa-whatsapp"></i><div><strong>WhatsApp connected</strong><p>Reports can be sent through the configured backend service.</p></div></div>`;
    }
    return `
      <div class="dr-wa-banner">
        <i class="fa-brands fa-whatsapp"></i>
        <div>
          <strong>WhatsApp integration is not configured yet.</strong>
          <p>Reports below are real. Actual message delivery needs the backend WhatsApp service (WhatsApp Business/Cloud API). Send attempts are recorded honestly and will show as failed until integration is connected — no fake Sent/Delivered/Read statuses.</p>
        </div>
      </div>`;
  };

  /* ---------- Send flow (shared) ---------- */

  const sendFnFor = (report) => {
    if (report.role === 'student') return WhatsAppService.sendStudentReport;
    if (report.role === 'staff') return WhatsAppService.sendStaffReport;
    return WhatsAppService.sendHODReport;
  };

  const sendReportWithDupHandling = async (report) => {
    const send = sendFnFor(report);
    const res = await send(report);
    if (res.ok) { Toast.success('Report queued for WhatsApp delivery.'); return; }
    if (res.code === 'already-sent') {
      Modal.open({
        title: "Today's report has already been sent.",
        body: `<p style="color:#64748b;font-size:13px">A report for ${esc(report.role)} (${esc(report.date)}) is already in the delivery queue. You can resend it if needed.</p>`,
        footer: `
          <button class="btn btn-outline" data-rs-cancel>Close</button>
          <button class="btn btn-primary" id="rs-resend"><i class="fa-brands fa-whatsapp"></i> Resend</button>`
      });
      const ov = document.querySelector('.modal-overlay.active');
      ov.querySelector('[data-rs-cancel]').addEventListener('click', Modal.close);
      ov.querySelector('#rs-resend').addEventListener('click', async () => {
        Modal.close();
        const r2 = await send(report, { resend: true });
        if (r2.ok) Toast.success('Report resent for WhatsApp delivery.');
        else Toast.error(r2.message);
      });
      return;
    }
    Toast.error(res.message || 'Could not send the report.');
  };

  /* ---------- Shared report action bar ---------- */

  const actionBar = (report) => `
    <div class="dr-actions">
      <button class="btn btn-primary btn-sm" data-act="send"><i class="fa-brands fa-whatsapp"></i> Send WhatsApp</button>
      <button class="btn btn-outline btn-sm" data-act="pdf"><i class="fas fa-file-pdf"></i> PDF</button>
      <button class="btn btn-outline btn-sm" data-act="excel"><i class="fas fa-file-excel"></i> Excel</button>
      <button class="btn btn-outline btn-sm" data-act="print"><i class="fas fa-print"></i> Print</button>
    </div>`;

  const wireActions = (root, report) => {
    root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'send') { sendReportWithDupHandling(report); return; }
        if (act === 'pdf')  { ReportService.downloadReport(report, 'pdf'); return; }
        if (act === 'excel'){ ReportService.downloadReport(report, 'excel'); return; }
        if (act === 'print'){ ReportService.downloadReport(report, 'print'); return; }
      });
    });
  };

  const previewHTML = (report) => `
    <div class="dr-preview-head">
      <div>
        <h3 class="dr-preview-title">Daily ${esc(report.role)} Report</h3>
        <p class="dr-preview-date">${esc(report.date)} · ${esc(report.reportId)}</p>
      </div>
      ${actionBar(report)}
    </div>
    ${ReportService.reportHTML(report)}`;

  const emptyState = (icon, title, sub) => `
    <div class="dr-empty-state">
      <i class="fas ${icon}"></i>
      <h4>${esc(title)}</h4>
      <p style="font-size:13px">${esc(sub || '')}</p>
    </div>`;

  /* ============================================================
     HOD PAGE
     ============================================================ */

  const renderHodApp = (mount) => {
    mount.innerHTML = `
      <div class="page-header">
        <div><h1>Daily Reports</h1><p>Generate, preview, export and deliver daily attendance reports</p></div>
      </div>
      ${waBanner()}
      <div class="dr-tabs" role="tablist">
        <button class="dr-tab active" data-tab="generate" role="tab">Generate &amp; Preview</button>
        <button class="dr-tab" data-tab="delivery" role="tab">Delivery Status</button>
        <button class="dr-tab" data-tab="settings" role="tab">Settings</button>
      </div>
      <div id="dr-tab-body"></div>`;

    const tabs = mount.querySelectorAll('.dr-tab');
    const switchTab = (name) => {
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
      if (name === 'generate') renderGenerateTab(mount);
      else if (name === 'delivery') renderDeliveryTab(mount, {}, true);
      else renderSettingsTab(mount);
    };
    tabs.forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    renderGenerateTab(mount);
  };

  const classOptions = () => DB.getClasses().map((c) => `<option value="${esc(c.id)}">${esc(c.label)} (${esc(c.section)})</option>`).join('');
  const subjectOptions = () => DB.getSubjects().map((s) => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join('');
  const staffOptions = () => DB.getStaff().map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('');

  const renderGenerateTab = (mount) => {
    const holder = $('#dr-tab-body');
    if (!holder) return;
    const date = todayISO();

    holder.innerHTML = `
      <div class="card mb-16">
        <div class="card-body">
          <div class="dr-filters">
            <div class="form-group">
              <label>Attendance Date</label>
              <input type="date" class="form-control" id="dr-date" value="${esc(date)}">
            </div>
            <div class="form-group">
              <label>Report Type</label>
              <div class="dr-radio-group" id="dr-type-group">
                <label class="dr-radio"><input type="radio" name="dr-type" value="all" checked> All</label>
                <label class="dr-radio"><input type="radio" name="dr-type" value="student"> Students</label>
                <label class="dr-radio"><input type="radio" name="dr-type" value="staff"> Staff</label>
                <label class="dr-radio"><input type="radio" name="dr-type" value="hod"> HOD</label>
              </div>
            </div>
            <div class="form-group">
              <label>Class</label>
              <select class="form-control" id="dr-class"><option value="">All Classes</option>${classOptions()}</select>
            </div>
            <div class="form-group">
              <label>Section</label>
              <select class="form-control" id="dr-section"><option value="">All Sections</option><option>A</option><option>B</option><option>UV</option><option>—</option></select>
            </div>
            <div class="form-group">
              <label>Subject</label>
              <select class="form-control" id="dr-subject"><option value="">All Subjects</option>${subjectOptions()}</select>
            </div>
            <div class="form-group">
              <label>Staff</label>
              <select class="form-control" id="dr-staff"><option value="">All Staff</option>${staffOptions()}</select>
            </div>
            <button class="btn btn-primary" id="dr-generate"><i class="fas fa-wand-magic-sparkles"></i> Generate Report</button>
            <button class="btn btn-outline" id="dr-send-all"><i class="fa-brands fa-whatsapp"></i> Send All</button>
          </div>
        </div>
      </div>
      <div class="dr-admin-grid">
        <div class="card">
          <div class="card-header"><div class="card-title">Generated Reports <span class="badge badge-primary" id="dr-count">0</span></div></div>
          <div class="card-body dr-list-card" id="dr-list"><div class="dr-empty-state"><i class="fas fa-file-invoice"></i><h4>No reports generated yet</h4><p style="font-size:13px">Click Generate Report to build today's daily reports from real attendance data.</p></div></div>
        </div>
        <div class="dr-preview" id="dr-preview">
          ${emptyState('fa-arrow-left', 'Select a report', 'Choose a generated report to preview, export or send it on WhatsApp.')}
        </div>
      </div>`;

    const generate = (silent) => {
      const d = $('#dr-date').value || todayISO();
      const res = DB.generateAllDailyReports(d);
      if (!silent) Toast.success(`Generated ${res.generated} report(s) for ${d}${res.skipped ? ` (${res.skipped} already exist)` : ''}.`);
      renderReportList(mount, d);
    };

    $('#dr-generate').addEventListener('click', () => generate(false));

    $('#dr-send-all').addEventListener('click', async () => {
      const d = $('#dr-date').value || todayISO();
      const cfg = WhatsAppService.getConfig();
      if (!cfg.configured) { Toast.error('WhatsApp integration is not configured yet.'); return; }
      const res = await WhatsAppService.sendDailyReports(d);
      if (!res.ok) Toast.error(res.message);
      else Toast.success(`Queued ${res.sent} reports for delivery.`);
    });

    mount.querySelectorAll('#dr-type-group input').forEach((r) => r.addEventListener('change', () => {
      renderReportList(mount, $('#dr-date').value || todayISO());
    }));
    ['dr-class', 'dr-section', 'dr-subject', 'dr-staff'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => renderReportList(mount, $('#dr-date').value || todayISO()));
    });
    $('#dr-date').addEventListener('change', () => generate(true));

    generate(true);
  };

  const renderReportList = (mount, date) => {
    const list = $('#dr-list');
    const preview = $('#dr-preview');
    if (!list || !preview) return;

    const type = (mount.querySelector('#dr-type-group input:checked') || {}).value || 'all';
    const classId = $('#dr-class').value;
    const section = $('#dr-section').value;
    const subject = $('#dr-subject').value;
    const staffId = $('#dr-staff').value;

    let reports = DB.getDailyReports({ date });
    if (type !== 'all') reports = reports.filter((r) => r.role === type);
    if (!reports.length) { reportListEmpty(list, 'No reports for this selection'); return; }

    const filtered = reports.filter((r) => {
      if (r.role === 'student') {
        const st = DB.getStudents().find((s) => s.id === r.studentId);
        if (!st) return false;
        if (classId && st.year !== classId) return false;
        if (section && st.section !== section) return false;
        if (subject && !(r.subjects || []).some((s) => s.subjectCode === subject || s.subjectName === subject)) return false;
        return true;
      }
      if (r.role === 'staff') {
        if (staffId && r.staffId !== staffId) return false;
        if (!staffId && classId) return false;
        if (subject && !(r.sessions || []).some((s) => s.subjectCode === subject)) return false;
        return true;
      }
      if (classId || section || subject || staffId) return false;
      return true;
    });

    if (!filtered.length) { reportListEmpty(list, 'No reports match the current filters'); return; }

    const countEl = $('#dr-count');
    if (countEl) countEl.textContent = filtered.length;

    list.innerHTML = filtered.map((r, i) => {
      const roleIcon = r.role === 'student' ? 'fa-user-graduate' : r.role === 'staff' ? 'fa-user-tie' : 'fa-user-shield';
      const pctVal = r.role === 'student' ? r.percentage : r.role === 'staff' ? r.percentage : r.departmentPercentage;
      return `
        <button class="dr-list-item ${i === 0 ? 'active' : ''}" data-report="${esc(r.reportId)}">
          <div class="dr-list-item-role"><i class="fas ${roleIcon}"></i> ${r.role}</div>
          <div class="dr-list-item-name">${esc(r.role === 'student' ? r.name : r.role === 'staff' ? r.staffName : r.hodName)}</div>
          <div class="dr-list-item-meta">${esc(r.role === 'student' ? (r.registerNumber + ' · ' + (r.className || '')) : (r.role === 'staff' ? r.staffCode : r.hodCode))} · ${esc(r.reportId)}</div>
          <div class="dr-list-item-foot">
            <span class="badge ${pctVal >= 90 ? 'badge-success' : pctVal >= 75 ? 'badge-primary' : 'badge-danger'}">${pctVal}%</span>
            <span class="text-muted" style="font-size:11px">${r.role} · ${esc(r.date)}</span>
          </div>
        </button>`;
    }).join('');

    const show = (reportId) => {
      const report = DB.getDailyReportById(reportId);
      list.querySelectorAll('.dr-list-item').forEach((it) => it.classList.toggle('active', it.dataset.report === reportId));
      preview.innerHTML = report ? previewHTML(report) : emptyState('fa-triangle-exclamation', 'Report not found');
      if (report) wireActions(preview, report);
    };

    list.querySelectorAll('.dr-list-item').forEach((it) => it.addEventListener('click', () => show(it.dataset.report)));
    const first = list.querySelector('.dr-list-item');
    if (first) show(first.dataset.report);
  };

  const reportListEmpty = (list, msg) => {
    list.innerHTML = emptyState('fa-file-invoice', msg, 'Adjust the filters or click Generate Report.');
    $('#dr-count').textContent = '0';
  };

  /* ---------- Delivery Status tab ---------- */

  const statusBadge = (status) => {
    const map = {
      queued: ['badge-gray', 'Queued'],
      sending: ['badge-info', 'Sending'],
      sent: ['badge-primary', 'Sent'],
      delivered: ['badge-success', 'Delivered'],
      read: ['badge-success', 'Read'],
      failed: ['badge-danger', 'Failed']
    };
    const p = map[status] || ['badge-gray', status];
    return `<span class="badge ${p[0]}">${p[1]}</span>`;
  };

  const renderDeliveryTab = (mount, filters = {}, fresh) => {
    const holder = $('#dr-tab-body');
    if (!holder) return;
    const date = fresh || todayISO();

    holder.innerHTML = `
      <div class="dr-stats">
        <div class="stat-card"><div class="stat-icon i-primary"><i class="fas fa-file-invoice"></i></div><div class="stat-info"><h3 id="st-generated">0</h3><p>Generated</p></div></div>
        <div class="stat-card"><div class="stat-icon i-warning"><i class="fa-brands fa-whatsapp"></i></div><div class="stat-info"><h3 id="st-sent">0</h3><p>Sent</p></div></div>
        <div class="stat-card"><div class="stat-icon i-success"><i class="fas fa-circle-check"></i></div><div class="stat-info"><h3 id="st-delivered">0</h3><p>Delivered</p></div></div>
        <div class="stat-card"><div class="stat-icon i-danger"><i class="fas fa-circle-xmark"></i></div><div class="stat-info"><h3 id="st-failed">0</h3><p>Failed</p></div></div>
      </div>
      <div class="card mb-16">
        <div class="card-body">
          <div class="dr-filters">
            <div class="form-group"><label>Date</label><input type="date" class="form-control" id="del-date" value="${esc(date)}"></div>
            <div class="form-group"><label>Role</label><select class="form-control" id="del-role"><option value="">All Roles</option><option>student</option><option>staff</option><option>hod</option></select></div>
            <div class="form-group"><label>Status</label><select class="form-control" id="del-status"><option value="">All Statuses</option><option>queued</option><option>sending</option><option>sent</option><option>delivered</option><option>read</option><option>failed</option></select></div>
            <div class="form-group" style="flex:1;min-width:200px"><label>Search</label><input type="text" class="form-control" id="del-q" placeholder="Name, register no, phone..."></div>
            <button class="btn btn-outline" id="del-refresh"><i class="fas fa-rotate"></i> Refresh</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Delivery Records</div></div>
        <div class="card-body dr-tbl-wrap" id="del-body"></div>
      </div>`;

    const stats = DB.getDeliveryStats(date);
    $('#st-generated').textContent = stats.generated;
    $('#st-sent').textContent = stats.sent;
    $('#st-delivered').textContent = stats.delivered;
    $('#st-failed').textContent = stats.failed;

    const apply = () => {
      const d = $('#del-date').value || todayISO();
      const f = {
        date: d,
        role: $('#del-role').value,
        status: $('#del-status').value,
        q: $('#del-q').value
      };
      const rows = DB.getDeliveries(f);
      const body = $('#del-body');
      if (!body) return;
      const s = DB.getDeliveryStats(d);
      $('#st-generated').textContent = s.generated;
      $('#st-sent').textContent = s.sent;
      $('#st-delivered').textContent = s.delivered;
      $('#st-failed').textContent = s.failed;
      if (!rows.length) {
        body.innerHTML = emptyState('fa-comments', 'No reports are waiting for delivery', 'Sending attempts appear here once the WhatsApp integration is configured.');
        return;
      }
      body.innerHTML = `
        <table class="dr-tbl">
          <thead><tr><th>Recipient</th><th>Role</th><th>Report ID</th><th>WhatsApp No</th><th>Status</th><th>Time</th><th>Error</th><th></th></tr></thead>
          <tbody>${rows.map((d) => `
            <tr>
              <td><strong>${esc(d.recipientName)}</strong><div class="text-muted" style="font-size:11px">${esc(d.recipientCode || '')}</div></td>
              <td>${esc(d.recipientRole)}</td>
              <td style="font-size:12px">${esc(d.reportId)}</td>
              <td class="dr-phone">${esc(DB.fmtWhatsApp(d.phoneNumber)) || '—'}</td>
              <td>${statusBadge(d.status)}</td>
              <td style="font-size:12px;color:#64748b">${fmtDT(d.readAt || d.deliveredAt || d.sentAt || d.recordedAt)}</td>
              <td style="font-size:12px;color:#b91c1c;max-width:220px">${esc(d.error || '—')}</td>
              <td>${d.status === 'failed' ? `<button class="btn btn-xs btn-outline" data-retry="${esc(d.deliveryId)}"><i class="fas fa-rotate"></i> Retry</button>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table>`;
      body.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', async () => {
        const res = await WhatsAppService.retryFailedReport(b.dataset.retry);
        if (res.ok) Toast.success('Delivery retried.');
        else Toast.error(res.message);
        apply();
      }));
    };

    $('#del-refresh').addEventListener('click', apply);
    ['del-date', 'del-role', 'del-status'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', apply);
    });
    const q = $('#del-q');
    if (q) q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(apply, 250); });

    apply();
  };

  /* ---------- Settings tab ---------- */

  const renderSettingsTab = (mount) => {
    const holder = $('#dr-tab-body');
    if (!holder) return;
    const cfg = DB.getReportSettings();

    holder.innerHTML = `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-gear"></i> Daily Report Settings</div></div>
        <div class="card-body dr-settings">
          <div class="form-group">
            <label>Daily Report Time</label>
            <input type="time" class="form-control" id="cfg-time" value="${esc(cfg.dailyReportTime || '18:00')}">
            <span class="pf-field-hint">Time at which the daily reports are generated automatically.</span>
          </div>
          <div class="form-group">
            <label class="pf-wa-consent" style="gap:8px">
              <input type="checkbox" id="cfg-auto" ${cfg.autoEnabled ? 'checked' : ''}>
              <span class="pf-wa-switch"></span>
              <span>Enable automatic daily report generation</span>
            </label>
            <span class="pf-field-hint" style="display:block">Generate reports every day at the configured time.</span>
          </div>
          <div class="form-group">
            <label>Low Attendance Threshold (%)</label>
            <input type="number" class="form-control" id="cfg-threshold" min="1" max="100" value="${esc(cfg.threshold || 75)}">
            <span class="pf-field-hint">Students below this percentage are flagged in the HOD report.</span>
          </div>
          <div class="dr-settings-note">
            <i class="fas fa-circle-info"></i>
            Automatic generation and timed WhatsApp delivery are executed by the backend scheduler
            (node-cron / deployed job). This prototype stores the configuration only — the running
            server applies it.
          </div>
          <div style="margin-top:14px">
            <button class="btn btn-primary" id="cfg-save"><i class="fas fa-save"></i> Save Settings</button>
          </div>
        </div>
      </div>`;

    $('#cfg-save').addEventListener('click', () => {
      const res = DB.saveReportSettings({
        dailyReportTime: $('#cfg-time').value,
        autoEnabled: $('#cfg-auto').checked,
        threshold: Number($('#cfg-threshold').value) || 75
      });
      if (!res.ok) Toast.error(res.message);
      else Toast.success(res.message);
    });
  };

  /* ============================================================
     STAFF & STUDENT pages
     ============================================================ */

  const consentBlock = (person, role, personId) => {
    const number = person.whatsappNumber || '';
    const consent = !!person.whatsappConsent;
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-brands fa-whatsapp"></i> WhatsApp Delivery</div></div>
        <div class="card-body">
          <div class="pf-wa-grid">
            <div class="pf-wa-block">
              <div class="pf-wa-label">WhatsApp Number</div>
              <div class="pf-wa-value" style="margin-bottom:4px">${number ? esc(DB.fmtWhatsApp(number)) : 'Not set'}</div>
              <label class="pf-wa-check">
                <input type="checkbox" id="me-wa-usephone" ${DB.validateWhatsAppNumber(person.phone).ok ? '' : 'disabled'}>
                <span>Use registered mobile number</span>
              </label>
            </div>
            <div class="pf-wa-block">
              <label class="pf-wa-consent">
                <input type="checkbox" id="me-wa-consent" ${consent ? 'checked' : ''}>
                <span class="pf-wa-switch"></span>
                <span>Receive daily attendance reports on WhatsApp</span>
              </label>
              <p class="pf-wa-hint">Your daily report is sent to the number above. You can change this anytime.</p>
            </div>
          </div>
        </div>
      </div>`;
  };

  const wireConsent = (person, role, onChanged) => {
    const consentEl = $('#me-wa-consent');
    if (consentEl) consentEl.addEventListener('change', () => {
      const r = role === 'Student' ? DB.updateStudent(person.id, { whatsappConsent: consentEl.checked })
               : role === 'Staff' ? DB.updateStaff(person.id, { whatsappConsent: consentEl.checked })
               : DB.updateHod(person.id, { whatsappConsent: consentEl.checked });
      if (!r.ok) { Toast.error(r.message); return; }
      Toast.success('WhatsApp consent updated.');
      onChanged();
    });
    const useEl = $('#me-wa-usephone');
    if (useEl) useEl.addEventListener('change', () => {
      if (!useEl.checked) return;
      const v = DB.validateWhatsAppNumber(person.phone);
      if (!v.ok) { Toast.error(v.message); useEl.checked = false; return; }
      const r = role === 'Student' ? DB.updateStudent(person.id, { whatsappNumber: v.phone })
               : role === 'Staff' ? DB.updateStaff(person.id, { whatsappNumber: v.phone })
               : DB.updateHod(person.id, { whatsappNumber: v.phone });
      if (!r.ok) { Toast.error(r.message); useEl.checked = false; return; }
      Toast.success('WhatsApp number set to your registered mobile number.');
      onChanged();
    });
  };

  const renderOwnReport = (mount, person, role) => {
    const pageTitle = TITLES[role === 'Student' ? 'student' : 'staff'];
    mount.innerHTML = `
      <div class="page-header">
        <div><h1>${esc(pageTitle)}</h1><p>Your daily attendance report for today</p></div>
      </div>
      ${waBanner()}
      <div class="card mb-16">
        <div class="card-body">
          <div class="dr-filters">
            <div class="form-group"><label>Attendance Date</label><input type="date" class="form-control" id="me-date"></div>
            <button class="btn btn-primary" id="me-generate"><i class="fas fa-wand-magic-sparkles"></i> Generate / Refresh</button>
          </div>
        </div>
      </div>
      ${consentBlock(person, role, person.id)}
      <div id="me-preview"></div>`;

    const meDate = $('#me-date');
    meDate.value = todayISO();

    const render = () => {
      const date = meDate.value || todayISO();
      const generate = role === 'Student'
        ? DB.generateStudentReport(date, person.id)
        : DB.generateStaffReport(date, person.id);

      const preview = $('#me-preview');
      if (!generate) {
        preview.innerHTML = role === 'Student'
          ? emptyState('fa-calendar-xmark', 'No attendance recorded today.', 'Attendance will appear here once your staff marks classes for this date.')
          : emptyState('fa-calendar-xmark', 'No attendance sessions recorded today.', 'Your sessions will appear here once attendance is marked for this date.');
        return;
      }
      preview.innerHTML = previewHTML(generate);
      wireActions(preview, generate);
    };

    $('#me-generate').addEventListener('click', render);
    meDate.addEventListener('change', render);
    render();
  };

  /* ============================================================
     init
     ============================================================ */

  const init = () => {
    const mode = modeOf();
    const s = Auth.getSession();
    if (!s) { window.location.href = 'index.html'; return; }
    if (!Auth.protectPage(ROUTES[mode], TITLES[mode])) return;

    AppLayout.init(KEYS[mode]);

    const mount = document.getElementById('app-content');
    if (!mount) return;

    if (mode === 'hod') renderHodApp(mount);
    else if (mode === 'staff') renderOwnReport(mount, s.person, 'Staff');
    else renderOwnReport(mount, s.person, 'Student');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();