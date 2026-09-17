/* ============================================================
   Timetable Module
   ------------------------------------------------------------
   Role-aware weekly timetable:
   - Student: their class timetable only.
   - Staff: their assigned classes/subjects.
   - HOD: department timetable with class selector.
   ============================================================ */

const TimetableApp = (() => {

  const session = () => Auth.getSession();
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const DAY_FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday' };

  const classLabel = (id) => ({ I: 'I Sem', II: 'II Sem', III: 'III Sem', IV: 'IV Sem' }[id] || id);

  const init = () => {
    const s = Auth.getSession();
    if (!s) { window.location.href = 'index.html'; return; }
    if (!Auth.protectPage('timetable', 'Timetable')) return;

    AppLayout.init('timetable.html');

    const mount = document.getElementById('app-content');
    if (!mount) return;

    const person = s.person;
    const tt = DB.getTimetable();
    const periods = [...new Set(tt.map((t) => t.time))];

    let scopeTitle = '';
    let filterFn = null;

    if (s.role === 'Student') {
      const classId = person.year; // I-IV
      scopeTitle = `${classId} Sem AI & DS · Student`;
      filterFn = (t) => t.classId === classId;
    } else if (s.role === 'Staff') {
      const assignedClasses = person.classes || [];
      const subjectNames = person.subjects || [];
      const subjectCodes = DB.getSubjects().filter((x) => subjectNames.includes(x.name)).map((x) => x.code);
      scopeTitle = `${person.name} · Assigned`;
      filterFn = (t) => assignedClasses.includes(t.classId) && (subjectCodes.includes(t.subjectCode) || t.staffName === person.name);
    } else {
      scopeTitle = 'Department · AI & DS';
      filterFn = null; // all, with optional class selector
    }

    const classes = DB.getClasses();
    const classOptions = classes.map((c) => `<option value="${esc(c.id)}">${esc(classLabel(c.id))} AI &amp; DS</option>`).join('');

    mount.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Timetable</h1>
          <p id="tt-scope">${esc(scopeTitle)}</p>
        </div>
        ${s.role === 'HOD' ? `
          <div class="flex items-center gap-10">
            <label for="tt-class" class="text-muted" style="font-size:13px;font-weight:600">Class:</label>
            <select class="form-control" id="tt-class" style="width:auto;min-width:180px" aria-label="Select class">
              ${classOptions}
            </select>
          </div>
        ` : ''}
      </div>

      <div class="card">
        <div class="tt-table-wrap">
          <div class="table-responsive">
            <table class="table" id="tt-table"></table>
          </div>
        </div>
        <div class="tt-mobile" id="tt-mobile">
          <div class="tt-day-picker" id="tt-day-picker" role="tablist" aria-label="Select a day"></div>
          <div class="tt-day-list" id="tt-day-list"></div>
        </div>
      </div>
    `;

    let activeDay = DAYS.includes(new Date().toString().slice(0, 3)) ? new Date().toString().slice(0, 3) : DAYS[0];
    let effectiveFilter = (t) => (!filterFn || filterFn(t));

    const renderMob = (day) => {
      const picker = document.getElementById('tt-day-picker');
      const list = document.getElementById('tt-day-list');
      if (!picker || !list) return;

      picker.innerHTML = DAYS.map((d) => `
        <button type="button" class="tt-day-btn ${d === day ? 'is-active' : ''}" data-tt-day="${d}" aria-pressed="${d === day}">${d}</button>
      `).join('');

      const dayCells = periods
        .map((time) => ({ time, cell: tt.find((t) => t.day === day && t.time === time && (!effectiveFilter || effectiveFilter(t))) }))
        .filter((x) => x.cell);

      list.innerHTML = dayCells.length
        ? `<div class="tt-day-title"><i class="fas fa-calendar-day"></i> ${DAY_FULL[day]}</div>` +
          dayCells.map(({ time, cell }) => `
            <div class="tt-day-card">
              <span class="tt-time">${esc(time)}</span>
              <div class="tt-info">
                <div class="tt-subj">${esc(cell.subjectName)}</div>
                <div class="tt-meta">
                  <span><i class="fas fa-tag"></i> ${esc(cell.subjectCode || '—')}</span>
                  <span><i class="fas fa-chalkboard-user"></i> ${esc(cell.staffName || '—')}</span>
                  <span><i class="fas fa-door-open"></i> ${esc(cell.room || '—')}</span>
                </div>
              </div>
            </div>`).join('')
        : `<div class="empty-state"><i class="fas fa-calendar-xmark"></i><h4>No classes on ${DAY_FULL[day]}</h4></div>`;
    };

    const render = (classIdOverride) => {
      effectiveFilter = (t) => (!filterFn || filterFn(t));
      if (s.role === 'HOD' && classIdOverride) {
        effectiveFilter = (t) => t.classId === classIdOverride;
      }

      const scrollEl = mount.querySelector('#tt-table');
      let html = `<thead><tr><th style="min-width:140px">Time</th>`;
      DAYS.forEach((d) => { html += `<th style="min-width:150px">${DAY_FULL[d]}</th>`; });
      html += `</tr></thead><tbody>`;

      let anyCell = false;
      periods.forEach((time) => {
        html += `<tr><td><strong>${esc(time)}</strong></td>`;
        DAYS.forEach((day) => {
          const cell = tt.find((t) => t.day === day && t.time === time && (!effectiveFilter || effectiveFilter(t)));
          if (cell) {
            anyCell = true;
            const isToday = day === new Date().toString().slice(0, 3);
            html += `
              <td ${isToday ? 'style="background:var(--primary-bg)"' : ''}>
                <div class="tt-card">
                  <span class="tt-subject">${esc(cell.subjectName)}</span>
                  <span class="tt-staff">${esc(cell.staffName)}</span>
                  <span class="tt-room"><i class="fas fa-door-open"></i> ${esc(cell.room)}</span>
                </div>
              </td>`;
          } else {
            html += `<td><span class="text-muted" style="font-size:12px">—</span></td>`;
          }
        });
        html += `</tr>`;
      });

      if (!anyCell) {
        html += `<tr><td colspan="6"><div class="empty-state"><i class="fas fa-calendar-xmark"></i><h4>No Timetable Available</h4></div></td></tr>`;
      }

      html += `</tbody>`;
      scrollEl.innerHTML = html;
      renderMob(activeDay);
    };

    if (s.role === 'HOD') {
      document.getElementById('tt-class').addEventListener('change', (e) => {
        const value = e.target.value;
        document.getElementById('tt-scope').textContent = `${classLabel(value)} AI & DS · Department`;
        activeDay = DAYS.includes(new Date().toString().slice(0, 3)) ? new Date().toString().slice(0, 3) : DAYS[0];
        render(value);
      });
    }

    document.getElementById('tt-day-picker').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tt-day]');
      if (!btn) return;
      activeDay = btn.getAttribute('data-tt-day');
      renderMob(activeDay);
    });

    render(s.role === 'HOD' ? (classes[0] ? classes[0].id : '') : null);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();

window.TimetableApp = TimetableApp;