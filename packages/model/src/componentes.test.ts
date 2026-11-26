import { describe, expect, it } from 'vitest';
import { applyCommand as aplicarNoLugar, type Command } from './commands.ts';
import { componentIssue, familiaDoComponente, matrizDoComponente, normalizarAngulo, pontoNoMundo, transformComponent } from './componentes.ts';
import { FAMILIA_ARMARIO } from './familia/exemplos.ts';
import { ProjectStore } from './history.ts';
import { migrateProject } from './migrate.ts';
import { createEmptyProject } from './defaults.ts';
import { SCHEMA_VERSION, isComponent, type Component, type Project } from './types.ts';

/** `applyCommand` altera o projeto no lugar (o histórico passa um rascunho); aqui trabalhamos em cópias. */
const applyCommand = (p: Project, c: Command): Project => { const q = structuredClone(p); aplicarNoLugar(q, c); return q; };

const base = (): Project => {
  const p = createEmptyProject('t');
  return applyCommand(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
};
const comp = (p: Project, extra: Partial<Component> = {}): Omit<Component, 'order'> => ({
  id: 'c1', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'M-01', ...extra,
});
const mundo = (c: Component, local: [number, number]): [number, number] => {
  const lx = c.mirrored ? -local[0] : local[0];
  const [co, si] = [Math.cos(c.rotation), Math.sin(c.rotation)];
  return [c.x + lx * co - local[1] * si, c.y + lx * si + local[1] * co];
};

describe('esquema e migração', () => {
  it('o esquema subiu para 24 e arquivo da versão 23 abre igual', () => {
    expect(SCHEMA_VERSION).toBe(35);
    const antigo = JSON.parse(JSON.stringify({ ...createEmptyProject('antigo'), schemaVersion: 23 }));
    const p = migrateProject(antigo);
    expect(p.schemaVersion).toBe(35);
    expect(p.name).toBe('antigo');
    expect(p.componentFamilies).toBeUndefined();
  });
  it('projeto com família e componente sobrevive a salvar e abrir', () => {
    let p = base();
    p = applyCommand(p, { type: 'addComponent', component: comp(p) });
    const lido = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(isComponent(lido.elements.c1)).toBe(true);
    expect(lido.componentFamilies?.[FAMILIA_ARMARIO.id]).toEqual(FAMILIA_ARMARIO);
  });
});

describe('comandos', () => {
  it('upsertFamily recusa família inválida e não altera nada; troca e acrescenta as válidas', () => {
    const p = createEmptyProject('t');
    const ruim = structuredClone(FAMILIA_ARMARIO);
    ruim.pecas[0]!.espessura = '+';
    expect(() => applyCommand(p, { type: 'upsertFamily', family: ruim })).toThrow(/peca:latE/);
    const q = base();
    expect(Object.keys(q.componentFamilies ?? {})).toEqual([FAMILIA_ARMARIO.id]);
    const outra = structuredClone(FAMILIA_ARMARIO);
    outra.nome = 'Outro nome';
    expect(applyCommand(q, { type: 'upsertFamily', family: outra }).componentFamilies?.[FAMILIA_ARMARIO.id]?.nome).toBe('Outro nome');
  });
  it('addComponent valida família, tipo, nível, números e id', () => {
    const p = base();
    expect(() => applyCommand(p, { type: 'addComponent', component: comp(p, { familyId: 'x' }) })).toThrow(/Família/);
    expect(() => applyCommand(p, { type: 'addComponent', component: comp(p, { typeId: 'x' }) })).toThrow(/Tipo/);
    expect(() => applyCommand(p, { type: 'addComponent', component: comp(p, { levelId: 'x' }) })).toThrow(/Nível/);
    expect(() => applyCommand(p, { type: 'addComponent', component: comp(p, { x: Number.NaN }) })).toThrow(/inválida/);
    const q = applyCommand(p, { type: 'addComponent', component: comp(p) });
    expect((q.elements.c1 as Component).order).toBeGreaterThanOrEqual(0);
    expect(() => applyCommand(q, { type: 'addComponent', component: comp(q) })).toThrow(/Já existe/);
    expect(componentIssue(q, comp(q, { typeId: null }))).toBeNull();
    expect(familiaDoComponente(q, q.elements.c1 as Component)?.id).toBe(FAMILIA_ARMARIO.id);
  });
  it('updateComponent aplica o patch com validação', () => {
    let p = base();
    p = applyCommand(p, { type: 'addComponent', component: comp(p) });
    p = applyCommand(p, { type: 'updateComponent', id: 'c1', patch: { x: 5, mirrored: true, values: { L: 1000 }, typeId: 'A60' } });
    expect(p.elements.c1).toMatchObject({ x: 5, mirrored: true, typeId: 'A60', values: { L: 1000 } });
    expect(() => applyCommand(p, { type: 'updateComponent', id: 'c1', patch: { typeId: 'xx' } })).toThrow(/Tipo/);
    expect(() => applyCommand(p, { type: 'updateComponent', id: 'nao', patch: { x: 1 } })).toThrow(/inexistente/);
  });
  it('deleteFamily recusa em uso (com a contagem) e remove a livre', () => {
    let p = base();
    p = applyCommand(p, { type: 'addComponent', component: comp(p) });
    expect(() => applyCommand(p, { type: 'deleteFamily', id: FAMILIA_ARMARIO.id })).toThrow(/em uso por 1 componente/);
    p = applyCommand(p, { type: 'deleteElements', ids: ['c1'] });
    expect(p.elements.c1).toBeUndefined();
    p = applyCommand(p, { type: 'deleteFamily', id: FAMILIA_ARMARIO.id });
    expect(p.componentFamilies).toEqual({});
    expect(() => applyCommand(p, { type: 'deleteFamily', id: 'x' })).toThrow(/inexistente/);
  });
  it('desfazer e refazer de inserir componente e de carregar família, com rótulos', () => {
    const s = new ProjectStore(createEmptyProject('t'));
    s.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    expect(s.undoLabel).toBe('Carregar família');
    s.exec({ type: 'addComponent', component: comp(s.project) });
    expect(s.undoLabel).toBe('Inserir componente');
    s.undo();
    expect(s.project.elements.c1).toBeUndefined();
    s.redo();
    expect(isComponent(s.project.elements.c1)).toBe(true);
    s.undo(); s.undo();
    expect(s.project.componentFamilies).toBeUndefined();
  });
});

describe('transformação da instância (mover, girar, espelhar)', () => {
  const instancia = (extra: Partial<Component> = {}): Component => ({ ...comp(base(), extra), order: 1 });
  const pontos: Array<[number, number]> = [[0, 0], [0.8, 0], [0.8, 0.56], [0.3, 0.2]];
  it('mover: soma o deslocamento', () => {
    const c = transformComponent(instancia({ rotation: 0.4, mirrored: true }), { kind: 'translate', d: { x: 0.5, y: -1 } });
    expect([c.x, c.y, c.rotation, c.mirrored]).toEqual([1.5, 1, 0.4, true]);
  });
  it('girar: o mundo da instância gira em torno do ponto (4 combinações de espelhamento e ângulos)', () => {
    for (const mirrored of [false, true]) for (const rot of [0, 0.7, -2.1, 3]) for (const ang of [Math.PI / 2, -0.4, 2.5]) {
      const c = instancia({ rotation: rot, mirrored });
      const about = { x: 0.3, y: -0.7 };
      const n = transformComponent(c, { kind: 'rotate', about, angle: ang });
      for (const pt of pontos) {
        const [wx, wy] = mundo(c, pt);
        const dx = wx - about.x; const dy = wy - about.y;
        const esperado = [about.x + dx * Math.cos(ang) - dy * Math.sin(ang), about.y + dx * Math.sin(ang) + dy * Math.cos(ang)];
        const [nx, ny] = mundo(n, pt);
        expect(nx).toBeCloseTo(esperado[0]!, 9);
        expect(ny).toBeCloseTo(esperado[1]!, 9);
      }
    }
  });
  it('espelhar: o mundo da instância é o espelho do original em torno da reta (várias retas e instâncias)', () => {
    const retas = [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, { a: { x: 2, y: 1 }, b: { x: 2, y: 5 } }, { a: { x: -1, y: 3 }, b: { x: 4, y: 7 } }];
    for (const mirrored of [false, true]) for (const rot of [0, 1.1, -2.7]) for (const r of retas) {
      const c = instancia({ rotation: rot, mirrored });
      const n = transformComponent(c, { kind: 'mirror', a: r.a, b: r.b });
      expect(n.mirrored).toBe(!mirrored);
      const [dx, dy] = [r.b.x - r.a.x, r.b.y - r.a.y];
      const len2 = dx * dx + dy * dy;
      for (const pt of pontos) {
        const [wx, wy] = mundo(c, pt);
        const t = ((wx - r.a.x) * dx + (wy - r.a.y) * dy) / len2;
        const foot = [r.a.x + t * dx, r.a.y + t * dy];
        const esperado = [2 * foot[0]! - wx, 2 * foot[1]! - wy];
        const [nx, ny] = mundo(n, pt);
        expect(nx).toBeCloseTo(esperado[0]!, 9);
        expect(ny).toBeCloseTo(esperado[1]!, 9);
      }
    }
  });
  it('comando transform move, copia (com idMap) e espelha componentes pelo histórico', () => {
    let p = base();
    p = applyCommand(p, { type: 'addComponent', component: comp(p) });
    p = applyCommand(p, { type: 'transform', ids: ['c1'], transform: { kind: 'translate', d: { x: 1, y: 0 } } });
    expect((p.elements.c1 as Component).x).toBe(2);
    p = applyCommand(p, { type: 'transform', ids: ['c1'], transform: { kind: 'translate', d: { x: 0, y: 3 } }, copy: { idMap: { c1: 'c2' } } });
    expect((p.elements.c1 as Component).y).toBe(2);
    expect(p.elements.c2).toMatchObject({ kind: 'component', x: 2, y: 5 });
  });
  it('normalizarAngulo fica em (−π, π]', () => {
    expect(normalizarAngulo(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizarAngulo(-3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(normalizarAngulo(0.5)).toBe(0.5);
  });
});

describe('nível', () => {
  it('mover para outro nível com a cota preservada soma o desnível em z', () => {
    let p = base();
    p = applyCommand(p, { type: 'upsertLevel', level: { id: 'lv2', name: 'Superior', elevation: 3, height: 3 } as never });
    p = applyCommand(p, { type: 'addComponent', component: comp(p, { z: 0.2 }) });
    p = applyCommand(p, { type: 'setElementLevel', ids: ['c1'], levelId: 'lv2', keep: 'elevation' });
    expect((p.elements.c1 as Component).levelId).toBe('lv2');
    expect((p.elements.c1 as Component).z).toBeCloseTo(0.2 - 3, 9);
  });
});

describe('salvar zera o aviso de alterações não salvas (regressão do QA)', () => {
  it('markSaved deixa dirty falso e uma edição seguinte o torna verdadeiro', () => {
    const store = new ProjectStore(createEmptyProject('teste'));
    store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    expect(store.dirty).toBe(true);
    store.markSaved();
    expect(store.dirty).toBe(false);
    store.exec({ type: 'deleteFamily', id: FAMILIA_ARMARIO.id });
    expect(store.dirty).toBe(true);
  });
});

/** Gerador determinístico (semente fixa) para os casos "aleatórios". */
function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('inclinação 3D da instância (ADR 0061, B1)', () => {
  const nova = (c: Partial<Component> = {}): Component => ({ ...(comp(createEmptyProject('t')) as Component), order: 0, ...c });

  it('sem inclinação a matriz é idêntica ao comportamento antigo (20 casos, semente fixa)', () => {
    const r = gerador(34);
    for (let i = 0; i < 20; i++) {
      const c = nova({ x: r() * 20 - 10, y: r() * 20 - 10, z: r() * 3, rotation: (r() - 0.5) * 2 * Math.PI, mirrored: r() > 0.5 });
      const local: [number, number] = [r() * 2, r() * 2];
      const lz = r();
      const [ex, ey] = mundo(c, local);
      const p = pontoNoMundo(c, { x: local[0], y: local[1], z: lz });
      expect(p.x).toBeCloseTo(ex, 12);
      expect(p.y).toBeCloseTo(ey, 12);
      expect(p.z).toBeCloseTo(c.z + lz, 12);
      expect(pontoNoMundo({ ...c, inclinacao: [0, 0] }, { x: local[0], y: local[1], z: lz })).toEqual(p);
    }
  });
  it('N9: tubo deitado (inclinação π/2) leva o ponto local (0,0,L) a +X', () => {
    const p = pontoNoMundo(nova({ x: 0, y: 0, z: 0, inclinacao: [Math.PI / 2, 0] }), { x: 0, y: 0, z: 2 });
    expect(p.x).toBeCloseTo(2, 12);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(0, 12);
    expect(matrizDoComponente(nova()).length).toBe(16);
  });
  it('mover, girar e espelhar preservam a inclinação; o ponto do mundo acompanha a transformação', () => {
    const c = nova({ x: 1, y: 2, z: 0.5, rotation: 0.3, inclinacao: [Math.PI / 2, 0.4] });
    const local = { x: 0.1, y: 0.2, z: 1.5 };
    const antes = pontoNoMundo(c, local);
    const girado = transformComponent(c, { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 });
    expect(girado.inclinacao).toEqual([Math.PI / 2, 0.4]);
    const pg = pontoNoMundo(girado, local);
    expect(pg.x).toBeCloseTo(-antes.y, 10);
    expect(pg.y).toBeCloseTo(antes.x, 10);
    expect(pg.z).toBeCloseTo(antes.z, 10);
    const espelhado = transformComponent(girado, { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    expect(espelhado.inclinacao).toEqual([Math.PI / 2, 0.4]);
    expect(espelhado.mirrored).toBe(true);
    const pe = pontoNoMundo(espelhado, local);
    expect(pe.x).toBeCloseTo(pg.x, 10);
    expect(pe.y).toBeCloseTo(-pg.y, 10);
    expect(pe.z).toBeCloseTo(pg.z, 10);
    expect(transformComponent(c, { kind: 'translate', d: { x: 1, y: 1 } }).inclinacao).toEqual([Math.PI / 2, 0.4]);
  });
  it('componentIssue valida números finitos e a inclinação em [0, π]', () => {
    const p = base();
    expect(componentIssue(p, comp(p, { inclinacao: [Math.PI, -3] }))).toBeNull();
    expect(componentIssue(p, comp(p, { inclinacao: [Number.NaN, 0] }))).toMatch(/Inclinação/);
    expect(componentIssue(p, comp(p, { inclinacao: [0, Number.POSITIVE_INFINITY] }))).toMatch(/Inclinação/);
    expect(componentIssue(p, comp(p, { inclinacao: [-0.1, 0] }))).toMatch(/entre 0 e π/);
    expect(componentIssue(p, comp(p, { inclinacao: [3.2, 0] }))).toMatch(/entre 0 e π/);
  });
  it('setComponentInclination aplica, valida, desfaz e refaz', () => {
    const s = new ProjectStore(createEmptyProject('t'));
    s.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    s.exec({ type: 'addComponent', component: comp(s.project) });
    s.exec({ type: 'setComponentInclination', id: 'c1', inclinacao: [1, 0.5] });
    expect(s.undoLabel).toBe('Inclinar componente');
    expect((s.project.elements.c1 as Component).inclinacao).toEqual([1, 0.5]);
    expect(() => s.exec({ type: 'setComponentInclination', id: 'c1', inclinacao: [4, 0] })).toThrow(/entre 0 e π/);
    expect(() => s.exec({ type: 'setComponentInclination', id: 'nao', inclinacao: [1, 0] })).toThrow(/inexistente/);
    s.undo();
    expect((s.project.elements.c1 as Component).inclinacao).toBeUndefined();
    s.redo();
    expect((s.project.elements.c1 as Component).inclinacao).toEqual([1, 0.5]);
  });
  it('a cópia preserva a inclinação e não copia as ligações', () => {
    let p = base();
    p = applyCommand(p, { type: 'addComponent', component: comp(p, { inclinacao: [1, 0.2], ligacoes: { l1: { componenteId: 'outro', ligacaoId: 'l2' } } }) });
    const q = applyCommand(p, { type: 'transform', ids: ['c1'], transform: { kind: 'translate', d: { x: 2, y: 0 } }, copy: { idMap: { c1: 'c1b' } } } as Command);
    const copia = q.elements.c1b as Component;
    expect(copia.inclinacao).toEqual([1, 0.2]);
    expect(copia.ligacoes).toBeUndefined();
    expect((q.elements.c1 as Component).ligacoes).toBeDefined();
  });
});
