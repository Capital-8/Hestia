import type { ReactElement } from 'react';
import { FamiliaArquivoAbrir } from './FamiliaArquivoAbrir.tsx';
import { FamiliaArquivoSalvar } from './FamiliaArquivoSalvar.tsx';
import { useFamilia } from './familiaStore.ts';
import { Janela } from './FamiliaJanela.tsx';
import './familiaNovo.css';

/** Abrir e salvar famílias: arquivo `hestia-familia` (JSON) e "Meus modelos" no navegador. */
export function FamiliaArquivo(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  return (
    <Janela
      titulo="Família ▸ Abrir e salvar"
      larga
      rodape={<span className="fam-mut">Abrir troca a família em edição; salvar não mexe no projeto.</span>}
    >
      <div className="fam-arquivo">
        <FamiliaArquivoAbrir />
        <FamiliaArquivoSalvar familia={familia} />
      </div>
    </Janela>
  );
}
