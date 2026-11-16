import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createEmptyProject, makeLevel, ProjectStore, type Project } from '@hestia/model';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../../geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../../geom/src/kernel/v2/gerenciador.ts';
import { massaM5Bulbo, massaM5Petala } from './fixtureMassa.ts';
import { ServicoMassa } from './massaServico.ts';

/**
 * Tempo das consultas da massa sobre o kernel Rust REAL, na flor de 12 pétalas (M5: bulbo e pétala em arranjo de 12), PLANO.md A.8 item 5.
 * Roda em `npm run test:perf` (vitest.perf.config.ts), um arquivo por vez, e IMPRIME a mediana de cada consulta.
 *
 * Alvos do plano: `massa_malha` lod 1 ≤ 50 ms, `massa_corte` ≤ 50 ms, `massa_planta` ≤ 10 ms. O que reprova é o DOBRO do alvo (100, 100 e 20 ms):
 * o limite generoso existe para a medida não oscilar com a carga da máquina; ele não vale como meta, e o relatório da ficha traz os tempos exatos.
 * Medida: mediana de 15 chamadas, descartada a primeira (que compila e envia a cena). A memória de respostas do serviço é limpa antes de cada
 * chamada, para medir o kernel e a decodificação, não o cache.
 */
const AMOSTRAS = 15;
const LIMITES_MS = { malhaLod1: 100, corte: 100, planta: 20 } as const;
const ALVOS_MS = { malhaLod1: 50, corte: 50, planta: 10 } as const;

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (bytes) ger = await GerenciadorKernelV2.dosBytes(bytes);
});

/** Flor: M5 (bulbo no centro e uma pétala em arranjo polar de 12) nos 11 níveis de 0 a 30 m. */
function projetoFlor(): Project {
  const s = new ProjectStore(createEmptyProject());
  for (let i = 2; i <= 10; i++) s.exec({ type: 'upsertLevel', level: makeLevel({ id: `lv_${i}`, name: `Nível ${i + 1}`, elevation: i * 3 }) });
  s.exec({ type: 'addMass', mass: massaM5Bulbo() });
  s.exec({ type: 'addMass', mass: massaM5Petala() });
  return s.project;
}

const mediana = (v: number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;

/** Chama `f` AMOSTRAS + 1 vezes, descarta a primeira e devolve a mediana em ms. `limpar` zera o cache do serviço antes de cada chamada. */
function medir(limpar: () => void, f: () => unknown): number {
  const tempos: number[] = [];
  for (let i = 0; i <= AMOSTRAS; i++) {
    limpar();
    const t = performance.now();
    const r = f();
    const dt = performance.now() - t;
    expect(r).not.toBeNull();
    if (i > 0) tempos.push(dt);
  }
  return mediana(tempos);
}

describe('massa: tempo da flor de 12 pétalas no kernel WASM real', () => {
  it('o wasm do kernel existe e carregou', () => {
    expect(bytes).not.toBeNull();
    expect(ger).not.toBeNull();
  });

  it('massa_malha lod 1, massa_corte e massa_planta dentro do dobro do alvo (mediana impressa)', () => {
    const p = projetoFlor();
    const srv = new ServicoMassa(() => ger);
    const limpar = (): void => srv['memo'].clear();
    const malha = medir(limpar, () => srv.malha(p, null, 1));
    const corte = medir(limpar, () => srv.corte(p, null, -20, 0, 1, 0, 30));
    const planta = medir(limpar, () => srv.planta(p, null, 1.2, 0, 2.5));
    const m = srv.malha(p, null, 1)!;
    const linhasCorte = srv.corte(p, null, -20, 0, 1, 0, 30)!.length;
    const linhasPlanta = srv.planta(p, null, 1.2, 0, 2.5)!.length;
    process.stdout.write(
      `[MASSA-TEMPO] flor de 12 pétalas, mediana de ${AMOSTRAS} chamadas (alvo/limite): malha lod 1 ${malha.toFixed(2)} ms (${ALVOS_MS.malhaLod1}/${LIMITES_MS.malhaLod1}, ${m.indices.length / 3} triângulos) | corte ${corte.toFixed(2)} ms (${ALVOS_MS.corte}/${LIMITES_MS.corte}, ${linhasCorte} linhas) | planta ${planta.toFixed(2)} ms (${ALVOS_MS.planta}/${LIMITES_MS.planta}, ${linhasPlanta} linhas)\n`,
    );
    srv.encerrar();
    expect(malha).toBeLessThanOrEqual(LIMITES_MS.malhaLod1);
    expect(corte).toBeLessThanOrEqual(LIMITES_MS.corte);
    expect(planta).toBeLessThanOrEqual(LIMITES_MS.planta);
  });
});
