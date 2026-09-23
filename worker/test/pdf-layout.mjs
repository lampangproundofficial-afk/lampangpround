import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';

const directory = await mkdtemp(join(tmpdir(), 'lampang-pdf-layout-'));
try {
  const bundle = join(directory, 'pdf.mjs');
  await build({ entryPoints: ['src/routes/pdf.ts'], bundle: true, platform: 'node', format: 'esm', loader: { '.ttf': 'binary' }, outfile: bundle });
  Uint8Array.fromBase64 ??= (value) => Buffer.from(value, 'base64');
  const { exportShopPdfNative } = await import(pathToFileURL(bundle).href);

  async function makePdf(longDescription) {
    const products = Array.from({ length: longDescription ? 1 : 4 }, (_, index) => ({
      product_id: `p${index + 1}`, product_name: `สินค้า ${index + 1}`,
      product_category: 'ของใช้/ของตกแต่ง', price: '', sort_order: index + 1,
      description: longDescription ? 'ทำจากไม้ไผ่และหวายสีธรรมชาติ'.repeat(65) : 'ทำจากไม้ไผ่และหวายสีธรรมชาติ',
    }));
    const legacy = { business_name: 'กลุ่มวิสาหกิจชุมชนจักสานไม้ไผ่', owner_name: 'เจ้าของร้าน',
      business_type: 'ผลิตสินค้า', product_category: '["ของใช้/ของตกแต่ง"]',
      sales_channel: '["หน้าร้าน"]', business_status: 'มั่นคง', potential_level: 4,
      in_project: 0, created_at: '2026-09-23T00:00:00.000Z' };
    const env = { DB: { prepare(sql) { return { bind() { return {
      async first() { return sql.includes('FROM legacy_records') ? legacy : null; },
      async all() { return { results: sql.includes('FROM products') ? products : [] }; },
    }; } }; } } };
    const result = await exportShopPdfNative(env, { backendId: 'test' });
    assert.equal(result.success, true);
    return PDFDocument.load(result.bytes);
  }

  const short = await makePdf(false);
  assert.equal(short.getPageCount(), 2);
  const contents = short.getPage(0).node.Contents();
  let firstPageTextOps = 0;
  for (let index = 0; index < contents.size(); index++) {
    const stream = short.context.lookup(contents.get(index));
    const decoded = Buffer.from(decodePDFRawStream(stream).decode()).toString();
    firstPageTextOps += (decoded.match(/ Tj/g) || []).length;
  }
  assert.ok(firstPageTextOps > 65, 'product rows should use the free space on page 1');

  const long = await makePdf(true);
  assert.ok(long.getPageCount() > 2, 'long product details should continue onto later pages');
  console.log('PDF_LAYOUT=PASS');
} finally {
  await rm(directory, { recursive: true, force: true });
}
