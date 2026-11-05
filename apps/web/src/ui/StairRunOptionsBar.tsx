import type { ReactElement } from 'react';
import { STAIR_RUN_SHAPES, stairTypeForShape, stairTypesForShape, type StairRunShape, type StairRunToolOptions } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { fmtNum, type Dict, useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { NumField } from './fields.tsx';
import { stairRunFields } from './stairRunFields.ts';

/** Dica da barra por forma: o caracol tem três cliques; as demais, dois (ou um e a digitação do ângulo). */
const HINT_KEY: Record<StairRunShape, keyof Dict> = {
  straight: 'pro_stairrun_hint_dir',
  lshape: 'pro_stairrun_hint_dir',
  ushape: 'pro_stairrun_hint_dir',
  winder: 'pro_stairrun_hint_dir',
  spiral: 'pro_stairrun_hint_spiral',
  free: 'pro_stairrun_hint_free',
};

/** Rótulo traduzido de cada forma (a livre reusa `stair_shape_free`). */
const SHAPE_KEY: Record<StairRunShape, keyof Dict> = {
  straight: 'pro_shape_line',
  lshape: 'pro_shape_l',
  ushape: 'pro_shape_u',
  winder: 'pro_shape_winder',
  spiral: 'pro_shape_spiral',
  free: 'stair_shape_free',
};

/** Raio interno padrão (m) do caracol, como em `SPIRAL_DEFAULT_INNER`. */
const INNER_DEFAULT = 0.1;

/**
 * Barra da ferramenta de escada por cliques (`stairrun`): forma (reta, L, U, leque, caracol ou livre), largura, patamar,
 * giro ou os campos do caracol (raios, varredura e sentido) e tipo. A lista de formas vem de `stairShapeOptions`, a mesma
 * do painel de Propriedades (a escada livre precisa aparecer nos dois lugares). A lista de tipos segue a forma: o caracol
 * lista os tipos caracol; as outras formas, os demais. Trocar a forma reinicia o desenho (como o modo do piso e do
 * telhado); os demais campos valem no próximo clique.
 */
export function StairRunOptionsBar(): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const options = useUi((s) => s.options);
  const o: StairRunToolOptions = options.stairRun ?? { shape: 'straight', width: 1.2, turn: 'left' };
  const set = (patch: Partial<StairRunToolOptions>): void => {
    const cur = useUi.getState().options;
    useUi.setState({ options: { ...cur, stairRun: { ...(cur.stairRun ?? o), ...patch } } });
  };
  const fields = stairRunFields(o.shape);
  const { spiral, turn: turnable, landing } = fields;
  const types = stairTypesForShape(p, o.shape);
  const typeValue = stairTypeForShape(p, o.shape, o.typeId) ?? '';
  return (
    <>
      <label>
        {t('pro_shape')}
        <select
          id="opt-stairshape"
          className="select"
          value={o.shape}
          onChange={(e) => {
            const shape = e.target.value as StairRunShape;
            // A escolha de tipo acompanha a forma: o caracol passa a usar um tipo caracol.
            set({ shape, typeId: stairTypeForShape(p, shape, o.typeId) ?? undefined });
            editor.setTool('stairrun');
          }}
        >
          {STAIR_RUN_SHAPES.map((s) => (
            <option key={s} value={s}>{t(SHAPE_KEY[s])}</option>
          ))}
        </select>
      </label>
      {fields.width && (
        <label>
          {t('pro_width')}
          <NumField id="opt-stairwidth" value={o.width} onCommit={(v) => set({ width: Math.max(0.1, v) })} quantity="length" min={0.1} />
        </label>
      )}
      {landing && (
        <label>
          {t('pro_landing_depth_short')}
          <NumField
            id="opt-stairlanding"
            value={o.landingDepth ?? null}
            placeholder={t('pro_landing_ph')}
            min={0.1}
            onCommit={(v) => set({ landingDepth: Math.max(0.1, v) })}
            onClear={() => set({ landingDepth: undefined })}
            quantity="length"
          />
        </label>
      )}
      {turnable && (
        <label>
          {t('pro_turn')}
          <select id="opt-stairturn" className="select" value={o.turn} onChange={(e) => set({ turn: e.target.value as 'left' | 'right' })}>
            <option value="left">{t('pro_turn_left')}</option>
            <option value="right">{t('pro_turn_right')}</option>
          </select>
        </label>
      )}
      {spiral && (
        <>
          <label>
            {t('pro_spiral_inner')}
            <NumField id="opt-spiralinner" value={o.spiralInner ?? INNER_DEFAULT} min={0.05} onCommit={(v) => set({ spiralInner: v })} quantity="length" />
          </label>
          <label>
            {t('pro_spiral_outer')}
            <NumField
              id="opt-spiralouter"
              value={o.spiralOuter ?? null}
              placeholder={t('pro_spiral_outer_ph', { v: fmtNum(1, 2, lang) })}
              min={0.05}
              onCommit={(v) => set({ spiralOuter: v })}
              onClear={() => set({ spiralOuter: undefined })}
              quantity="length"
            />
          </label>
          <label>
            {t('pro_spiral_sweep')}
            <NumField
              id="opt-spiralsweep"
              value={o.spiralSweep ?? null}
              placeholder={t('pro_click_ph')}
              decimals={0}
              min={30}
              max={720}
              onCommit={(v) => set({ spiralSweep: v })}
              onClear={() => set({ spiralSweep: undefined })}
            />
          </label>
          <label>
            {t('pro_spiral_sense')}
            <select id="opt-spiralsense" className="select" value={o.spiralSense ?? 'ccw'} onChange={(e) => set({ spiralSense: e.target.value as 'ccw' | 'cw' })}>
              <option value="ccw">{t('pro_ccw')}</option>
              <option value="cw">{t('pro_cw')}</option>
            </select>
          </label>
        </>
      )}
      <label>
        {t('pro_type')}
        <select id="opt-stairruntype" className="select" value={typeValue} onChange={(e) => set({ typeId: e.target.value })}>
          {types.map((tp) => (
            <option key={tp.id} value={tp.id}>{tp.name}</option>
          ))}
        </select>
      </label>
      <span className="hint">{t(HINT_KEY[o.shape])}</span>
    </>
  );
}
