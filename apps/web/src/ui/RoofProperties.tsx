import { useMemo, type ReactElement } from 'react';
import { quantifyRoofs, ROOF_SHAPE_LABEL } from '@hestia/engine';
import { FUNCTION_LABEL, roofTypeThickness, type Id, type Roof, type RoofShape } from '@hestia/model';
import { defaultExtrusionProfile } from '@hestia/engine';
import { roofPresetOf, roofShapePatch, roofSlopeError, roofSlopeFromDegField, percentToDeg, roofToFreePatch } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { applyRoofPatch } from '../editor/roofEdgeActions.ts';
import { Check, Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { LevelField } from './LevelField.tsx';
import { RoofMansardSection } from './RoofMansardProps.tsx';
import { RoofPlanesSection } from './RoofPlanesProps.tsx';
import { RoofProfileRow } from './RoofProfileRow.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { roofOptions } from './typeOptions.ts';



/** Valor comum a todos os selecionados, ou `mixed` quando divergem. */
function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

/** Alteração pelas Propriedades: guardada pelo motor (não aplica se a alteração deixar o telhado sem águas). */
function patch(ids: Id[], p: Partial<Roof>): void {
  applyRoofPatch(editor.store, ids, p);
}

/** Ângulo do eixo da cumeeira (ou da subida) em graus, entre 0° e 180°. */
const axisDeg = (r: Roof): number => {
  const a = (Math.atan2(r.dir.y, r.dir.x) * 180) / Math.PI;
  return ((a % 180) + 180) % 180;
};

/** Gira a direção do telhado em `deg` graus, mantendo-a unitária. */
const rotatedDir = (r: Roof, deg: number): { x: number; y: number } => {
  const t = (deg * Math.PI) / 180;
  return { x: r.dir.x * Math.cos(t) - r.dir.y * Math.sin(t), y: r.dir.x * Math.sin(t) + r.dir.y * Math.cos(t) };
};

const SHAPE_OPTIONS: RoofShape[] = ['shed', 'gable', 'hip', 'edges', 'free', 'extrusion'];

/**
 * Propriedades de um ou mais telhados: tipo, nível, cota do beiral, forma (predefinições por aresta ou águas livres),
 * inclinação, cumeeira, beiral e acabamentos, camadas, quantitativos e identidade. As arestas (inclinação e balanço) se
 * editam em "Editar perímetro"; o contorno, pelas alças na planta.
 */
export function RoofProperties({ roofs }: { roofs: Roof[] }): ReactElement {
  const fmt = useFormat();
  const p = useProject();
  const ids = roofs.map((r) => r.id);
  const single = roofs.length === 1 ? roofs[0]! : null;
  const typeId = common(roofs, (r) => r.typeId);
  const offset = common(roofs, (r) => r.heightOffset);
  const shape = common(roofs, (r) => r.shape);
  const slope = common(roofs, (r) => r.slopePercent);
  const mark = common(roofs, (r) => r.mark);
  const comments = common(roofs, (r) => r.comments);
  const joinOthers = common(roofs, (r) => r.joinOthers);
  const rafterCut = common(roofs, (r) => r.rafterCut);
  const fascia = common(roofs, (r) => r.eave.fascia);
  const fasciaHeight = common(roofs, (r) => r.eave.fasciaHeight);
  const gutter = common(roofs, (r) => r.eave.gutter);
  const soffit = common(roofs, (r) => r.eave.soffit);
  const type = typeId.mixed ? null : p.roofTypes[typeId.value];
  const hasRidge = single !== null && (single.shape === 'gable' || single.shape === 'shed');
  const roofLevelId = roofs[0]!.levelId;
  const quantities = useMemo(() => quantifyRoofs(p, roofLevelId), [p, roofLevelId]);
  const picked = roofs.map((r) => quantities.roofs.find((q) => q.roofId === r.id)).filter((q): q is NonNullable<typeof q> => q !== undefined);
  const sum = (f: (q: (typeof picked)[number]) => number): number => picked.reduce((s, q) => s + f(q), 0);
  const planArea = sum((q) => q.planArea);
  const realArea = sum((q) => q.faceArea);
  const eaveLength = sum((q) => q.eaveLength);
  const ridgeLength = sum((q) => q.ridgeLength);
  const hipLength = sum((q) => q.hipLength);
  const valleyLength = sum((q) => q.valleyLength);
  const planes = sum((q) => q.planes.length);
  const resolved = picked.length > 0 && picked.some((q) => q.planes.length > 0);
  const freeRoof = single?.shape === 'free' ? single : null;

  const setSlope = (v: number): void => {
    const err = roofSlopeError(v);
    if (err) {
      useUi.setState({ status: err });
      return;
    }
    // Por arestas: a inclinação nova vale para as arestas que definem inclinação (cada uma se ajusta na planta).
    for (const r of roofs) patch([r.id], { slopePercent: v, ...(r.shape === 'edges' ? { edgeSlopes: r.edgeSlopes.map((x) => (x === null ? null : v)) } : {}) });
  };

  const setShape = (v: RoofShape): void => {
    editor.store.transaction('Forma do telhado', () => {
      for (const r of roofs) {
        // Por extrusão: começa com o perfil padrão (arco de 1 m) se o telhado ainda não tem um; a água é conferida pelo motor.
        // Águas livres preserva as águas atuais (quatro águas viram quatro planos); a conversão simples perderia as cotas.
        const next: Partial<Roof> =
          v === 'extrusion' ? { shape: 'extrusion', profile: r.profile.length >= 2 ? r.profile : defaultExtrusionProfile(r.boundary, r.dir) }
          : v === 'free' ? roofToFreePatch(r)
          : roofShapePatch(r, v);
        if (Object.keys(next).length) patch([r.id], next);
      }
    });
  };

  /** Acabamentos do beiral: cada telhado guarda o seu, então a alteração vai telhado a telhado numa transação. */
  const setEave = (change: Partial<Roof['eave']>): void => {
    editor.store.transaction('Acabamento do beiral', () => {
      for (const r of roofs) editor.store.exec({ type: 'updateElements', ids: [r.id], patch: { eave: { ...r.eave, ...change } } });
    });
  };

  return (
    <>
      <TypeSelector
        triggerId="prop-rooftype"
        label="Tipo de telhado"
        categoryLabel={`Telhados (${roofs.length})`}
        options={roofOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'roofType', dialogArg: typeId.value })}
      />
      <Group title="Restrições">
        <LevelField ids={ids} />
        <Row label="Cota do beiral" htmlFor="p-roff">
          <NumField id="p-roff" value={offset.value} mixed={offset.mixed} onCommit={(v) => patch(ids, { heightOffset: v })} quantity="length" />
        </Row>
      </Group>
      <Group title="Forma">
        <Row label="Forma" htmlFor="p-rshape">
          {/* Telhado por arestas que reproduz uma predefinição (duas águas, etc.) mostra essa forma, como a barra. */}
          <select id="p-rshape" className="select" value={shape.mixed ? '' : single?.shape === 'edges' ? (roofPresetOf(single) ?? 'edges') : shape.value} onChange={(e) => e.target.value && setShape(e.target.value as RoofShape)} aria-label="Forma do telhado">
            {shape.mixed && <option value="">variadas</option>}
            {SHAPE_OPTIONS.map((s) => (
              <option key={s} value={s}>{ROOF_SHAPE_LABEL[s]}</option>
            ))}
          </select>
        </Row>
        <Row label="Inclinação" htmlFor="p-rslope">
          <NumField id="p-rslope" value={slope.value / 100} mixed={slope.mixed} onCommit={(v) => setSlope(v * 100)} quantity="slope" min={0.001} max={2} />
        </Row>
        <Row label="Inclinação" htmlFor="p-rdeg">
          <NumField id="p-rdeg" value={(percentToDeg(slope.value) * Math.PI) / 180} mixed={slope.mixed} quantity="angle" min={(0.1 * Math.PI) / 180} max={(63.4 * Math.PI) / 180} onCommit={(v) => setSlope(roofSlopeFromDegField((v * 180) / Math.PI, percentToDeg(slope.value), slope.value))} />
        </Row>
        {hasRidge && single ? (
          <>
            <Row label={single.shape === 'shed' ? 'Subida' : 'Cumeeira'} htmlFor="p-rdir">
              <NumField id="p-rdir" value={(axisDeg(single) * Math.PI) / 180} quantity="angle" onCommit={(v) => patch(ids, { dir: { x: Math.cos(v), y: Math.sin(v) } })} />
            </Row>
            <div className="row">
              <button className="btn small" onClick={() => patch(ids, { dir: rotatedDir(single, 90) })}>Rotacionar 90°</button>
            </div>
          </>
        ) : (
          <div className="hint">
            {freeRoof ? 'Águas livres: cada água tem inclinação e subida próprias (lista abaixo).'
              : single?.shape === 'edges' && roofPresetOf(single) === 'gable' ? 'Duas águas: a inclinação vale para as arestas paralelas à cumeeira. Para editar uma aresta, use Editar perímetro.'
              : single?.shape === 'edges' && roofPresetOf(single) === 'hip' ? 'Quatro águas: a inclinação vale para todas as arestas do contorno. Para editar uma aresta, use Editar perímetro.'
              : single?.shape === 'edges' ? 'Por arestas: inclinação só nas arestas que a definem. Para editar uma aresta, use Editar perímetro.'
              : single?.shape === 'extrusion' ? 'Telhado por extrusão: o perfil (altura por transversal) se edita pelo botão abaixo.'
              : single ? 'Forma de uma água, duas águas ou quatro águas: troque por Por arestas para editar cada aresta.'
              : 'Selecione um telhado para editar a direção da cumeeira.'}
          </div>
        )}
        {single?.shape === 'extrusion' && <RoofProfileRow key={single.id} roof={single} />}
        <div className="hint">O balanço do beiral se define por aresta, em Editar perímetro. O contorno se ajusta pelas alças.</div>
      </Group>
      {freeRoof && <RoofPlanesSection roof={freeRoof} />}
      {single && <RoofMansardSection roof={single} />}
      <Group title="Beiral e acabamentos">
        <Row label="Unir telhados" htmlFor="p-rjoin">
          <Check id="p-rjoin" checked={joinOthers.value} mixed={joinOthers.mixed} onChange={(v) => patch(ids, { joinOthers: v })}>Unir telhados que se sobrepõem</Check>
        </Row>
        <Row label="Corte do caibro" htmlFor="p-rcut">
          <select id="p-rcut" className="select" value={rafterCut.mixed ? '' : rafterCut.value} onChange={(e) => e.target.value && patch(ids, { rafterCut: e.target.value as Roof['rafterCut'] })} aria-label="Corte do caibro">
            {rafterCut.mixed && <option value="">variados</option>}
            <option value="plumb">Prumo</option>
            <option value="square">Esquadro</option>
          </select>
        </Row>
        <Row label="Testeira" htmlFor="p-rfascia">
          <Check id="p-rfascia" checked={fascia.value} mixed={fascia.mixed} onChange={(v) => setEave({ fascia: v })}>Testeira</Check>
        </Row>
        <Row label="Altura da testeira" htmlFor="p-rfh">
          <NumField id="p-rfh" value={fasciaHeight.value} mixed={fasciaHeight.mixed} quantity="length" min={0} onCommit={(v) => setEave({ fasciaHeight: v })} />
        </Row>
        <Row label="Calha" htmlFor="p-rgutter">
          <Check id="p-rgutter" checked={gutter.value} mixed={gutter.mixed} onChange={(v) => setEave({ gutter: v })}>Calha</Check>
        </Row>
        <Row label="Forro de beiral" htmlFor="p-rsoffit">
          <Check id="p-rsoffit" checked={soffit.value} mixed={soffit.mixed} onChange={(v) => setEave({ soffit: v })}>Forro de beiral</Check>
        </Row>
      </Group>
      <Group title="Construção" open={false}>
        {type ? (
          <>
            <Row label="Espessura total" readOnly fromType><span className="val">{fmt('smallLength', roofTypeThickness(type))}</span></Row>
            {type.layers.map((l, i) => (
              <div className="prow ro" key={i}>
                <span className="lbl" title={FUNCTION_LABEL[l.function]}>{FUNCTION_LABEL[l.function]}</span>
                <span className="val soft" title={p.materials[l.materialId]?.name}>{fmt('smallLength', l.thickness)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="hint">Selecione telhados do mesmo tipo para ver as camadas.</div>
        )}
      </Group>
      <Group title="Quantitativos" open={false}>
        <Row label="Área em planta"><span className="val">{fmt('area', planArea)}</span></Row>
        <Row label="Área real"><span className="val">{resolved ? fmt('area', realArea) : '—'}</span></Row>
        <Row label="Águas"><span className="val">{planes || '—'}</span></Row>
        <Row label="Beiral"><span className="val">{fmt('length', eaveLength)}</span></Row>
        <Row label="Cumeeira"><span className="val">{fmt('length', ridgeLength)}</span></Row>
        <Row label="Espigão"><span className="val">{fmt('length', hipLength)}</span></Row>
        <Row label="Rincão"><span className="val">{fmt('length', valleyLength)}</span></Row>
      </Group>
      <Group title="Dados de identidade" open={false}>
        <Row label="Marca" htmlFor="p-rmark"><TextField id="p-rmark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label="Comentários" htmlFor="p-rcomm"><TextField id="p-rcomm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
