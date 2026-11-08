/**
 * Término por camada da parede (decisão 0054): o Rust (`pisos_lajes_com_paredes` da B2 e `junction_nivel` da B3) x o motor TypeScript, nos casos de
 * borda: substrato só de um lado, parede sem a função pedida (fallback), eixo, face do meio, deslocamento positivo e negativo, L, T e cruz,
 * perímetro externo, laje estática, parede com topo anexado abaixo da laje e parede com o topo em rampa. Mesmo critério da B2 e da B3 (identidade e
 * campos a 1e-6, polígonos por canonicalização e diferença simétrica sob 1e-6 m², 0049 com o K delas). Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { Project } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { quantifyFloors, quantifyFloorsTs } from '../packages/engine/src/floorQuantities.ts';
import { instalarDespachoKernel, removerDespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { quantifyLevel, quantifyLevelTs } from '../packages/engine/src/quantities.ts';
import { resolveLevelTs } from '../packages/engine/src/resolve.ts';
import { quantifySlabs, quantifySlabsTs } from '../packages/engine/src/slabQuantities.ts';
import { montarCenaA1 } from '../packages/engine/src/kernelA1.ts';
import { montarCenaA3 } from '../packages/engine/src/kernelA3.ts';
import { montarPerfisA3d } from '../packages/engine/src/kernelA3d.ts';
import { argumentosB2, decodificarB2, montarCenaB1, referenciaB2 } from '../packages/engine/src/kernelB.ts';
import { argumentosB3, decodificarB3, montarCenaB3, referenciaB3 } from '../packages/engine/src/kernelB3.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { fonteDeSecoes } from '../packages/geom/src/kernel/v2/quadros.ts';
import { compararB1, compararB3 } from '../scripts/kernel-harness-b.mts';
import { BASE, GRADE, efeitoLaje, efeitoParede, efeitoPiso } from './kernel-grade-limites.ts';
import { casosDoTermino } from './termino-camada-casos.ts';

/** Os mesmos `K` aprovados na B2 (0,08) e na B3 (0,14). */
const K_B2 = 0.08;
const K_B3 = 0.14;

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

/** A cena da B3 (cota do término por camada nas seções base, variante da junção em `*_juncao`). */
const cenaDe = (p: Project) => {
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
  return { cena, a1, b };
};

describe.skipIf(!bytes)('término por camada da parede: Rust x TypeScript', () => {
  const casos = casosDoTermino();
  let mudaram = 0;
  let comVence = 0;

  for (const { nome, p } of casos) {
    it(`${nome}: camadas (B2) e junção (B3) iguais`, () => {
      if (ger === null) return;
      const { cena, a1, b } = cenaDe(p);
      try {
        for (const l of p.levels) {
          const ref = referenciaB2(p, l.id, b);
          const rust = decodificarB2(cena.consultar('pisos_lajes_com_paredes', argumentosB2(p, l.id, b)));
          const cmp = compararB1(ref, rust, { k0049: K_B2 });
          expect(cmp.divergencias, `${nome} ${l.id} (B2): ${cmp.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
          for (const e of ref) for (const c of e.camadas) if (c.venceParede) comVence++;
          // a camada com `{ camada }` mudou de fato com as paredes (não ficou no contorno do elemento)
          rust.forEach((e) => e.camadas.forEach((c) => { if (c.venceParede && Math.abs(areaDaForma(c.poligono) - areaDaForma(e.poligono)) > 1e-6) mudaram++; }));
          const refJ = referenciaB3(p, l.id, b, a1);
          const rustJ = decodificarB3(cena.consultar('junction_nivel', argumentosB3(p, l.id, b)));
          const cmpJ = compararB3(refJ, rustJ, { k0049: K_B3 });
          expect(cmpJ.divergencias, `${nome} ${l.id} (B3): ${cmpJ.divergencias.slice(0, 3).join(' | ')}`).toEqual([]);
        }
      } finally {
        cena.destruir();
      }
    }, 120_000);
  }

  it('quantidades (B6): o Rust conserva o volume da camada que vence a parede, no critério da B6 (1e-6 mais o efeito de grade)', () => {
    if (ger === null) return;
    const violacoes: string[] = [];
    let comparadas = 0;
    for (const { nome, p } of casos) {
      const niveis = p.levels.map((l) => l.id);
      const refs = niveis.map((levelId) => ({ levelId, paredes: quantifyLevelTs(p, resolveLevelTs(p, levelId)), pisos: quantifyFloorsTs(p, levelId), lajes: quantifySlabsTs(p, levelId) }));
      instalarDespachoKernel({ gerenciador: () => ger, config: () => ({ fatiaA: false, fatiaB: true, sombra: false }) });
      const rust = refs.map((r) => ({ paredes: quantifyLevel(p, resolveLevelTs(p, r.levelId)), pisos: quantifyFloors(p, r.levelId), lajes: quantifySlabs(p, r.levelId) }));
      removerDespachoKernel();
      const pendentes: Array<{ rotulo: string; d: number; limite: () => number }> = [];
      const perto = (rotulo: string, a: number, b: number, limite: () => number): void => {
        comparadas++;
        const d = Math.abs(a - b);
        if (d > BASE) pendentes.push({ rotulo, d, limite });
      };
      refs.forEach((r, k) => {
        const nivel = { p, levelId: r.levelId };
        r.paredes.layers.forEach((l, i) => perto(`${nome} ${r.levelId} parede ${l.wallId}/${l.layerIndex}`, rust[k]!.paredes.layers[i]!.volume, l.volume, () => efeitoParede(nivel, l.wallId, l.layerIndex, true)));
        r.pisos.layers.forEach((l, i) => perto(`${nome} ${r.levelId} piso ${l.floorId}/${l.layerIndex}`, rust[k]!.pisos.layers[i]!.volume, l.volume, () => efeitoPiso(nivel, l.floorId, l.layerIndex, true)));
        r.lajes.layers.forEach((l, i) => perto(`${nome} ${r.levelId} laje ${l.slabId}/${l.layerIndex}`, rust[k]!.lajes.layers[i]!.volume, l.volume, () => efeitoLaje(nivel, l.slabId, l.layerIndex, true)));
      });
      for (const q of pendentes) {
        const limite = BASE + GRADE * q.limite();
        if (!(q.d <= limite)) violacoes.push(`${q.rotulo}: diferença ${q.d} acima de ${limite}`);
      }
    }
    expect(violacoes.slice(0, 8)).toEqual([]);
    expect(comparadas).toBeGreaterThan(500);
  }, 280_000);

  it('cobertura: as camadas com o término por camada existem e mudaram a região', () => {
    if (ger === null) return;
    expect(comVence, 'camadas que vencem a parede').toBeGreaterThan(100);
    expect(mudaram, 'camadas que mudaram com as paredes').toBeGreaterThan(50);
  });
});
