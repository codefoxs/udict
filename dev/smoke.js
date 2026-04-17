const path = require('path');
const { DictManager } = require('../src/dict');

(async () => {
  const mgr = new DictManager(path.join(__dirname, '..', 'config.json'));
  const word = process.argv[2] || 'hello';

  console.log('prefixSync (cold):', mgr.prefixSync(word, 5));

  console.log(`\n=== lookup("${word}") ===`);
  const res = await mgr.lookup(word);
  console.log(`${res.length} entries`);
  for (const r of res) {
    console.log(`--- [${r.dict}] ${r.keyText} (${r.html.length} bytes) ---`);
  }

  console.log('\nstatus:', mgr.status());
  console.log('\nprefixSync (warm):', mgr.prefixSync(word, 5));
  console.log('prefix async:', await mgr.prefix(word, 5));
})();
