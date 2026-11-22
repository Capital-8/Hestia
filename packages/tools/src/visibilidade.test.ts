import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FAMILIA_ARMARIO,
  ProjectStore,
  createEmptyProject,
  levelDimensions,
  makeColumn,
  makeStair,
  makeWall,
  type Id,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { SelectTool } from './selectTool.ts';
import { clickAt, makeEnv, P, tool, type OpcoesMakeEnv } from './testEnv.ts';
import { podeCapturar, podeSelecionar } from './visibilidade.ts';
import { DEFAULT_SNAP, type Inference, type ToolEnv } from './types.ts';

/*
 * Regra única de captura e seleção (decisão 0060 §4.1). Os valores esperados são LITERAIS escritos a partir da tabela:
 *
 * | Estado   | Snap | Clique | Caixa | Cota (referência) |
 * |----------|------|--------|-------|-------------------|
 * | normal   | sim  | sim    | sim   | sim               |
 * | meio-tom | sim  | não    | não   | sim               |
 * | oculto   | não  | não    | não   | não               |
 *
 * Geometria da cena (tudo no lv_0, longe uns dos outros):
 * - parede: (0,0)-(4,0), com a porta `abertura` no centro (offset 2);
 * - pilar: ct_conc_20x40 em (8,2);
 * - escada: lance reto de 4 m a partir de x = 12 (pegada y -0,5..0,5 e espelhos y -1..1);
 * - móvel: armário A80 em (20,2), pegada x 20..20,8 e y 1,98..2,56.
 */

const lv = 'lv_0';

/** Lance reto de 4 m por 1 m a partir de `x0`; com espelhos, um a cada metro (mesma forma de `componentSnap.test`). */
const linha = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });
function lance(id: string, x0: number): StairRun {
  return {
    id,
    kind: 'run',
    boundaryLeft: [linha({ x: x0, y: 0.5 }, { x: x0 + 4, y: 0.5 })],
    boundaryRight: [linha({ x: x0, y: -0.5 }, { x: x0 + 4, y: -0.5 })],
    risers: [1, 2, 3].map((k) => linha({ x: x0 + k, y: -1 }, { x: x0 + k, y: 1 })),
    path: [],
  };
}

