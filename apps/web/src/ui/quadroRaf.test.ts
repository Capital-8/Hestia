import { describe, expect, it } from 'vitest';
import {
  criarCoalescedorDeDeltas,
  criarPedidoDeQuadro,
  memoizarVisibilidade,
  resumoDeVisibilidade,
  type AgendadorDeQuadro,
} from './quadroRaf.ts';

/** Agendador de teste: guarda os pedidos e só roda quando o teste manda (nenhum DOM, nenhum timer). */
function agendadorDeTeste(): AgendadorDeQuadro & { rodar(): void; pedidos(): number[]; cancelados: number[] } {
  let seq = 0;
  const fila = new Map<number, () => void>();
  const cancelados: number[] = [];
  return {
    agendar(fn) {
      const id = ++seq;
      fila.set(id, fn);
      return id;
    },
    cancelar(id) {
      cancelados.push(id);
      fila.delete(id);
    },
    rodar() {
      const pendentes = [...fila.entries()];
      fila.clear();
      for (const [, fn] of pendentes) fn();
    },
    pedidos: () => [...fila.keys()],
    cancelados,
  };
}

describe('coalescência de deslocamentos (órbita/pan)', () => {
  it('vários movimentos no mesmo quadro viram um único pedido e uma única aplicação', () => {
    const ag = agendadorDeTeste();
    const aplicados: Array<[number, number]> = [];
    let desenhos = 0;
    const c = criarCoalescedorDeDeltas((dx, dy) => aplicados.push([dx, dy]), ag, () => desenhos++);

    c.acumular(4, 0);
    c.acumular(3, -2);
    c.acumular(1, 1);
    expect(ag.pedidos()).toHaveLength(1);
    expect(c.pendente()).toBe(true);

    ag.rodar();
    expect(aplicados).toEqual([[8, -1]]);
    expect(desenhos).toBe(1);
    expect(c.pendente()).toBe(false);
  });

  it('quadro sem movimento não aplica nada nem pede outro quadro', () => {
    const ag = agendadorDeTeste();
    const aplicados: Array<[number, number]> = [];
    const c = criarCoalescedorDeDeltas((dx, dy) => aplicados.push([dx, dy]), ag);

    expect(c.quadro()).toBe(false);
    expect(ag.pedidos()).toHaveLength(0);
    expect(aplicados).toEqual([]);
    expect(c.pendente()).toBe(false);
  });

  it('soltar cancela o quadro pendente e aplica o restante uma só vez', () => {
    const ag = agendadorDeTeste();
    const aplicados: Array<[number, number]> = [];
    const c = criarCoalescedorDeDeltas((dx, dy) => aplicados.push([dx, dy]), ag);

    c.acumular(2, 3);
    const restante = c.soltar();
    expect(restante).toEqual({ dx: 2, dy: 3 });
    expect(ag.cancelados).toHaveLength(1);
    expect(c.pendente()).toBe(false);

    // O quadro cancelado não roda; soltar de novo não reaplica (nada acumulado).
    ag.rodar();
    expect(c.soltar()).toBeNull();
    expect(aplicados).toEqual([[2, 3]]);
  });

  it('acumular depois de soltar agenda outro quadro e soma só o novo trecho', () => {
    const ag = agendadorDeTeste();
    const aplicados: Array<[number, number]> = [];
    const c = criarCoalescedorDeDeltas((dx, dy) => aplicados.push([dx, dy]), ag);

    c.acumular(1, 1);
    ag.rodar();
    c.acumular(-5, 2);
    ag.rodar();
    expect(aplicados).toEqual([[1, 1], [-5, 2]]);
  });
});

describe('pedido de quadro adiado (gesto que já aplica geometria por evento)', () => {
  it('vários pedidos no mesmo quadro viram um único desenho', () => {
    const ag = agendadorDeTeste();
    let desenhos = 0;
    const p = criarPedidoDeQuadro(ag, () => desenhos++);
    p.pedir();
    p.pedir();
    p.pedir();
    expect(ag.pedidos()).toHaveLength(1);
    ag.rodar();
    expect(desenhos).toBe(1);
    expect(p.pendente()).toBe(false);
  });

  it('soltar cancela o pedido pendente; sem pedido, devolve false', () => {
    const ag = agendadorDeTeste();
    let desenhos = 0;
    const p = criarPedidoDeQuadro(ag, () => desenhos++);
    expect(p.soltar()).toBe(false);
    p.pedir();
    expect(p.soltar()).toBe(true);
    ag.rodar();
    expect(desenhos).toBe(0);
    expect(p.pendente()).toBe(false);
  });
});

