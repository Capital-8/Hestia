import { describe, expect, it } from 'vitest';
import { ProjectStore, buildTemplate, createEmptyProject, makeWall, validateProject, type Opening, type Project, type ValidationIssue, type Wall } from './index.ts';

const wall = (id: string, ax: number, ay: number, bx: number, by: number, extra: Partial<Wall> = {}): Omit<Wall, 'order'> =>
  makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: ax, y: ay }, b: { x: bx, y: by }, ...extra });

const opening = (id: string, hostId: string, offset: number, typeId = 'ot_p80', extra: Partial<Opening> = {}): Opening => ({
  id,
  kind: typeId.startsWith('ot_j') ? 'window' : 'door',
  typeId,
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
  ...extra,
});

/** Projeto construído só com comandos (addWall/addOpening), como na aplicação. */
function build(walls: Array<Omit<Wall, 'order'>>, openings: Opening[] = []): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const w of walls) s.exec({ type: 'addWall', wall: w });
  for (const o of openings) s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

/** Insere um elemento direto no mapa, para casos que os comandos impediriam (referência quebrada, vão fora da parede). */
function withRaw(p: Project, e: Wall | Opening): Project {
  return { ...p, elements: { ...p.elements, [e.id]: e } };
}

const codes = (issues: ValidationIssue[]): string[] => issues.map((i) => i.code);
const find = (issues: ValidationIssue[], code: string): ValidationIssue[] => issues.filter((i) => i.code === code);

describe('validação: paredes', () => {
  it('modelo válido não gera problemas; quina em encosto com acabamento não gera aviso (docs/08 §5.7: pareia por face)', () => {
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 4, 0, 4, 3)])))).toEqual([]);
  });

  it('comprimento zero é erro', () => {
    const issues = validateProject(build([wall('a', 1, 1, 1, 1)]));
    expect(codes(issues)).toEqual(['wall-zero-length']);
    expect(issues[0]).toMatchObject({ severity: 'error', elementId: 'a' });
  });

  it('comprimento de 0,5 mm é erro; 2 mm não é', () => {
    expect(codes(validateProject(build([wall('a', 0, 0, 0.0005, 0)])))).toEqual(['wall-zero-length']);
    expect(validateProject(build([wall('a', 0, 0, 0.002, 0)]))).toEqual([]);
  });

  it('a mensagem do comprimento mínimo segue as unidades do projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'setSettings', patch: { units: { smallLength: { unit: 'mm', decimals: 1 } } } });
    s.exec({ type: 'addWall', wall: wall('a', 0, 0, 0.0005, 0) });
    const issues = validateProject(s.project);
    expect(issues[0]!.message).toContain('0,5 mm');
    expect(issues[0]!.message).toContain('1,0 mm');
  });

  it('tipo de parede inexistente é erro', () => {
    const issues = validateProject(build([wall('a', 0, 0, 4, 0, { typeId: 'wt_nao_existe' })]));
    expect(codes(issues)).toEqual(['wall-type-missing']);
    expect(issues[0]).toMatchObject({ severity: 'error', elementId: 'a' });
  });

  it('nível inexistente é erro', () => {
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0, { levelId: 'lv_x' })])))).toEqual(['level-missing']);
  });

  it('topLevelId inexistente é erro', () => {
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0, { topLevelId: 'lv_x' })])))).toEqual(['top-level-missing']);
  });

  it('altura zero ou negativa é erro', () => {
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0, { height: 0 })])))).toEqual(['wall-height-invalid']);
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0, { height: -1 })])))).toEqual(['wall-height-invalid']);
  });

  it('topo por nível: topo que não fica acima da base é erro', () => {
    // lv_1 está em 3 m; com topOffset -3 o topo fica na cota 0, igual à base.
    const issues = validateProject(build([wall('a', 0, 0, 4, 0, { topLevelId: 'lv_1', topOffset: -3 })]));
    expect(codes(issues)).toEqual(['wall-height-invalid']);
  });

  it('topo por nível acima da base é válido', () => {
    expect(validateProject(build([wall('a', 0, 0, 4, 0, { topLevelId: 'lv_1', topOffset: 0 })]))).toEqual([]);
  });
});

