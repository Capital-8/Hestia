/* eslint-disable max-lines */
import { useMemo, useState, type ReactElement } from 'react';
import { joinStatus, levelFrames, quantifyLevel, viewRangeWarnings } from '@hestia/engine';
import {
  FUNCTION_LABEL,
  isCad,
  isFloor,
  isGeneric,
  isOpening,
  isRamp,
  isRoof,
  isRoom,
  isSlab,
  isCeiling,
  isStair,
  isWall,
  type DetailLevel,
  type JoinKind,
  openingHeight,
  openingSill,
  totalThickness,
  viewRangeOf,
  wallLength,
  wallType,
  type Id,
  type LocationLine,
  type Opening,
  type ViewRange,
  type Wall,
  wallArc,
} from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { editViewRange, restoreViewRangeDefault } from '../editor/viewRangeActions.ts';
import { setGridStep, setRoofProjection, setSnap, useUi } from '../editor/state.ts';
import { avisoSemNivelAcima, proximoNivelAcima, setBaseNoPiso, setTopoNoPiso } from '../editor/wallFloorActions.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { AnnotationProps, selectedNote } from './AnnotationProps.tsx';
import { SectionViewProps, selectedView } from './SectionViewProps.tsx';
import { LevelGraphicsGroup, SectionGraphicsGroup, View3DGroup } from './GraphicsProps.tsx';
import { LevelField } from './LevelField.tsx';
import { LevelProps } from './LevelProps.tsx';
import { UnderlayRow } from './ViewOptionRows.tsx';
import { LOCATION_LABEL } from './OptionsBar.tsx';
import { ProfileRow } from './ProfileRow.tsx';
import { FloorProperties } from './FloorProperties.tsx';
import { RoofProperties } from './RoofProperties.tsx';
import { SlabProperties } from './SlabProperties.tsx';
import { useAdiado } from './useAdiado.ts';
import { CeilingProperties } from './CeilingProperties.tsx';
import { StairProperties } from './StairProperties.tsx';
import { RampProperties } from './RampProperties.tsx';
import { RoomProperties } from './RoomProperties.tsx';
import { AreaProfileGroups, activeAreaPlan } from './AreaPlanProperties.tsx';
import { GenericProps, selectionLabel } from './GenericProps.tsx';
import { CadProps } from './CadProps.tsx';
import { GridProperties } from './GridProperties.tsx';
import { gradeDaSelecao } from './gridUi.ts';
import { LabelScroll } from './LabelScroll.tsx';
import { PanelHead } from './PanelHead.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { openingOptions, wallOptions } from './typeOptions.ts';
import { ToolTypeProps, isToolTypeKind } from './ToolTypeProps.tsx';
import { changeOpeningType } from '../editor/openingTypeActions.ts';
import { hasPlacementProperties, PlacementProperties } from './PlacementProperties.tsx';
import { TOOL_LABEL } from '@hestia/tools';
import { usePerimeter } from '../editor/perimeter.ts';
import { PerimeterEdgePanel } from './perimeter/PerimeterEdgePanel.tsx';
import { PERIMETER_TITLE } from './perimeter/PerimeterStatus.ts';



function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Wall> | Partial<Opening>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

const JOIN_LABEL: Record<JoinKind, string> = { butt: 'Encosto', miter: 'Esquadria' };

