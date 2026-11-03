import type { ReactElement } from 'react';
import { ModelosNovo } from './FamiliaModelos.tsx';
import { Janela } from './FamiliaJanela.tsx';

/** Novo módulo (diálogo). BASE provisória (galeria de desenhos sem ação): a ficha E7-ui a reescreve com a biblioteca base de verdade. */
export function FamiliaNovo(): ReactElement {
  return (
    <Janela titulo="Novo ▸ Família ▸ Escolha o modelo" larga rodape={<span className="fam-mut">O modelo só preenche parâmetros, peças e fórmulas; nada fica preso a ele.</span>}>
      <ModelosNovo />
    </Janela>
  );
}
