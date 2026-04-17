const path = require('path');
const { DictManager } = require('../src/dict');
const mgr = new DictManager(path.join(__dirname, '..', 'config.json'));
const w = process.argv[2] || 'apple';
const r = mgr.lookup(w)[0];
const h = r.html;
const imgs = [...h.matchAll(/<img[^>]+src=["']([^"']+)["']/g)].map(m => m[1]).slice(0, 5);
const sounds = [...h.matchAll(/sound:\/\/+([^"'\s<>)]+)/gi)].map(m => m[1]).slice(0, 5);
console.log('raw img srcs:', imgs);
console.log('raw sound keys:', sounds);
for (const key of imgs) {
  const buf = mgr.getResource(r.dict, key);
  console.log(`  img ${key} -> ${buf ? buf.length + ' bytes' : 'NOT FOUND'}`);
  if (!buf) {
    // try variations
    for (const alt of [key.toLowerCase(), '\\' + key, key.replace(/^media\//, '\\media\\'), key.replace(/\//g, '\\')]) {
      const b2 = mgr.getResource(r.dict, alt);
      console.log(`    try ${JSON.stringify(alt)} -> ${b2 ? b2.length : 'nope'}`);
    }
  }
}
