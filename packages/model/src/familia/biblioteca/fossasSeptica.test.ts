import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import type { Corpo, Perfil, Ponto3 } from '../tiposCorpo.ts';
import { validarFamilia } from '../validar.ts';
import { BIBLIOTECA_BASE, BIBLIOTECA_MEP } from './index.ts';
import { FOSSAS_SEPTICAS } from './fossasSeptica.ts';

/*
 * Ficha F4: fossas, filtro anaeróbio, sumidouro e vala. Confere o cadastro, a validação, as ligações, o volume do corpo principal
 * contra a conta analítica (±1 %), o volume útil e a área, a verificação com contribuintes demais e as cotas do corte.
 */

type V = readonly [number, number, number];

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

const vetor = (p: Ponto3, env: Env): V => {
  const [x = NaN, y = NaN, z = NaN] = p.map((s) => numero(s, env));
  return [x, y, z];
};
const proximo = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol;
const relativo = (a: number, b: number, tol = 0.01): boolean => Math.abs(a - b) <= tol * Math.abs(b);
const verdadeira = (cond: string, env: Env): boolean => {
  const r = tentar(cond, env);
  return r.ok && r.valor === true;
};

const porId = (id: string): Familia => {
  const f = FOSSAS_SEPTICAS.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};

/** Área (mm²) do perfil: círculo e anel com 32 lados (CONTRATO §2.2). */
function areaPerfil(p: Perfil, env: Env): number {
  const poligono = (r: number): number => 16 * r * r * Math.sin((2 * Math.PI) / 32);
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
      throw new Error(`perfil fora da ficha F4: ${p.tipo}`);
  }
}

/** Volume (m³) do corpo por extrusão, com a repetição (`repetir`) quando houver. */
function volumeDoCorpo(c: Corpo, env: Env): number {
  if (c.forma.tipo !== 'extrusao') throw new Error('corpo principal fora da ficha F4');
  const vez = c.repetir === undefined ? 1 : numero(c.repetir, env);
  return (vez * areaPerfil(c.forma.perfil, env) * numero(c.forma.comprimento, env)) / 1e9;
}

/** Volume analítico (m³) do corpo principal (parede), com π exato. */
function volumePrincipal(id: string, env: Env): number {
  const L = numero('L', env);
  const P = numero('P', env);
  if (id === 'fam_vala_infiltracao') return (L * P * numero('hBrita', env)) / 1e9;
  const e = numero('e', env);
  const A = numero('A', env);
  const ri = L / 2 - e;
  const anel = Math.PI * ((L / 2) ** 2 - ri ** 2);
  switch (id) {
    case 'fam_fossa_septica_retangular':
      return ((L * P - (L - 2 * e) * (P - 2 * e)) * (A - numero('ef', env))) / 1e9;
    case 'fam_sumidouro':
      return (anel * numero('nAneis', env) * numero('ha', env)) / 1e9;
    default:
      return (anel * (A - numero('ef', env))) / 1e9;
  }
}

