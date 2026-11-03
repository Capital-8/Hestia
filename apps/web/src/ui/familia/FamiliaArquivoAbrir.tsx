import { lerArquivo, type Familia, type ResultadoImportacao } from '@hestia/model';
import { useState, type ChangeEvent, type ReactElement } from 'react';
import { registrarIdAberto } from './familiaNovo.ts';
import { useFamilia } from './familiaStore.ts';

/** Bloco "Abrir" do diálogo de arquivo: lê o `hestia-familia`, lista as famílias boas e as ignoradas. */
export function FamiliaArquivoAbrir(): ReactElement {
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);

  const aoEscolher = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setLendo(true);
    setErro(null);
    setResultado(null);
    try {
      setResultado(lerArquivo(await arquivo.text()));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  };

  const abrir = (familia: Familia): void => {
    const estado = useFamilia.getState();
    estado.novaFamilia(familia);
    estado.selecionarPeca(familia.pecas[0]?.id ?? null);
    registrarIdAberto(familia.id);
    estado.set({ dialogo: null });
  };

  return (
    <section className="fam-arq-bloco">
      <h3>Abrir</h3>
      <input type="file" accept=".json,application/json" onChange={(e) => { void aoEscolher(e); }} disabled={lendo} aria-label="Arquivo de famílias" />
      {lendo && <div className="fam-hint">Lendo o arquivo…</div>}
      {erro !== null && <div className="fam-msg erro" role="alert">{erro}</div>}
      {resultado !== null && (
        <>
          <div className="fam-hint">
            {resultado.familias.length === 0
              ? 'Nenhuma família válida no arquivo.'
              : `${resultado.familias.length} família(s) no arquivo.`}
          </div>
          {resultado.familias.length > 0 && (
            <div className="fam-tabela">
              <table>
                <thead>
                  <tr><th>Família</th><th className="n">Peças</th><th className="n">Tipos</th><th /></tr>
                </thead>
                <tbody>
                  {resultado.familias.map((f) => (
                    <tr key={f.id}>
                      <td>{f.nome}</td>
                      <td className="n">{f.pecas.length}</td>
                      <td className="n">{f.tipos.length}</td>
                      <td><button type="button" className="fam-bt" onClick={() => abrir(f)}>Abrir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {resultado.ignoradas.length > 0 && (
            <div className="fam-arq-ignoradas">
              <div className="fam-msg aviso">Famílias ignoradas</div>
              <ul>
                {resultado.ignoradas.map((i, n) => (
                  <li key={`${i.nome}-${n}`}><b>{i.nome}</b>: {i.motivo}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
