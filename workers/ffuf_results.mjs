import { openFuzzResultRecords } from '@capri/fuzz-results';
import { hash } from '@capri/module-utils';
import { resultFields } from '../results-contract.mjs';

const compactFields = ['url', 'status', 'length', 'words', 'lines'];
function normalizeFilters(filters = {}) {
  const normalized = {};
  for (const key of ['status', 'min_bytes', 'max_bytes', 'min_words', 'max_words', 'min_lines', 'max_lines', 'url_contains']) {
    if (filters[key] !== undefined) normalized[key] = key === 'status' ? [...filters[key]].sort((a, b) => a - b) : filters[key];
  }
  for (const kind of ['bytes', 'words', 'lines']) if (normalized['min_' + kind] !== undefined && normalized['max_' + kind] !== undefined && normalized['min_' + kind] > normalized['max_' + kind]) throw new Error('Minimum ' + kind + ' exceeds maximum');
  return normalized;
}
function matches(row, filters) {
  if (filters.status && !filters.status.includes(row.status)) return false;
  if (filters.url_contains !== undefined && (typeof row.url !== 'string' || !row.url.includes(filters.url_contains))) return false;
  for (const [kind, property] of [['bytes', 'length'], ['words', 'words'], ['lines', 'lines']]) {
    if (filters['min_' + kind] !== undefined && (!Number.isFinite(row[property]) || row[property] < filters['min_' + kind])) return false;
    if (filters['max_' + kind] !== undefined && (!Number.isFinite(row[property]) || row[property] > filters['max_' + kind])) return false;
  }
  return true;
}
function cell(value) {
  return (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? ''))
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replace(/[\\|`[\]()]/g, char => '\\' + char);
}
const project = (row, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));

export function run(args) {
  const view = args.view || 'standard', filters = normalizeFilters(args.filters);
  const fields = args.fields || (view === 'compact' || view === 'table' ? compactFields : undefined);
  if (fields?.some(field => !resultFields.includes(field))) throw new Error('Unknown result field');
  const reader = openFuzzResultRecords(args);
  try {
    if (!reader.parsed) { const { close, ...metadata } = reader; return { ...metadata, view, filters, items: [], returned: 0 }; }
    const limit = args.limit ?? 100;
    const fingerprint = hash({ id: args.id, source: reader.source_signature, filters, view, fields, limit });
    let offset = args.offset ?? 0;
    if (args.cursor) {
      let cursor; try { cursor = JSON.parse(Buffer.from(args.cursor, 'base64url').toString('utf8')); } catch { throw new Error('Invalid result cursor'); }
      if (cursor.fingerprint !== fingerprint || !Number.isInteger(cursor.offset) || cursor.offset < 0) throw new Error('Result cursor does not match this artifact, filters or view');
      offset = cursor.offset;
    }
    const page = [], summary = { status_counts: {}, bytes: 0, words: 0, lines: 0 };
    let matched = 0;
    for (const { value: row } of reader.records()) {
      if (!row || typeof row !== 'object' || !matches(row, filters)) continue;
      if (view !== 'summary' && matched >= offset && page.length < limit) page.push(row);
      matched++;
      if (Number.isInteger(row.status)) summary.status_counts[row.status] = (summary.status_counts[row.status] || 0) + 1;
      for (const [target, source] of [['bytes', 'length'], ['words', 'words'], ['lines', 'lines']]) if (Number.isFinite(row[source])) summary[target] += row[source];
    }
    const returned = page.length, next = view !== 'summary' && offset + returned < matched ? offset + returned : null;
    const result = { parsed: true, view, total: reader.total, matched_total: matched, returned, filters, source_signature: reader.source_signature, next_offset: next,
      next_cursor: next === null ? null : Buffer.from(JSON.stringify({ fingerprint, offset: next })).toString('base64url') };
    if (fields) result.fields = fields;
    if (view === 'summary') return { ...result, summary };
    if (view === 'table') return { ...result, table: ['| ' + fields.map(cell).join(' | ') + ' |', '| ' + fields.map(() => '---').join(' | ') + ' |', ...page.map(row => '| ' + fields.map(field => cell(row[field])).join(' | ') + ' |')].join('\n') };
    return { ...result, items: fields ? page.map(row => project(row, fields)) : page };
  } finally { reader.close(); }
}
