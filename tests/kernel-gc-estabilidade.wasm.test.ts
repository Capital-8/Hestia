import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import { beforeAll, describe, expect, it } from 'vitest';
import { definirGerenciadorDoGuardaCorpo, servicoGuardaCorpo } from '../packages/engine/src/kernelGuardaCorpoServico.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';
import { cicloCompleto, heapAposColeta, inserirEscadas, novoContexto, predioSintetico, soltarContexto } from './helpers/estabilidadeEscadas.ts';

/**
 * Estabilidade de escadas com guarda-corpo sobre o Rust REAL (mesmo cenário de `estabilidade-escadas.test.ts`): o guarda-corpo hospedado dos dois lados
 * entra na 3D, nos cortes e nas elevações, no mover/copiar, no desfazer/refazer e no IFC. Sem exceção, passo mais longo < 2 s por ciclo, resultado
 * igual em duas execuções e heap estável em ciclos repetidos.
 */
setFlagsFromString('--expose-gc');
(globalThis as { gc?: () => void }).gc ??= runInNewContext('gc') as () => void;

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;
beforeAll(async () => {
  if (!bytes) return;
  ger = await GerenciadorKernelV2.dosBytes(bytes).catch(() => null);
});

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

describe.skipIf(!bytes)('estabilidade de escadas com guarda-corpo (Rust real)', () => {
  it('ciclos repetidos: sem exceção, sem bloqueio longo, determinístico e sem vazamento', () => {
    expect(ger).not.toBeNull();
    definirGerenciadorDoGuardaCorpo(() => ger);
    const a = executar(5);
    expect(a.maior).toBeLessThan(2000);
    servicoGuardaCorpo().encerrar();
    const b = executar(3);
    expect(b.resumos.slice(0, 3)).toEqual(a.resumos.slice(0, 3));
    if (a.heaps[0]) {
      const base = a.heaps[1]!;
      const fim = a.heaps[a.heaps.length - 1]!;
      expect(fim).toBeLessThan(Math.max(base * 1.4, base + 60 * 1024 * 1024));
    }
    servicoGuardaCorpo().encerrar();
  }, 170_000);
});
