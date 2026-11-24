import { categoriasDoPainel, createEmptyProject } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { ABAS_PALETA, categoriasDoGrupo, filtrarItensDaPaleta, montarItensDaPaleta } from './paletaMoveis.ts';

/*
 * Fichas J2 e J3: a Biblioteca tem os grupos Hidráulica, Elétrico, HVAC e Estrutura, lidos da tabela de destinos (J1). As famílias
 * da Krona aparecem em Hidráulica; os móveis não aparecem em nenhum grupo; as abas por categoria seguem como antes.
 */

describe('grupos da paleta por sistema', () => {
  const itens = montarItensDaPaleta(createEmptyProject());
  const ids = (g: Parameters<typeof filtrarItensDaPaleta>[1], busca = ''): string[] => filtrarItensDaPaleta(itens, g, busca).map((i) => i.familia.id);

  it('as abas dos grupos existem logo depois de "Todas"', () => {
    expect(ABAS_PALETA.slice(0, 5).map((a) => a.id)).toEqual(['todas', 'grupo:hidraulica', 'grupo:eletrico', 'grupo:hvac', 'grupo:estrutura']);
  });
  it('os grupos leem a tabela de destinos (nada escrito à mão)', () => {
    expect(categoriasDoGrupo('grupo:hidraulica')).toEqual(categoriasDoPainel('hidraulica'));
    expect(categoriasDoGrupo('grupo:estrutura')).toEqual(['perfil_estrutural', 'chapa_estrutural']);
  });
  it('Hidráulica traz as 39 famílias da Krona e nenhum móvel', () => {
    const lista = ids('grupo:hidraulica');
    expect(lista.filter((i) => i.startsWith('fam_krona_esgoto_'))).toHaveLength(26);
    expect(lista.filter((i) => i.startsWith('fam_krona_soldavel_'))).toHaveLength(13);
    expect(lista).not.toContain('fam_comoda');
    for (const i of filtrarItensDaPaleta(itens, 'grupo:hidraulica', '')) expect(['tubulacao', 'conexao_tubo', 'terminal_hidraulico', 'reservatorio']).toContain(i.familia.categoria);
  });
  it('a busca vale dentro do grupo (soldável, sem acento)', () => {
    const lista = ids('grupo:hidraulica', 'soldavel');
    expect(lista).toContain('fam_krona_soldavel_joelho90');
    expect(lista.every((i) => !i.startsWith('fam_krona_esgoto_'))).toBe(true);
  });
  it('Elétrico, HVAC e Estrutura têm famílias; perfis em Estrutura', () => {
    expect(ids('grupo:eletrico').length).toBeGreaterThan(5);
    expect(ids('grupo:hvac').length).toBeGreaterThan(3);
    expect(ids('grupo:estrutura')).toContain('fam_perfil_i');
  });
  it('as abas por categoria continuam iguais (conexões de tubo)', () => {
    expect(ids('conexao_tubo').length).toBeGreaterThan(20);
  });
});

import { DESTINO_DA_CATEGORIA } from '@hestia/model';
import { CATEGORIAS } from './familia/familiaNovo.ts';

describe('uma só lista de categorias (ficha J4)', () => {
  it('a galeria do editor lista exatamente as categorias da tabela de destinos (mais "Meus modelos")', () => {
    expect(CATEGORIAS.map((c) => c.id).filter((c) => c !== 'meus').sort()).toEqual(Object.keys(DESTINO_DA_CATEGORIA).sort());
  });
});
