// ปุ่ม "ติดตั้งแอป" (PWA — ติดตั้งจากเบราว์เซอร์ ไม่ผ่าน App Store/Play Store)
// แสดงเฉพาะมือถือที่ยังไม่ได้ติดตั้ง · Android กดปุ่มเดียว · iPhone/LINE/Android ที่ยังไม่มี prompt = โมดอลบอกขั้นตอน
// ใช้ 2 ที่: การ์ดบนหน้าหลัก (ปิดได้ จำต่อเครื่อง) + รายการในเมนู drawer (หาเจอเสมอ)
import React, { useState } from 'react';
import { Smartphone, Share, SquarePlus, EllipsisVertical, ExternalLink, Download, X } from 'lucide-react';
import { useInstallEnv, promptInstall } from './lib/installPrompt';
import { externalBrowserUrl } from './lib/installEnv';

const CARD_DISMISS_KEY = 'install_card_dismissed'; // ต่อเครื่อง ไม่ใช่ต่อบัญชี — ติดตั้งเป็นเรื่องของเครื่อง

const GUIDE = {
  ios: {
    title: 'ติดตั้งบน iPhone / iPad',
    steps: [
      { icon: Share, text: <>กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรชี้ขึ้น) ที่แถบล่างของ Safari — iPad อยู่มุมขวาบน</> },
      { icon: SquarePlus, text: <>เลื่อนลงแล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b></> },
      { icon: Smartphone, text: <>กด <b>เพิ่ม</b> มุมขวาบน แล้วเปิด <b>คลังยา</b> จากหน้าจอโฮม</> },
    ],
    note: 'ใช้ Safari จะง่ายที่สุด — ถ้าไม่เห็นปุ่มแชร์ ให้เปิดลิงก์นี้ใน Safari ก่อน',
  },
  android: {
    title: 'ติดตั้งบน Android',
    steps: [
      { icon: EllipsisVertical, text: <>กดปุ่ม <b>⋮</b> มุมขวาบนของ Chrome</> },
      { icon: Download, text: <>เลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></> },
      { icon: Smartphone, text: <>กด <b>ติดตั้ง</b> แล้วเปิด <b>คลังยา</b> จากหน้าจอหลัก</> },
    ],
    note: 'ถ้าไม่เห็นเมนูติดตั้ง ให้เปิดลิงก์นี้ใน Chrome',
  },
  inapp: {
    title: 'เปิดในเบราว์เซอร์ก่อน',
    steps: [
      { icon: ExternalLink, text: <>หน้านี้เปิดอยู่ใน LINE/Facebook ซึ่ง<b>ติดตั้งแอปไม่ได้</b> — กดปุ่มด้านล่าง หรือกด <b>⋮</b> / ปุ่มแชร์ มุมขวาแล้วเลือก <b>เปิดในเบราว์เซอร์</b></> },
      { icon: SquarePlus, text: <>เมื่อเปิดใน Safari / Chrome แล้ว กดปุ่ม <b>ติดตั้งแอป</b> อีกครั้งเพื่อดูขั้นตอนติดตั้ง</> },
    ],
    note: null,
  },
};

function InstallGuideModal({ mode, onClose }) {
  const g = GUIDE[mode];
  if (!g) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={g.title} onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-5">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0"><Smartphone size={18} /></span>
          <h3 className="flex-1 min-w-0 font-bold text-slate-800 dark:text-slate-100">{g.title}</h3>
          <button type="button" onClick={onClose} aria-label="ปิด"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>
        <ol className="mt-4 space-y-2.5">
          {g.steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i} className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5">
                <span className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200">{s.text}</span>
                <Icon size={18} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              </li>
            );
          })}
        </ol>
        {g.note && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{g.note}</p>}
        {mode === 'inapp' && (
          <a href={externalBrowserUrl(window.location.href)} target="_blank" rel="noopener noreferrer"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-xl py-3 font-semibold transition-colors">
            <ExternalLink size={16} /> เปิดในเบราว์เซอร์
          </a>
        )}
      </div>
    </div>
  );
}

// กดแล้ว: Android ที่มี prompt → หน้าติดตั้งของเครื่อง · แบบอื่น → โมดอลขั้นตอน
function useInstallAction() {
  const env = useInstallEnv();
  const [guide, setGuide] = useState(null);
  const start = async () => {
    if (env.mode === 'prompt') {
      const r = await promptInstall();
      if (r === 'unavailable') setGuide('android');
      return;
    }
    setGuide(env.mode);
  };
  const modal = guide ? <InstallGuideModal mode={guide} onClose={() => setGuide(null)} /> : null;
  return { env, start, modal };
}

export function InstallAppCard() {
  const { env, start, modal } = useInstallAction();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(CARD_DISMISS_KEY) === '1'; } catch { return false; }
  });
  if (!env.show || hidden) return modal;
  const dismiss = () => {
    try { localStorage.setItem(CARD_DISMISS_KEY, '1'); } catch { /* localStorage ปิด — ปิดได้แค่รอบนี้ */ }
    setHidden(true);
  };
  return (
    <>
      <section className="mt-4 bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 rounded-2xl shadow-sm p-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0"><Smartphone size={18} /></span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">ติดตั้งคลังยาลงเครื่อง</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">เปิดจากหน้าจอหลักได้เลย เต็มจอเหมือนแอป ไม่ต้องหาลิงก์</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={start}
            className="inline-flex items-center gap-1.5 bg-[#1E90FF] hover:bg-[#1a7fe0] text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
            <Download size={16} /> {env.mode === 'inapp' ? 'เปิดในเบราว์เซอร์' : 'ติดตั้งแอป'}
          </button>
          <button type="button" onClick={dismiss}
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={14} /> ไม่ต้องแสดงอีก
          </button>
        </div>
      </section>
      {modal}
    </>
  );
}

// รายการในเมนู drawer — สไตล์เดียวกับปุ่ม "โหลดหน้านี้ใหม่"
// ไม่ปิด drawer ตอนกด: drawer unmount ทั้งก้อน → โมดอลของรายการนี้หายไปด้วย (โมดอล z-[60] อยู่เหนือ drawer z-50 อยู่แล้ว)
export function InstallAppMenuItem({ mini = false }) {
  const { env, start, modal } = useInstallAction();
  if (!env.show) return modal;
  return (
    <>
      <button type="button" onClick={start} title="ติดตั้งแอปลงเครื่อง"
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-800 hover:text-sky-700 dark:hover:text-sky-300 transition-colors ${mini ? 'justify-center' : ''}`}>
        <span className="p-1 rounded-md shrink-0 bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400"><Smartphone size={15} /></span>
        {!mini && 'ติดตั้งแอปลงเครื่อง'}
      </button>
      {modal}
    </>
  );
}
