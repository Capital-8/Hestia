import { Fragment, useState, type ReactElement } from 'react';
import { coreRange, type FloorType, floorTypeThickness, formatQuantity, FUNCTION_LABEL, type Layer, type LayerFunction, layerPriority, temPrioridadeEmpatada } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { duplicateFloorType, floorTypeDeleteBlock, floorTypeError, floorTypeUsage, tryDeleteFloorType } from '../../editor/typeActions.ts';
import { NumField, TextField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { coreHint } from './coreHint.ts';
import { Dialog } from './Dialog.tsx';
import { TypeDialogHeader } from './TypeDialogHeader.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { FloorSectionPreview } from './FloorSectionPreview.tsx';
import { LayerAdvanced } from './LayerAdvanced.tsx';
import { MaterialsDialog } from './MaterialsDialog.tsx';
import { useUnits } from '../useUnits.ts';

const FUNCTIONS = Object.keys(FUNCTION_LABEL) as LayerFunction[];
/** Editor de tipo de piso: camadas do topo para baixo (reusa o editor de camadas do tipo de parede). */
export function FloorTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const units = useUnits();
  const p = useProject();
  const src = p.floorTypes[typeId];
  const [draft, setDraft] = useState<FloorType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);
  const [pick, setPick] = useState<number | null>(null);
  const [adv, setAdv] = useState<number | null>(null);
  if (current !== typeId) {
    setCurrent(typeId);
    setAdv(null);
    setPick(null);
    setDraft(p.floorTypes[typeId] ? structuredClone(p.floorTypes[typeId]!) : null);
  }
  if (!draft) return null;
  const usage = floorTypeUsage(p, draft.id);
  const error = floorTypeError(draft);
  const core = coreRange(draft);
  const nucleo = coreHint(draft, units);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const setLayer = (i: number, patch: Partial<Layer>): void => setDraft({ ...draft, layers: draft.layers.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const replaceLayer = (i: number, next: Layer): void => setDraft({ ...draft, layers: draft.layers.map((l, k) => (k === i ? next : l)) });
  const move = (i: number, d: -1 | 1): void => {
    const j = i + d;
    if (j < 0 || j >= draft.layers.length) return;
    const ls = [...draft.layers];
    [ls[i], ls[j]] = [ls[j]!, ls[i]!];
    setDraft({ ...draft, layers: ls });
    setAdv(null);
  };
  const insert = (): void => {
    const material = Object.keys(p.materials)[0] ?? 'mat_argamassa';
    setDraft({ ...draft, layers: [...draft.layers, { function: 'substrate', materialId: material, thickness: 0.02, wraps: false }] });
    setAdv(null);
  };
  const remove = (i: number): void => {
    if (draft.layers.length > 1) {
      setDraft({ ...draft, layers: draft.layers.filter((_, k) => k !== i) });
      setAdv(null);
    }
  };
  /** Grava como o OK, mas o diálogo segue aberto com o rascunho. */
  const apply = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertFloorType', floorType: draft }, 'Editar tipo de piso');
  };
  const ok = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertFloorType', floorType: draft }, 'Editar tipo de piso');
    close();
  };
  const duplicate = (): void => {
    const id = duplicateFloorType(editor.store, draft.id);
    if (id) useUi.setState({ dialogArg: id });
  };
  const del = (): void => {
    const r = tryDeleteFloorType(editor.store, draft.id);
    if (!r.ok) {
      useUi.setState({ status: `Não foi possível excluir: ${r.error}` });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.floorTypeId === draft.id) useUi.setState({ options: { ...ui.options, floorTypeId: Object.keys(editor.project.floorTypes)[0] ?? ui.options.floorTypeId } });
    close();
  };
  const blocked = floorTypeDeleteBlock(p, draft.id);
  const picked = pick !== null ? draft.layers[pick] : undefined;
  return (
    <>
      <Dialog
        title="Propriedades do tipo de piso"
        sub={`Piso · usado em ${usage} ${usage === 1 ? 'piso' : 'pisos'}`}
        onClose={close}
        size="mid"
        footer={
          <>
            <button className="btn danger" disabled={blocked !== null} title={blocked ?? 'Excluir tipo'} onClick={del}>Excluir</button>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={close}>Cancelar</button>
            <button className="btn" onClick={apply} disabled={error !== null}>Aplicar</button>
            <button className="btn primary" onClick={ok} disabled={error !== null} title={error ?? undefined}>OK</button>
          </>
        }
      >
        <TypeDialogHeader family={FAMILY.floor} types={Object.values(p.floorTypes)} currentId={draft.id} nameFieldId="ft-name" onDuplicate={duplicate} />
        <div className="field-row">
          <label htmlFor="ft-name">Nome do tipo</label>
          <TextField id="ft-name" value={draft.name} onCommit={(v) => setDraft({ ...draft, name: v })} />
        </div>
        <div className="split">
          <div style={{ minWidth: 0 }}>
            <table className="layers layers-cards cols-5">
              <thead>
                <tr><th>#</th><th>Função</th><th>Material</th><th>Esp. (cm)</th><th /></tr>
              </thead>
              <tbody>
                <tr><td colSpan={5} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Topo do piso</td></tr>
                {draft.layers.map((l, i) => {
                  const m = p.materials[l.materialId];
                  const inCore = i >= core.first && i <= core.last;
                  return (
                    <Fragment key={i}>
                      <tr className={inCore ? 'core' : ''}>
                        <td className="mono">{i + 1}</td>
                        <td>
                          <span className="fn-cell">
                            <select className="select" aria-label={`Função da camada ${i + 1}`} value={l.function} onChange={(e) => setLayer(i, { function: e.target.value as LayerFunction })}>
                              {FUNCTIONS.map((f) => <option key={f} value={f}>{FUNCTION_LABEL[f]}</option>)}
                            </select>
                            <span className="pbadge" title="Prioridade de junção efetiva">P{layerPriority(l)}</span>
                          </span>
                        </td>
                        <td>
                          <button className="btn small" style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setPick(i)} title="Escolher material">
                            <span className="swatch" style={{ background: m?.color }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.name ?? '—'}</span>
                          </button>
                        </td>
                        <td><NumField value={l.thickness} quantity="smallLength" min={l.function === 'membrane' ? 0 : 0.001} onCommit={(v) => setLayer(i, { thickness: v })} /></td>
                        <td>
                          <span className="iconrow">
                            <button id={`ft-layer-${i}-more`} className={`ibtn more${adv === i ? ' open' : ''}${l.priority !== undefined || l.termino !== undefined ? ' changed' : ''}`} aria-expanded={adv === i} aria-controls={adv === i ? `ft-layer-${i}-adv` : undefined} aria-label={`Opções avançadas da camada ${i + 1}`} title="Mais" onClick={() => setAdv(adv === i ? null : i)}><Icon name="chevron" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, -1)} aria-label="Subir camada" disabled={i === 0}><Icon name="up" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, 1)} aria-label="Descer camada" disabled={i === draft.layers.length - 1}><Icon name="down" size={14} /></button>
                            <button className="ibtn" onClick={() => remove(i)} aria-label="Remover camada" disabled={draft.layers.length <= 1}><Icon name="close" size={14} /></button>
                          </span>
                        </td>
                      </tr>
                      {adv === i && (
                        <tr id={`ft-layer-${i}-adv`} className="adv">
                          <td colSpan={5}>
                            <LayerAdvanced id={`ft-layer-${i}`} layer={l} onChange={(next) => replaceLayer(i, next)} termino />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr><td colSpan={5} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Face inferior</td></tr>
              </tbody>
            </table>
            <div className="total"><span>Espessura total</span><strong>{formatQuantity(units, 'smallLength', floorTypeThickness(draft))}</strong></div>
            <p className="hint">{nucleo.text}</p>
            {temPrioridadeEmpatada(draft.layers) && <p className="hint">Há camadas de funções diferentes com a mesma prioridade: elas não se cortam e deixam linha de fronteira.</p>}
            <button className="btn small" onClick={insert}>+ Inserir camada</button>
            {error && <p className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 8 }}>{error}</p>}
          </div>
          <div>
            <FloorSectionPreview type={draft} materials={p.materials} />
            <p className="hint" style={{ padding: '8px 2px' }}>A primeira camada é o acabamento de cima. O topo do piso fica na cota do nível mais o deslocamento da instância.</p>
          </div>
        </div>
        <div className="field-row"><label htmlFor="ft-code">Código</label><TextField id="ft-code" value={draft.code} onCommit={(v) => setDraft({ ...draft, code: v })} /></div>
        <div className="field-row"><label htmlFor="ft-desc">Descrição</label><TextField id="ft-desc" value={draft.description} onCommit={(v) => setDraft({ ...draft, description: v })} /></div>
        <div className="field-row"><label htmlFor="ft-cost" title="Custo informativo do tipo por área">Custo por área</label><NumField id="ft-cost" value={draft.cost} quantity="currency" min={0} onCommit={(v) => setDraft({ ...draft, cost: v })} /></div>
      </Dialog>
      {pick !== null && picked && (
        <MaterialsDialog
          pickFor={picked.materialId}
          onPick={(id) => {
            setLayer(pick, { materialId: id });
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}
    </>
  );
}
