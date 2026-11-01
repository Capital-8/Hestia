import { LIGHT, planFrameUpdateOf } from '@hestia/render';
import type { ResolvedLevel } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';
import { thinLinesOn } from './graphicsActions.ts';

/**
 * Aquece a geometria da planta de um pavimento que ainda não foi aberto: roda o mesmo caminho do quadro
 * (`planFrameUpdateOf(...).geometry()`), que preenche as memorizações por projeto (junções, lajes, pisos, ambientes). Quando
 * o usuário abre o pavimento, o quadro só refaz as operações de desenho. O resultado é descartado; o tema e o zoom daqui não
 * importam, porque as memorizações não dependem deles.
 */
export function aquecerPlanta(p: Project, levelId: Id, versao: number, resolve: (id: Id) => ResolvedLevel, opcoes: { showUnderlay: boolean; underlayLevel: string | null; showRoofProjection: boolean }): void {
  planFrameUpdateOf({
    project: p,
    version: versao,
    levelId,
    v: { cx: 0, cy: 0, zoom: 50, width: 1200, height: 800 },
    theme: LIGHT,
    dark: false,
    gpu: false,
    showGrid: false,
    showUnderlay: opcoes.showUnderlay,
    underlayLevel: opcoes.underlayLevel,
    showRoofProjection: opcoes.showRoofProjection,
    thinLines: thinLinesOn(p, { levelId }),
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    resolve,
  }).geometry();
}
