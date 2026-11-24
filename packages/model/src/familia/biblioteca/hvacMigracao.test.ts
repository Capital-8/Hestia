import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { DISCIPLINAS_EXEMPLO } from './disciplinasExemplo.ts';

/*
 * Ficha F8, parte 2: migração das famílias de exemplo (disciplinasExemplo.ts). Ids, nomes, categorias e DIMENSÕES ficam como
 * estavam. O snapshot abaixo foi gerado ANTES da edição, a partir da própria família antiga: posição e tamanho de cada peça
 * (mm), em cada tipo, com os parâmetros resolvidos. Os valores são trava de regressão, não conta de projeto.
 */

/** Dimensões antigas: por família e tipo, a lista plana de [origem x, y, z, tamanho a, b, espessura] de cada peça, na ordem. */
const DIMENSOES_ANTIGAS: Record<string, Record<string, number[]>> = {
  fam_vaso_sanitario: { vaso360: [0, 0, 0, 360, 455, 200, 0, 0, 200, 360, 455, 15, 0, 455, 0, 360, 245, 400], compacto: [0, 0, 0, 340, 422.5, 190, 0, 0, 190, 340, 422.5, 15, 0, 422.5, 0, 340, 227.5, 380], conforto: [0, 0, 0, 400, 487.5, 210, 0, 0, 210, 400, 487.5, 15, 0, 487.5, 0, 400, 262.5, 420] },
  fam_lavatorio: { lav50: [8, 8, 850, 484, 384, 8, 0, 0, 850, 500, 150, 8, 0, 392, 850, 500, 150, 8, 0, 8, 850, 384, 150, 8, 492, 8, 850, 384, 150, 8], lav60: [8, 8, 850, 584, 434, 8, 0, 0, 850, 600, 160, 8, 0, 442, 850, 600, 160, 8, 0, 8, 850, 434, 160, 8, 592, 8, 850, 434, 160, 8], lav45: [8, 8, 800, 434, 334, 8, 0, 0, 800, 450, 140, 8, 0, 342, 800, 450, 140, 8, 0, 8, 800, 334, 140, 8, 442, 8, 800, 334, 140, 8] },
  fam_ralo: { ralo100: [0, 0, 0, 100, 100, 8, 15, 15, 8, 70, 70, 12], ralo150: [0, 0, 0, 150, 150, 8, 15, 15, 8, 120, 120, 12], ralo100baixo: [0, 0, 0, 100, 100, 8, 15, 15, 8, 70, 70, 7] },
  fam_tomada: { baixa300: [0, 0, 300, 80, 80, 5, 10, 5, 310, 60, 45, 60], media1200: [0, 0, 1200, 80, 80, 5, 10, 5, 1210, 60, 45, 60], dupla: [0, 0, 1200, 115, 115, 5, 10, 5, 1210, 95, 45, 95] },
  fam_interruptor: { padrao: [15, 0, 1315, 50, 8, 50, 0, 8, 1300, 80, 80, 5, 10, 13, 1310, 60, 37, 60], duplo: [15, 0, 1315, 70, 8, 50, 0, 8, 1300, 100, 80, 5, 10, 13, 1310, 80, 37, 60], rebaixado: [15, 0, 915, 50, 8, 50, 0, 8, 900, 80, 80, 5, 10, 13, 910, 60, 37, 60] },
  fam_luminaria_teto: { plafon30: [0, 0, 2700, 300, 300, 10, 15, 15, 2710, 270, 270, 50], plafon60: [0, 0, 2700, 600, 600, 10, 15, 15, 2710, 570, 570, 60], linear120: [0, 0, 2700, 1200, 150, 10, 15, 15, 2710, 1170, 120, 50] },
  fam_quadro_distribuicao: { quadro12: [0, 0, 0, 400, 500, 3, 0, 3, 0, 400, 117, 500], quadro8: [0, 0, 0, 300, 400, 3, 0, 3, 0, 300, 97, 400], quadro24: [0, 0, 0, 500, 700, 3, 0, 3, 0, 500, 147, 700] },
  fam_difusor_teto: { difusor600: [0, 0, 2700, 600, 600, 10, 100, 100, 2710, 400, 400, 140], difusor450: [0, 0, 2700, 450, 450, 10, 100, 100, 2710, 250, 250, 140], difusor300: [0, 0, 2700, 300, 300, 10, 100, 100, 2710, 100, 100, 110] },
};

