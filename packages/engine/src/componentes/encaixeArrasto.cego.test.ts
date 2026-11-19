import {
  applyCommand as aplicarNoLugar,
  createEmptyProject,
  FAMILIA_ARMARIO,
  makeWall,
  type Command,
  type Component,
  type Project,
  type Wall,
  type WallType,
} from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { posarArrastado } from './encaixeArrasto.ts';
import { caixaLocalDoComponente, corposDoNivel, facesDasParedes } from './encaixeProjeto.ts';
import { resolverComponente } from './instancia.ts';
import type { CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';

/*
 * Testes CEGOS de `posarArrastado`, `facesDasParedes`, `corposDoNivel` e `caixaLocalDoComponente` (ficha T-F3-core).
 * Cada esperado foi calculado à mão a partir da especificação e das convenções de `encaixeTipos.ts`; a função testada
 * nunca é usada para produzir o valor esperado. Tolerância: 1e-9.
 *
 * Convenções: local x = largura, y = profundidade (frente em y = 0, fundo em y = profundidade), z = altura;
 * mundo = R(rotation)·E·local + (x, y); a face vai de a para b e a parte LIVRE fica à ESQUERDA de a→b.
 */

/** `applyCommand` altera no lugar; aqui trabalhamos sempre numa cópia. */
function aplicar(p: Project, c: Command): Project {
  const q = structuredClone(p);
  aplicarNoLugar(q, c);
  return q;
}

/** Tipo de parede com uma única camada de 0,20 m (a espessura total vira 0,20). */
function comParede20(p: Project): Project {
  const modelo = p.wallTypes.wt_alv14!;
  const tipo: WallType = {
    ...structuredClone(modelo),
    id: 'wt_20',
    layers: [{ function: 'structure', materialId: 'mat_bloco19', thickness: 0.2, wraps: false }],
  };
  return aplicar(p, { type: 'upsertWallType', wallType: tipo });
}

function parede(id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<Wall> = {}): Omit<Wall, 'order'> {
  return makeWall({ id, typeId: 'wt_20', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by }, ...extra });
}

function conferirFace(face: FaceDeParede, ax: number, ay: number, bx: number, by: number): void {
  expect(face.a.x).toBeCloseTo(ax, 9);
  expect(face.a.y).toBeCloseTo(ay, 9);
  expect(face.b.x).toBeCloseTo(bx, 9);
  expect(face.b.y).toBeCloseTo(by, 9);
}

function componente(id: string, extra: Partial<Component> = {}): Omit<Component, 'order'> {
  return {
    id,
    kind: 'component',
    familyId: FAMILIA_ARMARIO.id,
    typeId: 'A80',
    levelId: 'lv_0',
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: id,
    ...extra,
  };
}

