import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateProject, planViewsOf, validateProject, type PlanAnnotations, type Project } from './index.ts';

/**
 * Raia E: etiquetas de elemento (`ElementTag`) do NÍVEL copiadas para as plantas de área na migração 23 → 24.
 *
 * A planta de área desenhava as etiquetas do nível lendo a planta de piso na hora de desenhar, além das próprias. Agora a
 * migração as copia para a vista (id `<id>__<idDaVista>`, `hostId` mantido) e o desenho lê só a vista. Regra: a planta com
 * `graphics.showAnnotations` ligado recebe uma cópia de cada etiqueta do nível; a que herdava as anotações já a recebia
 * pela família `tags` e continua com uma só (nunca duas); com a opção desligada, nenhuma. Os valores esperados saem do
 * JSON bruto v23, de forma independente da implementação.
 */

const DIR = new URL('../../../tests/vistas-ouro/projetos/', import.meta.url);
const NOMES = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();

type Item = { id: string; hostId?: string; [k: string]: unknown };
interface Hid { elements?: string[]; categories?: string[] }
interface BrutoNivel { id: string; tags?: Item[] }
interface BrutoArea { id: string; name?: string; levelId: string; annotations?: { tags?: Item[] }; graphics?: { showAnnotations?: boolean }; hidden?: Hid }
interface Bruto { levels: BrutoNivel[]; areaPlans?: BrutoArea[]; elements: Record<string, unknown> }

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const bruto = (f: string): Bruto => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Bruto;
const migrado = (f: string): Project => migrateProject(bruto(f));
const PROPRIA = '04-area-anotacoes-proprias.json';
const comoAnots = (a: PlanAnnotations): { tags: Item[]; [k: string]: Item[] } => a as unknown as { tags: Item[] };
const vista = (p: Project, id: string) => planViewsOf(p).find((v) => v.id === id)!;
const idsDasTags = (p: Project, id: string): string[] => comoAnots(vista(p, id).annotations).tags.map((t) => t.id);
const sufixo = (id: string, viewId: string): string => (id.endsWith(`__${viewId}`) ? id.slice(0, -`__${viewId}`.length) : id);
const etiqueta = (id: string): Item => ({ id, hostId: 'h_s', at: { x: 1, y: 2 }, property: 'mark', leader: true });

/** O projeto 04 (v23) com `mexer` aplicado ao JSON bruto. */
function sintetico(mexer: (raw: Bruto) => void): { raw: Bruto; p: Project } {
  const raw = clone(bruto(PROPRIA));
  mexer(raw);
  return { raw, p: migrateProject(clone(raw)) };
}

