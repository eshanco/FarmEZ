import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx } from '../js/xlsx.js';

const COLUMNS = [
  { label: 'Tag', type: 'text' },
  { label: 'Sold', type: 'date' },
  { label: 'Price', type: 'money' },
  { label: 'Days', type: 'int' },
];

// Files are stored uncompressed, so each one can be read straight out of the archive.
function unzip(bytes) {
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  const files = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const start = at + 30 + nameLength;
    files[decoder.decode(bytes.subarray(at + 30, start))] = decoder.decode(bytes.subarray(start, start + size));
    at = start + size;
  }
  return files;
}

test('buildXlsx writes one worksheet per sheet, named in order', () => {
  const files = unzip(buildXlsx([
    { name: 'All', columns: COLUMNS, rows: [] },
    { name: '2025', columns: COLUMNS, rows: [] },
  ]));
  assert.ok(files['xl/worksheets/sheet1.xml']);
  assert.ok(files['xl/worksheets/sheet2.xml']);
  assert.match(files['xl/workbook.xml'], /<sheet name="All" sheetId="1" r:id="rId1"\/><sheet name="2025" sheetId="2" r:id="rId2"\/>/);
});

test('buildXlsx writes a header row and typed cells', () => {
  const sheet = unzip(buildXlsx([{ name: 'All', columns: COLUMNS, rows: [['IE1', '2025-03-01', 1450.5, 120]] }]))['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Tag<\/t>/);
  assert.match(sheet, /<c r="A2" s="0" t="inlineStr"><is><t xml:space="preserve">IE1<\/t>/);
  // 1 March 2025 as an Excel day number.
  assert.match(sheet, /<c r="B2" s="2"><v>45717<\/v><\/c>/);
  assert.match(sheet, /<c r="C2" s="3"><v>1450.5<\/v><\/c>/);
  assert.match(sheet, /<c r="D2" s="0"><v>120<\/v><\/c>/);
  assert.match(sheet, /<autoFilter ref="A1:D2"\/>/);
});

test('buildXlsx leaves empty values blank and escapes text', () => {
  const sheet = unzip(buildXlsx([{ name: 'All', columns: COLUMNS, rows: [['A<&>B', null, null, undefined]] }]))['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /A&lt;&amp;&gt;B/);
  assert.doesNotMatch(sheet, /r="[BCD]2"/);
});
