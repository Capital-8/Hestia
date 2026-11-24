import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import type { Corpo } from '../tiposCorpo.ts';
import { validarFamilia } from '../validar.ts';
import { deDn } from './eletricaApoio.ts';
import { LUMINARIAS } from './luminarias.ts';

/*
 * Ficha F6: luminárias (plafon redondo, painéis LED, spot, pendente, arandela e fita linear). Este teste fica no modelo (sem o
 * motor): confere a validação, o id e a ordem de cada família, categoria, disciplina e IFC, as duas ligações (força e eletroduto)
 * com o diâmetro De do DN e direção unitária, o símbolo de planta de teto ou de parede, e o volume do corpo principal contra a
 * conta analítica (±1 %). A discretização do círculo (32 lados) dá 0,64 % a menos, dentro da tolerância.
 */

/** Ambiente de um tipo: valores do tipo (ou padrão), `extra` por cima, e as fórmulas calculadas até estabilizar. */
function ambiente(f: Familia, tipoId: string, extra: Record<string, Valor> = {}): Env {
  const tipo = f.tipos.find((t) => t.id === tipoId);
  const env: Record<string, Valor> = {};
  for (const p of f.parametros) env[p.id] = extra[p.id] ?? tipo?.valores[p.id] ?? p.padrao;
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

const corpoPrincipal = (f: Familia): Corpo => {
  const c = f.corpos?.[0];
  if (!c) throw new Error(`sem corpo: ${f.id}`);
  return c;
};

/** Lados padrão do círculo e da revolução (CONTRATO §2.2 e §2.3): 32. Área do polígono inscrito de raio r: N/2 · r² · sen(2π/N). */
const N = 32;
const fatorPoligono = (N / 2) * Math.sin((2 * Math.PI) / N);

/** Volume (m³) do corpo principal conforme a forma, com a discretização de 32 lados. Mesma conta de cada família. */
function volumeCorpo(c: Corpo, env: Env): number {
  const f = c.forma;
  if (f.tipo === 'extrusao') {
    const p = f.perfil;
    const area = p.tipo === 'retangulo' ? numero(p.largura, env) * numero(p.altura, env) : fatorPoligono * (numero(p.tipo === 'circulo' ? p.diametro : '0', env) / 2) ** 2;
    return (area * numero(f.comprimento, env)) / 1e9;
  }
  if (f.tipo === 'revolucao') {
    const p = f.perfil;
    if (p.tipo !== 'retangulo') throw new Error('revolução de teste deve ser retângulo');
    const w = numero(p.largura, env);
    return (fatorPoligono * w * w * numero(p.altura, env)) / 1e9;
  }
  if (f.tipo === 'transicao') {
    const a = f.perfilA;
    const b = f.perfilB;
    if (a.tipo !== 'circulo' || b.tipo !== 'circulo') throw new Error('transição de teste deve ser de círculos');
    const R = numero(a.diametro, env) / 2;
    const r = numero(b.diametro, env) / 2;
    return (fatorPoligono * numero(f.comprimento, env) * (R * R + R * r + r * r)) / 3 / 1e9;
  }
  throw new Error(`forma de teste não prevista: ${f.tipo}`);
}

/** Volume analítico (m³) do corpo principal, pela geometria exata (círculo de verdade, sem polígono). */
const ANALITICO: Record<string, (env: Env) => number> = {
  fam_luminaria_plafon_redondo: (e) => (Math.PI * (numero('L', e) / 2) ** 2 * (numero('A', e) - numero('E', e))) / 1e9,
  fam_luminaria_painel_led_quadrado: (e) => (numero('L', e) * numero('P', e) * (numero('A', e) - numero('E', e))) / 1e9,
  fam_luminaria_painel_led_retangular: (e) => (numero('L', e) * numero('P', e) * (numero('A', e) - numero('E', e))) / 1e9,
  fam_luminaria_spot_embutido: (e) => (Math.PI * (numero('L', e) / 2) ** 2 * (numero('A', e) - numero('E', e))) / 1e9,
  fam_luminaria_pendente: (e) => {
    const R = numero('L', e) / 2;
    const r = numero('L', e) / 4;
    return (Math.PI * (numero('A', e) - numero('E', e)) * (R * R + R * r + r * r)) / 3 / 1e9;
  },
  fam_luminaria_arandela: (e) => (numero('L', e) * numero('A', e) * (numero('P', e) - numero('E', e))) / 1e9,
  fam_luminaria_linear: (e) => ((numero('A', e) - numero('E', e)) * numero('P', e) * numero('L', e)) / 1e9,
};

describe('luminárias: cadastro (ficha F6)', () => {
  it('são 7 famílias com os ids obrigatórios, na ordem da ficha', () => {
    expect(LUMINARIAS.map((f) => f.id)).toEqual([
      'fam_luminaria_plafon_redondo',
      'fam_luminaria_painel_led_quadrado',
      'fam_luminaria_painel_led_retangular',
      'fam_luminaria_spot_embutido',
      'fam_luminaria_pendente',
      'fam_luminaria_arandela',
      'fam_luminaria_linear',
    ]);
  });

  for (const f of LUMINARIAS) {
    it(`${f.id}: valida sem erro, categoria luminária, disciplina elétrica e IFC IFCLIGHTFIXTURE`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(f.categoria).toBe('luminaria');
      expect(f.disciplina).toBe('eletrico');
      expect(f.ifc?.classe).toBe('IFCLIGHTFIXTURE');
    });

    it(`${f.id}: tipo padrão existe, cada tipo traz L, A, P, DN, potência, fluxo e temperatura`, () => {
      expect(f.tipos.some((t) => t.id === f.tipoPadrao)).toBe(true);
      for (const t of f.tipos) {
        for (const chave of ['L', 'A', 'P', 'DN', 'potencia', 'fluxoLuminoso', 'temperaturaCor']) expect(t.valores[chave]).toBeDefined();
      }
    });

    it(`${f.id}: tem símbolo 2D de planta que substitui a geometria`, () => {
      const simbolo = f.simbolos?.[0];
      expect(simbolo?.vistas).toEqual(['planta']);
      expect(simbolo?.substituiGeometria).toBe(true);
      expect(simbolo?.primitivos.length).toBeGreaterThan(0);
    });

    it(`${f.id}: duas ligações, uma de força e uma de eletroduto, com potência e tensão no ponto de força`, () => {
      const dominios = (f.ligacoes ?? []).map((l) => l.dominio).sort();
      expect(dominios).toEqual(['eletrica_forca', 'eletroduto']);
      const forca = f.ligacoes?.find((l) => l.dominio === 'eletrica_forca');
      expect(Object.keys(forca?.propriedades ?? {}).sort()).toEqual(['potencia', 'tensao']);
    });
  }
});

