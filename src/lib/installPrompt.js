// ตัวจับ event ติดตั้งแอปของเบราว์เซอร์ (Android/Chromium) — import ใน main.jsx ให้ลงทะเบียนก่อน React render
// beforeinstallprompt มักยิงตั้งแต่โหลดหน้า ถ้าลงทะเบียนใน component ที่ mount ทีหลังจะพลาด event
import { useSyncExternalStore } from 'react';
import { detectInstallEnv } from './installEnv';

let deferred = null;     // event ที่เก็บไว้เรียก prompt() ตอนผู้ใช้กดปุ่ม (ใช้ได้ครั้งเดียว)
let installedNow = false; // ติดตั้งจากหน้านี้แล้ว (หน้าเดิมยังเปิดในเบราว์เซอร์ ไม่ใช่ standalone)
let version = 0;
const listeners = new Set();
const emit = () => { version++; listeners.forEach(fn => fn()); };

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // ใช้ปุ่มของแอปแทนแถบติดตั้งของ Chrome
    deferred = e;
    emit();
  });
  window.addEventListener('appinstalled', () => { deferred = null; installedNow = true; emit(); });
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch { return false; }
}

// { show, mode } — ดูความหมายใน installEnv.js
export function useInstallEnv() {
  useSyncExternalStore(subscribe, () => version);
  return detectInstallEnv({
    ua: navigator.userAgent,
    standalone: installedNow || isStandalone(),
    maxTouchPoints: navigator.maxTouchPoints || 0,
    hasPrompt: !!deferred,
  });
}

// เปิดหน้าติดตั้งของเบราว์เซอร์ — คืน 'accepted' | 'dismissed' | 'unavailable'
// ปฏิเสธแล้วใช้ event เดิมซ้ำไม่ได้ → mode ตกไปเป็น 'android' (สอนผ่านเมนู ⋮) จนเบราว์เซอร์ยิง event ใหม่
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const e = deferred;
  deferred = null;
  emit();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome;
  } catch { return 'unavailable'; }
}
