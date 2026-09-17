/* ============================================================
   App Core - shared UI utilities, layout shell, components
   ============================================================ */

/* ---------- Escape HTML helpers ---------- */

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- Toast notifications ---------- */

const Toast = (() => {
  const container = (() => {
    let el = document.querySelector('.toast-container');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast-container';
      document.body.appendChild(el);
    }
    return el;
  })();

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
  };
  const titles = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info'
  };

  const show = (type, message, title) => {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <div class="toast-body">
        <div class="toast-title">${esc(title || titles[type] || 'Notification')}</div>
        <div class="toast-message">${esc(message)}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss notification"><i class="fas fa-xmark"></i></button>
    `;
    container.appendChild(toast);

    const remove = () => {
      if (!toast.isConnected) return;
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, 4500);
  };

  return {
    success: (m) => show('success', m),
    error: (m) => show('error', m),
    warning: (m) => show('warning', m),
    info: (m) => show('info', m)
  };
})();

/* ---------- Modal ---------- */

const Modal = (() => {
  let overlay = null;

  const ensure = () => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });
    }
    return overlay;
  };

  const open = ({ title = '', body = '', footer = '' }) => {
    const ov = ensure();
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" aria-label="Close"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
    ov.querySelector('.modal-close').addEventListener('click', close);
    ov.classList.add('active');
    const firstInput = ov.querySelector('input, select, button:not(.modal-close)');
    if (firstInput) firstInput.focus();
    return ov;
  };

  const close = () => {
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => { overlay.innerHTML = ''; }, 250);
    }
  };

  return { open, close };
})();

/* ---------- Confirm dialog helper ---------- */

const Confirm = {
  show: ({ title = 'Are you sure?', message = '', confirmText = 'Confirm', confirmClass = 'btn-primary', onConfirm }) => {
    Modal.open({
      title,
      body: `<p style="font-size:14px;color:var(--gray-600);line-height:1.6">${message}</p>`,
      footer: `
        <button class="btn btn-outline" data-confirm-cancel>Cancel</button>
        <button class="btn ${confirmClass}" data-confirm-ok>${esc(confirmText)}</button>
      `
    });
    const ov = document.querySelector('.modal-overlay.active');
    ov.querySelector('[data-confirm-cancel]').addEventListener('click', Modal.close);
    ov.querySelector('[data-confirm-ok]').addEventListener('click', () => {
      Modal.close();
      if (onConfirm) onConfirm();
    });
  }
};

/* ---------- Loading overlay ---------- */

const Loading = (() => {
  let el = null;
  const ensure = () => {
    if (!el) {
      el = document.createElement('div');
      el.className = 'loading-overlay';
      el.innerHTML = `
        <div class="loader-ring"></div>
        <span>Please wait...</span>
      `;
      document.body.appendChild(el);
    }
    return el;
  };
  const show = (msg) => {
    const e = ensure();
    if (msg) e.querySelector('span').textContent = msg;
    e.classList.add('active');
  };
  const hide = () => {
    if (el) el.classList.remove('active');
  };
  return { show, hide };
})();

/* ---------- Button loading state ---------- */

const Buttons = {
  loading(btn, msg = 'Please wait...') {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('btn-loading');
    btn.innerHTML = `<span class="spinner"></span> ${esc(msg)}`;
  },
  reset(btn) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
  }
};

/* ---------- Generic helpers ---------- */

const Utils = {
  formatDate(d) {
    const date = new Date(d);
    if (isNaN(date)) return d;
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
  },

  todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  },

  initials(name) {
    return String(name || '?')
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  },

  /* Status label + badge class */
  statusInfo(status) {
    const map = {
      present: { label: 'Present', cls: 'badge-success', dot: 'present' },
      absent: { label: 'Absent', cls: 'badge-danger', dot: 'absent' },
      late: { label: 'Late', cls: 'badge-warning', dot: 'late' }
    };
    return map[status] || { label: status, cls: 'badge-gray', dot: '' };
  },

  percentage(part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  },

  /* Live elapsed time (HH:MM:SS) from an ISO start timestamp. */
  clock(iso) {
    if (!iso) return '00:00:00';
    const ms = Math.max(0, Date.now() - new Date(iso).getTime());
    const s = Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  },

  pctColor(pct) {
    if (pct >= 80) return 'var(--secondary)';
    if (pct >= 75) return 'var(--warning)';
    return 'var(--danger)';
  },

  pctStatus(pct) {
    if (pct >= 80) return { text: 'Good', cls: 'badge-success' };
    if (pct >= 75) return { text: 'Warning', cls: 'badge-warning' };
    return { text: 'Critical', cls: 'badge-danger' };
  },

  /* Client-side pagination */
  paginate(list, page, perPage) {
    const start = (page - 1) * perPage;
    return list.slice(start, start + perPage);
  }
};

/* ---------- Table render helpers ---------- */

const TableRenderer = {
  /* Pagination widget; returns rendered html */
  paginationHtml({ page, pages, total, perPage, onPage }) {
    const btn = (label, pg, opts = {}) =>
      `<button type="button" ${pg < 1 || pg > pages || opts.active || opts.disabled ? `disabled ${opts.active ? 'class="active"' : ''} ${opts.disabled ? 'disabled' : ''}` : ''}
        data-page="${pg}">${label}</button>`;

    let html = `<div class="pagination">`;
    html += `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page"><i class="fas fa-chevron-left"></i></button>`;

    let start = Math.max(1, page - 2);
    let end = Math.min(pages, start + 4);
    start = Math.max(1, end - 4);
    for (let p = start; p <= end; p++) {
      html += `<button type="button" data-page="${p}" class="${p === page ? 'active' : ''}">${p}</button>`;
    }
    html += `<button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page"><i class="fas fa-chevron-right"></i></button>`;
    html += `<span class="page-info">Page ${page} of ${pages} (${total} records)</span>`;
    html += `</div>`;
    return html;
  },

  attachPagination(el, onPage) {
    el.querySelectorAll('[data-page]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        onPage(parseInt(b.dataset.page, 10));
      });
    });
  },

  emptyState(colspan, message = 'No records found.') {
    return `<tr><td colspan="${colspan}">
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <h4>${esc(message)}</h4>
      </div>
    </td></tr>`;
  }
};

