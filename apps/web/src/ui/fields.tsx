import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { formatQuantity, fromDisplay, unitSymbol, type Quantity, type ResolvedUnits } from '@hestia/model';
import { parseNumber, parseQuantityText } from '@hestia/tools';
import { safeGet, safeSet } from '../editor/storage.ts';
import { useUnits } from './useUnits.ts';

// units-ok: número puro (contagem, razão, escala) — não é medida do projeto
const fmt = (v: number, decimals: number): string => v.toFixed(decimals).replace('.', ',');

/** Texto exibido de um campo por grandeza: até 4 casas, sem zeros à direita; vazio se nulo ou variado. */
export function formatQuantityField(units: ResolvedUnits, q: Quantity, si: number | null, mixed: boolean): string {
  return si === null || mixed ? '' : formatQuantity(units, q, si, { withUnit: false, trim: true, decimals: 4 });
}

/** Lê o texto digitado de um campo por grandeza, em metros (SI). */
export function parseQuantityField(units: ResolvedUnits, q: Quantity, text: string): number | null {
  return parseQuantityText(text, units, q);
}

/** Passo das setas/rodinha: 1 unidade do último dígito exibido (ou 1 fração de polegada em `ft-in`). */
export function quantityStep(units: ResolvedUnits, q: Quantity, text: string): number {
  if (q !== 'currency' && units[q].unit === 'ft-in') return 0.3048 / (12 * units[q].denominator);
  const casas = /[.,](\d+)\s*$/.exec(text.trim())?.[1]?.length ?? 0;
  return fromDisplay(units, q, 10 ** -casas);
}

interface NumProps {
  id?: string;
  value: number | null;
  onCommit: (v: number) => void;
  /** Casas decimais de um número puro (sem grandeza do projeto). */
  decimals?: number;
  /** Sufixo de unidade técnica fixa (porcentagem, decibéis, minutos, transmitância) de um número puro. */
  suffix?: string;
  /** Grandeza: exibe e lê na unidade configurada do projeto (SI por dentro). */
  quantity?: Quantity;
  /** Unidade fixa (ex.: `%`, `m`) para campos que não usam grandeza do projeto. */
  unit?: string;
  /** Multiplicador de exibição (ex.: 100 para metros → cm). */
  scale?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  mixed?: boolean;
  width?: number;
  readOnly?: boolean;
  /** Texto mostrado quando o campo está vazio (ex.: o valor herdado do tipo). */
  placeholder?: string;
  /** Campo vazio confirmado: o valor volta a "nenhum" (null). Sem ele, campo vazio não grava nada. */
  onClear?: () => void;
  /** Texto que não é número, ou valor fora de min/max com `strictRange`: avisa, em vez de corrigir em silêncio. */
  onInvalid?: (texto: string, motivo: 'invalido' | 'fora') => void;
  /** Texto novo aceito (mesmo que o valor não mude): serve para limpar um aviso antigo. */
  onValid?: () => void;
  /** Com `strictRange`, valor fora de min/max é recusado (volta o último valor válido) em vez de ser limitado. */
  strictRange?: boolean;
  /** Marca o campo como inválido para leitores de tela (`aria-invalid`). */
  invalid?: boolean;
  /** Id da mensagem de erro ligada ao campo (`aria-describedby`). */
  describedBy?: string;
  /** Dica do campo (por exemplo, a faixa aceita). */
  title?: string;
}

