import { adicionarConector, editarConector, excluirConector, type Conector, type Familia, type LadoConector } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { CampoFormula, CampoTexto } from './FamiliaParametrosCampos.tsx';
import { LADOS_CONECTOR, ROTULO_LADO, aceitaDoTexto, conectorPadrao, escreverFolga, motivoEtiqueta, proximoIdConector, textoDeAceita } from './familiaEncaixe.ts';
import { useFamilia } from './familiaStore.ts';
import { executarPeca } from './familiaPecaAviso.ts';

/*
 * Aba Conectores do diálogo de Encaixe: tabela editável (id fixo, nome, lado, etiqueta, aceita e folga) com
 * adicionar e excluir. Toda gravação passa pelas operações de `edicaoEncaixe` num único passo de desfazer; a recusa
 * aparece junto à linha (campo inline ou faixa do diálogo) e não altera nada.
 */

type Registrar = (motivo: string | null) => boolean;
type Resultado = boolean | string;

interface PropsAbaConectores {
  familia: Familia;
  registrar: Registrar;
}

export function AbaConectores({ familia, registrar }: PropsAbaConectores): ReactElement {
  const conectores = Array.isArray(familia.conectores) ? familia.conectores : [];
  const adicionar = (): void => {
    const atual = useFamilia.getState().familia();
    const id = proximoIdConector(atual);
    registrar(executarPeca('Novo conector', (f) => adicionarConector(f, conectorPadrao(id))));
  };

  return (
    <>
      <div className="fam-dlg-scroll">
        <table className="fam-dlg-tabela">
          <thead>
            <tr><th>Id</th><th>Nome</th><th>Lado</th><th>Etiqueta</th><th>Aceita</th><th>Folga (fórmula, mm)</th><th /></tr>
          </thead>
          <tbody>
            {conectores.length === 0 && (
              <tr><td colSpan={7} className="fam-hint">Nenhum conector: o módulo usa só a caixa. Use “+ Conector”.</td></tr>
            )}
            {conectores.map((c) => <LinhaConector key={c.id} conector={c} registrar={registrar} />)}
          </tbody>
        </table>
      </div>
      <div className="fam-enca-acoes"><button className="fam-bt" onClick={adicionar}>+ Conector</button></div>
      <div className="fam-hint">Etiqueta é o papel do módulo na união (base, aereo, tampo…); “aceita” lista, separadas por vírgula, as etiquetas do outro lado que se encaixam aqui — vazio aceita qualquer. Folga é uma fórmula em mm (vazio remove).</div>
    </>
  );
}

interface PropsLinhaConector {
  conector: Conector;
  registrar: Registrar;
}

function LinhaConector({ conector, registrar }: PropsLinhaConector): ReactElement {
  const [erroFolga, setErroFolga] = useState<string | null>(null);

  const gravar = (rotulo: string, patch: Partial<Omit<Conector, 'id'>>): Resultado => {
    const motivo = executarPeca(rotulo, (f) => editarConector(f, conector.id, patch));
    registrar(motivo);
    return motivo ?? true;
  };

  const gravarNome = (texto: string): Resultado => {
    const nome = texto.trim();
    if (nome === '') return 'O nome do conector não pode ficar vazio';
    if (nome === conector.nome) return true;
    return gravar('Renomear conector', { nome });
  };

  const gravarEtiqueta = (texto: string): Resultado => {
    const motivo = motivoEtiqueta(texto);
    if (motivo !== null) return motivo;
    const etiqueta = texto.trim();
    if (etiqueta === conector.etiqueta) return true;
    return gravar(`Editar etiqueta de ${conector.id}`, { etiqueta });
  };

  const gravarAceita = (texto: string): Resultado => {
    const aceita = aceitaDoTexto(texto);
    if (aceita.join(',') === (conector.aceita ?? []).join(',')) return true;
    return gravar(`Editar aceita de ${conector.id}`, { aceita });
  };

  const gravarFolga = (texto: string): boolean => {
    const motivo = executarPeca(`Editar folga de ${conector.id}`, (f) => escreverFolga(f, conector.id, texto));
    registrar(motivo);
    setErroFolga(motivo);
    return motivo === null;
  };

  const excluir = (): void => {
    registrar(executarPeca('Excluir conector', (f) => excluirConector(f, conector.id)));
  };

  return (
    <tr>
      <td className="fam-enca-id">{conector.id}</td>
      <td className="fam-dlg-nome"><CampoTexto valor={conector.nome} ariaLabel={`Nome de ${conector.id}`} aoGravar={gravarNome} /></td>
      <td>
        <select
          className="fam-dlg-input fam-enca-lado"
          value={conector.lado}
          aria-label={`Lado de ${conector.id}`}
          onChange={(e) => { gravar(`Editar lado de ${conector.id}`, { lado: e.target.value as LadoConector }); }}
        >
          {LADOS_CONECTOR.map((l) => <option key={l} value={l}>{ROTULO_LADO[l]}</option>)}
        </select>
      </td>
      <td><CampoTexto valor={conector.etiqueta} ariaLabel={`Etiqueta de ${conector.id}`} aoGravar={gravarEtiqueta} classe="fam-enca-etiqueta" /></td>
      <td><CampoTexto valor={textoDeAceita(conector.aceita)} ariaLabel={`Aceita de ${conector.id}`} titulo="Etiquetas separadas por vírgula; vazio = qualquer" aoGravar={gravarAceita} classe="fam-enca-aceita" /></td>
      <td>
        <CampoFormula
          valor={conector.folga ?? ''}
          ariaLabel={`Folga de ${conector.id}`}
          desabilitado={false}
          titulo="Fórmula em mm; vazio remove a folga"
          aoGravar={gravarFolga}
        />
        {erroFolga !== null && <div className="fam-campo-erro" role="alert">{erroFolga}</div>}
      </td>
      <td><button className="fam-bt fam-dlg-excluir" onClick={excluir}>Excluir</button></td>
    </tr>
  );
}
