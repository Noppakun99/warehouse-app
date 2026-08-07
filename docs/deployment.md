# Deployment (Netlify)

> ตั้งค่าเมื่อ 2026-08-07 — เลิกใช้ Netlify Drop แล้ว

## TL;DR

- deploy ผ่าน **Netlify + Continuous Deployment จาก GitHub** (Netlify build ให้บน cloud)
- **branch ที่ deploy = `feat/requisition-bbase`** ไม่ใช่ `main`
- **auto-build ปิดอยู่** (Build status = Stopped) → `git push` ไม่ trigger build ไม่กินโควตา
- ขึ้นเว็บจริงต้อง **Trigger deploy เองที่หน้า Netlify**

## Config

| รายการ | ค่า |
|---|---|
| Project | `my-warehouse-app` |
| Live URL | https://my-warehouse-app.netlify.app |
| Git repo | `github.com/Noppakun99/warehouse-app` |
| Branch to deploy | **`feat/requisition-bbase`** |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Build status | **Stopped** (auto-deploy ปิด) |

build command / publish dir / redirect rules อ่านจาก [netlify.toml](../netlify.toml) — ไม่ต้องตั้งใน dashboard

`netlify.toml` pin `NODE_VERSION = "22"` กัน "ผ่านในเครื่อง พังบน CI" (เครื่อง dev เป็น Node 24 ไม่ได้ pin ใน `package.json`)

### Environment variables (ตั้งบน Netlify)

```
VITE_SUPABASE_URL       = https://kgjocnfafhqqioneqapk.supabase.co
VITE_SUPABASE_ANON_KEY  = <legacy anon/public key>
```

ค่ามาจาก Supabase project `kgjocnfafhqqioneqapk` → Settings → API Keys → tab "Legacy anon, service_role" → แถว **anon / public**

- anon key เป็น **public key** ปลอดภัยฝังใน client — **ห้ามใช้ service_role**
- ⚠️ **อย่ากด "Disable legacy API keys" ใน Supabase** — key ที่ตั้งไว้บน Netlify เป็นแบบ legacy ถ้า disable แอปจะเชื่อม Supabase ไม่ได้ทันที. ถ้าจะย้ายไป publishable key แบบใหม่ **แก้แค่ค่า env var บน Netlify ไม่ต้องแก้โค้ด** (ชื่อตัวแปร `VITE_SUPABASE_ANON_KEY` ใน [supabase.js](../src/lib/supabase.js) ไม่ผูกกับชนิดของ key)
- ⚠️ **ลืมใส่ env var = build ผ่าน เว็บเปิดได้ แต่ไม่มีข้อมูล และไม่มี error ให้เห็น** — `supabase.js` แค่ `console.warn` แล้ว fallback เป็น `null`

## Workflow

```
แก้โค้ด → git commit → git push       (ไม่ deploy ไม่กินโควตา)
                         ↓
              พร้อมขึ้นเว็บจริงเมื่อไหร่
                         ↓
   Netlify → Deploys → Trigger deploy   (build ~30 วิ)
```

ไม่ต้อง `npm run build` เอง ไม่ต้องลากโฟลเดอร์เข้า Netlify Drop

**วิธี Trigger deploy:**

1. เปิด https://app.netlify.com/projects/my-warehouse-app/deploys
2. กด **Trigger deploy** (dropdown มุมขวาบน) → **Deploy site**
3. ดู log: `Installing dependencies` → `vite build` → `Site is live`

## Verify หลัง deploy

| # | ทดสอบ | ผลที่ควรได้ | ถ้าไม่ผ่าน |
|---|---|---|---|
| 1 | เปิดหน้าแรก | เห็นหน้า login | build ไม่สำเร็จ → ดู deploy log |
| 2 | ล็อกอิน | เข้าได้ เห็น Dashboard | env vars ผิด |
| 3 | เปิดแผนผังคลังยา | เห็นข้อมูลยาจริง ไม่ว่างเปล่า | env vars ผิด |
| 4 | เข้า sub-app แล้วกด F5 | โหลดปกติ ไม่ขึ้น 404 | redirect rule ใน `netlify.toml` ไม่ทำงาน |
| 5 | สลับ dark mode | ใช้งานได้ | deploy ผิด branch (ไปเอา `main`) |

ข้อ 4 สำคัญเพราะ routing ทำผ่าน `navStack` ใน [AppRoot.jsx](../src/AppRoot.jsx) ไม่มี URL จริงต่อหน้า — ต้องพึ่ง redirect `/* → /index.html`

ข้อ 5 ยืนยันว่าดึงโค้ดจาก branch ถูกตัว (dark mode มีเฉพาะใน `feat/requisition-bbase`)

## หมายเหตุ

- **branch `main` ตามหลังอยู่** — ค้างที่ 31 พ.ค. 2026 งานจริง 163 commits อยู่บน `feat/requisition-bbase` ระยะยาวควรหาจังหวะ merge (ทำตอนพร้อม test เต็มรูปแบบ ไม่ควรพ่วงกับงาน deploy)
- **โควตา build** — Free tier 300 นาที/เดือน, build จริง ~30 วินาที → deploy เดือนละ 20 ครั้งใช้ ~10 นาที
- **"credits remaining" ในหน้า project** = โควตา Netlify AI agent คนละตัว ไม่เกี่ยวกับ deploy
- **อย่าลากโฟลเดอร์โปรเจกต์เข้า Netlify Drop** — Drop รับแค่ static output (`dist/`) ถ้าลากทั้งโปรเจกต์ที่มี `node_modules` จะค้าง/ไม่ผ่าน (เหตุการณ์ 2026-08-06)
