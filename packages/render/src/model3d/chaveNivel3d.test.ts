import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLevel, makeRoof, makeWall, type Command, type Id, type Project } from '@hestia/model';
import { assinaturasDoProjeto, chavesDeNivel, hashTexto } from './chaveNivel3d.ts';

/** Projeto com `n` pavimentos (cota de 3 m) e quatro paredes por nível, como o gerador do baseline. */
function predio(n: number): Project {
  const store = new ProjectStore(createEmptyProject('Chaves por nível'));
  const cmds: Command[] = [];
  const levels: Id[] = [];
  for (let i = 0; i < n; i++) {
    const id = i === 0 ? 'lv_0' : i === 1 ? 'lv_1' : `ch_lv_${i}`;
    levels.push(id);
    cmds.push({ type: 'upsertLevel', level: makeLevel({ id, name: `Pavimento ${i + 1}`, elevation: i * 3 }) });
  }
  const contorno: Array<[[number, number], [number, number]]> = [[[0, 0], [4, 0]], [[4, 0], [4, 4]], [[4, 4], [0, 4]], [[0, 4], [0, 0]]];
  levels.forEach((levelId, i) => {
    contorno.forEach(([[ax, ay], [bx, by]], j) => {
      cmds.push({ type: 'addWall', wall: makeWall({ id: `ch_w_${i}_${j}`, typeId: 'wt_ext19', levelId, a: { x: ax, y: ay }, b: { x: bx, y: by } }) });
    });
  });
  store.exec({ type: 'batch', commands: cmds });
  return store.project;
}

/** Projeto com a parede `j` do pavimento `i` deslocada em x (só esse elemento muda). */
function comParede(p: Project, i: number, j: number, dx: number): Project {
  const w = p.elements[`ch_w_${i}_${j}`];
  if (!w || w.kind !== 'wall') throw new Error('parede de teste não encontrada');
  return { ...p, elements: { ...p.elements, [w.id]: { ...w, b: { x: w.b.x + dx, y: w.b.y } } } };
}

const CAIXA = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

/**
 * Prédio de `n` pavimentos com um telhado no último nível. Com `anexar`, a parede do primeiro pavimento fica com o topo
 * anexado ao telhado (`attachTopToRoof`), que o motor lê de qualquer nível (`axisRoofs`).
 */
function comTelhado(n: number, anexar: boolean): Project {
  const store = new ProjectStore(predio(n));
  const ultimo = `ch_lv_${n - 1}`;
  store.exec({ type: 'addRoof', roof: makeRoof({ id: 'ch_r', typeId: 'rt_ceramica', levelId: ultimo, boundary: CAIXA, shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 }, heightOffset: 3 }) });
  if (anexar) store.exec({ type: 'updateElements', ids: ['ch_w_0_0'], patch: { attachTopToRoof: true } });
  return store.project;
}

/** Projeto igual, com a cota do beiral do telhado mudada (só o telhado muda). */
function beiral(p: Project, altura: number): Project {
  const s = new ProjectStore(p);
  s.exec({ type: 'updateElements', ids: ['ch_r'], patch: { heightOffset: altura } });
  return s.project;
}

const MARCA = '[false,false,false,"realistic"]';

/** Chaves como lista, na ordem dos pavimentos do projeto. */
const chaves = (p: Project, marca = MARCA): string[] => {
  const m = chavesDeNivel(p, marca);
  return p.levels.map((l) => m.get(l.id)!);
};

