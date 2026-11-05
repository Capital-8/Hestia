/**
 * Regressão do caminho FRIO da fatia A: `resolveLevel` com o kernel Rust ligado (`resolver_nivel`) x `resolveLevelTs` do motor TypeScript,
 * cada um sobre um objeto de projeto NOVO e sem nenhuma chamada TS antes. Os testes do A4 usam o caminho quente (o TS já calculou o projeto),
 * por isso não pegam a divergência em paredes com anexo (`projetoDeEstresseB1(s, { anexos: true })`): faixas do Rust perdem a quebra de cota
 * (ex.: parede bw_1_lv_0_31, camada 2, quebra em 2,8 m). Roda só em `npm run test:wasm`. Os casos sem anexo são controle e devem passar.
 * Sem `it.fails` e sem pular: os casos com anexo falham enquanto o defeito existir.
 */
import { existsSync, readFileSync } from 'node:fs';
import { difference, union, type MultiPolygon } from '@hestia/geom';
import type { Project } from '@hestia/model';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resolveLevel, resolveLevelTs } from '../packages/engine/src/resolve.ts';
import type { LayerBand, ResolvedLevel } from '../packages/engine/src/types.ts';
import { instalarDespachoKernel, removerDespachoKernel, type ConfigDespacho, type DespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { areaDaForma } from '../packages/engine/src/kernelComparaA2.ts';
import { TOLERANCIA_AREA_A3, TOLERANCIA_COORDENADA_A3 } from '../packages/engine/src/kernelComparaA3.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { projetoDeEstresseB1 } from '../scripts/kernel-b1-estresse.mts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null; // binário sem ABI v2 (ainda é o da v1): os testes são pulados
  }
});
afterEach(() => removerDespachoKernel());

const DESPACHO: ConfigDespacho = { fatiaA: true, fatiaB: false, sombra: false };
const instalar = (): DespachoKernel => instalarDespachoKernel({ gerenciador: () => ger, config: () => DESPACHO });

/** Região da camada inteira (união das faixas). */
const formaDas = (bandas: LayerBand[]): MultiPolygon => (bandas.length ? union(...bandas.map((f) => f.poly)) : []);

/** Maior distância de uma cota de um lado (z0 ou z1 de alguma faixa) à cota mais próxima do outro lado. */
function desvioDeCotas(a: LayerBand[], b: LayerBand[]): number {
  const pa = a.flatMap((f) => [f.z0, f.z1]);
  const pb = b.flatMap((f) => [f.z0, f.z1]);
  if (!pa.length || !pb.length) return Math.max(0, ...pa, ...pb);
  const maisProxima = (x: number, lista: number[]): number => Math.min(...lista.map((y) => Math.abs(x - y)));
  return Math.max(...pa.map((x) => maisProxima(x, pb)), ...pb.map((y) => maisProxima(y, pa)));
}

interface Resultado {
  falhas: string[];
  paredes: number;
  bandas: number;
  maxDeltaCota: number;
  maxAreaDiferenca: number;
}

/**
 * Compara parede a parede, camada a camada e faixa (banda) a banda: `z0`/`z1` a 1 µm (`TOLERANCIA_COORDENADA_A3`), presença de topo
 * inclinado e região (diferença simétrica de área a 1e-6 m², `TOLERANCIA_AREA_A3`). Todas as paredes do nível entram (as com anexo entre elas).
 */
