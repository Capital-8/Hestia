// E2E do terreno e do lote no navegador (roteiro B.5 do PLANO). Uso: npm run build && node tests/e2e/terreno.mjs
import { makeReporter } from './helpers.mjs';
import { abrir } from './terreno-base.mjs';
import { passo1, passo2, passo3, tempos } from './terreno-passos-a.mjs';
import { passo4, passo5, passo6 } from './terreno-passos-b.mjs';

const rep = makeReporter();
const ctx = await abrir();
try {
  await passo1(rep, ctx);
  await passo2(rep, ctx);
  await passo3(rep, ctx);
  await passo4(rep, ctx);
  await passo5(rep, ctx);
  await passo6(rep, ctx);
  await rep.step('sem erro de console em nenhum passo', async () => {
    rep.check('nenhum erro de console ou de página', ctx.errors.length === 0, ctx.errors.slice(0, 4).join(' | '));
  });
} catch (e) {
  console.log(`\nFALHA INESPERADA: ${e.stack ?? e.message}`);
}
console.log('\nTempos (ms):', JSON.stringify(tempos));
rep.summary();
await ctx.fechar();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
