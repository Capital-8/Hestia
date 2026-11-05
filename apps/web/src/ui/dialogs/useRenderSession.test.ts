import { describe, expect, it } from 'vitest';
import type { StatusJobNativo } from '../../editor/render/nativeClient.ts';
import { aplicarStatus } from './useRenderSession.ts';
import { transicionar, type EstadoSessao } from './renderSessao.ts';

const renderizando = (): EstadoSessao =>
  transicionar({ tipo: 'ocioso' }, { tipo: 'iniciar', total: 0 });

const base = (extra: Partial<StatusJobNativo> = {}): StatusJobNativo => ({
  fase: 'render',
  fracao: 0,
  pronto: false,
  cancelado: false,
  erro: null,
  ...extra,
});

const tile = (i: number) => ({ i, x: 0, y: 0, w: 1, h: 1 });

describe('aplicarStatus', () => {
  it('T1: tiles concluidos 2 de total 5 viram renderizando com 2 de 5', () => {
    const estado = aplicarStatus(
      renderizando(),
      base({ tiles: { total: 5, concluidos: [tile(0), tile(1)] } }),
    );
    expect(estado).toMatchObject({ tipo: 'renderizando', concluidos: 2, total: 5 });
  });

  it('T2: status sem tiles (serviço antigo) mantém renderizando sem alterar concluidos', () => {
    const inicial = transicionar(renderizando(), {
      tipo: 'tile',
      concluidos: 1,
      total: 4,
    });
    const estado = aplicarStatus(inicial, base({ fracao: 0.7 }));
    expect(estado).toBe(inicial);
    expect(estado).toMatchObject({ tipo: 'renderizando', concluidos: 1, total: 4 });
  });

  it('T3: status com erro vira erro com a mensagem', () => {
    const estado = aplicarStatus(renderizando(), base({ erro: 'GPU perdida' }));
    expect(estado).toEqual({ tipo: 'erro', mensagem: 'GPU perdida' });
  });

  it('T4: status cancelado vira cancelado', () => {
    const estado = aplicarStatus(renderizando(), base({ cancelado: true }));
    expect(estado).toEqual({ tipo: 'cancelado' });
  });

  it('T5: pronto:false com tiles total 0 não quebra e não avança', () => {
    const inicial = renderizando();
    const estado = aplicarStatus(
      inicial,
      base({ pronto: false, tiles: { total: 0, concluidos: [] } }),
    );
    expect(estado).toMatchObject({ tipo: 'renderizando', concluidos: 0, total: 0 });
  });
});
