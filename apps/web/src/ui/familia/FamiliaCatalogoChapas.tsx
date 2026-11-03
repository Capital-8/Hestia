import type { Catalogo } from '@hestia/model';
import type { ReactElement } from 'react';
import { CampoNumero, CampoTexto } from './FamiliaParametrosCampos.tsx';
import {
  adicionarChapa,
  atualizarChapaEm,
  removerChapaEm,
  type CampoChapa,
} from './familiaCatalogo.ts';

/** Aba Chapas do catálogo: tabela editável, com veio, refilo, custo por m2 e cor. */

interface Props {
  catalogo: Catalogo;
  aoMudar: (c: Catalogo) => void;
}

const COR_PADRAO = '#d8b98b';

function corValida(cor: string | undefined): string {
  return cor !== undefined && /^#[0-9a-f]{6}$/i.test(cor) ? cor : COR_PADRAO;
}

export function FamiliaCatalogoChapas({ catalogo, aoMudar }: Props): ReactElement {
  const gravarTexto = (indice: number, campo: CampoChapa) => (texto: string): boolean => {
    const novo = atualizarChapaEm(catalogo, indice, campo, texto);
    if (novo === null) return false;
    aoMudar(novo);
    return true;
  };

  const gravarNumero = (indice: number, campo: CampoChapa) => (n: number | undefined): boolean => {
    if (n === undefined) return false;
    const novo = atualizarChapaEm(catalogo, indice, campo, String(n));
    if (novo === null) return false;
    aoMudar(novo);
    return true;
  };

  const gravarCusto = (indice: number) => (n: number | undefined): boolean => {
    const novo = atualizarChapaEm(catalogo, indice, 'custoM2', n === undefined ? '' : String(n));
    if (novo === null) return false;
    aoMudar(novo);
    return true;
  };

  const alternarVeio = (indice: number, valor: boolean): void => {
    const novo = atualizarChapaEm(catalogo, indice, 'veio', String(valor));
    if (novo !== null) aoMudar(novo);
  };

  const trocarCor = (indice: number, valor: string): void => {
    const novo = atualizarChapaEm(catalogo, indice, 'cor', valor);
    if (novo !== null) aoMudar(novo);
  };

  return (
    <>
      <div className="fam-cat-scroll">
        <table className="fam-cat-tabela">
          <thead>
            <tr>
              <th>Id</th><th>Nome</th><th>Material</th><th className="num">Esp. (mm)</th>
              <th className="num">Largura</th><th className="num">Altura</th><th>Veio</th>
              <th className="num">Refilo</th><th className="num">Custo/m2</th><th>Cor</th><th />
            </tr>
          </thead>
          <tbody>
            {catalogo.chapas.length === 0 && (
              <tr><td colSpan={11} className="fam-hint">Nenhuma chapa. Use “Nova chapa”.</td></tr>
            )}
            {catalogo.chapas.map((c, i) => (
              <tr key={i}>
                <td><CampoTexto valor={c.id} ariaLabel={`Id da chapa ${i + 1}`} aoGravar={gravarTexto(i, 'id')} classe="mono" /></td>
                <td><CampoTexto valor={c.nome} ariaLabel={`Nome da chapa ${i + 1}`} aoGravar={gravarTexto(i, 'nome')} /></td>
                <td><CampoTexto valor={c.material} ariaLabel={`Material da chapa ${i + 1}`} aoGravar={gravarTexto(i, 'material')} /></td>
                <td className="num"><CampoNumero valor={c.espessura} ariaLabel={`Espessura da chapa ${i + 1}`} aoGravar={gravarNumero(i, 'espessura')} /></td>
                <td className="num"><CampoNumero valor={c.largura} ariaLabel={`Largura da chapa ${i + 1}`} aoGravar={gravarNumero(i, 'largura')} /></td>
                <td className="num"><CampoNumero valor={c.altura} ariaLabel={`Altura da chapa ${i + 1}`} aoGravar={gravarNumero(i, 'altura')} /></td>
                <td><input type="checkbox" checked={c.veio} aria-label={`Tem veio: chapa ${i + 1}`} onChange={(e) => alternarVeio(i, e.target.checked)} /></td>
                <td className="num"><CampoNumero valor={c.refilo} ariaLabel={`Refilo da chapa ${i + 1}`} aoGravar={gravarNumero(i, 'refilo')} /></td>
                <td className="num"><CampoNumero valor={c.custoM2} ariaLabel={`Custo por metro quadrado da chapa ${i + 1}`} aoGravar={gravarCusto(i)} /></td>
                <td><input type="color" className="fam-cat-cor" value={corValida(c.cor)} aria-label={`Cor da chapa ${i + 1}`} onChange={(e) => trocarCor(i, e.target.value)} /></td>
                <td><button className="fam-bt fam-dlg-excluir" onClick={() => aoMudar(removerChapaEm(catalogo, i))}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fam-cat-acoes">
        <button className="fam-bt" onClick={() => aoMudar(adicionarChapa(catalogo))}>Nova chapa</button>
      </div>
    </>
  );
}
