import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import { filterTypeChoices, groupTypeChoices } from './typeSelectorModel.ts';
import { TypeThumb, type PreviewSubject } from './TypePreview.tsx';

/** Um tipo na lista do seletor: os campos de busca, a família do agrupamento e o que a prévia desenha. */
export interface TypeOption {
  id: string;
  name: string;
  code: string;
  family: string;
  subject: PreviewSubject;
}

interface TypeSelectorProps {
  /** Id do botão do seletor (o mesmo que o `<select>` antigo tinha: testes e atalhos dependem dele). */
  triggerId: string;
  /** Nome acessível do seletor, como "Tipo de parede". */
  label: string;
  /** Rótulo da categoria no filtro, como "Paredes (3)" ou "Colocar Porta". */
  categoryLabel: string;
  options: TypeOption[];
  /** Tipo da seleção; null quando os elementos têm tipos variados. */
  selectedId: string | null;
  /** Favoritos (aberturas): sobem para o grupo "★ Favoritos" no topo da lista. */
  favoriteIds?: readonly string[];
  /** Seletor inteiro desativado (ex.: sem seleção compatível). */
  disabled?: boolean;
  /** Botão "Editar tipo" desativado (ex.: tipos variados). */
  editDisabled?: boolean;
  onSelect: (id: string) => void;
  onEdit: () => void;
}

/**
 * Seletor de tipo da paleta de propriedades (o Type Selector do Revit): botão de dois níveis
 * (família em negrito e tipo embaixo) com miniatura, lista com busca e agrupada por família, e a linha de filtro com
 * a categoria e o "Editar tipo". A lista fecha com Esc, com clique fora ou ao escolher um tipo.
 */
export function TypeSelector({ triggerId, label, categoryLabel, options, selectedId, favoriteIds, disabled, editDisabled, onSelect, onEdit }: TypeSelectorProps): ReactElement {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuMax, setMenuMax] = useState(430);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = selectedId === null ? null : options.find((o) => o.id === selectedId) ?? null;
  const groups = groupTypeChoices(filterTypeChoices(options, query), favoriteIds);

  // Clique fora do seletor fecha a lista (o clique dentro, no botão ou na lista, não conta).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (focusTrigger: boolean): void => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  };
  const pick = (id: string): void => {
    close(true);
    if (id !== selectedId) onSelect(id);
  };
  // Teclas do menu não chegam aos atalhos globais do editor (o mesmo cuidado do campo de busca da barra de opções).
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    }
  };

  return (
    <div className="rv-type">
      <div className="rv-stick">
        <div className="rv-tsel-wrap" ref={wrapRef}>
          <button
            id={triggerId}
            ref={triggerRef}
            type="button"
            className="rv-tsel"
            aria-label={label}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => {
              // A lista é cortada pela paleta: limita a altura ao espaço que sobra abaixo do botão.
              const room = (wrapRef.current?.closest('aside') ?? document.body).getBoundingClientRect().bottom - (triggerRef.current?.getBoundingClientRect().bottom ?? 0);
              setMenuMax(Math.max(160, Math.min(430, room - 10)));
              setOpen((o) => !o);
              setQuery('');
            }}
          >
            {selected ? <TypeThumb subject={selected.subject} /> : null}
            <span className="two">
              <b>{selected ? selected.family : selectedId === null && options.length ? t('prc_opt_varied') : '—'}</b>
              <span>{selected ? selected.name : ''}</span>
            </span>
            <span className="chev" aria-hidden="true">▼</span>
          </button>
          {open && (
            <div className="rv-menu" style={{ maxHeight: menuMax }} onKeyDown={onMenuKey}>
              <input
                className="search"
                type="text"
                aria-label={t('prc_aria_search_types')}
                placeholder={t('prc_ph_search_types')}
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="list" role="listbox" aria-label={label}>
                {groups.map((g) => (
                  <div key={g.family} role="presentation">
                    <div className="fam" role="presentation">{g.family}</div>
                    {g.items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="option"
                        aria-selected={t.id === selectedId}
                        className={`opt${t.id === selectedId ? ' on' : ''}`}
                        onClick={() => pick(t.id)}
                      >
                        <TypeThumb subject={t.subject} />
                        <span className="n">{t.name}</span>
                        <span className="c">{t.code}</span>
                      </button>
                    ))}
                  </div>
                ))}
                {groups.length === 0 && <div className="empty">{t('prc_msg_no_types_found')}</div>}
              </div>
            </div>
          )}
        </div>
        <div className="rv-filter">
          <span className="filt">{categoryLabel}</span>
          <button id={`${triggerId}-edit`} type="button" className="edit" disabled={editDisabled} onClick={onEdit}>✎ {t('edit_type_btn')}</button>
        </div>
      </div>
    </div>
  );
}
