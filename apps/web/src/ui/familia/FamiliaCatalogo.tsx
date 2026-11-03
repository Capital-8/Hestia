import type { ReactElement } from 'react';
import { Janela } from './FamiliaJanela.tsx';

/** Catálogo de chapas, fitas e ferragens (diálogo). BASE provisória: a ficha E5-ui a reescreve (tabelas editáveis, importar e exportar). */
export function FamiliaCatalogo(): ReactElement {
  return <Janela titulo="Catálogo de marcenaria" larga><div className="fam-hint">Em construção (ficha E5-ui).</div></Janela>;
}
