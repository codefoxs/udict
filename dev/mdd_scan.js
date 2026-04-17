const { MDD } = require('js-mdict');
const mdd = new MDD('D:/code/Claude_code/LM5/LDOCE5++ V 1-35.mdd');
const header = mdd.header || {};
// Scan all blocks
let total = 0, b = 0, hits = [];
while (true) {
  let list;
  try { list = mdd.lookupPartialKeyBlockListByKeyInfoId(b); } catch { break; }
  if (!list || !list.length) break;
  total += list.length;
  for (const it of list) {
    if (/illust/i.test(it.keyText)) {
      hits.push(it.keyText);
      if (hits.length <= 5) console.log('hit:', it.keyText);
    }
  }
  b++;
  if (b > 2000) break;
}
console.log('total keys:', total, 'blocks scanned:', b, 'illustration hits:', hits.length);
