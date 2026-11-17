import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { areaPlanToolAllowed, editor } from '../../editor/controller.ts';
import { useAtalhos } from '../../editor/shortcutConfig.ts';
import { t, toolLabel, type Lang } from '../../editor/i18n.ts';
import { useUi, type ViewKind } from '../../editor/state.ts';
import { runPluginCommand } from '../../plugins/registry.ts';
import { Icon } from '../Icon.tsx';
import { ACTIONS, type RibbonCtx } from './actions.ts';
import { estadoNoEsboco } from './perimeterFace.ts';
import { toolDisabledOnSheet } from './sheetTools.ts';
import { txt, type RibbonItem, type RibbonPanel, type Size } from './model.ts';

/** Tudo que um botão da faixa precisa para se desenhar e reagir; vem de `useFace` a partir do item do modelo. */
interface Face {
  icon: string;
  label: string;
  title: string;
  on: boolean;
  /** Não existe ainda (esmaecido, sem clique). */
  soon: boolean;
  /** Existe, mas não pode rodar agora (ex.: sem seleção). */
  disabled: boolean;
  onClick: () => void;
}

/**
 * Resolve rótulo, ícone, tooltip, estado e clique de um item folha (ferramenta, ação, opção ou "em breve"). Com o modo de
 * perímetro aberto, `estadoNoEsboco` põe o que o esboço pede (comando ligado, item desabilitado e o motivo).
 */
function useFace(entry: RibbonItem, ctx: RibbonCtx, lang: Lang): Face {
  const item = entry.kind === 'split' ? entry.main : entry;
  const toolId = item.kind === 'tool' ? item.tool : null;
  const atalhoDe = toolId ?? (item.kind === 'action' ? ACTIONS[item.action].shortcut : undefined);
  const active = useUi((s) => toolId !== null && (s.tool === toolId || (toolId === 'align' && s.view === 'sheet' && s.sheetAlign) || (toolId === 'move' && s.view === 'sheet' && s.sheetMove)));
  const sc = useAtalhos((s) => (atalhoDe ? s.mapa[atalhoDe] : undefined));
  const view = useUi((s) => s.view);
  const face = faceBase(item, ctx, lang, view, active, sc);
  const noEsboco = estadoNoEsboco(item, ctx);
  if (!noEsboco) return face;
  return { ...face, on: noEsboco.on, disabled: noEsboco.disabled, title: noEsboco.motivo ? `${face.label}\n— ${noEsboco.motivo}` : face.title };
}

/**
 * Rótulo, tooltip, estado e clique de um item fora do modo de perímetro (ou sem regra própria dele). Com a prancha aberta,
 * a ferramenta que não age sobre ela fica desabilitada e o tooltip diz o motivo (decisão 0039).
 */
