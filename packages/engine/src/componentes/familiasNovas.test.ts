import { FAMILIAS_NOVAS, familiaDaBiblioteca, validarFamilia, type Familia, type Parametro, type Valor } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { caixaEnvolvente } from './medidas.ts';
import type { PecaResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Famílias novas da Biblioteca: cada uma resolve sem erro em todos os tipos e em cada valor extremo/enum, sem peça de tamanho
 * zero, sem peças atravessadas, sobre o piso e de forma determinística. Valores de referência literais (calculados à mão).
 */

const biblioteca = (id: string): Familia | undefined => familiaDaBiblioteca(id);

function atravessada(pecas: readonly PecaResolvida[]): string {
  const ps = pecas.filter((p) => !p.vazio);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i]!; const b = ps[j]!;
    const ix = Math.min(a.origem[0] + a.extensao[0], b.origem[0] + b.extensao[0]) - Math.max(a.origem[0], b.origem[0]);
    const iy = Math.min(a.origem[1] + a.extensao[1], b.origem[1] + b.extensao[1]) - Math.max(a.origem[1], b.origem[1]);
    const iz = Math.min(a.origem[2] + a.extensao[2], b.origem[2] + b.extensao[2]) - Math.max(a.origem[2], b.origem[2]);
    if (ix > 1e-9 && iy > 1e-9 && iz > 1e-9) return `${a.id}#${a.indice} x ${b.id}#${b.indice}`;
  }
  return '';
}

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
    expect(Math.min(...p.extensao), `${f.id} ${rotulo} ${p.id}: tamanho ≤ 0`).toBeGreaterThan(0);
    expect(p.origem[2], `${f.id} ${rotulo} ${p.id}: abaixo do piso`).toBeGreaterThanOrEqual(-1e-6);
  }
  expect(atravessada(r.pecas), `${f.id} ${rotulo}`).toBe('');
}

describe('famílias novas: bateria geral', () => {
  it('ids únicos e prefixo fam_', () => {
    const ids = FAMILIAS_NOVAS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('fam_')).toBe(true);
  });
  for (const f of FAMILIAS_NOVAS) {
    describe(f.id, () => {
      it('valida, tem descrição e hospedagem', () => {
        expect(validarFamilia(f)).toEqual([]);
        expect((f.descricao ?? '').length).toBeGreaterThan(20);
        expect(['nivel', 'parede']).toContain(f.hospedagem);
      });
      it('cada tipo resolve limpo e é determinístico', () => {
        for (const t of f.tipos) {
          conferir(f, t.id, {}, `tipo ${t.id}`);
          expect(resolverFamilia(f, { tipoId: t.id, biblioteca })).toEqual(resolverFamilia(f, { tipoId: t.id, biblioteca }));
        }
      });
      it('extremos e opções de cada parâmetro resolvem limpos', () => {
        for (const p of f.parametros.filter((q) => q.formula === undefined)) {
          for (const v of extremos(p)) conferir(f, f.tipoPadrao, { [p.id]: v }, `${p.id}=${String(v)}`);
        }
      });
      it('caixa total existe', () => {
        const r = resolverFamilia(f, { biblioteca });
        expect(caixaEnvolvente(r.pecas)).not.toBeNull();
      });
    });
  }
});
