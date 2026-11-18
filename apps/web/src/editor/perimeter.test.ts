import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SketchTarget } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { servicoTerreno } from '@hestia/engine';
import { PerimeterTool, addSegs, newDraft, selectSegs, type NewSeg } from '@hestia/tools';
import { editor } from './controller.ts';
import { perimeterActions, usePerimeter } from './perimeter.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';

/** Tecla sem modificadores, como o `KeyboardEvent` que o App entrega ao controlador. */
const tecla = (key: string, ctrl = false): KeyboardEvent => ({ key, ctrlKey: ctrl, metaKey: false, shiftKey: false, altKey: false }) as unknown as KeyboardEvent;

const retangulo = (x0: number, y0: number, x1: number, y1: number): NewSeg[] => [
  { a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
  { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
  { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
  { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
];

/** A ferramenta aberta pelo modo (é a ferramenta ativa do controlador). */
const ferramenta = (): PerimeterTool => {
  const t = editor.activeTool;
  if (!(t instanceof PerimeterTool)) throw new Error('a ferramenta ativa não é o perímetro');
  return t;
};

/** Põe o rascunho (como se as linhas tivessem sido desenhadas) na ferramenta aberta. */
const desenhar = (target: SketchTarget, segs: NewSeg[]): void => {
  ferramenta().loadDraft(addSegs(newDraft(target), segs));
};

/** Projeto vazio e opções de ferramenta padrão (os testes mudam as opções e não devem vazar para o seguinte). */
const iniciar = (): void => {
  useUi.setState({ options: DEFAULT_OPTIONS });
  editor.load(createEmptyProject(), 'teste.hestia.json');
};

/** Quantidade de elementos de um tipo no projeto da edição. */
const conta = (kind: string, p: Project = editor.project): number => Object.values(p.elements).filter((e) => e.kind === kind).length;

describe('modo de perímetro: entrada pela faixa', () => {
  beforeEach(iniciar);

  it('Piso, Laje, Forro e Telhado abrem o modo para o alvo, com a ferramenta de perímetro e a forma linha', () => {
    for (const [id, target] of [['floor', 'floor'], ['slab', 'slab'], ['ceiling', 'ceiling'], ['roof', 'roof']] as const) {
      editor.setTool(id);
      expect(useUi.getState().tool).toBe('perimeter');
      expect(editor.activeTool.id).toBe('perimeter');
      const v = editor.perimetro.view();
      expect(v.active).toBe(true);
      expect(v.target).toBe(target);
      expect(v.shape).toBe('line');
      expect(v.editing).toBeUndefined();
      editor.perimetro.cancel();
    }
  });

  it('a barra começa com as opções de ferramenta atuais (balanço e inclinação do telhado, cota do piso)', () => {
    useUi.setState({ options: { ...useUi.getState().options, roofOverhang: 0.8, roofSlope: 25, floorOffset: 0.1 } });
    editor.setTool('roof');
    expect(editor.perimetro.view().options).toEqual({ overhang: 0.8, slopePct: 25, extendToCore: false, heightOffset: 0 });
    perimeterActions.cancel();
    editor.setTool('floor');
    expect(editor.perimetro.view().options.heightOffset).toBe(0.1);
    perimeterActions.cancel();
  });

  it('ferramentas fora do perímetro seguem o caminho normal', () => {
    editor.setTool('wall');
    expect(useUi.getState().tool).toBe('wall');
    expect(editor.perimetro.view().active).toBe(false);
  });

  it('o modo aberto recusa trocar de ferramenta: fica o mesmo modo, com aviso na barra', () => {
    editor.setTool('floor');
    editor.setTool('wall');
    expect(editor.activeTool.id).toBe('perimeter');
    expect(editor.perimetro.view().active).toBe(true);
    expect(useUi.getState().status).toContain('Concluir ou Cancelar');
  });

  it('mudar de vista não conclui nem sai do modo', () => {
    editor.setTool('floor');
    editor.setView('3d');
    expect(useUi.getState().view).toBe('plan');
    expect(editor.perimetro.view().active).toBe(true);
    expect(useUi.getState().status).toContain('vista ou de nível');
  });

  it('Esc com o modo aberto não sai dele (o cancelamento é o botão)', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    expect(editor.key(tecla('Escape'))).toBe(true);
    expect(editor.perimetro.view().active).toBe(true);
  });

  it('Enter não conclui: só avisa onde está o botão', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    expect(editor.key(tecla('Enter'))).toBe(true);
    expect(editor.perimetro.view().active).toBe(true);
    expect(conta('floor')).toBe(0);
    expect(useUi.getState().status).toContain('use o botão Concluir');
  });

  it('Delete sem linha do perímetro selecionada não apaga elementos do projeto', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    editor.load(store.project, 'teste.hestia.json');
    editor.setTool('floor');
    useUi.setState({ selection: ['w1'] });
    editor.key(tecla('Delete'));
    expect(editor.project.elements.w1).toBeDefined();
  });

  it('a troca de projeto fecha o modo', () => {
    editor.setTool('floor');
    editor.load(createEmptyProject(), 'outro.hestia.json');
    expect(editor.perimetro.view().active).toBe(false);
    expect(useUi.getState().tool).toBe('select');
  });
});

describe('modo de perímetro: Concluir, Cancelar e edição', () => {
  beforeEach(iniciar);

  it('Concluir grava o piso num só passo de desfazer, seleciona o novo e fecha o modo', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    perimeterActions.finish();
    expect(conta('floor')).toBe(1);
    const id = useUi.getState().selection[0];
    expect(id && editor.project.elements[id]?.kind).toBe('floor');
    expect(editor.perimetro.view().active).toBe(false);
    expect(useUi.getState().tool).toBe('select');
    editor.store.undo();
    expect(conta('floor')).toBe(0);
  });

  it('Concluir com contorno aberto não cria nada: o modo fica e o motivo vai para a barra', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3).slice(0, 3));
    perimeterActions.finish();
    expect(conta('floor')).toBe(0);
    expect(editor.perimetro.view().active).toBe(true);
    expect(useUi.getState().status).toContain('Perímetro não concluído');
  });

  it('Concluir o telhado com a inclinação zero é recusado, sem telhado', () => {
    editor.setTool('roof');
    desenhar('roof', retangulo(0, 0, 6, 4));
    perimeterActions.setOptions({ slopePct: 0 });
    perimeterActions.finish();
    expect(conta('roof')).toBe(0);
    expect(editor.perimetro.view().active).toBe(true);
    expect(useUi.getState().status).not.toBe('');
  });

  it('Concluir o telhado de retângulo cria o telhado com águas', () => {
    editor.setTool('roof');
    desenhar('roof', retangulo(0, 0, 6, 4));
    perimeterActions.finish();
    expect(conta('roof')).toBe(1);
    expect(useUi.getState().status).toContain('Telhado criado');
    editor.store.undo();
    expect(conta('roof')).toBe(0);
  });

  it('Cancelar descarta o rascunho, fecha o modo e não grava', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    perimeterActions.cancel();
    expect(editor.perimetro.view().active).toBe(false);
    expect(conta('floor')).toBe(0);
    expect(useUi.getState().tool).toBe('select');
  });

  it('editar um piso abre o contorno dele, e Concluir altera o mesmo elemento (um só passo de desfazer)', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    perimeterActions.finish();
    const id = useUi.getState().selection[0]!;
    perimeterActions.edit(id);
    expect(editor.perimetro.view().editing).toBe(id);
    expect(editor.perimetro.view().draft?.segs).toHaveLength(4);
    perimeterActions.setOptions({ heightOffset: 0.15 });
    perimeterActions.finish();
    const el = editor.project.elements[id];
    expect(el?.kind === 'floor' && el.heightOffset).toBe(0.15);
    expect(conta('floor')).toBe(1);
    editor.store.undo();
    expect(editor.project.elements[id]?.kind === 'floor' && editor.project.elements[id].heightOffset).toBe(0);
  });

  it('editar piso ou laje vinculado às paredes é recusado já na abertura, com o caminho (Desvincular)', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    perimeterActions.finish();
    const id = useUi.getState().selection[0]!;
    editor.store.exec({ type: 'updateElements', ids: [id], patch: { outlineSource: { mode: 'perimeter', linked: true, seed: { x: 2, y: 1.5 } } } });
    perimeterActions.edit(id);
    expect(editor.perimetro.view().active).toBe(false);
    expect(useUi.getState().status).toContain('Desvincular');
  });

  it('editar um elemento sem perímetro (parede) é recusado na barra', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    editor.load(store.project, 'teste.hestia.json');
    perimeterActions.edit('w1');
    expect(editor.perimetro.view().active).toBe(false);
    expect(useUi.getState().status).toContain('não tem perímetro editável');
  });
});

