const { MDD } = require('js-mdict');
const mdd = new MDD('D:/code/Claude_code/LM5/LDOCE5++ V 1-35.mdd');
const items = mdd.lookupPartialKeyBlockListByKeyInfoId(0);
console.log('total in block 0:', items.length);
console.log(items.slice(0, 20).map(i => i.keyText));
const last = mdd.lookupPartialKeyBlockListByKeyInfoId(10);
console.log('\nblock 10 sample:');
console.log(last.slice(0, 10).map(i => i.keyText));
// Try searching for "apple" anywhere
console.log('\n searching apple/illust...');
for (let b = 0; b < 50; b++) {
  const list = mdd.lookupPartialKeyBlockListByKeyInfoId(b);
  for (const it of list) {
    if (/apple/i.test(it.keyText) && /illust|jpg|png/i.test(it.keyText)) {
      console.log('  hit:', JSON.stringify(it.keyText));
    }
  }
}