function JoinRows({ wall }: { wall: Wall }): ReactElement {
  const p = useProject();
  const frames = useMemo(() => levelFrames(p, wall.levelId), [p, wall.levelId]);
  const tol = p.settings.joinTolerance;
  const rows = (['a', 'b'] as const).map((end) => {
    const st = joinStatus(frames, wall.id, end, tol);
    const label = end === 'a' ? 'Início' : 'Fim';
    if (st.kind === 'pair') {
      const partner = p.elements[st.partners[0]!.wallId];
      const partnerEnd = st.partners[0]!.end;
      const firstIsMe = !isWall(partner) || wall.order <= partner.order;
      const src = firstIsMe ? wall : partner;
      const srcEnd = firstIsMe ? end : partnerEnd;
      const cfg = srcEnd === 'a' ? src.joinStart : src.joinEnd;
      const ends = [{ wallId: wall.id, end }, ...st.partners];
      const set = (kind: JoinKind, flip: boolean): void => editor.store.exec({ type: 'setJoin', ends, config: { kind, flip } });
      return (
        <div key={end}>
          <Row label={`${label}: junção`} htmlFor={`p-join-${end}`}>
            <select id={`p-join-${end}`} className="select" value={cfg.kind} onChange={(e) => set(e.target.value as JoinKind, cfg.flip)}>
              {(Object.keys(JOIN_LABEL) as JoinKind[]).map((k) => <option key={k} value={k}>{JOIN_LABEL[k]}</option>)}
            </select>
          </Row>
          {cfg.kind !== 'miter' && (
            <Row label="Inverter ordem"><Check id={`p-joinflip-${end}`} checked={cfg.flip} onChange={(v) => set(cfg.kind, v)} /></Row>
          )}
        </div>
      );
    }
    const text = st.kind === 'free' ? 'Livre' : st.kind === 'disallowed' ? 'Não unido' : st.kind === 'tee' ? 'Em T (encosto fixo)' : `Nó com ${st.partners.length + 1} paredes`;
    return <Row key={end} label={`${label}: junção`}><span className="val soft">{text}</span></Row>;
  });
  return <>{rows}</>;
}

