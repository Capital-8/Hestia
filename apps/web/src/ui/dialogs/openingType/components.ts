import type { ComponentType } from 'react';
import { OPENING_FAMILIES, openingOptionSupport, type OpeningFamilyId, type OpeningType } from '@hestia/model';
import type { I18N } from '../../../editor/i18n.ts';
import { COMPOSITION_COMPONENTS } from './composition/index.ts';
import { PROFILE_COMPONENTS } from './composition/profileComponents.ts';
import { DataPanel } from './panels/DataPanel.tsx';
import { FramePanel } from './panels/FramePanel.tsx';
import { GlazingPanel } from './panels/GlazingPanel.tsx';
import { InnerPanel } from './panels/InnerPanel.tsx';
import { LeafPanel } from './panels/LeafPanel.tsx';
import { OuterPanel } from './panels/OuterPanel.tsx';
import { OverviewPanel } from './panels/OverviewPanel.tsx';
import type { PanelProps } from './panels/panelKit.tsx';
import { PlanPanel } from './panels/PlanPanel.tsx';
import { ShapePanel } from './panels/ShapePanel.tsx';
import { SashesPanel } from './panels/SashesPanel.tsx';
import { WallPanel } from './panels/WallPanel.tsx';

/*
 * Registro dos componentes do diálogo "Editar tipo" (lista à esquerda, painel à direita, como o ArchiCAD).
 *
 * COMO ACRESCENTAR UM CAMPO
 *  1. Se o campo só vale para algumas famílias, ponha a chave em `OpeningOptionSupport` (packages/model/src/openingSupport.ts)
 *     e marque as famílias na tabela: ela é a ÚNICA fonte do que vale para cada família.
 *  2. No painel do componente (panels/*.tsx), acrescente uma linha `field-row` protegida por `support.<chave>`.
 *     Campos opcionais com padrão por leitura usam `usePanelKit(...).setField` (só grava o que difere do padrão).
 *
 * COMO ACRESCENTAR UM PAINEL
 *  1. Crie `panels/NomePanel.tsx` (função de `PanelProps`, uma lista de linhas `field-row`, ≤ 420 linhas).
 *  2. Registre-o em `OPENING_COMPONENTS` abaixo (id, rótulo `oc_*` em i18n.ts pt/en, ícone, `visible`, `Panel`).
 *     `visible(kind, família)` deve derivar da tabela de suporte: painel sem nenhum campo aplicável não aparece.
 */

export type OpeningComponentId = 'overview' | 'frame' | 'leaf' | 'sashes' | 'glazing' | 'outer' | 'inner' | 'wall' | 'plan' | 'data' | 'shape' | 'composition' | 'profile' | 'casing' | 'glass';

export interface OpeningComponent {
  id: OpeningComponentId;
  /** Chave do rótulo em `I18N` (pt/en). */
  labelKey: keyof typeof I18N.pt;
  /** Traço do ícone (viewBox 24×24, mesmo estilo de `Icon.tsx`). */
  icon: string;
  /** O painel tem algo a mostrar para este tipo/família? */
  visible: (kind: OpeningType['kind'], family: OpeningFamilyId | null) => boolean;
  Panel: ComponentType<PanelProps>;
}

const sempre = (): boolean => true;

/** A família aceita mais de uma contagem de folhas (o seletor "Folhas" tem o que escolher). */
const variasFolhas = (family: OpeningFamilyId | null): boolean => (OPENING_FAMILIES.find((f) => f.id === family)?.leaves.length ?? 0) > 1;

/** Os componentes na ordem do ArchiCAD (Door/Window Custom Settings). */
export const OPENING_COMPONENTS: readonly OpeningComponent[] = [
  { id: 'overview', labelKey: 'oc_overview', icon: 'M3 20h18M5 20V6h14v14M8 20v-6h8v6M8 10h2m4 0h2', visible: sempre, Panel: OverviewPanel },
  { id: 'shape', labelKey: 'oc_shape', icon: 'M4 20V10a8 8 0 0 1 16 0v10zM8 20v-8a4 4 0 0 1 8 0v8', visible: sempre, Panel: ShapePanel },
  ...COMPOSITION_COMPONENTS,
  { id: 'frame', labelKey: 'oc_frame', icon: 'M4 4h16v16H4zM8 8h8v12H8z', visible: (_k, f) => openingOptionSupport(f).frame, Panel: FramePanel },
  { id: 'leaf', labelKey: 'oc_leaf', icon: 'M7 3h10v18H7zM14 12h.01M7 3l-3 2v14l3 2', visible: (k, f) => k === 'door' && openingOptionSupport(f).leafThickness, Panel: LeafPanel },
  {
    id: 'sashes',
    labelKey: 'oc_sashes',
    icon: 'M4 4h16v16H4zM12 4v16M4 12h16',
    visible: (k, f) => {
      const s = openingOptionSupport(f);
      return k === 'window' && (s.grid || s.transom || s.sidelights || s.angle || variasFolhas(f));
    },
    Panel: SashesPanel,
  },
  { id: 'glazing', labelKey: 'oc_glazing', icon: 'M5 4h14v16H5zM9 8l6 8M9 14l3-3', visible: (k, f) => k === 'window' && (openingOptionSupport(f).glassKind || openingOptionSupport(f).leafThickness), Panel: GlazingPanel },
  ...PROFILE_COMPONENTS,
  { id: 'outer', labelKey: 'oc_outer', icon: 'M4 20V6h8v14M12 8h8M16 4v8', visible: sempre, Panel: OuterPanel },
  { id: 'inner', labelKey: 'oc_inner', icon: 'M20 20V6h-8v14M12 8H4M8 4v8', visible: sempre, Panel: InnerPanel },
  { id: 'wall', labelKey: 'oc_wall', icon: 'M3 8h18M3 16h18M8 3v5m8 0v8m-8 0v5', visible: sempre, Panel: WallPanel },
  { id: 'plan', labelKey: 'oc_plan', icon: 'M4 20V6h5v14M9 20a8 8 0 0 0 8-8M9 12h8', visible: sempre, Panel: PlanPanel },
  { id: 'data', labelKey: 'oc_data', icon: 'M4 5h16v14H4zM4 10h16M10 10v9', visible: sempre, Panel: DataPanel },
];

/** Componentes que valem para o tipo/família, na ordem da lista. */
export function visibleComponents(kind: OpeningType['kind'], family: OpeningFamilyId | null): readonly OpeningComponent[] {
  return OPENING_COMPONENTS.filter((c) => c.visible(kind, family));
}

/** Último componente aberto nesta sessão (volta a ele ao reabrir o diálogo ou trocar de tipo). */
let ultimo: OpeningComponentId = 'overview';

/** Componente a mostrar: o lembrado se ainda valer para o tipo/família; senão a Visão geral. */
export function componentToShow(kind: OpeningType['kind'], family: OpeningFamilyId | null, wanted: OpeningComponentId = ultimo): OpeningComponentId {
  return visibleComponents(kind, family).some((c) => c.id === wanted) ? wanted : 'overview';
}

export function rememberComponent(id: OpeningComponentId): void {
  ultimo = id;
}
