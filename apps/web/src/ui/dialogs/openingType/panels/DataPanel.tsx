import type { ReactElement } from 'react';
import { NumField, TextField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { usePanelKit, type PanelProps } from './panelKit.tsx';

/** Quadro e dados: código, descrição, fabricante, desempenho (fogo, acústica, térmica) e custo. */
export function DataPanel({ d, onChange }: PanelProps): ReactElement {
  const { t } = useT();
  const { set, limpar } = usePanelKit(d, onChange);
  const setTexto = (campo: 'code' | 'description' | 'manufacturer' | 'fireRating', v: string): void => {
    set({ [campo]: v === '' ? undefined : v });
  };
  const janela = d.kind === 'window';
  return (
    <>
      <div className="field-row"><label htmlFor="ot-code">{t('col_code')}</label><TextField id="ot-code" value={d.code ?? ''} onCommit={(v) => setTexto('code', v)} /></div>
      <div className="field-row"><label htmlFor="ot-desc">{t('dlo_f_description')}</label><TextField id="ot-desc" value={d.description ?? ''} onCommit={(v) => setTexto('description', v)} /></div>
      <div className="field-row"><label htmlFor="op-manuf">{t('dlo_f_manufacturer')}</label><TextField id="op-manuf" value={d.manufacturer ?? ''} onCommit={(v) => setTexto('manufacturer', v)} /></div>
      {!janela ? (
        <div className="field-row"><label htmlFor="op-fire">{t('dlo_f_fire_rating')}</label><TextField id="op-fire" value={d.fireRating ?? ''} onCommit={(v) => setTexto('fireRating', v)} /></div>
      ) : null}
      <div className="field-row"><label htmlFor="op-rw">Rw (dB)</label><NumField id="op-rw" value={d.acousticRw ?? null} decimals={0} onCommit={(v) => set({ acousticRw: v })} onClear={() => limpar('acousticRw')} /></div>
      {janela ? (
        <>
          {/* units-ok: unidade técnica fixa de transmitância (não é medida do projeto) */}
          <div className="field-row"><label htmlFor="op-u">U (W/m²K)</label><NumField id="op-u" value={d.uValue ?? null} decimals={2} onCommit={(v) => set({ uValue: v })} onClear={() => limpar('uValue')} /></div>
          <div className="field-row"><label htmlFor="op-solar">{t('dlo_f_solar_factor')}</label><NumField id="op-solar" value={d.solarFactor ?? null} decimals={2} onCommit={(v) => set({ solarFactor: v })} onClear={() => limpar('solarFactor')} /></div>
        </>
      ) : null}
      <div className="field-row"><label htmlFor="op-cost">{t('dlo_f_cost')}</label><NumField id="op-cost" value={d.cost ?? null} quantity="currency" onCommit={(v) => set({ cost: v })} onClear={() => limpar('cost')} /></div>
    </>
  );
}