describe('fossas, filtro, sumidouro e vala (ficha F4): cadastro', () => {
  it('são 5 famílias com os ids da ficha, só na biblioteca MEP', () => {
    expect(FOSSAS_SEPTICAS.map((f) => f.id)).toEqual(['fam_fossa_septica_cilindrica', 'fam_fossa_septica_retangular', 'fam_filtro_anaerobio', 'fam_sumidouro', 'fam_vala_infiltracao']);
    for (const f of FOSSAS_SEPTICAS) {
      expect(BIBLIOTECA_MEP.some((x) => x.id === f.id)).toBe(true);
      expect(BIBLIOTECA_BASE.some((x) => x.id === f.id)).toBe(false);
    }
  });

  for (const f of FOSSAS_SEPTICAS) {
    it(`${f.id}: valida sem erro, reservatório, hidrossanitário, com corte e verificação de volume ou área`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(f.categoria).toBe('reservatorio');
      expect(f.disciplina).toBe('hidrossanitario');
      expect(f.ifc?.classe).toBe('IFCTANK');
      expect(f.detalhes?.[0]?.vista).toBe('corte');
      expect((f.verificacoes ?? []).some((v) => v.id === 'volumeInsuficiente' || v.id === 'areaInsuficiente')).toBe(true);
    });

    for (const tipo of f.tipos) {
      it(`${f.id} tipo ${tipo.id}: fórmulas numéricas, DN do tipo, ligações para fora, sem erro nem aviso no padrão`, () => {
        const env = ambiente(f, tipo.id);
        for (const p of f.parametros) {
          if (p.formula === undefined) continue;
          const r = tentar(p.formula, env);
          expect(r.ok && typeof r.valor === 'number' && Number.isFinite(r.valor), `${f.id}/${tipo.id}: ${p.id}`).toBe(true);
        }
        const dn = Number(tipo.valores['DN']);
        expect(f.parametros.find((p) => p.id === 'DN')?.opcoes?.map((o) => o.valor)).toContain(dn);
        const centro: V = [0, 0, numero('A', env) / 2];
        for (const l of f.ligacoes ?? []) {
          expect(proximo(numero(l.diametro ?? '0', env), dn), `${f.id}/${l.id}`).toBe(true);
          const pos = vetor(l.posicao, env);
          const dir = vetor(l.direcao, env);
          expect((pos[0] - centro[0]) * dir[0] + (pos[1] - centro[1]) * dir[1] + (pos[2] - centro[2]) * dir[2], `${f.id}/${l.id} para fora`).toBeGreaterThan(0);
        }
        for (const v of f.verificacoes ?? []) expect(verdadeira(v.condicao, env), `${f.id}/${tipo.id}: ${v.id}`).toBe(false);
      });

      it(`${f.id} tipo ${tipo.id}: volume do corpo principal bate com o analítico (±1 %)`, () => {
        const env = ambiente(f, tipo.id);
        const principal = f.corpos?.[0];
        if (!principal) throw new Error(`${f.id} sem corpo principal`);
        const medido = volumeDoCorpo(principal, env);
        const analitico = volumePrincipal(f.id, env);
        expect(relativo(medido, analitico), `${f.id}/${tipo.id}: ${medido} x ${analitico}`).toBe(true);
      });
    }
  }
});

describe('fossas, filtro, sumidouro e vala (ficha F4): dimensionamento', () => {
  it('volume exigido = 1000 + N·(C·T + K·Lf) com os valores dos parâmetros (nada escondido)', () => {
    for (const id of ['fam_fossa_septica_cilindrica', 'fam_fossa_septica_retangular']) {
      const f = porId(id);
      const env = ambiente(f, 'n10', { nContrib: 7, contribDia: 150, tempoDetencao: 0.5, taxaLodo: 100, lodoFresco: 0.5 });
      expect(proximo(numero('volumeExigido', env), 1000 + 7 * (150 * 0.5 + 100 * 0.5), 1e-9)).toBe(true);
    }
  });

  it('todo valor de norma é parâmetro editável com o comentário de conferência na descrição ou no grupo', () => {
    const f = porId('fam_fossa_septica_cilindrica');
    for (const id of ['nContrib', 'contribDia', 'tempoDetencao', 'taxaLodo', 'lodoFresco']) {
      const p = f.parametros.find((x) => x.id === id);
      expect(p, id).toBeDefined();
      expect(p?.formula).toBeUndefined();
      expect(p?.grupo).toContain('CONFERIR');
    }
    expect(f.descricao).toContain('CONFERIR: NBR 7229');
  });

  it('volume útil geométrico: cilindro π/4·Di²·h e prisma (L−2e)(P−2e)·h, em litros', () => {
    const c = ambiente(porId('fam_fossa_septica_cilindrica'), 'n10');
    const di = numero('L', c) - 2 * numero('e', c);
    expect(relativo(numero('volumeUtil', c), (Math.PI / 4) * di * di * numero('hUtil', c) * 1e-6, 1e-9)).toBe(true);
    const r = ambiente(porId('fam_fossa_septica_retangular'), 'n10');
    const esperado = ((numero('L', r) - 2 * numero('e', r)) * (numero('P', r) - 2 * numero('e', r)) * numero('hUtil', r)) / 1e6;
    expect(proximo(numero('volumeUtil', r), esperado, 1e-9)).toBe(true);
  });

  it('filtro: volume útil do leito = π/4·Di²·hLeito e cobre o exigido (1,6·N·C·T)', () => {
    const f = porId('fam_filtro_anaerobio');
    const env = ambiente(f, 'n20');
    const di = numero('L', env) - 2 * numero('e', env);
    expect(relativo(numero('volumeUtil', env), (Math.PI / 4) * di * di * numero('hLeito', env) * 1e-6, 1e-9)).toBe(true);
    expect(proximo(numero('volumeExigido', env), 1.6 * 20 * 130 * 0.5, 1e-9)).toBe(true);
  });

  it('sumidouro: área = π·Di·altura dos anéis; vala: área = (P + 2·brita)·L', () => {
    const s = ambiente(porId('fam_sumidouro'), 'n10');
    const di = numero('L', s) - 2 * numero('e', s);
    expect(relativo(numero('areaInfiltracao', s), (Math.PI * di * numero('nAneis', s) * numero('ha', s)) / 1e6, 1e-9)).toBe(true);
    const v = ambiente(porId('fam_vala_infiltracao'), 'n10');
    expect(relativo(numero('areaInfiltracao', v), ((numero('P', v) + 2 * numero('hBrita', v)) * numero('L', v)) / 1e6, 1e-9)).toBe(true);
  });
});

