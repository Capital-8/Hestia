import type { ReactElement } from 'react';
import type { CadDrawing } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { frameCad, removeCad } from '../editor/cadActions.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';

/**
 * Propriedades do CAD importado: nome, nível, visibilidade e deslocamento vertical. O desenho em si (camadas, traços e
 * textos) é somente leitura; para mover/girar, use as ferramentas de Modificar como em qualquer elemento.
 */
export function CadProps({ items }: { items: CadDrawing[] }): ReactElement {
  const { t } = useT();
  const p = useProject();
  const levelName = (levelId: string): string => p.levels.find((l) => l.id === levelId)?.name ?? levelId;
  return (
    <>
      {items.map((c) => (
        <Group key={c.id} title={c.name}>
          <Row label={t('prd_fld_name')} htmlFor={`cad-name-${c.id}`}>
            <TextField
              id={`cad-name-${c.id}`}
              value={c.name}
              onCommit={(v) => editor.store.exec({ type: 'updateCadDrawing', id: c.id, patch: { name: v || c.name } }, t('prd_undo_rename_cad'))}
            />
          </Row>
          <Row label={t('prd_fld_level')} readOnly><span className="val">{levelName(c.levelId)}</span></Row>
          <Row label={t('prd_fld_visible')}>
            <input
              type="checkbox"
              aria-label={t('prd_aria_visible_name', { name: c.name })}
              checked={c.visible !== false}
              onChange={(e) => editor.store.exec({ type: 'updateCadDrawing', id: c.id, patch: { visible: e.target.checked } }, t('prd_undo_cad_visibility'))}
            />
          </Row>
          <Row label={t('prd_fld_offset')} htmlFor={`cad-offset-${c.id}`}>
            <NumField
              id={`cad-offset-${c.id}`}
              value={c.offsetZ ?? 0}
              quantity="length"
              onCommit={(v) => editor.store.exec({ type: 'updateCadDrawing', id: c.id, patch: { offsetZ: v } }, t('prd_undo_cad_offset'))}
            />
          </Row>
          <Row label={t('prd_fld_layers')} readOnly><span className="val">{c.layers.length}</span></Row>
          <Row label={t('prd_fld_paths')} readOnly><span className="val">{c.paths.length}</span></Row>
          <Row label={t('prd_fld_texts')} readOnly><span className="val">{c.texts.length}</span></Row>
          <Row label={t('prd_fld_source_unit')} readOnly><span className="val">{c.unit}</span></Row>
          <Row label={t('prd_fld_snap')}>
            <span className="val">{t('prd_msg_snap_cad')}</span>
          </Row>
          <Row label={t('prd_fld_actions')} readOnly>
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <button className="btn small" onClick={() => frameCad(c)}>{t('prd_btn_zoom_fit')}</button>
              <button className="btn small" onClick={() => removeCad(c)}>{t('stt_delete')}</button>
            </span>
          </Row>
        </Group>
      ))}
    </>
  );
}
