#!/usr/bin/env node
// Prepare and verify gallery URL replacement for a D1 account transfer.
// This program does not contact or write to either D1 database.
import fs from 'node:fs';
import path from 'node:path';

function fail(message) { throw new Error(message); }
function option(name) {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!value) fail(`Missing --${name}=PATH`);
  return value.slice(name.length + 3);
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); }
function rowsFrom(value) {
  if (Array.isArray(value) && value[0]?.results) return value[0].results;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.results)) return value.results;
  fail('Gallery input must be a row array or Wrangler D1 JSON output');
}
function sql(value) { return `'${String(value ?? '').replaceAll("'", "''")}'`; }
function galleryRow(row) {
  return {
    gallery_id: String(row.gallery_id ?? ''),
    shop_id: String(row.shop_id ?? ''),
    drive_file_id: String(row.drive_file_id ?? ''),
    drive_url: String(row.drive_url ?? ''),
    thumbnail_url: String(row.thumbnail_url ?? ''),
    status: String(row.status ?? ''),
  };
}
function validateUnique(rows, field, label) {
  const values = rows.map((row) => row[field]);
  if (values.some((value) => !value)) fail(`${label} contains an empty ${field}`);
  if (new Set(values).size !== values.length) fail(`${label} contains duplicate ${field}`);
}

const mode = process.argv.find((arg) => arg.startsWith('--mode='))?.slice(7) || 'prepare';
if (mode === 'prepare') {
  const mappingPath = option('mapping');
  const galleryPath = option('gallery');
  const sqlPath = option('sql');
  const manifestPath = option('manifest');
  const mappingData = readJson(mappingPath);
  if (mappingData.unresolved?.length) fail(`Mapping has ${mappingData.unresolved.length} unresolved files`);
  const mapping = mappingData.mapping || [];
  validateUnique(mapping, 'oldId', 'Mapping');
  validateUnique(mapping, 'newId', 'Mapping');
  if (mapping.some((entry) => !entry.md5Checksum || !Number(entry.size))) fail('Mapping lacks checksum or file size evidence');
  const byOldId = new Map(mapping.map((entry) => [entry.oldId, entry]));
  const source = rowsFrom(readJson(galleryPath)).map(galleryRow);
  validateUnique(source, 'gallery_id', 'Source gallery');
  const missing = source.filter((row) => row.drive_file_id && !byOldId.has(row.drive_file_id));
  if (missing.length) fail(`${missing.length} gallery rows lack an old-to-new Drive ID mapping`);
  const expected = source.map((row) => {
    const mapped = byOldId.get(row.drive_file_id);
    const newId = mapped?.newId || '';
    return {
      ...row,
      old_drive_file_id: row.drive_file_id,
      old_drive_url: row.drive_url,
      old_thumbnail_url: row.thumbnail_url,
      drive_file_id: newId,
      drive_url: newId ? `https://drive.google.com/file/d/${newId}/view` : row.drive_url,
      thumbnail_url: newId ? `https://lh3.googleusercontent.com/d/${newId}=w800` : row.thumbnail_url,
    };
  });
  const statements = expected.filter((row) => row.old_drive_file_id).map((row) =>
    `UPDATE shop_gallery SET drive_file_id=${sql(row.drive_file_id)}, drive_url=${sql(row.drive_url)}, thumbnail_url=${sql(row.thumbnail_url)} ` +
    `WHERE gallery_id=${sql(row.gallery_id)} AND drive_file_id=${sql(row.old_drive_file_id)} ` +
    `AND drive_url=${sql(row.old_drive_url)} AND thumbnail_url=${sql(row.old_thumbnail_url)};`
  );
  const header = [
    '-- Generated from a frozen source gallery snapshot and verified Drive content mapping.',
    '-- Import the source D1 export into an empty target before running this file.',
    '-- Each UPDATE checks the original gallery ID, Drive ID, and URLs. Verify afterward.',
  ];
  fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(sqlPath, [...header, ...statements, ''].join('\n'));
  writeJson(manifestPath, { createdAt: new Date().toISOString(), sourceGalleryRows: source.length,
    updates: statements.length, expected });
  console.log(JSON.stringify({ sourceGalleryRows: source.length, updates: statements.length,
    mappedDriveIds: new Set(expected.map((row) => row.old_drive_file_id).filter(Boolean)).size,
    sqlPath, manifestPath }));
} else if (mode === 'verify') {
  const manifest = readJson(option('manifest'));
  const target = rowsFrom(readJson(option('gallery'))).map(galleryRow);
  validateUnique(target, 'gallery_id', 'Target gallery');
  const byId = new Map(target.map((row) => [row.gallery_id, row]));
  const mismatches = [];
  for (const expected of manifest.expected) {
    const actual = byId.get(expected.gallery_id);
    if (!actual) { mismatches.push({ gallery_id: expected.gallery_id, reason: 'missing' }); continue; }
    for (const key of ['shop_id', 'status', 'drive_file_id', 'drive_url', 'thumbnail_url']) {
      if (actual[key] !== expected[key]) mismatches.push({ gallery_id: expected.gallery_id, field: key });
    }
  }
  if (target.length !== manifest.sourceGalleryRows) mismatches.push({ reason: 'row_count',
    expected: manifest.sourceGalleryRows, actual: target.length });
  console.log(JSON.stringify({ pass: mismatches.length === 0, targetGalleryRows: target.length,
    mismatches: mismatches.slice(0, 30), mismatchCount: mismatches.length }));
  if (mismatches.length) process.exitCode = 1;
} else {
  fail(`Unknown mode: ${mode}`);
}
