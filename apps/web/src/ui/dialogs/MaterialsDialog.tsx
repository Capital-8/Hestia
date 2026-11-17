import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { materialUsage, newId, type Material } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { cmpTexto, useT, type Dict } from '../../editor/i18n.ts';
import { TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { MaterialPreview, type PreviewShape } from './materials/MaterialPreview.tsx';
import { MaterialList } from './materials/MaterialList.tsx';
import { TexturasOnline } from './materials/TexturasOnline.tsx';
import { TabIdentidade } from './materials/TabIdentidade.tsx';
import { TabGraficos } from './materials/TabGraficos.tsx';
import { TabAparencia } from './materials/TabAparencia.tsx';
import { TabFisico, TabTermico } from './materials/TabNumerica.tsx';
import { agruparPorClasse, atualizarCampo, filtrarMateriais, type Editar } from './materials/materialsLogic.ts';
import './materials/MaterialsNavigator.css';

type Aba = 'identidade' | 'graficos' | 'aparencia' | 'fisico' | 'termico';
const ABAS: readonly Aba[] = ['identidade', 'graficos', 'aparencia', 'fisico', 'termico'];
const ROTULO_ABA: Record<Aba, keyof Dict> = {
  identidade: 'dlt_mat_tab_identity',
  graficos: 'dlt_mat_tab_graphics',
  aparencia: 'dlt_mat_tab_appearance',
  fisico: 'dlt_mat_tab_physical',
  termico: 'dlt_mat_tab_thermal',
};
const FORMAS: readonly PreviewShape[] = ['sphere', 'cube', 'plane'];
const ROTULO_FORMA: Record<PreviewShape, keyof Dict> = { sphere: 'dlt_mat_shape_sphere', cube: 'dlt_mat_shape_cube', plane: 'dlt_mat_shape_plane' };

/**
 * Navegador de materiais único: abre de qualquer campo "material" ou pelo navegador de projeto. Lista à esquerda;
 * à direita, a prévia fixa (com a forma escolhida) e as abas de edição. Cada aba grava só o bloco que mudou.
 */
export function MaterialsDialog({ pickFor, onPick, onClose }: { pickFor?: string | null; onPick?: (id: string) => void; onClose?: () => void }): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const [sel, setSel] = useState<string>(pickFor && p.materials[pickFor] ? pickFor : (Object.keys(p.materials)[0] ?? ''));
  const [q, setQ] = useState('');
  const [aba, setAba] = useState<Aba>('identidade');
  const [forma, setForma] = useState<PreviewShape>('sphere');
  const [cenario, setCenario] = useState(true);
  const [texturas, setTexturas] = useState(false);
  const stored = p.materials[sel];
  const [draft, setDraft] = useState<Material | undefined>(stored ? { ...stored } : undefined);
  useEffect(() => setDraft(p.materials[sel] ? { ...p.materials[sel]! } : undefined), [sel, p.materials]);
  const grupos = useMemo(
    () => agruparPorClasse(filtrarMateriais(Object.values(p.materials), q), (a, b) => cmpTexto(a, b, lang)),
    [p.materials, q, lang],
  );
  const total = Object.keys(p.materials).length;
  const used = draft ? materialUsage(p, draft.id) : 0;
  const abaRefs = useRef<Partial<Record<Aba, HTMLButtonElement | null>>>({});

  const commit = (next: Material | undefined = draft): void => {
    if (next && JSON.stringify(next) !== JSON.stringify(p.materials[next.id])) editor.store.exec({ type: 'upsertMaterial', material: next }, 'undo_edit_material');
  };
  /** Grava um campo de um bloco no rascunho; `agora` confirma no histórico (com undo). */
  const editar: Editar = (bloco, caminho, valor, agora = false) => {
    if (!draft) return;
    const next = atualizarCampo(draft, bloco, caminho, valor);
    setDraft(next);
    if (agora) commit(next);
  };
  const renomear = (nome: string): void => {
    if (draft) commit({ ...draft, name: nome });
  };
  const close = (): void => {
    // Com o painel de texturas aberto, Esc e o ✕ fecham só o painel (ele é tratado à parte).
    if (texturas) return;
    commit();
    if (onClose) onClose();
    else useUi.setState({ dialog: null, dialogArg: null });
  };
  const selecionar = (id: string): void => {
    commit();
    setSel(id);
  };
  const add = (from?: Material): void => {
    commit();
    const m: Material = from
      ? { ...from, id: newId('mat'), name: `${from.name} ${t('dlt_duplicate_suffix')}` }
      : { id: newId('mat'), name: t('dlt_mat_new'), color: '#b9a98f', hatch: 'none', gloss: 0.2, opacity: 1, cost: 0, unit: 'm2' };
    editor.store.exec({ type: 'upsertMaterial', material: m }, 'dlt_mat_new');
    setSel(m.id);
  };

  /** Setas entre as abas (Esquerda/Direita, Início/Fim) movem o foco e selecionam a aba. */
  const teclaAba = (e: KeyboardEvent<HTMLDivElement>): void => {
    const i = ABAS.indexOf(aba);
    let j: number | null = null;
    if (e.key === 'ArrowRight') j = (i + 1) % ABAS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + ABAS.length) % ABAS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = ABAS.length - 1;
    if (j === null) return;
    e.preventDefault();
    const nova = ABAS[j]!;
    setAba(nova);
    abaRefs.current[nova]?.focus();
  };

  const conteudo = (m: Material): ReactElement => {
    switch (aba) {
      case 'identidade': return <TabIdentidade m={m} editar={editar} />;
      case 'graficos': return <TabGraficos m={m} editar={editar} />;
      case 'aparencia': return <TabAparencia m={m} editar={editar} />;
      case 'fisico': return <TabFisico m={m} editar={editar} />;
      case 'termico': return <TabTermico m={m} editar={editar} />;
    }
  };

  // Com o painel de texturas aberto, o trap de Tab fica só com ele (dois traps de foco brigariam).
  return (
    <>
      <Dialog
        title={t('dlt_mat_title')}
        sub={t(total === 1 ? 'dlt_mat_count_one' : 'dlt_mat_count_many', { n: total })}
        onClose={close}
        z={60}
        size="wide"
        trapFocus={!texturas}
        footer={
          <>
            <button className="btn" onClick={() => setTexturas(true)}>{t('dlt_tex_open')}</button>
            {onPick && draft && (
              <button className="btn primary" onClick={() => { commit(); onPick(draft.id); }}>{t('dlt_mat_use')}</button>
            )}
            <button className="btn" onClick={close}>{onPick ? t('stt_cancel') : t('stt_close')}</button>
          </>
        }
      >
        <div className="mat-nav">
          <MaterialList
            grupos={grupos}
            total={total}
            sel={sel}
            q={q}
            onQ={setQ}
            onSelect={selecionar}
            onAdd={() => add()}
            onDuplicate={() => draft && add(draft)}
            canDuplicate={!!draft}
          />
          {draft ? (
            <div className="mat-detalhe" onBlur={() => commit()}>
              <div className="mat-topo">
                <div className="mat-previa">
                  <MaterialPreview material={draft} shape={forma} size={280} cenario={cenario} />
                  <div className="mat-forma" role="group" aria-label={t('dlt_mat_shape_label')}>
                    {FORMAS.map((f) => (
                      <button key={f} className={`btn small${forma === f ? ' primary' : ''}`} aria-pressed={forma === f} onClick={() => setForma(f)}>
                        {t(ROTULO_FORMA[f])}
                      </button>
                    ))}
                    <button className={`btn small${cenario ? ' primary' : ''}`} aria-pressed={cenario} title={t('dlt_mat_cenario_tip')} onClick={() => setCenario((v) => !v)}>
                      {t('dlt_mat_cenario')}
                    </button>
                  </div>
                </div>
                <div className="mat-topo-campos">
                  <div className="field-row">
                    <label htmlFor="mat-name">{t('dlt_fld_name')}</label>
                    <TextField id="mat-name" value={draft.name} onCommit={renomear} />
                  </div>
                </div>
              </div>
              <div className="dtabs" role="tablist" aria-label={t('dlt_mat_tabs_label')} onKeyDown={teclaAba}>
                {ABAS.map((a) => (
                  <button
                    key={a}
                    ref={(el) => { abaRefs.current[a] = el; }}
                    id={`mat-tab-${a}`}
                    role="tab"
                    type="button"
                    aria-selected={aba === a}
                    aria-controls="mat-painel"
                    tabIndex={aba === a ? 0 : -1}
                    className={`dtab${aba === a ? ' on' : ''}`}
                    onClick={() => setAba(a)}
                  >
                    {t(ROTULO_ABA[a])}
                  </button>
                ))}
              </div>
              <div id="mat-painel" role="tabpanel" aria-labelledby={`mat-tab-${aba}`} tabIndex={0}>
                {conteudo(draft)}
              </div>
              <p className="hint" style={{ padding: '6px 0' }}>{t(used === 1 ? 'dlt_mat_usage_one' : 'dlt_mat_usage_many', { n: used })}</p>
            </div>
          ) : (
            <p className="hint">{t('dlt_mat_nothing_selected')}</p>
          )}
        </div>
      </Dialog>
    {texturas ? <TexturasOnline materialSelecionado={stored} onCriado={setSel} onClose={() => setTexturas(false)} /> : null}
    </>
  );
}
