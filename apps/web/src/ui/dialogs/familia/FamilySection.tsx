import type { ReactElement, ReactNode } from 'react';

interface FamilySectionProps {
  title: string;
  id?: string;
  /** Recolhível (padrão). Falso: título fixo, sem seta (ex.: bloco curto de parâmetros). */
  collapsible?: boolean;
  /** Começa aberta (padrão: sim). Só vale para seção recolhível. */
  defaultOpen?: boolean;
  /** Botões à direita do título (ex.: Remover). */
  actions?: ReactNode;
  children: ReactNode;
}

/** Seção do diálogo de tipo: título em caixa alta pequena e, por padrão, recolhível. */
export function FamilySection({ title, id, collapsible = true, defaultOpen = true, actions, children }: FamilySectionProps): ReactElement {
  if (!collapsible) {
    return (
      <fieldset className="fam-sec fixed" id={id}>
        <legend>{title}</legend>
        {children}
      </fieldset>
    );
  }
  return (
    <details className="fam-sec" id={id} open={defaultOpen}>
      <summary>
        <span className="fam-sec-title">{title}</span>
        {actions ? <span className="fam-sec-actions" onClick={(e) => e.preventDefault()}>{actions}</span> : null}
      </summary>
      <div className="fam-sec-body">{children}</div>
    </details>
  );
}
