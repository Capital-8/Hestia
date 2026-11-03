import { ceilingIssues, outlineIssues, projectIssues, rampValidationIssues, roofEaveIssues, roofSurfaceIssues, roofWallIssues, roomValidationIssues, stairValidationIssues, wallFloorIssues } from '@hestia/engine';
import { validateProject, type Project, type ValidationIssue } from '@hestia/model';
import { useI18n, type Lang } from './i18n.ts';

/** Avisos do projeto: os de validação, os de parede que ultrapassa ou fica fora do telhado (C2), os degraus da superfície, os de beiral sobre parede ou abertura, os do croqui e de norma das escadas e das rampas, os de ambiente, os do contorno associativo de piso e laje e os de abertura/parede do projeto. */
export const avisosDoProjeto = (p: Project, lang: Lang = useI18n.getState().lang): ValidationIssue[] => [...validateProject(p), ...roofWallIssues(p, lang), ...roofSurfaceIssues(p, lang), ...roofEaveIssues(p, lang), ...stairValidationIssues(p, lang), ...rampValidationIssues(p, lang), ...roomValidationIssues(p, lang), ...ceilingIssues(p, lang), ...outlineIssues(p, lang), ...wallFloorIssues(p, lang), ...projectIssues(p, lang)];
