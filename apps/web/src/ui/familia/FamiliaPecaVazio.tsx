import type { Peca } from '@hestia/model';
import type { ReactElement } from 'react';
import { executarPeca } from './familiaPecaAviso.ts';

/** Caixa "Vazio" das propriedades da peça: `Peca.vazio` subtrai o sólido dos demais (estilo Revit), com desfazer. */

export function FamiliaPecaVazio({ peca }: { peca: Peca }): ReactElement {
  const alternar = (vazio: boolean): void => {
    executarPeca(vazio ? 'Marcar peça vazia' : 'Desmarcar peça vazia', (f) => {
      const alvo = f.pecas.find((x) => x.id === peca.id);
      if (alvo === undefined) return `peça “${peca.id}” não existe`;
      if (vazio) alvo.vazio = true;
      else delete alvo.vazio;
      return null;
    });
  };
  const id = `pc-${peca.id}-vazio`;
  return (
    <div className="fam-row">
      <label htmlFor={id} className="fam-vazio-rotulo">
        <input id={id} type="checkbox" checked={peca.vazio === true} onChange={(e) => alternar(e.target.checked)} />
        {' '}Vazio (subtrai dos sólidos)
      </label>
    </div>
  );
}