function compararFaixas(ts: ResolvedLevel, rust: ResolvedLevel): Resultado {
  const r: Resultado = { falhas: [], paredes: 0, bandas: 0, maxDeltaCota: 0, maxAreaDiferenca: 0 };
  for (const id of Object.keys(ts.walls)) {
    const a = ts.walls[id]!;
    const b = rust.walls[id];
    if (!b) {
      r.falhas.push(`parede ${id}: ausente no Rust`);
      continue;
    }
    r.paredes++;
    const camadasB = new Map(b.layers.map((c) => [c.layerIndex, c]));
    for (const ca of a.layers) {
      const cb = camadasB.get(ca.layerIndex);
      const rot = `parede ${id} (base ${a.baseZ}, altura ${a.height}) camada ${ca.layerIndex}`;
      if (!cb) {
        r.falhas.push(`${rot}: camada ausente no Rust`);
        continue;
      }
      if (ca.bands.length !== cb.bands.length) {
        // Número de faixas diferente: mede o desvio das cotas (cada cota de um lado à mais próxima do outro) e a região da camada inteira.
        const desvio = desvioDeCotas(ca.bands, cb.bands);
        const area = areaDaForma(difference(formaDas(ca.bands), formaDas(cb.bands))) + areaDaForma(difference(formaDas(cb.bands), formaDas(ca.bands)));
        r.maxDeltaCota = Math.max(r.maxDeltaCota, desvio);
        r.maxAreaDiferenca = Math.max(r.maxAreaDiferenca, area);
        r.falhas.push(`${rot}: ${cb.bands.length} faixas (Rust) x ${ca.bands.length} (TS), desvio de cota ${desvio} m [TS ${JSON.stringify(ca.bands.map((f) => [f.z0, f.z1]))}; Rust ${JSON.stringify(cb.bands.map((f) => [f.z0, f.z1]))}]`);
        continue;
      }
      ca.bands.forEach((fa, j) => {
        const fb = cb.bands[j]!;
        r.bandas++;
        const dz0 = Math.abs(fa.z0 - fb.z0);
        const dz1 = Math.abs(fa.z1 - fb.z1);
        r.maxDeltaCota = Math.max(r.maxDeltaCota, dz0, dz1);
        const area = areaDaForma(difference(fa.poly, fb.poly)) + areaDaForma(difference(fb.poly, fa.poly) as MultiPolygon);
        r.maxAreaDiferenca = Math.max(r.maxAreaDiferenca, area);
        const inclinadaA = fa.slope !== undefined;
        const inclinadaB = fb.slope !== undefined;
        if (dz0 > TOLERANCIA_COORDENADA_A3 || dz1 > TOLERANCIA_COORDENADA_A3) r.falhas.push(`${rot} faixa ${j}: [${fb.z0}, ${fb.z1}] (Rust) x [${fa.z0}, ${fa.z1}] (TS), diferença ${Math.max(dz0, dz1)}`);
        else if (inclinadaA !== inclinadaB) r.falhas.push(`${rot} faixa ${j} [${fa.z0}, ${fa.z1}]: topo inclinado ${inclinadaB} (Rust) x ${inclinadaA} (TS)`);
        else if (area > TOLERANCIA_AREA_A3) r.falhas.push(`${rot} faixa ${j} [${fa.z0}, ${fa.z1}]: região, diferença simétrica ${area} m²`);
      });
    }
  }
  return r;
}

const rotuloCaso = (semente: number, anexos: boolean, nivel: number): string => `semente ${semente}, anexos ${anexos}, pavimento ${nivel}`;

/** Casos: sementes 1, 2 e 3 com anexos (o defeito) e 1 e 3 sem anexos (controle). */
const CASOS: Array<{ semente: number; anexos: boolean }> = [
  { semente: 1, anexos: true },
  { semente: 2, anexos: true },
  { semente: 3, anexos: true },
  { semente: 1, anexos: false },
  { semente: 3, anexos: false },
];

describe.skipIf(!bytes)('A3 frio: resolveLevel do Rust x resolveLevelTs, objetos novos e sem aquecimento', () => {
  const pula = (): boolean => ger === null;

  for (const { semente, anexos } of CASOS) {
    const opcoes = { anexos };
    // Os pavimentos são contados em um projeto descartável (a contagem é determinística pela semente).
    const niveis = projetoDeEstresseB1(semente, opcoes).levels.length;
    for (let nivel = 0; nivel < niveis; nivel++) {
      const rotulo = rotuloCaso(semente, anexos, nivel);
      it(`${rotulo}: resolveLevel (fatia A, frio) equivale a resolveLevelTs (frio)`, () => {
        if (pula()) return;
        const d = instalar();
        // Objeto novo para o Rust: nenhuma chamada TS antes da consulta.
        const pRust: Project = projetoDeEstresseB1(semente, opcoes);
        const rust = resolveLevel(pRust, pRust.levels[nivel]!.id, new Map());
        // Segundo objeto novo, também sem aquecimento, para o TypeScript.
        const pTs: Project = projetoDeEstresseB1(semente, opcoes);
        const ts = resolveLevelTs(pTs, pTs.levels[nivel]!.id, new Map());
        const r = compararFaixas(ts, rust);
        const diag = d.diagnostico();
        console.log(`[A3 frio ${rotulo}] paredes ${r.paredes}, faixas ${r.bandas}, maior diferença de cota ${r.maxDeltaCota} m, maior diferença de região ${r.maxAreaDiferenca} m², falhas ${r.falhas.length}, entregues pelo Rust ${diag.entreguesPeloRust}`);
        expect(r.falhas.slice(0, 5), `${rotulo}: ${r.falhas.length} divergências`).toEqual([]);
        // Mais de uma entrega é possível (a montagem da cena consulta outros níveis); o que importa é o nível pedido sair do Rust.
        expect(diag.entreguesPeloRust, `${rotulo}: o nível tem de sair do Rust (senão o teste é vazio)`).toBeGreaterThan(0);
        expect(diag.voltasLeves + diag.voltasGraves, `${rotulo}: voltas ao TS`).toBe(0);
      }, 120_000);
    }
  }
});
