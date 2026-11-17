import type { ReactElement } from 'react';
import type { Material } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import { MaterialPreview } from './MaterialPreview.tsx';
import type { GrupoMateriais } from './materialsLogic.ts';

interface Props {
  grupos: GrupoMateriais[];
  total: number;
  sel: string;
  q: string;
  onQ: (v: string) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  canDuplicate: boolean;
}

/** Lista à esquerda do navegador: busca, grupos por classe e miniatura esférica de cada material. */
export function MaterialList({ grupos, total, sel, q, onQ, onSelect, onAdd, onDuplicate, canDuplicate }: Props): ReactElement {
  const { t } = useT();
  const vazia = grupos.length === 0;
  return (
    <div className="mat-lista">
      <input
        id="mat-search"
        className="input wide"
        type="search"
        placeholder={t('dlt_mat_search')}
        value={q}
        onChange={(e) => onQ(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={t('dlt_mat_search')}
      />
      <div className="matlist mat-lista-itens" role="group" aria-label={t('dlt_mat_list_label')} style={{ marginTop: 6 }}>
        {vazia ? <p className="hint" style={{ padding: 8 }}>{total === 0 ? t('dlt_mat_empty_project') : t('dlt_mat_empty_search')}</p> : null}
        {grupos.map((g) => (
          <div key={g.classe ?? '__sem_classe'} role="group" aria-label={g.classe ?? t('dlt_mat_no_class')}>
            <div className="mat-grupo">{g.classe ?? t('dlt_mat_no_class')}</div>
            {g.itens.map((m: Material) => {
              const on = m.id === sel;
              return (
                <button key={m.id} className={`matitem${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onSelect(m.id)}>
                  <MaterialPreview material={m} shape="sphere" size={40} low />
                  <span className="mat-nome">{m.name}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn small" onClick={onAdd}>{t('dlt_mat_new_button')}</button>
        <button className="btn small" disabled={!canDuplicate} onClick={onDuplicate}>{t('dlt_btn_duplicate_plain')}</button>
      </div>
    </div>
  );
}
