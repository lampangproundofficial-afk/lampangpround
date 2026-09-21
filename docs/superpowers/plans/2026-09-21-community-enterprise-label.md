# เปลี่ยนแปลงตัวเลือกขนาดวิสาหกิจ "อื่น / อื่นๆ" เป็น "วิสาหกิจชุมชน" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนแปลงข้อความและตัวเลือกขนาดวิสาหกิจ (Business Level) จาก "อื่น / อื่นๆ" เป็น "วิสาหกิจชุมชน" ครอบคลุม 1. แบบฟอร์ม 2. หน้ารายละเอียด และ 3. แดชบอร์ด พร้อมคง Parity ระหว่าง GAS และ Worker/Frontend

**Architecture:** ปรับปรุง UI ทั้งใน `frontend/index.html` และ `Code/index.html` เพื่อคงสถาปัตยกรรม Single Source of Truth พร้อมเพิ่ม `normalizeBusinessLevelLabel` ใน legacy app logic (`Code/javascript.html`, `frontend/src/legacy/app.js.txt`, และ `frontend/src/legacy/app.ts`) เพื่อแปลงค่าข้อมูลเดิม (เช่น 'อื่น', 'อื่นๆ', 'วิสาหกิจชุมชน') ให้แสดงผลเป็น 'วิสาหกิจชุมชน' สม่ำเสมอกันทุกจุด จากนั้น build frontend และ deploy Cloudflare Worker production

**Tech Stack:** HTML5, TypeScript, Tailwind CSS, Vite, Cloudflare Workers, Wrangler D1

**Spec:** คำสั่งผู้ใช้และภาพอ้างอิง 3 ภาพ (แบบฟอร์ม, รายละเอียด, แดชบอร์ด)

## Global Constraints
- ต้องคง Parity 100% ตามกฎ `tools/check-drift.mjs` (Code/index.html ↔ frontend/index.html, Code/javascript.html ↔ frontend/src/legacy/app.js.txt)
- รองรับข้อมูลเดิมที่มีในระบบ: ค่า 'อื่น' หรือ 'อื่นๆ' ที่บันทึกไว้ในฐานข้อมูล D1 เดิมต้องถูก normalize ให้แสดงผลเป็น 'วิสาหกิจชุมชน' ได้อย่างถูกต้อง
- ผ่านการตรวจสอบ TypeScript (`npm run typecheck`) และ Vite build (`npm run build -w frontend`)

## Review Focus
1. ตัวเลือก Radio ในแบบฟอร์มบันทึกข้อมูลหลักแสดงคำว่า "วิสาหกิจชุมชน" และส่งค่า `วิสาหกิจชุมชน` เข้าฐานข้อมูล
2. ตัวเลือก Dropdown ในแบบฟอร์มแก้ไข (Edit modal) มี `<option value="วิสาหกิจชุมชน">วิสาหกิจชุมชน</option>` และเลือกค่าให้อัตโนมัติเมื่อเปิดร้านค้าที่มีค่าเดิมเป็น 'อื่น' หรือ 'อื่นๆ'
3. หน้ารายละเอียด (Detail Modal) ในการ์ดสถิติ (Stat card), สรุปด่วน (Quick View Pill), และตารางข้อมูลธุรกิจ แสดงป้าย 'วิสาหกิจชุมชน' แทน 'อื่น'
4. หน้าแดชบอร์ด (Dashboard) ในกราฟแท่ง "ขนาดวิสาหกิจ" แท่งที่ไม่ใช่ SME แสดงชื่อ 'วิสาหกิจชุมชน' และนับยอดถูกต้อง
5. ผ่านการตรวจสอบ Drift check 0 hard-fail และ build สำเร็จก่อน deploy

---

### Task 1: อัปเดตแบบฟอร์ม (Form) ใน `frontend/index.html` และ `Code/index.html`
**Files:**
- Modify: `frontend/index.html`
- Modify: `Code/index.html`

- [ ] แก้ไข Radio card ขนาดวิสาหกิจจาก `value="อื่น"` เป็น `value="วิสาหกิจชุมชน"` และข้อความป้ายกำกับเป็น `วิสาหกิจชุมชน`
- [ ] แก้ไข Select option ขนาดวิสาหกิจในฟอร์มแก้ไขจาก `value="อื่น"` เป็น `value="วิสาหกิจชุมชน"` และข้อความ `วิสาหกิจชุมชน`
- [ ] อัปเดตทั้งใน `frontend/index.html` และ `Code/index.html` ให้โครงสร้าง DOM ตรงกันทุกบรรทัด

### Task 2: อัปเดตสคริปต์การแสดงผลรายละเอียด (Details) และแดชบอร์ด (Dashboard)
**Files:**
- Modify: `Code/javascript.html`
- Modify: `frontend/src/legacy/app.js.txt`
- Modify: `frontend/src/legacy/app.ts` (ผ่านการรัน `node tools/gen-app-ts.cjs`)

- [ ] เพิ่มฟังก์ชัน `normalizeBusinessLevelLabel(val)` สำหรับจัดการแปลงค่า 'อื่น', 'อื่นๆ', 'other' หรือ 'วิสาหกิจชุมชน' ให้คืนค่า 'วิสาหกิจชุมชน'
- [ ] ปรับฟังก์ชัน `buildDashboardSummary(item)` ให้แสดงผลระดับธุรกิจผ่าน `normalizeBusinessLevelLabel(item.BusinessLevel)`
- [ ] ปรับฟังก์ชัน `buildSummaryPills(item)` ให้แสดง pill ผ่าน `normalizeBusinessLevelLabel(item.BusinessLevel)`
- [ ] ปรับฟังก์ชัน `renderDetailModalBody(item)` ในส่วน `buildDetailField('ระดับของธุรกิจ', ...)` ให้แสดงผลผ่าน `normalizeBusinessLevelLabel`
- [ ] ปรับฟังก์ชัน `countByBusinessLevel(records)` ให้กลุ่ม fallback / อื่นๆ นับลง key `วิสาหกิจชุมชน`
- [ ] ปรับฟังก์ชัน `populateEditForm(item)` ให้ normalize `business_level` เพื่อเลือกตัวเลือกใน dropdown ได้ถูกต้อง
- [ ] ซิงค์การแก้ไขลงทั้ง `Code/javascript.html` และ `frontend/src/legacy/app.js.txt`
- [ ] รัน `node tools/gen-app-ts.cjs` เพื่อสร้าง `frontend/src/legacy/app.ts`

### Task 3: การทดสอบและการตรวจสอบความเข้ากันได้ (Verification)
- [ ] รัน `node tools/check-drift.mjs` เพื่อตรวจสอบ drift ระหว่าง GAS code และ Frontend code (ต้องได้ 0 hard-fail)
- [ ] รัน `npm run typecheck` เพื่อตรวจสอบข้อผิดพลาดทาง static type
- [ ] รัน `npm run build -w frontend` เพื่อ compile bundle สำหรับ production

### Task 4: Git Commit, Push และ Cloudflare Worker Deployment
- [ ] Commit การเปลี่ยนแปลงด้วย Conventional Commit (เช่น `fix(ui): rename enterprise size other to community enterprise`)
- [ ] Push ขึ้น Git Remote: `https://github.com/chookaittom-gif/Lampang-Pround`
- [ ] รันคำสั่ง deploy ไปยัง Cloudflare Worker Production: `npm run deploy:production -w worker`
- [ ] ตรวจสอบ URL: `https://lampang-pround.chookait-tom.workers.dev/`
