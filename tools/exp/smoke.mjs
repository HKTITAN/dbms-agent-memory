import { readFileSync } from 'node:fs'
import { oracle, scoreSet, CLASS_BY_ID } from '../../engines/contract.mjs'
import { build, PRIMARY_ARMS } from '../../engines/index.mjs'

const vault = JSON.parse(readFileSync('data/vault.json', 'utf8'))
const arms = build(PRIMARY_ARMS)
for (const a of arms) {
  const info = await a.load(vault)
  console.log(`loaded ${a.id}:`, JSON.stringify(info).slice(0, 200))
}

const byClass = new Map()
for (const q of vault.questions) {
  if (!byClass.has(q.class)) byClass.set(q.class, [])
  byClass.get(q.class).push(q)
}

for (const [cls, qs] of byClass) {
  const sample = qs.slice(0, 3)
  const line = []
  for (const a of arms) {
    let f1 = 0, exact = 0
    for (const q of sample) {
      const exp = oracle(vault, q)
      const got = await a.ask(q)
      const s = scoreSet(got.ids, exp)
      f1 += s.f1; exact += s.exact
      if (s.exact !== 1 && a.id !== 'notion') {
        console.log(`  MISMATCH ${a.id} ${cls} ${q.id}: exp ${exp.length} got ${got.ids.length}`,
          JSON.stringify(exp.slice(0,3)), JSON.stringify(got.ids.slice(0,3)))
      }
    }
    line.push(`${a.id}=${(f1/sample.length).toFixed(2)}/${exact}`)
  }
  console.log(cls.padEnd(16), line.join('  '))
}
for (const a of arms) await a.close()
