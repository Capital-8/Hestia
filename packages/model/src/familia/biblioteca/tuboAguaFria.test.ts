import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Ponto3 } from '../tiposCorpo.ts';
import { validarFamilia } from '../validar.ts';
import { FAMILIA_TUBO_AGUA_FRIA, TUBULACAO_AGUA_FRIA } from './tuboAguaFria.ts';
import { FAMILIA_TUBO_AGUA_FRIA_PADRAO } from './tuboAguaFriaApoio.ts';

/*
 * Ficha F2: tubulação e conexões de água fria (PVC soldável). Este teste fica no modelo (sem o motor): confere a validação, as
 * ligações de cada tipo (DN do tipo, pontas para fora), a geometria analítica dos joelhos e o volume do tubo reto contra o
 * analítico (±1 %). O volume é o da área do perfil × comprimento, não o da malha (a malha fica no engine).
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
  const f = TUBULACAO_AGUA_FRIA.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};

const ligacao = (f: Familia, id: string): Ligacao => {
  const l = f.ligacoes?.find((x) => x.id === id);
  if (!l) throw new Error(`ligação ausente: ${f.id}.${id}`);
  return l;
};

describe('tubulação de água fria: cadastro (ficha F2)', () => {
  it('são 9 famílias com os ids da ficha (uma por peça da lista; a ficha diz "dez", a lista tem nove)', () => {
    expect(TUBULACAO_AGUA_FRIA.map((f) => f.id)).toEqual([
      'fam_tubo_agua_fria',
      'fam_agua_fria_joelho90',
      'fam_agua_fria_joelho45',
      'fam_agua_fria_te',
      'fam_agua_fria_luva',
      'fam_agua_fria_reducao',
      'fam_agua_fria_uniao',
      'fam_agua_fria_registro_gaveta',
      'fam_agua_fria_registro_pressao',
    ]);
  });

  it('tubo reto é a família padrão de água fria e o tipo padrão existe', () => {
    expect(FAMILIA_TUBO_AGUA_FRIA_PADRAO).toBe('fam_tubo_agua_fria');
    expect(FAMILIA_TUBO_AGUA_FRIA.tipos.some((t) => t.id === FAMILIA_TUBO_AGUA_FRIA.tipoPadrao)).toBe(true);
  });

  for (const f of TUBULACAO_AGUA_FRIA) {
    it(`${f.id}: valida sem erro, hidrossanitário, categoria, IFC e ligações de água fria`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(f.disciplina).toBe('hidrossanitario');
      expect(['tubulacao', 'conexao_tubo']).toContain(f.categoria);
      expect(f.ifc?.classe).toBeDefined();
      expect((f.ligacoes ?? []).length).toBeGreaterThan(0);
      for (const l of f.ligacoes ?? []) expect(l.dominio).toBe('agua_fria');
    });

    it(`${f.id}: DN enum com as nove bitolas de 20 a 110 e L, A, P de escopo instância e tipo comprimento`, () => {
      const dn = f.parametros.find((p) => p.id === 'DN');
      expect(dn?.opcoes?.map((o) => o.valor)).toEqual([20, 25, 32, 40, 50, 60, 75, 85, 110]);
      for (const id of ['L', 'A', 'P']) {
        const p = f.parametros.find((x) => x.id === id);
        expect(p?.tipo, `${f.id}.${id}`).toBe('comprimento');
        expect(p?.escopo, `${f.id}.${id}`).toBe('instancia');
        expect(p?.formula, `${f.id}.${id} não pode ser fórmula`).toBeUndefined();
      }
    });
  }
});

describe('tubulação de água fria: fórmulas e ligações por tipo', () => {
  for (const f of TUBULACAO_AGUA_FRIA) {
    for (const tipo of f.tipos) {
      it(`${f.id} tipo ${tipo.id}: fórmulas avaliam sem erro, diâmetros do DN do tipo e pontas apontando para fora`, () => {
        const env = ambiente(f, tipo.id);
        for (const p of f.parametros) {
          if (p.formula === undefined) continue;
          const r = tentar(p.formula, env);
          expect(r.ok, `${f.id}/${tipo.id}: ${p.id} = ${p.formula}`).toBe(true);
        }
        const dn = Number(tipo.valores['DN']);
        const dn2 = Number(tipo.valores['DN2']);
        const ligacoes = f.ligacoes ?? [];
        const posicoes = ligacoes.map((l) => vetor(l.posicao, env));
        const media = (i: 0 | 1 | 2): number => posicoes.reduce((s, p) => s + p[i], 0) / posicoes.length;
        const centro: V = [media(0), media(1), media(2)];
        ligacoes.forEach((l, i) => {
          const esperado = f.id === 'fam_agua_fria_reducao' && l.id === 'b' ? dn2 : dn;
          expect(proximo(numero(l.diametro ?? '0', env), esperado)).toBe(true);
          const direcao = vetor(l.direcao, env);
          expect(norma(direcao)).toBeGreaterThan(0);
          if (ligacoes.length === 1) expect(direcao).toEqual([0, 0, -1]);
          else expect(dot(sub(posicoes[i] ?? centro, centro), direcao)).toBeGreaterThan(0);
        });
      });
    }
  }

  it('tubo reto: ponta A na origem saindo para −Z, ponta B em z = L saindo para +Z', () => {
    const env = ambiente(FAMILIA_TUBO_AGUA_FRIA, 'dn25');
    expect(vetor(ligacao(FAMILIA_TUBO_AGUA_FRIA, 'a').posicao, env)).toEqual([0, 0, 0]);
    expect(vetor(ligacao(FAMILIA_TUBO_AGUA_FRIA, 'a').direcao, env)).toEqual([0, 0, -1]);
    expect(vetor(ligacao(FAMILIA_TUBO_AGUA_FRIA, 'b').posicao, env)[2]).toBe(numero('L', env));
    expect(vetor(ligacao(FAMILIA_TUBO_AGUA_FRIA, 'b').direcao, env)).toEqual([0, 0, 1]);
  });

  it('volume do tubo reto em todas as bitolas bate com o analítico π/4 (De² − Di²) L, ±1 %', () => {
    for (const tipo of FAMILIA_TUBO_AGUA_FRIA.tipos) {
      const env = ambiente(FAMILIA_TUBO_AGUA_FRIA, tipo.id);
      const de = numero('De', env);
      const di = numero('De - 2 * e', env);
      const l = numero('L', env);
      // Perfil do anel como polígono de 32 lados (o que o resolvedor usa por padrão); a área é (N/2) sen(2π/N) r² por círculo.
      const n = 32;
      const fator = (n / 2) * Math.sin((2 * Math.PI) / n);
      const areaPoligono = fator * ((de / 2) ** 2 - (di / 2) ** 2);
      const volumePoligono = areaPoligono * l;
      const volumeAnalitico = (Math.PI / 4) * (de * de - di * di) * l;
      expect(Math.abs(volumePoligono - volumeAnalitico) / volumeAnalitico).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('tubulação de água fria: geometria dos joelhos', () => {
  it('joelho 90°: arco de raio Rc = De com centro em (Rc, 0, Lf), trecho reto Lf em cada ponta', () => {
    const f = porId('fam_agua_fria_joelho90');
    const env = ambiente(f, 'dn25');
    const rc = numero('De', env);
    const lf = numero('Lf', env);
    const A = vetor(ligacao(f, 'a').posicao, env);
    const B = vetor(ligacao(f, 'b').posicao, env);
    const dirB = vetor(ligacao(f, 'b').direcao, env);
    expect(dirB).toEqual([1, 0, 0]);
    const C: V = [rc, 0, lf];
    const arcoA: V = [0, 0, lf];
    const arcoB: V = [rc, 0, lf + rc];
    expect(proximo(norma(sub(arcoA, C)), rc)).toBe(true);
    expect(proximo(norma(sub(arcoB, C)), rc)).toBe(true);
    expect(proximo(norma(sub(A, arcoA)), lf)).toBe(true);
    expect(proximo(norma(sub(B, arcoB)), lf)).toBe(true);
    const forma = f.corpos?.[0]?.forma;
    if (forma?.tipo !== 'varredura') throw new Error('joelho 90° deve ser varredura');
    const pontos = forma.caminho.pontos.map((p) => vetor(p, env));
    expect(pontos[0]).toEqual(A);
    expect(pontos[pontos.length - 1]).toEqual(B);
  });

  it('joelho 45°: tangente de corte Tg = Rc·tan(22,5°), arco tangente às duas retas, trecho reto Lf em cada ponta', () => {
    const f = porId('fam_agua_fria_joelho45');
    const env = ambiente(f, 'dn25');
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
    expect(proximo(norma(sub(A, S)), lf)).toBe(true);
    const forma = f.corpos?.[0]?.forma;
    if (forma?.tipo !== 'varredura') throw new Error('joelho 45° deve ser varredura');
    const pontos = forma.caminho.pontos.map((p) => vetor(p, env));
    expect(pontos[0]).toEqual(A);
    expect(pontos[pontos.length - 1]).toEqual(B);
  });
});
