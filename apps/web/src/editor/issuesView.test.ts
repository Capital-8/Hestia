import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeFloor, makeGuardaCorpo, makeRoom, makeStair, makeWall, type Opening, type Project, type StairRun, type ValidationIssue, type Wall } from '@hestia/model';
import { groupIssues, issueTarget, summarize, worstSeverity } from './issuesView.ts';

const err = (code: string, elementId?: string): ValidationIssue => ({ severity: 'error', code, message: `erro ${code}`, ...(elementId ? { elementId } : {}) });
const warn = (code: string, elementId?: string): ValidationIssue => ({ severity: 'warning', code, message: `aviso ${code}`, ...(elementId ? { elementId } : {}) });

describe('resumo do botão', () => {
  it('vazio quando não há avisos', () => {
    expect(summarize([])).toBe('');
  });

  it('conta erros e avisos separados por ponto médio', () => {
    expect(summarize([err('a'), warn('b'), err('c'), warn('d'), warn('e')])).toBe('2 erros · 3 avisos');
  });

  it('usa o singular para uma unidade', () => {
    expect(summarize([err('a'), warn('b')])).toBe('1 erro · 1 aviso');
    expect(summarize([err('a')])).toBe('1 erro');
    expect(summarize([warn('a')])).toBe('1 aviso');
  });

  it('omite a categoria que não tem itens', () => {
    expect(summarize([warn('a'), warn('b'), warn('c'), warn('d')])).toBe('4 avisos');
  });
});

describe('agrupamento por severidade', () => {
  it('põe erros antes de avisos, mesmo quando vêm depois na lista', () => {
    const groups = groupIssues([warn('w1'), err('e1'), warn('w2')]);
    expect(groups.map((g) => g.severity)).toEqual(['error', 'warning']);
    expect(groups.map((g) => g.title)).toEqual(['Erros', 'Avisos']);
    expect(groups[0]!.items.map((i) => i.code)).toEqual(['e1']);
  });

  it('mantém a ordem original dentro de cada grupo', () => {
    const groups = groupIssues([warn('w1'), warn('w2'), warn('w3')]);
    expect(groups[0]!.items.map((i) => i.code)).toEqual(['w1', 'w2', 'w3']);
  });

  it('omite grupos vazios', () => {
    expect(groupIssues([warn('w')]).map((g) => g.severity)).toEqual(['warning']);
    expect(groupIssues([])).toEqual([]);
  });
});

describe('gravidade mais alta', () => {
  it('é null sem avisos, erro quando há algum erro, aviso no caso contrário', () => {
    expect(worstSeverity([])).toBeNull();
    expect(worstSeverity([warn('a')])).toBe('warning');
    expect(worstSeverity([warn('a'), err('b')])).toBe('error');
  });
});

describe('destino de "Ir para"', () => {
  const build = (): Project => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 2 } }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 1, y: 1 }, b: { x: 5, y: 1 } }) });
    const door: Opening = { id: 'o0', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
    s.exec({ type: 'addOpening', opening: door });
    return s.project;
  };

  it('parede: nível da parede e ponto médio', () => {
    expect(issueTarget(build(), warn('x', 'w0'))).toEqual({ elementId: 'w0', levelId: 'lv_0', center: { x: 2, y: 1 } });
  });

  it('abertura: nível e centro vêm da parede anfitriã, e a seleção é a própria abertura', () => {
    expect(issueTarget(build(), warn('x', 'o0'))).toEqual({ elementId: 'o0', levelId: 'lv_1', center: { x: 3, y: 1 } });
  });

  it('aviso sem elemento, ou com elemento que não existe mais, não tem destino', () => {
    expect(issueTarget(build(), warn('x'))).toBeNull();
    expect(issueTarget(build(), warn('x', 'nao_existe'))).toBeNull();
  });

  it('parede em nível inexistente: seleciona, mas sem trocar de nível', () => {
    const p = build();
    const orphan: Wall = { ...makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_9', a: { x: 0, y: 5 }, b: { x: 3, y: 5 } }), order: 99 };
    const withOrphan: Project = { ...p, elements: { ...p.elements, w2: orphan } };
    expect(issueTarget(withOrphan, warn('x', 'w2'))).toEqual({ elementId: 'w2', levelId: null, center: { x: 1.5, y: 5 } });
  });
});

