import { useMemo, useState, type ReactElement } from 'react';
import { defaultTagFamilyIdOf, tagFamiliesOf, type Id } from '@hestia/model';
import { useProject } from '../../editor/controller.ts';
import { useI18n } from '../../editor/i18n.ts';
import { tagAllNotTagged, untaggedCountsByCategory } from '../../editor/tagActions.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';

interface CategorySpec {
  kind: string;
  pt: string;
  en: string;
}

const CATEGORIES: readonly CategorySpec[] = [
  { kind: 'door', pt: 'Portas', en: 'Doors' },
  { kind: 'window', pt: 'Janelas', en: 'Windows' },
  { kind: 'wall', pt: 'Paredes', en: 'Walls' },
  { kind: 'floor', pt: 'Pisos', en: 'Floors' },
  { kind: 'slab', pt: 'Lajes', en: 'Slabs' },
  { kind: 'ceiling', pt: 'Forros', en: 'Ceilings' },
  { kind: 'roof', pt: 'Telhados', en: 'Roofs' },
  { kind: 'column', pt: 'Pilares', en: 'Columns' },
  { kind: 'beam', pt: 'Vigas', en: 'Beams' },
  { kind: 'footing', pt: 'Sapatas', en: 'Footings' },
  { kind: 'stair', pt: 'Escadas', en: 'Stairs' },
  { kind: 'ramp', pt: 'Rampas', en: 'Ramps' },
  { kind: 'guardaCorpo', pt: 'Guarda-corpos', en: 'Railings' },
];

/** Diálogo "Etiquetar todos" (estilo Revit: Tag All Not Tagged): escolhe categorias e família de etiqueta por categoria. */
export function TagAllDialog(): ReactElement {
  const p = useProject();
  const { lang } = useI18n();
  const pt = lang !== 'en';
  const close = (): void => useUi.setState({ dialog: null });
  const options = useUi((s) => s.options);
  const families = useMemo(() => tagFamiliesOf(p.settings, lang), [p.settings, lang]);
  const counts = untaggedCountsByCategory();
  const defaultFam = options.tagFamilyId ?? defaultTagFamilyIdOf(p.settings);
  const openingFam = families.some((f) => f.id === 'tagfam_marca') ? 'tagfam_marca' : defaultFam;

  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of CATEGORIES) init[c.kind] = (counts[c.kind] ?? 0) > 0;
    return init;
  });

  const [familiesByCategory, setFamiliesByCategory] = useState<Record<string, Id>>(() => {
    const init: Record<string, Id> = {};
    for (const c of CATEGORIES) init[c.kind] = c.kind === 'door' || c.kind === 'window' ? openingFam : defaultFam;
    return init;
  });

  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(options.tagOrientation ?? 'horizontal');
  const [leader, setLeader] = useState(false);

  const selectedCount = CATEGORIES.reduce((sum, c) => sum + (enabled[c.kind] ? (counts[c.kind] ?? 0) : 0), 0);

  const apply = (): void => {
    const categories = new Set(CATEGORIES.filter((c) => enabled[c.kind]).map((c) => c.kind));
    tagAllNotTagged({ categories, familiesByCategory, orientation, leader });
    close();
  };

  return (
    <Dialog
      title={pt ? 'Etiquetar todos os elementos sem etiqueta' : 'Tag All Not Tagged'}
      sub={pt ? 'Escolha as categorias e a família de etiqueta para cada tipo de elemento desta vista.' : 'Choose categories and the tag family for each element type in this view.'}
      size="mid"
      onClose={close}
      onSubmit={selectedCount > 0 ? apply : undefined}
      footer={(
        <>
          <button type="button" className="btn" onClick={close}>{pt ? 'Cancelar' : 'Cancel'}</button>
          <button type="button" className="btn pri" disabled={selectedCount === 0} onClick={apply}>
            {pt ? `Aplicar (${selectedCount})` : `Apply (${selectedCount})`}
          </button>
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ maxHeight: 290, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--fg-soft)', borderBottom: '1px solid var(--line)' }}>
                <th style={{ padding: '4px 6px' }}>{pt ? 'Categoria' : 'Category'}</th>
                <th style={{ padding: '4px 6px', textAlign: 'right' }}>{pt ? 'Sem etiqueta' : 'Untagged'}</th>
                <th style={{ padding: '4px 6px' }}>{pt ? 'Família de etiqueta carregada' : 'Loaded Tag Family'}</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => {
                const count = counts[cat.kind] ?? 0;
                const checked = !!enabled[cat.kind];
                return (
                  <tr key={cat.kind} style={{ borderBottom: '1px solid var(--line-soft, var(--line))', opacity: count === 0 ? 0.55 : 1 }}>
                    <td style={{ padding: '5px 6px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: count > 0 ? 'pointer' : 'default' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={count === 0}
                          onChange={(e) => setEnabled((prev) => ({ ...prev, [cat.kind]: e.target.checked }))}
                        />
                        <span>{pt ? cat.pt : cat.en}</span>
                      </label>
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{count}</td>
                    <td style={{ padding: '5px 6px' }}>
                      <select
                        value={familiesByCategory[cat.kind] ?? defaultFam}
                        disabled={!checked || count === 0}
                        onChange={(e) => setFamiliesByCategory((prev) => ({ ...prev, [cat.kind]: e.target.value as Id }))}
                        style={{ width: '100%' }}
                      >
                        {families.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', paddingTop: 4 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span>{pt ? 'Orientação:' : 'Orientation:'}</span>
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as 'horizontal' | 'vertical')}>
              <option value="horizontal">{pt ? 'Horizontal' : 'Horizontal'}</option>
              <option value="vertical">{pt ? 'Vertical' : 'Vertical'}</option>
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={leader} onChange={(e) => setLeader(e.target.checked)} />
            <span>{pt ? 'Incluir linha de chamada (leader)' : 'Include leader'}</span>
          </label>
        </div>
      </div>
    </Dialog>
  );
}
