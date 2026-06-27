// Web Push subscription flow (Phase 4). On iOS this only works once the app is
// added to the Home Screen and opened from the icon.
import { apiUrl } from "./config.js";
import { toast } from "./ui.js";

function urlB64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast("Push isn't supported on this browser.", "error");
    return false;
  }
  const health = await fetch(apiUrl("/api/health")).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!health || !health.push || !health.vapidPublicKey) {
    toast("Set VAPID keys + Supabase on the server first.", "error");
    return false;
  }
  if ((await Notification.requestPermission()) !== "granted") {
    toast("Notification permission was declined.", "error");
    return false;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(health.vapidPublicKey) }));

  const res = await fetch(apiUrl("/api/subscribe"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub),
  });
  if (!res.ok) { toast("Couldn't register for notifications.", "error"); return false; }
  toast("Notifications enabled.", "success");
  return true;
}
