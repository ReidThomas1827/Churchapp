// Audio recorder: MediaRecorder for capture, Wake Lock to keep the screen on,
// and an AnalyserNode to drive a live level meter. Foreground-only by design.

function pickMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  // Prefer mp4/aac (what iOS Safari produces); fall back to webm/opus (desktop).
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/aac"];
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return "";
}

export function recordingSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== "undefined");
}

// Current mic permission: 'granted' | 'denied' | 'prompt' | 'unknown'.
// iOS Safari often doesn't support querying the mic permission — hence 'unknown'.
export async function getMicPermission() {
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const st = await navigator.permissions.query({ name: "microphone" });
      return st.state;
    }
  } catch { /* not queryable on this browser */ }
  return "unknown";
}

// Trigger the permission prompt (must be from a user tap). We immediately stop
// the stream — the point is only to grant access, not to record.
export async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.name }; // 'NotAllowedError' = denied/blocked
  }
}

export class Recorder {
  constructor() {
    this.state = "idle"; // idle | recording | stopped
    this.stream = null;
    this.mr = null;
    this.chunks = [];
    this.startTs = 0;
    this.wakeLock = null;
    this.audioCtx = null;
    this.analyser = null;
    this.onLevel = null; // (0..1) => void
    this.onTick = null;  // (seconds) => void
    this._raf = null;
    this._timer = null;
    this._visHandler = null;
    this.interrupted = false;
  }

  get elapsed() {
    return this.state === "recording" ? (Date.now() - this.startTs) / 1000 : 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mime = pickMimeType();
    this.mr = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.chunks = [];
    this.mr.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.mr.start(1000); // gather data each second so long recordings stay safe
    this.state = "recording";
    this.startTs = Date.now();
    this.interrupted = false;

    this._timer = setInterval(() => this.onTick && this.onTick(this.elapsed), 250);
    this._setupLevelMeter();
    await this._acquireWakeLock();

    // iOS drops the wake lock when the page is hidden; re-acquire when visible.
    this._visHandler = () => {
      if (this.state !== "recording") return;
      if (document.visibilityState === "hidden") this.interrupted = true;
      else this._acquireWakeLock();
    };
    document.addEventListener("visibilitychange", this._visHandler);
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mr || this.state !== "recording") return resolve(null);
      this.mr.onstop = () => {
        const mimeType = this.mr.mimeType || "audio/mp4";
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationSec = (Date.now() - this.startTs) / 1000;
        this._cleanup();
        this.state = "stopped";
        resolve({ blob, mimeType, durationSec, interrupted: this.interrupted });
      };
      this.mr.stop();
    });
  }

  cancel() {
    try { if (this.mr && this.state === "recording") this.mr.stop(); } catch {}
    this._cleanup();
    this.state = "idle";
  }

  async _acquireWakeLock() {
    try {
      if ("wakeLock" in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => { this.wakeLock = null; });
      }
    } catch { /* unsupported or denied — recording still works, screen may sleep */ }
  }

  _releaseWakeLock() {
    try { if (this.wakeLock) this.wakeLock.release(); } catch {}
    this.wakeLock = null;
  }

  _setupLevelMeter() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      const loop = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        if (this.onLevel) this.onLevel(sum / data.length / 255);
        this._raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* level meter is cosmetic; ignore failures */ }
  }

  _cleanup() {
    clearInterval(this._timer); this._timer = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.analyser = null;
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this._releaseWakeLock();
    if (this._visHandler) { document.removeEventListener("visibilitychange", this._visHandler); this._visHandler = null; }
  }
}
