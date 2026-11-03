import type { Peca } from '@hestia/model';
import type { ReactElement } from 'react';

/** Usinagens da peça selecionada (grupo das propriedades). BASE provisória: a ficha E5-ui a reescreve (lista, adicionar, editar, excluir). */
export function FamiliaUsinagens({ peca }: { peca: Peca }): ReactElement {
  return <div className="fam-grp"><div className="fam-gh">Usinagens</div><div className="fam-hint">{(peca.usinagens ?? []).length} usinagem(ns). Edição em construção (ficha E5-ui).</div></div>;
}
