import { useState, type ReactElement } from 'react';
import type { ToolOptions } from '@hestia/tools';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { niveisOrdenados } from './massCotas.ts';
import { NumField } from './fields.tsx';

type OpcoesMassa = NonNullable<ToolOptions['mass']>;

const dizer = (m: string): void => useUi.setState({ status: m });

/** Elevação do nível atual da vista (m): a cota da base quando nenhuma foi escolhida. */
export const elevacaoAtual = (): number => editor.project.levels.find((l) => l.id === useUi.getState().levelId)?.elevation ?? 0;

/**
 * Opções de cota da massa a criar (fase B): "Cota da base" absoluta (vazia = cota do nível atual), "Cota do topo"
 * (= base + altura; editar muda a altura) e "De nível a nível" (nível inicial e final: base = elevação do inicial, altura
 * = diferença). Valem para a ferramenta Massa e para o esboço de massa. Altura ≤ 0 é recusada e o campo volta ao valor.
 */
export function MassCotasBar({ o, onChange }: { o: OpcoesMassa; onChange: (patch: Partial<OpcoesMassa>) => void }): ReactElement {
  const { t } = useT();
  const niveis = niveisOrdenados(editor.project);
  const base = o.cotaBase ?? elevacaoAtual();
  const [ini, setIni] = useState(niveis[0]?.id ?? '');
  const [fim, setFim] = useState(niveis[1]?.id ?? niveis[0]?.id ?? '');
  const aplicar = (): void => {
    const a = niveis.find((l) => l.id === ini);
    const b = niveis.find((l) => l.id === fim);
    if (!a || !b || !(b.elevation > a.elevation)) {
      dizer(t('ui_ms_niveis_invalidos'));
      return;
    }
    onChange({ cotaBase: a.elevation, altura: b.elevation - a.elevation });
  };
  return (
    <>
      <label>
        {t('ui_ms_cota_base')}
        <NumField id="opt-mass-cota-base" value={base} quantity="length" onCommit={(v) => onChange({ cotaBase: v })} />
      </label>
      <label>
        {t('ui_ms_cota_topo')}
        <NumField
          id="opt-mass-cota-topo"
          value={base + o.altura}
          quantity="length"
          onCommit={(v) => {
            if (v - base > 0) onChange({ altura: v - base });
            else dizer(t('ui_ms_altura_invalida'));
          }}
        />
      </label>
      <label>
        {t('ui_ms_nivel_ini')}
        <select id="opt-mass-nivel-ini" className="select" value={ini} onChange={(e) => setIni(e.target.value)}>{niveis.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </label>
      <label>
        {t('ui_ms_nivel_fim')}
        <select id="opt-mass-nivel-fim" className="select" value={fim} onChange={(e) => setFim(e.target.value)}>{niveis.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </label>
      <button type="button" id="opt-mass-niveis-aplicar" className="chiplink" title={t('ui_ms_niveis_titulo')} onClick={aplicar}>{t('ui_ms_niveis_aplicar')}</button>
    </>
  );
}
