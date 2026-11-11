import type { ReactElement, ReactNode } from 'react';
import { Check } from '../../fields.tsx';

interface FamilyRowProps {
  label: string;
  htmlFor?: string;
  /** Dica ao passar o mouse no rótulo. */
  title?: string;
  /** Mensagem sob a linha (erro ou aviso). */
  message?: ReactNode;
  messageId?: string;
  messageWarn?: boolean;
  /** Linha esmaecida (campo desligado por outro controle). Uma só opacidade: não some o `disabled` do campo. */
  dim?: boolean;
  children: ReactNode;
}

/**
 * Linha do diálogo de tipo: rótulo (coluna fixa) e controle (coluna ao lado, sempre no mesmo x). Vários filhos ficam
 * lado a lado na coluna do controle (ex.: seletor e botão).
 */
export function FamilyRow({ label, htmlFor, title, message, messageId, messageWarn, dim, children }: FamilyRowProps): ReactElement {
  return (
    <div className={dim ? 'fam-row dim' : 'fam-row'}>
      <div className="field-row">
        <label htmlFor={htmlFor} title={title}>{label}</label>
        <div className="fam-ctl">{children}</div>
      </div>
      {message ? <div className={messageWarn ? 'vr-error warn' : 'vr-error'} id={messageId}>{message}</div> : null}
    </div>
  );
}

interface FamilyCheckProps {
  id?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Linha esmaecida (padrão: esmaece quando desabilitada). */
  dim?: boolean;
  title?: string;
  /** Algo logo depois do texto (ex.: selo de aviso). */
  after?: ReactNode;
  /** Texto da caixa. */
  children: ReactNode;
}

/**
 * Caixa de seleção do diálogo de tipo: a caixa fica na coluna do controle (no mesmo x dos campos) e o texto vai ao lado;
 * a coluna do rótulo fica vazia. É o único jeito de pôr um check nesses diálogos.
 */
export function FamilyCheck({ id, checked, onChange, disabled, dim, title, after, children }: FamilyCheckProps): ReactElement {
  return (
    <div className={(dim ?? disabled) ? 'fam-row fam-check dim' : 'fam-row fam-check'} title={title}>
      <div className="field-row">
        <span aria-hidden="true" />
        <div className="fam-ctl">
          <Check id={id} checked={checked} onChange={onChange} disabled={disabled}>{children}</Check>
          {after}
        </div>
      </div>
    </div>
  );
}

/**
 * Campos curtos lado a lado (FamilyRow dentro): o 1º cai no mesmo x das linhas simples e o 2º tem rótulo de largura fixa,
 * então todo par do diálogo alinha. Em tela estreita voltam a uma coluna.
 */
export function FamilyPair({ children }: { children: ReactNode }): ReactElement {
  return <div className="fam-pair">{children}</div>;
}

type HintTone = 'faint' | 'strong' | 'warn' | 'title';

/** Texto de ajuda compacto, sem o espaçamento largo do .hint comum. `tone` troca só a cor e o peso. */
export function FamilyHint({ children, warn, tone, role }: { children: ReactNode; warn?: boolean; tone?: HintTone; role?: 'status' | 'alert' }): ReactElement {
  const t = warn ? 'warn' : tone;
  return <p className={t ? `fam-hint ${t}` : 'fam-hint'} role={role}>{children}</p>;
}

/** Fileira de botões do diálogo (ex.: "Novo corrimão"), alinhada à esquerda, com espaço fixo entre eles. */
export function FamilyActions({ children }: { children: ReactNode }): ReactElement {
  return <div className="fam-actions">{children}</div>;
}

/** Resultado calculado (só leitura): rótulo à esquerda e valor em fonte mono à direita. */
export function FamilyReadout({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div className="fam-readout">
      <span className="lbl">{label}</span>
      <span className="val">{value}</span>
    </div>
  );
}

/** Duas colunas do diálogo de tipo: campos à esquerda e prévia (fixa ao rolar) à direita. */
export function FamilySplit({ main, side }: { main: ReactNode; side: ReactNode }): ReactElement {
  return (
    <div className="fam-split">
      <div className="fam-split-main">{main}</div>
      <div className="fam-split-side">{side}</div>
    </div>
  );
}
