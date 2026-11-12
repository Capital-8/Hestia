import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, curtainPanelTypesOf, mullionTypesOf, type CurtainInstance } from '@hestia/model';
import { sobrescritasDaInstancia } from './cortinaSobrescritas.ts';
import { entradaCortinaDoProjeto } from './cortinaProjeto.ts';
import { montarCenaCortina } from './kernelCortina.ts';
import { cortinaAvisosDeGeometria } from './cortinaIssues.ts';
import { AVISO_CORTINA } from './kernelCortinaTabelas.ts';
import { projetoComCortina } from './fixtureCortina.ts';

const mont = mullionTypesOf(createEmptyProject());
const pain = curtainPanelTypesOf(createEmptyProject());
const COMP = { u: 6, v: 3 };
const conv = (inst: CurtainInstance | undefined) => sobrescritasDaInstancia(inst, COMP, mont, pain);

describe('sobrescritasDaInstancia: tradução do modelo para o adaptador', () => {
  it('instância vazia ou sem sobrescrita não manda nada (nem a chave)', () => {
    expect(conv(undefined)).toEqual({ montantes: [], paineis: [], aberturas: [] });
    expect(conv({ grid: { u: { count: 3 } } })).toEqual({ montantes: [], paineis: [], aberturas: [] });
    expect('sobrescritas' in conv({})).toBe(false);
  });

  it('linha extra com sobrescrita: posição, travamento e montante da sobrescrita substituem os da extra, e o comprimento gravado é o atual', () => {
    const r = conv({
      addedLines: [{ id: 'x1', axis: 'u', pos: 2, locked: false }],
      lineOverrides: [{ line: { added: 'x1' }, pos: 2.5, locked: true, mullionTypeId: 'mul_ret_50x150' }],
    });
    expect(r.sobrescritas!.linhasExtras).toEqual([{ id: 'x1', eixo: 'u', pos: 2.5, travada: true, comprimentoGravado: 6, montante: 'mul_ret_50x150' }]);
    expect(r.montantes).toEqual(['mul_ret_50x150']);
  });

  it('a primeira sobrescrita de uma extra vale; sobrescrita de extra inexistente não entra', () => {
    const r = conv({
      addedLines: [{ id: 'x1', axis: 'v', pos: 1 }],
      lineOverrides: [{ line: { added: 'x1' }, pos: 1.2 }, { line: { added: 'x1' }, pos: 1.9 }, { line: { added: 'fantasma' }, pos: 2 }],
    });
    expect(r.sobrescritas!.linhasExtras).toEqual([{ id: 'x1', eixo: 'v', pos: 1.2, travada: false, comprimentoGravado: 3 }]);
  });

  it('montante de extra ausente no projeto herda o do eixo; "sem montante" numa extra também herda (desvio: o contrato não tem o modo)', () => {
    const r = conv({
      addedLines: [
        { id: 'a', axis: 'u', pos: 1, mullionTypeId: 'nao_existe' },
        { id: 'b', axis: 'u', pos: 2, mullionTypeId: null },
      ],
    });
    expect(r.sobrescritas!.linhasExtras!.map((x) => [x.id, 'montante' in x])).toEqual([
      ['a', false],
      ['b', false],
    ]);
    expect(r.montantes).toEqual([]);
  });

  it('segmento de linha gerada leva índice, posição normalizada, n e a medida do segmento', () => {
    const r = conv({ removedSegments: [{ line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, k: 0, nk: 2, mid: 0.25 }] });
    expect(r.sobrescritas!.segmentosRemovidos).toEqual([{ eixo: 'u', origem: 'gerada', linha: 2, posNorm: 0.5, n: 4, k: 0, nk: 2, mid: 0.25 }]);
  });

  it('segmento de extra leva o id da extra; segmento de extra que sumiu sai', () => {
    const r = conv({
      addedLines: [{ id: 'x1', axis: 'v', pos: 1 }],
      removedSegments: [
        { line: { added: 'x1' }, k: 1, nk: 3, mid: 0.5 },
        { line: { added: 'sumiu' }, k: 0, nk: 3, mid: 0.1 },
      ],
    });
    expect(r.sobrescritas!.segmentosRemovidos).toEqual([{ eixo: 'v', origem: 'extra', linha: 'x1', k: 1, nk: 3, mid: 0.5 }]);
  });

  it('linha gerada sobrescrita: posição, travamento, comprimento atual e montante (null = sem montante; inexistente = herda)', () => {
    const r = conv({
      lineOverrides: [
        { line: { axis: 'v', index: 1, pos: 0.5, n: 2 }, pos: 1.8, locked: true, mullionTypeId: null },
        { line: { axis: 'u', index: 1, pos: 0.25, n: 4 }, mullionTypeId: 'nao_existe' },
        { line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, mullionTypeId: 'mul_ret_50x100' },
      ],
    });
    expect(r.sobrescritas!.linhasSobrescritas).toEqual([
      { eixo: 'v', linha: 1, n: 2, posNorm: 0.5, travada: true, comprimentoGravado: 3, pos: 1.8, montante: null },
      { eixo: 'u', linha: 1, n: 4, posNorm: 0.25, travada: false, comprimentoGravado: 6 },
      { eixo: 'u', linha: 2, n: 4, posNorm: 0.5, travada: false, comprimentoGravado: 6, montante: 'mul_ret_50x100' },
    ]);
    expect(r.montantes).toEqual(['mul_ret_50x100']);
  });

  it('painel de célula leva i, j, nu, nv, s, z e o painel; célula com abertura (fase 5) e painel inexistente saem', () => {
    const chave = { i: 1, j: 0, nu: 4, nv: 2, s: 0.375, z: 0.25 };
    const r = conv({
      cells: [
        { key: chave, override: { kind: 'panel', panelTypeId: 'pnl_solido_alu_4' } },
        { key: { ...chave, i: 2 }, override: { kind: 'opening', openingTypeId: 'x', flipHand: false, flipFacing: false, mark: 'P1' } },
        { key: { ...chave, i: 3 }, override: { kind: 'panel', panelTypeId: 'nao_existe' } },
      ],
    });
    expect(r.sobrescritas!.celulasSobrescritas).toEqual([{ i: 1, j: 0, nu: 4, nv: 2, s: 0.375, z: 0.25, painel: 'pnl_solido_alu_4' }]);
    expect(r.paineis).toEqual(['pnl_solido_alu_4']);
  });
});

