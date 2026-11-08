/**
 * Fronteiras de tolerância de altura da junção B3 (`Z_EPS` = 1e-6 m, em `junctionNet.ts`/`junctionPlanar.ts` e em `crates/geom-wasm/src/b3.rs`):
 * (a) recobrimento de cota de duas peças EXATAMENTE `Z_EPS` (comparação estrita `>` em `zOverlaps`/`z_se_cruzam`); (b) dois níveis cuja diferença de cota é
 * EXATAMENTE `Z_EPS` (o trecho de cota de largura `Z_EPS` entre dois cortes é descartado, `<=` em `resolveJunction`/`resolver_juncao`).
 * Cada caso roda com a diferença exata e com ±1e-12. O Rust tem de dar o mesmo resultado que o TypeScript (`compararB3`, o comparador oficial da junção).
 * Roda só em `npm run test:wasm`. Padrão de construção de cena e de comparação: `kernel-b3.wasm.test.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ProjectStore, createEmptyProject, makeFloor, makeLevel, makeWall, type Command, type Project } from '@hestia/model';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { montarPerfisA3d } from '../packages/engine/src/kernelA3d.ts';
import { montarCenaB1 } from '../packages/engine/src/kernelB.ts';
import { argumentosB3, decodificarB3, montarCenaB3, referenciaB3, type JuncaoB3 } from '../packages/engine/src/kernelB3.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararB3 } from '../scripts/kernel-harness-b.mts';

/** `Z_EPS` lido de `junctionNet.ts` (linha 59) e `junctionPlanar.ts` (linha 45); `b3.rs` tem a mesma constante (linha 34). */
const Z_EPS = 1e-6;
const K_B3_0049 = Number(process.env['B3_K'] ?? 0.14);

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
const cenas: CenaV2[] = [];

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null; // binário sem ABI v2: os testes são pulados
  }
});
afterAll(() => {
  for (const c of cenas) c.destruir();
});

/** Dois pavimentos: o térreo (cota 0) com parede e piso que vão até -0,1 m; o de cima na cota `elevacaoDoDeCima`, com piso de 0,1 m abaixo dela. */
function projetoDeFronteira(elevacaoDoDeCima: number): Project {
  const store = new ProjectStore(createEmptyProject('Fronteira B3'));
  const caixa = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  const cmds: Command[] = [
    { type: 'upsertLevel', level: makeLevel({ id: 'l0', name: 'Térreo', elevation: 0 }) },
    { type: 'upsertLevel', level: makeLevel({ id: 'l1', name: 'Superior', elevation: elevacaoDoDeCima }) },
    { type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_ext19', levelId: 'l0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) },
    { type: 'addFloor', floor: makeFloor({ id: 'f0', typeId: 'ft_ceram', levelId: 'l0', boundary: caixa }) },
    { type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'l1', boundary: caixa }) },
  ];
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

/** Cena da B3 do projeto (mesmas seções de `kernel-b3.wasm.test.ts`). */
function cenaDe(p: Project) {
  const a1 = montarCenaA1(p, true);
  const a3 = montarCenaA3(p, a1);
  const perfis = montarPerfisA3d(p, a1, true);
  const b = montarCenaB1(p, a1.materialDe);
  const b3 = montarCenaB3(p, a1);
  const s = a1.secoes;
  const n = a1.nLinhas;
  const sb = b.secoes;
  const nb = b.nLinhas;
  const cena = CenaV2.criar(
    ger!,
    fonteDeSecoes(() => ({
      paredes: { colunas: s.paredes, n: n.paredes },
      tipos_parede: { colunas: s.tipos_parede, n: n.tipos_parede },
      camadas: { colunas: s.camadas, n: n.camadas },
      faixas: { colunas: s.faixas, n: n.faixas },
      paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro },
      paredes_z: { colunas: s.paredes_z, n: n.paredes_z },
      perfis_z: { colunas: perfis.colunas, n: perfis.n },
      tipos_abertura: { colunas: a3.secoes.tipos_abertura, n: a3.nLinhas.tipos_abertura },
      aberturas: { colunas: a3.secoes.aberturas, n: a3.nLinhas.aberturas },
      tipos_piso: { colunas: sb.tipos_piso, n: nb.tipos_piso },
      tipos_laje: { colunas: sb.tipos_laje, n: nb.tipos_laje },
      camadas_piso: { colunas: sb.camadas_piso, n: nb.camadas_piso },
      camadas_laje: { colunas: sb.camadas_laje, n: nb.camadas_laje },
      pisos: { colunas: sb.pisos, n: nb.pisos },
      lajes: { colunas: sb.lajes, n: nb.lajes },
      contornos_estaticos: { colunas: sb.contornos_estaticos, n: nb.contornos_estaticos },
      contornos_vinculados: { colunas: sb.contornos_vinculados, n: nb.contornos_vinculados },
      furos_nivel: { colunas: sb.furos_nivel, n: nb.furos_nivel },
      niveis: { colunas: sb.niveis, n: nb.niveis },
      paredes_z_juncao: { colunas: b3.secoes.paredes_z_juncao, n: b3.nLinhas.paredes_z_juncao },
      perfis_z_juncao: { colunas: b3.secoes.perfis_z_juncao, n: b3.nLinhas.perfis_z_juncao },
      faixas_juncao: { colunas: b3.secoes.faixas_juncao, n: b3.nLinhas.faixas_juncao },
      pontos_faixas_juncao: { colunas: b3.secoes.pontos_faixas_juncao, n: b3.nLinhas.pontos_faixas_juncao },
    })),
  );
  cenas.push(cena);
  return { cena, a1, b };
}

