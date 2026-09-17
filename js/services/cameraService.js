/* ============================================================
   Camera Service — classroom camera binding
   ------------------------------------------------------------
   Owns camera discovery + the media stream lifecycle. In the
   current frontend-only build NO fake stream or fake status is
   produced: `connectCamera` resolves the camera metadata but its
   stream stays `null`, so the UI shows the honest state
   "Camera Feed Unavailable – Waiting for classroom camera
   connection…" until a real backend supplies a MediaStream.

   REAL BACKEND INTEGRATION POINT
   ------------------------------
   When the classroom cameras are wired up:

     - `connectCamera(sessionId, cameraId)` acquires the real
       MediaStream (WebRTC offer/answer or a signaling-provided
       remote stream) and stores it via `receiveStream()`.
     - `disconnectCamera(sessionId)` closes the remote end.
     - Feed the stream into the <video> element by calling
       `attachStreamToVideo(sessionId, videoEl)`, then mark the
       element `classList.add('is-on')`.

   The UI never fabricates frames; if `getStream()` is null the
   placeholder is shown.
   ============================================================ */

window.CameraService = (() => {
  const SESSION_PREFIX = 'cam-session:';

  const streams = new Map();      // sessionId -> MediaStream
  const statuses = new Map();     // sessionId -> camera status object
  const attempted = new Set();    // sessionId -> connect already attempted

  /* ---------- Discovery ---------- */

  const _resolveCamera = (cameraId) => {
    // In the frontend-only build the classroom camera is known by id
    // and name only. A backend would map this to a signaling channel.
    return {
      cameraId: cameraId || 'cam-classroom-01',
      cameraName: cameraId ? `Classroom Camera ${cameraId.replace(/\D/g, '') || '01'}` : 'Classroom Camera 01'
    };
  };

  /* ---------- Stream lifecycle ---------- */

  const connectCamera = (sessionId, cameraId) => {
    return new Promise((resolve) => {
      const cam = _resolveCamera(cameraId);

      if (attempted.has(sessionId)) {
        // Already attempted for this session — do not spam repeated
        // connection attempts while the UI remains on the monitor view.
        resolve({ camera: cam, stream: streams.get(sessionId) || null });
        return;
      }
      attempted.add(sessionId);

      // ------------------------------------------------------------
      // REAL BACKEND INTEGRATION POINT
      //
      //   navigator.mediaDevices.getUserMedia({ video: true })
      //     .then(stream => { statuses.set(...); streams.set(sessionId, stream); resolve({ camera: cam, stream }); })
      //     .catch(() => resolve({ camera: cam, stream: null }));
      //
      // Until then the classroom camera simply has no reachable
      // stream yet — connecting leaves it disconnected by design.
      // ------------------------------------------------------------
      statuses.set(sessionId, { status: 'disconnected', connectionQuality: null, lastSignal: null, message: 'Waiting for classroom camera connection…' });
      resolve({ camera: cam, stream: null });
    });
  };

  const receiveStream = (sessionId, stream) => {
    if (stream && typeof stream.getTracks === 'function') {
      streams.set(sessionId, stream);
    }
  };

  const attachStreamToVideo = (sessionId, videoEl) => {
    const stream = streams.get(sessionId);
    if (!stream || !videoEl) return false;
    if (videoEl.srcObject !== stream) videoEl.srcObject = stream;
    videoEl.classList.add('is-on');
    return true;
  };

  const detachStreamFromVideo = (sessionId, videoEl) => {
    if (!videoEl) return;
    videoEl.pause();
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks && videoEl.srcObject.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
    videoEl.classList.remove('is-on');
  };

  const getStream = (sessionId) => streams.get(sessionId) || null;

  /* ---------- Status ---------- */

  const getCameraStatus = (sessionId) => statuses.get(sessionId) || null;

  const disconnectCamera = (sessionId) => {
    const stream = streams.get(sessionId);
    if (stream) {
      stream.getTracks && stream.getTracks().forEach((t) => t.stop());
      streams.delete(sessionId);
    }
    statuses.delete(sessionId);
    attempted.delete(sessionId);
  };

  return {
    connectCamera,
    disconnectCamera,
    receiveStream,
    attachStreamToVideo,
    detachStreamFromVideo,
    getStream,
    getCameraStatus
  };
})();