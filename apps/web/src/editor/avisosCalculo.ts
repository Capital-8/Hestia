import { ceilingIssues, outlineIssues, projectIssues, rampValidationIssues, roofEaveIssues, roofSurfaceIssues, roofWallIssues, roomValidationIssues, stairValidationIssues, wallFloorIssues } from '@hestia/engine';
import { validateProject, type Project, type ValidationIssue } from '@hestia/model';

/** Avisos do projeto: os de validação, os de parede que ultrapassa ou fica fora do telhado (C2), os degraus da superfície, os de beiral sobre parede ou abertura, os do croqui e de norma das escadas e das rampas, os de ambiente, os do contorno associativo de piso e laje e os de abertura/parede do projeto. */
export const avisosDoProjeto = (p: Project): ValidationIssue[] => [...validateProject(p), ...roofWallIssues(p), ...roofSurfaceIssues(p), ...roofEaveIssues(p), ...stairValidationIssues(p), ...rampValidationIssues(p), ...roomValidationIssues(p), ...ceilingIssues(p), ...outlineIssues(p), ...wallFloorIssues(p), ...projectIssues(p)];
