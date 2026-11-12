import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  legacyRoofViewId,
  migrateCoberturaV24,
  migrateProject,
  migrateVistasV23,
  normalizeCobertura,
  planViewOf,
  planViewsOf,
  SCHEMA_VERSION,
  validateProject,
  type Project,
} from './index.ts';

/**
 * Migração 24 → 25 (cobertura como planta comum). Os projetos de `tests/vistas-ouro/projetos/*.json` (v23, mais o legado
 * v6) entram; o estado v24 de referência é o da migração 23 → 24 (que continua gerando `kind: 'roof'`).
 */
type Raw = Record<string, unknown>;
type V = { id: string; name: string; levelId: string; kind: string; viewRange: unknown; graphics?: unknown; hidden?: unknown; annotations: unknown; showRoofOnTop?: boolean };

const DIR = new URL('../../../tests/vistas-ouro/projetos/', import.meta.url);
const NOMES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const bruto = (f: string): Raw => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Raw;
const json = (x: unknown): string => JSON.stringify(x);
/** Projeto no formato do esquema 24 (as coberturas ainda `kind: 'roof'`), só para os de v23. */
const v24De = (f: string): { planViews: V[]; levels: Array<{ id: string; name: string }> } => migrateVistasV23(bruto(f)) as never;
const v25De = (f: string): Project => migrateProject(bruto(f));
const ehV23 = (f: string): boolean => bruto(f).schemaVersion === 23;

describe('migração 24 → 25: cobertura vira planta de piso com showRoofOnTop', () => {
  it('SCHEMA_VERSION é 25 e todos os projetos do ouro chegam a ele e validam sem erro', () => {
    expect(SCHEMA_VERSION).toBe(25);
    for (const f of NOMES) {
      const p = v25De(f);
      expect(p.schemaVersion, f).toBe(25);
      expect(validateProject(p).filter((i) => i.severity === 'error'), f).toEqual([]);
    }
  });

  it('a 23 → 24 continua gerando kind roof (a migração antiga não mudou)', () => {
    for (const f of NOMES.filter(ehV23)) {
      const v24 = v24De(f);
      expect(v24.planViews.filter((v) => v.kind === 'roof').length, f).toBe(v24.levels.length);
    }
  });

  it('toda pvr_* vira floor com showRoofOnTop e a mesma faixa; nenhuma roof; mesmo número de vistas; mesmos ids e ordem', () => {
    for (const f of NOMES.filter(ehV23)) {
      const antes = v24De(f).planViews;
      const depois = planViewsOf(v25De(f)) as unknown as V[];
      expect(depois.length, f).toBe(antes.length);
      expect(depois.map((v) => v.id), f).toEqual(antes.map((v) => v.id));
      expect(depois.some((v) => (v.kind as string) === 'roof'), f).toBe(false);
      for (const a of antes.filter((v) => v.kind === 'roof')) {
        const d = depois.find((v) => v.id === a.id)!;
        expect(a.id.startsWith('pvr_'), f).toBe(true);
        expect(d.kind, a.id).toBe('floor');
        expect(d.showRoofOnTop, a.id).toBe(true);
        expect(json(d.viewRange), a.id).toBe(json(a.viewRange));
        expect(d.levelId, a.id).toBe(a.levelId);
      }
    }
  });

  it('annotations, hidden e graphics iguais byte a byte (coberturas e todas as demais vistas)', () => {
    for (const f of NOMES.filter(ehV23)) {
      const antes = v24De(f).planViews;
      const depois = planViewsOf(v25De(f)) as unknown as V[];
      for (const a of antes) {
        const d = depois.find((v) => v.id === a.id)!;
        expect(json(d.annotations), `${f} ${a.id} annotations`).toBe(json(a.annotations));
        expect(json(d.hidden), `${f} ${a.id} hidden`).toBe(json(a.hidden));
        expect(json(d.graphics), `${f} ${a.id} graphics`).toBe(json(a.graphics));
        if (a.kind !== 'roof') expect(json(d), `${f} ${a.id}`).toBe(json(a));
      }
    }
  });

  it('o projeto legado v6 chega ao 25 com uma pvr_ por nível, todas mantidas', () => {
    const f = '08-legado-v6.json';
    const p = v25De(f);
    for (const l of p.levels) {
      const v = planViewOf(p, legacyRoofViewId(l.id))!;
      expect(v, l.id).toBeDefined();
      expect(v.kind).toBe('floor');
      expect(v.showRoofOnTop).toBe(true);
    }
    expect(planViewsOf(p).filter((v) => v.id.startsWith('pvr_'))).toHaveLength(p.levels.length);
  });

  it('idempotente: migrar de novo o resultado não muda nada e a normalização devolve o mesmo objeto', () => {
    for (const f of NOMES) {
      const p = v25De(f);
      expect(json(migrateProject(JSON.parse(json(p)))), f).toBe(json(p));
      const raw = JSON.parse(json(p)) as Raw;
      expect(normalizeCobertura(raw), f).toBe(raw);
      expect(migrateCoberturaV24(raw), f).toBe(raw);
    }
  });

  it('pranchas continuam resolvendo (as fontes apontam para vistas que existem)', () => {
    for (const f of NOMES) {
      const p = v25De(f);
      for (const s of p.sheets ?? []) {
        for (const vp of s.viewports) if (vp.view.kind === 'plan') expect(planViewOf(p, vp.view.viewId), `${f} ${s.id} ${vp.id}`).toBeDefined();
      }
    }
  });

  it('o 07-pranchas tem prancha e ela segue com as mesmas fontes', () => {
    const p = v25De('07-pranchas.json');
    const antes = (bruto('07-pranchas.json').sheets as Array<{ viewports: Array<{ view: unknown }> }>).length;
    expect(antes).toBeGreaterThan(0);
    expect(p.sheets).toHaveLength(antes);
  });
});

describe('nome da cobertura migrada', () => {
  const base = (nome: string): Raw => ({
    levels: [{ id: 'lv_0', name: 'Térreo', elevation: 0 }],
    planViews: [
      { id: 'pv_lv_0', name: 'Térreo', levelId: 'lv_0', kind: 'floor', viewRange: {}, annotations: {} },
      { id: 'pvr_lv_0', name: nome, levelId: 'lv_0', kind: 'roof', viewRange: {}, annotations: {} },
    ],
  });
  const nomes = (r: Raw): string[] => (r.planViews as Array<{ name: string }>).map((v) => v.name);

  it('nome idêntico ao do nível vira "Cobertura: <nível>"; o piso não muda', () => {
    expect(nomes(migrateCoberturaV24(base('Térreo')))).toEqual(['Térreo', 'Cobertura: Térreo']);
  });

  it('nome editado é preservado', () => {
    expect(nomes(migrateCoberturaV24(base('Telhado da garagem')))).toEqual(['Térreo', 'Telhado da garagem']);
  });

  it('kind roof solto em migrateProject (arquivo já na versão atual) também é normalizado', () => {
    const p = v25De('01-casa-varios-niveis.json');
    const solto = JSON.parse(json(p)) as { planViews: V[] };
    const alvo = solto.planViews.find((v) => v.id.startsWith('pvr_'))!;
    alvo.kind = 'roof';
    delete alvo.showRoofOnTop;
    const m = migrateProject(solto);
    const v = planViewOf(m, alvo.id)!;
    expect(v.kind).toBe('floor');
    expect(v.showRoofOnTop).toBe(true);
  });
});