describe('fossas, filtro, sumidouro e vala (ficha F4): verificações e corte', () => {
  it('contribuintes demais dispara a verificação de volume (fossas e filtro)', () => {
    for (const id of ['fam_fossa_septica_cilindrica', 'fam_fossa_septica_retangular', 'fam_filtro_anaerobio']) {
      const f = porId(id);
      const v = f.verificacoes?.find((x) => x.id === 'volumeInsuficiente');
      expect(v, id).toBeDefined();
      expect(verdadeira(v?.condicao ?? 'falso', ambiente(f, 'n5')), `${id} n5`).toBe(false);
      expect(verdadeira(v?.condicao ?? 'falso', ambiente(f, 'n5', { nContrib: 200 })), `${id} 200`).toBe(true);
    }
  });

  it('contribuintes demais dispara a verificação de área (sumidouro e vala)', () => {
    for (const id of ['fam_sumidouro', 'fam_vala_infiltracao']) {
      const f = porId(id);
      const v = f.verificacoes?.find((x) => x.id === 'areaInsuficiente');
      expect(verdadeira(v?.condicao ?? 'falso', ambiente(f, 'n5', { nContrib: 200 })), id).toBe(true);
    }
  });

  it('o corte da fossa traz as cotas de profundidade, de entrada e de saída, dirigidas pelos parâmetros', () => {
    for (const id of ['fam_fossa_septica_cilindrica', 'fam_fossa_septica_retangular', 'fam_filtro_anaerobio']) {
      const f = porId(id);
      const corte = f.detalhes?.find((d) => d.vista === 'corte');
      const dirigidas = (corte?.cotas ?? []).map((c) => c.parametro).filter(Boolean);
      expect(dirigidas, id).toEqual(['A', 'cotaEntrada', 'cotaSaida']);
      const env = ambiente(f, 'n10');
      const prof = corte?.cotas?.find((c) => c.id === 'profundidade');
      if (prof?.ate.tipo !== 'ponto') throw new Error('cota de profundidade sem ponto');
      expect(proximo(vetor(prof.ate.ponto, env)[2], numero('A', env))).toBe(true);
    }
  });

  it('o sumidouro tem corte com profundidade e sem cota de saída; a vala tem corte com profundidade', () => {
    expect(porId('fam_sumidouro').detalhes?.[0]?.cotas?.map((c) => c.id)).toEqual(['profundidade', 'fundoEntrada', 'alturaUtil']);
    expect(porId('fam_vala_infiltracao').detalhes?.[0]?.cotas?.some((c) => c.parametro === 'A')).toBe(true);
  });
});
