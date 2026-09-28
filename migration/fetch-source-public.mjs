#!/usr/bin/env node
/**
 * fetch-source-public.mjs — ทางเลือกของ export-source.mjs เมื่อไม่มี service account
 * ชีตต้องเปิด "Anyone with the link can view" แล้วดึงผ่าน gviz CSV endpoint (read-only)
 * เขียน data/*.json ในรูปเดียวกับ export-source.mjs ({headers, records})
 * Users sheet ถูกข้าม (gviz parse ไม่ได้เมื่อแถวแรกไม่ใช่ header) — prod มี users จริงอยู่แล้ว
 */
import fs from 'node:fs';
import path from 'node:path';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1MH4EhTxX4V9jah0Pyb5qlEV08ZAYjmc6G59XMdzZkFc';
const SHEETS = ['LamproundData', 'Shops', 'Products', 'ShopGallery'];

function parseCsv(text) {
  // RFC 4180 เพียงพอสำหรับชีตนี้: ครอบคู่ " ได้ รองรับ "" และ newline ในเครื่องหมายคำพูด
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

console.log('── fetch-source-public (COPY ONLY, ไม่มี auth) ──');
const outDir = path.join(process.cwd(), 'data');
fs.mkdirSync(outDir, { recursive: true });
const summary = { exportedAt: new Date().toISOString(), spreadsheetId: SPREADSHEET_ID, mode: 'public-gviz-csv', sheets: {} };

for (const sheetName of SHEETS) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    console.error(`✗ ${sheetName}: HTTP ${res.status} — ชีตต้องแชร์ public`);
    process.exit(1);
  }
  const rows = parseCsv(await res.text());
  if (rows.length === 0) {
    summary.sheets[sheetName] = { headers: [], rows: 0 };
    continue;
  }
  const headers = rows[0].map((h) => String(h).trim());
  const records = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
  fs.writeFileSync(path.join(outDir, `${sheetName}.json`), JSON.stringify({ headers, records }, null, 1));
  summary.sheets[sheetName] = { headers: headers.length, rows: records.length };
  console.log(`✓ ${sheetName}: ${records.length} แถว (${headers.length} คอลัมน์)`);
}
fs.writeFileSync(path.join(outDir, 'Users.json'), JSON.stringify({ headers: [], records: [] }));
summary.sheets.Users = { headers: 0, rows: 0, skipped: 'gviz parse ไม่ได้ + prod มี users จริง' };
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(summary, null, 2));
console.log('เสร็จ → migration/data/');
