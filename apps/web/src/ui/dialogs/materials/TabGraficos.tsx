import type { ReactElement } from 'react';
import type { HatchKind, Material } from '@hestia/model';
import { useT } from '../../../editor/i18n.ts';
import { Check } from '../../fields.tsx';
import { CorOpcional, PadraoSelect } from './materialsCampos.tsx';
import { padraoEfetivoPrimeiro, type Editar } from './materialsLogic.ts';

/** Aba Gráficos: sombreamento (3D), superfície (piso, forro, cobertura em planta) e corte (parede, laje em corte). */
export function TabGraficos({ m, editar }: { m: Material; editar: Editar }): ReactElement {
  const { t } = useT();
  const g = m.graficos;
  const usarRender = g?.sombreamento?.usarAparenciaRender ?? false;
  // Mesmo valor de reserva que `materialEfetivo` usa quando o bloco não existe.
  const transparenciaReserva = 1 - (usarRender ? (m.aparencia?.opacidade ?? m.opacity) : m.opacity);
  return (
    <>
      <h4 className="mat-sec">{t('dlt_mat_sec_shading')}</h4>
      <CorOpcional
        id="mat-g-sombcor"
        label={t('dlt_mat_fld_shade_color')}
        value={g?.sombreamento?.cor}
        reserva={m.color}
        onChange={(v) => editar('graficos', ['sombreamento', 'cor'], v, true)}
      />
      <div className="field-row">
        <label htmlFor="mat-g-transp">{t('dlt_mat_fld_transparency')}</label>
        <input
          id="mat-g-transp"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={g?.sombreamento?.transparencia ?? transparenciaReserva}
          onChange={(e) => editar('graficos', ['sombreamento', 'transparencia'], parseFloat(e.target.value))}
        />
      </div>
      <Check id="mat-g-usarrender" checked={usarRender} onChange={(v) => editar('graficos', ['sombreamento', 'usarAparenciaRender'], v, true)}>
        {t('dlt_mat_fld_use_render')}
      </Check>

      <Camadas chave="superficie" titulo={t('dlt_mat_sec_surface')} m={m} editar={editar} />
      <Camadas chave="corte" titulo={t('dlt_mat_sec_cut')} m={m} editar={editar} />
    </>
  );
}

/** Duas camadas (primeiro plano e plano de fundo) de uma seção: superfície ou corte. */
function Camadas({ chave, titulo, m, editar }: { chave: 'superficie' | 'corte'; titulo: string; m: Material; editar: Editar }): ReactElement {
  const { t } = useT();
  const c = m.graficos?.[chave];
  const pp = c?.primeiroPlano;
  const pf = c?.planoDeFundo;
  return (
    <>
      <h4 className="mat-sec">{titulo}</h4>
      <p className="mat-sub">{t('dlt_mat_fld_fg')}</p>
      <PadraoSelect
        id={`mat-g-${chave}-pp-padrao`}
        label={t('dlt_mat_fld_pattern')}
        value={pp?.padrao ?? padraoEfetivoPrimeiro(m)}
        onChange={(v: HatchKind) => editar('graficos', [chave, 'primeiroPlano', 'padrao'], v, true)}
      />
      <CorOpcional
        id={`mat-g-${chave}-pp-cor`}
        label={t('dlt_fld_color')}
        value={pp?.cor}
        reserva={m.color}
        onChange={(v) => editar('graficos', [chave, 'primeiroPlano', 'cor'], v, true)}
      />
      <p className="mat-sub">{t('dlt_mat_fld_bg')}</p>
      <PadraoSelect
        id={`mat-g-${chave}-pf-padrao`}
        label={t('dlt_mat_fld_pattern')}
        value={pf?.padrao ?? 'solid'}
        onChange={(v) => editar('graficos', [chave, 'planoDeFundo', 'padrao'], v, true)}
      />
      <CorOpcional
        id={`mat-g-${chave}-pf-cor`}
        label={t('dlt_fld_color')}
        value={pf?.cor}
        reserva={m.color}
        onChange={(v) => editar('graficos', [chave, 'planoDeFundo', 'cor'], v, true)}
      />
    </>
  );
}