describe('luminárias: ligações por tipo', () => {
  for (const f of LUMINARIAS) {
    for (const tipo of f.tipos) {
      it(`${f.id} tipo ${tipo.id}: diâmetro De do DN do tipo e direções unitárias`, () => {
        const env = ambiente(f, tipo.id);
        const dn = Number(tipo.valores['DN']);
        for (const l of f.ligacoes ?? []) {
          expect(numero(l.diametro ?? '0', env)).toBeCloseTo(deDn(dn), 9);
          expect(Math.hypot(...l.direcao.map((s) => numero(s, env)))).toBeCloseTo(1, 9);
        }
      });
    }
  }
});

describe('luminárias: volume do corpo principal contra a conta analítica (±1 %)', () => {
  for (const f of LUMINARIAS) {
    for (const tipo of f.tipos) {
      it(`${f.id} tipo ${tipo.id}: volume do corpo principal bate com o analítico`, () => {
        const env = ambiente(f, tipo.id);
        const v = volumeCorpo(corpoPrincipal(f), env);
        const esperado = ANALITICO[f.id]?.(env);
        if (esperado === undefined) throw new Error(`sem conta analítica para ${f.id}`);
        expect(Math.abs(v - esperado) / esperado).toBeLessThanOrEqual(0.01);
      });
    }
  }
});
