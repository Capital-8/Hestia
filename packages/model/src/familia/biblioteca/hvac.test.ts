import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import type { Corpo, Perfil } from '../tiposCorpo.ts';
import { validarFamilia } from '../validar.ts';
import { HVAC } from './hvac.ts';

/*
 * Ficha F8, parte 1: HVAC (dutos, curvas, redução, difusores, grelha e split). Confere o cadastro, a validação, as ligações de
 * cada tipo (tamanho do tipo, pontas para fora) e o volume do corpo principal contra a conta analítica (±1 %). O volume lê a
 * seção e o comprimento do próprio corpo; a conta analítica vem da geometria da família (área × comprimento, ou área × 2πR ×
 * ângulo, ou tronco de cone).
 */

const IDS = [
  'fam_duto_retangular',
  'fam_duto_redondo',
  'fam_duto_curva_retangular',
  'fam_duto_curva_redonda',
  'fam_duto_reducao',
  'fam_difusor_quadrado',
  'fam_difusor_redondo',
  'fam_grelha',
  'fam_split_evaporadora',
];

/** Ambiente de um tipo: valores do tipo (ou padrão), com as fórmulas derivadas calculadas até estabilizar. */
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

const porId = (id: string): Familia => {
  const f = HVAC.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};

const corpoPrincipal = (f: Familia): Corpo => {
  const c = f.corpos?.[0];
  if (!c) throw new Error(`sem corpo: ${f.id}`);
  return c;
};

/** Área (m²) da seção do perfil, em mm lidos do ambiente (anel, retângulo oco ou círculo). */
function areaPerfil(p: Perfil, env: Env): number {
  if (p.tipo === 'anel') {
    const de = numero(p.diametroExterno, env);
    const di = numero(p.diametroInterno, env);
    return (Math.PI / 4) * (de * de - di * di);
  }
  if (p.tipo === 'retanguloOco') {
    const l = numero(p.largura, env);
    const a = numero(p.altura, env);
    const e = numero(p.espessura, env);
    return l * a - (l - 2 * e) * (a - 2 * e);
  }
  if (p.tipo === 'circulo') return (Math.PI / 4) * numero(p.diametro, env) ** 2;
  throw new Error(`perfil sem área na conta: ${p.tipo}`);
}

/** Volume (mm³) do corpo: extrusão = área × comprimento; revolução = área × 2π·R × ângulo; transição = tronco de cone. */
function volumeCorpo(c: Corpo, env: Env): number {
  const f = c.forma;
  if (f.tipo === 'extrusao') return areaPerfil(f.perfil, env) * numero(f.comprimento, env);
  if (f.tipo === 'revolucao') {
    const p = f.perfil;
    const largura = p.tipo === 'anel' ? numero(p.diametroExterno, env) : p.tipo === 'retanguloOco' ? numero(p.largura, env) : 0;
    const afastamento = f.afastamento ? numero(f.afastamento, env) : 0;
    const raio = afastamento + largura / 2;
    return areaPerfil(p, env) * 2 * Math.PI * raio * (numero(f.angulo, env) / 360);
  }
  if (f.tipo === 'transicao') {
    const d1 = f.perfilA.tipo === 'circulo' ? numero(f.perfilA.diametro, env) : 0;
    const d2 = f.perfilB.tipo === 'circulo' ? numero(f.perfilB.diametro, env) : 0;
    return (Math.PI * numero(f.comprimento, env) * (d1 * d1 + d1 * d2 + d2 * d2)) / 12;
  }
  throw new Error(`forma sem conta: ${f.tipo}`);
}

const L = (env: Env): number => numero('L', env);
const A = (env: Env): number => numero('A', env);
const P = (env: Env): number => numero('P', env);
const E = (env: Env): number => numero('e', env);

/** Volume analítico (mm³) de cada família, a partir das dimensões do tipo (ficha F8). */
const ANALITICO: Record<string, (env: Env) => number> = {
  fam_duto_retangular: (env) => (L(env) * A(env) - (L(env) - 2 * E(env)) * (A(env) - 2 * E(env))) * P(env),
  fam_duto_redondo: (env) => (Math.PI / 4) * (L(env) ** 2 - (L(env) - 2 * E(env)) ** 2) * P(env),
  fam_duto_curva_retangular: (env) => (L(env) * A(env) - (L(env) - 2 * E(env)) * (A(env) - 2 * E(env))) * (Math.PI / 2) * P(env),
  fam_duto_curva_redonda: (env) => (Math.PI / 4) * (L(env) ** 2 - (L(env) - 2 * E(env)) ** 2) * (Math.PI / 2) * P(env),
  fam_duto_reducao: (env) => (Math.PI * P(env) * (L(env) ** 2 + L(env) * A(env) + A(env) ** 2)) / 12,
  fam_difusor_quadrado: (env) => (L(env) * P(env) - (L(env) - 2 * E(env)) * (P(env) - 2 * E(env))) * A(env),
  fam_difusor_redondo: (env) => (Math.PI / 4) * (L(env) ** 2 - (L(env) - 2 * E(env)) ** 2) * A(env),
};

