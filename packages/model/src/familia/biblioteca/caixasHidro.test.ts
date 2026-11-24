import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Corpo, Perfil, Ponto3 } from '../tiposCorpo.ts';
import { validarFamilia } from '../validar.ts';
import { CAIXAS_HIDRO } from './caixasHidro.ts';

/*
 * Ficha F3: caixas de inspeção, de gordura, sifonada e ralos. Este teste fica no modelo (sem o motor): confere a validação, o DN
 * e as pontas de cada tipo, as fórmulas, que as verificações de erro não disparam no padrão, e os volumes (corpo principal e
 * volume útil) contra a conta analítica (±1 %).
 */

type V = readonly [number, number, number];

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

function vetor(p: Ponto3, env: Env): V {
  const [x = NaN, y = NaN, z = NaN] = p.map((s) => numero(s, env));
  return [x, y, z];
}

const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const proximo = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol;
const relativo = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol * Math.abs(b);

const porId = (id: string): Familia => {
  const f = CAIXAS_HIDRO.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};

const ligacao = (f: Familia, id: string): Ligacao => {
  const l = f.ligacoes?.find((x) => x.id === id);
  if (!l) throw new Error(`ligação ausente: ${f.id}.${id}`);
  return l;
};

/** Área (mm²) do perfil de extrusão pela tabela do CONTRATO §2.2 (círculo e anel com N = 32 lados, área exata do polígono). */
function areaPerfil(p: Perfil, env: Env): number {
  const n = 32;
  const poligono = (r: number): number => (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
  switch (p.tipo) {
    case 'circulo':
      return poligono(numero(p.diametro, env) / 2);
    case 'anel':
      return poligono(numero(p.diametroExterno, env) / 2) - poligono(numero(p.diametroInterno, env) / 2);
    case 'retangulo':
      return numero(p.largura, env) * numero(p.altura, env);
    case 'retanguloOco': {
      const l = numero(p.largura, env);
      const a = numero(p.altura, env);
      const e = numero(p.espessura, env);
      return l * a - (l - 2 * e) * (a - 2 * e);
    }
    default:
      throw new Error(`perfil fora da ficha F3: ${p.tipo}`);
  }
}

/** Volume (m³) do corpo pela própria estrutura: extrusão (área do perfil × comprimento) ou revolução de retângulo (Pappus). */
function volumeDoCorpo(c: Corpo, env: Env): number {
  const forma = c.forma;
  if (forma.tipo === 'extrusao') return (areaPerfil(forma.perfil, env) * numero(forma.comprimento, env)) / 1e9;
  if (forma.tipo === 'revolucao' && forma.perfil.tipo === 'poligono') {
    const us = forma.perfil.pontos.map(([u]) => numero(u, env));
    const vs = forma.perfil.pontos.map(([, v]) => numero(v, env));
    const umin = Math.min(...us);
    const umax = Math.max(...us);
    const area = (umax - umin) * (Math.max(...vs) - Math.min(...vs));
    return (area * 2 * Math.PI * ((umin + umax) / 2) * (numero(forma.angulo, env) / 360)) / 1e9;
  }
  throw new Error(`forma do corpo principal fora da ficha F3: ${forma.tipo}`);
}

/** Volume analítico (m³) do corpo principal, pela geometria da caixa (π, sem o polígono): parede, anel ou cuba. */
function volumePrincipal(id: string, env: Env): number {
  const L = numero('L', env);
  const P = numero('P', env);
  const A = numero('A', env);
  const e = numero('e', env);
  const r = L / 2;
  const ri = L / 2 - e;
  // Ralo não tem fundo: a cuba vai do piso (z = 0) até A.
  if (id.startsWith('fam_ralo')) return (Math.PI * (r * r - ri * ri) * A) / 1e9;
  const ef = numero('ef', env);
  if (id === 'fam_caixa_inspecao_circular') return (Math.PI * (r * r - ri * ri) * (A - ef)) / 1e9;
  return ((L * P - (L - 2 * e) * (P - 2 * e)) * (A - ef)) / 1e9;
}

describe('caixas e ralos hidrossanitários (ficha F3): cadastro', () => {
  it('são 7 famílias com os ids da ficha (caixas, gorduras, sifonada e ralos), nesta ordem', () => {
    expect(CAIXAS_HIDRO.map((f) => f.id)).toEqual([
      'fam_caixa_inspecao_quadrada',
      'fam_caixa_inspecao_circular',
      'fam_caixa_gordura_simples',
      'fam_caixa_gordura_dupla',
      'fam_caixa_sifonada',
      'fam_ralo_seco',
      'fam_ralo_sifonado',
    ]);
  });

  for (const f of CAIXAS_HIDRO) {
    it(`${f.id}: valida sem erro, reservatório, hidrossanitário, IFC de tanque`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(f.categoria).toBe('reservatorio');
      expect(f.disciplina).toBe('hidrossanitario');
      expect(f.ifc?.classe).toBe('IFCTANK');
      expect((f.ligacoes ?? []).length).toBeGreaterThan(0);
    });

    it(`${f.id}: DN enum e tipos com os mesmos DN`, () => {
      const dn = f.parametros.find((p) => p.id === 'DN');
      const opcoes = dn?.opcoes?.map((o) => o.valor);
      expect(opcoes?.length ?? 0).toBeGreaterThan(0);
      expect(f.tipos.map((t) => t.valores['DN'])).toEqual(opcoes);
    });

    it(`${f.id}: verificações de erro não disparam nos tipos padrão`, () => {
      for (const tipo of f.tipos) {
        const env = ambiente(f, tipo.id);
        for (const v of (f.verificacoes ?? []).filter((x) => x.severidade === 'erro')) {
          const r = tentar(v.condicao, env);
          expect(r.ok, `${f.id}/${tipo.id}: ${v.id}`).toBe(true);
          expect(r.ok && r.valor, `${f.id}/${tipo.id}: ${v.id}`).toBe(false);
        }
      }
    });
  }
});

