import { useState, type ReactElement } from 'react';
import { rampQuantities, rampValidationIssues, regenRamp, resolveRampsOnLevel } from '@hestia/engine';
import { levelAbove, validateProject, type Id, type Project, type Ramp, type RampInputMode, type RampShape, type StairOpeningMode, type ValidationIssue } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { goToIssue } from '../editor/goToIssue.ts';
import { useI18n, I18N } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { adjustRamp, applyRegen, patchRamps } from '../editor/rampActions.ts';
import { commonOf } from '../editor/stairActions.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { LevelField } from './LevelField.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { rampOptions } from './typeOptions.ts';
import { rampSummaryLines } from './rampFormat.ts';
import { useAdiado } from './useAdiado.ts';

const fmt = (n: number, d = 2): string => n.toFixed(d).replace('.', ',');
const SHAPE_LABEL: Record<RampShape, string> = { straight: 'Reta', lshape: 'Em L', ushape: 'Em U', free: 'Livre' };
const TURN_LABEL: Record<'left' | 'right', string> = { left: 'À esquerda', right: 'À direita' };

/** Avisos e erros de uma rampa: os de norma e de croqui (engine) e os de referência do modelo (tipo, nível, topo). */
function issuesOf(p: Project, id: Id): ValidationIssue[] {
  return [...validateProject(p), ...rampValidationIssues(p)].filter((i) => i.elementId === id);
}

/**
 * Propriedades de uma ou mais rampas: tipo, níveis, deslocamentos e abertura da laje (editáveis), largura/inclinação/
 * comprimento (regeram o croqui em UM passo de desfazer) e resultados só leitura de uma rampa.
 */
