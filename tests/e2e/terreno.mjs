// E2E do terreno e do lote no navegador (roteiro B.5 do PLANO). Uso: npm run build && node tests/e2e/terreno.mjs
import { makeReporter } from './helpers.mjs';
import { abrir } from './terreno-base.mjs';
import { passo1, passo2, passo3, tempos } from './terreno-passos-a.mjs';
import { passo4, passo5, passo6 } from './terreno-passos-b.mjs';
import { passo7, passo8, passo9 } from './terreno-passos-c.mjs';
import { passo10 } from './terreno-passos-d.mjs';
import { medicoes } from './terreno-medicoes.mjs';

const rep = makeReporter();
const ctx = await abrir();
try {
  await passo1(rep, ctx);
  await passo2(rep, ctx);
  await passo3(rep, ctx);
  await passo4(rep, ctx);
  await passo5(rep, ctx);
  await passo6(rep, ctx);
  await passo7(rep, ctx);
  await passo8(rep, ctx);
  await passo9(rep, ctx);
  await passo10(rep, ctx);
} catch (e) {
  console.log(`\nFALHA INESPERADA: ${e.stack ?? e.message}`);
}
await ctx.fechar();
try {
  await medicoes(rep);
} catch (e) {
  console.log(`\nFALHA INESPERADA NA MEDIÇÃO: ${e.stack ?? e.message}`);
}
console.log('\nTempos (ms):', JSON.stringify(tempos));
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
