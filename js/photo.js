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

  const get = (userId) => getStored(userId);

  const has = (userId) => !!getStored(userId);

  const avatarSrc = (userId) => getStored(userId) || null;

  /* ---------- Public: write (backend-ready) ---------- */

  /**
   * Upload / change a profile photo.
   * Backend-ready: replace localStorage logic with
   *   fetch('/api/profile/photo', { method:'POST', body: formData })
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
   * Save a profile photo from a data URL.
   * Backend-ready: replace with POST /api/profile/photo
   */
  const saveProfilePhoto = (userId, imageData) => {
    if (setStored(userId, imageData)) {
      syncSession(userId, imageData);
      return Promise.resolve({ success: true, url: imageData });
    }
    return Promise.reject(new Error('Could not save the photo to browser storage.'));
  };

  /**
   * Remove a profile photo, reverting to the default avatar.
   * Backend-ready: replace with
   *   fetch(`/api/profile/photo?userId=${userId}`, { method:'DELETE' })
   */
  const removeProfilePhoto = (userId) => {
    clearStored(userId);
    syncSession(userId, null);
    return Promise.resolve({ success: true });
  };

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

  const refreshAll = (userId) => {
    document.querySelectorAll(`[data-photo-user="${CSS.escape(userId)}"]`).forEach((el) => {
      const role      = el.dataset.photoRole || 'Student';
      const size      = parseInt(el.dataset.photoSize || '40', 10);
      const sizeClass = el.dataset.photoSizeClass || '';
      const cls       = el.dataset.photoClass || '';
      const name      = el.dataset.photoName || '';
      el.outerHTML = avatarHtml({ userId, name, role, size, sizeClass, className: cls });
    });
  };

  const refreshHeader = () => {
    const s = (() => { try { return JSON.parse(localStorage.getItem('attendance_session')); } catch { return null; } })();
    if (!s) return;

    const hu = document.getElementById('header-user');
    if (hu) {
      const old = hu.querySelector('.avatar');
      if (old) {
        const newAv = avatarHtml({ userId: s.userId, name: s.name, role: s.role, size: 38, style: 'font-size:14px' });
        old.outerHTML = newAv;
      }
    }

    const ddAvatar = document.querySelector('.profile-dd-head .avatar');
    if (ddAvatar) {
      const newAv = avatarHtml({ userId: s.userId, name: s.name, role: s.role, size: 42 });
      ddAvatar.outerHTML = newAv;
    }
  };

  /* ---------- Step 1: Selection modal ---------- */

  const openChangePhotoModal = ({ userId, name, role, onChange }) => {
    const hasPhoto = has(userId);

    const body = `
      <div class="pp-select-current">
        <div class="pp-select-current-label">Current Photo</div>
        <div class="pp-select-current-img">
          ${avatarHtml({ userId, name, role, size: 100, className: 'pp-current-avatar' })}
        </div>
      </div>
      <div class="pp-select-options">
        <button class="pp-select-option" id="pp-choose-device" type="button">
          <span class="pp-select-icon"><i class="fas fa-image"></i></span>
          <span class="pp-select-text">
            <span class="pp-select-label">Choose from Device</span>
            <span class="pp-select-desc">Select a photo from your gallery or files</span>
          </span>
          <i class="fas fa-chevron-right pp-select-arrow"></i>
        </button>
        <button class="pp-select-option" id="pp-take-photo" type="button">
          <span class="pp-select-icon pp-select-icon--camera"><i class="fas fa-camera"></i></span>
          <span class="pp-select-text">
            <span class="pp-select-label">Take Photo</span>
            <span class="pp-select-desc">Use your device camera</span>
          </span>
          <i class="fas fa-chevron-right pp-select-arrow"></i>
        </button>
        ${hasPhoto ? `
        <button class="pp-select-option pp-select-option--danger" id="pp-remove-photo" type="button">
          <span class="pp-select-icon pp-select-icon--danger"><i class="fas fa-trash-can"></i></span>
          <span class="pp-select-text">
            <span class="pp-select-label">Remove Photo</span>
            <span class="pp-select-desc">Revert to the placeholder avatar</span>
          </span>
          <i class="fas fa-chevron-right pp-select-arrow"></i>
        </button>` : ''}
      </div>
      <p class="pp-modal-hint">Supported: JPG, JPEG, PNG, WEBP &middot; Max size: 5 MB</p>
    `;

    const footer = `<button class="btn btn-outline" data-pp-cancel>Cancel</button>`;

    Modal.open({ title: 'Change Profile Photo', body, footer });

    const ov = document.querySelector('.modal-overlay.active');
    if (!ov) return;

    ov.querySelector('[data-pp-cancel]').addEventListener('click', Modal.close);

    /* -- hidden file inputs (created dynamically, removed on close) -- */

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/jpeg,image/jpg,image/png,image/webp';
    cameraInput.setAttribute('capture', 'user');
    cameraInput.style.display = 'none';
    document.body.appendChild(cameraInput);

    const cleanup = () => { fileInput.remove(); cameraInput.remove(); };

    /* -- Choose from Device -- */
    ov.querySelector('#pp-choose-device').addEventListener('click', () => {
      fileInput.click();
    });

    /* -- Take Photo -- */
    ov.querySelector('#pp-take-photo').addEventListener('click', () => {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        cameraInput.click();
      } else {
        Toast.error('Camera access is unavailable. Please choose a photo from your device.');
      }
    });

    /* -- shared file handler -- */
    const handleFile = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const err = validateFile(file);
      if (err) {
        Toast.error(err);
        e.target.value = '';
        return;
      }

      Modal.close();
      cleanup();
      openPreviewModal({ userId, name, role, file, onChange });
    };

    fileInput.addEventListener('change', handleFile);
    cameraInput.addEventListener('change', handleFile);

    /* -- Remove Photo -- */
    const removeBtn = ov.querySelector('#pp-remove-photo');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        Modal.close();
        cleanup();
        openRemovePhotoModal({ userId, onRemoved: onChange });
      });
    }

    /* -- ensure cleanup when modal closes via overlay click or X -- */
    const origClose = Modal.close;
    const observer = new MutationObserver(() => {
      if (!ov.classList.contains('active')) { observer.disconnect(); cleanup(); }
    });
    observer.observe(ov, { attributes: true, attributeFilter: ['class'] });
  };

  /* ---------- Step 2: Preview modal ---------- */

  const openPreviewModal = ({ userId, name, role, file, onChange }) => {
    const reader = new FileReader();
    reader.onload = () => {
      const previewDataUrl = reader.result;

      const body = `
        <div class="pp-preview-label">Preview Profile Photo</div>
        <div class="pp-preview-img-wrap">
          <img src="${previewDataUrl}" class="pp-preview-img" alt="Profile photo preview">
        </div>
      `;

      const footer = `
        <div class="pp-preview-footer">
          <div class="pp-preview-footer-left">
            <button class="btn btn-outline" id="pp-preview-change"><i class="fas fa-camera"></i> Change</button>
            <button class="btn btn-outline" id="pp-preview-cancel">Cancel</button>
          </div>
          <button class="btn btn-primary" id="pp-preview-save"><i class="fas fa-save"></i> Save Photo</button>
        </div>
      `;

      Modal.open({ title: 'Preview Profile Photo', body, footer });

      const ov = document.querySelector('.modal-overlay.active');
      if (!ov) return;

      ov.querySelector('#pp-preview-cancel').addEventListener('click', Modal.close);

      ov.querySelector('#pp-preview-change').addEventListener('click', () => {
        Modal.close();
        setTimeout(() => openChangePhotoModal({ userId, name, role, onChange }), 200);
      });

      ov.querySelector('#pp-preview-save').addEventListener('click', async () => {
        const saveBtn = ov.querySelector('#pp-preview-save');
        try {
          Buttons.loading(saveBtn, 'Saving...');
          await changeProfilePhoto(userId, file);
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
    reader.readAsDataURL(file);
  };

  /* ---------- Remove confirmation ---------- */

  const openRemovePhotoModal = ({ userId, onRemoved }) => {
    Confirm.show({
      title: 'Remove Profile Photo',
      message: 'Are you sure you want to remove your profile photo?',
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
    saveProfilePhoto,
    removeProfilePhoto,
    validateFile,
    syncSession,
    openChangePhotoModal,
    openRemovePhotoModal
  };
})();