describe('chaves de nível (conteúdo do pavimento e dos vizinhos por cota)', () => {
  it('projeto igual dá as mesmas chaves, e a chave é um hash curto', () => {
    const p = predio(5);
    expect(chaves(p)).toEqual(chaves(predio(5)));
    expect(chaves(p).every((k) => k.length > 0 && k.length <= 16)).toBe(true);
  });

  it('editar uma parede refaz só o pavimento dela e os vizinhos por cota (acima e abaixo)', () => {
    const p = predio(5);
    const antes = chaves(p);
    const depois = chaves(comParede(p, 2, 1, 0.25));
    const mudou = depois.map((k, i) => k !== antes[i]);
    expect(mudou).toEqual([false, true, true, true, false]);
  });

  it('editar o pavimento mais baixo refaz o dele e o de cima, não o resto', () => {
    const p = predio(4);
    const antes = chaves(p);
    const mudou = chaves(comParede(p, 0, 0, 0.1)).map((k, i) => k !== antes[i]);
    expect(mudou).toEqual([true, true, false, false]);
  });

  it('ocultar uma parede refaz só o pavimento dela e os vizinhos por cota, não o projeto inteiro', () => {
    const p = predio(6);
    const vis = (ocultos: string[], revelados: string[] = []) => {
      const m = chavesDeNivel(p, MARCA, { ocultos: new Set(ocultos), revelados: new Set(revelados) });
      return p.levels.map((l) => m.get(l.id)!);
    };
    const livre = vis([]);
    expect(livre).toEqual(chaves(p));
    const mudou = vis(['ch_w_2_1']).map((k, i) => k !== livre[i]);
    expect(mudou).toEqual([false, true, true, true, false, false]);
    // Revelar também é por nível, e ocultar ≠ revelar o mesmo id.
    expect(vis([], ['ch_w_4_0']).map((k, i) => k !== livre[i])).toEqual([false, false, false, true, true, true]);
    expect(vis(['ch_w_2_1'])).not.toEqual(vis([], ['ch_w_2_1']));
  });

  it('id oculto que não é elemento de nível (global) muda todas as chaves, como antes', () => {
    const p = predio(3);
    const livre = chavesDeNivel(p, MARCA);
    const g = chavesDeNivel(p, MARCA, { ocultos: new Set(['nao-existe']), revelados: new Set() });
    expect(p.levels.every((l) => g.get(l.id) !== livre.get(l.id))).toBe(true);
  });

  it('mudar a vista (tema, arestas, sombras, estilo) muda todas as chaves', () => {
    const p = predio(3);
    const antes = chaves(p);
    const escuro = chaves(p, '[true,false,false,"realistic"]');
    expect(escuro.every((k, i) => k !== antes[i])).toBe(true);
  });

  it('o que não vai para a geometria 3D (cortes, vistas de planta com cota, ocultos, intervalo e gráficos, esquemas de cor, categorias, contador, nome) não muda nenhuma chave', () => {
    const p = predio(4);
    const antes = chaves(p);
    const outro = {
      ...p,
      name: 'Outro nome',
      nextOrder: p.nextOrder + 50,
      views: [{ id: 'cx', name: 'Corte', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 5 }],
      planViews: p.planViews.map((v) => ({ ...v, viewRange: { ...v.viewRange, cut: 1 }, hidden: { categories: ['wall'] }, annotations: { ...v.annotations, dimensions: [{ id: 'cota_x', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 }] } })),
      roomCategories: [],
      colorSchemes: [],
    } as unknown as Project;
    expect(chaves(outro)).toEqual(antes);
    // Mas os ajustes da vista 3D e as configurações do projeto continuam mudando tudo.
    const com3d = { ...p, view3d: { ...(p.view3d ?? {}), shadows: !(p.view3d?.shadows ?? false) } } as unknown as Project;
    expect(chaves(com3d).every((k, i) => k !== antes[i])).toBe(true);
    const configurado = { ...p, settings: { ...p.settings, joinTolerance: (p.settings?.joinTolerance ?? 0.02) + 0.01 } } as unknown as Project;
    expect(chaves(configurado).every((k, i) => k !== antes[i])).toBe(true);
  });

  it('mudar algo do projeto que não é elemento (tipo, cota de referência, altura padrão) muda todas as chaves', () => {
    const p = predio(3);
    const antes = chaves(p);
    const outro = { ...p, defaults: { ...p.defaults, wallHeight: p.defaults.wallHeight + 0.1 } };
    expect(chaves(outro).every((k, i) => k !== antes[i])).toBe(true);
  });

  it('mudar a cota de um pavimento muda todas as chaves (a ordem e as alturas mudaram)', () => {
    const p = predio(3);
    const antes = chaves(p);
    const lv = p.levels[1]!;
    const outro = { ...p, levels: p.levels.map((l) => (l.id === lv.id ? { ...l, elevation: lv.elevation + 0.5 } : l)) };
    expect(chaves(outro).every((k, i) => k !== antes[i])).toBe(true);
  });

  it('elemento sem nível entra no bloco global: mudá-lo muda todas as chaves', () => {
    const p = predio(3);
    const antes = assinaturasDoProjeto(p).global;
    const sem = { ...p, elements: { ...p.elements, 'ch_solto': { kind: 'room', id: 'ch_solto' } as never } };
    expect(assinaturasDoProjeto(sem).global).not.toBe(antes);
  });

  it('a ordem dos pavimentos é pela cota: vizinho é o de cota logo abaixo e logo acima', () => {
    const p = predio(3);
    const invertido = { ...p, levels: [...p.levels].reverse() };
    expect(assinaturasDoProjeto(invertido).ordem).toEqual(['lv_0', 'lv_1', 'ch_lv_2']);
  });

  it('hashTexto é determinístico e distingue textos diferentes', () => {
    expect(hashTexto('abc')).toBe(hashTexto('abc'));
    expect(hashTexto('abc')).not.toBe(hashTexto('abd'));
  });

  it('nível com parede anexada ao telhado refaz quando um telhado de outro nível muda', () => {
    const p = comTelhado(5, true);
    const antes = chaves(p);
    const mudou = chaves(beiral(p, 3.5)).map((k, i) => k !== antes[i]);
    // lv_0 tem a parede anexada: lê o telhado do último nível (ch_lv_4), que é vizinho de ch_lv_3.
    expect(mudou).toEqual([true, false, false, true, true]);
  });

  it('sem parede anexada, o telhado de outro nível só muda a chave do nível dele e do vizinho de cota', () => {
    const p = comTelhado(5, false);
    const antes = chaves(p);
    const mudou = chaves(beiral(p, 3.5)).map((k, i) => k !== antes[i]);
    expect(mudou).toEqual([false, false, false, true, true]);
  });
});
