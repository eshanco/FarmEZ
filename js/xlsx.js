// Builds an Excel workbook (.xlsx) in the browser. No DOM, no Firebase, so this file can be unit
// tested with node. A workbook is a zip of XML files; they are stored uncompressed, which keeps
// this small and is plenty for a herd's worth of rows.

// Column types and the cell style each one uses (an index into cellXfs in STYLES below).
const STYLE_OF = { text: 0, int: 0, date: 2, money: 3, decimal: 4 };
const HEADER_STYLE = 1;

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const STYLES = `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

// Control characters are not allowed in XML at all, so they are dropped.
function xml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"]/g, (c) => XML_ESCAPES[c]);
}

// 0 -> A, 25 -> Z, 26 -> AA.
function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

// Excel counts days from 30 December 1899.
function dateSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

const textCell = (ref, value, style) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;

// An empty value leaves the cell out, so Excel shows a blank rather than a zero.
function cell(ref, value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'text') return textCell(ref, value, STYLE_OF.text);
  const n = type === 'date' ? dateSerial(value) : value;
  return Number.isFinite(n) ? `<c r="${ref}" s="${STYLE_OF[type]}"><v>${n}</v></c>` : '';
}

function sheetXml({ columns, rows }, first) {
  const head = columns.map((c, i) => textCell(`${columnName(i)}1`, c.label, HEADER_STYLE)).join('');
  const body = rows.map((row, r) =>
    `<row r="${r + 2}">${columns.map((c, i) => cell(`${columnName(i)}${r + 2}`, row[i], c.type)).join('')}</row>`).join('');
  const range = `A1:${columnName(columns.length - 1)}${rows.length + 1}`;
  return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}">
<sheetViews><sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? Math.max(10, c.label.length + 3)}" customWidth="1"/>`).join('')}</cols>
<sheetData><row r="1">${head}</row>${body}</sheetData>
<autoFilter ref="${range}"/>
</worksheet>`;
}

// Excel allows 31 characters in a tab name and none of \ / ? * [ ] :
const sheetName = (name) => String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Zip archive of { name, text } files, stored without compression.
function zip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const directory = [];
  let offset = 0;
  const push = (list, bytes) => {
    list.push(bytes);
    return bytes.length;
  };
  // Little-endian fields: [size in bytes, value].
  const record = (fields) => {
    const bytes = new Uint8Array(fields.reduce((sum, [size]) => sum + size, 0));
    const view = new DataView(bytes.buffer);
    let at = 0;
    for (const [size, value] of fields) {
      if (size === 2) view.setUint16(at, value, true);
      else view.setUint32(at, value, true);
      at += size;
    }
    return bytes;
  };

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    // Version 2.0, no flags, stored, 1 January 1980, then checksum, sizes and name length.
    const common = [[2, 20], [2, 0], [2, 0], [2, 0], [2, 0x21], [4, crc32(data)], [4, data.length], [4, data.length], [2, name.length], [2, 0]];
    const start = offset;
    offset += push(parts, record([[4, 0x04034b50], ...common]));
    offset += push(parts, name);
    offset += push(parts, data);
    push(directory, record([[4, 0x02014b50], [2, 20], ...common, [2, 0], [2, 0], [2, 0], [4, 0], [4, start]]));
    push(directory, name);
  }

  const directorySize = directory.reduce((sum, b) => sum + b.length, 0);
  const end = record([[4, 0x06054b50], [2, 0], [2, 0], [2, files.length], [2, files.length], [4, directorySize], [4, offset], [2, 0]]);
  const out = new Uint8Array(offset + directorySize + end.length);
  let at = 0;
  for (const bytes of [...parts, ...directory, end]) {
    out.set(bytes, at);
    at += bytes.length;
  }
  return out;
}

// Sheets are { name, columns: [{ label, type, width }], rows }, where each row is an array of
// values in column order and type is 'text' | 'int' | 'decimal' | 'money' | 'date' (an ISO
// string). Returns the bytes of the .xlsx file.
export function buildXlsx(sheets) {
  const sheetFiles = sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(sheet, i === 0) }));
  return zip([
    {
      name: '[Content_Types].xml',
      text: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      text: `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text: `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text: `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', text: STYLES },
    ...sheetFiles,
  ]);
}
