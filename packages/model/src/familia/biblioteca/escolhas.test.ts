import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from '../exemplos.ts';
import type { Familia, Peca } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { BIBLIOTECA_BASE } from './index.ts';

/*
 * Escolhas internas nas famílias da biblioteca (ficha ESC-biblioteca). O teste recalcula a regra a partir das fórmulas
 * `quando`/`repetir` de cada peça, sem copiar a lista esperada: todo parâmetro enum/booleano/inteiro sem fórmula citado
 * por alguma peça vira uma escolha na zona da primeira peça que o cita.
 */

const TIPOS_COM_ESCOLHA = new Set(['enum', 'booleano', 'inteiro']);

const ZONAS_POR_PAPEL: Record<string, string> = {
  porta: 'portas',
  fundo: 'fundo',
  prateleira: 'prateleiras',
  gaveta: 'gavetas',
  tampo: 'tampo',
  rodape: 'rodape',
};

/** Id de parâmetro como palavra inteira (letras, dígitos e `_`). */
function usaParametro(formula: string | undefined, id: string): boolean {
  if (formula === undefined) return false;
  return formula.split(/[^A-Za-z0-9_]+/).includes(id);
}

function pecasQueUsam(f: Familia, id: string): Peca[] {
  return f.pecas.filter((peca) => usaParametro(peca.quando, id) || usaParametro(peca.repetir, id));
}

function zonaDoPapel(peca: Peca): string {
  return ZONAS_POR_PAPEL[peca.papel] ?? peca.papel;
}

/** Parâmetro → zona da primeira peça (na ordem da lista) que cita o parâmetro nas fórmulas. */
function escolhasEsperadas(f: Familia): Map<string, string> {
  const esperadas = new Map<string, string>();
  for (const parametro of f.parametros) {
    if (parametro.formula !== undefined || !TIPOS_COM_ESCOLHA.has(parametro.tipo)) continue;
    const pecas = pecasQueUsam(f, parametro.id);
    if (pecas.length === 0) continue;
    esperadas.set(parametro.id, zonaDoPapel(pecas[0]!));
  }
  return esperadas;
}

const familias = [...new Map([...BIBLIOTECA_BASE, FAMILIA_ARMARIO].map((f) => [f.id, f])).values()];

describe('escolhas da biblioteca', () => {
  it('todas as famílias continuam válidas', () => {
    for (const f of familias) {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro'), f.id).toEqual([]);
    }
  });

  it('cada escolha aponta para um parâmetro de escolha e uma zona existente', () => {
    for (const f of familias) {
      const zonas = new Set(f.pecas.map((p) => p.grupo).filter((g): g is string => g !== undefined && g !== ''));
      const parametros = new Map(f.parametros.map((p) => [p.id, p]));
      const vistas = new Set<string>();

      for (const escolha of f.escolhas ?? []) {
        const parametro = parametros.get(escolha.parametro);
        expect(parametro, `${f.id}: parâmetro ${escolha.parametro}`).toBeDefined();
        expect(TIPOS_COM_ESCOLHA.has(parametro!.tipo), `${f.id}: tipo de ${escolha.parametro}`).toBe(true);
        expect(parametro!.formula, `${f.id}: ${escolha.parametro} tem fórmula`).toBeUndefined();
        expect(zonas.has(escolha.zona), `${f.id}: zona ${escolha.zona}`).toBe(true);
        expect(vistas.has(escolha.parametro), `${f.id}: escolha repetida para ${escolha.parametro}`).toBe(false);
        vistas.add(escolha.parametro);
      }
    }
  });

  it('a quantidade e a zona das escolhas seguem a regra das fórmulas', () => {
    for (const f of familias) {
      const esperadas = escolhasEsperadas(f);
      const escolhas = f.escolhas ?? [];

      expect(escolhas.map((e) => e.parametro).sort(), `${f.id}: parâmetros com escolha`).toEqual([...esperadas.keys()].sort());
      expect(new Set(escolhas.map((e) => e.id)).size, `${f.id}: ids de escolha`).toBe(escolhas.length);

      for (const escolha of escolhas) {
        const parametro = f.parametros.find((p) => p.id === escolha.parametro)!;
        expect(escolha.id, f.id).toBe(`esc_${parametro.id}`);
        expect(escolha.nome, f.id).toBe(parametro.nome);
        expect(escolha.zona, `${f.id}: ${parametro.id}`).toBe(esperadas.get(parametro.id));

        const pecas = pecasQueUsam(f, parametro.id);
        expect(pecas.length, `${f.id}: peças de ${parametro.id}`).toBeGreaterThan(0);
        expect(pecas.some((peca) => peca.grupo === escolha.zona), `${f.id}: zona ${escolha.zona}`).toBe(true);
        for (const peca of pecas) expect(peca.grupo, `${f.id}: grupo de ${peca.id}`).toBe(zonaDoPapel(peca));
      }
    }
  });
});
