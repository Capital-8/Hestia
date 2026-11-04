import { createEmptyProject, FAMILIA_ARMARIO, makeWall, ProjectStore, type Component, type Id } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { criarFila, facesDaParede, pedidoDaTela, previaDaFila, type EntradaDaFila } from './montarFilaLogica.ts';

const TOL = 9;

function storeComParede(extra: Partial<Parameters<typeof makeWall>[0]> = {}): ProjectStore {
  const s = new ProjectStore(createEmptyProject('fila'));
  s.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  s.exec({
    type: 'addWall',
    wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...extra }),
  });
  return s;
}

function entrada(extra: Partial<EntradaDaFila> = {}): EntradaDaFila {
  return {
    levelId: 'lv_0',
    wallId: 'w1',
    lado: 'esquerdo',
    inicio: 0,
    comprimento: 1.4,
    linhas: [
      { familyId: FAMILIA_ARMARIO.id, typeId: 'A60' },
      { familyId: FAMILIA_ARMARIO.id, typeId: 'A80' },
    ],
    preencher: false,
    ...extra,
  };
}

describe('facesDaParede', () => {
  it('devolve a face esquerda em y = espessura/2 e a direita invertida de b para a', () => {
    const faces = facesDaParede(storeComParede().project, 'lv_0', 'w1');
    expect(faces).not.toBeNull();
    expect(faces).toHaveLength(2);
    expect(faces![0]!.lado).toBe('esquerdo');
    expect(faces![0]!.face.a.x).toBeCloseTo(0, TOL);
    expect(faces![0]!.face.a.y).toBeCloseTo(0.092, TOL);
    expect(faces![0]!.face.b.x).toBeCloseTo(4, TOL);
    expect(faces![0]!.face.b.y).toBeCloseTo(0.092, TOL);
    expect(faces![1]!.lado).toBe('direito');
    expect(faces![1]!.face.a.x).toBeCloseTo(4, TOL);
    expect(faces![1]!.face.a.y).toBeCloseTo(-0.092, TOL);
    expect(faces![1]!.face.b.x).toBeCloseTo(0, TOL);
    expect(faces![1]!.face.b.y).toBeCloseTo(-0.092, TOL);
  });

  it('parede curva ou inexistente devolve null', () => {
    expect(facesDaParede(storeComParede({ sag: 0.2 }).project, 'lv_0', 'w1')).toBeNull();
    expect(facesDaParede(storeComParede().project, 'lv_0', 'nao_existe')).toBeNull();
  });

  it('parede de outro nível devolve null', () => {
    expect(facesDaParede(storeComParede({ levelId: 'lv_1' }).project, 'lv_0', 'w1')).toBeNull();
  });
});

describe('pedidoDaTela', () => {
  it('sem módulos devolve null', () => {
    expect(pedidoDaTela(storeComParede().project, entrada({ linhas: [] }))).toBeNull();
  });

  it('usa a face do lado escolhido e um idBase novo começando por fila_', () => {
    const pedido = pedidoDaTela(storeComParede().project, entrada({ lado: 'direito' }));
    expect(pedido).not.toBeNull();
    expect(pedido!.idBase.startsWith('fila_')).toBe(true);
    expect(pedido!.face.a.x).toBeCloseTo(4, TOL);
    expect(pedido!.face.a.y).toBeCloseTo(-0.092, TOL);
    expect(pedido!.modulos).toHaveLength(2);
  });
});

describe('previaDaFila', () => {
  it('monta [A60, A80] com as larguras do tipo', () => {
    const previa = previaDaFila(storeComParede().project, entrada());
    expect(previa).not.toBeNull();
    expect(previa!.larguras).toHaveLength(2);
    expect(previa!.larguras[0]).toBeCloseTo(0.6, TOL);
    expect(previa!.larguras[1]).toBeCloseTo(0.8, TOL);
    expect(previa!.componentes).toHaveLength(2);
  });
});

describe('criarFila', () => {
  it('cria 2 componentes e 1 conjunto com linha e um único desfazer remove tudo', () => {
    const s = storeComParede();
    const antes = s.project;
    const r = criarFila(s, entrada());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ids).toHaveLength(2);

    const componentes = Object.values(s.project.elements).filter((e): e is Component => e.kind === 'component');
    expect(componentes).toHaveLength(2);
    const grupos = Object.values(s.project.componentGroups ?? {});
    expect(grupos).toHaveLength(1);
    const grupo = grupos[0]!;
    expect(grupo.linha).toBeDefined();
    expect(grupo.membros).toEqual(r.ids);
    for (const componente of componentes) expect(componente.groupId).toBe(grupo.id);

    s.undo();
    expect(Object.values(s.project.elements).filter((e) => e.kind === 'component')).toHaveLength(0);
    expect(Object.keys(s.project.componentGroups ?? {})).toHaveLength(0);
    expect(Object.keys(s.project.elements).sort()).toEqual(Object.keys(antes.elements).sort());
  });

  it('carrega da biblioteca a família ausente e as dependências dela', () => {
    const s = new ProjectStore(createEmptyProject('fila'));
    s.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }),
    });
    const ids: Id[] = ['fam_comoda'];
    const r = criarFila(s, entrada({ linhas: [{ familyId: ids[0]!, typeId: null }] }));
    expect(r.ok).toBe(true);
    expect(s.project.componentFamilies?.['fam_comoda']).toBeDefined();
    expect(s.project.componentFamilies?.['fam_gaveta']).toBeDefined();
  });
});
