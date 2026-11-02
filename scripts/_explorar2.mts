import { readFileSync } from 'node:fs';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { argumentosA2, decodificarA2, referenciaA2 } from '../packages/engine/src/kernelA2.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararFormas, canonica, areaDaForma } from './kernel-harness-a2.mts';
import { projetoDeEstresseA2 } from './kernel-a2-estresse.mts';
import * as geom from '@hestia/geom';
const ger = await GerenciadorKernelV2.dosBytes(readFileSync(process.env.KERNEL_WASM_PATH!));
let total = 0, ruins = 0, simBig = 0;
const cats: Record<string, number> = {};
for (let seed = 1; seed <= 8; seed++) {
  const p = projetoDeEstresseA2(seed, { paredes: 40, pavimentos: 1 });
  const a1 = montarCenaA1(p);
  const s = a1.secoes, n = a1.nLinhas;
  const cena = CenaV2.criar(ger, fonteDeSecoes(() => ({ paredes: { colunas: s.paredes, n: n.paredes }, tipos_parede: { colunas: s.tipos_parede, n: n.tipos_parede }, camadas: { colunas: s.camadas, n: n.camadas }, faixas: { colunas: s.faixas, n: n.faixas }, paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro }, paredes_z: { colunas: s.paredes_z, n: n.paredes_z } })));
  const l = p.levels[0]!;
  const ref = referenciaA2(p, l.id, a1, {});
  const rust = decodificarA2(cena.consultar('itens_pintados', argumentosA2(p, l.id, a1, {})));
  ref.forEach((a, i) => {
    total++;
    const A = a.fragmento, B = rust[i]!.fragmento;
    const r = compararFormas(canonica(A), canonica(B));
    if (!r.erro) return;
    ruins++;
    const d1 = A.length && B.length ? geom.difference(A, B) : A; const d2 = A.length && B.length ? geom.difference(B, A) : B;
    const sd = areaDaForma(d1) + areaDaForma(d2);
    if (sd > 1e-6) { simBig++; if (simBig <= 6) console.log('SIMDIFF GRANDE', seed, i, sd, r.erro, 'pecas', A.length, B.length); }
    const key = sd <= 1e-6 ? 'simdiff<=1e-6' : 'simdiff>1e-6';
    cats[key] = (cats[key] ?? 0) + 1;
  });
  cena.destruir();
}
console.log({ total, ruins, simBig, cats });
