import type { Catalogo } from '@hestia/model';
import type { ReactElement } from 'react';
import { CampoNumero, CampoTexto } from './FamiliaParametrosCampos.tsx';
import { adicionarFita, atualizarFitaEm, removerFitaEm, type CampoFita } from './familiaCatalogo.ts';

/** Aba Fitas do catálogo: tabela editável com espessura, altura e custo por metro. */

interface Props {
  catalogo: Catalogo;
  aoMudar: (c: Catalogo) => void;
}

export function FamiliaCatalogoFitas({ catalogo, aoMudar }: Props): ReactElement {
  const gravarTexto = (indice: number, campo: CampoFita) => (texto: string): boolean => {
    const novo = atualizarFitaEm(catalogo, indice, campo, texto);
    if (novo === null) return false;
    aoMudar(novo);
    return true;
  };

  const gravarNumero = (indice: number, campo: CampoFita) => (n: number | undefined): boolean => {
    if (n === undefined) return false;
    const novo = atualizarFitaEm(catalogo, indice, campo, String(n));
    if (novo === null) return false;
    aoMudar(novo);
    return true;
  };

  const gravarCusto = (indice: number) => (n: number | undefined): boolean => {
    const novo = atualizarFitaEm(catalogo, indice, 'custoM', n === undefined ? '' : String(n));
    if (novo === null) return false;
    aoMudar(novo);
    return true;
  };

  return (
    <>
      <div className="fam-cat-scroll">
        <table className="fam-cat-tabela">
          <thead>
            <tr>
              <th>Id</th><th>Nome</th><th className="num">Espessura (mm)</th>
              <th className="num">Altura (mm)</th><th className="num">Custo/m</th><th />
            </tr>
          </thead>
          <tbody>
            {catalogo.fitas.length === 0 && (
              <tr><td colSpan={6} className="fam-hint">Nenhuma fita. Use “Nova fita”.</td></tr>
            )}
            {catalogo.fitas.map((f, i) => (
              <tr key={i}>
                <td><CampoTexto valor={f.id} ariaLabel={`Id da fita ${i + 1}`} aoGravar={gravarTexto(i, 'id')} classe="mono" /></td>
                <td><CampoTexto valor={f.nome} ariaLabel={`Nome da fita ${i + 1}`} aoGravar={gravarTexto(i, 'nome')} /></td>
                <td className="num"><CampoNumero valor={f.espessura} ariaLabel={`Espessura da fita ${i + 1}`} aoGravar={gravarNumero(i, 'espessura')} /></td>
                <td className="num"><CampoNumero valor={f.altura} ariaLabel={`Altura da fita ${i + 1}`} aoGravar={gravarNumero(i, 'altura')} /></td>
                <td className="num"><CampoNumero valor={f.custoM} ariaLabel={`Custo por metro da fita ${i + 1}`} aoGravar={gravarCusto(i)} /></td>
                <td><button className="fam-bt fam-dlg-excluir" onClick={() => aoMudar(removerFitaEm(catalogo, i))}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fam-cat-acoes">
        <button className="fam-bt" onClick={() => aoMudar(adicionarFita(catalogo))}>Nova fita</button>
      </div>
    </>
  );
}
