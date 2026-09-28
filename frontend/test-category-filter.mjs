// check: ตัวกรอง "อื่นๆ"/"ไม่ระบุ" ต้องตรงกับ countByProductCategory ใน dashboard เป๊ะ
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
globalThis.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null };
const g = (await import('./src/legacy/app.ts')).__legacyGlobals;
const m = g.matchesRecordCategory;
const count = g.countByProductCategory;

const cases = [
  ['["อาหาร"]', 'อื่นๆ', false],
  ['["อาหาร","อื่นๆ"]', 'อื่นๆ', true],
  ['["ท่องเที่ยว"]', 'อื่นๆ', true],
  ['["เครื่องดื่ม (ไม่มีแอลกอฮอล์)"]', 'อื่นๆ', false],
  ['["สมุนไพร","ของใช้/ของตกแต่ง"]', 'อื่นๆ', false],
  ['[]', 'อื่นๆ', false],
  [undefined, 'อื่นๆ', false],
  ['[]', 'ไม่ระบุ', true],
  [undefined, 'ไม่ระบุ', true],
  ['["อาหาร"]', 'ไม่ระบุ', false],
  ['["อาหาร"]', 'อาหาร', true],
  ['["สมุนไพร"]', 'สมุนไพรที่ไม่ใช่อาหาร', true],
  [undefined, '', true],
];
let fail = 0;
for (const [raw, filter, want] of cases) {
  const got = m({ ProductCategory: raw }, filter);
  if (got !== want) { console.log(`FAIL ${JSON.stringify(raw)} filter=${filter} got=${got} want=${want}`); fail++; }
}

// invariant: จำนวนที่ตัวกรองจับได้ == แท่งกราฟ
const fixtures = cases.map(([raw]) => ({ ProductCategory: raw }))
  .concat([{ ProductCategory: '["อื่นๆ"]' }, { ProductCategory: '["อาหาร","ท่องเที่ยว","อื่นๆ"]' }]);
for (const filter of ['อื่นๆ']) {
  const chart = count(fixtures)[filter] || 0;
  const filtered = fixtures.filter((r) => m(r, filter)).length;
  if (chart !== filtered) { console.log(`FAIL invariant ${filter}: chart=${chart} filtered=${filtered}`); fail++; }
}
// ไม่ระบุ: กราฟไม่มีแท่งนี้โดยนิยาม (ร้านไม่มีหมวดโผล่ที่ไหนเลย) — ตัวกรองจึงเป็นวิธีเดียวที่หาร้านกลุ่มนี้ได้
if ('ไม่ระบุ' in count(fixtures)) { console.log('FAIL ไม่ระบุ: chart ต้องไม่มีแท่งนี้'); fail++; }
console.log(fail === 0 ? 'OK all category-filter checks pass' : `${fail} failures`);
process.exit(fail === 0 ? 0 : 1);
