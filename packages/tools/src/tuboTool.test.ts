import { beforeEach, describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent, type Component, type Familia, type Ligacao } from '@hestia/model';
import { CONEXOES_POR_DOMINIO } from '@hestia/engine';
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

// ---- Conexões automáticas (ficha C6) ----

const R = CONEXOES_POR_DOMINIO.esgoto!;
const lg = (id: string, direcao: [string, string, string], diametro = 'DN'): Ligacao => ({ ...lig(id, ['0', '0', '0'], direcao), diametro });

/** Fixture de conexão: sem corpo, só ligações na origem e os parâmetros DN e DN2. */
function conexaoFx(id: string, ligacoes: Ligacao[]): Familia {
  return { ...structuredClone(FAMILIA_TUBO), id, nome: id, corpos: [], ligacoes, parametros: [...FAMILIA_TUBO.parametros, { id: 'DN2', nome: 'DN2', tipo: 'comprimento', escopo: 'instancia', padrao: 50 }] };
}

const S = '0.7071067811865476';
const FAMILIAS_ESGOTO: Familia[] = [
  { ...structuredClone(FAMILIA_TUBO), id: R.tubo },
  conexaoFx(R.curva90, [lg('a', ['1', '0', '0']), lg('b', ['0', '1', '0'])]),
  conexaoFx(R.curva45, [lg('a', ['1', '0', '0']), lg('b', ['-' + S, S, '0'])]),
  conexaoFx(R.te, [lg('p1', ['-1', '0', '0']), lg('p2', ['1', '0', '0']), lg('r', ['0', '1', '0'], 'DN2')]),
  conexaoFx(R.juncao45, [lg('p1', ['-1', '0', '0']), lg('p2', ['1', '0', '0']), lg('r', [S, S, '0'], 'DN2')]),
  conexaoFx(R.luva, [lg('a', ['0', '0', '1']), lg('b', ['0', '0', '-1'])]),
  conexaoFx(R.reducao, [lg('g', ['0', '0', '1']), lg('p', ['0', '0', '-1'], 'DN2')]),
];

function ctxEsgoto() {
  const ctx = makeEnv();
  for (const f of FAMILIAS_ESGOTO) ctx.store.exec({ type: 'upsertFamily', family: structuredClone(f) });
  return ctx;
}

const daFamilia = (ctx: ReturnType<typeof makeEnv>, id: string): Component[] => tubos(ctx).filter((c) => c.familyId === id);
const estado = (ctx: ReturnType<typeof makeEnv>) => structuredClone({ e: ctx.store.project.elements, s: ctx.store.project.sistemasMep });

describe('conexões automáticas', () => {
  it('90°: o encontro ganha uma curva 90° ligada aos dois trechos; desfazer volta ao estado exato', () => {
    const ctx = ctxEsgoto();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    const antes = estado(ctx);
    clickAt(t, 2, 3);
    const [a, b] = daFamilia(ctx, R.tubo);
    const curva = daFamilia(ctx, R.curva90);
    expect(curva).toHaveLength(1);
    expect(daFamilia(ctx, R.curva45)).toHaveLength(0);
    const k = curva[0]!;
    expect([k.x, k.y, k.z]).toEqual([2, 0, 0.5]);
    expect(a!.ligacoes?.fim?.componenteId).toBe(k.id);
    expect(b!.ligacoes?.ini?.componenteId).toBe(k.id);
    expect(Object.values(k.ligacoes ?? {}).map((x) => x.componenteId).sort()).toEqual([a!.id, b!.id].sort());
    ctx.store.undo();
    expect(estado(ctx)).toEqual(antes);
  });

  it('45°: curva 45°', () => {
    const ctx = ctxEsgoto();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 4, 2);
    expect(daFamilia(ctx, R.curva45)).toHaveLength(1);
    expect(daFamilia(ctx, R.curva90)).toHaveLength(0);
  });

  it('DN diferente em linha reta: redução; em linha reta com o mesmo DN: liga direto, sem peça', () => {
    const ctx = ctxEsgoto();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 4, 0);
    expect(tubos(ctx)).toHaveLength(2);
    opcoesTubo.dn = 75;
    clickAt(t, 6, 0);
    const red = daFamilia(ctx, R.reducao);
    expect(red).toHaveLength(1);
    expect(red[0]!.values).toMatchObject({ DN: 75, DN2: 50 });
  });

  it('ângulo sem regra: o trecho nasce sem conexão', () => {
    const ctx = ctxEsgoto();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 3, 1.732);
    const lista = daFamilia(ctx, R.tubo);
    expect(lista).toHaveLength(2);
    expect(lista.every((c) => c.ligacoes === undefined)).toBe(true);
    expect(tubos(ctx)).toHaveLength(2);
  });

  it('tê: divide o trecho preservando conexões e comprimentos; desfazer volta ao estado exato', () => {
    const ctx = ctxEsgoto();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    clickAt(t, 6, 0);
    t.cancel();
    const [principal, vizinho] = daFamilia(ctx, R.tubo);
    const antes = estado(ctx);
    // Clique no meio do tubo principal (x = 2) e depois a 3 m para o lado: ramal a 90°.
    clickAt(t, 2, 0.01);
    clickAt(t, 2, 3);
    const tubosR = daFamilia(ctx, R.tubo);
    expect(tubosR).toHaveLength(4);
    const te = daFamilia(ctx, R.te);
    expect(te).toHaveLength(1);
    const p1 = tubosR.find((c) => c.id === principal!.id)!;
    const p2 = tubosR.find((c) => c.id !== principal!.id && c.id !== vizinho!.id && Math.abs(c.x - 2) < 1e-9 && c.rotation === 0)!;
    const ramal = tubosR.find((c) => c.rotation > 1 && c.rotation < 2)!;
    expect(p1.values?.L).toBeCloseTo(2000, 6);
    expect(p2.values?.L).toBeCloseTo(2000, 6);
    expect(ramal.values?.L).toBeCloseTo(3000, 6);
    // O fim original do principal agora é do segundo pedaço, ainda ligado ao vizinho.
    expect(p2.ligacoes?.fim?.componenteId).toBe(vizinho!.id);
    expect(tubosR.find((c) => c.id === vizinho!.id)!.ligacoes?.ini?.componenteId).toBe(p2.id);
    expect(p1.ligacoes?.fim?.componenteId).toBe(te[0]!.id);
    expect(p2.ligacoes?.ini?.componenteId).toBe(te[0]!.id);
    expect(ramal.ligacoes?.ini?.componenteId).toBe(te[0]!.id);
    ctx.store.undo();
    expect(estado(ctx)).toEqual(antes);
  });

  it('derivação a 60° não divide o tubo', () => {
    const ctx = ctxEsgoto();
    const t = tool('tubo', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    t.cancel();
    clickAt(t, 2, 0);
    clickAt(t, 2.5, 0.866);
    expect(daFamilia(ctx, R.tubo)).toHaveLength(2);
    expect(tubos(ctx)).toHaveLength(2);
  });
});
