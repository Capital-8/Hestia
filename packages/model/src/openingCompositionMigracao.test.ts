import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENING_TYPES,
  OPENING_PROFILE_PRESETS,
  ProjectStore,
  compositionIssue,
  compositionOfType,
  createEmptyProject,
  leafSizeOf,
  migrateProject,
  openingCompositionOf,
  openingSpanOf,
  resolveLayout,
  SCHEMA_VERSION,
  type OpeningComposition,
  type OpeningType,
  type Project,
  type Rect,
} from './index.ts';

const T = 1e-9;
const near = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(T);
const area = (r: Rect): number => (r.t1 - r.t0) * (r.z1 - r.z0);
const inter = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.t1, b.t1) - Math.max(a.t0, b.t0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

/** Vão do tipo antigo (o que o motor recorta hoje), sem olhar a composição. */
const vaoAntigo = (t: OpeningType): { width: number; height: number } => openingSpanOf({ width: t.width, height: t.height, nominalRef: t.nominalRef, spanGap: t.spanGap });

function coberto(c: OpeningComposition, kind: 'door' | 'window'): void {
  const l = resolveLayout(c, undefined, kind);
  const rs = [...l.members.map((m) => m.rect), ...l.cells.map((x) => x.luz)];
  near(rs.reduce((s, r) => s + area(r), 0), l.span.width * l.span.height);
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) expect(inter(rs[i]!, rs[j]!)).toBeLessThan(1e-12);
    // nada fora do vão
    const r = rs[i]!;
    expect(r.t0).toBeGreaterThanOrEqual(-l.span.width / 2 - T);
    expect(r.t1).toBeLessThanOrEqual(l.span.width / 2 + T);
    expect(r.z0).toBeGreaterThanOrEqual(-T);
    expect(r.z1).toBeLessThanOrEqual(l.span.height + T);
  }
}

describe('compositionOfType: os tipos do catálogo (154)', () => {
  it('são 154 tipos', () => {
    expect(DEFAULT_OPENING_TYPES.length).toBe(154);
  });
  it('cada um vira composição de UMA célula, válida, com vão igual ao do tipo atual e luzes que somam o vão', () => {
    for (const t of DEFAULT_OPENING_TYPES) {
      const c = compositionOfType(t);
      expect(c.layout.kind, t.id).toBe('cell');
      expect(compositionIssue(c), t.id).toBeNull();
      const l = resolveLayout(c, undefined, t.kind);
      const vao = vaoAntigo(t);
      near(l.span.width, vao.width);
      near(l.span.height, vao.height);
      expect(l.cells.length, t.id).toBe(1);
      // soma luz + membros = vão; luz da célula = luz do pai
      expect(l.cells[0]!.luz, t.id).toEqual(l.luz);
      near(l.members.reduce((s, m) => s + area(m.rect), 0) + area(l.luz), vao.width * vao.height);
      // a folha nominal volta como no tipo antigo
      const folha = leafSizeOf({ width: t.width, height: t.height, nominalRef: t.nominalRef, spanGap: t.spanGap });
      near(leafSizeOf({ width: t.width, height: t.height, nominalRef: t.nominalRef, spanGap: t.spanGap, composition: c }).width, folha.width);
    }
  });
  it('openingCompositionOf usa a gravada e senão deriva', () => {
    const t = DEFAULT_OPENING_TYPES[0]!;
    expect(openingCompositionOf(t)).toEqual(compositionOfType(t));
    const gravada = { ...compositionOfType(t), nominal: { ref: 'opening' as const, width: 5, height: 5 } };
    expect(openingCompositionOf({ ...t, composition: gravada })).toBe(gravada);
  });
  it('porta 90 nominalRef "leaf": vão 0,98 × 2,15 e folha efetiva 0,902', () => {
    const t = DEFAULT_OPENING_TYPES.find((x) => x.kind === 'door' && x.nominalRef === 'leaf' && x.width === 0.9 && x.height === 2.1 && x.leaves === 1)!;
    const c = compositionOfType(t);
    expect(c.nominal).toMatchObject({ ref: 'leaf', width: 0.9, height: 2.1 });
    const l = resolveLayout(c, undefined, 'door');
    near(l.span.width, 0.98);
    near(l.span.height, 2.15);
    near(l.cells[0]!.luz.t1 - l.cells[0]!.luz.t0 + 2 * (0.015 - 0.004), 0.902);
  });
});

