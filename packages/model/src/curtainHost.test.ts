import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, validateProject, type CurtainHost, type CurtainSpec, type Project, type Wall, type WallType } from './index.ts';
import { applyCommand } from './commands.ts';
import { t } from './i18n.ts';

// Cortina embutida em parede comum (decisão 0056, §8, fase 5): embutir, o hospedeiro transformado/dividido/apagado,
// promoção a independente e validação. Hospedeiro w_host: parede comum de (0,0) a (6,0). Cortina w_ct de 4 m, que vira
// embutida num vão do hospedeiro (a, b e altura vêm do hospedeiro).

const base = (): WallType => createEmptyProject().wallTypes.wt_alv14!;

const grade = (): CurtainSpec => ({
  depth: 0.1,
  u: { mode: 'fixedNumber', count: 4 },
  v: { mode: 'fixedNumber', count: 2 },
  mullions: {
    interiorVertical: 'mul_ret_50x100',
    interiorHorizontal: 'mul_ret_50x100',
    borderStart: 'mul_ret_50x100',
    borderEnd: 'mul_ret_50x100',
    borderBottom: 'mul_ret_50x100',
    borderTop: 'mul_ret_50x100',
    corner: null,
    joinPriority: 'vertical',
  },
  defaultPanelTypeId: 'pnl_vidro_10',
});

const novoProjeto = (): Project => {
  const p = createEmptyProject();
  for (const id of Object.keys(p.wallTypes)) if (p.wallTypes[id]!.family === 'curtain') delete p.wallTypes[id];
  return p;
};

const TIPO_CORTINA = (): WallType => ({ ...base(), id: 'wt_ct', name: 'Cortina teste', family: 'curtain', curtain: grade(), layers: [], strips: [], wrapInserts: 'none', wrapEnds: 'none' });

/** Hospedeiro w_host (parede comum de 6 m) e cortina w_ct (4 m, ainda independente). */
function cenario(): ProjectStore {
  const s = new ProjectStore(novoProjeto());
  s.exec({ type: 'upsertWallType', wallType: TIPO_CORTINA() });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_host', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  s.exec({ type: 'addWall', wall: { ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: {} } });
  return s;
}

const HOSPEDEIRO: CurtainHost = { wallId: 'w_host', offset: 3, width: 2, sill: 0.9, height: 1.5 };
const embutir = (s: ProjectStore, host: CurtainHost = HOSPEDEIRO) => s.exec({ type: 'setCurtainHost', wallId: 'w_ct', host });

const parede = (s: ProjectStore, id: string): Wall => s.project.elements[id] as Wall;
const x = (w: Wall) => [w.a.x, w.b.x].sort((p, q) => p - q);
const perto = (v: number, esperado: number) => expect(v).toBeCloseTo(esperado, 9);

describe('cortina embutida: embutir (§8.1)', () => {
  it('a cortina assume o vão do hospedeiro: a, b, base e altura derivados, sem nível de topo', () => {
    const s = cenario();
    embutir(s);
    const w = parede(s, 'w_ct');
    perto(w.a.x, 2);
    perto(w.b.x, 4);
    perto(w.a.y, 0);
    perto(w.baseOffset, parede(s, 'w_host').baseOffset + 0.9);
    perto(w.height, 1.5);
    expect(w.topLevelId).toBeNull();
    expect(w.curtain?.host).toEqual(HOSPEDEIRO);
  });

  it('vão fora da parede hospedeira é recusado', () => {
    const s = cenario();
    expect(() => embutir(s, { ...HOSPEDEIRO, offset: 5.5 })).toThrow(t('pt', 'md_ct_host_range'));
    expect(parede(s, 'w_ct').curtain).toEqual({});
  });

  it('vão que cobriria uma porta do hospedeiro por inteiro é recusado; parcial passa e é aviso', () => {
    const s = cenario();
    s.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w_host', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    expect(() => embutir(s)).toThrow(t('pt', 'md_ct_host_covers_opening'));
    // Porta de 0,80 centrada em 4,9 (de 4,5 a 5,3) cruza a borda do vão [3, 5] sem cobri-la: passa, com aviso.
    s.exec({ type: 'updateElements', ids: ['d1'], patch: { offset: 4.9 } });
    embutir(s, { ...HOSPEDEIRO, offset: 4 });
    expect(validateProject(s.project).some((i) => i.code === 'cortina-colide-abertura')).toBe(true);
  });

  it('a cortina não pode ser hospedada em outra cortina', () => {
    const s = cenario();
    s.exec({ type: 'upsertWallType', wallType: { ...TIPO_CORTINA(), id: 'wt_ct2' } });
    s.exec({ type: 'addWall', wall: { ...makeWall({ id: 'w_ct2', typeId: 'wt_ct2', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }), curtain: {} } });
    expect(() => s.exec({ type: 'setCurtainHost', wallId: 'w_ct', host: { ...HOSPEDEIRO, wallId: 'w_ct2' } })).toThrow(t('pt', 'md_ct_host_not_basic'));
  });
});