describe('memoização da visibilidade da vista', () => {
  const projeto = { id: 'p1' };
  const temp = { hidden: { elements: ['a'] } };
  const chave = { projeto, campos: 'plan|floor|lv_0|||', temp };

  it('reaproveita o valor quando projeto, campos e temporário são os mesmos', () => {
    let calculos = 0;
    const calcular = () => {
      calculos++;
      return { hidden: new Set(['a']) };
    };
    const primeira = memoizarVisibilidade(null, chave, calcular);
    const segunda = memoizarVisibilidade(primeira, { ...chave }, calcular);
    expect(segunda).toBe(primeira);
    expect(segunda.valor).toBe(primeira.valor);
    expect(calculos).toBe(1);
  });

  it('recalcula quando muda o projeto, os campos da vista ou o objeto de viewTemp', () => {
    let calculos = 0;
    const calcular = () => ({ n: ++calculos });
    const a = memoizarVisibilidade(null, chave, calcular);
    const outroProjeto = memoizarVisibilidade(a, { ...chave, projeto: { id: 'p2' } }, calcular);
    const outrosCampos = memoizarVisibilidade(outroProjeto, { ...chave, projeto: { id: 'p2' }, campos: '3d|||||' }, calcular);
    const outroTemp = memoizarVisibilidade(outrosCampos, { ...chave, projeto: { id: 'p2' }, campos: '3d|||||', temp: { reveal: true } }, calcular);
    expect(outroProjeto.valor.n).toBe(2);
    expect(outrosCampos.valor.n).toBe(3);
    expect(outroTemp.valor.n).toBe(4);
    expect(calculos).toBe(4);
  });

  it('o resumo dos campos distingue tipo de vista, nível, planta, corte, prancha e face', () => {
    const base = { view: 'plan', levelId: 'lv_1', planKind: 'floor' as const };
    const r = resumoDeVisibilidade(base);
    expect(resumoDeVisibilidade({ ...base })).toBe(r);
    expect(resumoDeVisibilidade({ ...base, levelId: 'lv_2' })).not.toBe(r);
    expect(resumoDeVisibilidade({ ...base, planKind: 'area' })).not.toBe(r);
    expect(resumoDeVisibilidade({ ...base, planViewId: 'pv_1' })).not.toBe(r);
    expect(resumoDeVisibilidade({ view: '3d', levelId: 'lv_1' })).not.toBe(r);
    expect(resumoDeVisibilidade({ view: 'section', levelId: 'lv_1', sectionId: 's_1' })).not.toBe(r);
    expect(resumoDeVisibilidade({ view: 'sheet', levelId: 'lv_1', sheetId: 'sh_1' })).not.toBe(r);
    expect(resumoDeVisibilidade({ view: 'face', levelId: 'lv_1', faceView: { elementId: 'w1', face: 'front', layer: 'all' } }))
      .not.toBe(resumoDeVisibilidade({ view: 'face', levelId: 'lv_1', faceView: { elementId: 'w1', face: 'back', layer: 'all' } }));
  });

  it('o resumo cobre a disciplina pessoal, a vista 3D salva e a liberação de edição (a visibilidade das disciplinas depende deles)', () => {
    const base = { view: '3d', levelId: 'lv_1' };
    const r = resumoDeVisibilidade(base);
    // campo ausente vale o mesmo que o valor "vazio"
    expect(resumoDeVisibilidade({ ...base, view3dViewId: null, minhaDisciplina: null, liberarEdicao: false })).toBe(r);
    expect(resumoDeVisibilidade({ ...base, view3dViewId: 'v3_1' })).not.toBe(r);
    expect(resumoDeVisibilidade({ ...base, view3dViewId: 'v3_1' })).not.toBe(resumoDeVisibilidade({ ...base, view3dViewId: 'v3_2' }));
    expect(resumoDeVisibilidade({ ...base, minhaDisciplina: 'structure' })).not.toBe(r);
    expect(resumoDeVisibilidade({ ...base, minhaDisciplina: 'structure' })).not.toBe(resumoDeVisibilidade({ ...base, minhaDisciplina: 'mep' }));
    expect(resumoDeVisibilidade({ ...base, liberarEdicao: true })).not.toBe(r);
  });
});
