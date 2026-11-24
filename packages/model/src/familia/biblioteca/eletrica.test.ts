import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import type { Corpo } from '../tiposCorpo.ts';
import { validarFamilia } from '../validar.ts';
import { ELETRICA } from './eletrica.ts';
import { deDn } from './eletricaApoio.ts';

/*
 * Ficha F5: eletrodutos, eletrocalhas, caixas, tomada e interruptor. Este teste fica no modelo (sem o motor): confere a validação,
 * o id e a ordem de cada família, as ligações de cada tipo (diâmetro De do DN, direção unitária), o volume do corpo principal do
 * eletroduto e da caixa contra a conta analítica (±1 %), e as ligações e o símbolo de planta de tomada e interruptor.
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

const porId = (id: string): Familia => {
  const f = ELETRICA.find((x) => x.id === id);
  if (!f) throw new Error(`família ausente: ${id}`);
  return f;
};

const corpoPrincipal = (f: Familia): Corpo => {
  const c = f.corpos?.[0];
  if (!c) throw new Error(`sem corpo: ${f.id}`);
  return c;
};

/** Volume (m³) de uma extrusão de anel: π(De² − Di²)/4 × comprimento, em mm → m³. */
function volumeAnel(env: Env, comprimento: string): number {
  const de = numero('De', env);
  const di = numero('De - 2 * e', env);
  return (Math.PI * (de * de - di * di) * numero(comprimento, env)) / 4 / 1e9;
}

describe('elétrica: cadastro (ficha F5)', () => {
  it('são 12 famílias com os ids obrigatórios, na ordem da ficha', () => {
    expect(ELETRICA.map((f) => f.id)).toEqual([
      'fam_eletroduto_rigido',
      'fam_eletroduto_curva90',
      'fam_eletroduto_luva',
      'fam_eletrocalha_reta',
      'fam_eletrocalha_curva',
      'fam_eletrocalha_te',
      'fam_caixa_4x2',
      'fam_caixa_4x4',
      'fam_caixa_octogonal',
      'fam_caixa_passagem',
      'fam_tomada_2p_t',
      'fam_interruptor_simples',
    ]);
  });

  for (const f of ELETRICA) {
    it(`${f.id}: valida sem erro, disciplina elétrica, categoria e IFC preenchidos`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      expect(f.disciplina).toBe('eletrico');
      expect(['eletroduto', 'dispositivo_eletrico']).toContain(f.categoria);
      expect(f.ifc?.classe).toBeDefined();
      expect((f.ligacoes ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it(`${f.id}: tipo padrão existe e cada tipo traz L, A e P`, () => {
      expect(f.tipos.some((t) => t.id === f.tipoPadrao)).toBe(true);
      for (const t of f.tipos) {
        expect(t.valores['L']).toBeDefined();
        expect(t.valores['A']).toBeDefined();
        expect(t.valores['P']).toBeDefined();
      }
    });
  }
});

describe('elétrica: ligações por tipo', () => {
  for (const id of ['fam_eletroduto_rigido', 'fam_eletroduto_curva90', 'fam_eletroduto_luva', 'fam_caixa_4x2', 'fam_caixa_4x4', 'fam_caixa_octogonal', 'fam_caixa_passagem']) {
    const f = porId(id);
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

describe('elétrica: volumes contra a conta analítica (±1 %)', () => {
  for (const tipo of porId('fam_eletroduto_rigido').tipos) {
    it(`eletroduto rígido ${tipo.id}: anel De × (De − 2e) × L`, () => {
      const f = porId('fam_eletroduto_rigido');
      const env = ambiente(f, tipo.id);
      const corpo = corpoPrincipal(f);
      if (corpo.forma.tipo !== 'extrusao') throw new Error('eletroduto reto deve ser extrusão');
      const v = volumeAnel(env, corpo.forma.comprimento);
      const esperado = volumeAnel(env, 'L');
      expect(Math.abs(v - esperado) / esperado).toBeLessThanOrEqual(0.01);
    });
  }

  for (const id of ['fam_caixa_4x2', 'fam_caixa_4x4']) {
    it(`${id}: parede retangular (L × A − (L − 2e) × (A − 2e)) × (P − e)`, () => {
      const f = porId(id);
      const env = ambiente(f, f.tipoPadrao ?? f.tipos[0]!.id);
      const L = numero('L', env);
      const A = numero('A', env);
      const P = numero('P', env);
      const e = numero('e', env);
      const esperado = ((L * A - (L - 2 * e) * (A - 2 * e)) * (P - e)) / 1e9;
      const parede = f.corpos?.find((c) => c.id === 'parede');
      if (parede?.forma.tipo !== 'extrusao') throw new Error('parede deve ser extrusão');
      const perfil = parede.forma.perfil;
      if (perfil.tipo !== 'retanguloOco') throw new Error('parede deve ser retanguloOco');
      const area = numero(perfil.largura, env) * numero(perfil.altura, env) - (numero(perfil.largura, env) - 2 * e) * (numero(perfil.altura, env) - 2 * e);
      const v = (area * numero(parede.forma.comprimento, env)) / 1e9;
      expect(Math.abs(v - esperado) / esperado).toBeLessThanOrEqual(0.01);
    });
  }
});

describe('elétrica: tomada e interruptor (força, eletroduto e planta)', () => {
  for (const id of ['fam_tomada_2p_t', 'fam_interruptor_simples']) {
    const f = porId(id);

    it(`${id}: duas ligações, uma de força e uma de eletroduto, com potência e tensão`, () => {
      const dominios = (f.ligacoes ?? []).map((l) => l.dominio).sort();
      expect(dominios).toEqual(['eletrica_forca', 'eletroduto']);
      const forca = f.ligacoes?.find((l) => l.dominio === 'eletrica_forca');
      expect(Object.keys(forca?.propriedades ?? {}).sort()).toEqual(['potencia', 'tensao']);
    });

    it(`${id}: símbolo de planta substitui a geometria e a altura de instalação está em hInst`, () => {
      const simbolo = f.simbolos?.[0];
      expect(simbolo?.vistas).toEqual(['planta']);
      expect(simbolo?.substituiGeometria).toBe(true);
      expect(f.parametros.some((p) => p.id === 'hInst' && p.escopo === 'instancia')).toBe(true);
    });
  }

  it('tomada usa IFCOUTLET e interruptor usa IFCSWITCHINGDEVICE', () => {
    expect(porId('fam_tomada_2p_t').ifc?.classe).toBe('IFCOUTLET');
    expect(porId('fam_interruptor_simples').ifc?.classe).toBe('IFCSWITCHINGDEVICE');
  });
});