describe('modo de perímetro: barra, forma e aresta', () => {
  beforeEach(iniciar);

  it('a forma escolhida na galeria chega à visão; linha de inclinação só existe no telhado', () => {
    editor.setTool('floor');
    perimeterActions.setShape('rect');
    expect(editor.perimetro.view().shape).toBe('rect');
    perimeterActions.setLineKind('slope');
    expect(editor.perimetro.view().lineKind).toBe('boundary');
    expect(useUi.getState().status).toContain('só existe no telhado');
  });

  it('setOptions no telhado muda o padrão do rascunho, que a aresta selecionada mostra', () => {
    editor.setTool('roof');
    perimeterActions.setOptions({ slopePct: 40, overhang: 0.3 });
    expect(ferramenta().draft().defaults).toMatchObject({ slopePct: 40, overhang: 0.3 });
  });

  it('setEdge muda a inclinação da aresta selecionada, e a visão mostra a aresta', () => {
    editor.setTool('roof');
    const d = addSegs(newDraft('roof'), retangulo(0, 0, 6, 4));
    ferramenta().loadDraft(selectSegs(d, [d.segs[0]!.id]));
    perimeterActions.setEdge({ slopePct: 45 });
    const aresta = editor.perimetro.view().selectedEdge;
    expect(aresta).toMatchObject({ index: 0, total: 4, length: 6, definesSlope: true, slopePct: 45 });
    perimeterActions.finish();
    expect(conta('roof')).toBe(1);
  });

  it('Ctrl+A com o modo aberto seleciona todas as linhas do esboço', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    expect(editor.key(tecla('a', true))).toBe(true);
    expect(ferramenta().draft().selected).toHaveLength(4);
  });

  it('sem aresta selecionada, a visão não tem aresta', () => {
    editor.setTool('roof');
    desenhar('roof', retangulo(0, 0, 6, 4));
    expect(editor.perimetro.view().selectedEdge).toBeNull();
  });

  it('a visão fica fechada, com a barra de status, depois de Concluir', () => {
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    perimeterActions.finish();
    const v = editor.perimetro.view();
    expect(v).toMatchObject({ active: false, draft: null, result: null, selectedEdge: null });
    expect(v.status).toBe(useUi.getState().status);
  });
});

