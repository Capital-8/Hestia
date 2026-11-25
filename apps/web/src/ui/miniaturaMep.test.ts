import { BIBLIOTECA_BASE, BIBLIOTECA_MEP, corDoMaterialInstalacao, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { miniaturaDaFamilia } from './familia/familiaMiniatura.ts';
import { corBaseDoMaterial, ehFamiliaMep, limparCacheSilhuetasMep, silhuetaMep } from './miniaturaMep.ts';

function achar(id: string): Familia {
  const f = BIBLIOTECA_MEP.find((x) => x.id === id);
  if (!f) throw new Error(`família ${id} não está em BIBLIOTECA_MEP`);
  return f;
}

/** Cor "rgb(r,g,b)" lida em três números. */
function canais(cor: string): [number, number, number] {
  const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(cor);
  if (!m) throw new Error(`cor fora do formato: ${cor}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe('silhueta MEP (ficha B7)', () => {
  it('tubo de esgoto gera triângulos', () => {
    const s = silhuetaMep(achar('fam_tubo_esgoto'));
    expect(s).not.toBeNull();
    expect(s?.triangulos.length ?? 0).toBeGreaterThan(0);
  });

  it('joelho 90° de água fria gera triângulos', () => {
    expect(silhuetaMep(achar('fam_agua_fria_joelho90'))?.triangulos.length ?? 0).toBeGreaterThan(0);
  });

  it('tê de esgoto gera triângulos', () => {
    expect(silhuetaMep(achar('fam_esgoto_te'))?.triangulos.length ?? 0).toBeGreaterThan(0);
  });

  it('luva de esgoto gera triângulos', () => {
    expect(silhuetaMep(achar('fam_esgoto_luva'))?.triangulos.length ?? 0).toBeGreaterThan(0);
  });

  it('caixa elétrica 4x2 gera triângulos', () => {
    expect(silhuetaMep(achar('fam_caixa_4x2'))?.triangulos.length ?? 0).toBeGreaterThan(0);
  });

  it('a cor vem do material do corpo (marrom fica marrom, branco fica claro, nunca madeira)', () => {
    expect(corBaseDoMaterial('comp_pvc_marrom')).toBe(corDoMaterialInstalacao('comp_pvc_marrom'));
    expect(corBaseDoMaterial('mat_pvc_branco')).toBe(corDoMaterialInstalacao('comp_pvc_branco'));
    expect(corBaseDoMaterial(null)).toBe(corDoMaterialInstalacao('comp_cinza_neutro'));

    const base = achar('fam_tubo_esgoto');
    const como = (material: string): Familia => ({
      ...base,
      id: `fam_teste_${material}`,
      corpos: (base.corpos ?? []).map((c) => ({ ...c, material })),
    });
    const marrom = silhuetaMep(como('comp_pvc_marrom'));
    const branco = silhuetaMep(como('comp_pvc_branco'));
    expect(marrom?.triangulos.length ?? 0).toBeGreaterThan(0);
    for (const t of marrom?.triangulos ?? []) {
      const [r, g, b] = canais(t.cor);
      expect(r).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(b);
    }
    const media = (s: typeof marrom): number => {
      const cs = (s?.triangulos ?? []).map((t) => canais(t.cor)[0] + canais(t.cor)[1] + canais(t.cor)[2]);
      return cs.reduce((a, v) => a + v, 0) / Math.max(1, cs.length);
    };
    expect(media(branco)).toBeGreaterThan(media(marrom) + 60);
  });

  it('família sem sólido cai no fallback atual (null, e a miniatura de peças fica com o retângulo)', () => {
    const vazia: Familia = { ...achar('fam_tubo_esgoto'), id: 'fam_teste_sem_geometria', corpos: [], pecas: [] };
    expect(silhuetaMep(vazia)).toBeNull();
    const retangulos = miniaturaDaFamilia(vazia, 120, 64).retangulos;
    expect(retangulos).toHaveLength(1);
    expect(retangulos[0]?.vazio).toBe(false);
  });

  it('é determinística: mesma família, mesmo resultado (com e sem cache)', () => {
    const f = achar('fam_esgoto_te');
    const a = silhuetaMep(f);
    expect(silhuetaMep(f)).toEqual(a);
    limparCacheSilhuetasMep();
    expect(silhuetaMep(f)).toEqual(a);
  });

  it('só famílias de painéis MEP usam a silhueta (móvel e perfil ficam de fora)', () => {
    expect(ehFamiliaMep(achar('fam_tubo_esgoto'))).toBe(true);
    expect(ehFamiliaMep(achar('fam_caixa_4x2'))).toBe(true);
    expect(ehFamiliaMep(achar('fam_perfil_i'))).toBe(false);
    expect(ehFamiliaMep(BIBLIOTECA_BASE[0] as Familia)).toBe(false);
  });

  it('TODA família de BIBLIOTECA_MEP gera silhueta não vazia (lista as que falham)', () => {
    const falhas = BIBLIOTECA_MEP.filter((f) => (silhuetaMep(f)?.triangulos.length ?? 0) === 0).map((f) => f.id);
    expect(falhas).toEqual([]);
  });
});