/* ---------- Chart.js helpers ---------- */

const Charts = {
  defaults() {
    if (window.Chart && Chart.defaults) {
      const css = getComputedStyle(document.documentElement);
      const fontFamily = css ? css.getPropertyValue('--font') : '';
      if (fontFamily) Chart.defaults.font.family = fontFamily;
      Chart.defaults.font.size = 12;
      Chart.defaults.color = '#64748b';
    }
  },

  donut(canvas, data, colorMap = { present: '#10b981', absent: '#ef4444', late: '#f59e0b' }) {
    if (!window.Chart) return;
    new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.values,
          backgroundColor: data.colors || data.labels.map((l) => colorMap[l] || '#94a3b8'),
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          tooltip: { backgroundColor: '#0f172a' }
        }
      }
    });
  },

  bar(canvas, labels, dataset, options = {}) {
    if (!window.Chart) return;
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: options.seriesLabel || 'Attendance %',
          data: dataset,
          backgroundColor: options.backgrounds || 'rgba(37, 99, 235, 0.75)',
          borderRadius: 6,
          maxBarThickness: 42
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: options.showLegend || false },
          tooltip: { backgroundColor: '#0f172a', callbacks: { label: (c) => `${c.parsed.y}%` } }
        },
        scales: {
          y: { beginAtZero: true, max: options.max !== undefined ? options.max : 100, ticks: { callback: (v) => `${v}%` }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  },

  line(canvas, labels, dataset, options = {}) {
    if (!window.Chart) return;
    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: options.seriesLabel || 'Attendance %',
          data: dataset,
          borderColor: options.color || '#2563eb',
          backgroundColor: options.fill || 'rgba(37, 99, 235, 0.12)',
          fill: options.fill !== false,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: options.color || '#2563eb'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: options.showLegend || false },
          tooltip: { backgroundColor: '#0f172a', callbacks: { label: (c) => `${c.parsed.y}%` } }
        },
        scales: {
          y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
          x: { grid: { display: false } }
        }
      }
    });
  }
};

/* ---------- Sidebar generation ---------- */

