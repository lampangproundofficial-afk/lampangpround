#!/usr/bin/env node
/**
 * sync-sheet-to-d1.mjs — upsert ข้อมูลจาก migration/data/*.json (ผลของ fetch-source-public.mjs)
 * เข้า D1 ผ่าน `wrangler d1 execute --remote --file` (ใช้ OAuth ของ wrangler ไม่ต้องตั้ง CF_API_TOKEN)
 *
 * ครอบคลุม: legacy_records, products, shop_gallery, id_counters
 * หลักการ:
 *  - INSERT OR REPLACE ตาม PK — แถวใน D1 ที่ไม่มีในชีต (เช่น record ที่สร้างผ่านแอป) ไม่ถูกแตะ
 *  - legacy_records: fill-blanks-only — ช่องที่ D1 มีค่าอยู่แล้ว (กรอกผ่านเว็บ) ไม่ถูก sync ทับ, ว่าง → เติมจากชีต
 *    (ponytail: products/shop_gallery ยัง REPLACE ชีตชนะ — ถ้าเริ่มแก้สินค้าผ่านเว็บเยอะ ให้ยก merge เดียวกันไปใช้)
 *  - created_by: ชีตไม่ระบุ → คงค่าเดิมใน D1 ไว้ (ป้องกันพัง ownership), ไม่มีเดิม → 'Guest'
 *  - deleted_at/deleted_by เขียนเฉพาะแถว is_deleted = TRUE
 *  - GalleryID ซ้ำ: occurrence สุดท้ายคง PK เดิม, ตัวก่อนหน้าได้ GAL-IMPORT-<id>-<n> (เดียวกับ migrate.mjs)
 *  - ไม่มีการ DELETE ใด ๆ
 *
 * ใช้: node sync-sheet-to-d1.mjs          → generate SQL + สรุปแผน (dry)
 *      node sync-sheet-to-d1.mjs --apply → รันจริงผ่าน wrangler
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const CONFIG = process.env.WRANGLER_CONFIG || 'worker/wrangler.new-account.toml';
const DB_NAME = 'lampang-pround';
const ROOT = path.resolve(process.cwd(), '..');
const dataDir = path.join(process.cwd(), 'data');
const outDir = path.join(process.cwd(), 'data-sync');

function readData(name) {
  const file = path.join(dataDir, `${name}.json`);
  if (!fs.existsSync(file)) return { headers: [], records: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function sqlVal(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
function toIso(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const m = text.match(DMY);
  if (!m) return text; // ค่าที่ parse ไม่ได้เก็บตามชีต
  const [, d, mo, y, hh = '00', mi = '00', ss = '00'] = m;
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}+07:00`;
}
function isTrue(value) {
  return String(value ?? '').trim().toUpperCase() === 'TRUE';
}
function normBool(value) {
  return isTrue(value) ? 'TRUE' : 'FALSE';
}
function runWrangler(args) {
  // เรียก node_modules/wrangler/bin/wrangler.js ตรงผ่าน node — เลี่ยงปัญหา quoting บน Windows shell
  const wranglerJs = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const out = execFileSync(process.execPath, [wranglerJs, ...args], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return out;
}
function runWranglerJson(sql) {
  const out = runWrangler([
    'd1', 'execute', DB_NAME,
    '--config', CONFIG, '--remote', '--json', '--command', sql,
  ]);
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return parsed[0].results;
}

console.log('── sync-sheet-to-d1 (upsert, no delete) ──');
const legacy = readData('LamproundData');
const products = readData('Products');
const gallery = readData('ShopGallery');

// created_by เดิมใน prod (แถวที่ชีตไม่ระบุเจ้าของจะคงค่าเดิม)
const existingCreators = new Map();
for (const row of runWranglerJson(`SELECT backend_id, created_by FROM legacy_records`)) {
  existingCreators.set(String(row.backend_id), String(row.created_by ?? ''));
}
console.log(`prod legacy_records เดิม: ${existingCreators.size} แถว`);

// ค่าเดิมทั้งแถวเพื่อ fill-blanks-only: ช่องที่ D1 มีค่าอยู่แล้ว (เช่น กรอกผ่านเว็บ) ไม่ถูก sync ทับ
const existingRows = new Map();
for (const row of runWranglerJson(`SELECT * FROM legacy_records`)) {
  existingRows.set(String(row.backend_id), row);
}

// คอลัมน์ DB ↔ ฟิลด์ชีต ที่ใช้หลัก fill-blanks-only (D1 มีค่าแล้วชนะเสมอ)
const FILLABLE = [
  ['business_name', 'BusinessName'],
  ['owner_name', 'OwnerName'],
  ['phone', 'Phone'],
  ['line_id', 'LineID'],
  ['facebook', 'Facebook'],
  ['website', 'Website'],
  ['location_text', 'LocationText'],
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
  ['business_type', 'BusinessType'],
  ['product_category', 'ProductCategory'],
  ['business_level', 'BusinessLevel'],
  ['main_products', 'MainProducts'],
  ['production_capacity', 'ProductionCapacity'],
  ['sales_channel', 'SalesChannel'],
  ['avg_price', 'AvgPrice'],
  ['business_status', 'BusinessStatus'],
  ['potential_level', 'PotentialLevel'],
  ['issues', 'Issues'],
  ['support_needed', 'SupportNeeded'],
  ['image_shop_ref', 'ImageShop'],
  ['image_product_ref', 'ImageProduct'],
  ['image_activity_ref', 'ImageActivity'],
  ['note', 'Note'],
  ['shop_history', 'ShopHistory'],
];

// ---- legacy_records ----
const legacyStatements = [];
let legacyUpdatedOwner = 0;
let legacySkippedResurrect = 0;
let legacyBlanksFilled = 0;
for (const row of legacy.records) {
  const backendId = String(row.BackendId ?? '').trim();
  if (!backendId) continue;
  const deleted = isTrue(row.IsDeleted);
  const existing = existingRows.get(backendId);
  // แถวถูกลบในชีตแต่ไม่มีใน D1 (เคย hard delete ผ่านแอป) — ไม่กู้คืนกลับเข้าระบบ
  if (deleted && !existing) {
    legacySkippedResurrect++;
    continue;
  }
  const sheetCreator = String(row.CreatedBy ?? '').trim();
  const existingCreator = existingCreators.get(backendId) ?? '';
  if (!sheetCreator && existingCreator) legacyUpdatedOwner++;
  const createdBy = sheetCreator || existingCreator || 'Guest';

  // fill-blanks-only: ช่องไหน D1 มีค่าอยู่แล้ว → คงค่า D1; ว่าง → เติมจากชีต
  const merged = FILLABLE.map(([col, field]) => {
    const current = String(existing?.[col] ?? '').trim();
    if (current) return current;
    legacyBlanksFilled++;
    return String(row[field] ?? '');
  });
  // ตัวตน/เวลาสร้าง: คงค่าเดิมถ้ามี
  const lamproundId = String(existing?.lampround_id ?? '').trim() || String(row.LamproundID ?? '').trim() || null;
  const createdAt = String(existing?.created_at ?? '').trim() || toIso(row.CreatedAt) || new Date().toISOString();
  // is_deleted แบบ monotonic: ลบแล้วไม่กลับมา ไม่ว่าชีตจะเปลี่ยนกลับ FALSE
  const finalDeleted = (String(existing?.is_deleted ?? '').trim().toUpperCase() === 'TRUE') || deleted;

  const cols = [
    backendId,
    lamproundId,
    merged[0],
    merged[1],
    merged[2],
    merged[3],
    merged[4],
    merged[5],
    merged[6],
    merged[7],
    merged[8],
    merged[9],
    merged[10],
    merged[11],
    merged[12],
    merged[13],
    merged[14],
    merged[15],
    merged[16],
    merged[17],
    merged[18],
    merged[19],
    merged[20],
    merged[21],
    merged[22],
    merged[23],
    merged[24],
    createdAt,
    createdBy,
    normBool(finalDeleted),
    finalDeleted ? (toIso(row.DeletedAt) || null) : null,
    finalDeleted ? (String(row.DeletedBy ?? '').trim() || null) : null,
  ];
  legacyStatements.push(
    `INSERT OR REPLACE INTO legacy_records (
      backend_id, lampround_id, business_name, owner_name, phone, line_id, facebook, website,
      location_text, latitude, longitude, business_type, product_category, business_level,
      main_products, production_capacity, sales_channel, avg_price, business_status, potential_level,
      issues, support_needed, image_shop_ref, image_product_ref, image_activity_ref, note,
      shop_history, created_at, created_by, is_deleted, deleted_at, deleted_by)
     VALUES (${cols.map(sqlVal).join(', ')});`
  );
}

// ---- products ----
const productStatements = [];
for (const row of products.records) {
  const productId = String(row.ProductID ?? '').trim();
  if (!productId) continue;
  const cols = [
    productId,
    String(row.ShopID ?? ''),
    String(row.ProductName ?? ''),
    String(row.ProductCategory ?? ''),
    String(row.Description ?? ''),
    String(row.Price ?? ''),
    String(row.Unit ?? ''),
    Number(row.SortOrder ?? 0) || 0,
    normBool(row.IsDeleted),
    toIso(row.CreatedAt) || new Date().toISOString(),
    String(row.CreatedBy ?? '').trim() || 'Guest',
    toIso(row.UpdatedAt) || toIso(row.CreatedAt) || new Date().toISOString(),
    String(row.UpdatedBy ?? '').trim() || String(row.CreatedBy ?? '').trim() || 'Guest',
  ];
  productStatements.push(
    `INSERT OR REPLACE INTO products (
      product_id, shop_id, product_name, product_category, description, price, unit,
      sort_order, is_deleted, created_at, created_by, updated_at, updated_by)
     VALUES (${cols.map(sqlVal).join(', ')});`
  );
}

// ---- shop_gallery (GalleryID ซ้ำ: ตัวสุดท้ายคง PK เดิม ตาม migrate.mjs) ----
const galleryRecords = gallery.records
  .map((row) => ({ row, galleryId: String(row.GalleryID ?? '').trim() }))
  .filter((r) => r.galleryId);
const idCounts = new Map();
for (const r of galleryRecords) idCounts.set(r.galleryId, (idCounts.get(r.galleryId) || 0) + 1);
const idSeen = new Map();
const galleryStatements = [];
for (const { row, galleryId } of galleryRecords) {
  const seen = idSeen.get(galleryId) || 0;
  idSeen.set(galleryId, seen + 1);
  const total = idCounts.get(galleryId);
  const pk = total > 1 && seen < total - 1 ? `GAL-IMPORT-${galleryId}-${seen + 1}` : galleryId;
  const shopId = String(row.ShopID ?? '').trim();
  const driveFileId = String(row.DriveFileId ?? '').trim();
  const cols = [
    pk,
    shopId,
    String(row.ProductID ?? ''),
    String(row.ImageRole ?? 'gallery') || 'gallery',
    String(row.DisplayName ?? ''),
    driveFileId,
    String(row.DriveUrl ?? ''),
    String(row.ThumbnailUrl ?? ''),
    String(row.MimeType ?? 'image/jpeg') || 'image/jpeg',
    Number(row.FileSize ?? 0) || 0,
    String(row.Width ?? ''),
    String(row.Height ?? ''),
    Number(row.SortOrder ?? 0) || 0,
    String(row.Status ?? 'ACTIVE') || 'ACTIVE',
    toIso(row.CreatedAt) || new Date().toISOString(),
    String(row.CreatedBy ?? '').trim() || 'Guest',
    toIso(row.UpdatedAt) || toIso(row.CreatedAt) || new Date().toISOString(),
    String(row.UpdatedBy ?? '').trim() || String(row.CreatedBy ?? '').trim() || 'Guest',
  ];
  galleryStatements.push(
    `INSERT OR REPLACE INTO shop_gallery (
      gallery_id, shop_id, product_id, image_role, display_name, drive_file_id, drive_url,
      thumbnail_url, mime_type, file_size, width, height, sort_order, status,
      created_at, created_by, updated_at, updated_by)
     VALUES (${cols.map(sqlVal).join(', ')});`
  );
}

const statements = [
  `-- sync-sheet-to-d1 ${new Date().toISOString()} — upsert จากชีต (COPY ONLY: no DELETE)`,
  `-- legacy_records ${legacyStatements.length} · products ${productStatements.length} · shop_gallery ${galleryStatements.length}`,
  ...legacyStatements,
  ...productStatements,
  ...galleryStatements,
  // counters คำนวณจากข้อมูลจริงหลัง import (รวมแถวที่มีอยู่เดิม)
  `UPDATE id_counters SET next_value = (SELECT COALESCE(MAX(CAST(SUBSTR(shop_id, 6) AS INTEGER)), 0) + 1 FROM shops) WHERE name = 'SHOP';`,
  `UPDATE id_counters SET next_value = (SELECT COALESCE(MAX(CAST(SUBSTR(product_id, 6) AS INTEGER)), 0) + 1 FROM products) WHERE name = 'PROD';`,
  `UPDATE id_counters SET next_value = (SELECT COALESCE(MAX(CAST(SUBSTR(gallery_id, 5) AS INTEGER)), 0) + 1 FROM shop_gallery) WHERE name = 'GAL';`,
];

fs.mkdirSync(outDir, { recursive: true });
const sqlPath = path.join(outDir, `sync-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
fs.writeFileSync(sqlPath, statements.join('\n') + '\n');
console.log(`SQL: ${sqlPath} (${statements.length} statements, ${(fs.statSync(sqlPath).size / 1024).toFixed(0)} KB)`);
console.log(`legacy_records: ${legacyStatements.length} (คง created_by เดิม ${legacyUpdatedOwner} แถว, เติมช่องว่าง ${legacyBlanksFilled} ช่อง, ข้ามแถวลบ-ไม่กู้คืน ${legacySkippedResurrect} แถว)`);
console.log(`products: ${productStatements.length}`);
console.log(`shop_gallery: ${galleryStatements.length} (GalleryID ซ้ำ ${galleryRecords.length - idCounts.size} แถว → GAL-IMPORT-*)`);

if (!APPLY) {
  console.log('dry run เสร็จ — รันอีกครั้งด้วย --apply เพื่อ execute ผ่าน wrangler');
  process.exit(0);
}

console.log('── apply ผ่าน wrangler d1 execute --remote --file ──');
runWrangler([
  'd1', 'execute', DB_NAME,
  '--config', CONFIG, '--remote', '--yes', '--file', sqlPath,
]);
// stdio ของ runWrangler ถูก buffer — โยน output ทิ้งได้เพราะผลจริงเช็คจาก count ด้านล่าง

const after = runWranglerJson(`SELECT
  (SELECT COUNT(*) FROM legacy_records) AS legacy,
  (SELECT SUM(is_deleted != 'TRUE') FROM legacy_records) AS legacy_active,
  (SELECT COUNT(*) FROM products) AS products,
  (SELECT COUNT(*) FROM shop_gallery) AS gallery`)[0];
console.log('หลัง sync:', JSON.stringify(after));