describe('validação: aberturas', () => {
  const base = () => build([wall('w', 0, 0, 4, 0)]);

  it('abertura válida no meio da parede não gera problemas', () => {
    expect(validateProject(build([wall('w', 0, 0, 4, 0)], [opening('d', 'w', 2)]))).toEqual([]);
  });

  it('abertura sem parede anfitriã é erro', () => {
    const p = withRaw(base(), opening('d', 'nao_existe', 1));
    const issues = validateProject(p);
    expect(codes(issues)).toEqual(['opening-host-missing']);
    expect(issues[0]).toMatchObject({ severity: 'error', elementId: 'd' });
  });

  it('abertura cujo anfitrião é outra abertura é erro', () => {
    const p = withRaw(build([wall('w', 0, 0, 4, 0)], [opening('d', 'w', 2)]), opening('d2', 'd', 1));
    expect(codes(validateProject(p))).toEqual(['opening-host-missing']);
  });

  it('tipo de abertura inexistente é erro', () => {
    const issues = validateProject(build([wall('w', 0, 0, 4, 0)], [opening('d', 'w', 2, 'ot_nao_existe')]));
    expect(codes(issues)).toEqual(['opening-type-missing']);
    expect(issues[0]).toMatchObject({ severity: 'error', elementId: 'd' });
  });

  it('abertura que sai pela extremidade é aviso (vão direto no modelo)', () => {
    // offset 0,2 com porta de 0,8: vão de -0,2 a 0,6.
    const p = withRaw(base(), opening('d', 'w', 0.2));
    const issues = validateProject(p);
    expect(codes(issues)).toEqual(['opening-out-of-wall']);
    expect(issues[0]).toMatchObject({ severity: 'warning', elementId: 'd' });
  });

  it('parede menor que a abertura: o comando prende o vão e o aviso aparece', () => {
    // Parede de 0,6 m com porta de 0,8 m: clampOffset deixa o vão no meio, saindo 0,1 m de cada lado.
    const issues = validateProject(build([wall('w', 0, 0, 0.6, 0)], [opening('d', 'w', 0.3)]));
    expect(codes(issues)).toEqual(['opening-out-of-wall']);
  });

  it('vão encostado nas duas extremidades não é aviso', () => {
    // Porta de 0,8 com centro em 0,4: vão de 0 a 0,8, exatamente a parede.
    expect(validateProject(build([wall('w', 0, 0, 0.8, 0)], [opening('d', 'w', 0.4)]))).toEqual([]);
  });

  it('dois vãos que se cruzam na mesma parede são aviso', () => {
    // Janela 1,2 m em 1,0 (0,4 a 1,6) e porta 0,8 m em 1,5 (1,1 a 1,9).
    const issues = validateProject(build([wall('w', 0, 0, 4, 0)], [opening('j', 'w', 1, 'ot_j120'), opening('d', 'w', 1.5)]));
    expect(codes(issues)).toEqual(['opening-overlap']);
    expect(issues[0]).toMatchObject({ severity: 'warning' });
    expect(issues[0]!.message).toContain('"j"');
    expect(issues[0]!.message).toContain('"d"');
  });

  it('mesma posição ao longo da parede, mas em alturas disjuntas (janela alta sobre porta), não é aviso', () => {
    // Porta 0 a 2,10 m; janela com peitoril 2,2 m (2,2 a 3,4 m) na mesma posição.
    const p = build([wall('w', 0, 0, 4, 0)], [opening('d', 'w', 1.5), opening('j', 'w', 1.5, 'ot_j120', { sillOverride: 2.2 })]);
    expect(codes(validateProject(p))).toEqual([]);
  });

  it('alturas que se tocam exatamente (topo da porta = peitoril) não se sobrepõem', () => {
    const p = build([wall('w', 0, 0, 4, 0)], [opening('d', 'w', 1.5), opening('j', 'w', 1.5, 'ot_j120', { sillOverride: 2.1 })]);
    expect(codes(validateProject(p))).toEqual([]);
  });

  it('mesma posição e alturas que se cruzam continuam sendo aviso', () => {
    const p = build([wall('w', 0, 0, 4, 0)], [opening('d', 'w', 1.5), opening('j', 'w', 1.5, 'ot_j120', { sillOverride: 2.0 })]);
    expect(codes(validateProject(p))).toEqual(['opening-overlap']);
  });

  it('vãos vizinhos sem cruzamento não são aviso', () => {
    expect(validateProject(build([wall('w', 0, 0, 4, 0)], [opening('j', 'w', 1, 'ot_j120'), opening('d', 'w', 2.5)]))).toEqual([]);
  });

  it('vãos iguais em paredes diferentes não se cruzam', () => {
    const p = build([wall('w1', 0, 0, 4, 0), wall('w2', 0, 2, 4, 2)], [opening('d1', 'w1', 2), opening('d2', 'w2', 2)]);
    expect(validateProject(p)).toEqual([]);
  });
});

