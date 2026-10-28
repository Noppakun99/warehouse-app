# Deployment (Netlify)

> ตั้งค่าเมื่อ 2026-08-07 — เลิกใช้ Netlify Drop แล้ว

## TL;DR

- deploy ผ่าน **Netlify + Continuous Deployment จาก GitHub** (Netlify build ให้บน cloud)
- **branch ที่ deploy = `main`** (เปลี่ยนจาก `feat/requisition-bbase` เมื่อ 2026-08-13 — ดู §ประวัติการเปลี่ยน branch)
- **auto-build เปิดอยู่** (Build status = Active) → **`git push origin main` = ขึ้นเว็บจริงอัตโนมัติ** ~30 วินาที
- push ขึ้น branch อื่น **ไม่ deploy** (`allowed_branches = ["main"]`)
- ไม่อยากให้ build รอบไหน → ใส่ `[skip ci]` ในข้อความ commit

## Config

| รายการ | ค่า |
|---|---|
| Project | `my-warehouse-app` |
| Live URL | https://my-warehouse-app.netlify.app |
| Git repo | `github.com/Noppakun99/warehouse-app` |
| Branch to deploy | **`main`** |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Build status | **Active builds** (auto-deploy ทุก push) |

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
แก้โค้ด → git commit → git push
                         ↓
        Netlify build อัตโนมัติ (~30 วินาที)
                         ↓
                   ขึ้นเว็บจริง
