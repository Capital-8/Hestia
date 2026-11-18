import { useMemo, useState, type ReactElement } from 'react';
import type { FurnitureImportedModel } from '@hestia/io';
import type { FurnitureCategory } from '@hestia/model';
import {
  FILE_UNITS,
  FURNITURE_CATEGORIES,
  initialMaterialEdits,
  scaleForTarget,
  summarizeModel,
  UNIT_FACTOR,
  UP_CHOICES,
  type FileUnit,
  type MaterialEdit,
  type UpChoice,
} from '../../editor/furniture/importModel.ts';
import { fmtNum, useT, type Dict } from '../../editor/i18n.ts';
import { NumField } from '../fields.tsx';

export const UNIT_KEY: Record<FileUnit, keyof Dict> = { m: 'fur_unit_m', cm: 'fur_unit_cm', mm: 'fur_unit_mm', in: 'fur_unit_in', ft: 'fur_unit_ft' };
export const UP_KEY: Record<UpChoice, keyof Dict> = { auto: 'fur_up_auto', y: 'fur_up_y', z: 'fur_up_z' };
const catKey = (c: FurnitureCategory): keyof Dict => `fur_cat_${c}` as keyof Dict;
const AXES: ReadonlyArray<{ axis: 0 | 1 | 2; key: keyof Dict }> = [
  { axis: 0, key: 'fur_size_w' },
  { axis: 1, key: 'fur_size_d' },
  { axis: 2, key: 'fur_size_h' },
];

/** Dados do formulário de revisão no momento de adicionar. */
export interface AddForm {
  name: string;
  unit: FileUnit;
  up: UpChoice;
  /** Multiplicadores extras por eixo final (tamanho digitado); 1 = nenhum. */
  axisScale: [number, number, number];
  edits: MaterialEdit[];
}

/** Seletores de unidade de origem e de eixo "para cima" (usados na revisão e no lote). */
export function UnitUpFields({ unit, up, onUnit, onUp }: { unit: FileUnit; up: UpChoice; onUnit: (u: FileUnit) => void; onUp: (u: UpChoice) => void }): ReactElement {
  const { t } = useT();
  return (
    <>
      <label htmlFor="fur-unit">{t('fur_unit')}</label>
      <span>
        <select id="fur-unit" value={unit} onChange={(e) => onUnit(e.target.value as FileUnit)}>
          {FILE_UNITS.map((u) => <option key={u} value={u}>{t(UNIT_KEY[u])}</option>)}
        </select>
        <span style={{ opacity: 0.65, marginLeft: 8 }}>{t('fur_unit_hint')}</span>
      </span>
      <label htmlFor="fur-up">{t('fur_up')}</label>
      <span>
        <select id="fur-up" value={up} onChange={(e) => onUp(e.target.value as UpChoice)}>
          {UP_CHOICES.map((u) => <option key={u} value={u}>{t(UP_KEY[u])}</option>)}
        </select>
        <span style={{ opacity: 0.65, marginLeft: 8 }}>{t('fur_up_hint')}</span>
      </span>
    </>
  );
}