describe('cortina embutida: transformações do hospedeiro (§8.4, regra 3)', () => {
  it('mover o hospedeiro leva a cortina junto', () => {
    const s = cenario();
    embutir(s);
    s.exec({ type: 'transform', ids: ['w_host'], transform: { kind: 'translate', d: { x: 0, y: 3 } } });
    perto(parede(s, 'w_ct').a.y, 3);
    perto(parede(s, 'w_ct').a.x, 2);
  });

  it('espelhar o hospedeiro e a cortina juntos: a cortina fica no mesmo lugar e o offset vira o espelho', () => {
    const s = cenario();
    embutir(s, { ...HOSPEDEIRO, offset: 2.5 });
    const antes = x(parede(s, 'w_ct'));
    s.exec({ type: 'transform', ids: ['w_host', 'w_ct'], transform: { kind: 'mirror', a: { x: 3, y: 0 }, b: { x: 3, y: 1 } } });
    const depois = x(parede(s, 'w_ct'));
    perto(depois[0]!, antes[0]!);
    perto(depois[1]!, antes[1]!);
    expect(parede(s, 'w_ct').curtain?.host?.offset).toBeCloseTo(3.5, 9);
  });

  it('mover só a cortina embutida não a tira do hospedeiro', () => {
    const s = cenario();
    embutir(s);
    s.exec({ type: 'transform', ids: ['w_ct'], transform: { kind: 'translate', d: { x: 0, y: 5 } } });
    perto(parede(s, 'w_ct').a.y, 0);
    perto(parede(s, 'w_ct').a.x, 2);
  });

  it('copiar o hospedeiro leva a cortina embutida junto, ligada ao hospedeiro copiado', () => {
    const s = cenario();
    embutir(s);
    s.exec({ type: 'transform', ids: ['w_host'], transform: { kind: 'translate', d: { x: 0, y: 10 } }, copy: { idMap: { w_host: 'w_host2' } } });
    const copias = Object.values(s.project.elements).filter((e) => e.kind === 'wall' && (e as Wall).curtain?.host?.wallId === 'w_host2') as Wall[];
    expect(copias).toHaveLength(1);
    perto(copias[0]!.a.y, 10);
    perto(parede(s, 'w_ct').a.y, 0);
  });
});

describe('cortina embutida: dividir e apagar o hospedeiro (§8.3, §8.4)', () => {
  it('dividir o hospedeiro antes da cortina: ela vai para a parte da direita, com o offset recalculado', () => {
    const s = cenario();
    embutir(s, { ...HOSPEDEIRO, offset: 4 });
    s.exec({ type: 'splitWall', id: 'w_host', newId: 'w_dir', t: 2 });
    expect(parede(s, 'w_ct').curtain?.host).toMatchObject({ wallId: 'w_dir', offset: 2 });
    perto(parede(s, 'w_ct').a.x, 3);
  });

  it('dividir o hospedeiro depois da cortina: ela fica na parte original', () => {
    const s = cenario();
    embutir(s, { ...HOSPEDEIRO, offset: 4 });
    s.exec({ type: 'splitWall', id: 'w_host', newId: 'w_dir', t: 5.5 });
    expect(parede(s, 'w_ct').curtain?.host).toMatchObject({ wallId: 'w_host', offset: 4 });
  });

  it('dividir o hospedeiro dentro do vão da cortina é recusado', () => {
    const s = cenario();
    embutir(s, { ...HOSPEDEIRO, offset: 4 });
    expect(() => s.exec({ type: 'splitWall', id: 'w_host', newId: 'w_dir', t: 4 })).toThrow(t('pt', 'md_ct_split_inside'));
    expect(s.project.elements.w_dir).toBeUndefined();
  });

  it('apagar o hospedeiro promove a cortina a independente (aviso, nada apagado em cascata)', () => {
    const s = cenario();
    embutir(s);
    s.exec({ type: 'deleteElements', ids: ['w_host'] });
    const w = parede(s, 'w_ct');
    expect(w).toBeDefined();
    expect(w.curtain?.host).toBeUndefined();
    perto(w.a.x, 2);
    perto(w.b.x, 4);
  });

  it('limpar o hospedeiro (clearCurtainHost) deixa a cortina independente, no lugar', () => {
    const s = cenario();
    embutir(s);
    s.exec({ type: 'clearCurtainHost', wallId: 'w_ct' });
    expect(parede(s, 'w_ct').curtain?.host).toBeUndefined();
    perto(parede(s, 'w_ct').a.x, 2);
    expect(parede(s, 'w_host')).toBeDefined();
  });
});

describe('cortina embutida: validação (§4.6, §8.2)', () => {
  function projetoManual(): Project {
    const p = novoProjeto();
    applyCommand(p, { type: 'upsertWallType', wallType: TIPO_CORTINA() });
    applyCommand(p, { type: 'addWall', wall: makeWall({ id: 'w_host', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
    applyCommand(p, { type: 'addWall', wall: { ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: {} } });
    applyCommand(p, { type: 'setCurtainHost', wallId: 'w_ct', host: HOSPEDEIRO });
    return p;
  }

  it('hospedeiro ausente é aviso (a cortina trata-se como independente)', () => {
    const p = projetoManual();
    (p.elements.w_ct as Wall).curtain!.host!.wallId = 'w_fantasma';
    const aviso = validateProject(p).find((i) => i.code === 'cortina-hospedeiro-ausente');
    expect(aviso?.severity).toBe('warning');
  });

  it('espelho divergente do hospedeiro é aviso', () => {
    const p = projetoManual();
    (p.elements.w_ct as Wall).a = { x: 0.5, y: 0 };
    expect(validateProject(p).some((i) => i.code === 'curtain-host-mirror')).toBe(true);
  });

  it('vão que passa das pontas do hospedeiro é aviso', () => {
    const p = projetoManual();
    (p.elements.w_host as Wall).b = { x: 3.5, y: 0 };
    expect(validateProject(p).some((i) => i.code === 'cortina-recorte-fora-do-hospedeiro')).toBe(true);
  });

  it('esquadria hospedada em parede cortina continua sendo erro (opening-host-curtain)', () => {
    const p = projetoManual();
    applyCommand(p, { type: 'addOpening', opening: { id: 'dx', kind: 'door', typeId: 'ot_p80', hostId: 'w_ct', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    expect(validateProject(p).find((i) => i.code === 'opening-host-curtain')?.severity).toBe('error');
  });
});