describe('validação: paredes sobrepostas (C14)', () => {
  it('colineares com 1 m em comum são aviso citando as duas', () => {
    const issues = validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 3, 0, 8, 0)]));
    expect(codes(issues)).toEqual(['wall-overlap']);
    expect(issues[0]).toMatchObject({ severity: 'warning', elementId: 'a' });
    expect(issues[0]!.message).toContain('"a"');
    expect(issues[0]!.message).toContain('"b"');
    expect(issues[0]!.message).toContain('100 cm');
  });

  it('paredes em sequência, encostadas na ponta, não são sobreposição', () => {
    expect(validateProject(build([wall('a', 0, 0, 2, 0), wall('b', 2, 0, 5, 0)]))).toEqual([]);
  });

  it('sobreposição de 3 cm fica abaixo do limite de 5 cm', () => {
    expect(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 3.97, 0, 8, 0)]))).toEqual([]);
  });

  it('sentido oposto também conta como colinear', () => {
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 4, 0, 0, 0)])))).toEqual(['wall-overlap']);
  });

  it('distância lateral de 0,5 cm conta; 2 cm não conta', () => {
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 0, 0.005, 4, 0.005)])))).toEqual(['wall-overlap']);
    expect(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 0, 0.02, 4, 0.02)]))).toEqual([]);
  });

  it('ângulo de 1,15° não conta, mesmo com eixos cruzando no meio do trecho', () => {
    // Eixo de b passa por (2, 0) com inclinação de ~1,15°: distância lateral zero, ângulo acima do limite.
    expect(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 1.5, -0.01, 2.5, 0.01)]))).toEqual([]);
  });

  it('ângulo de 0,5° com eixos cruzando no meio do trecho conta', () => {
    // b vai de (0,-h) a (4,h): ângulo de 0,5° e eixo passando pelo ponto (2,0).
    const h = 2 * Math.tan((0.5 * Math.PI) / 180);
    expect(codes(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 0, -h, 4, h)])))).toEqual(['wall-overlap']);
  });

  it('paredes colineares em níveis diferentes não são sobreposição', () => {
    const p = build([wall('a', 0, 0, 4, 0), wall('b', 3, 0, 8, 0, { levelId: 'lv_1' })]);
    expect(validateProject(p)).toEqual([]);
  });

  it('paredes não colineares que se cruzam não são sobreposição', () => {
    expect(validateProject(build([wall('a', 0, 0, 4, 0), wall('b', 2, -2, 2, 2)]))).toEqual([]);
  });
});

describe('validação: modelos iniciais', () => {
  it.each(['blank', 'house2', 'studio'] as const)('%s não gera nenhum problema', (id) => {
    expect(validateProject(buildTemplate(id))).toEqual([]);
  });
});

describe('validação: cobertura das regras', () => {
  it('cada código sai do mesmo conjunto documentado', () => {
    const p = build(
      [wall('z', 1, 1, 1, 1), wall('a', 0, 0, 4, 0, { typeId: 'x' }), wall('b', 3, 0, 8, 0, { levelId: 'lv_0', height: 0 })],
      [],
    );
    const issues = validateProject(withRaw(p, opening('d', 'nada', 1)));
    expect(find(issues, 'wall-zero-length')).toHaveLength(1);
    expect(find(issues, 'wall-type-missing')).toHaveLength(1);
    expect(find(issues, 'wall-height-invalid')).toHaveLength(1);
    expect(find(issues, 'opening-host-missing')).toHaveLength(1);
    expect(find(issues, 'wall-overlap')).toHaveLength(1);
  });
});
