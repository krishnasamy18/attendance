/* ============================================================
   RPSIT Attendance — Mobile behaviors
   ------------------------------------------------------------
   Loaded on every app page (after all page scripts). Taps into
   the existing shell (sidebar / top-header / tables) and adds
   mobile-first behavior without touching page logic.

   - Converts `.table-cards` tables into stacked cards on phones
   - Injects the compact mobile header brand
   - Adds a close ("X") to the off-canvas sidebar drawer
   - Closes the drawer on navigation / Escape
   - Guards rapid-fire buttons from duplicate taps
   - Registers the service worker (PWA offline support)
   ============================================================ */

(function () {
  'use strict';

  var MOBILE_BREAKPOINT = 767;
  var TAP_GUARD_MS = 600;
  var TAP_GUARD_SELECTOR = [
    '[data-sa-mark]',
    '[data-sa-quick]',
    '[data-set-status]',
    '[data-end-session]',
    '[data-toggle-pause]',
    '.status-btn',
    '.live-toggle'
  ].join(',');

  function isMobileViewport() {
    return window.matchMedia('(max-width: ' + MOBILE_BREAKPOINT + 'px)').matches;
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ------------------------------------------------------------
     1. Table -> cards (in place, on phones only)
     ------------------------------------------------------------ */

  var TableCards = {
    syncAll: function () {
      document.querySelectorAll('table.table-cards').forEach(TableCards.sync);
    },

    /* Set data-label on every td from the matching th, wrap multi-node
       cells so the label and value sit cleanly in a flex row. */
    sync: function (table) {
      if (!table || !table.classList.contains('table-cards')) return;
      var headRow = table.querySelector('thead tr');
      if (!headRow) return;

      var labels = [];
      headRow.querySelectorAll('th').forEach(function (th) {
        labels.push(th.textContent.trim());
      });

      var rows = table.querySelectorAll('tbody tr');
      Array.prototype.forEach.call(rows, function (row) {
        var cells = row.querySelectorAll('td');
        Array.prototype.forEach.call(cells, function (td, i) {
          if (!td.hasAttribute('colspan')) {
            td.setAttribute('data-label', labels[i] || '');
            if (td.classList.contains('has-progress')) return;
            TableCards.wrapIfNeeded(td);
          }
        });
      });
    },

    /* Wrap the cell contents so the injected label (::before) and the
       value render as two flex items. Cells with a single element, a
       progress bar or an explicit `.actions` cell are left untouched. */
    wrapIfNeeded: function (td) {
      if (td.querySelector('.progress')) {
        td.classList.add('has-progress');
        return;
      }
      if (td.classList.contains('actions')) return;

      var els = [];
      Array.prototype.forEach.call(td.childNodes, function (n) {
        if (n.nodeType === 1) els.push(n);
        else if (n.nodeType === 3 && n.textContent.trim()) els.push(n);
      });

      // Already wrapped by us (or contains a nested table).
      if (els.length === 1 && els[0].nodeType === 1 && els[0].classList && els[0].classList.contains('table-cell-value')) return;
      if (td.querySelector('.table-cell-value') || td.querySelector('table')) return;

      if (els.length > 1) {
        var wrap = document.createElement('span');
        wrap.className = 'table-cell-value';
        while (td.firstChild) wrap.appendChild(td.firstChild);
        td.appendChild(wrap);
      }
    },

    observe: function (table) {
      if (table.__ttObserver) return;
      var observer = new MutationObserver(function (records) {
        // Ignore mutations we produced ourselves (span wrappers).
        var ours = records.every(function (r) {
          return Array.prototype.every.call(r.addedNodes, function (n) {
            return n.nodeType === 1 && n.tagName === 'SPAN' && n.classList.contains('table-cell-value');
          });
        });
        if (ours) return;
        TableCards.sync(table);
      });
      observer.observe(table, { subtree: true, childList: true });
      table.__ttObserver = observer;
    },

    init: function () {
      if (!('MutationObserver' in window)) return;
      ready(function () {
        var register = function (table) {
          if (!table || !table.classList || !table.classList.contains('table-cards')) return;
          TableCards.sync(table);
          TableCards.observe(table);
        };

        document.querySelectorAll('table.table-cards').forEach(register);

        // Catch tables inserted later (report generation, SPA-style views).
        var bodyObserver = new MutationObserver(function (records) {
          var found = [];
          records.forEach(function (r) {
            Array.prototype.forEach.call(r.addedNodes, function (n) {
              if (n.nodeType !== 1) return;
              if (n.classList && n.classList.contains('table-cards')) {
                found.push(n);
              } else if (n.querySelectorAll) {
                n.querySelectorAll('table.table-cards').forEach(function (t) { found.push(t); });
              }
            });
          });
          found.forEach(register);
        });
        bodyObserver.observe(document.body, { subtree: true, childList: true });
      });
    }
  };

  /* ------------------------------------------------------------
     2. Mobile header brand
     ------------------------------------------------------------ */

  function injectHeaderBrand() {
    var left = document.querySelector('.top-header-left');
    if (!left || left.querySelector('.header-brand-mobile')) return;
    var brand = document.createElement('div');
    brand.className = 'header-brand-mobile';
    brand.innerHTML = '<i class="fas fa-graduation-cap" aria-hidden="true"></i><span>RPSIT Attendance</span>';
    left.appendChild(brand);
  }

  /* ------------------------------------------------------------
     3. Sidebar drawer close button + auto close
     ------------------------------------------------------------ */

  function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }

  function injectSidebarClose() {
    var header = document.querySelector('#sidebar .sidebar-header');
    if (!header || header.querySelector('.sidebar-close')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-close';
    btn.setAttribute('aria-label', 'Close menu');
    btn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    btn.addEventListener('click', closeSidebar);
    header.appendChild(btn);
  }

  function wireSidebarAutoClose() {
    document.addEventListener('click', function (e) {
      var navItem = e.target.closest('#sidebar .nav-item');
      if (navItem) closeSidebar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSidebar();
    });
  }

  /* ------------------------------------------------------------
     4. Rapid-fire button guard (prevents duplicate actions)
     ------------------------------------------------------------ */

  function wireTapGuard() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest(TAP_GUARD_SELECTOR);
      if (!el || el.disabled) return;
      var now = Date.now();
      var last = el._amsLastTap || 0;
      if (now - last < TAP_GUARD_MS) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      el._amsLastTap = now;
    }, true);
  }

  /* ------------------------------------------------------------
     5. PWA registration
     ------------------------------------------------------------ */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    var scheme = window.location.protocol;
    if (scheme !== 'http:' && scheme !== 'https:') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  /* ------------------------------------------------------------
     Init
     ------------------------------------------------------------ */

  function init() {
    TableCards.init();
    injectHeaderBrand();
    injectSidebarClose();
    wireSidebarAutoClose();
    wireTapGuard();
    registerServiceWorker();
  }

  ready(init);
})();