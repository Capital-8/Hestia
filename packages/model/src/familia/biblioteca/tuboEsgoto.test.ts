import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Ponto3 } from '../tiposCorpo.ts';
import { validarFamilia } from '../validar.ts';
import { FAMILIA_TUBO_ESGOTO, TUBULACAO_ESGOTO } from './tuboEsgoto.ts';
import { FAMILIA_TUBO_ESGOTO_PADRAO } from './tuboEsgotoApoio.ts';

/*
 * Ficha F1: tubulação e conexões de esgoto. Este teste fica no modelo (sem o motor): confere a validação, as ligações de cada
 * tipo (DN do tipo, pontas para fora) e a geometria analítica das curvas (arco de raio Rc, tangentes certas nas pontas).
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

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norma = (a: V): number => Math.sqrt(dot(a, a));
const proximo = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol;

const porId = (id: string): Familia => {
  const f = TUBULACAO_ESGOTO.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};

const ligacao = (f: Familia, id: string): Ligacao => {
  const l = f.ligacoes?.find((x) => x.id === id);
  if (!l) throw new Error(`ligação ausente: ${f.id}.${id}`);
  return l;
};

describe('tubulação de esgoto: cadastro (ficha F1)', () => {
  it('são 8 famílias com os ids obrigatórios (ficha F1, referenciados pela C6)', () => {
    expect(TUBULACAO_ESGOTO.map((f) => f.id)).toEqual([
      'fam_tubo_esgoto',
      'fam_esgoto_curva90',
      'fam_esgoto_curva45',
      'fam_esgoto_te',
      'fam_esgoto_juncao45',
      'fam_esgoto_luva',
      'fam_esgoto_reducao',
      'fam_esgoto_tampao',
    ]);
  });

  it('tubo reto é a família padrão do domínio esgoto e o tipo padrão existe', () => {
    expect(FAMILIA_TUBO_ESGOTO_PADRAO).toBe('fam_tubo_esgoto');
    expect(FAMILIA_TUBO_ESGOTO.tipos.some((t) => t.id === FAMILIA_TUBO_ESGOTO.tipoPadrao)).toBe(true);
  });

  for (const f of TUBULACAO_ESGOTO) {
    it(`${f.id}: valida sem erro, hidrossanitário, categoria e IFC preenchidos`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(f.disciplina).toBe('hidrossanitario');
      expect(['tubulacao', 'conexao_tubo']).toContain(f.categoria);
      expect(f.ifc?.classe).toBeDefined();
      expect((f.ligacoes ?? []).length).toBeGreaterThan(0);
    });

    it(`${f.id}: DN enum com as bitolas de 40 a 150`, () => {
      const dn = f.parametros.find((p) => p.id === 'DN');
      expect(dn?.opcoes?.map((o) => o.valor)).toEqual([40, 50, 75, 100, 150]);
    });
  }
});

describe('tubulação de esgoto: ligações por tipo', () => {
  for (const f of TUBULACAO_ESGOTO) {
    for (const tipo of f.tipos) {
      it(`${f.id} tipo ${tipo.id}: diâmetros do DN do tipo e pontas apontando para fora`, () => {
        const env = ambiente(f, tipo.id);
        const dn = Number(tipo.valores['DN']);
        const dn2 = Number(tipo.valores['DN2']);
        const ligacoes = f.ligacoes ?? [];
        const posicoes = ligacoes.map((l) => vetor(l.posicao, env));
        const media = (i: 0 | 1 | 2): number => posicoes.reduce((s, p) => s + p[i], 0) / posicoes.length;
        const centro: V = [media(0), media(1), media(2)];
        ligacoes.forEach((l, i) => {
          const esperado = f.id === 'fam_esgoto_reducao' && l.id === 'b' ? dn2 : dn;
          expect(proximo(numero(l.diametro ?? '0', env), esperado)).toBe(true);
          const direcao = vetor(l.direcao, env);
          expect(norma(direcao)).toBeGreaterThan(0);
          // Com uma ponta só (tampão) o centro dos pontos é o próprio ponto: confere-se a direção −Z, da origem.
          if (ligacoes.length === 1) expect(direcao).toEqual([0, 0, -1]);
          else expect(dot(sub(posicoes[i] ?? centro, centro), direcao)).toBeGreaterThan(0);
        });
      });
    }
  }

  it('tubo reto: ponta A na origem saindo para −Z, ponta B em z = L saindo para +Z', () => {
    const env = ambiente(FAMILIA_TUBO_ESGOTO, 'dn100');
    expect(vetor(ligacao(FAMILIA_TUBO_ESGOTO, 'a').posicao, env)).toEqual([0, 0, 0]);
    expect(vetor(ligacao(FAMILIA_TUBO_ESGOTO, 'a').direcao, env)).toEqual([0, 0, -1]);
    expect(vetor(ligacao(FAMILIA_TUBO_ESGOTO, 'b').posicao, env)[2]).toBe(numero('L', env));
    expect(vetor(ligacao(FAMILIA_TUBO_ESGOTO, 'b').direcao, env)).toEqual([0, 0, 1]);
  });
});

describe('tubulação de esgoto: geometria das curvas', () => {
  for (const raio of ['curta', 'longa']) {
    it(`curva 90° (${raio}): arco de raio Rc, caminho começa em A e termina em B, tangente final +X`, () => {
      const f = porId('fam_esgoto_curva90');
      const env = ambiente(f, 'dn100', { raio });
      const rc = numero('Rc', env);
      expect(proximo(rc, raio === 'longa' ? 2 * numero('De', env) : numero('De', env))).toBe(true);
      const A = vetor(ligacao(f, 'a').posicao, env);
      const B = vetor(ligacao(f, 'b').posicao, env);
      const dirB = vetor(ligacao(f, 'b').direcao, env);
      const C: V = [rc, 0, 0];
      expect(proximo(norma(sub(A, C)), rc)).toBe(true);
      expect(proximo(norma(sub(B, C)), rc)).toBe(true);
      expect(dirB).toEqual([1, 0, 0]);
      expect(proximo(dot(sub(B, C), dirB), 0)).toBe(true);
      const forma = f.corpos?.[0]?.forma;
      if (forma?.tipo !== 'varredura') throw new Error('curva 90° deve ser varredura');
      const pontos = forma.caminho.pontos.map((p) => vetor(p, env));
      expect(pontos[0]).toEqual(A);
      expect(pontos[pontos.length - 1]).toEqual(B);
    });

    it(`curva 45° (${raio}): tangente de corte Tg = Rc·tan(22,5°), arco tangente às duas retas, pontas com trecho reto Lf`, () => {
      const f = porId('fam_esgoto_curva45');
      const env = ambiente(f, 'dn100', { raio });
      const rc = numero('Rc', env);
      const tg = numero('Tg', env);
      const lf = numero('Lf', env);
      expect(proximo(tg, rc * Math.tan((22.5 * Math.PI) / 180), 1e-6)).toBe(true);
      const A = vetor(ligacao(f, 'a').posicao, env);
      const B = vetor(ligacao(f, 'b').posicao, env);
      const dirB = vetor(ligacao(f, 'b').direcao, env);
      expect(proximo(norma(dirB), 1, 1e-9)).toBe(true);
      // Arco: começa em S = A + Lf·Z (tangente a A→P) e acaba em E = P + Tg·d2, com centro C = S + Rc·X.
      const S: V = [0, 0, lf];
      const C: V = [rc, 0, lf];
      const P: V = [0, 0, lf + tg];
      const arcoFim: V = [tg * Math.sin(Math.PI / 4), 0, P[2] + tg * Math.cos(Math.PI / 4)];
      expect(proximo(norma(sub(S, C)), rc)).toBe(true);
      expect(proximo(norma(sub(arcoFim, C)), rc)).toBe(true);
      expect(proximo(dot(sub(arcoFim, C), dirB), 0)).toBe(true);
      expect(proximo(norma(sub(B, arcoFim)), lf, 1e-6)).toBe(true);
      const forma = f.corpos?.[0]?.forma;
      if (forma?.tipo !== 'varredura') throw new Error('curva 45° deve ser varredura');
      const pontos = forma.caminho.pontos.map((p) => vetor(p, env));
      expect(pontos[0]).toEqual(A);
      expect(pontos[pontos.length - 1]).toEqual(B);
    });
  }
});
