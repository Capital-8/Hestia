import { describe, expect, it } from 'vitest';
import { createEmptyProject, familiaDaBiblioteca, type Project } from '@hestia/model';
import { filtrarItensDaPaleta, montarItensDaPaleta } from './paletaMoveis.ts';

/** Projeto com a cômoda carregada (família que também existe na biblioteca base). */
function projetoComComoda(): Project {
  const p = createEmptyProject();
  const comoda = familiaDaBiblioteca('fam_comoda');
  if (!comoda) throw new Error('fam_comoda ausente da biblioteca');
  return { ...p, componentFamilies: { fam_comoda: comoda } };
}

describe('paleta de móveis', () => {
  it('marca as famílias do projeto e não repete as da biblioteca base', () => {
    const itens = montarItensDaPaleta(projetoComComoda());
    const comoda = itens.find((i) => i.familia.id === 'fam_comoda');
    expect(comoda?.doProjeto).toBe(true);
    expect(itens.filter((i) => i.familia.id === 'fam_comoda')).toHaveLength(1);
    expect(itens.some((i) => i.familia.id === 'fam_gaveta' && !i.doProjeto)).toBe(true);
  });

  it('filtra pela categoria escolhida', () => {
    const itens = montarItensDaPaleta(createEmptyProject());
    const filtrados = filtrarItensDaPaleta(itens, 'mobiliario', '');
    expect(filtrados.length).toBeGreaterThan(0);
    expect(filtrados.every((i) => i.familia.categoria === 'mobiliario')).toBe(true);
    expect(filtrados.some((i) => i.familia.id === 'fam_comoda')).toBe(true);
  });

  it('busca sem acento encontra "Cômoda" digitando "comoda"', () => {
    const itens = montarItensDaPaleta(createEmptyProject());
    const filtrados = filtrarItensDaPaleta(itens, 'todas', 'comoda');
    expect(filtrados.map((i) => i.familia.id)).toContain('fam_comoda');
  });

  it('a aba "Meus modelos" mostra só as famílias do projeto', () => {
    const itens = montarItensDaPaleta(projetoComComoda());
    const filtrados = filtrarItensDaPaleta(itens, 'meus', '');
    expect(filtrados.length).toBe(1);
    expect(filtrados[0]?.familia.id).toBe('fam_comoda');
    expect(filtrados[0]?.doProjeto).toBe(true);
  });
});
