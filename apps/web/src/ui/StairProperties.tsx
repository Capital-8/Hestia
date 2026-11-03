import { useMemo, useState, type ReactElement } from 'react';
import type { Vec2 } from '@hestia/geom';
import { measureFreeStair, regenStairFree, resolveStairsOnLevel, stairQuantities, stairValidationIssues } from '@hestia/engine';
import { levelAbove, levelElevation, unitsOf, validateProject, type Id, type Project, type Stair, type StairOpeningMode, type StairSpiralParams, type ValidationIssue } from '@hestia/model';
import { regenSpiralComponents, regenStraightComponents, spiralInfo, spiralOfStair } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { goToIssue } from '../editor/goToIssue.ts';
import { fmtNum, t as translate, useT, type Lang } from '../editor/i18n.ts';
import { effectiveMinRiser, readLevelKeep, riserBandNote } from '../editor/levelActions.ts';
import { useUi } from '../editor/state.ts';
import { commonOf, patchStairs } from '../editor/stairActions.ts';
import { adjustStairFree, applyStairFreeRegen, patchStairFree } from '../editor/stairFreeActions.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { useAdiado } from './useAdiado.ts';
import { LevelField } from './LevelField.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { stairOptions } from './typeOptions.ts';


/** Um grau em radianos: os ângulos do caracol são guardados em rad e mostrados em graus. */
const DEG = Math.PI / 180;

/** Modo dos espelhos (decisão 0041): `auto` reajusta o croqui à altura; `fixed` mantém o croqui e avisa. */
export type RiserMode = NonNullable<Stair['riserMode']>;

/** Opções do campo "Espelhos" no idioma pedido, na ordem exibida: o automático reajusta o nº de espelhos quando o real passa do máximo. */
export function riserModeOptions(lang: Lang): ReadonlyArray<{ value: RiserMode; label: string }> {
  return [
    { value: 'auto', label: translate(lang, 'prb_opt_riser_auto') },
    { value: 'fixed', label: translate(lang, 'prb_opt_riser_fixed') },
  ];
}

/** Lista PT histórica (compatibilidade); a UI usa `riserModeOptions(lang)` para acompanhar o idioma. */
export const RISER_MODE_OPTIONS: ReadonlyArray<{ value: RiserMode; label: string }> = riserModeOptions('pt');

/** Modo dos espelhos de uma escada; ausente no projeto antigo = automático. */
export function riserModeOf(stair: Stair): RiserMode {
  return stair.riserMode ?? 'auto';
}

/** Avisos e erros de uma escada: os de norma e de croqui (engine) e os de referência do modelo (tipo, nível, topo). */
function issuesOf(p: Project, id: Id, lang: Lang): ValidationIssue[] {
  return [...validateProject(p), ...stairValidationIssues(p, lang)].filter((i) => i.elementId === id);
}

/** Trajeto editável de uma escada livre (2 pontos ou mais), ou null nas demais formas. */
export function freeStairPath(stair: Stair | null): Vec2[] | null {
  return stair?.freePath && stair.freePath.length >= 2 ? stair.freePath : null;
}

/**
 * Propriedades de uma ou mais escadas: tipo, níveis, deslocamentos e abertura da laje (editáveis), quantitativos calculados
 * (só leitura, de uma escada só) e avisos com "Ir para". Cada alteração é uma transação, com um passo de desfazer.
 */
