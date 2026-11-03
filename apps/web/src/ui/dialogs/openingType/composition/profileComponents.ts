import type { ComponentType } from 'react';
import { openingOptionSupport, type OpeningFamilyId, type OpeningType } from '@hestia/model';
import type { PanelProps } from '../panels/panelKit.tsx';
import { CasingPanel } from './CasingPanel.tsx';
import { GlassPanel } from './GlassPanel.tsx';
import { ProfilePanel } from './ProfilePanel.tsx';

/*
 * Descritores dos painéis de composição (perfis, alizar, vidro). Mesmo formato de `OpeningComponent` (components.ts):
 * o coordenador acrescenta os ids ao `OpeningComponentId` e espalha `PROFILE_COMPONENTS` em `OPENING_COMPONENTS`.
 */
export interface ProfileComponent {
  id: 'profile' | 'casing' | 'glass';
  /** Chaves do rótulo em `I18N` (pt/en). */
  labelKey: 'oc_profile' | 'oc_casing' | 'oc_glass';
  /** Traço do ícone (viewBox 24×24). */
  icon: string;
  visible: (kind: OpeningType['kind'], family: OpeningFamilyId | null) => boolean;
  Panel: ComponentType<PanelProps>;
}

export const PROFILE_COMPONENTS: readonly ProfileComponent[] = [
  { id: 'profile', labelKey: 'oc_profile', icon: 'M4 4h16v16H4zM8 8h8v8H8z', visible: (_k, f) => openingOptionSupport(f).frame, Panel: ProfilePanel },
  { id: 'casing', labelKey: 'oc_casing', icon: 'M2 4h20v16H2zM6 8h12v8H6z', visible: (_k, f) => openingOptionSupport(f).casing, Panel: CasingPanel },
  {
    id: 'glass',
    labelKey: 'oc_glass',
    icon: 'M5 5h14v14H5zM8 9l4-2 4 2',
    visible: (_k, f) => {
      const s = openingOptionSupport(f);
      return s.glassKind || s.transom || s.sidelights;
    },
    Panel: GlassPanel,
  },
];
