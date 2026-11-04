import type { Catalogo, FerragemCatalogo } from '@hestia/model';
import type { ReactElement } from 'react';
import { CampoNumero, CampoTexto } from './FamiliaParametrosCampos.tsx';
import {
  ROTULO_UNIDADE,
  UNIDADES_FERRAGEM,
  adicionarFerragem,
  editarFerragemEm,
  removerFerragemEm,
  type CampoFerragem,
} from './familiaCatalogo.ts';

/** Aba Ferragens do catálogo: tabela editável com código, unidade e custo por unidade. */

interface Props {
  catalogo: Catalogo;
  aoMudar: (c: Catalogo) => void;
}

export function FamiliaCatalogoFerragens({ catalogo, aoMudar }: Props): ReactElement {
  const gravarTexto = (indice: number, campo: CampoFerragem) => (texto: string): boolean | string => {
    const r = editarFerragemEm(catalogo, indice, campo, texto);
    if (!r.ok) return r.motivo;
    aoMudar(r.catalogo);
    return true;
  };

  const gravarUnidade = (indice: number, unidade: FerragemCatalogo['unidade']): void => {
    const r = editarFerragemEm(catalogo, indice, 'unidade', unidade);
    if (r.ok) aoMudar(r.catalogo);
  };

  const gravarCusto = (indice: number) => (n: number | undefined): boolean | string => {
    const r = editarFerragemEm(catalogo, indice, 'custo', n === undefined ? '' : String(n));
    if (!r.ok) return r.motivo;
    aoMudar(r.catalogo);
    return true;
  };

  return (
    <>
      <div className="fam-cat-scroll">
        <table className="fam-cat-tabela">
          <thead>
            <tr>
              <th>Id</th><th>Nome</th><th>Código</th><th>Unidade</th><th className="num">Custo</th><th />
            </tr>
          </thead>
          <tbody>
            {catalogo.ferragens.length === 0 && (
              <tr><td colSpan={6} className="fam-hint">Nenhuma ferragem. Use “Nova ferragem”.</td></tr>
            )}
            {catalogo.ferragens.map((f, i) => (
              <tr key={i}>
                <td><CampoTexto valor={f.id} ariaLabel={`Id da ferragem ${i + 1}`} aoGravar={gravarTexto(i, 'id')} classe="mono" /></td>
                <td><CampoTexto valor={f.nome} ariaLabel={`Nome da ferragem ${i + 1}`} aoGravar={gravarTexto(i, 'nome')} /></td>
                <td><CampoTexto valor={f.codigo ?? ''} ariaLabel={`Código da ferragem ${i + 1}`} aoGravar={gravarTexto(i, 'codigo')} classe="mono" /></td>
                <td>
                  <select
                    className="fam-dlg-input"
                    value={f.unidade}
                    aria-label={`Unidade da ferragem ${i + 1}`}
                    onChange={(e) => gravarUnidade(i, e.target.value as FerragemCatalogo['unidade'])}
                  >
                    {UNIDADES_FERRAGEM.map((u) => <option key={u} value={u}>{ROTULO_UNIDADE[u]}</option>)}
                  </select>
                </td>
                <td className="num"><CampoNumero valor={f.custo} ariaLabel={`Custo da ferragem ${i + 1}`} aoGravar={gravarCusto(i)} /></td>
                <td><button className="fam-bt fam-dlg-excluir" onClick={() => aoMudar(removerFerragemEm(catalogo, i))}>Excluir</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fam-cat-acoes">
        <button className="fam-bt" onClick={() => aoMudar(adicionarFerragem(catalogo))}>Nova ferragem</button>
      </div>
    </>
  );
}