function WallProps({ walls }: { walls: Wall[] }): ReactElement {
  const fmt = useFormat(); const p = useProject();
  const ids = walls.map((w) => w.id);
  const typeId = common(walls, (w) => w.typeId);
  const base = common(walls, (w) => w.baseOffset);
  const top = common(walls, (w) => w.topLevelId ?? '');
  const height = common(walls, (w) => w.height);
  const topOff = common(walls, (w) => w.topOffset);
  const attachRoof = common(walls, (w) => w.attachTopToRoof ?? false);
  const attachBottom = common(walls, (w) => w.attachBottomToFloor ?? false);
  const attachTopFloor = common(walls, (w) => w.attachTopToFloor ?? false);
  const baseLigada = attachBottom.value && !attachBottom.mixed;
  const topoLigado = attachTopFloor.value && !attachTopFloor.mixed;
  const semNivelAcima = walls.some((w) => !w.topLevelId && !proximoNivelAcima(p, w.levelId));
  const loc = common(walls, (w) => w.locationLine);
  const flipped = common(walls, (w) => w.flipped);
  const noS = common(walls, (w) => w.noJoinStart);
  const noE = common(walls, (w) => w.noJoinEnd);
  const sag = common(walls, (w) => w.sag);
  const mark = common(walls, (w) => w.mark);
  const comments = common(walls, (w) => w.comments);
  const single = walls.length === 1 ? walls[0]! : null;
  const t = single ? wallType(p, single) : null;
  // Quantitativos do nível inteiro (cortes entre paredes): custam mais de 1 s num pavimento grande; saem do clique e ficam em cache.
  const doNivel = useAdiado(p, `quant-paredes|${single?.levelId ?? ''}`, () => (single ? quantifyLevel(p, editor.resolved(single.levelId)).walls : []), 400);
  const q = single ? (doNivel?.find((x) => x.wallId === single.id) ?? null) : null;

  return (
    <>
      <TypeSelector
        triggerId="prop-walltype"
        label="Tipo de parede"
        categoryLabel={`Paredes (${walls.length})`}
        options={wallOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'wallType', dialogArg: typeId.value })}
      />
      <Group title="Restrições">
        <LevelField ids={ids} label="Nível base" />
        <Row label="Desloc. da base" htmlFor="p-base"><NumField id="p-base" value={base.value} mixed={base.mixed} onCommit={(v) => patch(ids, { baseOffset: v })} quantity="length" /></Row>
        <Row label="Nível superior" htmlFor="p-top">
          <select id="p-top" className="select" value={top.mixed ? '' : top.value} onChange={(e) => patch(ids, { topLevelId: e.target.value || null })}>
            {top.mixed && <option value="">variados</option>}
            <option value="">Não vinculado</option>
            {p.levels.map((l) => <option key={l.id} value={l.id}>Até {l.name}</option>)}
          </select>
        </Row>
        {!top.mixed && top.value === '' ? (
          <Row label="Altura" htmlFor="p-height"><NumField id="p-height" value={height.value} mixed={height.mixed} onCommit={(v) => patch(ids, { height: Math.max(0.1, v) })} quantity="length" /></Row>
        ) : (
          <Row label="Desloc. do topo" htmlFor="p-topoff"><NumField id="p-topoff" value={topOff.value} mixed={topOff.mixed} onCommit={(v) => patch(ids, { topOffset: v })} quantity="length" /></Row>
        )}
        <Row label="Topo no telhado"><Check id="p-attachroof" checked={attachRoof.value} mixed={attachRoof.mixed} onChange={(v) => patch(ids, { attachTopToRoof: v })} /></Row>
        <Row label="Base no piso"><button id="p-base-piso" className="btn small" onClick={() => setBaseNoPiso(editor.store, ids, !baseLigada)}>{baseLigada ? 'Desanexar' : 'Anexar'}</button></Row>
        <Row label="Topo no piso"><button id="p-topo-piso" className="btn small" disabled={!topoLigado && semNivelAcima} onClick={() => { const sem = setTopoNoPiso(editor.store, ids, !topoLigado); if (sem.length) avisoSemNivelAcima(sem); }}>{topoLigado ? 'Desanexar' : 'Anexar'}</button></Row>
        {topoLigado && (
          <Row label="Nível do topo" htmlFor="p-topo-nivel">
            <select id="p-topo-nivel" className="select" value={top.mixed ? '' : top.value} onChange={(e) => e.target.value && patch(ids, { topLevelId: e.target.value })}>
              {top.mixed && <option value="">variados</option>}
              {p.levels.map((l) => <option key={l.id} value={l.id}>Até {l.name}</option>)}
            </select>
          </Row>
        )}
        <ProfileRow key={ids.join(',')} walls={walls} />
        <Row label="Linha de localização" htmlFor="p-loc">
          <select id="p-loc" className="select" value={loc.mixed ? '' : loc.value} onChange={(e) => e.target.value && patch(ids, { locationLine: e.target.value as LocationLine })}>
            {loc.mixed && <option value="">variados</option>}
            {(Object.keys(LOCATION_LABEL) as LocationLine[]).map((k) => <option key={k} value={k}>{LOCATION_LABEL[k]}</option>)}
          </select>
        </Row>
        <Row label="Flecha do arco" htmlFor="p-sag"><NumField id="p-sag" value={sag.value} mixed={sag.mixed} onCommit={(v) => patch(ids, { sag: v })} quantity="length" /></Row>
        <Row label="Inverter lado externo"><Check id="p-flip" checked={flipped.value} mixed={flipped.mixed} onChange={(v) => patch(ids, { flipped: v })} /></Row>
        <Row label="Não unir no início"><Check id="p-nos" checked={noS.value} mixed={noS.mixed} onChange={(v) => patch(ids, { noJoinStart: v })} /></Row>
        <Row label="Não unir no fim"><Check id="p-noe" checked={noE.value} mixed={noE.mixed} onChange={(v) => patch(ids, { noJoinEnd: v })} /></Row>
      </Group>
      <Group title="Construção" open={false}>
        {t ? (
          <>
            <Row label="Espessura total" readOnly fromType><span className="val">{fmt('smallLength', totalThickness(t))}</span></Row>
            {t.layers.map((l, i) => (
              <div className="prow ro" key={i}>
                <span className="lbl" title={FUNCTION_LABEL[l.function]}>{FUNCTION_LABEL[l.function]}</span>
                <span className="val soft" title={p.materials[l.materialId]?.name}>{fmt('smallLength', l.thickness)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="hint">Selecione uma única parede para ver as camadas.</div>
        )}
      </Group>
      <Group title="Dimensões" open={!!single}>
        {single ? (
          <>
            <Row label="Comprimento"><span className="val">{fmt('length', wallLength(single))}</span></Row>
            {wallArc(single) && <Row label="Raio do eixo"><span className="val">{fmt('length', wallArc(single)!.radius)}</span></Row>}
            <Row label="Área líquida"><span className="val">{fmt('area', q?.netFaceArea ?? 0)}</span></Row>
            <Row label="Volume"><span className="val">{fmt('volume', q?.volume ?? 0)}</span></Row>
          </>
        ) : (
          <Row label="Comprimento total"><span className="val">{fmt('length', walls.reduce((s, w) => s + wallLength(w), 0))}</span></Row>
        )}
      </Group>
      {single && (
        <Group title="Junções">
          <JoinRows wall={single} />
        </Group>
      )}
      <Group title="Dados de identidade" open={false}>
        <Row label="Marca" htmlFor="p-mark"><TextField id="p-mark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label="Comentários" htmlFor="p-comm"><TextField id="p-comm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}

function OpeningProps({ items }: { items: Opening[] }): ReactElement {
  const fmt = useFormat(); const p = useProject();
  const ids = items.map((o) => o.id);
  const kinds = new Set(items.map((o) => o.kind));
  const kind = kinds.size === 1 ? items[0]!.kind : null;
  const typeId = common(items, (o) => o.typeId);
  const single = items.length === 1 ? items[0]! : null;
  const type = single ? p.openingTypes[single.typeId] : null;
  const host = single ? p.elements[single.hostId] : null;
  const hand = common(items, (o) => o.flipHand);
  const facing = common(items, (o) => o.flipFacing);
  const mark = common(items, (o) => o.mark);
  return (
    <>
      <TypeSelector
        triggerId="prop-opentype"
        label="Tipo de abertura"
        categoryLabel={`${kind === 'door' ? 'Portas' : kind === 'window' ? 'Janelas' : 'Aberturas'} (${items.length})`}
        options={kind ? openingOptions(p, kind) : []}
        favoriteIds={p.settings.favoriteOpeningTypes ?? []}
        selectedId={typeId.mixed ? null : typeId.value}
        disabled={!kind}
        editDisabled={typeId.mixed}
        onSelect={(id) => changeOpeningType(editor.store, ids, id, (m) => useUi.setState({ status: m }))}
        onEdit={() => useUi.setState({ dialog: 'openingType', dialogArg: typeId.value })}
      />
      <Group title="Restrições">
        {single && (
          <>
            <Row label="Distância ao início" htmlFor="p-off"><NumField id="p-off" value={single.offset} onCommit={(v) => patch(ids, { offset: v })} quantity="length" /></Row>
            <Row label="Peitoril" htmlFor="p-sill">
              <NumField id="p-sill" value={type ? openingSill(type, single) : 0} onCommit={(v) => patch(ids, { sillOverride: v })} quantity="length" min={0} onInvalid={() => useUi.setState({ status: 'Peitoril inválido: digite um número, como 0,90.' })} onValid={() => { if (useUi.getState().status.startsWith('Peitoril inválido')) useUi.setState({ status: 'Pronto.' }); }} />
            </Row>
            {single.sillOverride !== null && (
              <div className="prow"><span /><button className="chiplink" onClick={() => patch(ids, { sillOverride: null })}>Usar peitoril do tipo</button></div>
            )}
            <Row label="Altura do vão" htmlFor="p-height">
              <NumField id="p-height" value={type ? openingHeight(type, single) : 0} onCommit={(v) => patch(ids, { heightOverride: v })} quantity="length" min={0.1} onInvalid={() => useUi.setState({ status: 'Altura inválida: digite um número, como 1,20.' })} onValid={() => { if (useUi.getState().status.startsWith('Altura inválida')) useUi.setState({ status: 'Pronto.' }); }} />
            </Row>
            {typeof single.heightOverride === 'number' && (
              <div className="prow"><span /><button className="chiplink" onClick={() => patch(ids, { heightOverride: null })}>Usar altura do tipo</button></div>
            )}
          </>
        )}
        <Row label="Inverter dobradiça" htmlFor="p-hand"><Check id="p-hand" checked={hand.value} mixed={hand.mixed} onChange={(v) => patch(ids, { flipHand: v })} /></Row>
        <Row label="Inverter sentido" htmlFor="p-facing"><Check id="p-facing" checked={facing.value} mixed={facing.mixed} onChange={(v) => patch(ids, { flipFacing: v })} /></Row>
      </Group>
      <Group title="Dimensões" open={!!single}>
        {type && single && (
          <>
            <Row label="Largura" readOnly fromType><span className="val">{fmt('length', type.width)}</span></Row>
            <Row label="Altura" readOnly fromType={single.heightOverride == null}><span className="val">{fmt('length', openingHeight(type, single))}</span></Row>
            <Row label="Anfitriã" readOnly><span className="val soft">{host && isWall(host) ? p.wallTypes[host.typeId]?.name ?? '' : ''}</span></Row>
          </>
        )}
      </Group>
      <Group title="Dados de identidade" open={false}>
        <Row label="Marca" htmlFor="p-omark"><TextField id="p-omark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
      </Group>
    </>
  );
}

/**
 * Intervalo de vista do nível ativo (decisão 0013 §5): cotas relativas ao nível, direção, restaurar padrão e avisos.
 * Cada edição é um comando; se o comando recusar (ordem topo ≥ corte ≥ base ≥ profundidade), a mensagem aparece e nada é gravado.
 * Keyed por nível na chamada: trocar de nível zera a mensagem de erro.
 */
function ViewRangeGroup({ levelId }: { levelId: Id }): ReactElement {
  const p = useProject();
  const range = viewRangeOf(p, levelId);
  // Classificar o nível resolve pisos, lajes e telhados do projeto: fica fora do clique e em cache por projeto.
  const warnings = useAdiado(p, `avisos-vista|${levelId}|${JSON.stringify(range)}`, () => viewRangeWarnings(p, levelId, range)) ?? [];
  const [error, setError] = useState<string | null>(null);
  const edit = (patch: Partial<ViewRange>): void => setError(editViewRange(editor.store, levelId, patch).error);
  return (
    <Group title="Intervalo de vista">
      <Row label="Topo" htmlFor="vr-top"><NumField id="vr-top" value={range.top} quantity="length" onCommit={(v) => edit({ top: v })} /></Row>
      <Row label="Plano de corte" htmlFor="vr-cut"><NumField id="vr-cut" value={range.cut} quantity="length" onCommit={(v) => edit({ cut: v })} /></Row>
      <Row label="Base" htmlFor="vr-bottom"><NumField id="vr-bottom" value={range.bottom} quantity="length" onCommit={(v) => edit({ bottom: v })} /></Row>
      <Row label="Profundidade" htmlFor="vr-depth"><NumField id="vr-depth" value={range.depth} quantity="length" onCommit={(v) => edit({ depth: v })} /></Row>
      <Row label="Direção da vista" htmlFor="vr-dir">
        <select id="vr-dir" className="select" value={range.direction} onChange={(e) => edit({ direction: e.target.value as ViewRange['direction'] })}>
          <option value="down">Para baixo</option>
          <option value="up">Para cima (planta de forro)</option>
        </select>
      </Row>
      {error && <div className="vr-error" role="alert">{error}</div>}
      <div className="prow"><span /><button className="btn small" onClick={() => setError(restoreViewRangeDefault(editor.store, levelId).error)}>Restaurar intervalo padrão</button></div>
      {warnings.length === 0 ? (
        <div className="hint">Nenhum elemento fora do intervalo de vista.</div>
      ) : (
        warnings.map((w) => (
          <div className="prow" key={`${w.category}-${w.kind}`}>
            <span className="vr-msg">{w.message}</span>
            {/* Seleciona os elementos afetados (mesmo nível da vista). Os ocultos não são desenhados: aparecem só nas propriedades. */}
            <button className="chiplink" onClick={() => useUi.setState({ selection: w.ids })}>Selecionar</button>
          </div>
        ))
      )}
    </Group>
  );
}

function ViewProps(): ReactElement {
  const fmt = useFormat(); const p = useProject();
  const s = useUi();
  const lvl = p.levels.find((l) => l.id === s.levelId);
  const section = s.view === 'section' ? p.views.find((v) => v.id === s.sectionId) : undefined;
  // A planta de cobertura mostra as mesmas propriedades da de piso do nível; só o nome do tipo muda.
  const roof = s.view === 'plan' && s.planKind === 'roof';
  const areaPlan = s.view === 'plan' && s.planKind === 'area' ? activeAreaPlan(p, s.areaPlanId) : undefined;
  const title = s.view === 'plan' ? areaPlan ? `${areaPlan.name} · ${lvl?.name ?? ''}` : `${roof ? 'Planta de cobertura' : 'Planta'} · ${lvl?.name ?? ''}` : s.view === 'section' ? `${section?.kind === 'elevation' ? 'Elevação' : 'Corte'} · ${section?.name ?? ''}` : 'Modelo 3D';
  const kindLabel = s.view === 'plan' ? (areaPlan ? 'Planta de área' : roof ? 'Planta de cobertura' : 'Planta de piso') : s.view === 'section' ? (section?.kind === 'elevation' ? 'Elevação' : 'Corte') : 'Modelo 3D';
  return (
    <>
      <div className="rv-stick">
        <div className="rv-head"><b>{kindLabel}</b><span>{title}</span></div>
      </div>
      <Group title="Vista">
        <Row label="Nível" htmlFor="v-level">
          <select id="v-level" className="select" value={s.levelId} onChange={(e) => editor.selectLevel(e.target.value, s.planKind)}>
            {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Row>
        <Row label="Elevação"><span className="val">{fmt('length', lvl?.elevation ?? 0)}</span></Row>
        <Row label="Grade"><Check id="v-grid" checked={s.showGrid} onChange={(v) => setSnap({ grid: v })} /></Row>
        <Row label="Intervalo da grade" htmlFor="v-grid-step">
          <select id="v-grid-step" className="select" value={String(s.gridStep)} onChange={(e) => setGridStep(Number(e.target.value))}>
            <option value="0">Automático</option>
            {GRID_STEPS.map((g) => <option key={g} value={String(g)}>{fmt('length', g)}</option>)}
          </select>
        </Row>
        <Row label="Subpavimento"><Check id="v-under" checked={s.showUnderlay} onChange={(v) => useUi.setState({ showUnderlay: v })} /></Row>
        <UnderlayRow />
        <Row label="Projeção da cobertura"><Check id="v-roofproj" checked={s.showRoofProjection} onChange={(v) => setRoofProjection(v)} /></Row>
        <Row label="Depurar junções"><Check id="v-debugjoins" checked={p.settings.debugJoins} onChange={(v) => editor.store.exec({ type: 'setSettings', patch: { debugJoins: v } })} /></Row>
        <Row label="Nível de detalhe" htmlFor="v-detail">
          <select id="v-detail" className="select" value={p.settings.detail} onChange={(e) => editor.store.exec({ type: 'setSettings', patch: { detail: e.target.value as DetailLevel } })}>
            <option value="coarse">Grosseiro</option>
            <option value="medium">Médio</option>
            <option value="fine">Fino</option>
          </select>
        </Row>
        <div className="prow"><span /><button className="chiplink" onClick={() => useUi.setState({ dialog: 'levels' })}>Editar níveis…</button></div>
      </Group>
      {areaPlan ? <AreaProfileGroups key={`ap-${areaPlan.id}`} plan={areaPlan} /> : null}
      {s.view === 'plan' && <ViewRangeGroup key={`vr-${s.levelId}`} levelId={s.levelId} />}
      {s.view === 'plan' && <LevelGraphicsGroup key={`lg-${s.levelId}`} levelId={s.levelId} />}
      {s.view === '3d' && <View3DGroup />}
      {s.view === 'section' && <SectionGraphicsGroup />}
      {s.view === 'section' && section ? <SectionViewProps view={section} /> : null}
      <Group title="Padrões do projeto" open={false}>
        <Row label="Tolerância de junção" htmlFor="v-jt"><NumField id="v-jt" value={p.settings.joinTolerance} quantity="smallLength" min={0.1} onCommit={(v) => editor.store.exec({ type: 'setSettings', patch: { joinTolerance: v } })} /></Row>
        <Row label="Altura de parede" htmlFor="v-wh"><NumField id="v-wh" value={s.options.wallHeight} quantity="length" onCommit={(v) => useUi.setState({ options: { ...s.options, wallHeight: v } })} /></Row>
        <div className="prow"><span /><button className="chiplink" onClick={() => useUi.setState({ dialog: 'units' })}>Unidades…</button><button className="chiplink" onClick={() => useUi.setState({ dialog: 'dimensions' })}>Cotas…</button></div>
      </Group>
      <div className="hint">Selecione um elemento para ver e editar suas propriedades. Mudar o <em>tipo</em> altera todas as instâncias; mudar a <em>instância</em> altera só a selecionada.</div>
    </>
  );
}

/** Intervalos de grade oferecidos (m), além do automático pelo zoom. */
const GRID_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];

export function Properties(): ReactElement {
  const p = useProject();
  const sel = useUi((s) => s.selection);
  // Na planta de área, cotas/textos vivem em `plan.annotations`: a seleção precisa procurar lá, não no nível.
  const planId = useUi((s) => (s.planKind === 'area' ? s.areaPlanId : null));
  const note = selectedNote(p, useUi((s) => s.levelId), sel, planId);
  const view = selectedView(p, sel);
  const els = sel.map((id) => p.elements[id]).filter((e) => !!e);
  const walls = els.filter(isWall);
  const ops = els.filter(isOpening);
  const floors = els.filter(isFloor);
  const slabs = els.filter(isSlab);
  const ceilings = els.filter(isCeiling);
  const roofs = els.filter(isRoof);
  const stairs = els.filter(isStair);
  const ramps = els.filter(isRamp);
  const rooms = els.filter(isRoom), generics = els.filter(isGeneric), cads = els.filter(isCad);
  // Grade é do projeto, não elemento: a seleção dela é um id que não está em `elements`.
  const grade = gradeDaSelecao(p, sel);
  const count = walls.length + ops.length + floors.length + slabs.length + ceilings.length + roofs.length + stairs.length + ramps.length + rooms.length + generics.length + cads.length;
  const kinds = [walls, ops, floors, slabs, ceilings, roofs, stairs, ramps, rooms, generics, cads].filter((g) => g.length > 0).length;
  const tool = useUi((s) => s.tool);
  const placing = count === 0 && hasPlacementProperties(tool);
  const perim = usePerimeter();
  // Nível selecionado no 3D: só ocupa o painel quando não há elementos na seleção nem ferramenta em colocação.
  const selectedLevel = useUi((s) => s.selectedLevel);
  const nivelSelecionado = count === 0 && !placing ? p.levels.find((l) => l.id === selectedLevel) : undefined;
  const panelLabel = perim.active ? PERIMETER_TITLE[perim.target] : placing ? `Colocar ${TOOL_LABEL[tool]}` : nivelSelecionado ? `Nível ${nivelSelecionado.name}` : selectionLabel({ walls: walls.length, ops: ops.length, floors: floors.length, slabs: slabs.length, ceilings: ceilings.length, roofs: roofs.length, stairs: stairs.length, ramps: ramps.length, rooms: rooms.length, generics: generics.length, cads: cads.length, grade, view });
  return (
    <aside className="side" aria-label="Propriedades">
      <PanelHead panel="props" name="Propriedades" closeLabel="Fechar as propriedades" extra={<span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}>{panelLabel}</span>}>
        Propriedades
      </PanelHead>
      <LabelScroll>
        {perim.active ? <PerimeterEdgePanel />
          : kinds === 1 && walls.length > 0 ? <WallProps walls={walls} />
          : kinds === 1 && ops.length > 0 ? <OpeningProps items={ops} />
          : kinds === 1 && floors.length > 0 ? <FloorProperties floors={floors} />
          : kinds === 1 && slabs.length > 0 ? <SlabProperties slabs={slabs} />
          : kinds === 1 && ceilings.length > 0 ? <CeilingProperties ceilings={ceilings} />
          : kinds === 1 && roofs.length > 0 ? <RoofProperties roofs={roofs} />
          : kinds === 1 && stairs.length > 0 ? <StairProperties stairs={stairs} />
          : kinds === 1 && ramps.length > 0 ? <RampProperties ramps={ramps} />
          : kinds === 1 && rooms.length > 0 ? <RoomProperties rooms={rooms} />
          : kinds === 1 && generics.length > 0 ? <GenericProps items={generics} />
          : kinds === 1 && cads.length > 0 ? <CadProps items={cads} />
          : grade ? <GridProperties grid={grade} />
          : note ? <AnnotationProps dim={note.dim} text={note.text} line={note.line} region={note.region} tag={note.tag} planId={planId} />
          : view ? <SectionViewProps view={view} />
          : nivelSelecionado ? <LevelProps />
          : count > 0 ? (
          <div className="hint">Seleção mista de elementos. Selecione apenas um tipo de elemento (parede, abertura, piso, laje, telhado, escada, rampa ou ambiente) para editar propriedades.</div>
        ) : (
          <>
            {isToolTypeKind(tool) && <ToolTypeProps tool={tool} />}
            {placing ? <PlacementProperties tool={tool} /> : <ViewProps />}
          </>
        )}
      </LabelScroll>
      <div className="rv-foot">
        <button type="button" className="link" onClick={() => useUi.setState({ dialog: 'shortcuts' })}>Ajuda de propriedades</button>
        {/* Edições já valem ao sair do campo; o botão só tira o foco do campo que ainda está aberto. */}
        <button type="button" className="apply" onClick={() => (document.activeElement as HTMLElement | null)?.blur()}>Aplicar</button>
      </div>
    </aside>
  );
}
