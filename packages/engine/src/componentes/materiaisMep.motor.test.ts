import { APELIDOS_MATERIAL_CORPO, BIBLIOTECA_MEP, MAPA_ACABAMENTOS, MATERIAL_NEUTRO, resolverMaterialVisualCorpo } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverFamilia } from './resolver.ts';

/*
 * Ficha K4: nenhuma família MEP da biblioteca resolve para madeira, e todo corpo SÓLIDO traz um material conhecido (nada de cair no
 * cinza neutro por esquecimento). Famílias da Krona: esgoto branco, reforçado bege, soldável marrom.
 */

const MADEIRAS = new Set(['comp_carvalho', 'comp_freijo', 'comp_nogueira', 'comp_madeira_clara', 'comp_corpo', 'comp_fundo']);
const conhecidos = (id: string): boolean => MAPA_ACABAMENTOS[id] !== undefined;

describe('materiais das famílias MEP', () => {
  for (const f of BIBLIOTECA_MEP) {
    it(`${f.id}: corpos sólidos com material conhecido, fora da madeira`, () => {
      const t = f.tipos[0];
      const r = resolverFamilia(f, { tipoId: t?.id });
      for (const c of r.corpos ?? []) {
        if (c.vazio) continue;
        // Todo corpo sólido da biblioteca MEP declara um material do mapa (PVC, aço, cobre, vidro, concreto...).
        expect(c.material).not.toBeNull();
        expect(c.material !== null && (c.material in APELIDOS_MATERIAL_CORPO || conhecidos(c.material))).toBe(true);
        const visual = resolverMaterialVisualCorpo(c.material, {}, conhecidos);
        expect(MADEIRAS.has(visual)).toBe(false);
        expect(visual).not.toBe(MATERIAL_NEUTRO);
      }
    });
  }
  it('Krona: esgoto PVC branco, série reforçada bege, soldável marrom', () => {
    const cor = (id: string): string | null => {
      const f = BIBLIOTECA_MEP.find((x) => x.id === id);
      if (!f) throw new Error(id);
      return resolverMaterialVisualCorpo(resolverFamilia(f, { tipoId: f.tipos[0]?.id }).corpos?.[0]?.material ?? null, {}, conhecidos);
    };
    expect(cor('fam_krona_esgoto_tubo')).toBe('comp_pvc_branco');
    expect(cor('fam_krona_esgoto_reforcado_joelho90')).toBe('comp_pvc_bege');
    expect(cor('fam_krona_soldavel_tubo')).toBe('comp_pvc_marrom');
  });
});
