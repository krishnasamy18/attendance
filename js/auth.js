/* ============================================================
   Auth Module
   ------------------------------------------------------------
   Handles login, session persistence (localStorage), role-based
   routing and "Access Denied" protection.

   Session shape:
     { id, userId, role, personId, person, name, department }

   NOTE: This is frontend-only protection. Real authorization
   must be enforced by the backend API.
   ============================================================ */

window.Auth = (() => {

  const SESSION_KEY = 'attendance_session';

  const ROLES = ['Student', 'Staff', 'HOD'];

  /* ---------- Route map: which page keys each role may access ---------- */

  const ROUTE_RULES = {
    'student.dashboard': { 'Student': true, 'Staff': true, 'HOD': true },
    'staff.dashboard': { 'Staff': true, 'HOD': false },
    'hod.dashboard': { 'HOD': true },
    'attendance.view': { 'Student': true, 'Staff': true, 'HOD': true },
    'attendance.mark': { 'Staff': true },
    'attendance.monitor': { 'HOD': true },
    'students': { 'Staff': true, 'HOD': true },
    'students.management': { 'HOD': true },
    'staff': { 'HOD': true },
    'staff.management': { 'HOD': true },
    'classes': { 'HOD': true },
    'subjects': { 'HOD': true },
    'timetable': { 'Student': true, 'Staff': true, 'HOD': true },
    'reports': { 'Staff': true, 'HOD': true },
    'profile': { 'Student': true, 'Staff': true, 'HOD': true }
  };

  /* Redirect target per role */
  const HOME_MAP = {
    'Student': 'student-dashboard.html',
    'Staff': 'staff-dashboard.html',
    'HOD': 'hod-dashboard.html'
  };

  /* ---------- Session helpers ---------- */

  const getSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const setSession = (user) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  };

  const clearSession = () => {
    localStorage.removeItem(SESSION_KEY);
  };

  const isLoggedIn = () => !!getSession();

  const getRole = () => {
    const s = getSession();
    return s ? s.role : null;
  };

  /* ---------- Login ---------- */

  const login = async (userId, password, remember) => {
    const result = await window.DB.login(userId, password);
    if (result.success) {
      setSession(result.user);
      if (remember) {
        localStorage.setItem('attendance_remembered_id', userId);
      } else {
        localStorage.removeItem('attendance_remembered_id');
      }
    }
    return result;
  };

  const logout = () => {
    clearSession();
    window.location.href = 'index.html';
  };

  /* ---------- Route protection ---------- */

  const requiresAuth = () => {
    if (!isLoggedIn()) return false;
    return true;
  };

  /**
   * Check whether current session may access a given route key.
   * Returns true | false
   */
  const canAccess = (routeKey) => {
    const role = getRole();
    if (!role) return false;
    const rule = ROUTE_RULES[routeKey];
    if (!rule) return false;
    return rule[role] === true;
  };

  /**
   * Called on every dashboard page load.
   * If not logged in -> redirect to login.
   * If logged in but without permission -> show "Access Denied".
   */
  const protectPage = (routeKey, pageTitle) => {
    const session = getSession();
    if (!session) {
      window.location.href = 'index.html';
      return false;
    }

    if (!canAccess(routeKey)) {
      showAccessDenied(session, pageTitle);
      return false;
    }
    return true;
  };

  const getHomeURL = (role) => HOME_MAP[role] || 'index.html';

  /**
   * Replace the current page body with an "Access Denied" panel.
   */
  const showAccessDenied = (session, pageTitle) => {
    const target = document.getElementById('app-content');
    if (!target) return;
    target.innerHTML = `
      <div class="access-denied">
        <div class="lock-icon"><i class="fas fa-lock"></i></div>
        <h2>Access Denied</h2>
        <p>Your ${session.role} account does not have permission to view
           <strong>${pageTitle || 'this page'}</strong>. You will be redirected to your dashboard.</p>
        <button class="btn btn-primary" onclick="Auth.redirectHome()">
          <i class="fas fa-home"></i> Go to My Dashboard
        </button>
      </div>
    `;
  };

  const redirectHome = () => {
    const role = getRole();
    window.location.href = getHomeURL(role);
  };

  /* ---------- Public API ---------- */

  return {
    ROLES,
    getSession,
    setSession,
    clearSession,
    isLoggedIn,
    getRole,
    login,
    logout,
    canAccess,
    protectPage,
    redirectHome,
    getHomeURL,
    ROUTE_RULES
  };
})();