const NAV_CONFIG = {
  Student: {
    label: 'Student',
    items: [
      { route: 'student.dashboard', key: 'student-dashboard.html', icon: 'fa-gauge-high', label: 'Dashboard' },
      { route: 'attendance.view', key: 'attendance.html', icon: 'fa-clipboard-check', label: 'My Attendance' },
      { route: 'attendance.view', key: 'attendance.html?view=history', icon: 'fa-clock-rotate-left', label: 'Attendance History' },
      { route: 'daily-report', key: 'daily-report.html', icon: 'fa-file-invoice', label: 'Daily Report' },
      { route: 'timetable', key: 'timetable.html', icon: 'fa-calendar-days', label: 'Timetable' },
      { route: 'profile', key: 'profile.html', icon: 'fa-user', label: 'Profile' }
    ]
  },
  Staff: {
    label: 'Staff',
    items: [
      { route: 'staff.dashboard', key: 'staff-dashboard.html', icon: 'fa-gauge-high', label: 'Dashboard' },
      { route: 'attendance.mark', key: 'attendance.html?mode=mark', icon: 'fa-pen-to-square', label: 'Mark Attendance' },
      { route: 'attendance.view', key: 'attendance.html', icon: 'fa-clock-rotate-left', label: 'Attendance History' },
      { route: 'staff.daily-reports', key: 'staff-daily-reports.html', icon: 'fa-file-invoice', label: 'My Daily Reports' },
      { route: 'students', key: 'students.html', icon: 'fa-users', label: 'Students' },
      { route: 'timetable', key: 'timetable.html', icon: 'fa-calendar-days', label: 'Timetable' },
      { route: 'reports', key: 'reports.html', icon: 'fa-chart-pie', label: 'Reports' },
      { route: 'profile', key: 'profile.html', icon: 'fa-user', label: 'Profile' }
    ]
  },
  HOD: {
    label: 'HOD',
    items: [
      { route: 'hod.dashboard', key: 'hod-dashboard.html', icon: 'fa-gauge-high', label: 'Dashboard' },
      { route: 'hod.live-monitoring', key: 'hod-live-monitoring.html', icon: 'fa-video', label: 'Live Monitoring', live: true },
      { route: 'students.management', key: 'students.html', icon: 'fa-users', label: 'Students' },
      { route: 'staff.management', key: 'staff.html', icon: 'fa-user-tie', label: 'Staff' },
      { route: 'classes', key: 'classes.html?tab=classes', icon: 'fa-school', label: 'Classes' },
      { route: 'subjects', key: 'subjects.html', icon: 'fa-book-open', label: 'Subjects' },
      { route: 'timetable', key: 'timetable.html', icon: 'fa-calendar-days', label: 'Timetable' },
      { route: 'attendance.monitor', key: 'attendance.html?mode=monitor', icon: 'fa-chart-line', label: 'Attendance Monitoring' },
      { route: 'daily.reports', key: 'daily-reports.html', icon: 'fa-file-invoice', label: 'Daily Reports' },
      { route: 'reports', key: 'reports.html', icon: 'fa-chart-pie', label: 'Reports' },
      { route: 'profile', key: 'profile.html', icon: 'fa-user', label: 'Profile' }
    ]
  }
};

