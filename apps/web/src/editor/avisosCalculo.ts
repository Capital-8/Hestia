import { ceilingIssues, outlineIssues, projectIssues, rampValidationIssues, roofEaveIssues, roofSurfaceIssues, roofWallIssues, roomValidationIssues, stairValidationIssues, wallFloorIssues } from '@hestia/engine';
import { validateProject, type Project, type ValidationIssue } from '@hestia/model';

/**
 * Os verificadores dos avisos do projeto, na ordem em que os resultados são concatenados: os de validação, os de parede que
 * ultrapassa ou fica fora do telhado (C2), os degraus da superfície, os de beiral sobre parede ou abertura, os do croqui e
 * de norma das escadas e das rampas, os de ambiente, os do contorno associativo de piso e laje e os de abertura/parede do
 * projeto. Ficam separados para a thread principal poder ceder a vez entre um e outro (ver `agendarAvisos`).
 *
 * Este módulo não importa nada da interface: roda igual no worker dos avisos (`avisosWorker.ts`).
 */
export const VERIFICADORES_DE_AVISOS: ReadonlyArray<(p: Project) => ValidationIssue[]> = [
  validateProject,
  roofWallIssues,
  roofSurfaceIssues,
  roofEaveIssues,
  stairValidationIssues,
  rampValidationIssues,
  roomValidationIssues,
  ceilingIssues,
  outlineIssues,
  wallFloorIssues,
  projectIssues,
];

/** Todos os avisos do projeto, de uma vez (síncrono). */
export const calcularAvisos = (p: Project): ValidationIssue[] => VERIFICADORES_DE_AVISOS.flatMap((v) => v(p));
