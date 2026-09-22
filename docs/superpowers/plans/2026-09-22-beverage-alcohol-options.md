# เพิ่มตัวเลือกประเภทเครื่องดื่ม (มีแอลกอฮอล์ / ไม่มีแอลกอฮอล์) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มตัวเลือกประเภทเครื่องดื่ม "มีแอลกอฮอล์ / ไม่มีแอลกอฮอล์" เมื่อเลือกหมวดหมู่เครื่องดื่มในแบบฟอร์ม แสดงผลในหน้ารายละเอียดร้านค้า และในรายงาน PDF โดยไม่กระทบ Schema ฐานข้อมูลเดิมและคง Parity กับ GAS

**Architecture:** เมื่อผู้ใช้เลือกหมวดหมู่ "เครื่องดื่ม" ในแบบฟอร์มขั้นตอนที่ 2 จะแสดงตัวเลือกย่อย "ไม่มีแอลกอฮอล์ / มีแอลกอฮอล์" เมื่อส่งแบบฟอร์ม ระบบจะบันทึกค่าลงในคอลัมน์ `product_category` เช่น `เครื่องดื่ม (มีแอลกอฮอล์)` หรือ `เครื่องดื่ม (ไม่มีแอลกอฮอล์)` ซึ่งทำให้หน้ารายละเอียดและรายงาน PDF ดึงไปแสดงผลได้ทันทีโดยอัตโนมัติ พร้อมรักษา Parity ระหว่าง `Code/` (GAS) และ `frontend/` (Worker) ตามกฎ `tools/check-drift.mjs`

**Tech Stack:** HTML5, TypeScript, Tailwind CSS, Vite, Cloudflare Workers, D1 SQLite, PDF-lib

**Spec:** คำสั่งผู้ใช้และภาพอ้างอิง 3 ภาพ (แบบฟอร์มลงทะเบียน, รายงาน PDF, หน้ารายละเอียดร้านค้า)

## Global Constraints
- ต้องคง Parity 100% ตามกฎ `tools/check-drift.mjs` (`Code/index.html ↔ frontend/index.html`, `Code/javascript.html ↔ frontend/src/legacy/app.js.txt`)
- ไม่เปลี่ยน Schema หรือเพิ่มคอลัมน์ในฐานข้อมูล (คง `product_category` เดิม เพื่อความเข้ากันได้กับชีตเดิมและระบบเดิม)
- รองรับ Touch Target >= 44px บนมือถือ และไม่เกิด Horizontal Overflow
- ผ่านการตรวจสอบ TypeScript (`npm run typecheck`) และ Vite build (`npm run build -w frontend`)

---

### Task 1: อัปเดตโครงสร้างแบบฟอร์มใน `frontend/index.html` และ `Code/index.html`
**Files:**
- Modify: `frontend/index.html`
- Modify: `Code/index.html`

- [ ] **Step 1: เพิ่ม id และ onchange ที่ checkbox เครื่องดื่ม**
  - เพิ่ม `id="cat-beverage-check"` และ `onchange="toggleBeverageAlcoholOptions()"` ในช่อง input เครื่องดื่ม
- [ ] **Step 2: เพิ่ม container ตัวเลือกย่อยประเภทเครื่องดื่ม**
  - เพิ่ม `#beverage-alcohol-group` ใต้กลุ่มหมวดหมู่สินค้า พร้อมปุ่มเลือก radio "ไม่มีแอลกอฮอล์" (default) และ "มีแอลกอฮอล์"
- [ ] **Step 3: ซิงค์โครงสร้าง DOM ไปยัง `Code/index.html`**
  - คัดลอกโครงสร้างบล็อกดังกล่าวให้ตรงกันบรรทัดต่อบรรทัด
- [ ] **Step 4: ทดสอบ drift**
  - รัน: `node tools/check-drift.mjs`
  - ผลลัพธ์ที่คาดหวัง: `[drift] OK index.html ↔ frontend/index.html`

### Task 2: จัดการ Logic การแสดงผลและบันทึกใน client scripts
**Files:**
- Modify: `frontend/src/legacy/app.js.txt`
- Modify: `Code/javascript.html`
- Modify: `frontend/src/legacy/app.ts` (ผ่าน `frontend/tools/gen-app-ts.cjs`)

- [ ] **Step 1: เพิ่มฟังก์ชัน `toggleBeverageAlcoholOptions()`**
  - ตรวจสอบสถานะการติ๊กของ `#cat-beverage-check` เพื่อสลับการแสดง/ซ่อน `#beverage-alcohol-group`
- [ ] **Step 2: อัปเดต `saveFormDraft` และ `restoreFormDraft`**
  - คืนค่าและตรวจสอบเมื่อมีหมวดหมู่เครื่องดื่มให้เปิดแสดงตัวเลือกย่อยและตั้งค่า radio ให้ตรง
- [ ] **Step 3: อัปเดต `submitForm`**
  - เมื่อพบหมวดหมู่ "เครื่องดื่ม" ในข้อมูลที่ส่ง ให้แปลงเป็น "เครื่องดื่ม (มีแอลกอฮอล์)" หรือ "เครื่องดื่ม (ไม่มีแอลกอฮอล์)" ตามที่เลือก
- [ ] **Step 4: อัปเดต Form reset**
  - เมื่อเคลียร์ฟอร์ม ให้ซ่อน `#beverage-alcohol-group`
- [ ] **Step 5: สร้าง `app.ts`**
  - รัน: `node frontend/tools/gen-app-ts.cjs`

### Task 3: ตรวจสอบการแสดงผลในหน้ารายละเอียดและรายงาน PDF
**Files:**
- Modify: `worker/src/routes/pdf.ts` (ตรวจสอบ fallback format ถ้าจำเป็น)
- Modify: `frontend/src/legacy/app.js.txt` / `frontend/src/legacy/app.ts` (ตรวจสอบ detail chip)

- [ ] **Step 1: ตรวจสอบการเรนเดอร์ชิปใน Detail Modal**
  - ยืนยันว่า `buildChipGroup` แสดงชิป `เครื่องดื่ม (มีแอลกอฮอล์)` และ `เครื่องดื่ม (ไม่มีแอลกอฮอล์)` เป็นสีม่วงถูกต้อง
- [ ] **Step 2: ตรวจสอบการเรนเดอร์หมวดหมู่สินค้าใน PDF report**
  - ยืนยันว่า `parseJsonArray` ใน `worker/src/routes/pdf.ts` จัดกลุ่มและแสดงผลข้อความในตาราง PDF ครบถ้วน

### Task 4: การทดสอบความถูกต้องและ Parity (Verification)
- [ ] **Step 1: รัน Drift check**
  - รัน: `node tools/check-drift.mjs`
  - ผลลัพธ์: 0 hard-fail, 0 warn
- [ ] **Step 2: รัน Typecheck**
  - รัน: `npm run typecheck`
  - ผลลัพธ์: ผ่านทุก workspace (worker, frontend, migration)
- [ ] **Step 3: รัน Frontend build**
  - รัน: `npm run build -w frontend`
  - ผลลัพธ์: bundle สำเร็จ