describe('migração 23 → 24: etiquetas de elemento do nível nas plantas de área (raia E)', () => {
  it('contagem independente: as próprias mais uma cópia de cada etiqueta do nível, só nos casos em que a área as desenhava', () => {
    let copiasTotal = 0;
    for (const f of NOMES) {
      const b = bruto(f);
      const p = migrado(f);
      for (const a of (b.areaPlans ?? []).filter((x) => b.levels.some((l) => l.id === x.levelId))) {
        const nivel = b.levels.find((l) => l.id === a.levelId)!;
        const doNivel = new Set((nivel.tags ?? []).map((t) => t.id));
        const copias = idsDasTags(p, a.id).filter((id) => id !== sufixo(id, a.id) && doNivel.has(sufixo(id, a.id)));
        // Herdava: a família `tags` (campo ausente = ligado). Própria: `showAnnotations` ligado (a leitura cruzada exigia isso).
        const desenha = a.annotations === undefined ? a.graphics?.showAnnotations !== false : a.graphics?.showAnnotations === true;
        expect(copias.length, `${f} ${a.id}`).toBe(desenha ? doNivel.size : 0);
        // As etiquetas próprias não são tocadas e vêm antes das cópias.
        const proprias = (a.annotations?.tags ?? []).map((t) => t.id);
        expect(idsDasTags(p, a.id).slice(0, proprias.length), `${f} ${a.id}`).toEqual(proprias);
        copiasTotal += copias.length;
      }
    }
    // Ouro: 03 herda (1), 04 própria (1) e vazia (1); 05 e 07 herdam de um nível sem etiqueta.
    expect(copiasTotal).toBe(3);
  });

  it('planta própria e planta com `annotations: {}`: a cópia tem o id com sufixo, o mesmo conteúdo e o mesmo hostId', () => {
    const { raw, p } = sintetico((r) => r.levels[0]!.tags!.push(etiqueta('tg_x')));
    for (const ap of ['ap_propria', 'ap_vazia']) {
      const cop = comoAnots(vista(p, ap).annotations).tags.find((t) => t.id === `tg_x__${ap}`)!;
      expect(cop, ap).toBeDefined();
      expect({ ...cop, id: 'tg_x' }, ap).toEqual(raw.levels[0]!.tags!.find((t) => t.id === 'tg_x'));
      expect(p.elements[cop.hostId as string], ap).toBeDefined();
    }
    // O piso continua com os originais, e só eles.
    expect(idsDasTags(p, 'pv_lv_0')).toEqual(['tg_n0', 'tg_x']);
    // Cada planta tem as cópias de TODAS as etiquetas do nível.
    expect(idsDasTags(p, 'ap_vazia')).toEqual(['tg_n0__ap_vazia', 'tg_x__ap_vazia']);
    expect(idsDasTags(p, 'ap_propria')).toEqual(['tg_ap', 'tg_n0__ap_propria', 'tg_x__ap_propria']);
  });

  it('planta que herdava: uma só cópia de cada etiqueta do nível (a da família `tags`, sem duplicar)', () => {
    const b = bruto('03-area-herda-anotacoes.json');
    const p = migrado('03-area-herda-anotacoes.json');
    expect(idsDasTags(p, 'ap_herda')).toEqual(b.levels[0]!.tags!.map((t) => `${t.id}__ap_herda`));
  });

  it('planta com showAnnotations desligado não recebe etiqueta do nível (a que herdava também não)', () => {
    const { p } = sintetico((r) => {
      for (const a of r.areaPlans!) a.graphics = { ...a.graphics, showAnnotations: false };
      r.areaPlans!.push({ id: 'ap_herda_off', name: 'H', levelId: 'lv_0', graphics: { ...r.areaPlans![0]!.graphics, showAnnotations: false } });
    });
    expect(idsDasTags(p, 'ap_propria')).toEqual(['tg_ap']);
    expect(idsDasTags(p, 'ap_vazia')).toEqual([]);
    expect(idsDasTags(p, 'ap_herda_off')).toEqual([]);
  });

  it('ids únicos no projeto e hostId das etiquetas das áreas apontando para elementos existentes, em todos os projetos do ouro', () => {
    for (const f of NOMES) {
      const p = migrado(f);
      const ids = planViewsOf(p).flatMap((v) => Object.values(comoAnots(v.annotations)).flat().map((x) => x.id));
      expect(new Set(ids).size, f).toBe(ids.length);
      for (const v of planViewsOf(p).filter((x) => x.kind === 'area')) {
        for (const t of comoAnots(v.annotations).tags) expect(p.elements[t.hostId as string], `${f} ${t.id}`).toBeDefined();
      }
    }
  });

  it('hidden.elements com o id de uma etiqueta do nível passa a citar a cópia (planta própria e planta vazia)', () => {
    const { p } = sintetico((r) => {
      r.areaPlans![0]!.hidden = { elements: ['tg_n0', 'h_s'] };
      r.areaPlans![1]!.hidden = { elements: ['tg_n0'] };
    });
    expect(vista(p, 'ap_propria').hidden?.elements).toEqual(['tg_n0__ap_propria', 'h_s']);
    expect(vista(p, 'ap_vazia').hidden?.elements).toEqual(['tg_n0__ap_vazia']);
  });

  it('hidden.elements com a etiqueta do nível numa planta que não a copia (opção desligada) fica como está', () => {
    const { p } = sintetico((r) => {
      r.areaPlans![0]!.graphics = { ...r.areaPlans![0]!.graphics, showAnnotations: false };
      r.areaPlans![0]!.hidden = { elements: ['tg_n0'] };
    });
    expect(vista(p, 'ap_propria').hidden?.elements).toEqual(['tg_n0']);
  });

  it('migrar, serializar, reabrir e serializar de novo dá texto idêntico (com cópias nas plantas próprias)', () => {
    const { p } = sintetico((r) => {
      r.levels[0]!.tags!.push(etiqueta('tg_x'));
      r.areaPlans![0]!.hidden = { elements: ['tg_x'] };
    });
    const um = JSON.stringify(p);
    expect(JSON.stringify(migrateProject(JSON.parse(um)))).toBe(um);
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('os projetos do ouro 03 e 04 percorrem a migração e passam na validação', () => {
    for (const f of ['03-area-herda-anotacoes.json', PROPRIA]) {
      expect(validateProject(migrado(f)).filter((i) => i.severity === 'error'), f).toEqual([]);
    }
  });
});
