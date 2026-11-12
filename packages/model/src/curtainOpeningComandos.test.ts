import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, resolverParede, validateProject, type CurtainInstance, type CurtainSpec, type OpeningType, type Project, type Wall, type WallType } from './index.ts';
import { applyCommand, type Command } from './commands.ts';
import { t } from './i18n.ts';

type SetCellOpening = Extract<Command, { type: 'setCellOpening' }>;

// Esquadria na célula (decisão 0056, §7, fase 5): colocar nos dois modos, fusão de células, troca, inversão, remoção,
// linhas presas e validação. Parede de L = 4 m, grade U de 4 células (1 m) e grade V de 2 células (H = 2,8 m, 1,4 m cada).
// Montante padrão de 50 mm: meia largura de 0,025 m por lado.

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

/** Tipo de esquadria derivado de uma porta ou janela padrão, com largura e altura próprias. */
const tipoDe = (id: string, base: string, over: Partial<OpeningType>): OpeningType => ({ ...(createEmptyProject().openingTypes[base] as OpeningType), id, ...over });

const PORTA_50 = tipoDe('ot_t50', 'ot_p80', { name: 'Porta 50', width: 0.5, height: 2.1, sill: 0, leaves: 1, plan: 'swing' });
const PORTA_60 = tipoDe('ot_t60', 'ot_p80', { name: 'Porta 60', width: 0.6, height: 2.1, sill: 0, leaves: 1, plan: 'swing' });
const JANELA_50 = tipoDe('ot_v50', 'ot_j120', { name: 'Janela 50', width: 0.5, height: 0.8, sill: 0.4, leaves: 1, plan: 'hinged' });
const PORTA_BAIXA = tipoDe('ot_baixa', 'ot_p80', { name: 'Porta baixa', width: 0.5, height: 1.0, sill: 0, leaves: 1, plan: 'swing' });

/** Parede cortina w_ct (L = 4 m) com os tipos de esquadria de teste no projeto. */
function cenario(inst: CurtainInstance = {}): ProjectStore {
  const s = new ProjectStore(novoProjeto());
  const tipo: WallType = { ...base(), id: 'wt_ct', name: 'Cortina teste', family: 'curtain', curtain: grade(), layers: [], strips: [], wrapInserts: 'none', wrapEnds: 'none' };
  s.exec({ type: 'upsertWallType', wallType: tipo });
  s.exec({ type: 'addWall', wall: { ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: inst } });
  for (const o of [PORTA_50, PORTA_60, JANELA_50, PORTA_BAIXA]) s.exec({ type: 'upsertOpeningType', openingType: o });
  return s;
}

const paredeDe = (s: ProjectStore): Wall => s.project.elements.w_ct as Wall;
const instanciaDe = (s: ProjectStore): CurtainInstance => paredeDe(s).curtain ?? {};
const aberturas = (s: ProjectStore) => (instanciaDe(s).cells ?? []).filter((e) => e.override.kind === 'opening');
const linhasExtras = (s: ProjectStore) => instanciaDe(s).addedLines ?? [];

/** Comando de colocar esquadria com os padrões dos testes (preencher célula, sem fusão salvo se pedido). */
const colocar = (over: Partial<SetCellOpening> = {}): Command => ({
  type: 'setCellOpening',
  wallId: 'w_ct',
  i: 1,
  j: 0,
  openingTypeId: 'ot_p80',
  flipHand: false,
  flipFacing: false,
  mark: '',
  fit: 'cell',
  fundir: false,
  ...over,
});