```

ไม่ต้อง `npm run build` เอง ไม่ต้องลากโฟลเดอร์เข้า Netlify Drop ไม่ต้องกด Trigger

**ไม่อยากให้ build รอบไหน** (เช่น commit แก้ docs) → ใส่ `[skip ci]` ในข้อความ commit — **บังคับสำหรับ commit เอกสารล้วน** เพราะโควตา deploy มีแค่ ~20 ครั้ง/เดือน (ดู §โควตา build)

**ดูสถานะ:** https://app.netlify.com/projects/my-warehouse-app/deploys
log ควรจบด้วย `Site is live` — ถ้าอยาก deploy ซ้ำโดยไม่ push ใหม่ กด **Trigger deploy** → **Deploy site**

> ⚠️ **อย่าตั้ง Build status = "Stopped builds"** — มันไม่ได้ปิดแค่ auto-build แต่**ปิดปุ่ม Trigger deploy ด้วย**
> (Netlify: "Activate builds… to re-enable the option to trigger deploys") ทำให้ deploy ไม่ได้เลยจาก dashboard
> ต้องกด **Activate builds** ก่อนถึงจะกลับมาใช้ได้ (เหตุการณ์ 2026-08-07)

### โควตา build — แผน Free แบบเครดิต (ตรวจ 28/10/2569)

> ⚠️ ข้อความเดิม "300 นาที/เดือน push ได้ ~600 ครั้ง" เป็นระบบเก่า **ใช้ไม่ได้แล้ว** — บัญชีย้ายมาแผน `credit-free` (Netlify เปลี่ยนเป็นระบบเครดิต ก.ย. 2025)

- **300 เครดิต/รอบ ไม่ทบไปรอบหน้า** · รอบเริ่มวันที่ **11** ของทุกเดือน (`current_billing_period_start`)
- **deploy production ที่สำเร็จ = 15 เครดิต → ได้แค่ ~20 ครั้ง/รอบ** (deploy ล้ม / rollback / deploy preview / branch deploy ไม่กินเครดิต) · bandwidth + request ของเว็บก็หักเครดิตด้วย (ดูได้ในหน้า Usage ของ dashboard เท่านั้น API ไม่บอก)
- บัญชีตั้ง `block_builds_when_usage_exceeded` → **เครดิตหมด = push แล้วไม่ขึ้นเว็บ** จนถึงรอบใหม่ · แผน Free ซื้อเครดิตเพิ่มไม่ได้ (ต้องอัปเป็น Personal $9/เดือน 1,000 เครดิต)
- เหตุการณ์จริง: รอบ 11/10–11/11/2569 deploy ครบ 20 ครั้งวันที่ 28/10 (`b0f2b5c`) → Netlify ให้ grace top-up ชั่วคราว · รอบก่อน 18 ครั้ง

**ข้อตกลง (user เลือกอยู่แผน Free ต่อ — 28/10/2569):**
1. **รวม commit ไว้ในเครื่อง แล้ว push วันละครั้ง** — commit ได้ตามปกติ แต่ push = deploy 1 ครั้ง
2. **commit ที่แก้แค่เอกสาร (`docs/`, `*.md`, skill, memory) ใส่ `[skip ci]` ในข้อความ** → ไม่ build ไม่กินเครดิต
3. ⚠️ **Netlify ดู `[skip ci]` จาก commit บนสุดของการ push เท่านั้น** — push โค้ด + docs พร้อมกัน แล้ว commit บนสุดเป็น docs `[skip ci]` = **โค้ดไม่ขึ้นเว็บแบบเงียบ** → ให้ commit โค้ดอยู่บนสุด หรือไม่ใส่ `[skip ci]` ในรอบที่มีโค้ด
4. อยากลองบนเว็บก่อนโดยไม่กินเครดิต → push ขึ้น branch อื่น (branch deploy / deploy preview ฟรี)
5. ก่อน push เช็คว่ารอบนี้ deploy ไปกี่ครั้งแล้ว: `netlify api listSiteDeploys --data '{"site_id":"7704ee11-c868-4cf0-a4a6-28412222876f","per_page":30}'` นับ `state=ready` + `context=production` ตั้งแต่วันที่ 11

## Verify หลัง deploy

| # | ทดสอบ | ผลที่ควรได้ | ถ้าไม่ผ่าน |
|---|---|---|---|
| 1 | เปิดหน้าแรก | เห็นหน้า login | build ไม่สำเร็จ → ดู deploy log |
| 2 | ล็อกอิน | เข้าได้ เห็น Dashboard | env vars ผิด |
| 3 | เปิดแผนผังคลังยา | เห็นข้อมูลยาจริง ไม่ว่างเปล่า | env vars ผิด |
| 4 | เข้า sub-app แล้วกด F5 | โหลดปกติ ไม่ขึ้น 404 | redirect rule ใน `netlify.toml` ไม่ทำงาน |
| 5 | เปิดเมนู "ยืม-คืนยาระหว่างโรงพยาบาล" | เห็นเมนูใน sidebar | deploy จาก commit เก่ากว่า `86af6aa` |

ข้อ 4 สำคัญเพราะ routing ทำผ่าน `navStack` ใน [AppRoot.jsx](../src/AppRoot.jsx) ไม่มี URL จริงต่อหน้า — ต้องพึ่ง redirect `/* → /index.html`

ข้อ 5 คือ marker ที่ใหม่ที่สุด — ฟีเจอร์ยืม-คืนยาเข้ามาเมื่อ 12/08 ถ้าไม่เห็นแปลว่า build ดึงโค้ดเก่า (เดิมข้อนี้ใช้ dark mode เป็น marker แต่ตอนนี้ `main` มี dark mode แล้ว แยกไม่ออก)

> verify ครั้งแรก 2026-08-07 ผ่านครบ 5 ข้อ ด้วย Playwright ยิงเว็บ production จริง
> (`/dashboard` + `/some/deep/path` คืน 200 ยืนยัน redirect rule; Supabase ตอบ < 400 ยืนยัน env vars)

## ประวัติการเปลี่ยน branch (2026-08-13)

เดิม Netlify deploy จาก `feat/requisition-bbase` ทำให้ **ชื่อ branch ไม่ตรงกับหน้าที่** — มันคือ production trunk แต่ชื่อบอกว่าเป็น feature branch คนที่เข้ามาใหม่ (หรือ agent) จะเข้าใจผิดว่า `main` คือตัวที่ deploy อยู่ แล้วสรุปสถานะผิด

ลำดับที่ใช้เปลี่ยน — **merge ก่อน แล้วค่อยสลับ setting**:

1. ทุกเครื่อง push งานค้างขึ้น branch ให้หมด
2. merge `feat/requisition-bbase` → `main` (commit `86af6aa`) + `npm run build` ผ่าน + push
3. เปลี่ยน `repo_branch` **และ `allowed_branches`** เป็น `main` (ต้องเปลี่ยนคู่กัน — ถ้าแก้แค่ `repo_branch` build จะถูก `allowed_branches` กรองทิ้ง)
4. trigger deploy → ตรวจว่า `state=ready`, `branch=main`, `commit_ref=86af6aa`
5. แก้เอกสารนี้

ลำดับนี้สำคัญ: ตอนสลับ setting `main` ต้องมีเนื้อหาเท่ากับที่ live อยู่แล้ว เว็บจึงไม่เปลี่ยนหน้าตา — ถ้าสลับก่อน merge ผู้ใช้จริงจะเห็นเว็บย้อนกลับไป 13 commits ชั่วคราว

**ทำผ่าน Netlify CLI ได้** (`netlify login` → `netlify link --name my-warehouse-app`) — payload ที่ถูกต้องคือส่งผ่าน key `repo` ไม่ใช่ `build_settings`:

```bash
netlify api updateSite --data '{"site_id":"<id>","body":{"repo":{"repo_branch":"main","allowed_branches":["main"], ...}}}'
```

ส่ง `build_settings` ตรงๆ **API รับแล้วเงียบ ไม่ error แต่ไม่เปลี่ยนค่า** — ต้องอ่านกลับมาตรวจเสมอ อย่าเชื่อ response

## หมายเหตุ
- **"credits remaining" ในหน้า project** = เครดิตของบัญชีตัวเดียวกับที่ deploy ใช้ (ระบบเครดิต — ข้อความเดิมที่ว่าเป็นโควตา AI agent แยกต่างหาก ไม่จริงแล้ว 28/10/2569)
- **อย่าลากโฟลเดอร์โปรเจกต์เข้า Netlify Drop** — Drop รับแค่ static output (`dist/`) ถ้าลากทั้งโปรเจกต์ที่มี `node_modules` จะค้าง/ไม่ผ่าน (เหตุการณ์ 2026-08-06)
