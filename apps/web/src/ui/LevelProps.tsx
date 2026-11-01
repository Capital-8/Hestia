import { useMemo, type ReactElement } from 'react';
import { levelDataOf } from '@hestia/render';
import { editor, useProject } from '../editor/controller.ts';
import { commitLevelElevation } from '../editor/commitLevelElevation.ts';
import { useUi } from '../editor/state.ts';
import { Group, NumField, Row, TextField } from './fields.tsx';
import { useFormat } from './useUnits.ts';

/**
 * Painel do nível selecionado no 3D: nome, elevação editável e os Δ para os níveis vizinhos (somente leitura).
 * A elevação é a cota do datum: mudá-la move junto todos os elementos do nível. Os Δ saem de `levelDataOf`, que ordena
 * os níveis pela cota — os mesmos números do 3D. Nível excluído (id que sumiu do projeto) não renderiza nada.
 */
export function LevelProps(): ReactElement | null {
  const p = useProject();
  const selected = useUi((s) => s.selectedLevel);
  const fmt = useFormat();
  // Só depende do projeto: a caixa usada pelos Δ é a do projeto inteiro, não a da seleção.
  const dados = useMemo(() => levelDataOf(p), [p]);
  const level = selected === null ? undefined : p.levels.find((l) => l.id === selected);
  const datum = level ? dados.find((d) => d.levelId === level.id) : undefined;
  if (!level) return null;

  const upsert = (patch: { name?: string; elevation?: number }): void => {
    if (patch.elevation !== undefined) {
      // Mover a cota é uma operação de projeto: planeja, reajusta escadas/rampas e, se houver conflito, pergunta (0041).
      commitLevelElevation(level.id, patch.elevation);
      return;
    }
    editor.store.exec({ type: 'upsertLevel', level: { ...level, ...patch } });
  };
  const delta = (v: number | undefined): string => (v === undefined ? '—' : fmt('length', v));

  return (
    <Group title="Nível">
      <Row label="Nome" htmlFor="p-level-name">
        <TextField id="p-level-name" value={level.name} onCommit={(v) => upsert({ name: v || level.name })} />
      </Row>
      <Row label="Elevação" htmlFor="p-level-elev">
        <NumField id="p-level-elev" value={level.elevation} quantity="length" onCommit={(v) => upsert({ elevation: v })} />
      </Row>
      <div className="hint">Mover a elevação move junto todos os elementos do nível. Escadas e rampas ligadas ao nível são reajustadas automaticamente.</div>
      <Row label="Δ abaixo" readOnly><span className="val">{delta(datum?.deltaBelow)}</span></Row>
      <Row label="Δ acima" readOnly><span className="val">{delta(datum?.deltaAbove)}</span></Row>
      <div className="prow">
        <span />
        <button className="btn small" onClick={() => useUi.setState({ dialog: 'levels', dialogArg: level.id })}>Gerenciar níveis…</button>
      </div>
    </Group>
  );
}