describe('esquadria na célula: colocar (§7.2, §7.3)', () => {
  it('preencher célula: a porta mais alta que a célula funde a de cima e vira UM passo de desfazer', () => {
    const s = cenario();
    const antes = JSON.parse(JSON.stringify(instanciaDe(s)));
    s.exec(colocar({ fundir: true, mark: 'P-01' }));
    const cel = aberturas(s);
    expect(cel).toHaveLength(1);
    expect(cel[0]!.key).toMatchObject({ i: 1, j: 0 });
    expect(cel[0]!.override).toMatchObject({ kind: 'opening', openingTypeId: 'ot_p80', mark: 'P-01', fit: 'cell' });
    expect(cel[0]!.override).not.toHaveProperty('linkedLines');
    // A fusão é a remoção do segmento horizontal da coluna 1 (a linha entre as fileiras 0 e 1).
    expect(instanciaDe(s).removedSegments).toHaveLength(1);
    expect(instanciaDe(s).removedSegments![0]!.k).toBe(1);
    s.undo();
    expect(JSON.parse(JSON.stringify(instanciaDe(s)))).toEqual(antes);
  });

  it('sem fundir, recusa quando a esquadria não cabe na célula', () => {
    const s = cenario();
    expect(() => s.exec(colocar())).toThrow(t('pt', 'md_ct_opening_no_fit'));
    expect(aberturas(s)).toHaveLength(0);
  });

  it('fusão que deixaria a região em L é recusada com a mensagem de forma não retangular', () => {
    const s = cenario();
    // Funde (0,0) com (1,0) à direita: região 2 × 1, ainda retangular.
    s.exec({ type: 'removeSegment', wallId: 'w_ct', line: { axis: 'u', index: 1, pos: 0.25, n: 4 }, k: 0 });
    // A porta de (1,1) não cabe em 1,4 m: funde para baixo (com (1,0)) e a região vira um L.
    expect(() => s.exec(colocar({ i: 1, j: 1, fundir: true }))).toThrow(t('pt', 'md_ct_opening_funde_nao_retangular'));
  });

  it('esquadria que cabe não cria segmentos removidos nem linhas', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_baixa', i: 1, j: 1 }));
    expect(aberturas(s)).toHaveLength(1);
    expect(instanciaDe(s).removedSegments ?? []).toHaveLength(0);
    expect(linhasExtras(s)).toHaveLength(0);
  });

  it('ajuste de grade centralizado: duas linhas presas nas bordas da porta, com boundTo e linkedLines', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    const linhas = linhasExtras(s);
    // Largura 0,5 numa célula de 1,0: sobra de 0,25 em cada lado (acima do limiar de 0,15), então centrada.
    expect(linhas.filter((l) => l.axis === 'u').map((l) => l.pos).sort((a, b) => a - b)).toEqual([1.25, 1.75]);
    // Altura: topo do vão a 2,10 m; sobra de 0,70 acima.
    expect(linhas.filter((l) => l.axis === 'v').map((l) => l.pos)).toEqual([2.1]);
    expect(linhas.every((l) => l.boundTo !== undefined)).toBe(true);
    const cel = aberturas(s)[0]!;
    expect(cel.override).toMatchObject({ fit: 'grid', align: 'center' });
    expect((cel.override as { linkedLines: string[] }).linkedLines).toEqual(linhas.map((l) => l.id));
    // A esquadria fica na célula que contém o seu centro (x = 1,5): coluna 2 da grade com as linhas novas.
    const res = resolverParede(s.project, paredeDe(s))!;
    const ach = res.celulas.find((e) => e.override.kind === 'opening')!;
    expect(ach.key).toMatchObject({ i: 2, j: 0 });
  });

  it('ajuste de grade alinhado ao início: uma linha presa na borda direita da porta', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'start', fundir: true }));
    const u = linhasExtras(s).filter((l) => l.axis === 'u');
    expect(u.map((l) => l.pos)).toEqual([1.5]);
    expect(aberturas(s)[0]!.override).toMatchObject({ align: 'start' });
  });

  it('ajuste de grade alinhado ao fim: a linha fica a 0,50 m da borda direita da célula', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'end', fundir: true }));
    const u = linhasExtras(s).filter((l) => l.axis === 'u');
    expect(u.map((l) => l.pos)).toEqual([1.5]);
  });

  it('sobra abaixo do limiar é absorvida: o centralizado passa à borda e não cria linha do lado pequeno', () => {
    const s = cenario();
    // Porta de 0,8 numa célula de 1,0: sobra de 0,1 por lado (< 0,15). O centralizado vira alinhado ao início.
    s.exec(colocar({ openingTypeId: 'ot_p80', fit: 'grid', align: 'center', fundir: true }));
    const u = linhasExtras(s).filter((l) => l.axis === 'u');
    expect(u.map((l) => l.pos)).toEqual([1.8]);
  });

  it('linha de grade que já existe na posição não é criada de novo', () => {
    const s = cenario();
    // Porta de 0,5 com alinhamento no início: a linha em 1,5 não existe antes. Depois, uma linha extra em 1,5 já está
    // na grade; a porta reaproveita a que existe.
    s.exec({ type: 'addGridLine', wallId: 'w_ct', line: { id: 'x15', axis: 'u', pos: 1.5 } });
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'start', fundir: true }));
    expect(linhasExtras(s).filter((l) => l.axis === 'u')).toHaveLength(1);
    // Só a horizontal de topo (2,10 m) é criada; a vertical em 1,5 já existia.
    expect((aberturas(s)[0]!.override as { linkedLines?: string[] }).linkedLines ?? []).toHaveLength(1);
  });
});

