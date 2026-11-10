import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  migrateProject,
  planViewHiddenOf,
  planViewRangeOf,
  planViewsOf,
  SCHEMA_VERSION,
  validateProject,
  viewAnnotationsOf,
  viewGraphicsOf,
  viewProfileOf,
  type PlanAnnotations,
  type Project,
} from './index.ts';

/**
 * Migração 23 → 24 (docs/vistas/FASE-2A.md, "Testes da migração"): vistas de planta como entidade. Os projetos de
 * `tests/vistas-ouro/projetos/*.json` são a entrada (v23, mais o legado v6); os cálculos esperados saem do JSON BRUTO,
 * de forma independente da implementação, e `testdata/projecaoFase1.json` é a projeção da Fase 1 congelada (valores
 * que o código ANTIGO dava sobre cada projeto, gerados antes da troca do armazenamento).
 */

const DIR = new URL('../../../tests/vistas-ouro/projetos/', import.meta.url);
const NOMES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const bruto = (f: string): Bruto => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Bruto;
const migrado = (f: string): Project => migrateProject(bruto(f));

const FAMILIAS = ['dimensions', 'texts', 'detailLines', 'detailRegions', 'tags'] as const;
type Familia = (typeof FAMILIAS)[number];
type Item = { id: string; [k: string]: unknown };
type Anots = Partial<Record<Familia, Item[]>>;
interface BrutoNivel extends Anots { id: string; name: string; hidden?: Hid; roofHidden?: Hid }
interface Hid { elements?: string[]; categories?: string[] }
interface BrutoArea { id: string; levelId: string; annotations?: Anots; graphics?: { showDimensions?: boolean; showAnnotations?: boolean }; hidden?: Hid }
interface Bruto { schemaVersion: number; levels: BrutoNivel[]; areaPlans?: BrutoArea[]; elements: Record<string, { kind: string; levelId?: string }> }

const lista = (a: Anots | undefined, f: Familia): Item[] => a?.[f] ?? [];
const todas = (a: Anots | undefined): Item[] => FAMILIAS.flatMap((f) => lista(a, f));
const temTelhado = (b: Bruto, levelId: string): boolean => Object.values(b.elements).some((e) => e.kind === 'roof' && e.levelId === levelId);
/** Remove o sufixo `__<idDaVista>` do id de uma cópia. */
const semSufixo = (id: string, viewId: string): string => (id.endsWith(`__${viewId}`) ? id.slice(0, -`__${viewId}`.length) : id);
const comoAnots = (a: PlanAnnotations): Anots => a as unknown as Anots;
const idsDe = (p: Project): string[] => planViewsOf(p).flatMap((v) => todas(comoAnots(v.annotations)).map((x) => x.id));
const mostraCotas = (a: BrutoArea): boolean => a.graphics?.showDimensions !== false;
const mostraNotas = (a: BrutoArea): boolean => a.graphics?.showAnnotations !== false;

/** Ouro lido do cálculo independente: o que cada vista de área deve ter, por família, a partir do projeto v23. */
function esperadoDaArea(b: Bruto, a: BrutoArea): Anots {
  const nivel = b.levels.find((l) => l.id === a.levelId)!;
  if (a.annotations === undefined) {
    return {
      dimensions: mostraCotas(a) ? lista(nivel, 'dimensions') : [],
      texts: mostraNotas(a) ? lista(nivel, 'texts') : [],
      detailLines: mostraNotas(a) ? lista(nivel, 'detailLines') : [],
      detailRegions: mostraNotas(a) ? lista(nivel, 'detailRegions') : [],
      tags: mostraNotas(a) ? lista(nivel, 'tags') : [],
    };
  }
  // Conjunto próprio: as próprias + as etiquetas do nível (a planta de área as desenha além das próprias).
  return { ...a.annotations, tags: [...lista(a.annotations, 'tags'), ...(mostraNotas(a) ? lista(nivel, 'tags') : [])] };
}