function faceBase(item: RibbonItem, ctx: RibbonCtx, lang: Lang, view: ViewKind, active: boolean, sc: string | undefined): Face {
  switch (item.kind) {
    case 'tool': {
      const label = item.label ? txt(item.label, lang) : toolLabel(item.tool, lang);
      const titulo = sc ? `${label} (${sc})` : label;
      // Planta de área: só anotação (o controlador também recusa, inclusive por atalho).
      const blocked = ctx.planKind === 'area' && view !== '3d' && !areaPlanToolAllowed(item.tool);
      const disabled = blocked || toolDisabledOnSheet(view, item.tool);
      const why = t(lang, blocked ? 'shr_area_plan_hint' : 'shr_not_for_sheets');
      return {
        icon: item.icon ?? item.tool, label,
        title: disabled ? `${titulo} — ${why}` : titulo,
        on: active, soon: false, disabled,
        onClick: () => {
          // Desabilitado, o clique não faz nada (o botão também já o bloqueia).
          if (disabled) return;
          const s = useUi.getState();
          // Na prancha, Mover e Alinhar agem sobre as vistas (decisão 0039); o resto do modelo não se aplica.
          if (s.view === 'sheet') {
            if (item.tool === 'move') {
              useUi.setState({ sheetMove: !s.sheetMove, sheetAlign: false });
              return;
            }
            if (item.tool === 'align') {
              useUi.setState({ sheetAlign: !s.sheetAlign, sheetMove: false });
              return;
            }
            if (item.tool === 'select') {
              useUi.setState({ sheetAlign: false, sheetMove: false });
            }
          }
          editor.setTool(item.tool);
        },
      };
    }
    case 'action': {
      const def = ACTIONS[item.action];
      const label = txt(item.label ?? def.label, lang);
      const why = def.disabled?.(ctx) || false;
      const hint = def.hint ? `\n${txt(def.hint, lang)}` : '';
      const atalho = def.shortcut ? sc : def.keys;
      return { icon: def.icon, label, title: `${label}${atalho ? ` (${atalho})` : ''}${hint}${why ? `\n— ${txt(why, lang)}` : ''}`, on: def.pressed?.(ctx) ?? false, soon: false, disabled: why !== false, onClick: def.run };
    }
    case 'option': {
      const label = txt(item.label, lang);
      return {
        icon: item.icon, label, title: label, on: item.test(ctx.options), soon: false, disabled: false,
        onClick: () => {
          useUi.setState((s) => ({ options: { ...s.options, ...item.patch } }));
          if (item.restart) editor.setTool(item.restart);
        },
      };
    }
    case 'plugin': {
      // SUPLEMENTOS: o botão só chama o registro; a permissão e a existência do comando são conferidas lá.
      const label = txt(item.label, lang);
      return { icon: item.icon ?? 'component', label, title: label, on: false, soon: false, disabled: false, onClick: () => runPluginCommand(item.command) };
    }
    case 'soon': {
      const label = txt(item.label, lang);
      return { icon: item.icon ?? 'soon', label, title: `${label}\n— ${t(lang, 'shr_soon_unavailable')}`, on: false, soon: true, disabled: true, onClick: () => undefined };
    }
    case 'split':
    case 'stack':
      return { icon: 'soon', label: '', title: '', on: false, soon: true, disabled: true, onClick: () => undefined };
  }
}

const cls = (...c: Array<string | false>): string => c.filter(Boolean).join(' ');

/**
 * Botão de uma peça só. O grande mostra ícone e rótulo; o pequeno é só ícone (o rótulo vai no tooltip e no aria-label,
 * com o atalho quando há), como no Revit.
 */
function Btn({ f, size, arrow = false }: { f: Face; size: Size; arrow?: boolean }): ReactElement {
  const large = size === 'large';
  return (
    <button className={cls('rb-btn', large ? 'rb-large' : 'rb-small rb-iconly', f.on && 'on', f.soon && 'soon')} title={f.title} aria-label={f.label} aria-pressed={f.on || undefined} disabled={f.disabled} onClick={f.onClick}>
      <Icon name={f.icon} size={large ? 28 : 16} />
      {large && <span className="rb-lbl">{f.label}{arrow ? ' ▾' : ''}</span>}
    </button>
  );
}

/** Menu suspenso fixo na tela (a faixa rola na horizontal e cortaria um menu posicionado dentro dela). */
function Menu({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: ReactElement[] }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 1 });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.max(4, Math.min(anchor.left, window.innerWidth - r.width - 4)), top: Math.min(anchor.bottom + 1, window.innerHeight - r.height - 4) });
  }, [anchor]);
  useEffect(() => {
    const down = (e: PointerEvent): void => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key, true); window.removeEventListener('blur', onClose); };
  }, [onClose]);
  return createPortal(<div ref={ref} className="rb-menu" role="menu" style={pos}>{children}</div>, document.body);
}

function MenuEntry({ item, ctx, lang, close }: { item: RibbonItem; ctx: RibbonCtx; lang: Lang; close: () => void }): ReactElement {
  const f = useFace(item, ctx, lang);
  return (
    <button role="menuitem" className={cls('rb-menuitem', f.on && 'on', f.soon && 'soon')} title={f.title} disabled={f.disabled} onClick={() => { close(); f.onClick(); }}>
      <Icon name={f.icon} size={20} />
      <span>{f.label}</span>
      {f.soon && <em>{t(lang, 'shr_soon_tag')}</em>}
    </button>
  );
}