/** Campo numérico que aceita expressões (`3,50+0,15`); confirma com Enter ou ao sair. */
export function NumField({ id, value, onCommit, decimals = 2, suffix, quantity, unit, scale = 1, min, max, disabled, mixed, width, readOnly, placeholder, onClear, onInvalid, onValid, strictRange, invalid, describedBy, title }: NumProps): ReactElement {
  const units = useUnits();
  const ref = useRef<HTMLInputElement>(null);
  const show = (v: number | null): string =>
    quantity
      ? formatQuantityField(units, quantity, v, !!mixed)
      : v === null || mixed
        ? ''
        : unit
          ? fmt(v * scale, decimals)
          : fmt(v, decimals);
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focus, mixed, decimals, quantity, units, unit, scale]);
  const commit = (): void => {
    if (onClear && text.trim() === '') {
      if (text !== show(value)) onClear();
      return;
    }
    const n = parseNumber(text);
    const lido = quantity ? parseQuantityField(units, quantity, text) : n === null ? null : unit ? n / scale : n;
    if (lido === null) {
      onInvalid?.(text, 'invalido');
      setText(show(value));
      return;
    }
    const si = lido;
    if (strictRange && ((min !== undefined && si < min) || (max !== undefined && si > max))) {
      onInvalid?.(text, 'fora');
      setText(show(value));
      return;
    }
    let v = si;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (value === null || Math.abs(v - value) > 1e-9 || mixed) onCommit(v);
    // Texto válido sempre limpa o aviso anterior (inclusive ao sair do campo sem mudar o valor).
    onValid?.();
    setText(show(v));
  };
  const bump = (dir: 1 | -1): void => {
    if (!quantity) return;
    const base = parseQuantityField(units, quantity, text) ?? value ?? 0;
    let v = Math.round((base + dir * quantityStep(units, quantity, text)) * 1e9) / 1e9;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (value === null || Math.abs(v - value) > 1e-9 || mixed) onCommit(v);
    setText(formatQuantityField(units, quantity, v, false));
  };
  const bumpRef = useRef(bump);
  bumpRef.current = bump;
  useEffect(() => {
    const el = ref.current;
    if (!el || !quantity) return;
    const onWheel = (e: WheelEvent): void => {
      if (document.activeElement !== el || !e.deltaY) return;
      e.preventDefault();
      bumpRef.current(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [quantity]);
  const unitLabel = quantity
    ? quantity !== 'currency' && units[quantity].unit === 'ft-in' ? '' : unitSymbol(units, quantity)
    : unit ?? suffix;
  return (
    <span className="numwrap">
      <input
        id={id}
        ref={ref}
        className={`input num${readOnly ? ' ro' : ''}${mixed ? ' mixed' : ''}`}
        style={width ? { width } : undefined}
        value={text}
        title={title}
        placeholder={mixed ? 'variados' : placeholder ?? ''}
        disabled={disabled}
        readOnly={readOnly}
        inputMode="decimal"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onFocus={(e) => {
          setFocus(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocus(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (quantity && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            bump(e.key === 'ArrowUp' ? 1 : -1);
          }
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(show(value));
            (e.target as HTMLInputElement).blur();
          }
          e.stopPropagation();
        }}
      />
      {unitLabel ? <span className="unit">{unitLabel}</span> : null}
    </span>
  );
}

export function TextField({ id, value, onCommit, placeholder, mixed, disabled, invalid, describedBy, dataAutofocus }: { id?: string; value: string; onCommit: (v: string) => void; placeholder?: string; mixed?: boolean; disabled?: boolean; invalid?: boolean; describedBy?: string; dataAutofocus?: boolean }): ReactElement {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      id={id}
      className={`input wide${mixed ? ' mixed' : ''}`}
      value={mixed ? '' : text}
      placeholder={mixed ? 'variados' : placeholder}
      disabled={disabled}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      data-autofocus={dataAutofocus ? '' : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}

export function Check({ id, checked, onChange, children, disabled, mixed }: { id?: string; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean; mixed?: boolean }): ReactElement {
  return (
    <label className="check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = !!mixed;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  );
}

/**
 * Linha da tabela de propriedades: rótulo e valor em duas células. `readOnly` sombreia a linha (valor calculado ou
 * controlado por outro lugar); `fromType` põe o selo "tipo" (o valor vem do tipo: muda-se em Editar tipo).
 */
export function Row({ label, htmlFor, children, readOnly, fromType }: { label: string; htmlFor?: string; children: ReactNode; readOnly?: boolean; fromType?: boolean }): ReactElement {
  return (
    <div className={`prow${readOnly ? ' ro' : ''}`}>
      <label htmlFor={htmlFor} title={label}>
        {label}
        {fromType ? <span className="tmark" title="Parâmetro do tipo — edite em Editar tipo">tipo</span> : null}
      </label>
      <div>{children}</div>
    </div>
  );
}

/**
 * Grupo de propriedades da paleta (Restrições, Dimensões, Identidade...). O aberto/fechado fica guardado no navegador
 * pelo título: o grupo fechado continua fechado ao trocar de seleção, que é o que mantém a paleta compacta (padrão do
 * Revit). O título é a chave, então grupos de mesmo nome em painéis diferentes compartilham o estado.
 */
export function Group({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }): ReactElement {
  const key = `pgroup:${title}`;
  const [isOpen, setOpen] = useState<boolean>(() => {
    const saved = safeGet(key);
    return saved === null ? open : saved === '1';
  });
  return (
    <details
      className="pgroup"
      open={isOpen}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        safeSet(key, next ? '1' : '0');
      }}
    >
      <summary>{title}</summary>
      {children}
    </details>
  );
}