describe('esquadrias nas células (fase 5)', () => {
  const chave = { i: 1, j: 0, nu: 4, nv: 2, s: 0.375, z: 0.25 };
  const existe = (id: string): boolean => id === 'ot_p80';
  const comTipo = (inst: CurtainInstance) => sobrescritasDaInstancia(inst, COMP, mont, pain, existe);

  it('célula com abertura vira esquadria com a chave da célula, as inversões, o ajuste, o alinhamento e a soleira', () => {
    const r = comTipo({
      cells: [
        { key: chave, override: { kind: 'opening', openingTypeId: 'ot_p80', flipHand: true, flipFacing: false, mark: 'P1' } },
        { key: { ...chave, i: 2 }, override: { kind: 'opening', openingTypeId: 'ot_p80', flipHand: false, flipFacing: true, fit: 'grid', align: 'end', sillOverride: 0.9, mark: 'P2' } },
        { key: { ...chave, i: 3 }, override: { kind: 'opening', openingTypeId: 'nao_existe', flipHand: false, flipFacing: false, mark: 'P3' } },
      ],
    });
    expect(r.sobrescritas!.esquadrias).toEqual([
      { ...chave, tipoAbertura: 'ot_p80', flipHand: true, flipFacing: false, fit: 'cell' },
      { ...chave, i: 2, tipoAbertura: 'ot_p80', flipHand: false, flipFacing: true, fit: 'grid', align: 'end', sillOverride: 0.9 },
    ]);
    expect(r.aberturas).toEqual(['ot_p80']);
    expect('celulasSobrescritas' in r.sobrescritas!).toBe(false);
  });

  it('sem a função de existência a esquadria não entra (como na fase 2)', () => {
    const r = conv({ cells: [{ key: chave, override: { kind: 'opening', openingTypeId: 'ot_p80', flipHand: false, flipFacing: false, mark: 'P1' } }] });
    expect(r.sobrescritas).toBeUndefined();
    expect(r.aberturas).toEqual([]);
  });
});