describe('caixas e ralos hidrossanitários (ficha F3): por tipo', () => {
  for (const f of CAIXAS_HIDRO) {
    for (const tipo of f.tipos) {
      it(`${f.id} tipo ${tipo.id}: fórmulas numéricas e ligações com o DN do tipo, apontando para fora`, () => {
        const env = ambiente(f, tipo.id);
        for (const p of f.parametros) {
          if (p.formula === undefined) continue;
          const r = tentar(p.formula, env);
          expect(r.ok && typeof r.valor === 'number' && Number.isFinite(r.valor), `${f.id}/${tipo.id}: ${p.id}`).toBe(true);
        }
        const dn = Number(tipo.valores['DN']);
        const centro: V = [0, 0, numero('A', env) / 2];
        for (const l of f.ligacoes ?? []) {
          expect(proximo(numero(l.diametro ?? '0', env), dn), `${f.id}/${l.id}`).toBe(true);
          const direcao = vetor(l.direcao, env);
          expect(dot(sub(vetor(l.posicao, env), centro), direcao), `${f.id}/${l.id} para fora`).toBeGreaterThan(0);
        }
      });

      it(`${f.id} tipo ${tipo.id}: volume do corpo principal bate com o analítico (±1 %)`, () => {
        const env = ambiente(f, tipo.id);
        const principal = f.corpos?.[0];
        if (!principal) throw new Error(`${f.id} sem corpo principal`);
        expect(principal.papel).toBe('corpo');
        const medido = volumeDoCorpo(principal, env);
        const analitico = volumePrincipal(f.id, env);
        expect(analitico).toBeGreaterThan(0);
        expect(relativo(medido, analitico), `${f.id}/${tipo.id}: ${medido} x ${analitico}`).toBe(true);
      });
    }
  }
});

describe('caixas e ralos hidrossanitários (ficha F3): volume útil e posição', () => {
  it('caixa de gordura simples: volume útil em litros = (L−2e)(P−2e)(A−ef−et) / 10^6', () => {
    const f = porId('fam_caixa_gordura_simples');
    for (const tipo of f.tipos) {
      const env = ambiente(f, tipo.id);
      const esperado = ((numero('L', env) - 2 * numero('e', env)) * (numero('P', env) - 2 * numero('e', env)) * (numero('A', env) - numero('ef', env) - numero('et', env))) / 1e6;
      expect(proximo(numero('volumeUtil', env), esperado, 1e-9)).toBe(true);
    }
  });

  it('caixa de gordura dupla: volume útil descontado o septo (largura L − 2e − es)', () => {
    const f = porId('fam_caixa_gordura_dupla');
    for (const tipo of f.tipos) {
      const env = ambiente(f, tipo.id);
      const esperado = ((numero('L', env) - 2 * numero('e', env) - numero('es', env)) * (numero('P', env) - 2 * numero('e', env)) * (numero('A', env) - numero('ef', env) - numero('et', env))) / 1e6;
      expect(proximo(numero('volumeUtil', env), esperado, 1e-9)).toBe(true);
    }
  });

  it('face da entrada: "direita" põe a entrada em +L/2 (saindo para +X) e a saída em −L/2', () => {
    const f = porId('fam_caixa_inspecao_quadrada');
    const env = ambiente(f, 'dn100', { faceEntrada: 'direita' });
    const L = numero('L', env);
    const entrada = vetor(ligacao(f, 'entrada').posicao, env);
    const saida = vetor(ligacao(f, 'saida').posicao, env);
    expect(proximo(entrada[0], L / 2)).toBe(true);
    expect(vetor(ligacao(f, 'entrada').direcao, env)).toEqual([1, 0, 0]);
    expect(proximo(saida[0], -L / 2)).toBe(true);
    expect(vetor(ligacao(f, 'saida').direcao, env)).toEqual([-1, 0, 0]);
  });

  it('ralo sifonado: a saída fica no fim do trecho horizontal (Lc = 3 De, cota −Hc = −2 De) e aponta para +X', () => {
    const f = porId('fam_ralo_sifonado');
    for (const tipo of f.tipos) {
      const env = ambiente(f, tipo.id);
      const de = numero('De', env);
      expect(proximo(de, Number(tipo.valores['DN']))).toBe(true);
      const saida = vetor(ligacao(f, 'saida').posicao, env);
      expect(proximo(saida[0], 3 * de)).toBe(true);
      expect(proximo(saida[2], -2 * de)).toBe(true);
      expect(vetor(ligacao(f, 'saida').direcao, env)).toEqual([1, 0, 0]);
    }
  });
});