describe('compositionOfType: bandeira e laterais antigas (spec §7)', () => {
  const base: OpeningType = { ...DEFAULT_OPENING_TYPES.find((x) => x.id === 'ot_p90')!, id: 'ot_teste', width: 1.2, height: 2.1 };
  const soBandeira: OpeningType = { ...base, transom: { height: 0.4 } };
  const soLaterais: OpeningType = { ...base, sidelights: { left: true, right: true, width: 0.3 } };
  const ambos: OpeningType = { ...base, transom: { height: 0.4 }, sidelights: { left: true, right: true, width: 0.3 } };

  it('só bandeira: rows [principal fill, divisor 0,04, vidro 0,4]', () => {
    const c = compositionOfType(soBandeira);
    expect(compositionIssue(c)).toBeNull();
    const l = resolveLayout(c, undefined, 'door');
    near(l.span.width, 1.2);
    near(l.span.height, 2.1);
    const tr = l.members.find((m) => m.role === 'transom')!;
    near(tr.rect.z1 - tr.rect.z0, 0.04);
    near(l.cells.find((x) => x.id === 'transom')!.luz.z1 - l.cells.find((x) => x.id === 'transom')!.luz.z0, 0.4);
    expect(l.cells.find((x) => x.id === 'transom')!.content.kind).toBe('glass');
    coberto(c, 'door');
  });
  it('só laterais: cols [vidro, divisor 0,04, principal fill, divisor, vidro]', () => {
    const c = compositionOfType(soLaterais);
    expect(compositionIssue(c)).toBeNull();
    const l = resolveLayout(c, undefined, 'door');
    near(l.cells.find((x) => x.id === 'side-left')!.luz.t1 - l.cells.find((x) => x.id === 'side-left')!.luz.t0, 0.3);
    expect(l.members.filter((m) => m.role === 'mullion').every((m) => Math.abs(m.rect.t1 - m.rect.t0 - 0.04) < T)).toBe(true);
    near(l.span.width, 1.2);
    coberto(c, 'door');
  });
  it('ambos: travessa contínua acima das laterais; cobertura total', () => {
    const c = compositionOfType(ambos);
    expect(compositionIssue(c)).toBeNull();
    const l = resolveLayout(c, undefined, 'door');
    const tr = l.members.find((m) => m.role === 'transom')!;
    near(tr.rect.t0, l.luz.t0);
    near(tr.rect.t1, l.luz.t1);
    coberto(c, 'door');
  });
  it('janela com bandeira e nominalRef "leaf" vira "opening" com o vão atual', () => {
    const t: OpeningType = { ...base, nominalRef: 'leaf', transom: { height: 0.4, fixed: false }, sidelights: { right: true, width: 0.3 } };
    const c = compositionOfType(t);
    expect(c.nominal).toMatchObject({ ref: 'opening' });
    near(c.nominal.width, 1.28); // folha 1,20 + folga 0,08
    near(c.nominal.height, 2.15);
    expect(compositionIssue(c)).toBeNull();
    expect(resolveLayout(c, undefined, 'door').cells.find((x) => x.id === 'transom')!.content).toMatchObject({ kind: 'leaf', family: 'window_casement' });
    coberto(c, 'door');
  });
  it('openingSpanOf/leafSizeOf do tipo com composição de várias células', () => {
    const c = compositionOfType(ambos);
    expect(openingSpanOf({ ...ambos, composition: c })).toEqual({ width: 1.2, height: 2.1 });
    expect(leafSizeOf({ ...ambos, composition: c }).width).toBeGreaterThan(0);
  });
});

/** Arquivo v19 com os tipos do catálogo sem composição e uma instância de porta. */
function arquivoV19(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown> & { openingTypes: Record<string, Record<string, unknown>> };
  p.schemaVersion = 19;
  delete p.openingProfiles;
  for (const t of Object.values(p.openingTypes)) delete t.composition;
  return p;
}