/**
 * Compara a junção de cada pavimento do projeto (Rust x TypeScript) e devolve os fatos de fronteira observados nas peças do pavimento de baixo:
 * pares de peças cujo recobrimento de cota é exatamente `Z_EPS` e pares de cotas (extremos de peças) cuja diferença é exatamente `Z_EPS`.
 */
function compararFronteira(p: Project, levelId: string): { divergencias: string[]; recobrimentosExatos: number; diferencasExatas: number; juncao: JuncaoB3 } {
  if (!ger) throw new Error('sem o binário do kernel');
  const { cena, a1, b } = cenaDe(p);
  const ref = referenciaB3(p, levelId, b, a1);
  const rust = decodificarB3(cena.consultar('junction_nivel', argumentosB3(p, levelId, b)));
  const cmp = compararB3(ref, rust, { k0049: K_B3_0049 });
  const faixas = rust.cortadores.flatMap((c) => c.pecas).map((pc) => pc.faixa).filter((f): f is readonly [number, number] => f !== null);
  let recobrimentosExatos = 0;
  for (let i = 0; i < faixas.length; i++) for (let j = i + 1; j < faixas.length; j++) {
    if (Math.min(faixas[i]![1], faixas[j]![1]) - Math.max(faixas[i]![0], faixas[j]![0]) === Z_EPS) recobrimentosExatos++;
  }
  const extremos = [...new Set(faixas.flat())];
  let diferencasExatas = 0;
  for (const u of extremos) for (const v of extremos) if (u - v === Z_EPS) diferencasExatas++;
  return { divergencias: cmp.divergencias, recobrimentosExatos, diferencasExatas, juncao: rust };
}

describe.skipIf(!bytes)('B3 na fronteira de Z_EPS: junction_nivel do Rust x junctionLevel do TypeScript', () => {
  const pula = (): boolean => ger === null;

  // (a) recobrimento de cota: a parede do térreo vai de 0 a 2,8 m; o piso de cima vai de (elevação - 0,1) até a elevação. Com a elevação em Z_EPS, o
  // recobrimento é min(2,8; Z_EPS) - max(0; Z_EPS - 0,1) = Z_EPS, exatamente.
  for (const [rotulo, delta] of [['igual a Z_EPS', 0], ['Z_EPS + 1e-12', 1e-12], ['Z_EPS - 1e-12', -1e-12]] as const) {
    it(`(a) recobrimento de cota da parede e do piso de cima ${rotulo}: Rust e TypeScript dão a mesma junção`, () => {
      if (pula()) return;
      const p = projetoDeFronteira(Z_EPS + delta);
      const r = compararFronteira(p, 'l0');
      expect(r.divergencias, r.divergencias.slice(0, 3).join(' | ')).toEqual([]);
      if (delta === 0) expect(r.recobrimentosExatos, 'o caso exato precisa existir na cena').toBeGreaterThan(0);
    });
  }

  // (b) diferença de cota entre os dois pavimentos (0 e a elevação do de cima): exatamente Z_EPS no caso central; o corte de cota de largura Z_EPS
  // entre a base da parede e a face do piso de cima é descartado pela junção.
  for (const [rotulo, delta] of [['igual a Z_EPS', 0], ['Z_EPS + 1e-12', 1e-12], ['Z_EPS - 1e-12', -1e-12]] as const) {
    it(`(b) diferença de cota entre dois níveis ${rotulo}: Rust e TypeScript dão a mesma junção nos dois pavimentos`, () => {
      if (pula()) return;
      const p = projetoDeFronteira(Z_EPS + delta);
      for (const l of ['l0', 'l1']) {
        const r = compararFronteira(p, l);
        expect(r.divergencias, `${l}: ${r.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
        if (delta === 0 && l === 'l0') expect(r.diferencasExatas, 'a diferença exata de cota precisa existir na cena').toBeGreaterThan(0);
      }
    });
  }
});