describe('entrada do adaptador com as sobrescritas', () => {
  it('a cortina sai com as sobrescritas e os tipos que elas usam entram na entrada', () => {
    const s = new ProjectStore(projetoComCortina());
    s.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 1 } });
    s.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 1, panelTypeId: 'pnl_solido_alu_4' });
    const e = entradaCortinaDoProjeto(s.project);
    const c = e.entrada.cortinas[0]!;
    expect(c.sobrescritas!.linhasExtras!.map((x) => x.id)).toEqual(['x1']);
    expect(c.sobrescritas!.celulasSobrescritas!.map((x) => x.painel)).toEqual(['pnl_solido_alu_4']);
    expect(e.entrada.paineis.map((x) => x.id)).toEqual(expect.arrayContaining(['pnl_vidro_10', 'pnl_solido_alu_4']));
  });

  it('a montagem da cena leva as sobrescritas às seções 106 a 109 (é o que a tabela de quantitativos e a 3D leem)', () => {
    const s = new ProjectStore(projetoComCortina());
    s.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 1 } });
    s.exec({ type: 'removeSegment', wallId: 'ct1', line: { axis: 'u', index: 2, pos: 0.5, n: 4 }, k: 0 });
    s.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 1, panelTypeId: 'pnl_solido_alu_4' });
    const cena = montarCenaCortina(entradaCortinaDoProjeto(s.project).entrada);
    expect([cena.nLinhas.cortina_linhas_extras, cena.nLinhas.cortina_segmentos_removidos, cena.nLinhas.cortina_linhas_sobrescritas, cena.nLinhas.cortina_celulas_sobrescritas]).toEqual([1, 1, 0, 1]);
  });

  it('sem sobrescrita a cortina sai igual à fase 1 (sem o campo)', () => {
    expect('sobrescritas' in entradaCortinaDoProjeto(projetoComCortina()).entrada.cortinas[0]!).toBe(false);
  });

  it('a assinatura da cortina, a do nível e a global mudam quando uma sobrescrita muda, e voltam a igualar se o estado for o mesmo', () => {
    const a0 = entradaCortinaDoProjeto(projetoComCortina());
    const s = new ProjectStore(projetoComCortina());
    s.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 1 } });
    const a1 = entradaCortinaDoProjeto(s.project);
    expect(a1.assinaturas.get('ct1')).not.toBe(a0.assinaturas.get('ct1'));
    expect(a1.assinatura).not.toBe(a0.assinatura);
    s.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 1, panelTypeId: 'pnl_solido_alu_4' });
    const a2 = entradaCortinaDoProjeto(s.project);
    expect(a2.assinaturas.get('ct1')).not.toBe(a1.assinaturas.get('ct1'));
    // Mesmo estado montado de novo (outro objeto, mesma edição): mesmo hash.
    const igual = new ProjectStore(projetoComCortina());
    igual.exec({ type: 'addGridLine', wallId: 'ct1', line: { id: 'x1', axis: 'u', pos: 1 } });
    igual.exec({ type: 'setCellPanel', wallId: 'ct1', i: 0, j: 1, panelTypeId: 'pnl_solido_alu_4' });
    expect(entradaCortinaDoProjeto(igual.project).assinatura).toBe(a2.assinatura);
  });
});