describe('esquadria na célula: trocar, inverter, marcar e remover (§7.2)', () => {
  it('trocar o tipo refaz o ajuste de grade: as linhas antigas saem e as novas se movem', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    s.exec({ type: 'updateCellOpening', wallId: 'w_ct', i: 2, j: 0, patch: { openingTypeId: 'ot_t60', fundir: true } });
    const u = linhasExtras(s).filter((l) => l.axis === 'u').map((l) => l.pos).sort((a, b) => a - b);
    expect(u).toEqual([1.2, 1.8]);
    expect(linhasExtras(s)).toHaveLength(3);
    expect(aberturas(s)[0]!.override).toMatchObject({ openingTypeId: 'ot_t60' });
  });

  it('inverter lado de giro e sentido: só o override muda, as linhas presas são as mesmas', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    const ids = (aberturas(s)[0]!.override as { linkedLines: string[] }).linkedLines;
    s.exec({ type: 'updateCellOpening', wallId: 'w_ct', i: 2, j: 0, patch: { flipHand: true, flipFacing: true, fundir: true } });
    expect(aberturas(s)[0]!.override).toMatchObject({ flipHand: true, flipFacing: true });
    expect((aberturas(s)[0]!.override as { linkedLines: string[] }).linkedLines).toEqual(ids);
  });

  it('marca: troca a marca da esquadria sem mexer no resto', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_baixa', i: 1, j: 1, mark: 'P-01' }));
    s.exec({ type: 'updateCellOpening', wallId: 'w_ct', i: 1, j: 1, patch: { mark: 'P-07' } });
    expect(aberturas(s)[0]!.override).toMatchObject({ mark: 'P-07', openingTypeId: 'ot_baixa' });
  });

  it('janela com peitoril por instância: o valor entra na sobrescrita pelo patch', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_v50', i: 2, j: 1 }));
    s.exec({ type: 'updateCellOpening', wallId: 'w_ct', i: 2, j: 1, patch: { sillOverride: 0.4 } });
    expect(aberturas(s)[0]!.override).toMatchObject({ openingTypeId: 'ot_v50', sillOverride: 0.4 });
  });

  it('remover: apaga a esquadria e as linhas presas que sobram sem uso', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    expect(linhasExtras(s)).toHaveLength(3);
    s.exec({ type: 'removeCellOpening', wallId: 'w_ct', i: 2, j: 0 });
    expect(aberturas(s)).toHaveLength(0);
    expect(linhasExtras(s)).toHaveLength(0);
  });

  it('remover uma esquadria que não existe é recusado', () => {
    const s = cenario();
    expect(() => s.exec({ type: 'removeCellOpening', wallId: 'w_ct', i: 0, j: 0 })).toThrow(t('pt', 'md_ct_opening_missing'));
  });

  it('painel não entra numa célula-porta (§7.5.5)', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_baixa', i: 1, j: 1 }));
    expect(() => s.exec({ type: 'setCellPanel', wallId: 'w_ct', i: 1, j: 1, panelTypeId: 'pnl_solido_alu_4' })).toThrow(t('pt', 'md_ct_cell_has_opening'));
  });

  it('limpar a sobrescrita da célula remove a esquadria e as linhas presas dela', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    s.exec({ type: 'clearCellOverride', wallId: 'w_ct', i: 2, j: 0 });
    expect(aberturas(s)).toHaveLength(0);
    expect(linhasExtras(s)).toHaveLength(0);
  });

  it('apagar uma linha presa pela grade tira a referência da esquadria (a esquadria fica)', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    const ids = (aberturas(s)[0]!.override as { linkedLines: string[] }).linkedLines;
    s.exec({ type: 'removeGridLine', wallId: 'w_ct', line: { added: ids[0]! } });
    expect(aberturas(s)).toHaveLength(1);
    expect((aberturas(s)[0]!.override as { linkedLines: string[] }).linkedLines).toEqual(ids.slice(1));
    expect(validateProject(s.project).filter((i) => i.code === 'cortina-override-orfao')).toEqual([]);
  });

  it('colocar sobre uma esquadria troca a antiga e o desfazer volta a antiga', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_baixa', i: 1, j: 1, mark: 'A' }));
    const antes = JSON.parse(JSON.stringify(instanciaDe(s)));
    s.exec(colocar({ openingTypeId: 'ot_v50', i: 1, j: 1, mark: 'B' }));
    expect(aberturas(s)).toHaveLength(1);
    expect(aberturas(s)[0]!.override).toMatchObject({ openingTypeId: 'ot_v50', mark: 'B' });
    s.undo();
    expect(JSON.parse(JSON.stringify(instanciaDe(s)))).toEqual(antes);
  });
});