describe('migração 23 → 24: testes 1 a 8', () => {
  it('1. cada projeto do ouro migra sem erro e passa na validação', () => {
    for (const f of NOMES) {
      const p = migrado(f);
      expect(p.schemaVersion, f).toBe(24);
      expect(SCHEMA_VERSION).toBe(24);
      expect(validateProject(p).filter((i) => i.severity === 'error'), f).toEqual([]);
      expect(validateProject(p).filter((i) => i.code.startsWith('plan-view')), f).toEqual([]);
    }
  });

  it('2. contagem por família: piso = nível; cobertura, área herdada e etiquetas na área conferem com o cálculo independente', () => {
    for (const f of NOMES) {
      const b = bruto(f);
      const p = migrado(f);
      const noivel = (fam: Familia): number => b.levels.reduce((n, l) => n + lista(l, fam).length, 0);
      for (const fam of FAMILIAS) {
        const piso = planViewsOf(p).filter((v) => v.kind === 'floor').reduce((n, v) => n + comoAnots(v.annotations)[fam]!.length, 0);
        expect(piso, `${f} piso ${fam}`).toBe(noivel(fam));
        const cobertura = planViewsOf(p).filter((v) => v.kind === 'roof').reduce((n, v) => n + comoAnots(v.annotations)[fam]!.length, 0);
        expect(cobertura, `${f} cobertura ${fam}`).toBe(b.levels.filter((l) => temTelhado(b, l.id)).reduce((n, l) => n + lista(l, fam).length, 0));
        const area = planViewsOf(p).filter((v) => v.kind === 'area').reduce((n, v) => n + comoAnots(v.annotations)[fam]!.length, 0);
        const esperadaArea = (b.areaPlans ?? []).filter((a) => b.levels.some((l) => l.id === a.levelId)).reduce((n, a) => n + lista(esperadoDaArea(b, a), fam).length, 0);
        expect(area, `${f} área ${fam}`).toBe(esperadaArea);
      }
      const total = noivel('dimensions') + noivel('texts') + noivel('detailLines') + noivel('detailRegions') + noivel('tags');
      expect(idsDe(p).length, f).toBeGreaterThanOrEqual(total);
    }
  });

  it('3. nenhum id de anotação duplicado no projeto', () => {
    for (const f of NOMES) {
      const ids = idsDe(migrado(f));
      expect(new Set(ids).size, f).toBe(ids.length);
    }
  });

  it('4. refs e hostId das anotações migradas são os mesmos da origem e apontam para elementos que existiam', () => {
    for (const f of NOMES) {
      const b = bruto(f);
      const p = migrado(f);
      expect(Object.keys(p.elements).sort(), f).toEqual(Object.keys(b.elements).sort());
      const origens = new Map<string, Item>();
      for (const l of b.levels) for (const x of todas(l)) origens.set(x.id, x);
      for (const a of b.areaPlans ?? []) for (const x of todas(a.annotations)) origens.set(x.id, x);
      for (const v of planViewsOf(p)) {
        for (const x of todas(comoAnots(v.annotations))) {
          const o = origens.get(semSufixo(x.id, v.id));
          expect(o, `${f} ${v.id} ${x.id}`).toBeDefined();
          expect(x.refs, `${f} ${x.id} refs`).toEqual(o!.refs);
          expect(x.hostId, `${f} ${x.id} hostId`).toEqual(o!.hostId);
          if (typeof o!.hostId === 'string' && b.elements[o!.hostId]) expect(p.elements[x.hostId as string], `${f} ${x.id}`).toBeDefined();
          const refs = (o!.refs ?? {}) as Record<string, { wallId?: string } | undefined>;
          for (const r of Object.values(refs)) if (r?.wallId && b.elements[r.wallId]) expect(p.elements[r.wallId], `${f} ${x.id} ${r.wallId}`).toBeDefined();
        }
      }
    }
  });

  it('5. toda vista aponta para nível existente; todo nível tem exatamente uma pv_ e uma pvr_', () => {
    for (const f of NOMES) {
      const p = migrado(f);
      const niveis = new Set(p.levels.map((l) => l.id));
      const ids = planViewsOf(p).map((v) => v.id);
      expect(new Set(ids).size, f).toBe(ids.length);
      for (const v of planViewsOf(p)) expect(niveis.has(v.levelId), `${f} ${v.id}`).toBe(true);
      for (const l of p.levels) {
        expect(planViewsOf(p).filter((v) => v.id === `pv_${l.id}` && v.kind === 'floor' && v.levelId === l.id), `${f} ${l.id}`).toHaveLength(1);
        expect(planViewsOf(p).filter((v) => v.id === `pvr_${l.id}` && v.kind === 'roof' && v.levelId === l.id), `${f} ${l.id}`).toHaveLength(1);
        expect(planViewsOf(p).filter((v) => v.levelId === l.id && v.kind === 'floor'), `${f} ${l.id}`).toHaveLength(1);
        expect(planViewsOf(p).filter((v) => v.levelId === l.id && v.kind === 'roof'), `${f} ${l.id}`).toHaveLength(1);
      }
      // Ordem: por nível (piso e cobertura), depois as plantas de área na ordem original.
      const esperada = [...p.levels.flatMap((l) => [`pv_${l.id}`, `pvr_${l.id}`]), ...(b(f).areaPlans ?? []).filter((a) => niveis.has(a.levelId)).map((a) => a.id)];
      expect(ids, f).toEqual(esperada);
    }
  });

  it('6. hidden.elements que citava anotação herdada passa a citar a cópia', () => {
    for (const f of NOMES) {
      const raw = bruto(f);
      const p = migrado(f);
      const porId = new Map(planViewsOf(p).map((v) => [v.id, v] as const));
      for (const a of raw.areaPlans ?? []) {
        const nivel = raw.levels.find((l) => l.id === a.levelId);
        if (!nivel || a.annotations !== undefined) continue;
        const v = porId.get(a.id)!;
        const doNivel = new Set(todas(nivel).map((x) => x.id));
        const copias = new Set(todas(comoAnots(v.annotations)).map((x) => x.id));
        for (const id of a.hidden?.elements ?? []) {
          if (!doNivel.has(id)) {
            expect(v.hidden?.elements, `${f} ${a.id} ${id}`).toContain(id);
            continue;
          }
          const copia = `${id}__${a.id}`;
          if (copias.has(copia)) expect(v.hidden?.elements, `${f} ${a.id}`).toContain(copia);
          expect(v.hidden?.elements ?? [], `${f} ${a.id} ${id}`).not.toContain(id);
        }
      }
      for (const l of raw.levels) {
        const v = porId.get(`pvr_${l.id}`)!;
        const doNivel = new Set(todas(l).map((x) => x.id));
        const copias = new Set(todas(comoAnots(v.annotations)).map((x) => x.id));
        for (const id of l.roofHidden?.elements ?? []) {
          if (!doNivel.has(id)) {
            expect(v.hidden?.elements, `${f} ${l.id} ${id}`).toContain(id);
            continue;
          }
          expect(v.hidden?.elements ?? [], `${f} ${l.id} ${id}`).not.toContain(id);
          if (copias.has(`${id}__${v.id}`)) expect(v.hidden?.elements).toContain(`${id}__${v.id}`);
        }
        // O piso não troca nada: o id original continua valendo.
        expect(porId.get(`pv_${l.id}`)!.hidden?.elements, `${f} ${l.id}`).toEqual(l.hidden?.elements);
      }
    }
  });

  it('7. migrar, serializar, reabrir e serializar de novo dá texto idêntico', () => {
    for (const f of NOMES) {
      const um = JSON.stringify(migrado(f));
      const dois = JSON.stringify(migrateProject(JSON.parse(um)));
      expect(dois, f).toBe(um);
    }
  });

  it('8. o arquivo de esquema antigo (projeto 08, v6) percorre a cadeia até a 24', () => {
    const raw = bruto('08-legado-v6.json');
    expect(raw.schemaVersion).toBe(6);
    const p = migrateProject(raw);
    expect(p.schemaVersion).toBe(24);
    expect(planViewsOf(p).map((v) => v.id)).toEqual(p.levels.flatMap((l) => [`pv_${l.id}`, `pvr_${l.id}`]));
    expect(planViewRangeOf(p, `pv_${p.levels[0]!.id}`)).toEqual(expect.objectContaining({ top: expect.any(Number), cut: expect.any(Number) }));
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

/** Atalho: o JSON bruto do projeto pelo nome (usado pelo teste 5 para a ordem das plantas de área). */
function b(f: string): Bruto {
  return bruto(f);
}

// ── Teste 9: a API sobre o projeto migrado = a projeção da Fase 1 sobre o projeto v23 ────────────────────────────

interface Congelado {
  kind: string; levelId: string; name: string; viewRange: unknown; graphics: unknown; hidden: Hid | null;
  annotations: Anots; own: Anots; profile: unknown; area: unknown;
}
type Projecao = Record<string, { levels: string[]; views: Record<string, Congelado> }>;
const CONGELADA = JSON.parse(readFileSync(new URL('./testdata/projecaoFase1.json', import.meta.url), 'utf8')) as Projecao;
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('migração 23 → 24: teste 9 (leituras da API = projeção da Fase 1)', () => {
  it.each(NOMES)('%s', (f) => {
    const raw = bruto(f);
    const p = migrado(f);
    const antigo = CONGELADA[f]!;
    expect(planViewsOf(p).map((v) => v.id)).toEqual(Object.keys(antigo.views));
    for (const v of planViewsOf(p)) {
      const old = antigo.views[v.id]!;
      const rotulo = `${f} ${v.id}`;
      expect(v.kind, rotulo).toBe(old.kind);
      expect(v.levelId, rotulo).toBe(old.levelId);
      expect(v.name, rotulo).toBe(old.name);
      expect(json(planViewRangeOf(p, v.id)), rotulo).toEqual(old.viewRange);
      expect(json(viewGraphicsOf(p, v.id)), rotulo).toEqual(old.graphics);
      expect(json(viewProfileOf(p, v.id)), rotulo).toEqual(old.profile);
      expect(json(v.area ?? null), rotulo).toEqual(old.area);

      // Anotações: o que a vista desenhava, a menos da troca de id das cópias e das diferenças D3 (cobertura sem telhado)
      // e de famílias que a planta de área não desenha (agora a cópia só existe onde era desenhada).
      const nivel = raw.levels.find((l) => l.id === v.levelId)!;
      let esperado: Anots;
      if (v.kind === 'floor') esperado = old.annotations;
      else if (v.kind === 'roof') esperado = temTelhado(raw, v.levelId) ? old.annotations : {};
      else esperado = esperadoDaArea(raw, raw.areaPlans!.find((a) => a.id === v.id)!);
      for (const fam of FAMILIAS) {
        const atual = json(comoAnots(v.annotations)[fam]!).map((x) => ({ ...x, id: semSufixo(x.id, v.id) }));
        expect(atual, `${rotulo} ${fam}`).toEqual(json(lista(esperado, fam)));
      }
      expect(json(viewAnnotationsOf(p, v.id)), rotulo).toEqual(json(v.annotations));

      // Ocultos: os mesmos, trocando o id de anotação herdada pelo da cópia (ou removendo-o se não há cópia).
      const noVista = new Set(todas(comoAnots(v.annotations)).map((x) => x.id));
      const doNivel = new Set(todas(nivel).map((x) => x.id));
      const hiddenAntigo = old.hidden;
      const elementos = (hiddenAntigo?.elements ?? []).flatMap((id) => {
        if (v.kind === 'floor' || !doNivel.has(id)) return [id];
        return noVista.has(`${id}__${v.id}`) ? [`${id}__${v.id}`] : [];
      });
      const esperadoHidden = { ...(elementos.length > 0 ? { elements: elementos } : {}), ...(hiddenAntigo?.categories?.length ? { categories: hiddenAntigo.categories } : {}) };
      expect(json(planViewHiddenOf(p, v.id)), rotulo).toEqual(esperadoHidden);
    }
  });
});