describe('Ir para: escada', () => {
  it('aponta para o nível da escada e enquadra a caixa dos limites e espelhos', () => {
    const store = new ProjectStore(createEmptyProject());
    const c = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
    const run: StairRun = { id: 'r1', kind: 'run', boundaryLeft: [c(2, 0, 2, 3)], boundaryRight: [c(3, 0, 3, 3)], risers: [c(2, 1, 3, 1)], path: [] };
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_monolitica', levelId: 'lv_0', components: [run] }) });
    const t = issueTarget(store.project, { severity: 'warning', code: 'x', message: 'aviso', elementId: 'st1' });
    expect(t).not.toBeNull();
    expect(t!.levelId).toBe('lv_0');
    expect(t!.box).toEqual({ minX: 2, minY: 0, maxX: 3, maxY: 3 });
    expect(t!.center).toEqual({ x: 2.5, y: 1.5 });
  });
});

describe('ir para ambiente', () => {
  it('ambiente sem circuito: alvo no nível dele, centrado no ponto interior', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRoom', room: makeRoom({ id: 'rm1', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 2, y: 3 } }) });
    expect(issueTarget(s.project, err('room-point-outside', 'rm1'))).toEqual({ elementId: 'rm1', levelId: 'lv_0', center: { x: 2, y: 3 } });
  });
});

describe('Ir para dos avisos de contorno associativo (decisão 0023 §8.2c)', () => {
  it('contorno-aberto no piso aponta o piso e enquadra a caixa do contorno', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] }) });
    expect(issueTarget(s.project, warn('contorno-aberto', 'f1'))).toEqual({
      elementId: 'f1',
      levelId: 'lv_0',
      center: { x: 2, y: 1.5 },
      box: { minX: 0, minY: 0, maxX: 4, maxY: 3 },
    });
  });
});

describe('P9 · avisos informativos (wall-floor-partial)', () => {
  it('informação tem grupo próprio, depois dos avisos, e não deixa o botão vermelho', () => {
    const info = { severity: 'info' as const, code: 'wall-floor-partial', message: 'só parte' };
    const warn = { severity: 'warning' as const, code: 'x', message: 'aviso' };
    expect(groupIssues([info, warn]).map((g) => g.severity)).toEqual(['warning', 'info']);
    expect(groupIssues([info])[0]!.title).toBe('Informações');
    expect(worstSeverity([info])).toBe('info');
    expect(summarize([info, info])).toBe('2 informações');
  });
});

describe('Ir para: guarda-corpo', () => {
  it('manual: nível do guarda-corpo e caixa do caminho; hospedado: caixa da escada', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc1', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'manual', uso: 'varanda', caminho: [{ x: 1, y: 2, dz: 0 }, { x: 5, y: 4, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' } }) });
    const t = issueTarget(store.project, { severity: 'warning', code: 'gc-trecho-curto', message: 'aviso', elementId: 'gc1' });
    expect(t).toEqual({ elementId: 'gc1', levelId: 'lv_0', center: { x: 3, y: 3 }, box: { minX: 1, minY: 2, maxX: 5, maxY: 4 } });
    const c = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
    const run: StairRun = { id: 'r1', kind: 'run', boundaryLeft: [c(2, 0, 2, 3)], boundaryRight: [c(3, 0, 3, 3)], risers: [c(2, 1, 3, 1)], path: [] };
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_monolitica', levelId: 'lv_0', components: [run] }) });
    const lado = { lance: true, patamar: true };
    store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc2', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
    expect(issueTarget(store.project, { severity: 'warning', code: 'x', message: 'aviso', elementId: 'gc2' })!.box).toEqual({ minX: 2, minY: 0, maxX: 3, maxY: 3 });
  });
});
