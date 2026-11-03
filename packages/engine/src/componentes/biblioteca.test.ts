import { BIBLIOTECA_BASE, CATALOGO_PADRAO, exportarFamilias, familiaDaBiblioteca, IDS_OBRIGATORIOS, importarFamilias, validarFamilia, type Familia, type Parametro, type Valor } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import type { PecaResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Bateria que julga TODAS as famílias da biblioteca base (FICHAS E7-*). Cada família precisa: validar sem problema, resolver sem erro em
 * todos os tipos e em cada valor extremo de cada parâmetro flexionável, nunca ter duas peças se atravessando, ficar sobre o piso (z ≥ 0),
 * usar só chapas, fitas e ferragens do catálogo padrão, e sobreviver a salvar e abrir.
 */

const biblioteca = (id: string): Familia | undefined => familiaDaBiblioteca(id);

/** Maior volume (m3) de interseção entre duas peças não vazias, com os índices. */
function pior(pecas: readonly PecaResolvida[]): { v: number; a: string; b: string } {
  let w = { v: 0, a: '', b: '' };
  const ps = pecas.filter((p) => !p.vazio);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i]!; const b = ps[j]!;
    const ix = Math.min(a.origem[0] + a.extensao[0], b.origem[0] + b.extensao[0]) - Math.max(a.origem[0], b.origem[0]);
    const iy = Math.min(a.origem[1] + a.extensao[1], b.origem[1] + b.extensao[1]) - Math.max(a.origem[1], b.origem[1]);
    const iz = Math.min(a.origem[2] + a.extensao[2], b.origem[2] + b.extensao[2]) - Math.max(a.origem[2], b.origem[2]);
    if (ix > 1e-9 && iy > 1e-9 && iz > 1e-9) { const v = ix * iy * iz; if (v > w.v) w = { v, a: `${a.id}#${a.indice}`, b: `${b.id}#${b.indice}` }; }
  }
  return w;
}

/** Valores extremos de um parâmetro flexionável (sem fórmula). */
function extremos(p: Parametro): Valor[] {
  if (p.tipo === 'comprimento' || p.tipo === 'numero' || p.tipo === 'inteiro') return p.min !== undefined && p.max !== undefined ? [p.min, p.max] : [];
  if (p.tipo === 'enum' || p.tipo === 'chapa') return (p.opcoes ?? []).map((o) => o.valor);
  if (p.tipo === 'booleano') return [true, false];
  return [];
}

function conferir(f: Familia, tipoId: string | undefined, valores: Record<string, Valor>, rotulo: string): void {
  const r = resolverFamilia(f, { tipoId, valores, biblioteca });
  expect(r.erros, `${f.id} ${rotulo}`).toEqual([]);
  expect(r.pecas.length, `${f.id} ${rotulo}: sem peças`).toBeGreaterThan(0);
  for (const p of r.pecas) {
    expect([...p.origem, ...p.extensao].every(Number.isFinite), `${f.id} ${rotulo} ${p.id}`).toBe(true);
    expect(p.origem[2], `${f.id} ${rotulo} ${p.id}: abaixo do piso`).toBeGreaterThanOrEqual(-1e-6);
  }
  const w = pior(r.pecas);
  expect(w.v, `${f.id} ${rotulo}: ${w.a} atravessa ${w.b}`).toBeLessThanOrEqual(1e-9);
}

describe('registro da biblioteca', () => {
  it('ids únicos, ids obrigatórios de cada grupo presentes e pelo menos 28 famílias', () => {
    const ids = BIBLIOTECA_BASE.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [grupo, lista] of Object.entries(IDS_OBRIGATORIOS)) for (const id of lista) expect(ids, `${grupo}: falta ${id}`).toContain(id);
    expect(ids).toEqual(expect.arrayContaining(['fam_armario_baixo', 'fam_gaveta']));
    expect(BIBLIOTECA_BASE.length).toBeGreaterThanOrEqual(28);
  });
});

for (const f of BIBLIOTECA_BASE) {
  describe(`família ${f.id}`, () => {
    it('é válida, tem descrição, tipos e tipo padrão', () => {
      expect(validarFamilia(f)).toEqual([]);
      expect((f.descricao ?? '').length).toBeGreaterThan(10);
      expect(f.tipos.length).toBeGreaterThanOrEqual(1);
      expect(f.tipoPadrao).toBeDefined();
      expect(f.tipos.some((t) => t.id === f.tipoPadrao)).toBe(true);
    });
    it('cada tipo resolve limpo, sem peças atravessadas e sobre o piso', () => {
      for (const t of f.tipos) conferir(f, t.id, {}, `tipo ${t.id}`);
    });
    it('os valores extremos de cada parâmetro flexionável resolvem limpos', () => {
      for (const p of f.parametros.filter((q) => q.formula === undefined)) {
        for (const v of extremos(p)) conferir(f, f.tipoPadrao, { [p.id]: v }, `${p.id}=${String(v)}`);
      }
    });
    it('usa só chapas, fitas e ferragens do catálogo padrão, com a mesma espessura', () => {
      const chapas = new Map(CATALOGO_PADRAO.chapas.map((c) => [c.id, c.espessura]));
      for (const p of f.parametros.filter((q) => q.tipo === 'chapa')) for (const o of p.opcoes ?? []) {
        expect(chapas.has(String(o.valor)), `${f.id}: chapa ${String(o.valor)} fora do catálogo`).toBe(true);
        expect(o.esp, `${f.id}: espessura de ${String(o.valor)}`).toBe(chapas.get(String(o.valor)));
      }
      const fitas = new Set(CATALOGO_PADRAO.fitas.map((x) => x.id));
      for (const pc of f.pecas) for (const id of Object.values(pc.fita ?? {})) if (id !== undefined && id !== 'nenhuma') expect(fitas.has(id), `${f.id}/${pc.id}: fita ${id}`).toBe(true);
      const ferr = new Set(CATALOGO_PADRAO.ferragens.map((x) => x.id));
      for (const g of f.ferragens) expect(ferr.has(g.id), `${f.id}: ferragem ${g.id}`).toBe(true);
    });
    it('aninhados apontam para famílias da biblioteca', () => {
      for (const a of f.aninhados) expect(familiaDaBiblioteca(a.familiaId), `${f.id}/${a.id}: ${a.familiaId}`).toBeDefined();
    });
    it('salva e abre sem perda', () => {
      const r = importarFamilias(JSON.parse(JSON.stringify(exportarFamilias([f]))));
      expect(r.ignoradas).toEqual([]);
      expect(r.familias).toEqual([f]);
    });
  });
}
