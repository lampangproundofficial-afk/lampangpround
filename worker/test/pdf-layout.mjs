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

  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPIm7gFAAMkAbRLY1NgAAAAAElFTkSuQmCC', 'base64');
  const imageBuffer = imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength);

  async function makePdf(longDescription, includeGallery = false, productCount = 4) {
    const products = Array.from({ length: longDescription ? 1 : productCount }, (_, index) => ({
      product_id: `p${index + 1}`, product_name: `สินค้า ${index + 1}`,
      product_category: 'ของใช้/ของตกแต่ง', price: '', sort_order: index + 1,
      description: longDescription ? 'ทำจากไม้ไผ่และหวายสีธรรมชาติ'.repeat(65) : 'ทำจากไม้ไผ่และหวายสีธรรมชาติ',
    }));
    const legacy = { business_name: 'กลุ่มวิสาหกิจชุมชนจักสานไม้ไผ่', owner_name: 'เจ้าของร้าน',
      business_type: 'ผลิตสินค้า', product_category: '["ของใช้/ของตกแต่ง"]',
      sales_channel: '["หน้าร้าน"]', business_status: 'มั่นคง', potential_level: 4,
      in_project: 0, created_at: '2026-09-23T00:00:00.000Z' };
    const gallery = Array.from({ length: 3 }, (_, index) => ({
      product_id: `p${index + 1}`, image_role: 'product', sort_order: index + 1,
      status: 'ACTIVE', r2_key: `test-${index + 1}`,
    }));
    const env = {
      ASSETS: {
        async get() {
          return { async arrayBuffer() { return imageBuffer; } };
        },
      },
      DB: {
        prepare(sql) {
          return {
            bind() {
              return {
                async first() { return sql.includes('FROM legacy_records') ? legacy : null; },
                async all() {
                  if (sql.includes('FROM products')) return { results: products };
                  if (sql.includes('FROM shop_gallery')) return { results: includeGallery ? gallery : [] };
                  return { results: [] };
                },
              };
            },
          };
        },
      },
    };
    const result = await exportShopPdfNative(env, { backendId: 'test' });
    assert.equal(result.success, true);
    return PDFDocument.load(result.bytes);
  }

  const short = await makePdf(false, true);
  assert.equal(short.getPageCount(), 2);
  const countTextOps = (pdf) => {
    const contents = pdf.getPage(0).node.Contents();
    let count = 0;
    for (let index = 0; index < contents.size(); index++) {
      const stream = pdf.context.lookup(contents.get(index));
      const decoded = Buffer.from(decodePDFRawStream(stream).decode()).toString();
      count += (decoded.match(/ Tj/g) || []).length;
    }
    return count;
  };
  const firstPageTextOps = countTextOps(short);
  assert.ok(firstPageTextOps > 65, 'product rows should use the free space on page 1');
  const threeProducts = await makePdf(false, true, 3);
  assert.ok(
    firstPageTextOps > countTextOps(threeProducts) + 5,
    'fourth product row should stay on page 1 after column reflow'
  );

  const long = await makePdf(true);
  assert.ok(long.getPageCount() > 2, 'long product details should continue onto later pages');
  console.log('PDF_LAYOUT=PASS');
} finally {
  await rm(directory, { recursive: true, force: true });
}