describe('ferramentas de alvo com modo aberto', () => {
  it('cada alvo tem o seu modo, e qualquer outro alvo é recusado enquanto o modo está aberto', () => {
    iniciar();
    const alvos: SketchTarget[] = ['roof', 'floor', 'slab', 'ceiling'];
    for (const t of alvos) {
      editor.setTool(t);
      expect(editor.perimetro.view().target).toBe(t);
      editor.setTool(alvos[(alvos.indexOf(t) + 1) % alvos.length]!);
      expect(editor.perimetro.view().target).toBe(t);
      perimeterActions.cancel();
    }
  });
});

describe('usePerimeter (tela)', () => {
  beforeEach(iniciar);

  it('entrega a visão atual do modo a quem renderiza, e a visão fechada fora dele', () => {
    const Sonda = (): ReactElement => {
      const v = usePerimeter();
      return createElement('span', null, `${v.active}|${v.target}|${v.shape}`);
    };
    expect(renderToStaticMarkup(createElement(Sonda))).toContain('>false|roof|line<');
    editor.setTool('floor');
    expect(renderToStaticMarkup(createElement(Sonda))).toContain('>true|floor|line<');
    perimeterActions.cancel();
  });
});

describe('modo de perímetro: seleção ao cancelar a edição', () => {
  beforeEach(iniciar);

  /** Cria um piso ou telhado com o modo e Concluir, que já deixa o elemento selecionado. */
  const criar = (target: 'floor' | 'roof', x = 0) => {
    editor.setTool(target);
    desenhar(target, retangulo(x, 0, x + 6, 4));
    perimeterActions.finish();
    return useUi.getState().selection[0]!;
  };

  it.each(['floor', 'roof'] as const)('editar um %s e cancelar devolve a seleção de antes, e o elemento fica intacto', (target) => {
    const a = criar(target);
    const b = criar(target, 10);
    useUi.setState({ selection: [a, b] });
    const original = editor.project.elements[a];
    perimeterActions.edit(a);
    expect(useUi.getState().selection).toEqual([]);
    perimeterActions.cancel();
    expect(useUi.getState().selection).toEqual([a, b]);
    expect(editor.project.elements[a]).toBe(original);
    expect(editor.perimetro.view().active).toBe(false);
  });

  it('Concluir a edição continua selecionando o elemento regravado', () => {
    const a = criar('floor');
    perimeterActions.edit(a);
    perimeterActions.finish();
    expect(useUi.getState().selection).toEqual([a]);
    expect(editor.project.elements[a]?.kind).toBe('floor');
  });

  it('cancelar uma criação não seleciona nada', () => {
    const a = criar('floor');
    useUi.setState({ selection: [a] });
    editor.setTool('slab');
    perimeterActions.cancel();
    expect(useUi.getState().selection).toEqual([]);
    expect(conta('slab')).toBe(0);
    expect(conta('floor')).toBe(1);
  });
});

