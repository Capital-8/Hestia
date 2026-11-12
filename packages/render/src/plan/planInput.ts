import type { ResolvedFloor, ResolvedLevel, ResolvedRoof, ResolvedRoom, ResolvedSlab } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import { areaPlanOf, planViewOf as vistaDoModelo, floorViewId, type AreaPlan, type Id, type Project } from '@hestia/model';
import type { Inference, PreviewItem } from '@hestia/tools';
import type { Viewport } from '../viewport.ts';
import type { Lang } from '../i18n.ts';
import type { PlanProfile, PlanTheme } from './types.ts';

/** Campos de `PlanInput` que não dizem QUAL vista se desenha (isso é o `PlanTarget`). */
export interface PlanInputBase {
  project: Project;
  /**
   * Geometria do nível pelo padrão (sem intervalo de vista). A planta normal não a usa: refaz a geometria do nível com o
   * intervalo de vista (`resolvedPlanViewOf`). Só a planta de cobertura a usa, como antes.
   */
  resolved: ResolvedLevel;
  below: ResolvedLevel | null;
  /** Pisos do nível abaixo (referência apagada, D4); sem ele, só as paredes do subpavimento aparecem. */
  belowFloors?: ResolvedFloor[];
  /** Lajes do nível abaixo, apagadas como os pisos (D1/D4); o app preenche, sem ele nada aparece. */
  belowSlabs?: ResolvedSlab[];
  /** Telhados do nível abaixo, apagados como as lajes (D4); sem eles, nada aparece. */
  belowRoofs?: ResolvedRoof[];
  /** Ambientes do nível abaixo, apagados como os pisos (D3); sem eles, nada aparece. */
  belowRooms?: ResolvedRoom[];
  /** Perfil de desenho; sem ele, a vista de área usa `areaPlanProfile` e a planta de piso usa `FLOOR_PLAN_PROFILE`. */
  profile?: PlanProfile;
  /** Elementos ocultos nesta vista (Hide in View + temporário). */
  hidden?: ReadonlySet<Id>;
  /** Elementos que o modo Reveal mostra com borda azul. */
  revealed?: ReadonlySet<Id>;
  /** Rótulo em arraste (fantasma) da planta de área: segue o cursor em tempo real. */
  tagGhost?: { roomId: Id; at: Vec2 };
  /** Ambiente cujo rótulo está sendo arrastado: a geometria não o desenha (o fantasma desenha). */
  hideLabelRoomId?: Id;
  /**
   * Projeção da cobertura (decisão 0013 §2): contorno tracejado dos telhados que estão fora do intervalo de vista. Padrão
   * ligado; independe do topo. Não afeta a planta de cobertura.
   */
  showRoofProjection?: boolean;
  viewport: Viewport;
  theme: PlanTheme;
  dark: boolean;
  selection: Id[];
  hover: Id | null;
  /** Parede em conflito (decisão 0044): realçada em amarelo na camada de hover. */
  aviso?: Id | null;
  preview: PreviewItem[];
  inference: Inference | null;
  showGrid: boolean;
  /**
   * Linhas finas só na tela (decisão 0015): todo traço sai com 1 px. Padrão desligado; a composição de pranchas, o PDF e
   * o DXF não passam a opção, então usam os pesos reais. Não lê o modelo: quem chama decide.
   */
  thinLines?: boolean;
  /** Idioma dos textos fixos da planta (nome padrão de ambiente, "SOBE", cabeçalhos e tooltip de captura). Padrão `'pt'`. */
  lang?: Lang;
}

/**
 * Qual vista se desenha: `viewId` (id da `PlanView`: piso, cobertura ou planta de área); nível, modo de cobertura e
 * planta de área saem dela.
 */
export interface PlanTarget {
  viewId: Id;
  /** Nível de reserva: se `viewId` não existir no projeto (vista apagada com a tela ainda aberta), desenha a planta de piso dele. */
  levelId?: Id;
  /** Planta de área alternativa (ex.: com edição em curso); sem ela, a derivada da vista. */
  areaPlan?: AreaPlan;
}

/** Entrada do desenho da planta. */
export type PlanInput = PlanInputBase & PlanTarget;

/**
 * Alvo já resolvido: tudo que o desenho precisa saber da vista, consistente entre si. `roofPlanMode` é derivado da vista
 * (planta de piso com `showRoofOnTop`). Planta de cobertura (D6): telhados do nível opacos (alpha 1) e os de `belowRoofs` também, só o preenchimento;
 * paredes só como contorno fino por cima; sem pisos, lajes ou aberturas; cota da cumeeira sempre visível. Não usa o
 * intervalo de vista.
 */
export interface PlanTargetResolvido {
  viewId: Id;
  levelId: Id;
  /** Planta de cobertura (D6). */
  roofPlanMode: boolean;
  /** Planta de área (derivada da vista, ou a alternativa recebida). */
  areaPlan?: AreaPlan;
}

/** `PlanInput` com o alvo resolvido (as funções internas do desenho trabalham com este). */
export type PlanInputResolvido = PlanInputBase & PlanTargetResolvido;

/**
 * Resolve o alvo UMA vez na entrada do desenho: a vista manda, e dela saem o nível, a cobertura e a planta de área.
 * `viewId` que não existe no projeto cai na planta de piso do `levelId`, se ele veio, e senão é erro de quem chamou.
 */
export function resolvePlanTarget(p: Pick<Project, 'planViews'>, t: PlanTarget): PlanTargetResolvido {
  const vista = vistaDoModelo(p, t.viewId);
  if (!vista) {
    if (t.levelId === undefined) throw new Error(`Vista de planta inexistente: ${t.viewId}`);
    return { viewId: floorViewId(t.levelId), levelId: t.levelId, roofPlanMode: false, ...(t.areaPlan ? { areaPlan: t.areaPlan } : {}) };
  }
  // Idempotente: um alvo já resolvido (com planta de área alternativa) resolve de novo para o mesmo alvo.
  const areaPlan = t.areaPlan ?? (vista.kind === 'area' ? areaPlanOf(p, vista.id) : undefined);
  return { viewId: vista.id, levelId: vista.levelId, roofPlanMode: vista.kind === 'floor' && vista.showRoofOnTop === true, ...(areaPlan ? { areaPlan } : {}) };
}

/** Resolve o alvo de um `PlanInput` (ver `resolvePlanTarget`). */
export function resolvePlanInput(input: PlanInput): PlanInputResolvido {
  const { levelId: _l, areaPlan: _a, viewId: _v, ...base } = input;
  void _l; void _a; void _v;
  return { ...base, ...resolvePlanTarget(input.project, input) };
}