export function StairProperties({ stairs }: { stairs: Stair[] }): ReactElement {
  const fmt = useFormat();
  const p = useProject();
  const { t, lang } = useT();
  const ids = stairs.map((s) => s.id);
  const typeId = commonOf(stairs, (s) => s.typeId);
  const base = commonOf(stairs, (s) => s.baseOffset);
  const top = commonOf(stairs, (s) => s.topLevelId ?? '');
  const topOff = commonOf(stairs, (s) => s.topOffset);
  const riserMode = commonOf(stairs, (s) => riserModeOf(s));
  const height = commonOf(stairs, (s) => s.height);
  const openingMode = commonOf(stairs, (s) => s.openingMode);
  const openingHeadroom = commonOf(stairs, (s) => s.openingHeadroom);
  const openingMargin = commonOf(stairs, (s) => s.openingMargin);
  const openingRect = commonOf(stairs, (s) => s.openingRect);
  const mark = commonOf(stairs, (s) => s.mark);
  const comments = commonOf(stairs, (s) => s.comments);
  const single = stairs.length === 1 ? stairs[0]! : null;
  const type = typeId.mixed ? null : p.stairTypes[typeId.value];
  const noLevelAbove = single ? levelAbove(p, single.levelId) === null : false;
  const noOpening = !openingMode.mixed && openingMode.value === 'none';
  const headroomOff = !openingMode.mixed && openingMode.value !== 'headroom';
  // Caracol: só para uma escada com lance `spiral` (os campos regeneram o croqui; ver `regenSpiralComponents`).
  const spiral = useMemo(() => (single ? spiralOfStair(single) : null), [single]);
  const spiralNums = useMemo(() => (single && spiral ? spiralInfo(p, single, spiral.sp) : null), [p, single, spiral]);
  // Escada livre: o grupo e os campos de edição só valem para UMA escada com trajeto.
  const freePath = freeStairPath(single);
  const freeWidth = useMemo(() => (single && freePath ? (measureFreeStair(single)?.width ?? null) : null), [single, freePath]);
  const freeInfo = useMemo(() => {
    if (!freePath || !single) return '';
    const runs = single.components.filter((c) => c.kind === 'run').length;
    const landings = single.components.length - runs;
    return t('stair_free_path_info', { n: freePath.length, r: runs, l: landings });
  }, [freePath, single, t]);
  const [adjustMsg, setAdjustMsg] = useState('');

  /** Regenera o caracol com as mudanças de um campo, em UM passo de desfazer. Erro vai para a barra de status. */
  const editSpiral = (changes: Partial<StairSpiralParams>): void => {
    if (!single || !spiral) return;
    const r = regenSpiralComponents(p, single, spiral.part, { ...spiral.sp, ...changes });
    if ('error' in r) {
      useUi.setState({ status: t('prb_msg_spiral_error', { error: r.error }) });
      return;
    }
    patchStairs(editor.store, [single.id], { components: r.components }, t('prb_undo_edit_spiral'));
  };

  // Reta gerada pela ferramenta: o nº de espelhos é editável (o piso e a altura do espelho se ajustam).
  const straightRisersEditable = single?.components.length === 1 && single.components[0]?.kind === 'run' && single.components[0].generatedBy === 'straight';

  /** Regenera a reta com outro nº de espelhos, em UM passo de desfazer. Erro vai para a barra de status. */
  const editRisers = (n: number): void => {
    if (!single) return;
    const r = regenStraightComponents(single, n, p.stairTypes[single.typeId]?.minTread ?? 0, unitsOf(p));
    if ('error' in r) {
      useUi.setState({ status: t('prb_msg_stair_error', { error: r.error }) });
      return;
    }
    patchStairs(editor.store, [single.id], { components: r.components }, t('prb_undo_edit_risers'));
  };

  // Resolver o nível e validar o projeto custam segundos num prédio grande: saem do clique e ficam em cache por projeto.
  const quantities =
    useAdiado(p, `escada-quant|${single?.id ?? ''}`, () => {
      if (!single) return null;
      const r = resolveStairsOnLevel(p, single.levelId, lang).find((x) => x.id === single.id);
      return r ? stairQuantities(r) : null;
    }, 150) ?? null;
  const issues = useAdiado(p, `escada-avisos|${single?.id ?? ''}`, () => (single ? issuesOf(p, single.id, lang) : []), 150) ?? [];

  const patch = (targets: Id[], value: Partial<Stair>): void => patchStairs(editor.store, targets, value);

  /** Campo que muda a altura: na escada livre, grava e regenera o trajeto na MESMA transação. */
  const patchHeight = (targets: Id[], value: Partial<Stair>): void => {
    if (!freePath || !single || targets.length !== 1) {
      patch(targets, value);
      return;
    }
    const r = patchStairFree(editor.store, single.id, value);
    if (r) useUi.setState({ status: t('prb_msg_stair_error', { error: r.error }) });
  };

  /** Nível base da escada livre pelo mesmo select do `LevelField`, regenerando o trajeto. */
  const changeFreeBaseLevel = (levelId: string): void => {
    if (!single || !levelId) return;
    const keep = readLevelKeep();
    const baseOffset = keep === 'elevation' ? single.baseOffset + levelElevation(p, single.levelId) - levelElevation(p, levelId) : single.baseOffset;
    patchHeight([single.id], { levelId, baseOffset });
  };

  /** Nova largura do lance da escada livre, regenerando em UM passo de desfazer. */
  const editFreeWidth = (v: number): void => {
    if (!single) return;
    const r = regenStairFree(single, p, { width: v }, lang);
    if ('error' in r) {
      useUi.setState({ status: t('prb_msg_stair_error', { error: r.error }) });
      return;
    }
    applyStairFreeRegen(editor.store, single.id, r, t('prb_undo_edit_stair'));
  };

  /** Botão "Ajustar": otimiza a escada livre à regra de Blondel do tipo em UMA transação "Ajustar escada". */
  const adjust = (): void => {
    if (!single) return;
    const r = adjustStairFree(editor.store, single.id);
    setAdjustMsg('error' in r ? t('prb_msg_stair_error', { error: r.error }) : r.message);
  };

  return (
    <>
      <TypeSelector
        triggerId="prop-stairtype"
        label={t('prb_prop_type_stair')}
        categoryLabel={t('prb_cat_stairs', { n: stairs.length })}
        options={stairOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patchHeight(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'stairType', dialogArg: typeId.value })}
      />
      <Group title={t('prb_pgrp_constraints')}>
        {freePath && single ? (
          <Row label={t('ramp_levels_base')} htmlFor="p-sbaselevel">
            <select id="p-sbaselevel" className="select" value={single.levelId} onChange={(e) => changeFreeBaseLevel(e.target.value)}>
              {p.levels.map((l) => <option key={l.id} value={l.id}>{`${l.name} · ${fmt('length', l.elevation)}`}</option>)}
            </select>
          </Row>
        ) : (
          <LevelField ids={ids} label={t('ramp_levels_base')} />
        )}
        <Row label={t('ramp_levels_top')} htmlFor="p-stop">
          <select id="p-stop" className="select" value={top.mixed ? '' : top.value} onChange={(e) => patchHeight(ids, { topLevelId: e.target.value || null })}>
            {top.mixed && <option value="">{t('prb_opt_varied')}</option>}
            <option value="">{t('ramp_levels_auto')}</option>
            {p.levels.map((l) => <option key={l.id} value={l.id}>{`${t('ramp_levels_until')} ${l.name}`}</option>)}
          </select>
        </Row>
        <Row label={t('ramp_levels_base_offset')} htmlFor="p-sbase"><NumField id="p-sbase" value={base.value} mixed={base.mixed} onCommit={(v) => patchHeight(ids, { baseOffset: v })} quantity="length" /></Row>
        <Row label={t('ramp_levels_top_offset')} htmlFor="p-stopoff"><NumField id="p-stopoff" value={topOff.value} mixed={topOff.mixed} onCommit={(v) => patchHeight(ids, { topOffset: v })} quantity="length" /></Row>
        <Row label={t('prb_fld_risers')} htmlFor="p-stair-riser-mode">
          <select
            id="p-stair-riser-mode"
            className="select"
            value={riserMode.mixed ? '' : riserMode.value}
            onChange={(e) => e.target.value && patchStairs(editor.store, ids, { riserMode: e.target.value as RiserMode }, t('prb_undo_riser_mode'))}
          >
            {riserMode.mixed && <option value="">{t('prb_opt_varied')}</option>}
            {riserModeOptions(lang).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Row>
        <div className="hint">{t('prb_msg_riser_mode_hint')}</div>
        {!top.mixed && top.value === '' && noLevelAbove && (
          <Row label={t('ramp_levels_height')} htmlFor="p-sheight"><NumField id="p-sheight" value={height.value} mixed={height.mixed} min={0.1} onCommit={(v) => patchHeight(ids, { height: Math.max(0.1, v) })} quantity="length" /></Row>
        )}
        <Row label={t('prb_fld_slab_opening')} htmlFor="p-sopenmode">
          <select id="p-sopenmode" className="select" value={openingMode.mixed ? '' : openingMode.value} onChange={(e) => e.target.value && patch(ids, { openingMode: e.target.value as StairOpeningMode })}>
            {openingMode.mixed && <option value="">{t('prb_opt_varied')}</option>}
            <option value="headroom">{t('prb_opt_headroom')}</option>
            <option value="full">{t('prb_opt_full_outline')}</option>
            <option value="none">{t('prb_opt_no_opening')}</option>
          </select>
        </Row>
        <Row label={t('prb_opt_headroom')} htmlFor="p-sopenh">
          <NumField
            id="p-sopenh"
            value={openingHeadroom.value}
            mixed={openingHeadroom.mixed}
            disabled={headroomOff}
            quantity="length"
            placeholder={type ? fmt('length', type.minHeadroom, { withUnit: false }) : undefined}
            min={0}
            onCommit={(v) => patch(ids, { openingHeadroom: v })}
            onClear={() => patch(ids, { openingHeadroom: null })}
          />
        </Row>
        <Row label={t('prb_fld_side_clearance')} htmlFor="p-sopenm"><NumField id="p-sopenm" value={openingMargin.value} mixed={openingMargin.mixed} disabled={noOpening} min={0} quantity="length" onCommit={(v) => patch(ids, { openingMargin: v })} /></Row>
        <Row label={t('prb_fld_rectangular_opening')} htmlFor="p-sopenrect"><Check id="p-sopenrect" checked={openingRect.value} mixed={openingRect.mixed} disabled={noOpening} onChange={(v) => patch(ids, { openingRect: v })} /></Row>
      </Group>
      {freePath && single && (
        <Group title={t('stair_free_group')}>
          <Row label={t('stair_free_group')} readOnly><span className="val">{freeInfo}</span></Row>
          <Row label={t('stair_free_width')} htmlFor="p-sfreewidth">
            <NumField id="p-sfreewidth" value={freeWidth} min={0.1} unit="m" onCommit={(v) => editFreeWidth(v)} /> {/* units-ok: largura livre da escada sempre em metros */}
          </Row>
          <Row label={t('stair_adjust')}>
            <button id="p-sadjust" className="chiplink" title={t('stair_adjust_title')} onClick={adjust}>{t('stair_adjust')}</button>
          </Row>
          {adjustMsg && <div className="hint" role="status">{adjustMsg}</div>}
        </Group>
      )}
      {spiral && spiralNums && (
        <Group title={t('prb_pgrp_spiral')}>
          <Row label={t('prb_fld_inner_radius')} htmlFor="p-spin">
            <NumField id="p-spin" value={spiral.sp.rInner} min={0.05} onCommit={(v) => editSpiral({ rInner: v })} quantity="length" />
          </Row>
          <Row label={t('prb_fld_outer_radius')} htmlFor="p-spout">
            <NumField id="p-spout" value={spiral.sp.rOuter} min={0.05} onCommit={(v) => editSpiral({ rOuter: v })} quantity="length" />
          </Row>
          <Row label={t('prb_fld_start_angle')} htmlFor="p-spstart">
            <NumField id="p-spstart" value={spiral.sp.startAngle} quantity="angle" onCommit={(v) => editSpiral({ startAngle: v })} />
          </Row>
          <Row label={t('prb_fld_sweep')} htmlFor="p-spsweep">
            <NumField
              id="p-spsweep"
              value={Math.abs(spiral.sp.sweep)}
              quantity="angle"
              min={30 * DEG}
              max={720 * DEG}
              onCommit={(v) => editSpiral({ sweep: (spiral.sp.sweep < 0 ? -1 : 1) * v })}
            />
          </Row>
          <Row label={t('prb_fld_direction')}><span className="val">{spiral.sp.sweep < 0 ? t('prb_opt_clockwise') : t('prb_opt_counterclockwise')}</span></Row>
          {Math.abs(spiral.sp.sweep) > 2 * Math.PI && (
            <>
              {/* units-ok: contagem sem unidade */}
              <Row label={t('prb_fld_risers_per_turn')}><span className="val">{fmtNum(Math.round(spiralNums.perTurn * 10) / 10, 1, lang)}</span></Row> {/* units-ok: contagem de espelhos, não é medida */}
              <Row label={t('prb_fld_headroom_between_turns')}><span className="val">{fmt('length', spiralNums.headroom)}</span></Row>
            </>
          )}
        </Group>
      )}
      <Group title={t('prb_pgrp_dimensions')}>
        {single && quantities ? (
          <>
            {straightRisersEditable ? (
              <Row label={t('prb_fld_riser_count')} htmlFor="p-srisers">
                <NumField id="p-srisers" value={quantities.riserCount} decimals={0} min={2} onCommit={(v) => editRisers(Math.round(v))} />
              </Row>
            ) : (
              <Row label={t('prb_fld_riser_count')}><span className="val">{quantities.riserCount}</span></Row>
            )}
            <Row label={t('prb_fld_riser_height')}><span className="val">{fmt('length', quantities.riserHeight)}</span></Row>
            {(() => {
              // Aviso curto de faixa (sem lógica nova: só compara o espelho resultante com [mínimo, máximo] do tipo).
              const band = type ? riserBandNote(quantities.riserHeight, type) : null;
              return band && !band.inside ? (
                <div className="hint" style={{ color: 'var(--warn)' }}>{t('prb_msg_riser_band', { text: band.text })}</div>
              ) : null;
            })()}
            <Row label={t('prb_fld_average_tread')}><span className="val">{fmt('length', quantities.treadMean)}</span></Row>
            <Row label={t('prb_fld_width')}><span className="val">{fmt('length', quantities.width)}</span></Row>
            <Row label={t('prb_fld_plan_area')}><span className="val">{fmt('area', quantities.planArea)}</span></Row>
            <Row label={t('ramp_prop_volume')}><span className="val">{fmt('volume', quantities.volume)}</span></Row>
          </>
        ) : (
          <div className="hint">{single ? t('prb_msg_invalid_stair_geometry') : t('prb_msg_select_stair_quantities')}</div>
        )}
      </Group>
      <Group title={t('prb_pgrp_warnings', { n: issues.length })} open={issues.length > 0}>
        {issues.length === 0 ? (
          <div className="hint">{t('prb_msg_no_warnings')}</div>
        ) : (
          issues.map((i, k) => (
            <div className="prow" key={`${i.code}-${k}`} style={{ alignItems: 'start' }}>
              <span className="lbl" style={{ color: i.severity === 'error' ? 'var(--danger, #b42318)' : undefined }}>{i.message}</span>
              <button className="chiplink" onClick={() => goToIssue(i)}>{t('prb_btn_go_to')}</button>
            </div>
          ))
        )}
      </Group>
      <Group title={t('prb_pgrp_identity')} open={false}>
        <Row label={t('prb_fld_mark')} htmlFor="p-smk"><TextField id="p-smk" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label={t('prb_fld_comments')} htmlFor="p-scm"><TextField id="p-scm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
      {type && (
        <div className="hint">
          {type.runStyle === 'monolithic' ? t('prb_msg_style_monolithic') : type.runStyle === 'post' ? t('prb_msg_style_post') : t('prb_msg_style_assembled')}{' '}
          {t('prb_msg_riser_limits', { min: fmt('length', effectiveMinRiser(type)), max: fmt('length', type.maxRiser) })}
        </div>
      )}
    </>
  );
}