function projetoArmario(): Project {
  return aplicar(createEmptyProject('t'), { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
}

// ---------------------------------------------------------------- facesDasParedes

describe('facesDasParedes', () => {
  it('parede (0,0)→(4,0) com espessura 0,2: face esquerda em y=+0,1 e direita invertida em y=−0,1', () => {
    let p = comParede20(createEmptyProject('t'));
    p = aplicar(p, { type: 'addWall', wall: parede('w1', 0, 0, 4, 0) });
    const faces = facesDasParedes(p, 'lv_0');
    expect(faces).toHaveLength(2);
    // n = (−dy, dx)/|d| = (0, 1); meia = 0,2/2 = 0,1. Esquerda: a=(0;0,1) b=(4;0,1).
    conferirFace(faces[0]!, 0, 0.1, 4, 0.1);
    // Direita deslocada para y=−0,1 e percorrida de b para a: (4;−0,1)→(0;−0,1).
    conferirFace(faces[1]!, 4, -0.1, 0, -0.1);
  });

  it('duas paredes: [p1-esquerda, p1-direita, p2-esquerda, p2-direita]', () => {
    let p = comParede20(createEmptyProject('t'));
    p = aplicar(p, { type: 'addWall', wall: parede('w1', 0, 0, 4, 0) });
    p = aplicar(p, { type: 'addWall', wall: parede('w2', 0, 0, 0, 3) });
    const faces = facesDasParedes(p, 'lv_0');
    expect(faces).toHaveLength(4);
    // w2: d=(0,1), n=(−1,0); esquerda em x=−0,1 e direita em x=+0,1 (invertida).
    conferirFace(faces[0]!, 0, 0.1, 4, 0.1);
    conferirFace(faces[1]!, 4, -0.1, 0, -0.1);
    conferirFace(faces[2]!, -0.1, 0, -0.1, 3);
    conferirFace(faces[3]!, 0.1, 3, 0.1, 0);
  });

  it('parede curva (sag ≠ 0) não gera face', () => {
    let p = comParede20(createEmptyProject('t'));
    p = aplicar(p, { type: 'addWall', wall: parede('curva', 0, 0, 4, 0, { sag: 0.5 }) });
    expect(facesDasParedes(p, 'lv_0')).toEqual([]);
  });

  it('parede diagonal (0,0)→(3,4): normal (−0,8; 0,6) e espessura 0,2', () => {
    let p = comParede20(createEmptyProject('t'));
    p = aplicar(p, { type: 'addWall', wall: parede('diag', 0, 0, 3, 4) });
    const faces = facesDasParedes(p, 'lv_0');
    expect(faces).toHaveLength(2);
    // d=(0,6;0,8), n=(−0,8;0,6), n·0,1=(−0,08;0,06).
    // Esquerda: (0;0)+(−0,08;0,06)=(−0,08;0,06) até (3;4)+(−0,08;0,06)=(2,92;4,06).
    conferirFace(faces[0]!, -0.08, 0.06, 2.92, 4.06);
    // Direita: b−n·0,1=(3,08;3,94) e a−n·0,1=(0,08;−0,06), percorrida ao contrário.
    conferirFace(faces[1]!, 3.08, 3.94, 0.08, -0.06);
  });

  it('nível sem paredes: lista vazia', () => {
    expect(facesDasParedes(createEmptyProject('t'), 'lv_0')).toEqual([]);
  });
});

// ---------------------------------------------------------------- corposDoNivel

describe('corposDoNivel', () => {
  function projetoCorpos(): Project {
    let p = projetoArmario();
    p = aplicar(p, { type: 'addComponent', component: componente('c2', { x: 1 }) });
    p = aplicar(p, { type: 'addComponent', component: componente('c1', { x: 2 }) });
    p = aplicar(p, { type: 'addComponent', component: componente('c3', { levelId: 'lv_1', z: 0.25 }) });
    return p;
  }

  it('ordem de `order` (não de id), pose com z = elevação do nível + z do componente', () => {
    const p = projetoCorpos();
    const corpos = corposDoNivel(p, 'lv_0');
    // c2 foi criado antes de c1: order 1 e 2.
    expect(corpos.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(corpos[0]!.pose).toEqual({ x: 1, y: 0, rotation: 0, mirrored: false, z: 0 });
    expect(corpos[1]!.pose).toEqual({ x: 2, y: 0, rotation: 0, mirrored: false, z: 0 });
    // lv_1 tem elevação 3 (padrão); c3 tem z = 0,25 → pose.z = 3,25.
    const noPavimento = corposDoNivel(p, 'lv_1');
    expect(noPavimento).toHaveLength(1);
    expect(noPavimento[0]!.id).toBe('c3');
    expect(noPavimento[0]!.pose.z).toBeCloseTo(3.25, 9);
  });

  it('`excluir` retira os ids pedidos', () => {
    const p = projetoCorpos();
    expect(corposDoNivel(p, 'lv_0', new Set(['c2'])).map((c) => c.id)).toEqual(['c1']);
    expect(corposDoNivel(p, 'lv_0', new Set(['c1', 'c2']))).toEqual([]);
  });

  it('componente de família ausente fica de fora', () => {
    const p = projetoCorpos();
    p.elements.fantasma = { ...componente('fantasma', { familyId: 'nao_existe' }), order: 99 };
    expect(corposDoNivel(p, 'lv_0').map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('nível inexistente ou vazio: lista vazia', () => {
    const p = projetoCorpos();
    expect(corposDoNivel(p, 'lv_inexistente')).toEqual([]);
    expect(corposDoNivel(createEmptyProject('t'), 'lv_0')).toEqual([]);
  });

  it('a caixa do corpo é a caixa local do componente', () => {
    const p = projetoCorpos();
    const c = p.elements.c2 as Component;
    const corpo = corposDoNivel(p, 'lv_0')[0]!;
    expect(corpo.caixa).toEqual(caixaLocalDoComponente(p, c));
  });
});

// ---------------------------------------------------------------- caixaLocalDoComponente

describe('caixaLocalDoComponente', () => {
  it('A80: envolvente das peças não vazias de resolverComponente (inclui a porta e o tampo à frente)', () => {
    let p = projetoArmario();
    p = aplicar(p, { type: 'addComponent', component: componente('c1') });
    const c = p.elements.c1 as Component;
    const caixa = caixaLocalDoComponente(p, c);
    expect(caixa).not.toBeNull();
    if (caixa === null) return;

    // Envolvente calculada no teste a partir das peças (não da função testada).
    const pecas = resolverComponente(p, c).pecas.filter((q) => !q.vazio);
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const peca of pecas) {
      for (let i = 0; i < 3; i++) {
        const inicio = peca.origem[i]!;
        const fim = inicio + peca.extensao[i]!;
        if (inicio < min[i]!) min[i] = inicio;
        if (fim > max[i]!) max[i] = fim;
      }
    }
    expect(caixa.min[0]).toBeCloseTo(min[0]!, 9);
    expect(caixa.min[1]).toBeCloseTo(min[1]!, 9);
    expect(caixa.min[2]).toBeCloseTo(min[2]!, 9);
    expect(caixa.max[0]).toBeCloseTo(max[0]!, 9);
    expect(caixa.max[1]).toBeCloseTo(max[1]!, 9);
    expect(caixa.max[2]).toBeCloseTo(max[2]!, 9);

    // A80: L=0,80; P=0,56; A=0,72; tampo em y=−0,02 e portas em y=−0,018.
    expect(caixa.min).toEqual([0, -0.02, 0]);
    expect(caixa.max).toEqual([0.8, 0.56, 0.72]);
  });

  it('família ausente (sem peças): null', () => {
    const p = createEmptyProject('t');
    expect(caixaLocalDoComponente(p, { ...componente('x', { familyId: 'fantasma' }), order: 1 })).toBeNull();
  });
});

// ---------------------------------------------------------------- posarArrastado

const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 0.72] };

/** Face do "chão": a=(0,0)→b=(4,0); sólido em y<0, livre em y>0. */
const FACE: FaceDeParede = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };

function pose(x: number, y: number, rotation = 0, mirrored = false, z = 0): Pose {
  return { x, y, rotation, mirrored, z };
}

const vizinho: Corpo = { id: 'v', pose: pose(0.6, 0.56, Math.PI), caixa: CAIXA };
const alvo: Corpo = { id: 'alvo', pose: pose(0.75, 0.3, 0.02), caixa: CAIXA };

describe('posarArrastado', () => {
  it('distanciaVizinho 0,2: encosta na parede e desliza até colar no vizinho', () => {
    const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1, distanciaVizinho: 0.2 });
    // Encaixe na parede: rotação π, fundo em y=0 → pose.y = 0,56.
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    // Vizinho ocupa x ∈ [0;0,6]; o móvel encosta à direita: box [0,6;1,2] → pose.x = 1,2.
    expect(r.pose.x).toBeCloseTo(1.2, 9);
    expect(r.parede).toBe(0);
    expect(r.vizinho).toBe('v');
    expect(r.colisoes.moveis).toEqual([]);
    expect(r.colisoes.paredes).toEqual([]);
    // Guias são calculadas na pose final (frente/fundo/centro-y e direita do móvel × esquerda do vizinho).
    expect(r.guias.length).toBeGreaterThan(0);
    expect(r.guias.every((g) => g.com === 'v')).toBe(true);
  });

  it('sem distanciaVizinho (0,10 padrão): encaixa só na parede', () => {
    const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1 });
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    // Centro local (0,3;0,28) preservado ao longo da face:
    // x = 0,75 + 0,3·cos(0,02) − 0,28·sen(0,02) + 0,3 = 1,3443403753258403.
    // (A ficha cita 1,0944, mas a conta a partir da pose e da caixa dadas não fecha; ver relatório.)
    expect(r.pose.x).toBeCloseTo(1.3443403753258403, 9);
    expect(r.parede).toBe(0);
    expect(r.vizinho).toBeUndefined();
    expect(r.colisoes.moveis).toEqual([]);
  });

  it('semEncaixe: pose desejada, parede/vizinho indefinidos, colisões calculadas e sem guias', () => {
    const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { semEncaixe: true });
    expect(r.pose).toEqual(alvo.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    expect(r.guias).toEqual([]);
    // A caixa desejada não invade o vizinho: x ∈ [0,744;1,344] contra [0;0,6].
    expect(r.colisoes).toEqual({ moveis: [], paredes: [] });
  });

  it('alvo longe de tudo: pose igual à desejada, sem encaixe nem guias', () => {
    const longe: Corpo = { id: 'longe', pose: pose(10, 5, 0.1), caixa: CAIXA };
    const r = posarArrastado({ alvo: longe, outros: [], faces: [FACE] });
    expect(r.pose).toEqual(longe.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    expect(r.guias).toEqual([]);
    expect(r.colisoes).toEqual({ moveis: [], paredes: [] });
  });

  it('invade o vizinho e fica fora do alcance de parede e de vizinho: colisão apontada', () => {
    // Rotação 0,5 difere de π por 2,64 rad (> 15° de um múltiplo de 90°) → não cola no vizinho.
    const invadindo: Corpo = { id: 'alvo', pose: pose(0.3, 0.2, 0.5), caixa: CAIXA };
    const r = posarArrastado({ alvo: invadindo, outros: [vizinho], faces: [] });
    expect(r.pose).toEqual(invadindo.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    // Caixa girada cobre x ≈ [0,03;0,83] e y ≈ [0,20;0,98], sobrepondo o vizinho.
    expect(r.colisoes.moveis).toContain('v');
  });

  it('determinístico e idempotente na pose já encaixada', () => {
    const opcoes = { distanciaParede: 1, distanciaVizinho: 0.2 };
    const a = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, opcoes);
    const b = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, opcoes);
    expect(a).toEqual(b);
    const c = posarArrastado({ alvo: { ...alvo, pose: a.pose }, outros: [vizinho], faces: [FACE] }, opcoes);
    expect(c.pose).toEqual(a.pose);
    expect(c.parede).toBe(a.parede);
    expect(c.vizinho).toBe(a.vizinho);
  });

  it('simetria: espelhar a cena em x espelha a pose final', () => {
    const espelhar = (c: Corpo): Corpo => ({
      ...c,
      pose: { ...c.pose, x: -c.pose.x, rotation: -c.pose.rotation, mirrored: !c.pose.mirrored },
    });
    // Reflexão em x mantém a ordem a→b para o lado livre continuar em y>0.
    const faceEspelhada: FaceDeParede = { a: { x: -4, y: 0 }, b: { x: 0, y: 0 } };
    const direita = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1, distanciaVizinho: 0.2 });
    const esquerda = posarArrastado(
      { alvo: espelhar(alvo), outros: [espelhar(vizinho)], faces: [faceEspelhada] },
      { distanciaParede: 1, distanciaVizinho: 0.2 },
    );
    expect(direita.pose.x).toBeCloseTo(1.2, 9);
    expect(esquerda.pose.x).toBeCloseTo(-1.2, 9);
    expect(esquerda.pose.y).toBeCloseTo(0.56, 9);
    expect(esquerda.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(esquerda.parede).toBe(0);
    expect(esquerda.vizinho).toBe('v');
  });

  it('limite de distanciaVizinho: folga exata de 0,2 cola; 0,1999 não', () => {
    // Já na parede, box [0,8;1,4]; vizinho termina em x=0,6 → folga exata de 0,2.
    const noLimite: Corpo = { id: 'alvo', pose: pose(1.4, 0.56, Math.PI), caixa: CAIXA };
    const cola = posarArrastado({ alvo: noLimite, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1, distanciaVizinho: 0.2 });
    expect(cola.pose.x).toBeCloseTo(1.2, 9);
    expect(cola.vizinho).toBe('v');
    const naoCola = posarArrastado({ alvo: noLimite, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1, distanciaVizinho: 0.1999 });
    expect(naoCola.pose.x).toBeCloseTo(1.4, 9);
    expect(naoCola.vizinho).toBeUndefined();
  });

  it('entradas vazias: sem faces e sem vizinhos devolve a pose desejada', () => {
    const r = posarArrastado({ alvo, outros: [], faces: [] });
    expect(r.pose).toEqual(alvo.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    expect(r.guias).toEqual([]);
    expect(r.colisoes).toEqual({ moveis: [], paredes: [] });
  });

  it('semEncaixe ignora a face mesmo com distanciaParede grande', () => {
    const r = posarArrastado({ alvo, outros: [], faces: [FACE] }, { semEncaixe: true, distanciaParede: 10 });
    expect(r.pose).toEqual(alvo.pose);
    expect(r.parede).toBeUndefined();
    expect(r.guias).toEqual([]);
  });
});
