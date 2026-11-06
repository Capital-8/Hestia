import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { materialUsage, newId, type HatchKind, type Material, type MaterialTexturePreset } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { NumField, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { campoDefinido, ESCALA_MINIMA, mensagemCampo, PRESETS_TEXTURA, patchDoCampo, valorEfetivo, type CampoRender, type ValorDoCampo } from './materialRenderCampos.ts';

const HATCHES: Array<[HatchKind, string]> = [['none', 'Sem hachura'], ['diagonal', 'Diagonal'], ['cross', 'Cruzada'], ['dots', 'Pontos'], ['solid', 'Sólida']];

/** Navegador de materiais único: abre de qualquer campo "material" ou pelo navegador de projeto. */
export function MaterialsDialog({ pickFor, onPick, onClose }: { pickFor?: string | null; onPick?: (id: string) => void; onClose?: () => void }): ReactElement {
  const p = useProject();
  const [sel, setSel] = useState<string>(pickFor && p.materials[pickFor] ? pickFor : (Object.keys(p.materials)[0] ?? ''));
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'aparencia' | 'graficos' | 'render' | 'custo'>('aparencia');
  const [erroRender, setErroRender] = useState<string | null>(null);
  const stored = p.materials[sel];
  const [draft, setDraft] = useState<Material | undefined>(stored ? { ...stored } : undefined);
  useEffect(() => setDraft(p.materials[sel] ? { ...p.materials[sel]! } : undefined), [sel, p.materials]);
  useEffect(() => setErroRender(null), [sel]);
  const list = useMemo(() => Object.values(p.materials).filter((m) => m.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [p.materials, q]);
  const used = draft ? materialUsage(p, draft.id) : 0;
  const commit = (next: Material | undefined = draft): void => {
    if (next && JSON.stringify(next) !== JSON.stringify(p.materials[next.id])) editor.store.exec({ type: 'upsertMaterial', material: next }, 'Editar material');
  };
  const change = (patch: Partial<Material>, now = false): void => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    if (now) commit(next);
  };
  /**
   * Envia só o campo da aba Render, como `updateMaterialPbr`. Antes grava o rascunho (cor, nome etc. ainda não
   * confirmados) para que a atualização do material não o descarte. Recusa valor inválido sem fechar a janela.
   */
  const aplicarCampo = (campo: CampoRender, valor: ValorDoCampo): void => {
    if (!draft) return;
    const r = patchDoCampo(draft, campo, valor);
    if (!r.ok) {
      setErroRender(r.erro);
      return;
    }
    commit();
    try {
      editor.store.exec({ type: 'updateMaterialPbr', id: draft.id, patch: r.patch }, 'Editar render do material');
      setErroRender(null);
    } catch (e) {
      setErroRender(e instanceof Error ? e.message : 'Não foi possível alterar o material.');
    }
  };
  const close = (): void => {
    commit();
    if (onClose) onClose();
    else useUi.setState({ dialog: null, dialogArg: null });
  };
  const add = (from?: Material): void => {
    commit();
    const m: Material = from
      ? { ...from, id: newId('mat'), name: `${from.name} (cópia)` }
      : { id: newId('mat'), name: 'Novo material', color: '#b9a98f', hatch: 'none', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2' };
    editor.store.exec({ type: 'upsertMaterial', material: m }, 'Novo material');
    setSel(m.id);
  };
  const tabBtn = (t: typeof tab, label: string): ReactElement => <button className={`dtab${tab === t ? ' on' : ''}`} onClick={() => { setTab(t); setErroRender(null); }}>{label}</button>;
  /** Linha de um campo da aba Render, com o valor efetivo e o botão para voltar ao padrão quando o campo foi definido. */
  const linhaRender = (campo: CampoRender, id: string, rotulo: string, controle: ReactElement, ajuda?: string): ReactElement => (
    <div className="field-row">
      <label htmlFor={id}>{rotulo}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {controle}
        {draft && campoDefinido(draft, campo) && <button className="btn small" onClick={() => aplicarCampo(campo, undefined)}>Padrão</button>}
      </div>
      {ajuda && <p className="hint" style={{ margin: 0, gridColumn: '1 / -1' }}>{ajuda}</p>}
    </div>
  );
  const efetivo = draft ? valorEfetivo(draft) : undefined;
  return (
    <Dialog
      title="Navegador de materiais"
      sub={`${Object.keys(p.materials).length} materiais`}
      onClose={close}
      z={60}
      size="mid"
      footer={
        <>
          {onPick && draft && (
            <button className="btn primary" onClick={() => { commit(); onPick(draft.id); }}>Usar este material</button>
          )}
          <button className="btn" onClick={close}>{onPick ? 'Cancelar' : 'Fechar'}</button>
        </>
      }
    >
      <div className="split mat-split">
        <div>
          <input id="mat-search" className="input wide" placeholder="Buscar material" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="Buscar material" />
          <div className="matlist" style={{ marginTop: 6 }}>
            {list.map((m) => (
              <button key={m.id} className={`matitem${m.id === sel ? ' on' : ''}`} onClick={() => { commit(); setSel(m.id); }}>
                <span className="swatch" style={{ width: 16, height: 16, borderRadius: 2, border: '1px solid var(--line-strong)', background: m.color, flex: 'none' }} />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn small" onClick={() => add()}>+ Novo</button>
            <button className="btn small" disabled={!draft} onClick={() => draft && add(draft)}>Duplicar</button>
          </div>
        </div>
        {draft ? (
          <div onBlur={() => commit()}>
            <div className="field-row"><label htmlFor="mat-name">Nome</label><TextField id="mat-name" value={draft.name} onCommit={(v) => change({ name: v }, true)} /></div>
            <p className="hint" style={{ padding: '6px 0' }}>Cor, textura e rugosidade valem para o render. Hachura e custo não.</p>
            <div className="dtabs">{tabBtn('aparencia', 'Aparência')}{tabBtn('graficos', 'Gráficos')}{tabBtn('render', 'Render')}{tabBtn('custo', 'Custo')}</div>
            {tab === 'aparencia' && (
              <>
                <div className="field-row"><label htmlFor="mat-color">Cor</label><input id="mat-color" type="color" value={draft.color} onChange={(e) => change({ color: e.target.value })} style={{ width: 54, height: 28, padding: 0, border: '1px solid var(--line-strong)', background: 'none' }} /></div>
                <div className="field-row">
                  <label htmlFor="mat-gloss">Brilho (base da rugosidade)</label>
                  <input id="mat-gloss" type="range" min={0} max={1} step={0.05} value={draft.gloss} onChange={(e) => change({ gloss: parseFloat(e.target.value) })} />
                  <p className="hint" style={{ margin: 0, gridColumn: '1 / -1' }}>Sem rugosidade definida na aba Render, a rugosidade vale 1 - brilho.</p>
                </div>
                <div className="field-row"><label htmlFor="mat-op">Opacidade</label><input id="mat-op" type="range" min={0.05} max={1} step={0.05} value={draft.opacity} onChange={(e) => change({ opacity: parseFloat(e.target.value) })} /></div>
                <p className="hint" style={{ padding: '6px 0' }}>No render, a textura e a rugosidade da aba Render têm prioridade sobre a cor e o brilho.</p>
              </>
            )}
            {tab === 'graficos' && (
              <>
                <div className="field-row">
                  <label htmlFor="mat-hatch">Hachura de corte</label>
                  <select id="mat-hatch" className="select" value={draft.hatch} onChange={(e) => change({ hatch: e.target.value as HatchKind }, true)}>
                    {HATCHES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                <p className="hint" style={{ padding: '6px 0' }}>A hachura só afeta a planta, não o render.</p>
              </>
            )}
            {tab === 'render' && efetivo && (
              <>
                {erroRender && <p className="error" role="alert">{erroRender}</p>}
                {linhaRender('textura', 'mat-textura', 'Textura',
                  <select id="mat-textura" className="select" value={efetivo.textura} onChange={(e) => aplicarCampo('textura', e.target.value as MaterialTexturePreset)}>
                    {PRESETS_TEXTURA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>)}
                {linhaRender('escala', 'mat-escala', 'Escala da textura (m por repetição)',
                  <NumField id="mat-escala" value={efetivo.escala} unit="m" decimals={2} min={ESCALA_MINIMA} strictRange
                    onCommit={(v) => aplicarCampo('escala', v)} onInvalid={() => setErroRender(mensagemCampo('escala'))} onValid={() => setErroRender(null)} />)}
                {linhaRender('rugosidade', 'mat-rugosidade', 'Rugosidade',
                  <>
                    <input id="mat-rugosidade" type="range" min={0} max={1} step={0.05} value={efetivo.rugosidade} onChange={(e) => aplicarCampo('rugosidade', parseFloat(e.target.value))} />
                    <output htmlFor="mat-rugosidade">{efetivo.rugosidade.toFixed(2).replace('.', ',')}</output>
                  </>)}
                {linhaRender('metalicidade', 'mat-metalicidade', 'Metalicidade',
                  <>
                    <input id="mat-metalicidade" type="range" min={0} max={1} step={0.05} value={efetivo.metalicidade} onChange={(e) => aplicarCampo('metalicidade', parseFloat(e.target.value))} />
                    <output htmlFor="mat-metalicidade">{efetivo.metalicidade.toFixed(2).replace('.', ',')}</output>
                  </>)}
                {linhaRender('transmissao', 'mat-transmissao', 'Transmissão (vidro)',
                  <>
                    <input id="mat-transmissao" type="range" min={0} max={1} step={0.05} value={efetivo.transmissao} onChange={(e) => aplicarCampo('transmissao', parseFloat(e.target.value))} />
                    <output htmlFor="mat-transmissao">{efetivo.transmissao.toFixed(2).replace('.', ',')}</output>
                  </>,
                  'Usado em vidros; 0,85 é um vidro comum')}
                {linhaRender('ior', 'mat-ior', 'Índice de refração (IOR)',
                  <NumField id="mat-ior" value={efetivo.ior} decimals={2} min={1} max={3} strictRange
                    onCommit={(v) => aplicarCampo('ior', v)} onInvalid={() => setErroRender(mensagemCampo('ior'))} onValid={() => setErroRender(null)} />)}
                {linhaRender('emissao', 'mat-emissao-cor', 'Emissão (cor e intensidade)',
                  <>
                    <input id="mat-emissao-cor" type="color" aria-label="Cor da emissão" value={efetivo.emissao.color}
                      onChange={(e) => aplicarCampo('emissao', { color: e.target.value })}
                      style={{ width: 54, height: 28, padding: 0, border: '1px solid var(--line-strong)', background: 'none' }} />
                    <NumField id="mat-emissao-int" value={efetivo.emissao.intensity} decimals={2} min={0} width={90}
                      onCommit={(v) => aplicarCampo('emissao', { intensity: v })} onInvalid={() => setErroRender(mensagemCampo('emissao'))} onValid={() => setErroRender(null)} />
                  </>,
                  'Para lâmpadas e superfícies que emitem luz')}
              </>
            )}
            {tab === 'custo' && (
              <>
                <div className="field-row"><label htmlFor="mat-cost">Custo</label><NumField id="mat-cost" value={draft.cost} quantity="currency" onCommit={(v) => change({ cost: v }, true)} /></div>
                <div className="field-row">
                  <label htmlFor="mat-unit">Unidade</label>
                  <select id="mat-unit" className="select" value={draft.unit} onChange={(e) => change({ unit: e.target.value as Material['unit'] }, true)}>
                    {/* units-ok: unidade do material (identificador) */}
                    <option value="m2">m²</option>
                    {/* units-ok: unidade do material (identificador) */}
                    <option value="m3">m³</option>
                    <option value="m">m</option>
                  </select>
                </div>
              </>
            )}
            <p className="hint" style={{ padding: '6px 0' }}>Usado em {used} {used === 1 ? 'lugar' : 'lugares'}. Alterar o material muda todos os tipos que o usam.</p>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
