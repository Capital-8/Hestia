import { useMemo, type ReactElement } from 'react';
import { quantifySlabs, slabRiseAt } from '@hestia/engine';
import { FUNCTION_LABEL, slabArea, slabTypeThickness, type Id, type Project, type Slab } from '@hestia/model';
import { ringPerimeter } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';
import { LevelField } from './LevelField.tsx';
import { OutlineGroup } from './OutlineGroup.tsx';
import { TypeSelector } from './TypeSelector.tsx';
import { slabOptions } from './typeOptions.ts';



/** Valor comum a todos os selecionados, ou `mixed` quando divergem. */
function common<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}

function patch(ids: Id[], p: Partial<Slab>): void {
  editor.store.exec({ type: 'updateElements', ids, patch: p });
}

/** Troca só o percentual, mantendo a origem e a direção de cada laje com inclinação. Um passo de desfazer. */
function setPercent(slabs: Slab[], percent: number): void {
  editor.store.transaction('Alterar inclinação', () => {
    for (const s of slabs) if (s.slope) editor.store.exec({ type: 'updateElements', ids: [s.id], patch: { slope: { ...s.slope, percent } } });
  });
}

/** Área real da face superior: a área em planta vezes sqrt(1 + g²), com g o gradiente do caimento (percentual / 100). */
export const realArea = (s: Slab, planArea: number = slabArea(s)): number => {
  const g = (s.slope?.percent ?? 0) / 100;
  return planArea * Math.sqrt(1 + g * g);
};

/** Área em planta resolvida (com as aberturas de escada) de cada laje; a que não resolve cai na área crua. */
export function resolvedPlanAreas(p: Project, slabs: Slab[]): Map<Id, number> {
  const levels = [...new Set(slabs.map((s) => s.levelId))];
  return new Map(levels.flatMap((levelId) => quantifySlabs(p, levelId).slabs.map((q) => [q.slabId, q.planArea] as const)));
}

/** Variação da cota do topo ao longo do contorno (m): zero sem inclinação. */
export const topVariation = (s: Slab): number => {
  if (!s.slope) return 0;
  const rises = s.boundary.map((q) => slabRiseAt(s.slope, q));
  return Math.max(...rises) - Math.min(...rises);
};

/** Propriedades de uma ou mais lajes selecionadas (tipo, deslocamento, inclinação, marca, áreas e camadas). */
export function SlabProperties({ slabs }: { slabs: Slab[] }): ReactElement {
  const fmt = useFormat();
  const p = useProject();
  const ids = slabs.map((s) => s.id);
  const typeId = common(slabs, (s) => s.typeId);
  const offset = common(slabs, (s) => s.heightOffset);
  const percent = common(slabs, (s) => s.slope?.percent ?? null);
  const hasSlope = slabs.some((s) => s.slope !== null);
  const mark = common(slabs, (s) => s.mark);
  const comments = common(slabs, (s) => s.comments);
  const single = slabs.length === 1 ? slabs[0]! : null;
  const type = typeId.mixed ? null : p.slabTypes[typeId.value];
  const slabKey = slabs.map((s) => `${s.id}:${s.levelId}`).join(',');
  // A lista `slabs` é nova a cada render do painel; a chave por ids/níveis é o que identifica a seleção (senão o memo nunca valeria).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolved = useMemo(() => resolvedPlanAreas(p, slabs), [p, slabKey]);
  const planOf = (x: Slab): number => resolved.get(x.id) ?? slabArea(x);
  const planArea = slabs.reduce((s, x) => s + planOf(x), 0);
  const trueArea = slabs.reduce((s, x) => s + realArea(x, planOf(x)), 0);
  const perimeter = slabs.reduce((s, x) => s + ringPerimeter(x.boundary), 0);

  return (
    <>
      <TypeSelector
        triggerId="prop-slabtype"
        label="Tipo de laje"
        categoryLabel={`Lajes (${slabs.length})`}
        options={slabOptions(p)}
        selectedId={typeId.mixed ? null : typeId.value}
        editDisabled={typeId.mixed}
        onSelect={(id) => patch(ids, { typeId: id })}
        onEdit={() => useUi.setState({ dialog: 'slabType', dialogArg: typeId.value })}
      />
      <Group title="Restrições">
        <LevelField ids={ids} />
        <Row label="Desloc. do topo" htmlFor="p-soff">
          <NumField id="p-soff" value={offset.value} mixed={offset.mixed} onCommit={(v) => patch(ids, { heightOffset: v })} quantity="length" />
        </Row>
      </Group>
      <Group title="Inclinação">
        <Row label="Caimento" htmlFor="p-slope">
          <NumField id="p-slope" value={(percent.value ?? 0) / 100} mixed={percent.mixed} disabled={!hasSlope} onCommit={(v) => setPercent(slabs, v * 100)} quantity="slope" />
        </Row>
        {single?.slope ? (
          <>
            <Row label="Variação do topo"><span className="val">{fmt('smallLength', topVariation(single))}</span></Row>
            <div className="row">
              <button className="btn small danger" onClick={() => patch(ids, { slope: null })}>Remover inclinação</button>
            </div>
          </>
        ) : (
          <div className="hint">{hasSlope ? 'Selecione uma laje para ver a variação do topo.' : 'Sem inclinação. Use Inclinação na faixa Arquitetura e clique na planta.'}</div>
        )}
      </Group>
      <OutlineGroup elements={slabs} />
      <Group title="Construção" open={false}>
        {type ? (
          <>
            <Row label="Espessura total" readOnly fromType><span className="val">{fmt('smallLength', slabTypeThickness(type))}</span></Row>
            {type.layers.map((l, i) => (
              <div className="prow ro" key={i}>
                <span className="lbl" title={FUNCTION_LABEL[l.function]}>{FUNCTION_LABEL[l.function]}</span>
                <span className="val soft" title={p.materials[l.materialId]?.name}>{fmt('smallLength', l.thickness)}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="hint">Selecione lajes do mesmo tipo para ver as camadas.</div>
        )}
      </Group>
      <Group title="Dimensões">
        {single ? (
          <>
            <Row label="Área em planta"><span className="val">{fmt('area', planOf(single))}</span></Row>
            <Row label="Área real"><span className="val">{fmt('area', realArea(single, planOf(single)))}</span></Row>
            <Row label="Perímetro"><span className="val">{fmt('length', ringPerimeter(single.boundary))}</span></Row>
            <Row label="Furos"><span className="val">{single.holes.length}</span></Row>
          </>
        ) : (
          <>
            <Row label="Área em planta"><span className="val">{fmt('area', planArea)}</span></Row>
            <Row label="Área real"><span className="val">{fmt('area', trueArea)}</span></Row>
            <Row label="Perímetro total"><span className="val">{fmt('length', perimeter)}</span></Row>
          </>
        )}
      </Group>
      <Group title="Dados de identidade" open={false}>
        <Row label="Marca" htmlFor="p-smark"><TextField id="p-smark" value={mark.value} mixed={mark.mixed} onCommit={(v) => patch(ids, { mark: v })} /></Row>
        <Row label="Comentários" htmlFor="p-scomm"><TextField id="p-scomm" value={comments.value} mixed={comments.mixed} onCommit={(v) => patch(ids, { comments: v })} /></Row>
      </Group>
    </>
  );
}
