import type { ReactElement, ReactNode } from 'react';

interface FamilyRowProps {
  label: string;
  htmlFor?: string;
  /** Dica ao passar o mouse no rótulo. */
  title?: string;
  /** Mensagem sob a linha (erro ou aviso). */
  message?: ReactNode;
  messageId?: string;
  messageWarn?: boolean;
  children: ReactNode;
}

/** Linha do diálogo de tipo: rótulo e campo na mesma linha (o "field-row" da parede). */
export function FamilyRow({ label, htmlFor, title, message, messageId, messageWarn, children }: FamilyRowProps): ReactElement {
  return (
    <div className="fam-row">
      <div className="field-row">
        <label htmlFor={htmlFor} title={title}>{label}</label>
        {children}
      </div>
      {message ? <div className="vr-error" id={messageId} style={messageWarn ? { color: 'var(--warn)' } : undefined}>{message}</div> : null}
    </div>
  );
}

/**
 * Campos curtos lado a lado (FamilyRow dentro); em tela estreita voltam a uma coluna. Com `mix`, o rótulo é estreito e o
 * campo ocupa o resto (para um seletor ao lado de um número).
 */
export function FamilyPair({ children, mix }: { children: ReactNode; mix?: boolean }): ReactElement {
  return <div className={mix ? 'fam-pair mix' : 'fam-pair'}>{children}</div>;
}

/** Texto de ajuda compacto, sem o espaçamento largo do .hint comum. */
export function FamilyHint({ children, warn }: { children: ReactNode; warn?: boolean }): ReactElement {
  return <p className="fam-hint" style={warn ? { color: 'var(--warn)' } : undefined}>{children}</p>;
}