/** Tamanho esperado (mm) da primeira ligação de cada família: diâmetro ou largura, conforme a seção. */
const TAMANHO_ESPERADO: Record<string, (env: Env) => number> = {
  fam_duto_retangular: (env) => L(env),
  fam_duto_redondo: (env) => L(env) - 2 * E(env),
  fam_duto_curva_retangular: (env) => L(env),
  fam_duto_curva_redonda: (env) => L(env) - 2 * E(env),
  fam_duto_reducao: (env) => L(env),
  fam_difusor_quadrado: (env) => L(env) - 2 * E(env),
  fam_difusor_redondo: (env) => L(env) - 2 * E(env),
  fam_grelha: (env) => L(env) - 2 * E(env),
  fam_split_evaporadora: (env) => numero('6.35', env),
};

describe('HVAC: cadastro e validação (ficha F8)', () => {
  it('são nove famílias com os ids da ficha, na ordem', () => {
    expect(HVAC.map((f) => f.id)).toEqual(IDS);
  });

  for (const f of HVAC) {
    it(`${f.id}: valida sem erro, disciplina hvac, categoria duto ou terminal de ar ou equipamento`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(f.disciplina).toBe('hvac');
      expect(['duto', 'terminal_ar', 'equipamento']).toContain(f.categoria);
      expect((f.ligacoes ?? []).length).toBeGreaterThan(0);
    });

    it(`${f.id}: resolve em todos os tipos, com ligações de tamanho positivo`, () => {
      for (const tipo of f.tipos) {
        const env = ambiente(f, tipo.id);
        for (const l of f.ligacoes ?? []) {
          const tamanho = l.secao === 'redonda' ? numero(l.diametro ?? '0', env) : numero(l.largura ?? '0', env);
          expect(tamanho).toBeGreaterThan(0);
          expect(numero(l.altura ?? '0', env)).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }
});

describe('HVAC: ligações por tipo', () => {
  for (const id of Object.keys(TAMANHO_ESPERADO)) {
    const f = porId(id);
    for (const tipo of f.tipos) {
      it(`${id} tipo ${tipo.id}: primeira ligação com o tamanho do tipo`, () => {
        const env = ambiente(f, tipo.id);
        const l = f.ligacoes?.[0];
        if (!l) throw new Error(`sem ligação: ${id}`);
        const esperado = TAMANHO_ESPERADO[id]?.(env) ?? NaN;
        const obtido = l.secao === 'redonda' ? numero(l.diametro ?? '0', env) : numero(l.largura ?? '0', env);
        expect(obtido).toBeCloseTo(esperado, 6);
      });
    }
  }

  it('curva retangular: pontas em (P, 0) e (0, P), saindo para −Y e −X (tangentes ao trecho)', () => {
    const f = porId('fam_duto_curva_retangular');
    const env = ambiente(f, 'r300x200');
    const [a, b] = f.ligacoes ?? [];
    expect(a?.posicao.map((s) => numero(s, env))).toEqual([300, 0, 100]);
    expect(a?.direcao).toEqual(['0', '-1', '0']);
    expect(b?.posicao.map((s) => numero(s, env))).toEqual([0, 300, 100]);
    expect(b?.direcao).toEqual(['-1', '0', '0']);
  });

  it('redução: entrada com o diâmetro L e saída com o diâmetro A do tipo', () => {
    const f = porId('fam_duto_reducao');
    const env = ambiente(f, 'd200_150');
    const [entrada, saida] = f.ligacoes ?? [];
    expect(numero(entrada?.diametro ?? '0', env)).toBe(200);
    expect(numero(saida?.diametro ?? '0', env)).toBe(150);
  });

  it('split: linhas de líquido e gás em refrigerante, e saída de ar em ar_insuflamento', () => {
    const f = porId('fam_split_evaporadora');
    expect(f.ligacoes?.map((l) => [l.id, l.dominio])).toEqual([
      ['liquido', 'refrigerante'],
      ['gas', 'refrigerante'],
      ['ar', 'ar_insuflamento'],
    ]);
  });
});

describe('HVAC: volume do corpo principal contra a conta analítica (±1 %)', () => {
  for (const id of Object.keys(ANALITICO)) {
    const f = porId(id);
    for (const tipo of f.tipos) {
      it(`${id} tipo ${tipo.id}: volume do corpo bate com o analítico`, () => {
        const env = ambiente(f, tipo.id);
        const v = volumeCorpo(corpoPrincipal(f), env);
        const esperado = ANALITICO[id]?.(env) ?? NaN;
        expect(Math.abs(v - esperado) / esperado).toBeLessThan(0.01);
      });
    }
  }
});

describe('HVAC: verificações de forma', () => {
  it('duto redondo com A ≠ L dispara a verificação de diâmetro', () => {
    const f = porId('fam_duto_redondo');
    const env = { ...ambiente(f, 'd200'), A: 180 };
    expect(tentar('A != L', env)).toMatchObject({ ok: true, valor: true });
  });

  it('raio do eixo menor que a meia largura é recusado pela verificação da curva', () => {
    const f = porId('fam_duto_curva_retangular');
    const env = { ...ambiente(f, 'r300x200'), P: 100 };
    expect(tentar('P < L / 2', env)).toMatchObject({ ok: true, valor: true });
  });
});
