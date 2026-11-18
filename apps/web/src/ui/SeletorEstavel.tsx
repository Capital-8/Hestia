import { memo, useCallback, useRef, type ReactElement } from 'react';

export interface OpcaoSeletor {
  valor: string;
  rotulo: string;
  desabilitada?: boolean;
  /** Opções vizinhas com o mesmo `grupo` entram num `<optgroup>`. */
  grupo?: string;
}

interface Props {
  id?: string;
  className?: string;
  value: string;
  opcoes: readonly OpcaoSeletor[];
  onChange: (valor: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

type PropsNativo = Omit<Props, 'onChange'> & { onChange: (valor: string) => void };

const opcao = (o: OpcaoSeletor): ReactElement => <option key={o.valor} value={o.valor} disabled={o.desabilitada}>{o.rotulo}</option>;

const blocos = (opcoes: readonly OpcaoSeletor[]): Array<{ grupo?: string; itens: OpcaoSeletor[] }> => {
  const r: Array<{ grupo?: string; itens: OpcaoSeletor[] }> = [];
  for (const o of opcoes) {
    const ultimo = r[r.length - 1];
    if (ultimo !== undefined && ultimo.grupo === o.grupo && o.grupo !== undefined) ultimo.itens.push(o);
    else r.push({ grupo: o.grupo, itens: [o] });
  }
  return r;
};

const iguais = (a: readonly OpcaoSeletor[], b: readonly OpcaoSeletor[]): boolean =>
  a === b || (a.length === b.length && a.every((o, i) => o.valor === b[i]!.valor && o.rotulo === b[i]!.rotulo && o.desabilitada === b[i]!.desabilitada && o.grupo === b[i]!.grupo));

/**
 * `<select>` nativo que o React só toca quando o valor, as opções ou o estado mudam de verdade. Em todo commit que atualiza um
 * `<select>` controlado o React reatribui `option.selected`, e o Chrome FECHA a lista nativa aberta por causa disso: qualquer
 * re-render do painel (seleção adiada, versão do projeto, tick do 3D) fazia a lista "fechar sozinha". Aqui o nó nativo é memoizado
 * e o `onChange` vai por referência estável, então re-render do painel não gera commit no `<select>`.
 */
const Nativo = memo(function Nativo({ id, className, value, opcoes, onChange, ariaLabel, disabled }: PropsNativo): ReactElement {
  return (
    <select id={id} className={className ?? 'select'} value={value} aria-label={ariaLabel} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {blocos(opcoes).map((b) => (b.grupo === undefined
        ? b.itens.map(opcao)
        : <optgroup key={`g:${b.grupo}`} label={b.grupo}>{b.itens.map(opcao)}</optgroup>))}
    </select>
  );
}, (a, b) => a.id === b.id && a.className === b.className && a.value === b.value && a.ariaLabel === b.ariaLabel && a.disabled === b.disabled && a.onChange === b.onChange && iguais(a.opcoes, b.opcoes));

export function SeletorEstavel({ onChange, ...resto }: Props): ReactElement {
  const ultimo = useRef(onChange);
  ultimo.current = onChange;
  const estavel = useCallback((v: string) => ultimo.current(v), []);
  return <Nativo {...resto} onChange={estavel} />;
}
