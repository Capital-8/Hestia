import { describe, expect, it } from 'vitest';
import { createEmptyProject, DEFAULT_OPENING_TYPES } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { SCHEMA_VERSION } from './types.ts';
import {
  camposTravadosPelaComposicao,
  canonComposition,
  compositionOfType,
  isAuthoredComposition,
  withBridgedComposition,
} from './openingCompositionOf.ts';
import { openingSpanOf, openingTypeById } from './openingNominal.ts';
import { compositionIssue } from './openingCompositionRules.ts';
import { resolveLayout } from './openingCompositionLayout.ts';
import type { OpeningType } from './openingTypes.ts';

/* Bug P1: tipo com composição AUTORAL ignorava os campos planos (largura/altura/batente/folha). */
const tipo = (id: string): OpeningType => DEFAULT_OPENING_TYPES.find((t) => t.id === id)!;
const vao = (t: OpeningType) => openingSpanOf(t);
const editar = (t: OpeningType, patch: Partial<OpeningType>): OpeningType => withBridgedComposition({ ...t, ...patch }, t);

describe('composição autoral acompanha os campos planos do tipo (vão)', () => {
  it('porta com bandeira: altura 2,10 -> 2,50 move o vão em +0,40 (largura intacta)', () => {
    const t = tipo('ot_pband40_90');
    const a = vao(t);
    const b = vao(editar(t, { height: 2.5 }));
    expect(b.height - a.height).toBeCloseTo(0.4, 9);
    expect(b.width - a.width).toBeCloseTo(0, 9);
  });

  it('porta com lateral: largura 0,80 -> 0,95 move o vão em +0,15 (altura intacta)', () => {
    const t = tipo('ot_plat40e_80');
    const a = vao(t);
    const b = vao(editar(t, { width: 0.95 }));
    expect(b.width - a.width).toBeCloseTo(0.15, 9);
    expect(b.height - a.height).toBeCloseTo(0, 9);
  });

  it('valores absolutos (folha 0,90 x 2,50 + folga 0,08 x 0,05 + bandeira 0,40 + travessa)', () => {
    const t = tipo('ot_pband40_90');
    const a = vao(t);
    const b = vao(editar(t, { height: 2.5 }));
    expect(a.width).toBeCloseTo(0.98, 9);
    expect(b.height).toBeCloseTo(a.height + 0.4, 9);
    // A divisão fica: bandeira fixa de 0,40 e o resto na folha.
    const c = editar(t, { height: 2.5 }).composition!;
    const rows = c.layout.kind === 'split' ? c.layout.children : [];
    expect(rows.map((x) => x.size.mode)).toEqual(['fill', 'fixed']);
    expect(rows[1]!.size).toEqual({ mode: 'fixed', value: 0.4 });
    expect(compositionIssue(c)).toBeNull();
  });

  it('janela (vão): altura e largura mudam o vão e o módulo livre absorve; fixos ficam', () => {
    const t = tipo('ot_jcomb_fa150x120');
    const b = editar(t, { width: 1.8, height: 1.5 });
    expect(vao(b)).toEqual({ width: 1.8, height: 1.5 });
    const cols = b.composition!.layout.kind === 'split' ? b.composition!.layout.children : [];
    expect(cols[0]!.size).toEqual({ mode: 'fixed', value: 0.6 });
    expect(cols[1]!.size).toEqual({ mode: 'fill' });
    expect(compositionIssue(b.composition!)).toBeNull();
  });

  it('sem módulo livre num eixo: os módulos fixos escalam em proporção', () => {
    const t = tipo('ot_jcomb_fa150x120');
    const cols = t.composition!.layout.kind === 'split' ? t.composition!.layout : null;
    // Pré-condição: troca o fill por módulo fixo que fecha a soma (luz 1,44 - divisor 0,025 = 1,415).
    const fixa: OpeningType = {
      ...t,
      composition: { ...t.composition!, layout: { ...cols!, children: [cols!.children[0]!, { size: { mode: 'fixed', value: 0.815 }, node: cols!.children[1]!.node }] } },
    };
    expect(compositionIssue(fixa.composition!)).toBeNull();
    const b = editar(fixa, { width: 1.8 });
    expect(compositionIssue(b.composition!)).toBeNull();
    const f = b.composition!.layout.kind === 'split' ? b.composition!.layout.children : [];
    const [x, y] = f.map((c) => (c.size.mode === 'fixed' ? c.size.value : 0));
    expect(x! / y!).toBeCloseTo(0.6 / 0.815, 9); // proporção preservada
  });
});

describe('composição autoral acompanha os campos planos do tipo (batente, folha, vidro, alizar)', () => {
  it('frameWidth, frameDepth e frameDepthMode vão para o perfil e o modo do batente', () => {
    const t = tipo('ot_pband40_90');
    const c = editar(t, { frameWidth: 0.07, frameDepth: 0.12, frameDepthMode: 'fixed' }).composition!;
    expect(c.frame.depthMode).toBe('fixed');
    expect(c.frame.profile).toEqual({ presetId: 'prf_mad_batente_5x9', override: { visibleWidth: 0.07, depth: 0.12 } });
    expect(compositionIssue(c)).toBeNull();
  });

  it('leafThickness, handle e grid vão para as células de folha; glassThickness para as de vidro', () => {
    const t = tipo('ot_pband40_90');
    const c = editar(t, { leafThickness: 0.05, handle: 'pull', grid: { cols: 2, rows: 3 }, glassThickness: 0.008 }).composition!;
    const cells = c.layout.kind === 'split' ? c.layout.children.map((x) => x.node) : [];
    const folha = cells.find((n) => n.kind === 'cell' && n.content.kind === 'leaf');
    const vidro = cells.find((n) => n.kind === 'cell' && n.content.kind === 'glass');
    expect(folha?.kind === 'cell' && folha.content.kind === 'leaf' ? folha.content.options : null).toMatchObject({ leafThickness: 0.05, handle: 'pull', grid: { cols: 2, rows: 3 } });
    expect(vidro?.kind === 'cell' && vidro.content.kind === 'glass' ? vidro.content.glass.thickness : 0).toBe(0.008);
  });

  it('alizar do tipo vai para composition.casing e some ao ser removido', () => {
    const t = tipo('ot_pband40_90');
    const com = editar(t, { casing: { width: 0.08, thickness: 0.02 } });
    expect(com.composition!.casing).toMatchObject({ faces: 'both', width: 0.08, thickness: 0.02 });
    const sem = withBridgedComposition({ ...com, casing: undefined }, com);
    expect(sem.composition!.casing).toBeUndefined();
  });
});

