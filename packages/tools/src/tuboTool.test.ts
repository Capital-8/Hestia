import { beforeEach, describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent, type Component, type Familia, type Ligacao } from '@hestia/model';
import { FAMILIA_TUBO_PADRAO, opcoesTubo } from './tuboTool.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

const lig = (id: string, posicao: [string, string, string], direcao: [string, string, string]): Ligacao => ({
  id,
  nome: id,
  dominio: 'esgoto',
  secao: 'redonda',
  posicao,
  direcao,
  diametro: 'DN',
  fluxo: 'ambos',
});

/** Fixture: tubo mínimo (varredura reta de Ø DN e comprimento L, ao longo de Z local) com as duas ligações nas pontas. */
const FAMILIA_TUBO: Familia = {
  ...structuredClone(FAMILIA_ARMARIO),
  id: FAMILIA_TUBO_PADRAO,
  nome: 'Tubo reto',
  pecas: [],
  ferragens: [],
  conectores: [],
  planos: [],
  escolhas: [],
  tipos: [],
  tipoPadrao: undefined,
  // `L`, `A` e `P` são obrigatórios em toda família: aqui `L` é o comprimento do tubo e `A`/`P` ficam como vêm do armário.
  parametros: [
    ...FAMILIA_ARMARIO.parametros.filter((q) => ['L', 'A', 'P'].includes(q.id)).map((q) => (q.id === 'L' ? ({ id: 'L', nome: 'Comprimento', tipo: 'comprimento', escopo: 'instancia', padrao: 1000 } as const) : q)),
    { id: 'DN', nome: 'Diâmetro nominal', tipo: 'comprimento', escopo: 'instancia', padrao: 50 },
  ],
  corpos: [
    {
      id: 'tubo',
      nome: 'Tubo',
      papel: 'tubo',
      forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'DN' }, comprimento: 'L' },
      quadro: { origem: ['0', '0', '0'] },
    },
  ],
  ligacoes: [lig('ini', ['0', '0', '0'], ['0', '0', '-1']), lig('fim', ['0', '0', 'L'], ['0', '0', '1'])],
};

function ctxComTubo() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_TUBO) });
  return ctx;
}

const tubos = (ctx: ReturnType<typeof makeEnv>): Component[] => Object.values(ctx.store.project.elements).filter(isComponent);

beforeEach(() => {
  opcoesTubo.dn = 50;
  opcoesTubo.z = 0.5;
});

describe('ferramenta Tubo', () => {
  it('sem a família no projeto não cria nada', () => {
    const ctx = makeEnv();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    expect(tubos(ctx)).toHaveLength(0);
  });

  it('dois cliques criam UMA instância com L em mm, DN e a inclinação do segmento', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 1, 1);
    clickAt(t, 3, 1);
    const lista = tubos(ctx);
    expect(lista).toHaveLength(1);
    const c = lista[0]!;
    expect(c.values).toEqual({ L: 2000, DN: 50 });
    expect([c.x, c.y, c.z]).toEqual([1, 1, 0.5]);
    expect(c.inclinacao![0]).toBeCloseTo(Math.PI / 2, 9);
    expect(c.rotation).toBeCloseTo(0, 9);
  });

  it('a prévia mostra o fantasma depois do primeiro clique', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    t.move({ raw: { x: 1, y: 0 }, shift: false, ctrl: false, alt: false });
    expect(t.preview().some((i) => i.kind === 'polygon')).toBe(true);
    expect(t.preview().some((i) => i.kind === 'label')).toBe(true);
  });

  it('a cadeia continua: o fim do trecho vira o início do próximo e eles ficam conectados (L)', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    const [a, b] = tubos(ctx);
    expect(tubos(ctx)).toHaveLength(2);
    expect(a!.ligacoes?.fim).toMatchObject({ componenteId: b!.id, ligacaoId: 'ini' });
    expect(b!.ligacoes?.ini).toMatchObject({ componenteId: a!.id, ligacaoId: 'fim' });
    expect(b!.values?.L).toBeCloseTo(3000, 6);
    expect(b!.rotation).toBeCloseTo(Math.PI / 2, 9);
  });

  it('Esc encerra a cadeia: o próximo clique começa um trecho novo, sem conexão', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    expect(ctx.done()).toBe(0);
    clickAt(t, 10, 10);
    clickAt(t, 12, 10);
    const lista = tubos(ctx);
    expect(lista).toHaveLength(2);
    expect(lista.every((c) => c.ligacoes === undefined || Object.keys(c.ligacoes).length === 0)).toBe(true);
  });

  it('o primeiro clique encaixa na ligação aberta de um tubo existente e conecta', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    // O clique 2 cm antes do fim do primeiro tubo encaixa na ligação `fim` dele (50 mm de tolerância).
    clickAt(t, 2.02, 0.01);
    clickAt(t, 2.02, 4);
    const [a, b] = tubos(ctx);
    expect(tubos(ctx)).toHaveLength(2);
    expect(b!.x).toBeCloseTo(2, 9);
    expect(b!.y).toBeCloseTo(0, 9);
    expect(a!.ligacoes?.fim?.componenteId).toBe(b!.id);
    expect(b!.ligacoes?.ini?.componenteId).toBe(a!.id);
  });

  it('o snap recusa um tubo de DN diferente: cria o trecho solto, sem conexão', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    opcoesTubo.dn = 75;
    clickAt(t, 2.02, 0.01);
    clickAt(t, 2.02, 4);
    const [a, b] = tubos(ctx);
    expect(tubos(ctx)).toHaveLength(2);
    expect(b!.x).toBeCloseTo(2.02, 9);
    expect(b!.values?.DN).toBe(75);
    expect(a!.ligacoes).toBeUndefined();
    expect(b!.ligacoes).toBeUndefined();
  });

  it('Shift trava o trecho no eixo dominante', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 3, 0.4, { shift: true });
    const c = tubos(ctx)[0]!;
    expect(c.values?.L).toBeCloseTo(3000, 6);
    expect(c.rotation).toBeCloseTo(0, 9);
  });

  it('o comprimento digitado fixa o fim na direção do cursor', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    t.move({ raw: { x: 0, y: 5 }, shift: false, ctrl: false, alt: false });
    expect(t.type('1,5')).toBe(true);
    const c = tubos(ctx)[0]!;
    expect(c.values?.L).toBeCloseTo(1500, 6);
    expect(c.rotation).toBeCloseTo(Math.PI / 2, 9);
  });

  it('o desfazer remove o trecho e as conexões num passo só', () => {
    const ctx = ctxComTubo();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    ctx.store.undo();
    expect(tubos(ctx)).toHaveLength(1);
    expect(tubos(ctx)[0]!.ligacoes).toBeUndefined();
  });
});