export function RampProperties({ ramps }: { ramps: Ramp[] }): ReactElement {
  const p = useProject();
  const t = I18N[useI18n((s) => s.lang)];
  const ids = ramps.map((r) => r.id);
  const typeId = commonOf(ramps, (r) => r.typeId);
  const base = commonOf(ramps, (r) => r.baseOffset);
  const top = commonOf(ramps, (r) => r.topLevelId ?? '');
  const topOff = commonOf(ramps, (r) => r.topOffset);
  const height = commonOf(ramps, (r) => r.height);
  const openingMode = commonOf(ramps, (r) => r.openingMode);
  const openingHeadroom = commonOf(ramps, (r) => r.openingHeadroom);
  const openingMargin = commonOf(ramps, (r) => r.openingMargin);
  const openingRect = commonOf(ramps, (r) => r.openingRect);
  const mark = commonOf(ramps, (r) => r.mark);
  const comments = commonOf(ramps, (r) => r.comments);
  const single = ramps.length === 1 ? ramps[0]! : null;
  const type = typeId.mixed ? null : p.rampTypes[typeId.value];
  const noLevelAbove = single ? levelAbove(p, single.levelId) === null : false;
  const noOpening = !openingMode.mixed && openingMode.value === 'none';
  const headroomOff = !openingMode.mixed && openingMode.value !== 'headroom';
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [adjustMsg, setAdjustMsg] = useState('');

  // Resolver o nível e validar o projeto custam segundos num prédio grande: saem do clique e ficam em cache por projeto.
  const quantities =
    useAdiado(p, `rampa-quant|${single?.id ?? ''}`, () => {
      if (!single) return null;
      const rr = resolveRampsOnLevel(p, single.levelId).find((x) => x.id === single.id);
      return rr ? { rr, q: rampQuantities(rr) } : null;
    }, 150) ?? null;
  const issues = useAdiado(p, `rampa-avisos|${single?.id ?? ''}`, () => (single ? issuesOf(p, single.id) : []), 150) ?? [];

  const patch = (targets: Id[], value: Partial<Ramp>): void => patchRamps(editor.store, targets, value);

  /** Regenera o croqui com a mudança de um campo e grava os componentes em UMA transação. Erro vai para o campo. */
  const editGeometry = (field: string, changes: { width?: number; mode?: RampInputMode; slope?: number; length?: number; landingDepth?: number }): void => {
    if (!single) return;
    const r = regenRamp(single, p, changes);
    if ('error' in r) {
      setFieldErrors((e) => ({ ...e, [field]: r.error }));
      return;
    }
    setFieldErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
    applyRegen(editor.store, single.id, r);
  };

  /** Botão "Ajustar": otimiza a rampa selecionada à norma do tipo em UMA transação "Ajustar rampa". */
  const adjust = (): void => {
    if (!single) return;
    const r = adjustRamp(editor.store, single.id);
    setAdjustMsg('error' in r ? r.error : r.message);
  };

  const fieldError = (field: string): ReactElement | null => {
    const msg = fieldErrors[field];
    return msg ? <div className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 4 }}>{msg}</div> : null;
  };

  const mode = single?.inputMode ?? 'length';
  const slope = single ? (single.slopeTarget ?? type?.defaultSlope ?? 0) : 0;

  return (
    <>
      <TypeSelector
        triggerId="prop-ramptype"
        label="Tipo de rampa"
        categoryLabel={`Rampas (${ramps.length})`}
        options={rampOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'rampType', dialogArg: typeId.value })}
      />
      <Group title="Restrições">
        <LevelField ids={ids} label="Nível base" />
        <Row label="Nível de topo" htmlFor="p-rtop">
          <select id="p-rtop" className="select" value={top.mixed ? '' : top.value} onChange={(e) => patch(ids, { topLevelId: e.target.value || null })}>
            {top.mixed && <option value="">variados</option>}
            <option value="">Automático (nível acima)</option>
            {p.levels.map((l) => <option key={l.id} value={l.id}>Até {l.name}</option>)}
          </select>
        </Row>
        <Row label="Desloc. da base" htmlFor="p-rbase"><NumField id="p-rbase" value={base.value} mixed={base.mixed} onCommit={(v) => patch(ids, { baseOffset: v })} unit="m" /></Row>
        <Row label="Desloc. do topo" htmlFor="p-rtopoff"><NumField id="p-rtopoff" value={topOff.value} mixed={topOff.mixed} onCommit={(v) => patch(ids, { topOffset: v })} unit="m" /></Row>
        {!top.mixed && top.value === '' && noLevelAbove && (
          <Row label="Altura" htmlFor="p-rheight"><NumField id="p-rheight" value={height.value} mixed={height.mixed} min={0.1} onCommit={(v) => patch(ids, { height: Math.max(0.1, v) })} unit="m" /></Row>
        )}
        <Row label="Abertura da laje" htmlFor="p-ropenmode">
          <select id="p-ropenmode" className="select" value={openingMode.mixed ? '' : openingMode.value} onChange={(e) => e.target.value && patch(ids, { openingMode: e.target.value as StairOpeningMode })}>
            {openingMode.mixed && <option value="">variados</option>}
            <option value="headroom">Pé-direito livre</option>
            <option value="full">Contorno completo</option>
            <option value="none">Sem abertura</option>
          </select>
        </Row>
        <Row label="Pé-direito livre (m)" htmlFor="p-ropenh">
          <NumField
            id="p-ropenh"
            value={openingHeadroom.value}
            mixed={openingHeadroom.mixed}
            disabled={headroomOff}
            placeholder={type ? fmt(type.minHeadroom) : undefined}
            min={0}
            onCommit={(v) => patch(ids, { openingHeadroom: v })}
            onClear={() => patch(ids, { openingHeadroom: null })}
          />
        </Row>
        <Row label="Folga lateral (m)" htmlFor="p-ropenm"><NumField id="p-ropenm" value={openingMargin.value} mixed={openingMargin.mixed} disabled={noOpening} min={0} onCommit={(v) => patch(ids, { openingMargin: v })} /></Row>
        <Row label="Furo retangular" htmlFor="p-ropenrect"><Check id="p-ropenrect" checked={openingRect.value} mixed={openingRect.mixed} disabled={noOpening} onChange={(v) => patch(ids, { openingRect: v })} /></Row>
      </Group>
      <Group title="Rampa" open={!!single}>
        {single ? (
          <>
            <Row label="Modo" htmlFor="p-rmode">
              <select id="p-rmode" className="select" value={mode} onChange={(e) => editGeometry('mode', { mode: e.target.value as RampInputMode })}>
                <option value="length">{t.ramp_mode_length}</option>
                <option value="slope">{t.ramp_mode_slope}</option>
              </select>
            </Row>
            <Row label="Largura" htmlFor="p-rwidth">
              <NumField id="p-rwidth" value={quantities?.q.width ?? null} min={0.1} unit="m" onCommit={(v) => editGeometry('width', { width: v })} />
            </Row>
            {fieldError('width')}
            {mode === 'slope' ? (
              <>
                <Row label={t.ramp_prop_slope_target} htmlFor="p-rslope">
                  <NumField id="p-rslope" value={slope} scale={100} unit="%" decimals={2} min={0.1} onCommit={(v) => editGeometry('slope', { slope: v })} />
                </Row>
                {fieldError('slope')}
              </>
            ) : (
              <>
                <Row label={t.ramp_prop_path_length} htmlFor="p-rlength">
                  <NumField id="p-rlength" value={quantities?.q.pathLength ?? null} min={0.1} unit="m" onCommit={(v) => editGeometry('length', { length: v })} />
                </Row>
                {fieldError('length')}
              </>
            )}
            <Row label="Forma"><span className="val">{single.shape === 'free' ? t.ramp_shape_free : SHAPE_LABEL[single.shape]}</span></Row>
            <Row label="Giro"><span className="val">{TURN_LABEL[single.turn]}</span></Row>
            <Row label={t.ramp_adjust}>
              <button id="p-radjust" className="chiplink" title={t.ramp_adjust_title} onClick={adjust}>{t.ramp_adjust}</button>
            </Row>
            {adjustMsg && <div className="hint" role="status">{adjustMsg}</div>}
          </>
        ) : (
          <div className="hint">Selecione uma rampa para editar largura, inclinação e comprimento.</div>
        )}
      </Group>
      <Group title="Resultados" open={!!quantities}>
        {single && quantities ? (
          rampSummaryLines(quantities.rr, quantities.q).map((line) => (
            <Row key={line.label} label={line.label}><span className="val">{line.value}</span></Row>
          ))
        ) : (
          <div className="hint">{single ? 'Rampa sem geometria válida: veja os avisos.' : 'Selecione uma rampa para ver os quantitativos.'}</div>
        )}
      </Group>
      <Group title={`Avisos (${issues.length})`} open={issues.length > 0}>
        {issues.length === 0 ? (
          <div className="hint">Sem avisos.</div>
        ) : (
          issues.map((i, k) => (
            <div className="prow" key={`${i.code}-${k}`} style={{ alignItems: 'start' }}>
              <span className="lbl" style={{ color: i.severity === 'error' ? 'var(--danger, #b42318)' : undefined }}>{i.message}</span>
              <button className="chiplink" onClick={() => goToIssue(i)}>Ir para</button>
            </div>
          ))
        )}
      </Group>
      <Group title="Dados de identidade" open={false}>
        <Row label="Marca" htmlFor="p-rmk"><TextField id="p-rmk" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label="Comentários" htmlFor="p-rcm"><TextField id="p-rcm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