describe('o que não muda', () => {
  it('campo sem relação com a composição (nome, custo): composição idêntica', () => {
    const t = tipo('ot_pband40_90');
    expect(canonComposition(editar(t, { name: 'Outra', cost: 10 }).composition)).toBe(canonComposition(t.composition));
  });

  it('tipo simples (sem composição) passa como está', () => {
    const t = tipo('ot_p80');
    const r = withBridgedComposition({ ...t, height: 2.4 }, t);
    expect(r.composition).toBeUndefined();
    expect(vao(r)).toEqual({ width: 0.8, height: 2.4 });
  });

  it('composição derivada dos campos continua regenerada (comportamento anterior)', () => {
    const base = tipo('ot_p90');
    const prev: OpeningType = { ...base, composition: compositionOfType(base) };
    const out = withBridgedComposition({ ...prev, width: 1, height: 2.2 }, prev);
    expect(out.composition?.nominal).toMatchObject({ width: 1, height: 2.2 });
  });

  it('composição editada direto junto com os campos: a composição editada vence', () => {
    const t = tipo('ot_pband40_90');
    const c = { ...t.composition!, nominal: { ...t.composition!.nominal, height: 2.3 } };
    const r = withBridgedComposition({ ...t, height: 2.5, composition: c }, t);
    expect(r.composition!.nominal.height).toBe(2.3);
  });

  it('o vão derivado não depende de passar de novo pela ponte (idempotência)', () => {
    const t = tipo('ot_plat40e_80');
    const um = editar(t, { width: 0.95 });
    const dois = withBridgedComposition({ ...um }, um);
    expect(canonComposition(dois.composition)).toBe(canonComposition(um.composition));
    expect(vao(dois).width - vao(t).width).toBeCloseTo(0.15, 9);
  });
});

describe('duplicar e editar pelo comando (como o diálogo)', () => {
  it('duplicar, aumentar a altura e gravar: o vão do tipo normalizado muda +0,40', () => {
    const s = new ProjectStore(createEmptyProject());
    const orig = s.project.openingTypes.ot_pband40_90!;
    const copia: OpeningType = { ...orig, id: 'ot_copia', name: 'Cópia' };
    s.exec({ type: 'upsertOpeningType', openingType: copia });
    const rascunho = withBridgedComposition({ ...copia, height: 2.5 }, copia); // o diálogo passa cada edição pela ponte
    s.exec({ type: 'upsertOpeningType', openingType: rascunho });
    const a = openingTypeById(s.project, 'ot_pband40_90')!;
    const b = openingTypeById(s.project, 'ot_copia')!;
    expect(b.height - a.height).toBeCloseTo(0.4, 9);
    expect(b.width).toBeCloseTo(a.width, 9);
  });

  it('gravar só o campo (sem passar pela ponte do diálogo) também move o vão', () => {
    const s = new ProjectStore(createEmptyProject());
    const orig = s.project.openingTypes.ot_plat40e_80!;
    s.exec({ type: 'upsertOpeningType', openingType: { ...orig, width: 0.95 } });
    const a = openingSpanOf(orig);
    const b = openingSpanOf(s.project.openingTypes.ot_plat40e_80!);
    expect(b.width - a.width).toBeCloseTo(0.15, 9);
  });

  it('janela do catálogo: a altura do tipo é o vão real', () => {
    const s = new ProjectStore(createEmptyProject());
    const orig = s.project.openingTypes.ot_jband_100x150!;
    s.exec({ type: 'upsertOpeningType', openingType: { ...orig, height: 1.8, width: 1.2 } });
    const v = openingSpanOf(s.project.openingTypes.ot_jband_100x150!);
    expect(v).toEqual({ width: 1.2, height: 1.8 });
    const luz = resolveLayout(s.project.openingTypes.ot_jband_100x150!.composition!, undefined, 'window').cells;
    expect(luz.length).toBe(2);
  });
});

describe('camposTravadosPelaComposicao', () => {
  it('composição autoral trava só o que não tem mapeamento', () => {
    expect([...camposTravadosPelaComposicao(tipo('ot_pband40_90'))].sort()).toEqual(['frameMaterialId', 'frameStyle', 'sidelights', 'transom']);
  });
  it('tipo simples e composição só derivada: nada travado', () => {
    expect(camposTravadosPelaComposicao(tipo('ot_p80')).size).toBe(0);
    const base = tipo('ot_p90');
    expect(camposTravadosPelaComposicao({ ...base, composition: compositionOfType(base) }).size).toBe(0);
    expect(isAuthoredComposition(tipo('ot_pband40_90'))).toBe(true);
  });
});

describe('esquema', () => {
  it('SCHEMA_VERSION continua 28', () => {
    expect(SCHEMA_VERSION).toBe(29);
    expect(createEmptyProject().schemaVersion).toBe(29);
  });
});
