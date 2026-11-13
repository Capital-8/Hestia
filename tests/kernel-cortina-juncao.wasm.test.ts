/**
 * Parede cortina, fase 3 (decisão 0056, junção entre paredes): do `Project` à seção 110 e ao Rust REAL. Confere que as paredes que o adaptador acha no nó
 * (comum em L, T, outra cortina) viram o recuo e o montante de canto que o Rust calcula, e que `noJoin` desliga a junção. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, makeWall, type Project } from '@hestia/model';
import { enviarCenaCortina, lerPlantaCortina, lerQuantCortina, montarCenaCortina } from '../packages/engine/src/kernelCortina.ts';
import { entradaCortinaDoProjeto } from '../packages/engine/src/cortinaProjeto.ts';
import { especCortinaTeste, projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

/** Contorno do sistema (papel 0, detalhe grosso) de cada cortina: x mínimo e máximo. */
function extensoes(p: Project): Map<number, { x0: number; x1: number; y0: number; y1: number }> {
  const c = montarCenaCortina(entradaCortinaDoProjeto(p).entrada);
  const cena = CenaV2.criar(ger!, (v) => enviarCenaCortina(v, c));
  const out = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
  for (const l of lerPlantaCortina(cena.consultar('cortina_planta', [0xffffffff, 1.5, 0])).filter((x) => x.papel === 0)) {
    out.set(l.cortina, { x0: Math.min(...l.pontos.map((q) => q.x)), x1: Math.max(...l.pontos.map((q) => q.x)), y0: Math.min(...l.pontos.map((q) => q.y)), y1: Math.max(...l.pontos.map((q) => q.y)) });
  }
  cena.destruir();
  return out;
}

type ParedeNova = Omit<Parameters<typeof makeWall>[0], 'levelId'>;
const com = (paredes: ParedeNova[], base: Project = projetoComCortina()): Project => {
  const s = new ProjectStore(base);
  for (const w of paredes) s.exec({ type: 'addWall', wall: makeWall({ height: 3, ...w, levelId: 'lv_0' }) });
  return s.project;
};

describe('junção da cortina pelo kernel real (seção 110)', () => {
  it.skipIf(!bytes)('parede comum em T: a cortina de (0,0) a (6,0) começa na face da parede (meia espessura)', () => {
    const p = com([{ id: 'wt', typeId: 'wt_alv14', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } }]);
    const meia = entradaCortinaDoProjeto(p).entrada.cortinas.find((c) => c.id === 'ct1')!.extremidades![0]!.espessura / 2;
    const e = [...extensoes(p).values()][0]!;
    expect(e.x0).toBeCloseTo(meia, 6);
    expect(e.x1).toBeCloseTo(6, 6);
    // Sem a parede, a cortina vai ao nó.
    expect([...extensoes(projetoComCortina()).values()][0]!.x0).toBeCloseTo(0, 6);
  });

  it.skipIf(!bytes)('noJoin desliga o encosto da ponta', () => {
    const s = new ProjectStore(com([{ id: 'wt', typeId: 'wt_alv14', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } }]));
    s.exec({ type: 'updateElements', ids: ['ct1'], patch: { noJoinStart: true } });
    expect([...extensoes(s.project).values()][0]!.x0).toBeCloseTo(0, 6);
  });

  it.skipIf(!bytes)('duas cortinas em L: as duas recuam, o canto sai nas quantidades uma vez só', () => {
    const base = projetoComCortina(especCortinaTeste({ mullions: { ...especCortinaTeste().mullions, corner: 'mul_ret_50x100' } }));
    const p = com([{ id: 'ct2', typeId: 'wt_ct', a: { x: 6, y: 0 }, b: { x: 6, y: 4 } }], base);
    const ext = extensoes(p);
    const [c1, c2] = [...ext.keys()].sort((a, b) => a - b);
    // Profundidade 0,1 (linha central): cada cortina recua max(0,05; 0,025) = 0,05 m.
    expect(ext.get(c1!)!.x1).toBeCloseTo(6 - 0.05, 6);
    expect(ext.get(c2!)!.y0).toBeCloseTo(0.05, 6);
    const cena = CenaV2.criar(ger!, (v) => enviarCenaCortina(v, montarCenaCortina(entradaCortinaDoProjeto(p).entrada)));
    const cantos = lerQuantCortina(cena.consultar('quant_cortina', [0xffffffff])).filter((l) => l.papel === 6);
    cena.destruir();
    expect(cantos).toHaveLength(1);
    expect(cantos[0]!.n).toBe(1);
    expect(cantos[0]!.volume).toBeCloseTo(0.1 * 0.1 * 3, 5);
  });
});
