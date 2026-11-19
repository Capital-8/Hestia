import type { ReactElement } from 'react';
import type { Material } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import type { Editar } from './materialsLogic.ts';

/**
 * Aba Aparência: cor, rugosidade, metálico e opacidade do 3D (bloco `aparencia`). A textura por imagem não é
 * implementada nesta etapa: a aba só avisa que vem em breve.
 */
export function TabAparencia({ m, editar }: { m: Material; editar: Editar }): ReactElement {
  const { t } = useT();
  const a = m.aparencia;
  // Mesmas reservas de `materialEfetivo`: cor do material, rugosidade 1 - brilho * 0.75, opacidade do material.
  const rugosidadeReserva = 1 - m.gloss * 0.75;
  return (
    <>
      <div className="field-row">
        <label htmlFor="mat-ap-cor">{t('dlt_fld_color')}</label>
        <input
          id="mat-ap-cor"
          type="color"
          value={a?.cor ?? m.color}
          onChange={(e) => editar('aparencia', ['cor'], e.target.value)}
          style={{ width: 54, height: 28, padding: 0, border: '1px solid var(--line-strong)', background: 'none' }}
        />
      </div>
      <div className="field-row">
        <label htmlFor="mat-ap-rug">{t('dlt_mat_fld_roughness')}</label>
        <input id="mat-ap-rug" type="range" min={0} max={1} step={0.05} value={a?.rugosidade ?? rugosidadeReserva} onChange={(e) => editar('aparencia', ['rugosidade'], parseFloat(e.target.value))} />
      </div>
      <div className="field-row">
        <label htmlFor="mat-ap-metal">{t('dlt_mat_fld_metal')}</label>
        <input id="mat-ap-metal" type="range" min={0} max={1} step={0.05} value={a?.metal ?? 0} onChange={(e) => editar('aparencia', ['metal'], parseFloat(e.target.value))} />
      </div>
      <div className="field-row">
        <label htmlFor="mat-ap-op">{t('dlt_fld_opacity')}</label>
        <input id="mat-ap-op" type="range" min={0.05} max={1} step={0.05} value={a?.opacidade ?? m.opacity} onChange={(e) => editar('aparencia', ['opacidade'], parseFloat(e.target.value))} />
      </div>
      <p className="hint" style={{ padding: '6px 0' }}>{t('dlt_mat_texture_soon')}</p>
    </>
  );
}
