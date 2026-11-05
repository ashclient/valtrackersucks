'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { analyzeMatch } = require('../src/analytics.cjs');

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_MATCHES = 500;
function mergeMatches(previous, incoming) {
  const items = new Map();
  for (const item of [...(Array.isArray(previous) ? previous : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (!item || typeof item.id !== 'string' || !item.id) continue;
    items.set(item.id, item);
  }
  return [...items.values()]
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
    .slice(0, MAX_MATCHES);
}
function importParsed(raw, ownPuuid) {
  const entries = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.matches) ? raw.matches : [raw]);
  return entries.slice(0, 300).map(rawMatch => analyzeMatch(rawMatch, ownPuuid));
}
function importFiles(filePaths, puuid, previous) {
  if (!puuid) throw new Error('Set your own PUUID in Settings first.');
  if (!Array.isArray(filePaths)) throw new Error('No files supplied.');
  const parsed = [], errors = [];
  let examined = 0;
  for (const name of filePaths.slice(0, MAX_FILES)) {
    try {
      if (path.extname(name).toLowerCase() !== '.json') continue;
      const stat = fs.lstatSync(name);
      if (!stat.isFile()) continue; // never follow symlinks
      if (stat.size > MAX_FILE_BYTES) throw new Error('File exceeds 8 MB');
      if (stat.size < 2) throw new Error('Empty JSON file');
      const raw = JSON.parse(fs.readFileSync(name, 'utf8'));
      parsed.push(...importParsed(raw, puuid));
      examined++;
    } catch (err) {
      errors.push(path.basename(name) + ': ' + err.message);
    }
  }
  const oldIds = new Set((previous || []).map(x => x.id));
  const merged = mergeMatches(previous, parsed);
  return {
    matches: merged,
    imported: new Set(parsed.filter(x => !oldIds.has(x.id)).map(x => x.id)).size,
    examined, errors
  };
}
function scanFolder(folder, puuid, previous) {
  if (!folder || !fs.statSync(folder).isDirectory()) throw new Error('Select a valid JSON export folder.');
  const items = fs.readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map(entry => {
      const name = path.join(folder, entry.name);
      try { return { name, mtime: fs.statSync(name).mtimeMs }; }
      catch { return null; }
    }).filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime).slice(0, MAX_FILES)
    .map(entry => entry.name);
  return importFiles(items, puuid, previous);
}
const FIELDS = [
  'timestamp','map','queue','result','kills','deaths','assists','kd','acs','adr','hs','rounds','agentId','id'
];
function csvField(value) {
  let raw = value == null ? '' : String(value);
  // Guard cells against spreadsheet formula injection.
  if (/^[\s]*[=+\-@\t\r]/.test(raw)) raw = "'" + raw;
  return '"' + raw.replace(/"/g, '""') + '"';
}
function exportCSV(items) {
  return [FIELDS.map(csvField).join(',')]
    .concat((items || []).map(row => FIELDS.map(field => csvField(row[field])).join(',')))
    .join('\r\n') + '\r\n';
}
module.exports = {
  MAX_FILE_BYTES, MAX_FILES, MAX_MATCHES, importFiles, importParsed, mergeMatches, scanFolder, exportCSV, csvField
};
