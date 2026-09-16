/* ============================================================
   Profile Photo Module
   ------------------------------------------------------------
   Handles photo upload, removal, storage and avatar rendering.
   Stores photos as data URLs in localStorage keyed by userId.

   Backend-ready: swap the localStorage logic for
     POST /api/profile/photo  (upload)
     DELETE /api/profile/photo (remove)
   without changing any caller.
   ============================================================ */

window.ProfilePhoto = (() => {

  /* ---------- Constants ---------- */

  const STORAGE_PREFIX = 'profilePhoto_';
  const MAX_SIZE      = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_TYPES  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  const DEFAULT_SRC = {
    Student: 'assets/images/default-student.png',
    Staff:   'assets/images/default-staff.png',
    HOD:     'assets/images/default-hod.png'
  };

  /* ---------- Storage helpers (localStorage) ---------- */

  const keyFor  = (userId) => `${STORAGE_PREFIX}${userId}`;

  const getStored = (userId) => {
    try { return localStorage.getItem(keyFor(userId)) || null; } catch { return null; }
  };

  const setStored = (userId, dataUrl) => {
    try { localStorage.setItem(keyFor(userId), dataUrl); return true; } catch { return false; }
  };

  const clearStored = (userId) => {
    try { localStorage.removeItem(keyFor(userId)); } catch { /* no-op */ }
  };

  /* ---------- Validation ---------- */

  const validateFile = (file) => {
    if (!file) return 'Please select a valid image.';
    const t = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.includes(t)) return 'Please select a valid image.';
    if (file.size > MAX_SIZE) return 'Image size must be less than 5 MB.';
    return null;
  };

  /* ---------- Public: read ---------- */

  /** Stored photo data URL for userId, or null. */
  const get = (userId) => getStored(userId);

  /** True if a photo has been uploaded for userId. */
  const has = (userId) => !!getStored(userId);

  /** Effective src for the profile photo (stored data-URL or role default). */
  const avatarSrc = (userId, role) => getStored(userId) || DEFAULT_SRC[role] || DEFAULT_SRC.Student;

  /* ---------- Public: write (backend-ready) ---------- */

  /**
   * Upload / change a profile photo.
   * Backend-ready — replace the localStorage code inside reader.onload
   * with: fetch('/api/profile/photo', { method:'POST', body: formData })
   */
  const changeProfilePhoto = (userId, imageFile) => new Promise((resolve, reject) => {
    const err = validateFile(imageFile);
    if (err) { reject(new Error(err)); return; }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (setStored(userId, dataUrl)) {
        syncSession(userId, dataUrl);
        resolve({ success: true, url: dataUrl });
      } else {
        reject(new Error('Could not save the photo to browser storage.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(imageFile);
  });

  /**
   * Remove a profile photo, reverting to the default avatar.
   * Backend-ready — replace with: fetch(`/api/profile/photo?userId=${userId}`, { method:'DELETE' })
   */
  const removeProfilePhoto = (userId) => {
    clearStored(userId);
    syncSession(userId, null);
    return Promise.resolve({ success: true });
  };

  /** Keep the session person object in sync so AppLayout reads it without re-reading localStorage on every avatar. */
  const syncSession = (userId, dataUrl) => {
    try {
      const raw = localStorage.getItem('attendance_session');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.userId === userId) {
        s.person = s.person || {};
        s.person.profilePhoto = dataUrl || null;
        localStorage.setItem('attendance_session', JSON.stringify(s));
      }
    } catch { /* no-op */ }
  };

  /* ---------- Avatar HTML ---------- */

  /**
   * Render an avatar.
   * @param {object} opts
   *   userId  - account userId (e.g. 2021AI001)
   *   name    - display name (for title / alt / fallback initials)
   *   role    - Student | Staff | HOD
   *   size    - px size (default 40)
   *   sizeClass - 'lg' for large avatar (adds .avatar.lg)
   *   className - extra classes to add to the avatar container
   *   style   - extra inline styles
   */
  const avatarHtml = ({ userId, name, role, size = 40, sizeClass = '', className = '', style = '' }) => {
    const sz   = sizeClass === 'xl' ? 110 : sizeClass === 'lg' ? 88 : size;
    const fs   = Math.round(sz / 2.8);
    const box  = `width:${sz}px;height:${sz}px;font-size:${fs}px;${style}`;
    const cls  = `avatar ${sizeClass} ${className}`.trim();
    const title = name ? ` title="${esc(String(name))}"` : '';
    const stored = getStored(userId);

    if (stored) {
      return `<img src="${stored}" alt="" class="${cls}" style="${box};border-radius:50%;object-fit:cover;display:block"${title} loading="lazy">`;
    }

    const iconClass = role === 'Staff' ? 'fa-user-tie' : role === 'HOD' ? 'fa-user-shield' : 'fa-user-graduate';
    return `<span class="${cls} avatar-default" data-role="${role}" style="${box}"${title}><i class="fas ${iconClass}"></i></span>`;
  };

  /* ---------- Small badge version for tables (tighter) ---------- */
  const avatarBadge = ({ userId, name, role, size = 34 }) => {
    const fs = Math.round(size / 2.6);
    const box = `width:${size}px;height:${size}px;font-size:${fs}px`;
    const stored = getStored(userId);

    if (stored) {
      return `<img src="${stored}" alt="" class="avatar" style="${box};border-radius:50%;object-fit:cover;display:block" title="${esc(String(name || ''))}">`;
    }

    const iconClass = role === 'Staff' ? 'fa-user-tie' : role === 'HOD' ? 'fa-user-shield' : 'fa-user-graduate';
    const initials = name ? esc(Utils.initials(name)) : '<i class="fas fa-user"></i>';
    return `<span class="avatar avatar-default" data-role="${role}" style="${box}" title="${esc(String(name || ''))}">${stored ? '' : initials}</span>`;
  };

  /* ---------- Refresh helpers ---------- */

  /** Re-render every element marked with [data-photo-user] on the current page. */
  const refreshAll = (userId) => {
    document.querySelectorAll(`[data-photo-user="${CSS.escape(userId)}"]`).forEach((el) => {
      const role   = el.dataset.photoRole || 'Student';
      const size   = parseInt(el.dataset.photoSize || '40', 10);
      const sizeClass = el.dataset.photoSizeClass || '';
      const cls    = el.dataset.photoClass || '';
      const name   = el.dataset.photoName || '';
      el.outerHTML = avatarHtml({ userId, name, role, size, sizeClass, className: cls });
    });
  };

  /** Refresh the header user avatar and profile dropdown avatar. */
  const refreshHeader = () => {
    const s = (() => { try { return JSON.parse(localStorage.getItem('attendance_session')); } catch { return null; } })();
    if (!s) return;
    // header-user avatar
    const hu = document.getElementById('header-user');
    if (hu) {
      const old = hu.querySelector('.avatar');
      if (old) {
        const newAv = avatarHtml({ userId: s.userId, name: s.name, role: s.role, size: 38, style: 'font-size:14px' });
        old.outerHTML = newAv;
      }
    }
    // profile dropdown avatar
    const ddAvatar = document.querySelector('.profile-dd-head .avatar');
    if (ddAvatar) {
      const newAv = avatarHtml({ userId: s.userId, name: s.name, role: s.role, size: 42 });
      ddAvatar.outerHTML = newAv;
    }
  };

  /* ---------- Modal helpers ---------- */

  /**
   * Open the "Change Profile Photo" modal.
   * @param {object} opts
   *   userId  - account userId
   *   name    - user name
   *   role    - role string
   *   onChange - callback after a successful save, receives { url }
   */
  const openChangePhotoModal = ({ userId, name, role, onChange }) => {
    let selectedFile = null;
    let previewDataUrl = null;
    const currentSrc = avatarSrc(userId, role);

    const body = `
      <div class="pp-modal-preview">
        ${avatarHtml({ userId, name, role, size: 128, className: 'pp-modal-img' })}
      </div>
      <label class="pp-dropzone" id="pp-dropzone" for="pp-file-input" tabindex="0" role="button" aria-label="Choose or drop an image">
        <i class="fas fa-cloud-arrow-up pp-dropzone-icon"></i>
        <span class="pp-dropzone-title">Drag &amp; drop your photo here</span>
        <span class="pp-dropzone-sub">or click to browse files</span>
      </label>
      <input type="file" id="pp-file-input" accept="image/jpeg,image/png,image/webp" style="display:none">
      <p id="pp-modal-hint" class="pp-modal-hint">Supported: JPG, JPEG, PNG, WEBP &middot; Maximum size: 5 MB</p>
    `;

    const footer = `
      <button class="btn btn-outline" data-pp-cancel>Cancel</button>
      <button class="btn btn-primary" id="pp-save-btn" disabled><i class="fas fa-save"></i> Save Photo</button>
    `;

    Modal.open({ title: 'Change Profile Photo', body, footer });

    const ov = document.querySelector('.modal-overlay.active');
    if (!ov) return;
    const fileInput = ov.querySelector('#pp-file-input');
    const dropzone  = ov.querySelector('#pp-dropzone');
    const saveBtn   = ov.querySelector('#pp-save-btn');
    const hint      = ov.querySelector('#pp-modal-hint');
    const preview   = ov.querySelector('.pp-modal-preview');

    ov.querySelector('[data-pp-cancel]').addEventListener('click', Modal.close);

    const handleFiles = () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) { selectedFile = null; saveBtn.disabled = true; return; }

      const err = validateFile(file);
      if (err) {
        Toast.error(err);
        fileInput.value = '';
        selectedFile = null;
        saveBtn.disabled = true;
        return;
      }

      selectedFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        previewDataUrl = reader.result;
        preview.innerHTML = `<img src="${previewDataUrl}" class="avatar avatar-lg pp-modal-img" alt="Photo preview" style="width:128px;height:128px;border-radius:50%;object-fit:cover">`;
        saveBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    };

    fileInput.addEventListener('change', handleFiles);

    // Drag & drop support
    ['dragenter', 'dragover'].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      })
    );
    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      handleFiles();
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });

    saveBtn.addEventListener('click', async () => {
      if (!selectedFile) return;
      try {
        Buttons.loading(saveBtn, 'Uploading...');
        await changeProfilePhoto(userId, selectedFile);
        Modal.close();
        Toast.success('Profile photo updated successfully.');
        refreshAll(userId);
        refreshHeader();
        if (typeof onChange === 'function') onChange({ url: previewDataUrl });
      } catch (e) {
        Toast.error(e.message || 'Could not update photo.');
        Buttons.reset(saveBtn);
      }
    });
  };

  /**
   * Open a confirmation modal to remove the profile photo.
   * @param {object} opts
   *   userId    - account userId
   *   onRemoved - callback after successful removal
   */
  const openRemovePhotoModal = ({ userId, onRemoved }) => {
    Confirm.show({
      title: 'Remove Profile Photo',
      message: 'Are you sure you want to remove your profile photo? Your avatar will revert to the default.',
      confirmText: 'Remove',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        await removeProfilePhoto(userId);
        Toast.success('Profile photo removed.');
        refreshAll(userId);
        refreshHeader();
        if (typeof onRemoved === 'function') onRemoved();
      }
    });
  };

  /* ---------- Public API ---------- */

  return {
    get,
    has,
    avatarSrc,
    avatarHtml,
    avatarBadge,
    refreshAll,
    refreshHeader,
    changeProfilePhoto,
    removeProfilePhoto,
    validateFile,
    syncSession,
    openChangePhotoModal,
    openRemovePhotoModal
  };
})();