/** Id, nome e categoria de cada família antiga (a identidade que os projetos existentes referenciam). */
const IDENTIDADE_ANTIGA: ReadonlyArray<readonly [string, string, string]> = [
  ['fam_vaso_sanitario', 'Vaso sanitário', 'loucas'],
  ['fam_lavatorio', 'Lavatório de parede', 'loucas'],
  ['fam_ralo', 'Ralo de piso', 'loucas'],
  ['fam_tomada', 'Tomada de parede', 'equipamento'],
  ['fam_interruptor', 'Interruptor de parede', 'equipamento'],
  ['fam_luminaria_teto', 'Luminária de teto', 'equipamento'],
  ['fam_quadro_distribuicao', 'Quadro de distribuição', 'equipamento'],
  ['fam_difusor_teto', 'Difusor de teto', 'equipamento'],
];

/** Ambiente de um tipo: valores do tipo (ou padrão) e as fórmulas derivadas calculadas até estabilizar. */
function ambiente(f: Familia, tipoId: string): Env {
  const tipo = f.tipos.find((t) => t.id === tipoId);
  const env: Record<string, Valor> = {};
  for (const p of f.parametros) env[p.id] = tipo?.valores[p.id] ?? p.padrao;
  for (let rodada = 0; rodada <= f.parametros.length; rodada++) {
    for (const p of f.parametros) {
      if (p.formula === undefined) continue;
      const r = tentar(p.formula, env);
      if (r.ok) env[p.id] = r.valor;
    }
  }
  return env;
}

function numero(src: string, env: Env): number {
  const r = tentar(src, env);
  if (!r.ok || typeof r.valor !== 'number') throw new Error(`fórmula não numérica: ${src}`);
  return r.valor;
}

/** Dimensões resolvidas das peças de um tipo, no mesmo formato do snapshot. */
function dimensoes(f: Familia, tipoId: string): number[] {
  const env = ambiente(f, tipoId);
  return f.pecas.flatMap((p) => [...p.origem.map((s) => numero(s, env)), ...p.tamanho.map((s) => numero(s, env)), numero(p.espessura, env)]);
}

const porId = (id: string): Familia => {
  const f = DISCIPLINAS_EXEMPLO.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};

describe('migração das famílias de exemplo (ficha F8): identidade e dimensões', () => {
  it('as oito famílias antigas continuam na lista, com o mesmo id, nome e categoria', () => {
    expect(DISCIPLINAS_EXEMPLO.map((f) => [f.id, f.nome, f.categoria])).toEqual(IDENTIDADE_ANTIGA);
  });

  for (const [id, tipos] of Object.entries(DIMENSOES_ANTIGAS)) {
    for (const [tipoId, esperado] of Object.entries(tipos)) {
      it(`${id} tipo ${tipoId}: peças com as mesmas posições e tamanhos de antes`, () => {
        const obtido = dimensoes(porId(id), tipoId);
        expect(obtido).toHaveLength(esperado.length);
        obtido.forEach((v, i) => expect(v).toBeCloseTo(esperado[i] ?? NaN, 6));
      });
    }
  }
});

describe('migração das famílias de exemplo (ficha F8): ligações, símbolo e IFC', () => {
  for (const f of DISCIPLINAS_EXEMPLO) {
    it(`${f.id}: valida sem erro, ganha ligações, símbolo 2D de planta e classe IFC`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect((f.ligacoes ?? []).length).toBeGreaterThan(0);
      expect(f.simbolos?.map((s) => s.vistas)).toEqual([['planta']]);
      expect(f.ifc?.classe).toBeDefined();
    });

    for (const tipo of f.tipos) {
      it(`${f.id} tipo ${tipo.id}: ligações resolvem com diâmetro ou largura e altura positivos`, () => {
        const env = ambiente(f, tipo.id);
        for (const l of f.ligacoes ?? []) {
          const posicao = l.posicao.map((s) => numero(s, env));
          expect(posicao.every((x) => Number.isFinite(x))).toBe(true);
          if (l.secao === 'redonda') expect(numero(l.diametro ?? '0', env)).toBeGreaterThan(0);
          else {
            expect(numero(l.largura ?? '0', env)).toBeGreaterThan(0);
            expect(numero(l.altura ?? '0', env)).toBeGreaterThan(0);
          }
        }
      });
    }
  }

  it('o ralo tem a saída de esgoto na flange (z = 0) para baixo', () => {
    const l = porId('fam_ralo').ligacoes?.find((x) => x.id === 'esgoto');
    expect(l?.direcao).toEqual(['0', '0', '-1']);
    expect(l?.posicao[2]).toBe('0');
  });
});
