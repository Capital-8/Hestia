import type { ReactElement } from 'react';

interface FamilyTabsProps<K extends string> {
  tabs: ReadonlyArray<{ id: K; label: string }>;
  value: K;
  onChange: (id: K) => void;
}

/** Abas do diálogo de tipo (mesmo estilo das abas da parede). */
export function FamilyTabs<K extends string>({ tabs, value, onChange }: FamilyTabsProps<K>): ReactElement {
  return (
    <div className="dtabs">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={`dtab${value === tab.id ? ' on' : ''}`} onClick={() => onChange(tab.id)}>{tab.label}</button>
      ))}
    </div>
  );
}