const AppLayout = {
  /**
   * Build sidebar + header into the app shell on a dashboard page.
   */
  init(activeKey) {
    const session = Auth.getSession();
    if (!session) return;

    const role = session.role;
    const cfg = NAV_CONFIG[role];
    if (!cfg) return;

    const sidebar = document.getElementById('sidebar');
    const currentFull = window.location.pathname.split('/').pop() + (window.location.search || '');
    const effectiveActive = activeKey || '';

    const navItems = cfg.items.map((it) => {
      const isActive = it.key === effectiveActive || it.key === currentFull;
      return `
        <a href="${it.key}" class="nav-item ${isActive ? 'active' : ''}" data-route="${it.route}">
          <i class="fas ${it.icon}"></i>${it.label}
          ${it.live ? `<span class="nav-live-badge hidden" data-live-badge></span>` : ''}
        </a>
      `;
    }).join('');

    sidebar.innerHTML = `
      <div class="sidebar-header">
        <div class="sidebar-logo"><i class="fas fa-graduation-cap"></i></div>
        <div class="sidebar-brand">ATTENDANCE<span>Management System</span></div>
      </div>
      <div class="role-badge-nav ${role.toLowerCase()}"><i class="fas fa-user-shield"></i> ${esc(role)}</div>
      <nav class="sidebar-nav" aria-label="Main navigation">
        ${navItems}
        <div class="nav-section-label">Account</div>
        <button class="nav-item logout-item" data-logout>
          <i class="fas fa-power-off"></i>Logout
        </button>
      </nav>
      <div class="sidebar-footer">© 2026 College AMS</div>
    `;

    sidebar.querySelector('[data-logout]').addEventListener('click', () => {
      Confirm.show({
        title: 'Logout',
        message: 'Are you sure you want to log out of your account?',
        confirmText: 'Logout',
        confirmClass: 'btn-danger',
        onConfirm: () => Auth.logout()
      });
    });

    // Header
    const headerUser = document.getElementById('header-user');
    const headerTitle = document.getElementById('header-title');
    if (headerUser) {
      const photo = (window.ProfilePhoto && ProfilePhoto.avatarSrc(session.userId, role)) || null;
      headerUser.innerHTML = `
        <div class="header-user-info">
          <div class="name">${esc(session.name)}</div>
          <div class="role">${esc(role)}</div>
        </div>
        ${photo
          ? `<img src="${photo}" alt="" class="avatar" style="width:38px;height:38px;border-radius:50%;object-fit:cover" aria-hidden="true">`
          : `<div class="avatar" style="width:38px;height:38px;font-size:14px" aria-hidden="true">${esc(Utils.initials(session.name))}</div>`}
      `;
      headerUser.addEventListener('click', () => { window.location.href = 'profile.html'; });
    }
    if (headerTitle) headerTitle.textContent = document.title.replace(' | Attendance System', '');

    // Notifications dropdown
    const notifBtn = document.getElementById('notif-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('notif-dropdown');
        const pd = document.getElementById('profile-dropdown');
        if (pd) pd.classList.remove('active');
        dd.classList.toggle('active');
      });
    }

    // Profile dropdown
    const profBtn = document.getElementById('profile-btn');
    if (profBtn) {
      profBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pd = document.getElementById('profile-dropdown');
        const nd = document.getElementById('notif-dropdown');
        if (nd) nd.classList.remove('active');
        pd.classList.toggle('active');
      });
    }

    document.addEventListener('click', (e) => {
      const nd = document.getElementById('notif-dropdown');
      const pd = document.getElementById('profile-dropdown');
      if (nd && !nd.contains(e.target) && !e.target.closest('#notif-btn')) nd.classList.remove('active');
      if (pd && !pd.contains(e.target) && !e.target.closest('#profile-btn') && !e.target.closest('#header-user')) pd.classList.remove('active');
    });

    document.querySelectorAll('[data-dd-logout]').forEach((b) => b.addEventListener('click', () => Auth.logout()));
    document.querySelectorAll('[data-dd-profile]').forEach((b) => b.addEventListener('click', () => { window.location.href = 'profile.html'; }));

    // Mobile hamburger
    const hamburger = document.getElementById('hamburger');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (hamburger && backdrop) {
      hamburger.addEventListener('click', () => {
        sidebar.classList.add('open');
        backdrop.classList.add('active');
      });
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
      });
    }

    // Fill notifications list
    const notifList = document.getElementById('notif-list');
    if (notifList) notifList.innerHTML = buildNotifications(session);
    const notifBadge = document.getElementById('notif-badge');
    if (notifBadge) {
      const count = notifList ? notifList.querySelectorAll('.notif-item').length : 0;
      notifBadge.textContent = count;
      notifBadge.style.display = count ? '' : 'none';
    }

    // Fill role in header dropdown
    const ddRole = document.getElementById('dd-role');
    if (ddRole) {
      ddRole.textContent = role;
    }

    // Profile dropdown avatar
    const ddAvatar = document.querySelector('.profile-dd-head .avatar');
    if (ddAvatar) {
      const photo = (window.ProfilePhoto && ProfilePhoto.avatarSrc(session.userId, role)) || null;
      ddAvatar.innerHTML = photo
        ? `<img src="${photo}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block" loading="lazy">`
        : esc(Utils.initials(session.name));
    }
  },

  /**
   * Refresh the user's identity (name + role + avatar) in the header,
   * profile dropdown and sidebar after a profile update — without reload.
   */
  refreshIdentity() {
    const s = Auth.getSession();
    if (!s) return;

    const role = s.role;
    const initials = Utils.initials(s.name);

    const headerUser = document.getElementById('header-user');
    if (headerUser) {
      const info = headerUser.querySelector('.header-user-info');
      if (info) {
        info.querySelector('.name').textContent = s.name;
        info.querySelector('.role').textContent = role;
      }
      const oldAv = headerUser.querySelector('img.avatar, div.avatar');
      if (oldAv) {
        const photo = (window.ProfilePhoto && ProfilePhoto.avatarSrc(s.userId, role)) || null;
        oldAv.outerHTML = photo
          ? `<img src="${photo}" alt="" class="avatar" style="width:38px;height:38px;border-radius:50%;object-fit:cover" aria-hidden="true">`
          : `<div class="avatar" style="width:38px;height:38px;font-size:14px" aria-hidden="true">${esc(initials)}</div>`;
      }
    }

    // Profile dropdown
    const ddHead = document.querySelector('.profile-dd-head');
    if (ddHead) {
      const nameEl = ddHead.querySelector('.name');
      if (nameEl) nameEl.textContent = s.name;
      const roleEl = ddHead.querySelector('.role');
      if (roleEl) roleEl.textContent = role;
      const ddAvatar = ddHead.querySelector('.avatar');
      if (ddAvatar) {
        const photo = (window.ProfilePhoto && ProfilePhoto.avatarSrc(s.userId, role)) || null;
        ddAvatar.outerHTML = photo
          ? `<img src="${photo}" alt="" class="avatar" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block" loading="lazy">`
          : `<div class="avatar">${esc(initials)}</div>`;
      }
    }

    // Sidebar role badge
    const badge = document.querySelector('.role-badge-nav');
    if (badge) {
      badge.className = `role-badge-nav ${role.toLowerCase()}`;
      badge.innerHTML = `<i class="fas fa-user-shield"></i> ${esc(role)}`;
    }
  },

  /**
   * Replace #app-content with the AppLayout shell (sidebar+header).
   * This is used by pages that don't want static shell markup.
   */
  mountShell(activeKey, pageTitle) {
    const session = Auth.getSession();
    const initials = Utils.initials(session.name);

    document.title = `${pageTitle} | Attendance System`;

    document.body.innerHTML = `
      ${this.sidebarHtml(session, activeKey, pageTitle, initials)}
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <header class="top-header">
        <div class="top-header-left">
          <button class="hamburger" id="hamburger" aria-label="Toggle menu"><i class="fas fa-bars"></i></button>
          <h1 class="header-title" id="header-title">${esc(pageTitle)}</h1>
        </div>
        <div class="top-header-right">
          <button class="header-icon-btn" id="notif-btn" aria-label="Notifications">
            <i class="fas fa-bell"></i>
            <span class="notif-badge" id="notif-badge"></span>
          </button>
          <button class="header-icon-btn" id="profile-btn" aria-label="Account">
            <i class="fas fa-circle-user"></i>
          </button>
        </div>
      </header>

      <div class="notif-dropdown" id="notif-dropdown"></div>
      <div class="profile-dropdown" id="profile-dropdown">
        <div class="profile-dd-head">
          <div class="avatar">${esc(initials)}</div>
          <div>
            <div class="name">${esc(session.name)}</div>
            <div class="role" id="dd-role">${esc(session.role)}</div>
          </div>
        </div>
        <button class="profile-dd-item" data-dd-profile><i class="fas fa-user"></i>My Profile</button>
        <button class="profile-dd-item" data-dd-logout><i class="fas fa-power-off"></i>Logout</button>
      </div>

      <main class="main-content" id="app-content"></main>
    `;

    // Fill notification dropdown
    document.getElementById('notif-dropdown').innerHTML = `
      <div class="notif-head">Notifications <button class="modal-close" style="font-size:12px" onclick="document.getElementById('notif-dropdown').classList.remove('active')"><i class="fas fa-xmark"></i></button></div>
      <div class="notif-list" id="notif-list"></div>
    `;

    this.init(activeKey);
  },

  sidebarHtml(session, activeKey, pageTitle, initials) {
    // Used by mountShell; delegates to init for behavior.
    return `
      <aside class="sidebar" id="sidebar"></aside>
    `;
  }
};

