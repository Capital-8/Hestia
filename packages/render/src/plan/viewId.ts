import { floorViewId, planViewOf as vistaDoModelo, roofViewId, type AreaPlan, type Id, type Project } from '@hestia/model';

/**
 * Id da vista de planta que o desenho representa, calculado UMA vez na entrada (`planContext`, `planFrameUpdateOf` e
 * as entradas públicas) e repassado como `viewId` para dentro. Planta de área manda sobre cobertura; cobertura usa
 * `roofViewId`; o resto é a planta de piso.
 *
 * Planta de área que não está registrada no projeto (objeto montado à mão, só nos testes) cai na vista do nível: é de
 * lá que o desenho sempre leu intervalo, gráficos e anotações antes da vista ser uma entidade.
 */
export function planViewIdOf(p: Pick<Project, 'planViews'>, levelId: Id, opts?: { areaPlan?: Pick<AreaPlan, 'id'>; roofPlanMode?: boolean }): Id {
  const area = opts?.areaPlan;
  if (area && vistaDoModelo(p, area.id)?.kind === 'area') return area.id;
  return opts?.roofPlanMode ? roofViewId(levelId) : floorViewId(levelId);
}