describe('esquadria na célula: validação (§5.8, §7.5)', () => {
  /** Projeto de teste construído sem a pilha de desfazer (o objeto pode ser alterado para forjar um caso inválido). */
  function projetoManual(): Project {
    const p = novoProjeto();
    applyCommand(p, { type: 'upsertWallType', wallType: { ...base(), id: 'wt_ct', name: 'Cortina teste', family: 'curtain', curtain: grade(), layers: [], strips: [], wrapInserts: 'none', wrapEnds: 'none' } });
    applyCommand(p, { type: 'addWall', wall: { ...makeWall({ id: 'w_ct', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), curtain: {} } });
    for (const o of [PORTA_50, PORTA_60, JANELA_50, PORTA_BAIXA]) applyCommand(p, { type: 'upsertOpeningType', openingType: o });
    return p;
  }

  it('esquadria de célula cujo tipo não existe é erro', () => {
    const p = projetoManual();
    applyCommand(p, colocar({ openingTypeId: 'ot_baixa', i: 1, j: 1 }));
    const w = p.elements.w_ct as Wall;
    (w.curtain!.cells![0]!.override as { openingTypeId: string }).openingTypeId = 'ot_fantasma';
    const issue = validateProject(p).find((i) => i.code === 'curtain-opening-type-missing');
    expect(issue?.severity).toBe('error');
  });

  it('célula com largura livre menor que a folha mínima do tipo gera aviso (sem bloquear)', () => {
    const p = projetoManual();
    // Parede de 1,80 m com 4 células de 0,45 m: célula interior livre = 0,45 − 0,05 − 0,008 = 0,392 m.
    applyCommand(p, { type: 'setWallEnds', id: 'w_ct', b: { x: 1.8, y: 0 } });
    const porta = tipoDe('ot_correr38', 'ot_pc160', { name: 'Correr 38', width: 0.38, height: 2.1, sill: 0, leaves: 2, plan: 'sliding' });
    applyCommand(p, { type: 'upsertOpeningType', openingType: porta });
    applyCommand(p, colocar({ openingTypeId: 'ot_correr38', i: 1, j: 0, fundir: true }));
    const aviso = validateProject(p).find((i) => i.code === 'cortina-porta-folha-minima');
    expect(aviso?.severity).toBe('warning');
  });

  it('porta sem soleira e elevada gera aviso de fora do piso', () => {
    const p = projetoManual();
    applyCommand(p, colocar({ openingTypeId: 'ot_baixa', i: 1, j: 1 }));
    expect(validateProject(p).some((i) => i.code === 'cortina-porta-fora-do-piso')).toBe(true);
  });

  it('linha presa sem uso e sem a extra correspondente sai com o aviso de órfã e é descartada', () => {
    const p = projetoManual();
    applyCommand(p, colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    const w = p.elements.w_ct as Wall;
    // Simula a grade sem uma das linhas presas (arquivo editado à mão ou plugin): a referência fica pendurada.
    w.curtain!.addedLines = (w.curtain!.addedLines ?? []).slice(1);
    const issues = validateProject(p).filter((i) => i.code === 'cortina-override-orfao');
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('esquadria na célula: desfazer de cada comando (um passo)', () => {
  it('troca, remoção e limpeza voltam ao estado anterior com um desfazer cada', () => {
    const s = cenario();
    s.exec(colocar({ openingTypeId: 'ot_t50', fit: 'grid', align: 'center', fundir: true }));
    const antes = JSON.parse(JSON.stringify(instanciaDe(s)));
    s.exec({ type: 'updateCellOpening', wallId: 'w_ct', i: 2, j: 0, patch: { openingTypeId: 'ot_t60', fundir: true } });
    s.undo();
    expect(JSON.parse(JSON.stringify(instanciaDe(s)))).toEqual(antes);
    s.exec({ type: 'removeCellOpening', wallId: 'w_ct', i: 2, j: 0 });
    s.undo();
    expect(JSON.parse(JSON.stringify(instanciaDe(s)))).toEqual(antes);
    s.exec({ type: 'clearCellOverride', wallId: 'w_ct', i: 2, j: 0 });
    s.undo();
    expect(JSON.parse(JSON.stringify(instanciaDe(s)))).toEqual(antes);
  });

  it('a fusão de células vizinhas também sai com o desfazer da colocação', () => {
    const s = cenario();
    const antes = JSON.parse(JSON.stringify(instanciaDe(s)));
    s.exec(colocar({ fundir: true }));
    s.undo();
    expect(JSON.parse(JSON.stringify(instanciaDe(s)))).toEqual(antes);
  });
});