/** Projeto da cena, com os cinco kinds e tipos reais das defaults do Hestia. */
function projeto(): ProjectStore {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'parede', typeId: 'wt_alv14', levelId: lv, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  ctx.store.exec({ type: 'addOpening', opening: { id: 'abertura', kind: 'door', typeId: 'ot_p80', hostId: 'parede', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  ctx.store.exec({ type: 'addColumn', column: makeColumn({ id: 'pilar', typeId: 'ct_conc_20x40', levelId: lv, at: { x: 8, y: 2 } }) });
  ctx.store.exec({ type: 'addStair', stair: makeStair({ id: 'escada', typeId: 'stt_monolitica', levelId: lv, components: [lance('r1', 12)] }) });
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  ctx.store.exec({
    type: 'addComponent',
    component: { id: 'movel', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: lv, x: 20, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'M1' },
  });
  return ctx.store;
}

type Estado = 'normal' | 'meio-tom' | 'oculto';

/** Ids que o estado esconde/atenua. `normal` não informa nada (ambiente idêntico ao de hoje). */
function ambiente(estado: Estado, ids: readonly Id[]) {
  const opts: OpcoesMakeEnv = estado === 'oculto' ? { hiddenIds: ids } : estado === 'meio-tom' ? { halftoneIds: ids } : {};
  return makeEnv(projeto(), opts);
}

const snapEm = (env: ToolEnv, alvo: Vec2): Inference => {
  // Só a captura do elemento interessa aqui: o alinhamento com outros elementos (uma linha x/y) não é o que a tabela
  // chama de "snap" e poderia mascarar a ausência do ponto oculto.
  env.options().snap = { ...DEFAULT_SNAP, alignment: false };
  const t = tool('wall', env);
  t.move(P(alvo.x, alvo.y));
  return t.inference()!;
};

function cliqueEm(env: ToolEnv, alvo: Vec2): Id[] {
  const t = new SelectTool(env);
  t.start();
  t.down(P(alvo.x, alvo.y));
  t.up(P(alvo.x, alvo.y));
  return env.selection();
}

function caixaEm(env: ToolEnv, a: Vec2, b: Vec2): Id[] {
  const t = new SelectTool(env);
  t.start();
  t.down(P(a.x, a.y));
  t.drag(P(b.x, b.y));
  t.up(P(b.x, b.y));
  return [...env.selection()].sort();
}

/**
 * Cota com o primeiro ponto no cursor: devolve o ponto gravado e o elemento da ref associativa (quando houver). O segundo
 * ponto e o afastamento são fixos e longe da cena.
 */
function cotaEm(env: ToolEnv, cursor: Vec2): { a: Vec2; refId: Id | null } {
  // O mesmo isolamento do snap: a referência é o ponto do elemento, não um alinhamento com outro elemento distante.
  env.options().snap = { ...DEFAULT_SNAP, alignment: false };
  const t = tool('dimension', env);
  clickAt(t, cursor.x, cursor.y);
  clickAt(t, 30, 30);
  clickAt(t, 15, 20);
  const d = levelDimensions(env.project(), lv)[0]!;
  const ref = d.refs?.a;
  const refId = ref ? ('elementId' in ref ? ref.elementId : ref.wallId) : null;
  return { a: d.a, refId };
}

describe('podeCapturar e podeSelecionar: a tabela do ADR, sem depender de ferramenta', () => {
  it('normal: captura, clique e caixa; meio-tom: captura mas não seleciona; oculto: nada', () => {
    const normal = makeEnv(projeto()).env;
    const meio = makeEnv(projeto(), { halftoneIds: ['parede'] }).env;
    const oculto = makeEnv(projeto(), { hiddenIds: ['parede'] }).env;
    expect(podeCapturar(normal, 'parede')).toBe(true);
    expect(podeSelecionar(normal, 'parede', 'clique')).toBe(true);
    expect(podeSelecionar(normal, 'parede', 'caixa')).toBe(true);
    expect(podeCapturar(meio, 'parede')).toBe(true);
    expect(podeSelecionar(meio, 'parede', 'clique')).toBe(false);
    expect(podeSelecionar(meio, 'parede', 'caixa')).toBe(false);
    expect(podeCapturar(oculto, 'parede')).toBe(false);
    expect(podeSelecionar(oculto, 'parede', 'clique')).toBe(false);
    expect(podeSelecionar(oculto, 'parede', 'caixa')).toBe(false);
  });
});

describe('parede', () => {
  it('normal: snap na ponta, clique e caixa selecionam, cota referencia a parede', () => {
    const ctx = ambiente('normal', []);
    expect(snapEm(ctx.env, { x: 0, y: 0 })).toMatchObject({ kind: 'endpoint', point: { x: 0, y: 0 } });
    expect(cliqueEm(ctx.env, { x: 0.5, y: 0 })).toEqual(['parede']);
    expect(caixaEm(ctx.env, { x: -0.2, y: -0.2 }, { x: 4.2, y: 0.2 })).toEqual(['parede']);
    expect(cotaEm(ctx.env, { x: 0.03, y: 0.02 })).toEqual({ a: { x: 0, y: 0 }, refId: 'parede' });
  });

  it('meio-tom: snap e cota sim; clique e caixa não', () => {
    const ctx = ambiente('meio-tom', ['parede']);
    expect(snapEm(ctx.env, { x: 0, y: 0 })).toMatchObject({ kind: 'endpoint', point: { x: 0, y: 0 } });
    expect(cliqueEm(ctx.env, { x: 0.5, y: 0 })).toEqual([]);
    expect(caixaEm(ctx.env, { x: -0.2, y: -0.2 }, { x: 4.2, y: 0.2 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 0.03, y: 0.02 })).toEqual({ a: { x: 0, y: 0 }, refId: 'parede' });
  });

  it('oculto: não captura (nem a face), não seleciona e não é referência de cota', () => {
    const ctx = ambiente('oculto', ['parede']);
    expect(snapEm(ctx.env, { x: 0, y: 0 }).kind).toBe('none');
    expect(cliqueEm(ctx.env, { x: 0.5, y: 0 })).toEqual([]);
    expect(caixaEm(ctx.env, { x: -0.2, y: -0.2 }, { x: 4.2, y: 0.2 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 0.03, y: 0.02 })).toEqual({ a: { x: 0.03, y: 0.02 }, refId: null });
  });
});

describe('pilar', () => {
  const ponto = { x: 8, y: 2 };

  it('normal: snap no centro, clique e caixa selecionam, cota usa o ponto', () => {
    const ctx = ambiente('normal', []);
    expect(snapEm(ctx.env, ponto)).toMatchObject({ kind: 'center', point: ponto });
    expect(cliqueEm(ctx.env, ponto)).toEqual(['pilar']);
    expect(caixaEm(ctx.env, { x: 7, y: 1 }, { x: 9, y: 3 })).toEqual(['pilar']);
    expect(cotaEm(ctx.env, { x: 8.02, y: 2.01 })).toEqual({ a: ponto, refId: null });
  });

  it('meio-tom: snap e cota sim; clique e caixa não', () => {
    const ctx = ambiente('meio-tom', ['pilar']);
    expect(snapEm(ctx.env, ponto)).toMatchObject({ kind: 'center', point: ponto });
    expect(cliqueEm(ctx.env, ponto)).toEqual([]);
    expect(caixaEm(ctx.env, { x: 7, y: 1 }, { x: 9, y: 3 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 8.02, y: 2.01 })).toEqual({ a: ponto, refId: null });
  });

  it('oculto: não captura, não seleciona e não é referência de cota', () => {
    const ctx = ambiente('oculto', ['pilar']);
    expect(snapEm(ctx.env, ponto).kind).toBe('none');
    expect(cliqueEm(ctx.env, ponto)).toEqual([]);
    expect(caixaEm(ctx.env, { x: 7, y: 1 }, { x: 9, y: 3 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 8.02, y: 2.01 })).toEqual({ a: { x: 8.02, y: 2.01 }, refId: null });
  });
});

describe('escada', () => {
  const ponto = { x: 13, y: 0.5 };

  it('normal: snap na ponta do degrau, clique e caixa selecionam, cota usa o ponto', () => {
    const ctx = ambiente('normal', []);
    expect(snapEm(ctx.env, ponto)).toMatchObject({ kind: 'endpoint', point: ponto });
    expect(cliqueEm(ctx.env, ponto)).toEqual(['escada']);
    expect(caixaEm(ctx.env, { x: 11, y: -2 }, { x: 17, y: 2 })).toEqual(['escada']);
    expect(cotaEm(ctx.env, { x: 13.02, y: 0.51 })).toEqual({ a: ponto, refId: 'escada' });
  });

  it('meio-tom: snap e cota sim; clique e caixa não', () => {
    const ctx = ambiente('meio-tom', ['escada']);
    expect(snapEm(ctx.env, ponto)).toMatchObject({ kind: 'endpoint', point: ponto });
    expect(cliqueEm(ctx.env, ponto)).toEqual([]);
    expect(caixaEm(ctx.env, { x: 11, y: -2 }, { x: 17, y: 2 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 13.02, y: 0.51 })).toEqual({ a: ponto, refId: 'escada' });
  });

  it('oculto: não captura, não seleciona e não é referência de cota', () => {
    const ctx = ambiente('oculto', ['escada']);
    expect(snapEm(ctx.env, ponto).kind).toBe('none');
    expect(cliqueEm(ctx.env, ponto)).toEqual([]);
    expect(caixaEm(ctx.env, { x: 11, y: -2 }, { x: 17, y: 2 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 13.02, y: 0.51 })).toEqual({ a: { x: 13.02, y: 0.51 }, refId: null });
  });
});

describe('móvel', () => {
  const canto = { x: 20, y: 1.98 };

  it('normal: snap no canto, clique e caixa selecionam, cota usa o ponto', () => {
    const ctx = ambiente('normal', []);
    expect(snapEm(ctx.env, canto)).toMatchObject({ kind: 'endpoint', point: canto });
    expect(cliqueEm(ctx.env, { x: 20.4, y: 2.2 })).toEqual(['movel']);
    expect(caixaEm(ctx.env, { x: 19.5, y: 1.5 }, { x: 21.5, y: 3 })).toEqual(['movel']);
    expect(cotaEm(ctx.env, canto)).toEqual({ a: canto, refId: null });
  });

  it('meio-tom: snap e cota sim; clique e caixa não', () => {
    const ctx = ambiente('meio-tom', ['movel']);
    expect(snapEm(ctx.env, canto)).toMatchObject({ kind: 'endpoint', point: canto });
    expect(cliqueEm(ctx.env, { x: 20.4, y: 2.2 })).toEqual([]);
    expect(caixaEm(ctx.env, { x: 19.5, y: 1.5 }, { x: 21.5, y: 3 })).toEqual([]);
    expect(cotaEm(ctx.env, canto)).toEqual({ a: canto, refId: null });
  });

  it('oculto: não captura, não seleciona e não é referência de cota', () => {
    const ctx = ambiente('oculto', ['movel']);
    expect(snapEm(ctx.env, canto).kind).toBe('none');
    expect(cliqueEm(ctx.env, { x: 20.4, y: 2.2 })).toEqual([]);
    expect(caixaEm(ctx.env, { x: 19.5, y: 1.5 }, { x: 21.5, y: 3 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 20.003, y: 1.983 })).toEqual({ a: { x: 20.003, y: 1.983 }, refId: null });
  });
});

describe('abertura', () => {
  const centro = { x: 2, y: 0 };

  it('snap do centro da abertura: normal e meio-tom capturam; ocultar SÓ a abertura tira o centro (a parede continua com "midpoint")', () => {
    // Isola a abertura: a parede fica normal nos três estados. Sem o filtro da própria abertura, o "center" apareceria
    // também no estado oculto e a lacuna (abertura oculta captura) passaria.
    expect(snapEm(ambiente('normal', []).env, centro)).toMatchObject({ kind: 'center', point: centro });
    expect(snapEm(ambiente('meio-tom', ['abertura']).env, centro)).toMatchObject({ kind: 'center', point: centro });
    expect(snapEm(ambiente('oculto', ['abertura']).env, centro)).toMatchObject({ kind: 'midpoint', point: centro });
  });

  it('normal (abertura + parede): clique seleciona a abertura, caixa a parede, cota referencia a abertura', () => {
    const ctx = ambiente('normal', []);
    expect(cliqueEm(ctx.env, centro)).toEqual(['abertura']);
    expect(caixaEm(ctx.env, { x: -0.2, y: -0.2 }, { x: 4.2, y: 0.2 })).toEqual(['parede']);
    expect(cotaEm(ctx.env, { x: 2.02, y: 0.01 })).toEqual({ a: centro, refId: 'abertura' });
  });

  it('meio-tom (abertura + parede): captura e cota sim; clique e caixa não', () => {
    const ctx = ambiente('meio-tom', ['abertura', 'parede']);
    expect(snapEm(ctx.env, centro)).toMatchObject({ kind: 'center', point: centro });
    expect(cliqueEm(ctx.env, centro)).toEqual([]);
    expect(caixaEm(ctx.env, { x: -0.2, y: -0.2 }, { x: 4.2, y: 0.2 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 2.02, y: 0.01 })).toEqual({ a: centro, refId: 'abertura' });
  });

  it('oculto (abertura + parede): não captura, não seleciona e não é referência de cota', () => {
    const ctx = ambiente('oculto', ['abertura', 'parede']);
    expect(snapEm(ctx.env, centro).kind).toBe('none');
    expect(cliqueEm(ctx.env, centro)).toEqual([]);
    expect(caixaEm(ctx.env, { x: -0.2, y: -0.2 }, { x: 4.2, y: 0.2 })).toEqual([]);
    expect(cotaEm(ctx.env, { x: 2.02, y: 0.01 })).toEqual({ a: { x: 2.02, y: 0.01 }, refId: null });
  });
});

describe('guarda de texto: ponto único de leitura da visibilidade', () => {
  it('nenhum hiddenInView?.()/halftoneInView?.() fora de visibilidade.ts e base.ts (testes fora da guarda)', () => {
    const dir = join(import.meta.dirname, '.');
    const permitidos = new Set(['visibilidade.ts', 'base.ts']);
    const achados: string[] = [];
    for (const nome of readdirSync(dir)) {
      if (!nome.endsWith('.ts') || nome.endsWith('.test.ts') || permitidos.has(nome)) continue;
      const texto = readFileSync(join(dir, nome), 'utf8');
      if (texto.includes('hiddenInView?.()') || texto.includes('halftoneInView?.()')) achados.push(nome);
    }
    expect(achados).toEqual([]);
  });
});
