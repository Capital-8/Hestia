/**
 * Regressão: o corte pedido pelo protocolo do worker (transferência de buffers, estado incremental por vista) com o Rust ligado não pode sair
 * vazio na segunda chamada. Roda em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { multiArea } from '@hestia/geom';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { syntheticProject } from '../packages/engine/src/fixtureSintetica.ts';
import { iniciarDespachoKernel, removerDespachoKernel } from '../packages/engine/src/kernelDespacho.ts';
import { instalarServidor } from '../packages/engine/src/worker/servidor.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import type { SectionResult } from '../packages/engine/src/section.ts';
import { ProjectStore } from '@hestia/model';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
afterEach(() => undefined);
afterAll(() => removerDespachoKernel());

describe.skipIf(!bytes)('corte pelo executor do worker, Rust ligado', () => {
  it('duas chamadas seguidas (partes incrementais reaproveitadas) após clonar com transferência: ambas não vazias', async () => {
    await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => bytes!); // o caminho de produção (v1 exigido)
    const store = new ProjectStore(syntheticProject(2));
    store.exec({ type: 'addView', view: { id: 'sv', name: 'Corte', kind: 'section', a: { x: 6, y: -1 }, b: { x: 6, y: 13 }, depth: 6 } } as never);
    const p = store.project;
    const vista = p.views.find((v) => v.kind === 'section')!;
    const respostas: Array<{ id: number; resultado: SectionResult | null; erro: string | null }> = [];
    const escopo = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      postMessage: (m: unknown, transfer?: Transferable[]) => void respostas.push(structuredClone(m, { transfer }) as never),
    };
    instalarServidor(escopo as never);
    for (let i = 0; i < 3; i++) {
      escopo.onmessage!({ data: { id: i, tipo: 'corte', nivel: vista.id, projeto: { versao: 1, estrutura: p }, kernelV2: { fatiaA: true, fatiaB: true, sombra: false } } });
      for (let k = 0; k < 100 && respostas.length <= i; k++) await new Promise((r) => setTimeout(r, 20));
      const r = respostas[i]!;
      expect(r.erro, `chamada ${i}`).toBeNull();
      expect(r.resultado!.cut.length, `chamada ${i}`).toBeGreaterThan(0);
      expect(multiArea(r.resultado!.silhouette), `chamada ${i}`).toBeGreaterThan(0);
    }
  });
});
