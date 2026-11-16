import type { ReactElement } from 'react';
import { ALTURA_PADRAO, LADOS_MAX, LADOS_MIN, LADOS_PADRAO, MODOS_MASSA, MassTool, PERFIS_MASSA, type ModoMassa, type PerfilTipo, type ToolOptions } from '@hestia/tools';
import { editor } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { NumField } from './fields.tsx';

type OpcoesMassa = NonNullable<ToolOptions['mass']>;

/** Opções atuais da massa, com os padrões da ficha T1a para o que ainda não foi escolhido. */
export function opcoesDaMassa(o: Pick<ToolOptions, 'mass'>): OpcoesMassa {
  return { modo: 'extrusao', perfil: 'circulo', altura: ALTURA_PADRAO, lados: LADOS_PADRAO, ...o.mass };
}

/**
 * Grava um ajuste da barra (modo, perfil, altura ou lados) SEM perder o resto: a escolha vale para as próximas massas e
 * é empurrada para a ferramenta ativa (que só lê `options.mass` ao ligar). Devolve as opções novas.
 */
export function ajustarOpcoesMassa(patch: Partial<OpcoesMassa>): OpcoesMassa {
  const cur = useUi.getState().options;
  const novas = { ...opcoesDaMassa(cur), ...patch };
  useUi.setState({ options: { ...cur, mass: novas } });
  const tool = editor.activeTool;
  if (tool instanceof MassTool) {
    tool.modo = novas.modo;
    tool.perfil = novas.perfil;
    tool.altura = novas.altura;
    tool.lados = novas.lados;
  }
  return novas;
}

/**
 * Barra da ferramenta Massa (ficha U1, molde da barra do guarda-corpo): modo (extrusão, mistura, loft, bulbo), perfil
 * (círculo, elipse, polígono, livre), altura e lados do polígono (3 a 64, só com perfil polígono). O bulbo é sempre
 * círculo, então nele o perfil e os lados não se aplicam. Os ajustes sobrevivem à troca de modo.
 */
export function MassOptionsBar(): ReactElement {
  const o = opcoesDaMassa({ mass: useUi((s) => s.options.mass) });
  return <MassOptionsFields o={o} onChange={ajustarOpcoesMassa} />;
}

/** Os campos da barra, puros: as opções entram e o ajuste sai (o teste os renderiza sem o estado global). */
export function MassOptionsFields({ o, onChange }: { o: OpcoesMassa; onChange: (patch: Partial<OpcoesMassa>) => void }): ReactElement {
  const { t } = useT();
  const bulbo = o.modo === 'bulbo';
  return (
    <>
      <label>
        {t('ui_ms_opt_modo')}
        <select id="opt-mass-modo" className="select" value={o.modo} onChange={(e) => onChange({ modo: e.target.value as ModoMassa })}>
          {MODOS_MASSA.map((m) => <option key={m} value={m}>{t(`ui_ms_modo_${m}`)}</option>)}
        </select>
      </label>
      <label>
        {t('ui_ms_opt_perfil')}
        <select id="opt-mass-perfil" className="select" value={bulbo ? 'circulo' : o.perfil} disabled={bulbo} title={bulbo ? t('ui_ms_opt_bulbo_circulo') : undefined} onChange={(e) => onChange({ perfil: e.target.value as PerfilTipo })}>
          {PERFIS_MASSA.map((f) => <option key={f} value={f}>{t(`ui_ms_perfil_${f}`)}</option>)}
        </select>
      </label>
      <label>
        {t('ui_ms_opt_altura')}
        <NumField id="opt-mass-altura" value={o.altura} quantity="length" min={0.01} onCommit={(v) => onChange({ altura: v })} />
      </label>
      {!bulbo && o.perfil === 'poligono' && (
        <label>
          {t('ui_ms_opt_lados')}
          <NumField id="opt-mass-lados" value={o.lados} decimals={0} min={LADOS_MIN} max={LADOS_MAX} onCommit={(v) => onChange({ lados: Math.round(v) })} />
        </label>
      )}
    </>
  );
}