describe('migração 19 → 20', () => {
  it('arquivo v19 abre em v20 com composição em cada tipo e os 18 presets', () => {
    const m = migrateProject(arquivoV19());
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(25);
    const ids = Object.keys(m.openingTypes);
    expect(ids.length).toBe(154);
    for (const t of Object.values(m.openingTypes)) {
      expect(t.composition, t.id).toBeDefined();
      expect(t.composition).toEqual(compositionOfType({ ...t, composition: undefined }));
    }
    expect(Object.keys(m.openingProfiles ?? {}).length).toBe(OPENING_PROFILE_PRESETS.length);
  });
  it('não toca nas instâncias nem nos campos atuais do tipo', () => {
    const raw = arquivoV19() as unknown as Project;
    const antes = JSON.parse(JSON.stringify(raw.openingTypes)) as Record<string, OpeningType>;
    raw.elements = { op1: { id: 'op1', kind: 'door', typeId: 'ot_p90', hostId: 'w1', offset: 1, flipHand: true, flipFacing: false, sillOverride: null, mark: 'P1' } };
    const m = migrateProject(raw);
    expect(m.elements.op1).toEqual(raw.elements.op1);
    for (const [id, t] of Object.entries(m.openingTypes)) {
      const { composition: _c, ...resto } = t;
      expect(resto).toEqual(antes[id]);
    }
  });
  it('idempotente: migrar de novo (inclusive forçando v19) mantém composição e presets editados', () => {
    const a = migrateProject(arquivoV19());
    const b = migrateProject(JSON.parse(JSON.stringify(a)));
    expect(b).toEqual(a);
    const forcado = JSON.parse(JSON.stringify(a)) as Project;
    forcado.schemaVersion = 19;
    forcado.openingProfiles!['prf_alu_l25']!.name = 'Editado';
    const c = migrateProject(forcado);
    expect(c.openingTypes).toEqual(a.openingTypes);
    expect(c.openingProfiles!['prf_alu_l25']!.name).toBe('Editado');
  });
  it('tipo malformado não impede abrir o arquivo', () => {
    const raw = arquivoV19() as unknown as { openingTypes: Record<string, unknown> };
    raw.openingTypes.ruim = { id: 'ruim' };
    expect(() => migrateProject(raw)).not.toThrow();
  });
});

describe('ponte de comandos (spec §7)', () => {
  const novo = (): ProjectStore => new ProjectStore(migrateProject(arquivoV19()));
  it('editar campos de um tipo de uma célula regenera a composição', () => {
    const s = novo();
    const t = s.project.openingTypes.ot_p90!;
    s.exec({ type: 'upsertOpeningType', openingType: { ...t, width: 1.0, frameWidth: 0.06 } });
    const c = s.project.openingTypes.ot_p90!.composition!;
    expect(c.nominal.width).toBe(1.0);
    expect('inline' in c.frame.profile && c.frame.profile.inline.visibleWidth).toBe(0.06);
  });
  it('rejeita composição de várias células inválida; aceita a válida e a preserva', () => {
    const s = novo();
    const t = s.project.openingTypes.ot_p90!;
    const multi = compositionOfType({ ...t, transom: { height: 0.4 } });
    const ruim: OpeningComposition = { ...multi, layout: { ...(multi.layout as Extract<OpeningComposition['layout'], { kind: 'split' }>), children: [] } };
    expect(() => s.exec({ type: 'upsertOpeningType', openingType: { ...t, composition: ruim } })).toThrow(/2 filhos/);
    s.exec({ type: 'upsertOpeningType', openingType: { ...t, composition: multi } });
    expect(s.project.openingTypes.ot_p90!.composition).toEqual(multi);
  });
  it('projeto sem composição segue como está (sem gravar)', () => {
    const s = new ProjectStore(createEmptyProject());
    const t = { ...s.project.openingTypes.ot_p90! };
    delete (t as { composition?: unknown }).composition;
    s.exec({ type: 'upsertOpeningType', openingType: { ...t, width: 0.95 } });
    expect(s.project.openingTypes.ot_p90!.composition).toBeUndefined();
  });
});
