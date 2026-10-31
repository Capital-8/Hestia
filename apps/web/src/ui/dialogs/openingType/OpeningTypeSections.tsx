import { useState, type ReactElement } from 'react';
import { openingOptionSupport, type Material, type OpeningFamily, type OpeningType } from '@hestia/model';
import { I18N, useI18n } from '../../../editor/i18n.ts';
import { OPENING_COMPONENTS, componentToShow, rememberComponent, visibleComponents, type OpeningComponentId } from './components.ts';

interface OpeningTypeSectionsProps {
  d: OpeningType;
  onChange: (next: OpeningType) => void;
  family: OpeningFamily | null;
  leaves: ReadonlyArray<{ value: OpeningType['leaves']; label: string }>;
  materials: Record<string, Material>;
  /** Componente aberto (controlado pelo diálogo); sem ele, o componente lembrado da sessão. */
  active?: OpeningComponentId;
  onActive?: (id: OpeningComponentId) => void;
}

/**
 * Árvore de componentes do tipo (estilo ArchiCAD): lista vertical dos componentes que valem para a família à esquerda e,
 * à direita, o painel do componente escolhido. O que cada painel mostra vem de `openingOptionSupport(família)`.
 */
export function OpeningTypeSections({ d, onChange, family, leaves, materials, active, onActive }: OpeningTypeSectionsProps): ReactElement {
  const t = I18N[useI18n((s) => s.lang)];
  const [interno, setInterno] = useState<OpeningComponentId | undefined>(undefined);
  const visiveis = visibleComponents(d.kind, family?.id ?? null);
  const atual = componentToShow(d.kind, family?.id ?? null, active ?? interno);
  const comp = OPENING_COMPONENTS.find((c) => c.id === atual) ?? OPENING_COMPONENTS[0]!;
  const pick = (id: OpeningComponentId): void => {
    rememberComponent(id);
    setInterno(id);
    onActive?.(id);
  };
  const Panel = comp.Panel;
  return (
    <div className="op-comps">
      <select
        className="select op-nav-select"
        aria-label={t.oc_list}
        value={atual}
        onChange={(e) => pick(e.target.value as OpeningComponentId)}
      >
        {visiveis.map((c) => <option key={c.id} value={c.id}>{t[c.labelKey]}</option>)}
      </select>
      <nav className="op-nav" aria-label={t.oc_list}>
        {visiveis.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`op-nav-item${c.id === atual ? ' on' : ''}`}
            aria-current={c.id === atual ? 'true' : undefined}
            data-comp={c.id}
            onClick={() => pick(c.id)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={c.icon} /></svg>
            <span className="op-nav-name">{t[c.labelKey]}</span>
          </button>
        ))}
      </nav>
      <section className="op-panel" aria-label={t[comp.labelKey]}>
        <h3 className="op-panel-title">{t[comp.labelKey]}</h3>
        <Panel d={d} onChange={onChange} family={family} support={openingOptionSupport(family?.id)} leaves={leaves} materials={materials} />
      </section>
    </div>
  );
}
