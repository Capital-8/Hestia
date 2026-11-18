import type { ReactElement } from 'react';
import type { Command, Furniture, FurnitureCategory, FurnitureQuality } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { SeletorEstavel } from './SeletorEstavel.tsx';
import { useUi } from '../editor/state.ts';
import { startPlacing } from '../editor/furniture/actions.ts';
import { FURNITURE_CATEGORIES } from '../editor/furniture/importModel.ts';
import { fmtNum, useT, type Dict } from '../editor/i18n.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';

const DEG = 180 / Math.PI;
type FurniturePatch = Extract<Command, { type: 'updateFurniture' }>['patch'];
const catKey = (c: FurnitureCategory): keyof Dict => `fur_cat_${c}` as keyof Dict;

/**
 * Propriedades do móvel importado: posição, rotação, escala, espelho, nome e qualidade da vista (uma entrada de desfazer
 * por edição, `updateFurniture`); materiais do bloco (`setFurnitureMaterial`); excluir a cópia ou o bloco sem uso.
 */
export function FurnitureProps({ items }: { items: Furniture[] }): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const one = items.length === 1 ? items[0]! : null;
  const first = items[0]!;
  const asset = p.furniture?.assets[first.assetId];
  const sameAsset = items.every((f) => f.assetId === first.assetId);
  const patch = (pt: FurniturePatch): void => {
    editor.store.transaction(t('fur_p_group'), () => {
      for (const f of items) editor.store.exec({ type: 'updateFurniture', id: f.id, patch: pt });
    });
  };
  const common = <K extends keyof Furniture>(k: K): { value: Furniture[K]; mixed: boolean } => ({ value: first[k], mixed: items.some((f) => f[k] !== first[k]) });
  const remove = (): void => {
    editor.store.exec({ type: 'deleteElements', ids: items.map((f) => f.id) });
    useUi.setState({ selection: [] });
  };
  const dims = asset ? [asset.bbox.max[0] - asset.bbox.min[0], asset.bbox.max[1] - asset.bbox.min[1], asset.bbox.max[2] - asset.bbox.min[2]] : null;

  return (
    <>
      <Group title={t('fur_p_group')} stateKey="furniture">
        {one ? (
          <Row label={t('fur_p_name')} htmlFor="fu-name">
            <TextField id="fu-name" value={one.name} onCommit={(v) => v && v !== one.name && patch({ name: v })} />
          </Row>
        ) : null}
        <Row label={t('fur_p_asset')} readOnly><span className="val">{sameAsset ? asset?.name ?? first.assetId : '—'}</span></Row>
        {dims && sameAsset ? (
          <Row label={t('fur_p_dims')} readOnly>
            <span className="val">{dims.map((d) => fmtNum(d * (one?.scale ?? first.scale), 2, lang)).join(' × ')} m</span>
          </Row>
        ) : null}
        {one ? (
          <>
            <Row label={t('fur_p_x')} htmlFor="fu-x"><NumField id="fu-x" value={one.x} quantity="length" onCommit={(v) => patch({ x: v })} /></Row>
            <Row label={t('fur_p_y')} htmlFor="fu-y"><NumField id="fu-y" value={one.y} quantity="length" onCommit={(v) => patch({ y: v })} /></Row>
            <Row label={t('fur_p_z')} htmlFor="fu-z"><NumField id="fu-z" value={one.z} quantity="length" onCommit={(v) => patch({ z: v })} /></Row>
          </>
        ) : null}
        <Row label={t('fur_p_rot')} htmlFor="fu-rot">
          {/* units-ok: ângulo em graus, não é medida de comprimento do projeto */}
          <NumField id="fu-rot" value={common('rotation').value * DEG} unit="°" mixed={common('rotation').mixed} onCommit={(v) => patch({ rotation: v / DEG })} />
        </Row>
        <Row label={t('fur_p_scale')} htmlFor="fu-scale">
          <NumField id="fu-scale" value={common('scale').value} mixed={common('scale').mixed} min={0.001} decimals={3} onCommit={(v) => v > 0 && patch({ scale: v })} />
        </Row>
        <Row label={t('fur_p_mirror')}>
          <Check id="fu-mirror" checked={first.mirrored} mixed={common('mirrored').mixed} onChange={(v) => patch({ mirrored: v })} />
        </Row>
        <Row label={t('fur_p_quality')} htmlFor="fu-quality">
          <SeletorEstavel
            id="fu-quality"
            value={first.quality ?? 'leve'}
            opcoes={[{ valor: 'leve', rotulo: t('fur_q_leve') }, { valor: 'completo', rotulo: t('fur_q_completo') }]}
            onChange={(v) => patch({ quality: v as FurnitureQuality })}
          />
        </Row>
        <div className="prow">
          <span />
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {sameAsset ? <button className="btn small" onClick={() => startPlacing(first.assetId)}>{t('fur_p_place_more')}</button> : null}
            <button className="btn small" onClick={remove}>{t('fur_p_delete')}</button>
          </span>
        </div>
      </Group>

      {asset && sameAsset ? (
        <Group title={t('fur_p_materials')} stateKey="furniture-materials">
          {asset.materials.map((m, i) => (
            <div key={m.id} className="prow" style={{ flexWrap: 'wrap', gap: 6 }}>
              <span title={m.name} style={{ flex: '1 1 100%' }}>{m.name}</span>
              <SeletorEstavel
                ariaLabel={`${t('fur_mat_category')}: ${m.name}`}
                value={m.category}
                opcoes={FURNITURE_CATEGORIES.map((c) => ({ valor: c, rotulo: t(catKey(c)) }))}
                onChange={(v) => editor.store.exec({ type: 'setFurnitureMaterial', assetId: asset.id, materialId: m.id, patch: { category: v as FurnitureCategory } })}
              />
              <input
                type="color"
                id={`fu-mat-color-${i}`}
                aria-label={`${t('fur_mat_color')}: ${m.name}`}
                value={m.color}
                onChange={(e) => editor.store.exec({ type: 'setFurnitureMaterial', assetId: asset.id, materialId: m.id, patch: { color: e.target.value } })}
              />
              <label style={{ opacity: m.textureIndex !== undefined ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  aria-label={`${t('fur_mat_texture')}: ${m.name}`}
                  disabled={m.textureIndex === undefined}
                  checked={m.textureIndex !== undefined && m.useEmbeddedTexture}
                  onChange={(e) => editor.store.exec({ type: 'setFurnitureMaterial', assetId: asset.id, materialId: m.id, patch: { useEmbeddedTexture: e.target.checked } })}
                />
                {' '}{t('fur_mat_texture')}
              </label>
            </div>
          ))}
        </Group>
      ) : null}
    </>
  );
}