describe('modo de perímetro: gravidade (G1)', () => {
  beforeEach(iniciar);
  afterEach(() => { vi.restoreAllMocks(); useUi.setState({ gravidade: false }); });

  const alturaDoPiso = (): number => {
    const f = Object.values(editor.project.elements).find((e) => e.kind === 'floor');
    return f && f.kind === 'floor' ? f.heightOffset : Number.NaN;
  };

  it('ligada: o piso concluído nasce na cota do terreno sob o primeiro vértice (menos a elevação do nível)', () => {
    vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockReturnValue([{ z: 1.25, declividade: 0.1, terrenoId: 'tn' }]);
    useUi.setState({ gravidade: true });
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    perimeterActions.finish();
    expect(conta('floor')).toBe(1);
    expect(alturaDoPiso()).toBeCloseTo(1.25 - (editor.project.levels[0]?.elevation ?? 0), 9);
  });

  it('desligada: o piso concluído não muda (altura da barra, sem consultar o terreno)', () => {
    const espiao = vi.spyOn(servicoTerreno(), 'cotaDoTerreno').mockReturnValue([{ z: 1.25, declividade: 0.1, terrenoId: 'tn' }]);
    useUi.setState({ gravidade: false });
    editor.setTool('floor');
    desenhar('floor', retangulo(0, 0, 4, 3));
    perimeterActions.finish();
    expect(conta('floor')).toBe(1);
    expect(alturaDoPiso()).toBe(0);
    expect(espiao).not.toHaveBeenCalled();
  });
});