/** Revisão do que foi lido: nome, unidade, eixo, tamanho final e materiais; "Adicionar" entrega o formulário. */
export function ReviewForm({ model, adding, onAdd }: { model: FurnitureImportedModel; adding: boolean; onAdd: (place: boolean, form: AddForm) => void }): ReactElement {
  const { t, lang } = useT();
  const [name, setName] = useState(model.name);
  const [unit, setUnit] = useState<FileUnit>('m');
  const [up, setUp] = useState<UpChoice>('auto');
  const [keep, setKeep] = useState(true);
  const [axisScale, setAxisScale] = useState<[number, number, number]>([1, 1, 1]);
  const [edits, setEdits] = useState<MaterialEdit[]>(() => initialMaterialEdits(model));
  // Dimensões com unidade e eixo, SEM o tamanho digitado: a base para recalcular a escala.
  const base = useMemo(() => summarizeModel(model, UNIT_FACTOR[unit], up), [model, unit, up]);
  const dims = base.dims.map((d, i) => d * axisScale[i]!);
  const changeUnit = (u: FileUnit): void => { setUnit(u); setAxisScale([1, 1, 1]); };
  const changeUp = (u: UpChoice): void => { setUp(u); setAxisScale([1, 1, 1]); };
  const form: AddForm = { name, unit, up, axisScale, edits };
  return (
    <div data-testid="fur-ready">
      <h4 style={{ margin: '8px 0 4px' }}>{t('fur_read_title')}</h4>
      <p style={{ margin: '0 0 8px' }} role="status">
        <b>{model.sourceFileName}</b> — {t('fur_read_summary', { vertices: fmtNum(base.vertices, 0, lang), triangles: fmtNum(base.triangles, 0, lang), parts: base.parts, textures: base.textures })}
      </p>

      {model.warnings.length > 0 ? (
        <div style={{ margin: '0 0 10px' }}>
          <b>{t('fur_warnings')}</b>
          <ul data-testid="fur-warnings" style={{ margin: '2px 0 0', paddingLeft: 18 }}>
            {model.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', alignItems: 'center', marginBottom: 10 }}>
        <label htmlFor="fur-name">{t('fur_name')}</label>
        <input id="fur-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <UnitUpFields unit={unit} up={up} onUnit={changeUnit} onUp={changeUp} />
      </div>

      <h4 style={{ margin: '8px 0 4px' }}>{t('fur_size_title')}</h4>
      <div data-testid="fur-dims" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        {AXES.map(({ axis, key }) => (
          <label key={axis} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {t(key)}
            <NumField id={`fur-size-${axis}`} value={dims[axis]!} quantity="length" min={0.001} width={90} onCommit={(v) => setAxisScale(scaleForTarget(base.dims, axis, v, keep, axisScale))} />
          </label>
        ))}
        <label>
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> {t('fur_keep_ratio')}
        </label>
        <button className="btn" disabled={axisScale.every((v) => v === 1)} onClick={() => setAxisScale([1, 1, 1])}>{t('fur_size_reset')}</button>
      </div>
      <p style={{ margin: '0 0 8px', opacity: 0.65 }}>{t('fur_size_hint')}</p>

      {model.materials.length > 0 ? (
        <>
          <h4 style={{ margin: '8px 0 4px' }}>{t('fur_materials')}</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {model.materials.map((m, i) => {
                const e = edits[i];
                if (!e) return null;
                const patch = (p: Partial<MaterialEdit>): void => setEdits((cur) => cur.map((x, k) => (k === i ? { ...x, ...p } : x)));
                const hasTex = m.textureIndex !== undefined;
                return (
                  <tr key={i}>
                    <td style={{ padding: '2px 8px 2px 0' }}>{m.name}</td>
                    <td>
                      <select aria-label={`${t('fur_mat_category')}: ${m.name}`} value={e.category} onChange={(ev) => patch({ category: ev.target.value as FurnitureCategory })}>
                        {FURNITURE_CATEGORIES.map((c) => <option key={c} value={c}>{t(catKey(c))}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="color" aria-label={`${t('fur_mat_color')}: ${m.name}`} value={e.color} onChange={(ev) => patch({ color: ev.target.value })} />
                    </td>
                    <td>
                      <label style={{ opacity: hasTex ? 1 : 0.5 }}>
                        <input type="checkbox" aria-label={`${t('fur_mat_texture')}: ${m.name}`} disabled={!hasTex} checked={hasTex && e.useEmbeddedTexture} onChange={(ev) => patch({ useEmbeddedTexture: ev.target.checked })} />
                        {' '}{t('fur_mat_texture')}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn" data-testid="fur-add" disabled={adding || !name.trim()} onClick={() => onAdd(false, form)}>{adding ? t('fur_adding') : t('fur_add')}</button>
        <button className="btn primary" data-testid="fur-add-place" disabled={adding || !name.trim()} onClick={() => onAdd(true, form)}>{t('fur_add_place')}</button>
      </div>
    </div>
  );
}