/**
 * Botão dividido: o ícone roda a variante padrão (`main`); o rótulo com ▾ abre as variantes. No tamanho pequeno,
 * o ▾ é um botão estreito ao lado. O menu abre sempre abaixo do conjunto.
 */
function Split({ item, ctx, lang }: { item: Extract<RibbonItem, { kind: 'split' }>; ctx: RibbonCtx; lang: Lang }): ReactElement {
  const f = useFace(item.main, ctx, lang);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const label = item.label ? txt(item.label, lang) : f.label;
  const open = (): void => setAnchor(box.current?.getBoundingClientRect() ?? null);
  const menu = anchor && (
    <Menu anchor={anchor} onClose={() => setAnchor(null)}>
      {item.menu.map((m, i) => <MenuEntry key={i} item={m} ctx={ctx} lang={lang} close={() => setAnchor(null)} />)}
    </Menu>
  );
  if (item.size === 'small') {
    return (
      <div ref={box} className="rb-split small">
        <button className={cls('rb-btn rb-small rb-iconly', f.on && 'on')} title={f.title} aria-label={label} disabled={f.disabled} onClick={f.onClick}>
          <Icon name={f.icon} size={16} />
        </button>
        <button className="rb-btn rb-arrow" aria-haspopup="menu" aria-label={label} onClick={open}>▾</button>
        {menu}
      </div>
    );
  }
  return (
    <div ref={box} className={cls('rb-split large', f.on && 'on')}>
      <button className="rb-btn rb-large rb-top" title={f.title} aria-label={label} disabled={f.disabled} onClick={f.onClick}>
        <Icon name={f.icon} size={28} />
      </button>
      <button className="rb-btn rb-bottom" aria-haspopup="menu" title={f.title} onClick={open}>
        <span className="rb-lbl">{label} ▾</span>
      </button>
      {menu}
    </div>
  );
}

export function ItemView({ item, ctx, lang }: { item: RibbonItem; ctx: RibbonCtx; lang: Lang }): ReactElement {
  if (item.kind === 'stack') {
    return <div className="rb-stack">{item.items.slice(0, 3).map((it, i) => <ItemView key={i} item={it} ctx={ctx} lang={lang} />)}</div>;
  }
  if (item.kind === 'split') return <Split item={item} ctx={ctx} lang={lang} />;
  return <Leaf item={item} ctx={ctx} lang={lang} />;
}

function Leaf({ item, ctx, lang }: { item: RibbonItem; ctx: RibbonCtx; lang: Lang }): ReactElement {
  const f = useFace(item, ctx, lang);
  return <Btn f={f} size={item.kind === 'stack' ? 'small' : item.size} />;
}

export function PanelView({ panel, ctx, lang }: { panel: RibbonPanel; ctx: RibbonCtx; lang: Lang }): ReactElement {
  return (
    <div className="rb-panel" role="group" aria-label={txt(panel.title, lang)}>
      <div className="rb-cols">{panel.items.map((it, i) => <ItemView key={i} item={it} ctx={ctx} lang={lang} />)}</div>
      <div className="rb-title">{txt(panel.title, lang)}</div>
    </div>
  );
}

/** Botão só de ícone (barra de acesso rápido), com o mesmo comportamento dos botões da faixa. */
export function QuickButton({ item, ctx, lang }: { item: RibbonItem; ctx: RibbonCtx; lang: Lang }): ReactElement {
  const f = useFace(item, ctx, lang);
  return (
    <button className={cls('qbtn', f.on && 'on')} title={f.title} aria-label={f.label} aria-pressed={f.on || undefined} disabled={f.disabled} onClick={f.onClick}>
      <Icon name={f.icon} size={18} />
    </button>
  );
}
