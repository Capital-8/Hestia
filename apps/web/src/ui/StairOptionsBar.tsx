import type { ReactElement } from 'react';
import { counterText, isStairTool, STAIR_SUBMODES, type StairPrimitive, type StairSubmode, type StairTool, type StairToolOptions } from '@hestia/tools';
import { levelAbove } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { type Dict, useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { stairNote } from '../editor/stairActions.ts';
import { NumField } from './fields.tsx';

/** Aplica uma ação ao croqui em curso e repinta a barra (a ferramenta não avisa a interface sozinha). */
function act(fn: (t: StairTool) => void): void {
  const t = editor.activeTool;
  if (!isStairTool(t)) return;
  fn(t);
  editor.bump();
}

/** Muda uma opção da escada e recalcula a análise (limites, topo e altura entram no cálculo do croqui). */
export function setStairOpt(patch: Partial<StairToolOptions>): void {
  const o = useUi.getState().options;
  useUi.setState({ options: { ...o, stair: { ...o.stair, ...patch } } });
  // `refresh` mantém o traçado em curso e a fase do croqui; só a análise e a prévia mudam.
  act((t) => t.refresh());
}

const ERROR_COLOR = 'var(--danger, #b42318)';

/** Rótulo traduzido de cada método de desenho. */
const PRIMITIVE_KEY: Record<StairPrimitive, keyof Dict> = {
  line: 'pro_line',
  arc: 'pro_arc',
};

/** Rótulo traduzido de cada sub-modo do croqui. */
const SUBMODE_KEY: Record<StairSubmode, keyof Dict> = {
  limites: 'pro_stair_submode_boundary',
  espelhos: 'pro_stair_submode_riser',
  caminhada: 'pro_stair_submode_path',
  patamar: 'pro_stair_submode_landing',
  concluir: 'pro_stair_submode_finish',
};

/**
 * Barra da ferramenta Escada (croqui): tipo, sub-modos (Limites, Espelhos, Caminhada, Patamar, Concluir), método de
 * desenho (Linha, Arco ou Pegar linhas; Tab alterna linha e arco), com Corrente e Deslocamento quando se pega linhas,
 * "Distribuir N espelhos", o contador de espelhos, a 1ª mensagem do croqui e, fora da edição, nível de topo,
 * deslocamentos e altura (esta só quando não há nível acima).
 */
export function StairOptionsBar(): ReactElement | null {
  const p = useProject();
  const levelId = useUi((s) => s.levelId);
  const options = useUi((s) => s.options);
  const { t } = useT();
  const opts: StairToolOptions = options.stair ?? {};
  // Re-renderiza a cada passo do croqui (o `previewTick` muda com cada clique, tecla e ação).
  const tick = useUi((s) => s.previewTick);
  void tick;
  const tool = editor.activeTool;
  if (!isStairTool(tool)) return null;
  const st = tool.status();
  const note = stairNote(st);
  const noLevelAbove = levelAbove(p, levelId) === null;
  const topValue = opts.topLevelId ?? '';

  return (
    <>
      <div className="stair-modes" role="group" aria-label={t('pro_stair_submode_aria')} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {STAIR_SUBMODES.map((m: StairSubmode) => (
          <button key={m} className={`btn small${st.submode === m ? ' primary' : ''}`} aria-pressed={st.submode === m} onClick={() => act((tp) => tp.setSubmode(m))}>
            {t(SUBMODE_KEY[m])}
          </button>
        ))}
      </div>
      <label>
        {t('pro_type')}
        <select
          id="opt-stairtype"
          className="select"
          value={st.typeId ?? ''}
          disabled={st.editing}
          title={st.editing ? t('pro_stair_type_edit_title') : t('pro_stair_type_create_title')}
          onChange={(e) => setStairOpt({ typeId: e.target.value })}
        >
          {Object.values(p.stairTypes).map((tp) => (
            <option key={tp.id} value={tp.id}>{tp.name}</option>
          ))}
        </select>
      </label>
      <div className="stair-prim" role="group" aria-label={t('pro_stair_primitive_aria')} style={{ display: 'flex', gap: 4 }}>
        {(Object.keys(PRIMITIVE_KEY) as StairPrimitive[]).map((id) => (
          <button key={id} className={`btn small${!st.picking && st.primitive === id ? ' primary' : ''}`} aria-pressed={!st.picking && st.primitive === id} onClick={() => act((tp) => tp.setPrimitive(id))} title={t('pro_stair_tab_hint')}>
            {t(PRIMITIVE_KEY[id])}
          </button>
        ))}
        <button className={`btn small${st.picking ? ' primary' : ''}`} aria-pressed={st.picking} onClick={() => act((tp) => tp.setPick(!st.picking))} title={t('pro_stair_pick_title')}>
          {t('pro_pick_lines')}
        </button>
      </div>
      {st.picking && (
        <>
          <button className={`btn small${opts.pickChain ? ' primary' : ''}`} aria-pressed={!!opts.pickChain} onClick={() => setStairOpt({ pickChain: !opts.pickChain })} title={t('pro_pick_chain_title')}>
            {t('pro_chain')}
          </button>
          <label>
            {t('pro_offset_m')}
            <NumField id="opt-stairoffset" value={opts.pickOffset ?? 0} min={0} onCommit={(v) => setStairOpt({ pickOffset: v })} quantity="length" />
          </label>
        </>
      )}
      <label>
        {t('pro_risers')}
        <NumField id="opt-stairn" value={opts.distributeCount ?? st.desired} decimals={0} min={1} onCommit={(v) => setStairOpt({ distributeCount: Math.max(1, Math.round(v)) })} />
      </label>
      <button className="btn small" onClick={() => act((tp) => tp.distribute())} title={t('pro_distribute_risers_title')}>
        {t('pro_distribute_risers')}
      </button>
      <button className="btn small" onClick={() => act((tp) => tp.clearLayer())} title={t('pro_clear_layer_title')}>
        {t('pro_clear_layer')}
      </button>
      <span className="stair-counter" aria-live="polite" style={{ color: 'var(--fg-soft)' }}>{counterText(st)}</span>
      {note && (
        <span className="stair-note" role="status" style={{ color: note.tone === 'error' ? ERROR_COLOR : 'var(--warn, #9a6700)' }}>
          {note.text}
        </span>
      )}
      {!st.editing && (
        <>
          <label>
            {t('ramp_levels_top')}
            <select id="opt-stairtop" className="select" value={topValue} onChange={(e) => setStairOpt({ topLevelId: e.target.value || null })}>
              <option value="">{t('ramp_levels_auto')}</option>
              {p.levels.map((l) => (
                <option key={l.id} value={l.id}>{`${t('ramp_levels_until')} ${l.name}`}</option>
              ))}
            </select>
          </label>
          <label>
            {t('ramp_levels_base_offset')}
            <NumField id="opt-stairbase" value={opts.baseOffset ?? 0} onCommit={(v) => setStairOpt({ baseOffset: v })} quantity="length" />
          </label>
          <label>
            {t('ramp_levels_top_offset')}
            <NumField id="opt-stairtopoff" value={opts.topOffset ?? 0} onCommit={(v) => setStairOpt({ topOffset: v })} quantity="length" />
          </label>
          {noLevelAbove && !opts.topLevelId && (
            <label>
              {t('pro_height')}
              <NumField id="opt-stairheight" value={opts.height ?? 2.8} min={0.1} onCommit={(v) => setStairOpt({ height: v })} quantity="length" />
            </label>
          )}
        </>
      )}
      <button className="btn small primary" onClick={() => act((tp) => tp.setSubmode('concluir'))} title={t('pro_stair_finish_title')}>
        {t('pro_finish')}
      </button>
    </>
  );
}
