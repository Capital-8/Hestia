import { describe, expect, it } from 'vitest';
import { computeSection } from '@hestia/engine';
import { VISTA_AQUECIMENTO_CORTE, VISTA_AQUECIMENTO_ELEVACAO, aquecerCorteNoWorker, projetoDeAquecimento, temParedeInclinada } from './aquecimentoCorte.ts';

describe('aquecimento do corte (etapa W)', () => {
  it('projeto sintético tem parede inclinada, vãos e as duas vistas; calcula sem erro', () => {
    const p = projetoDeAquecimento();
    expect(temParedeInclinada(p)).toBe(true);
    for (const id of [VISTA_AQUECIMENTO_CORTE, VISTA_AQUECIMENTO_ELEVACAO]) {
      const v = p.views.find((x) => x.id === id)!;
      const r = computeSection(p, { a: v.a, b: v.b, depth: v.depth });
      expect(r.cut.length + r.beyond.length).toBeGreaterThan(0);
    }
  });
  it('pede seção e depois elevação, cada uma no seu turno ocioso', async () => {
    const pedidos: string[] = [];
    const cliente = { resolver: (_t: string, id: string) => { pedidos.push(id); return Promise.resolve(null); } };
    const turnos: Array<() => void> = [];
    const fim = aquecerCorteNoWorker(cliente as never, (f) => turnos.push(f));
    expect(pedidos).toEqual([]);
    turnos.shift()!();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(pedidos).toEqual([VISTA_AQUECIMENTO_CORTE]);
    turnos.shift()!();
    await fim;
    expect(pedidos).toEqual([VISTA_AQUECIMENTO_CORTE, VISTA_AQUECIMENTO_ELEVACAO]);
  });
});
