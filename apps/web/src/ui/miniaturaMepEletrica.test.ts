import { BIBLIOTECA_MEP, corDoMaterialInstalacao, destinoDaFamilia, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { corBaseDoMaterial, silhuetaMep } from './miniaturaMep.ts';

/*
 * Ficha C8b, defeito (G): tomada 2P+T, arandela, caixa de luz e plafon saíam como sólido cinza liso. Causas: (1) apelidos `mat_*`
 * de luminárias (aluminio, vidro), quadro (cobre) e cerâmica apontavam para ids que não existiam no catálogo, então caíam no cinza
 * neutro; (2) o sombreado por face era fraco e o desenho não tinha contorno, então uma caixa lia-se como retângulo. Agora o catálogo
 * tem esses materiais e a silhueta traz as arestas de contorno (silhueta e quinas, sem a diagonal das faces).
 */

const NEUTRO = corDoMaterialInstalacao('comp_cinza_neutro');
const eletricas = (): Familia[] => BIBLIOTECA_MEP.filter((f) => destinoDaFamilia(f.categoria)?.painel === 'eletrico');
const achar = (id: string): Familia => {
  const f = BIBLIOTECA_MEP.find((x) => x.id === id);
  if (!f) throw new Error(`família ${id} ausente`);
  return f;
};

describe('miniatura MEP elétrica (ficha C8b, defeito G)', () => {
  it('os apelidos de luminária, quadro e caixa resolvem cor do catálogo, não o cinza neutro', () => {
    for (const apelido of ['mat_aluminio', 'mat_vidro', 'mat_cobre', 'mat_ceramica']) {
      const cor = corBaseDoMaterial(apelido);
      expect(cor, apelido).not.toBe(NEUTRO);
      expect(cor, apelido).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(corBaseDoMaterial('mat_aluminio')).toBe(corDoMaterialInstalacao('comp_aluminio'));
    expect(corBaseDoMaterial('mat_vidro')).toBe(corDoMaterialInstalacao('comp_vidro_incolor'));
  });

  it('o material de instalações nunca sai madeira (o mesmo que antes para material desconhecido: cinza neutro)', () => {
    expect(corBaseDoMaterial('carvalho_inexistente')).toBe(NEUTRO);
  });

  it('a tomada 2P+T sai com pelo menos dois tons e contorno (não é um retângulo chapado)', () => {
    const s = silhuetaMep(achar('fam_tomada_2p_t'));
    expect(s).not.toBeNull();
    expect(new Set((s?.triangulos ?? []).map((t) => t.cor)).size).toBeGreaterThanOrEqual(2);
    // Caixa visível: 6 arestas de silhueta e 3 quinas internas (as diagonais das faces não entram).
    expect((s?.arestas ?? '').split('M').filter(Boolean)).toHaveLength(9);
  });

  it('TODA miniatura elétrica sai com pelo menos dois tons e com contorno (nenhuma monocromática)', () => {
    const lista = eletricas();
    expect(lista.length).toBeGreaterThan(5);
    const falhas: string[] = [];
    for (const f of lista) {
      const s = silhuetaMep(f);
      const tons = new Set((s?.triangulos ?? []).map((t) => t.cor)).size;
      if (!s || tons < 2 || s.arestas.length === 0) falhas.push(`${f.id}:${tons} tons`);
    }
    expect(falhas).toEqual([]);
  });

  it('o arandela (caixa de alumínio com difusor de vidro) mostra os dois materiais, não só cinza', () => {
    const s = silhuetaMep(achar('fam_luminaria_arandela'));
    const cores = new Set((s?.triangulos ?? []).map((t) => t.cor));
    expect(cores.size).toBeGreaterThanOrEqual(3);
  });

  it('o plafon redondo sai com varios tons e contorno de quinas (é cilindro, não bloco)', () => {
    const s = silhuetaMep(achar('fam_luminaria_plafon_redondo'));
    expect(new Set((s?.triangulos ?? []).map((t) => t.cor)).size).toBeGreaterThan(5);
    expect(s?.arestas.length ?? 0).toBeGreaterThan(0);
  });

  it('as arestas ficam dentro do quadro da miniatura (sem vazar para fora da borda)', () => {
    const s = silhuetaMep(achar('fam_caixa_octogonal'), 120, 64);
    const nums = (s?.arestas ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(120);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(64);
  });
});
