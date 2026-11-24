import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { FAMILIA_PERFIL_I, PERFIS_METALICOS } from './perfisMetalicos.ts';
import { FAMILIA_CHAPA_BASE, FAMILIA_PARAFUSO_SEXTAVADO } from './perfisMetalicosChapa.ts';

/*
 * Ficha F7: perfis, tubos, chapa de base e parafuso. Este teste fica no modelo (sem o motor): confere a validação, as ligações
 * de cada tipo e a geometria analítica do perfil I (área exata, volume e massa do tipo de exemplo h200 b100 tw6 tf10).
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

/** Densidade do aço (kg/m³), só para a conferência de massa. */
const DENSIDADE_ACO = 7850;

describe('estrutura metálica: cadastro (ficha F7)', () => {
  it('são 9 famílias com os ids obrigatórios', () => {
    expect(PERFIS_METALICOS.map((f) => f.id)).toEqual([
      'fam_perfil_i',
      'fam_perfil_u',
      'fam_perfil_l',
      'fam_perfil_t',
      'fam_perfil_tubular_quadrado',
      'fam_perfil_tubular_retangular',
      'fam_perfil_tubular_redondo',
      'fam_chapa_base',
      'fam_parafuso_sextavado',
    ]);
  });

  it('categoria, disciplina e classe IFC corretas', () => {
    for (const f of PERFIS_METALICOS) {
      expect(f.disciplina).toBe('estrutura');
      expect(['perfil_estrutural', 'chapa_estrutural']).toContain(f.categoria);
    }
    expect(FAMILIA_CHAPA_BASE.categoria).toBe('chapa_estrutural');
    expect(FAMILIA_CHAPA_BASE.ifc).toBeUndefined();
    expect(FAMILIA_PARAFUSO_SEXTAVADO.ifc?.classe).toBe('IFCBUILDINGELEMENTPROXY');
  });

  for (const f of PERFIS_METALICOS) {
    it(`${f.id}: valida sem erro e tem L, A e P de escopo instância`, () => {
      expect(validarFamilia(f).filter((p) => p.nivel === 'erro')).toEqual([]);
      for (const id of ['L', 'A', 'P']) {
        expect(f.parametros.find((p) => p.id === id)?.escopo).toBe('instancia');
      }
    });
  }
});

describe('estrutura metálica: ligações e tipos', () => {
  for (const f of PERFIS_METALICOS) {
    for (const t of f.tipos) {
      it(`${f.id} (${t.id}): ligações em cada ponta, medidas positivas`, () => {
        const env = ambiente(f, t.id);
        const ligacoes = f.ligacoes ?? [];
        expect(ligacoes.length).toBeGreaterThanOrEqual(2);
        for (const l of ligacoes) {
          if (l.secao === 'redonda') expect(numero(l.diametro ?? '0', env)).toBeGreaterThan(0);
          else {
            expect(numero(l.largura ?? '0', env)).toBeGreaterThan(0);
            expect(numero(l.altura ?? '0', env)).toBeGreaterThan(0);
          }
        }
      });
    }
  }

  it('perfis em barra: pontas em z = 0 e z = L, para fora (−Z e +Z)', () => {
    for (const f of PERFIS_METALICOS.filter((x) => x.corpos?.some((c) => c.papel === 'perfil'))) {
      const env = ambiente(f, f.tipoPadrao ?? '', { L: 2000 });
      const [a, b] = f.ligacoes ?? [];
      expect(a && numero(a.posicao[2], env)).toBe(0);
      expect(b && numero(b.posicao[2], env)).toBe(2000);
      expect(a?.direcao[2]).toBe('-1');
      expect(b?.direcao[2]).toBe('1');
    }
  });

  it('chapa de base: quatro furos passantes e quatro ligações redondas no topo', () => {
    const peca = FAMILIA_CHAPA_BASE.pecas[0];
    expect(peca?.usinagens?.length).toBe(4);
    expect(peca?.usinagens?.every((u) => u.tipo === 'furo' && u.profundidade === 'passante')).toBe(true);
    expect(FAMILIA_CHAPA_BASE.ligacoes?.length).toBe(4);
    expect(FAMILIA_CHAPA_BASE.ligacoes?.every((l) => l.secao === 'redonda' && l.posicao[2] === 'P')).toBe(true);
  });
});

describe('perfil I de exemplo (h200 b100 tw6 tf10, 2 m)', () => {
  const env = ambiente(FAMILIA_PERFIL_I, 'i200', { L: 2000 });
  const h = numero('A', env);
  const b = numero('P', env);
  const tw = numero('tw', env);
  const tf = numero('tf', env);
  const area = 2 * b * tf + (h - 2 * tf) * tw; // mm², fórmula analítica do CONTRATO §2.2
  const volume = (area * 2000) * 1e-9; // m³

  it('área exata de 3080 mm²', () => {
    expect(area).toBe(3080);
  });

  it('volume de 6,16e-3 m³ para 2 m', () => {
    expect(volume).toBeCloseTo(6.16e-3, 9);
  });

  it('massa de 48,36 kg para 2 m', () => {
    expect((volume * DENSIDADE_ACO).toFixed(2)).toBe('48.36');
  });
});

describe('parafuso sextavado', () => {
  it('cabeça com 6 lados e haste de diâmetro A', () => {
    const cabeca = FAMILIA_PARAFUSO_SEXTAVADO.corpos?.find((c) => c.id === 'cabeca');
    expect(cabeca?.forma.tipo).toBe('extrusao');
    if (cabeca?.forma.tipo === 'extrusao' && cabeca.forma.perfil.tipo === 'poligono') {
      expect(cabeca.forma.perfil.pontos.length).toBe(6);
    } else {
      throw new Error('cabeça deve ser poligono por extrusão');
    }
  });
});
