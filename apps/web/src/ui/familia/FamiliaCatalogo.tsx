import {
  CATALOGO_PADRAO,
  exportarCatalogo,
  importarCatalogo,
  mesclarCatalogo,
  validarCatalogo,
  type Catalogo,
} from '@hestia/model';
import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import { Janela } from './FamiliaJanela.tsx';
import { FamiliaCatalogoChapas } from './FamiliaCatalogoChapas.tsx';
import { FamiliaCatalogoFerragens } from './FamiliaCatalogoFerragens.tsx';
import { FamiliaCatalogoFitas } from './FamiliaCatalogoFitas.tsx';
import { problemasDoCatalogo } from './familiaCatalogo.ts';
import { useFamilia } from './familiaStore.ts';
import './familiaCatalogo.css';
import './familiaDialogos.css';

/** Catálogo de marcenaria: três abas editáveis, validação, importar/exportar e restaurar o padrão. */

type Aba = 'chapas' | 'fitas' | 'ferragens';

const ABAS: ReadonlyArray<{ id: Aba; rotulo: string }> = [
  { id: 'chapas', rotulo: 'Chapas' },
  { id: 'fitas', rotulo: 'Fitas' },
  { id: 'ferragens', rotulo: 'Ferragens' },
];

interface Importacao {
  catalogo: Catalogo;
  ignorados: Array<{ tipo: 'chapa' | 'fita' | 'ferragem'; id: string; motivo: string }>;
}

export function FamiliaCatalogo(): ReactElement {
  const catalogo = useFamilia((s) => s.catalogo);
  const setCatalogo = useFamilia((s) => s.setCatalogo);
  const [aba, setAba] = useState<Aba>('chapas');
  const [confirmarRestauro, setConfirmarRestauro] = useState(false);
  const [importacao, setImportacao] = useState<Importacao | null>(null);
  const [erroImportacao, setErroImportacao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const entradaArquivo = useRef<HTMLInputElement>(null);

  const problemas = validarCatalogo(catalogo);
  const visiveis = problemasDoCatalogo(catalogo, 5);

  const aoEscolherArquivo = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (arquivo === undefined) return;
    try {
      const texto = await arquivo.text();
      const dados: unknown = JSON.parse(texto);
      setImportacao(importarCatalogo(dados));
      setErroImportacao(null);
      setAviso(null);
    } catch (erro) {
      setImportacao(null);
      setErroImportacao(erro instanceof Error ? erro.message : String(erro));
    }
  };

  const mesclarImportado = (): void => {
    if (importacao === null) return;
    const resultado = mesclarCatalogo(catalogo, importacao.catalogo);
    setCatalogo(resultado.catalogo);
    setAviso(resultado.ignorados.length === 0
      ? 'Catálogo importado e mesclado.'
      : `Catálogo mesclado; ${resultado.ignorados.length} id(s) já existiam e foram mantidos.`);
    setImportacao(null);
  };

  const substituirImportado = (): void => {
    if (importacao === null) return;
    setCatalogo(importacao.catalogo);
    setAviso('Catálogo substituído pelo arquivo importado.');
    setImportacao(null);
  };

  const restaurar = (): void => {
    setCatalogo(structuredClone(CATALOGO_PADRAO));
    setConfirmarRestauro(false);
    setAviso('Catálogo padrão restaurado.');
  };

  const exportar = (): void => {
    const dados = JSON.stringify(exportarCatalogo(catalogo), null, 2);
    const url = URL.createObjectURL(new Blob([dados], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'catalogo-hestia.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Janela
      titulo="Catálogo de marcenaria"
      larga
      rodape={<>
        {confirmarRestauro ? (
          <>
            <span className="fam-cat-confirma">Restaurar o catálogo padrão?</span>
            <button className="fam-bt pri" onClick={restaurar}>Restaurar</button>
            <button className="fam-bt" onClick={() => setConfirmarRestauro(false)}>Cancelar</button>
          </>
        ) : (
          <button className="fam-bt" onClick={() => setConfirmarRestauro(true)}>Restaurar padrão</button>
        )}
        <button className="fam-bt" onClick={() => entradaArquivo.current?.click()}>Importar…</button>
        <button className="fam-bt" onClick={exportar}>Exportar…</button>
        <input ref={entradaArquivo} type="file" accept=".json,application/json" hidden onChange={(e) => { void aoEscolherArquivo(e); }} />
      </>}
    >
      <div className="fam-cat-abas" role="tablist" aria-label="Catálogo">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            className={`fam-cat-aba${aba === a.id ? ' on' : ''}`}
            onClick={() => setAba(a.id)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="fam-cat-aviso">Valores de exemplo: confirme medidas e custos com seu fornecedor.</div>

      {visiveis.length > 0 && (
        <div className="fam-cat-erro" role="alert">
          <div>{problemas.length} problema(s) no catálogo:</div>
          <ul>
            {visiveis.map((mensagem, i) => <li key={i}>{mensagem}</li>)}
          </ul>
          {problemas.length > visiveis.length && <div>… e mais {problemas.length - visiveis.length}.</div>}
        </div>
      )}

      {erroImportacao !== null && <div className="fam-cat-erro" role="alert">{erroImportacao}</div>}
      {aviso !== null && <div className="fam-cat-sucesso">{aviso}</div>}

      {importacao !== null && (
        <div className="fam-cat-import">
          <div>
            Importado: {importacao.catalogo.chapas.length} chapa(s), {importacao.catalogo.fitas.length} fita(s) e {importacao.catalogo.ferragens.length} ferragem(ns).
          </div>
          {importacao.ignorados.length > 0 && (
            <div className="fam-cat-ignorados">
              <div>{importacao.ignorados.length} item(ns) ignorado(s):</div>
              <ul>
                {importacao.ignorados.map((item, i) => (
                  <li key={i}>{item.tipo} “{item.id}”: {item.motivo}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="fam-cat-import-acoes">
            <button className="fam-bt pri" onClick={mesclarImportado}>Mesclar</button>
            <button className="fam-bt" onClick={substituirImportado}>Substituir</button>
            <button className="fam-bt" onClick={() => setImportacao(null)}>Cancelar</button>
          </div>
          <div className="fam-hint">Mesclar mantém o catálogo atual quando o id já existe.</div>
        </div>
      )}

      {aba === 'chapas' && <FamiliaCatalogoChapas catalogo={catalogo} aoMudar={setCatalogo} />}
      {aba === 'fitas' && <FamiliaCatalogoFitas catalogo={catalogo} aoMudar={setCatalogo} />}
      {aba === 'ferragens' && <FamiliaCatalogoFerragens catalogo={catalogo} aoMudar={setCatalogo} />}
    </Janela>
  );
}