describe('avisos 7 a 10 traduzidos com texto pt e en', () => {
  it('órfãs viram cortina-override-orfao (um código para as três) e a região não retangular vira o próprio código', () => {
    const base = { i: null, j: null, medido: 1.25, limite: 0.5, x: 0, y: 0, z: 0, wallId: 'ct1' };
    const r = cortinaAvisosDeGeometria([
      { ...base, codigo: AVISO_CORTINA.orfaoCelula },
      { ...base, codigo: AVISO_CORTINA.orfaoLinha },
      { ...base, codigo: AVISO_CORTINA.orfaoSegmento },
      { ...base, codigo: AVISO_CORTINA.celulaNaoRetangular, medido: 3, limite: 4 },
    ]);
    expect(r.map((x) => [x.code, x.severity, x.elementId])).toEqual([
      ['cortina-override-orfao', 'warning', 'ct1'],
      ['cortina-override-orfao', 'warning', 'ct1'],
      ['cortina-override-orfao', 'warning', 'ct1'],
      ['cortina-celula-nao-retangular', 'warning', 'ct1'],
    ]);
    expect(r[0]!.message).toContain('1.25');
    expect(r[3]!.message).toContain('4');
    expect(cortinaAvisosDeGeometria([{ ...base, codigo: AVISO_CORTINA.orfaoCelula }], 'en')[0]!.message).toContain('1.25 m');
    expect(cortinaAvisosDeGeometria([{ ...base, codigo: AVISO_CORTINA.celulaNaoRetangular, medido: 3, limite: 4 }], 'en')[0]!.message).toContain('3-cell');
  });
});

describe('esquadria e hospedeiro do modelo até a entrada do adaptador (fase 5)', () => {
  it('a esquadria da célula entra com o tipo de abertura da seção 7 e muda a assinatura; o hospedeiro vira o vão da seção 113', () => {
    const s = new ProjectStore(projetoComCortina());
    const porta = Object.values(s.project.openingTypes).find((t) => t.kind === 'door')!;
    const antes = entradaCortinaDoProjeto(s.project);
    s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 1, j: 0, openingTypeId: porta.id, flipHand: false, flipFacing: false, mark: 'P1', fit: 'cell', fundir: true });
    const e = entradaCortinaDoProjeto(s.project);
    const c = e.entrada.cortinas.find((x) => x.id === 'ct1')!;
    expect(c.sobrescritas!.esquadrias).toHaveLength(1);
    expect(c.sobrescritas!.esquadrias![0]!.tipoAbertura).toBe(porta.id);
    expect(e.entrada.tiposAbertura!.map((t) => t.id)).toEqual([porta.id]);
    expect(e.entrada.tiposAbertura![0]!.valores.janela).toBe(0);
    expect(e.assinaturas.get('ct1')).not.toBe(antes.assinaturas.get('ct1'));
    const cena = montarCenaCortina(e.entrada);
    expect(cena.nLinhas.cortina_celulas_abertura).toBe(1);
    // Removida a esquadria, nada dela fica na entrada (a fusão das células, gravada como segmento removido, permanece, como no comando do modelo).
    s.exec({ type: 'removeCellOpening', wallId: 'ct1', i: 1, j: 0 });
    const depois = entradaCortinaDoProjeto(s.project).entrada;
    expect(depois.tiposAbertura).toEqual([]);
    expect(depois.cortinas.find((x) => x.id === 'ct1')!.sobrescritas!.esquadrias).toBeUndefined();
    // Cortina embutida: o vão do hospedeiro vai à entrada e à seção 113.
    s.exec({ type: 'setCurtainHost', wallId: 'ct1', host: { wallId: 'w1', offset: 3, width: 2, sill: 0.1, height: 2.5 } });
    const emb = entradaCortinaDoProjeto(s.project);
    expect(emb.entrada.cortinas.find((x) => x.id === 'ct1')!.hospedeiro).toEqual({ wallId: 'w1', offset: 3, width: 2, sill: 0.1, height: 2.5 });
    const cn = montarCenaCortina(emb.entrada);
    expect(cn.nLinhas.cortina_hospedes).toBe(1);
    expect(cn.secoes.cortina_hospedes.largura).toEqual([2]);
  });
});
