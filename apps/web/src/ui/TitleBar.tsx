import { useRef, type ReactElement } from 'react';
import { areaPlanOf, sheetOf, type Project } from '@hestia/model';
import { editor, useProject, useProjectVersion } from '../editor/controller.ts';
import { openProjectFile } from '../editor/fileActions.ts';
import { useI18n } from '../editor/i18n.ts';
import { toggleFileMenu, useUi } from '../editor/state.ts';
import type { PlanKind } from '../editor/openViews.ts';
import { Icon } from './Icon.tsx';
import { InfoCenter } from './InfoCenter.tsx';
import { act, tool, type RibbonItem } from './ribbon/model.ts';
import { QuickButton } from './ribbon/parts.tsx';
import { FitRow, type FitItem } from './ribbon/FitRow.tsx';
import { useRibbonCtx } from './ribbon/useCtx.ts';

/** Barra de Acesso Rápido: só ícones, os mesmos comandos da faixa (Medir, Cota, Texto, 3D, Corte, Linhas finas). */
const QUICK: RibbonItem[] = [tool('measure', 'small'), tool('dimension', 'small'), tool('text', 'small'), act('view3d', 'small'), tool('section', 'small'), act('thinLines', 'small')];

/** "Planta de piso: Térreo", "Planta de cobertura: Cobertura", "Vista 3D: Modelo 3D"… como o Revit mostra na barra de título. */
function viewTitle(p: Project, view: string, levelId: string, sectionId: string | null, sheetId: string | null, pt: boolean, planKind: PlanKind, areaPlanId: string | null): string {
  if (view === '3d') return pt ? 'Vista 3D: Modelo 3D' : '3D View: 3D Model';
  if (view === 'section') {
    const v = p.views.find((x) => x.id === sectionId);
    return `${v?.kind === 'elevation' ? (pt ? 'Elevação' : 'Elevation') : pt ? 'Corte' : 'Section'}: ${v?.name ?? ''}`;
  }
  if (view === 'sheet') {
    const sh = sheetId ? sheetOf(p, sheetId) : undefined;
    return `${pt ? 'Prancha' : 'Sheet'}: ${sh ? `${sh.number} ${sh.name}` : ''}`;
  }
  if (planKind === 'area') {
    const ap = areaPlanId ? areaPlanOf(p, areaPlanId) : undefined;
    return `${pt ? 'Planta de área' : 'Area Plan'}: ${ap?.name ?? ''}`;
  }
  const tipo = planKind === 'roof' ? (pt ? 'Planta de cobertura' : 'Roof Plan') : pt ? 'Planta de piso' : 'Floor Plan';
  return `${tipo}: ${p.levels.find((l) => l.id === levelId)?.name ?? ''}`;
}

/**
 * Barra de título como no Revit: menu Arquivo, acesso rápido, nome da vista e centro de informações.
 * O acesso rápido usa o mesmo `FitRow` da faixa: quando não cabe, os comandos menos usados vão para o "»"
 * em vez de sair da tela. Assim nenhum comando desaparece em janelas estreitas.
 */
export function TitleBar(): ReactElement {
  const project = useProject();
  useProjectVersion();
  const ctx = useRibbonCtx();
  const lang = useI18n((s) => s.lang);
  const pt = lang === 'pt';
  const sectionId = useUi((s) => s.sectionId);
  const sheetId = useUi((s) => s.sheetId);
  const planKind = useUi((s) => s.planKind);
  const areaPlanId = useUi((s) => s.areaPlanId);
  const fileRef = useRef<HTMLInputElement>(null);
  const store = editor.store;
  const title = `Hestia - [${project.name}${store.dirty ? ' *' : ''}] - ${viewTitle(project, ctx.view, ctx.levelId, sectionId, sheetId, pt, planKind, areaPlanId)}`;
  const open = pt ? 'Abrir' : 'Open';
  const save = pt ? 'Salvar' : 'Save';
  const undo = pt ? 'Desfazer' : 'Undo';
  const redo = pt ? 'Refazer' : 'Redo';
  const sep = <span className="vsep" />;
  // Prioridades: abrir/salvar e desfazer/refazer ficam; as ferramentas rápidas saem primeiro para o "»".
  const qat: FitItem[] = [
    { key: 'open', priority: 5, node: <button className="qbtn" onClick={() => fileRef.current?.click()} title={open} aria-label={open}><Icon name="qopen" size={18} /></button> },
    { key: 'save', priority: 5, node: <button className="qbtn" onClick={() => void editor.save()} title={`${save} (Ctrl+S)`} aria-label={save}><Icon name="qsave" size={18} /></button> },
    { key: 'undo', priority: 4, node: <>{sep}<button className="qbtn" disabled={!store.canUndo} onClick={() => editor.undo()} title={store.undoLabel ? `${undo}: ${store.undoLabel} (Ctrl+Z)` : undo} aria-label={undo}><Icon name="qundo" size={18} /></button></> },
    { key: 'redo', priority: 4, node: <button className="qbtn" disabled={!store.canRedo} onClick={() => editor.redo()} title={store.redoLabel ? `${redo}: ${store.redoLabel} (Ctrl+Y)` : redo} aria-label={redo}><Icon name="qredo" size={18} /></button> },
    ...QUICK.map((it, i) => ({
      key: `quick-${i}`,
      priority: i < 3 ? 2 : 1,
      node: <>{i === 0 ? sep : null}<QuickButton item={it} ctx={ctx} lang={lang} /></>,
    })),
  ];
  return (
    <header className="titlebar">
      <button className="app-h" onClick={toggleFileMenu} title={pt ? 'Menu Arquivo' : 'File menu'} aria-label={pt ? 'Menu Arquivo' : 'File menu'}>H</button>
      <FitRow
        className="qat"
        role="toolbar"
        ariaLabel={pt ? 'Barra de acesso rápido' : 'Quick access toolbar'}
        items={qat}
        moreLabel={pt ? 'Mais comandos de acesso rápido' : 'More quick access commands'}
        moreContent="»"
        popClass="qat-pop"
      />
      <input ref={fileRef} id="file-open" type="file" accept=".json,.hestia,application/json" hidden onChange={(e) => { void openProjectFile(e.target.files?.[0]); e.target.value = ''; }} />
      <span className="tb-title" title={title}>{title}</span>
      <InfoCenter />
    </header>
  );
}
