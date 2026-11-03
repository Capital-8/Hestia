import type { ReactElement } from 'react';
import { Janela } from './FamiliaJanela.tsx';

/** Abrir e salvar famílias em arquivo `hestia-familia` (diálogo). BASE provisória: a ficha E7-ui a reescreve. */
export function FamiliaArquivo(): ReactElement {
  return <Janela titulo="Família ▸ Abrir e salvar"><div className="fam-hint">Em construção (ficha E7-ui).</div></Janela>;
}
