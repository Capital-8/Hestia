import type { ReactElement } from 'react';
import type { PerimeterModifyKind } from '@hestia/tools';
import { useT, type Dict } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { MassCotasBar } from '../MassCotasBar.tsx';
import { ajustarOpcoesMassa, opcoesDaMassa } from '../MassOptionsBar.tsx';
import { perimeterTool } from './PerimeterStatus.ts';

const MODIFY_KEY: Partial<Record<PerimeterModifyKind, keyof Dict>> = {
  trim: 'pro_pm_modify_trim', split: 'pro_pm_modify_split', offset: 'pro_pm_modify_offset', move: 'pro_pm_modify_move', copy: 'pro_pm_modify_copy',
  rotate: 'pro_pm_modify_rotate', mirror: 'pro_pm_modify_mirror', array: 'pro_pm_modify_array', align: 'pro_pm_modify_align', delete: 'pro_pm_modify_delete',
};

/**
 * Barra do esboço de MASSA: o nome da ferramenta (e do comando de Modificar ligado) e, ao criar, a altura e as cotas da base e do
 * topo (as mesmas opções da ferramenta Massa). Ao editar o contorno só vale o desenho: altura e cotas se mudam nas propriedades.
 */
export function PerimeterMassBar({ modify, editing }: { modify?: PerimeterModifyKind | null; editing: boolean }): ReactElement {
  const { t, lang } = useT();
  const o = opcoesDaMassa({ mass: useUi((s) => s.options.mass) });
  const tool = perimeterTool('mass', lang);
  const cmd = modify ? MODIFY_KEY[modify] : undefined;
  return (
    <div className="optbar" role="group" aria-label={t('pro_tool_options')}>
      <span className="tool-name">{cmd ? `${tool} · ${t(cmd)}` : tool}</span>
      {!editing && <MassCotasBar o={o} onChange={ajustarOpcoesMassa} />}
    </div>
  );
}
