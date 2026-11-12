import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import { describe, expect, it } from 'vitest';
import { cicloCompleto, heapAposColeta, inserirEscadas, novoContexto, predioSintetico, soltarContexto } from './helpers/estabilidadeEscadas.ts';

/**
 * Estabilidade de escadas em escala reduzida (prédio sintético de 4 níveis de alturas diferentes): retas, L, U e livres, com e sem acabamento e
 * bocel, guarda-corpo dos dois lados, sobrepostas e ligando níveis não vizinhos. Cada ciclo abre 3D, plantas, cortes e as 4 elevações (com ocultar e
 * isolar), move e copia em lote, desfaz e refaz, salva, reabre e exporta IFC. Confere: sem exceção, nenhum passo bloqueia mais de 2 s, o resultado é
 * o mesmo em duas execuções e a memória não cresce sem limite em ciclos repetidos. Aqui o kernel Rust não está carregado (só o TypeScript); o guarda-corpo
 * real é coberto em `kernel-gc-estabilidade.wasm.test.ts`, com o mesmo cenário.
 */
setFlagsFromString('--expose-gc');
(globalThis as { gc?: () => void }).gc ??= runInNewContext('gc') as () => void;

const LIMITE_PASSO_MS = 2000;

function executar(ciclos: number): { resumos: string[]; maior: number; heaps: number[] } {
  const store = predioSintetico(4);
  const ins = inserirEscadas(store, { porNivel: 2, longas: 1, sobrepostas: true });
  const ctx = novoContexto();
  const resumos: string[] = [];
  const heaps: number[] = [];
  let maior = 0;
  for (let i = 0; i < ciclos; i++) {
    const r = cicloCompleto(store, ctx, ins, i);
    resumos.push(r.resumo);
    maior = Math.max(maior, r.maiorPasso);
    heaps.push(heapAposColeta());
  }
  soltarContexto(ctx);
  return { resumos, maior, heaps };
}

describe('estabilidade de escadas (escala reduzida)', () => {
  it('ciclos repetidos: sem exceção, sem bloqueio longo, determinístico e sem vazamento', () => {
    const a = executar(5);
    if (process.env['ESTAB_LOG']) console.log('heap MB', a.heaps.map((h) => Math.round(h / 1048576)).join(' '), 'maior passo', a.maior.toFixed(0));
    expect(a.maior).toBeLessThan(LIMITE_PASSO_MS);
    // O projeto volta ao mesmo estado a cada ciclo; só a rodada (deslocamento da cópia) muda o resumo das edições, então os ciclos de mesma rodada coincidem.
    const b = executar(3);
    expect(b.resumos.slice(0, 3)).toEqual(a.resumos.slice(0, 3));
    // Memória: depois do aquecimento (2 ciclos) o heap não pode crescer mais de 40% nem 40 MB nos 3 ciclos seguintes.
    if (a.heaps[0]) {
      const base = a.heaps[1]!;
      const fim = a.heaps[a.heaps.length - 1]!;
      expect(fim).toBeLessThan(Math.max(base * 1.4, base + 40 * 1024 * 1024));
    }
  }, 110_000);
});
