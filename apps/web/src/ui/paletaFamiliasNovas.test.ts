import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { filtrarItensDaPaleta, montarItensDaPaleta } from './paletaMoveis.ts';

/*
 * Famílias novas da Biblioteca na paleta: nenhuma aba de categoria fica vazia e a busca encontra as principais pelo nome.
 * Contagens literais (conferidas à mão contra os arquivos da biblioteca).
 */

describe('paleta com as famílias novas', () => {
  const itens = montarItensDaPaleta(createEmptyProject());

  it('cada categoria da paleta tem pelo menos 3 famílias', () => {
    for (const c of ['marcenaria', 'mobiliario', 'loucas', 'equipamento', 'generico'] as const) {
      expect(filtrarItensDaPaleta(itens, c, '').length, c).toBeGreaterThanOrEqual(3);
    }
  });

  it('contagem por categoria: equipamento 17, louças 10, genéricos 5', () => {
    expect(filtrarItensDaPaleta(itens, 'equipamento', '')).toHaveLength(17);
    expect(filtrarItensDaPaleta(itens, 'loucas', '')).toHaveLength(10);
    expect(filtrarItensDaPaleta(itens, 'generico', '')).toHaveLength(5);
  });

  it('busca por nome encontra mesa redonda, geladeira, box e cuba', () => {
    const ids = (b: string): string[] => filtrarItensDaPaleta(itens, 'todas', b).map((i) => i.familia.id);
    expect(ids('redonda')).toContain('fam_mesa_jantar_redonda');
    expect(ids('geladeira')).toContain('fam_geladeira');
    expect(ids('box')).toEqual(expect.arrayContaining(['fam_box_reto', 'fam_box_canto']));
    expect(ids('cuba')).toContain('fam_cuba_inox');
  });
});
