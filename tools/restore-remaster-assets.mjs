// Exact original bytes, split only to support bounded repository transfers.
// npm ci runs this before validation/build; no network or extra dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'asset-source/remaster-parts/manifest.json'), 'utf8'));
const safePath = (name) => {
  const resolved = path.resolve(root, name);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Invalid asset path: ${name}`);
  return resolved;
};
for (const file of manifest.files) {
  if (!file.target.startsWith('public/assets/remaster/')) throw new Error('Unexpected restore destination');
  const data = Buffer.concat(file.parts.map((part) => fs.readFileSync(safePath(part))));
  if (data.length !== file.bytes || crypto.createHash('sha256').update(data).digest('hex') !== file.sha256) {
    throw new Error(`Asset source is incomplete: ${file.target}`);
  }
  const target = safePath(file.target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}
console.log(`Restored ${manifest.files.length} original remaster assets`);