/* ---------- Notifications builder ---------- */

function buildNotifications(session) {
  const role = session.role;
  const person = session.person || {};
  const now = 'Just now';
  const items = [];

  const dayAbbr = () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];

  if (role === 'Student') {
    const recs = session.personId ? DB.getStudentAttendance(session.personId) : [];
    if (recs.length === 0) {
      items.push({ icon: 'fa-bell text-muted', text: 'No attendance records yet.', time: now });
    } else {
      const present = recs.filter((r) => r.status !== 'absent').length;
      const pct = Utils.percentage(present, recs.length);
      if (pct < 75) {
        items.push({ icon: 'fa-triangle-exclamation text-danger', text: `Your attendance is ${pct}%. It is below the 75% threshold.`, time: now });
      } else {
        items.push({ icon: 'fa-circle-check text-success', text: `Your attendance is ${pct}%. Keep it up!`, time: now });
      }
    }
  } else if (role === 'Staff') {
    const subjectCodes = DB.getSubjects().filter((s) => (person.subjects || []).includes(s.name)).map((s) => s.code);
    const todayClasses = DB.getTimetable().filter((t) => t.day === dayAbbr() && subjectCodes.includes(t.subjectCode));
    const pending = todayClasses.filter((c) =>
      !DB.getAttendance().some((r) => r.subjectCode === c.subjectCode && r.classId === c.classId && r.staffId === person.id && r.date === Utils.todayISO())
    );
    if (pending.length > 0) {
      items.push({ icon: 'fa-clock text-warning', text: `You have ${pending.length} attendance session(s) pending for today.`, time: now });
    } else if (todayClasses.length > 0) {
      items.push({ icon: 'fa-circle-check text-success', text: "All of today's attendance has been submitted.", time: now });
    } else {
      items.push({ icon: 'fa-bell text-muted', text: 'No classes scheduled for you today.', time: now });
    }
  } else {
    // HOD — surface genuinely live classroom sessions first.
    const liveSessions = (window.DB && DB.getActiveSessions) ? DB.getActiveSessions() : [];
    liveSessions.forEach((s) => {
      items.push({
        icon: 'fa-video text-danger',
        text: `${s.subjectName} (${s.classLabel}) is LIVE on ${s.cameraName}.`,
        time: now
      });
    });
    const allAtt = DB.getAttendance();
    const students = DB.getStudents();
    const below = students.filter((st) => {
      const r = allAtt.filter((x) => x.studentId === st.id);
      if (!r.length) return false;
      return Utils.percentage(r.filter((x) => x.status !== 'absent').length, r.length) < 75;
    });
    if (allAtt.length === 0) {
      items.push({ icon: 'fa-bell text-muted', text: 'No attendance records in the department yet.', time: now });
    } else if (below.length > 0) {
      items.push({ icon: 'fa-triangle-exclamation text-danger', text: `${below.length} student(s) have attendance below 75%.`, time: now });
    } else {
      items.push({ icon: 'fa-circle-check text-success', text: 'All students meet the attendance threshold.', time: now });
    }
  }

  return items.map((n) => `
    <div class="notif-item">
      <i class="fas ${n.icon}" style="font-size:15px"></i>
      <div class="notif-text">${esc(n.text)}</div>
      <div class="notif-time">${esc(n.time)}</div>
    </div>
  `).join('') || `<div class="empty-state" style="padding:20px"><i class="fas fa-bell-slash"></i><h4>No notifications</h4></div>`;
}

/* ---------- Section header component ---------- */

function sectionTitle(icon, text, sub = '') {
  return `
    <div class="card-header">
      <div class="card-title"><i class="fas ${icon}"></i>${esc(text)}</div>
      ${sub ? `<span class="text-muted" style="font-size:13px">${escapeHTML(sub)}</span>` : ''}
    </div>
  `;
}

function escapeHTML(str) {
  return esc(str);
}

/* ---------- Initialise on load ---------- */

document.addEventListener('DOMContentLoaded', () => {
  Charts.defaults();
});