/**
 * Helpers compartilhados pelos testes da A2 (`kernel-a2*.wasm.test.ts`): cena do Rust, cobertura e comparação com o motor TypeScript.
 * Não é arquivo de teste (não casa com `tests/kernel-a*.wasm.test.ts`); cada arquivo de teste carrega o próprio binário e passa o gerenciador.
 */
import { expect } from 'vitest';
import { intersection } from '@hestia/geom';
import { type Id, type Project } from '@hestia/model';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { argumentosA2, decodificarA2, referenciaA2, type OpcoesA2 } from '../packages/engine/src/kernelA2.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { type GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararA2, areaDaForma } from '../scripts/kernel-harness-a2.mts';

export const cenaDe = (ger: GerenciadorKernelV2, p: Project): { cena: CenaV2; a1: ReturnType<typeof montarCenaA1> } => {
  const a1 = montarCenaA1(p);
  const s = a1.secoes;
  const n = a1.nLinhas;
  const cena = CenaV2.criar(
    ger,
    fonteDeSecoes(() => ({
      paredes: { colunas: s.paredes, n: n.paredes },
      tipos_parede: { colunas: s.tipos_parede, n: n.tipos_parede },
      camadas: { colunas: s.camadas, n: n.camadas },
      faixas: { colunas: s.faixas, n: n.faixas },
      paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro },
      paredes_z: { colunas: s.paredes_z, n: n.paredes_z },
    })),
  );
  return { cena, a1 };
};

export interface Cobertura {
  itens: number;
  comFragmento: number;
  pecas: number;
  faixas: number;
  contorno: number;
  atravessa: number;
  comEnvoltas: number;
  estritos: number;
  tsPerdeuArea: number;
  desvio: number;
}
export const zero = (): Cobertura => ({ itens: 0, comFragmento: 0, pecas: 0, faixas: 0, contorno: 0, atravessa: 0, comEnvoltas: 0, estritos: 0, tsPerdeuArea: 0, desvio: 0 });
export const soma = (a: Cobertura, b: Cobertura): void => {
  for (const k of Object.keys(a) as (keyof Cobertura)[]) a[k] = k === 'desvio' ? Math.max(a[k], b[k]) : a[k] + b[k];
};

/** Opções de planta a testar num pavimento, em função da semente. */
export function variacoes(p: Project, levelId: Id, semente: number): OpcoesA2[] {
  const paredes = Object.values(p.elements).filter((e) => e.kind === 'wall' && e.levelId === levelId).map((e) => e.id);
  const contorno = new Set(paredes.filter((_, i) => (i + semente) % 3 === 0));
  return [{}, { cutZ: 2.0 }, { cutZ: 3.5, outlineWalls: new Set(paredes) }, { outlineWalls: contorno }];
}

/**
 * Compara todos os pavimentos (com as variações de planta) e devolve estatísticas de cobertura.
 * `indices` (opcional) escolhe quais variações rodar (posição em `variacoes`); sem ele, todas. Serve para dividir um caso longo em testes.
 */
export function compararProjeto(ger: GerenciadorKernelV2, p: Project, semente = 0, comVariacoes = true, indices?: number[]): Cobertura {
  const { cena, a1 } = cenaDe(ger, p);
  const cov = zero();
  try {
    for (const l of p.levels) {
      const todas = comVariacoes ? variacoes(p, l.id, semente) : [{}];
      const escolhidas = indices ? todas.filter((_, i) => indices.includes(i)) : todas;
      for (const opcoes of escolhidas) {
        const ref = referenciaA2(p, l.id, a1, opcoes);
        const rust = decodificarA2(cena.consultar('itens_pintados', argumentosA2(p, l.id, a1, opcoes)));
        const cmp = compararA2(ref, rust);
        expect(cmp.divergencias, `${l.id} ${JSON.stringify(opcoes.cutZ ?? null)}: ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
        soma(cov, {
          itens: cmp.itens,
          comFragmento: cmp.comFragmento,
          pecas: cmp.pecas,
          estritos: cmp.estritos,
          tsPerdeuArea: cmp.tsPerdeuArea,
          faixas: ref.filter((i) => i.faixa).length,
          contorno: ref.filter((i) => i.contorno).length,
          atravessa: ref.filter((i) => i.atravessa).length,
          comEnvoltas: ref.filter((i) => i.bruto.length > 1).length,
          desvio: cmp.desvioMaximo,
        });
      }
    }
  } finally {
    cena.destruir();
  }
  return cov;
}

/** Área da interseção aproximada pela soma das áreas menos a união (ambas pelo `ops` do próprio motor TS). */
export function sobreposicao(a: Parameters<typeof areaDaForma>[0], b: Parameters<typeof areaDaForma>[0]): number {
  if (a.length === 0 || b.length === 0) return 0;
  return areaDaForma(intersection(a, b));
}

export { areaDaForma };
