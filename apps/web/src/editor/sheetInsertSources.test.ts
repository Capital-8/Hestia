import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeView3DPoint } from '@hestia/model';
import { faixaVisivel, gruposDeVistas, linhasDeVistas } from './sheetInsertSources.ts';

/** Projeto vazio (térreo e pavimento 2) com um corte, uma elevação e um ponto de vista salvo. */
function projetoComVistas(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addView', view: { id: 'sec_a', name: 'Corte AA', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 } });
  s.exec({ type: 'addView', view: { id: 'el_s', name: 'Elevação Sul', kind: 'elevation', a: { x: 0, y: -1 }, b: { x: 4, y: -1 }, depth: 3 } });
  s.exec({ type: 'addView3DPoint', point: { ...makeView3DPoint({ azimuth: 0, elevation: 0.5, distance: 10, target: { x: 0, y: 0, z: 0 }, ortho: false }, 'Fachada norte'), id: 'v3d_fachada' } });
  return s;
}

describe('vistas da janela Inserir vistas: grupos', () => {
  it('agrupa em plantas, cortes, elevações e 3D, nessa ordem, com nomes legíveis', () => {
    const grupos = gruposDeVistas(projetoComVistas().project, 'pt');
    expect(grupos.map((g) => g.titulo)).toEqual(['Plantas', 'Cortes', 'Elevações', 'Modelo 3D']);
    expect(grupos.map((g) => g.fontes.map((f) => f.label))).toEqual([
      ['Térreo', 'Pavimento 2'],
      ['Corte AA'],
      ['Elevação Sul'],
      ['Fachada norte', 'Modelo 3D (enquadramento padrão)'],
    ]);
  });

  it('as chaves seguem o formato da marcação: plan:, section:, 3d:<ponto> e 3d', () => {
    const fontes = gruposDeVistas(projetoComVistas().project, 'pt').flatMap((g) => g.fontes);
    expect(fontes.map((f) => f.key)).toEqual(['plan:lv_0', 'plan:lv_1', 'section:sec_a', 'section:el_s', '3d:v3d_fachada', '3d']);
  });

  it('projeto sem cortes nem elevações: esses grupos não aparecem', () => {
    const grupos = gruposDeVistas(new ProjectStore(createEmptyProject()).project, 'pt');
    expect(grupos.map((g) => g.titulo)).toEqual(['Plantas', 'Modelo 3D']);
  });

  it('a lista achatada põe o título antes das vistas de cada grupo', () => {
    const linhas = linhasDeVistas(gruposDeVistas(projetoComVistas().project, 'pt'));
    expect(linhas.length).toBe(4 + 6);
    expect(linhas[0]).toEqual({ kind: 'grupo', titulo: 'Plantas' });
    expect(linhas[1]).toEqual({ kind: 'vista', fonte: { key: 'plan:lv_0', label: 'Térreo', view: { kind: 'plan', levelId: 'lv_0' } } });
    expect(linhas[3]).toEqual({ kind: 'grupo', titulo: 'Cortes' });
  });
});

describe('vistas da janela Inserir vistas: faixa visível da rolagem', () => {
  it('no topo, com 100 linhas de 28 px numa janela de 300 px: linhas 0 a 14 (11 visíveis + 4 de folga)', () => {
    expect(faixaVisivel(100, 28, 0, 300)).toEqual({ primeira: 0, ultima: 14 });
  });

  it('rolada a 1000 px: primeira 31 (35 - 4) e última 50 (ceil(1300 / 28) = 47, +3)', () => {
    expect(faixaVisivel(100, 28, 1000, 300)).toEqual({ primeira: 31, ultima: 50 });
  });

  it('lista menor que a janela: mostra tudo', () => {
    expect(faixaVisivel(10, 28, 0, 300)).toEqual({ primeira: 0, ultima: 9 });
  });

  it('rolagem além do fim fica presa na última linha; lista vazia não mostra nada', () => {
    expect(faixaVisivel(100, 28, 99999, 300)).toEqual({ primeira: 99, ultima: 99 });
    expect(faixaVisivel(0, 28, 0, 300)).toEqual({ primeira: 0, ultima: -1 });
  });
});
