import { adicionarEscolha, editarEscolha, excluirEscolha, type Escolha, type Familia } from '@hestia/model';
import type { ReactElement } from 'react';
import { CampoTexto } from './FamiliaParametrosCampos.tsx';
import { escolhaNova, motivoNovoEscolha, opcoesDeParametro, parametrosParaEscolha, proximoIdEscolha, zonasDaFamilia } from './familiaEncaixe.ts';
import { useFamilia } from './familiaStore.ts';
import { executarPeca } from './familiaPecaAviso.ts';

/*
 * Aba Escolhas do diálogo de Encaixe: tabela editável (id fixo, nome, parâmetro, zona) com as opções do parâmetro
 * ao lado, somente leitura. Adicionar exige que a família já tenha parâmetro de escolha e zona; a recusa aparece
 * junto à linha e não altera nada.
 */

type Registrar = (motivo: string | null) => boolean;
type Resultado = boolean | string;

interface PropsAbaEscolhas {
  familia: Familia;
  registrar: Registrar;
}

export function AbaEscolhas({ familia, registrar }: PropsAbaEscolhas): ReactElement {
  const escolhas = Array.isArray(familia.escolhas) ? familia.escolhas : [];
  const motivo = motivoNovoEscolha(familia);
  const adicionar = (): void => {
    if (motivo !== null) {
      registrar(motivo);
      return;
    }
    const atual = useFamilia.getState().familia();
    const parametros = parametrosParaEscolha(atual);
    const zonas = zonasDaFamilia(atual);
    const id = proximoIdEscolha(atual);
    registrar(executarPeca('Nova escolha', (f) => adicionarEscolha(f, escolhaNova(id, 'Nova escolha', parametros[0]!.id, zonas[0]!))));
  };

  return (
    <>
      <div className="fam-dlg-scroll">
        <table className="fam-dlg-tabela">
          <thead>
            <tr><th>Id</th><th>Nome</th><th>Parâmetro</th><th>Zona</th><th>Opções do parâmetro</th><th /></tr>
          </thead>
          <tbody>
            {escolhas.length === 0 && (
              <tr><td colSpan={6} className="fam-hint">Nenhuma escolha: nada muda por clique no módulo. Use “+ Escolha”.</td></tr>
            )}
            {escolhas.map((e) => <LinhaEscolha key={e.id} familia={familia} escolha={e} registrar={registrar} />)}
          </tbody>
        </table>
      </div>
      <div className="fam-enca-acoes">
        <button className="fam-bt" onClick={adicionar} title={motivo ?? undefined}>+ Escolha</button>
        {motivo !== null && <span className="fam-enca-aviso">{motivo}</span>}
      </div>
      <div className="fam-hint">A escolha liga um parâmetro (enum, booleano ou inteiro, sem fórmula) a uma zona: no projeto, clicar na zona abre as opções do parâmetro. As opções vêm do parâmetro; edite-os no diálogo de Parâmetros.</div>
    </>
  );
}

interface PropsLinhaEscolha {
  familia: Familia;
  escolha: Escolha;
  registrar: Registrar;
}

function LinhaEscolha({ familia, escolha, registrar }: PropsLinhaEscolha): ReactElement {
  const gravar = (rotulo: string, patch: Partial<Omit<Escolha, 'id'>>): Resultado => {
    const motivo = executarPeca(rotulo, (f) => editarEscolha(f, escolha.id, patch));
    registrar(motivo);
    return motivo ?? true;
  };

  const gravarNome = (texto: string): Resultado => {
    const nome = texto.trim();
    if (nome === '') return 'O nome da escolha não pode ficar vazio';
    if (nome === escolha.nome) return true;
    return gravar('Renomear escolha', { nome });
  };

  const excluir = (): void => {
    registrar(executarPeca('Excluir escolha', (f) => excluirEscolha(f, escolha.id)));
  };

  return (
    <tr>
      <td className="fam-enca-id">{escolha.id}</td>
      <td className="fam-dlg-nome"><CampoTexto valor={escolha.nome} ariaLabel={`Nome da escolha ${escolha.id}`} aoGravar={gravarNome} /></td>
      <td><SelecaoParametro familia={familia} escolha={escolha} gravar={gravar} /></td>
      <td><SelecaoZona familia={familia} escolha={escolha} gravar={gravar} /></td>
      <td><CelulaOpcoes familia={familia} escolha={escolha} /></td>
      <td><button className="fam-bt fam-dlg-excluir" onClick={excluir}>Excluir</button></td>
    </tr>
  );
}

interface PropsSelecaoParametro {
  familia: Familia;
  escolha: Escolha;
  gravar: (rotulo: string, patch: Partial<Omit<Escolha, 'id'>>) => Resultado;
}

function SelecaoParametro({ familia, escolha, gravar }: PropsSelecaoParametro): ReactElement {
  const opcoes = parametrosParaEscolha(familia).map((p) => ({ valor: p.id, rotulo: `${p.nome} (${p.tipo})` }));
  const fora = !opcoes.some((o) => o.valor === escolha.parametro);
  return (
    <select
      className="fam-dlg-input fam-enca-param"
      value={escolha.parametro}
      aria-label={`Parâmetro da escolha ${escolha.nome}`}
      title={fora ? 'O parâmetro apontado não é mais um parâmetro de escolha' : undefined}
      onChange={(e) => { gravar(`Editar parâmetro da escolha ${escolha.id}`, { parametro: e.target.value }); }}
    >
      {fora && <option value={escolha.parametro}>{`${escolha.parametro} (inválido)`}</option>}
      {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
    </select>
  );
}

interface PropsSelecaoZona {
  familia: Familia;
  escolha: Escolha;
  gravar: (rotulo: string, patch: Partial<Omit<Escolha, 'id'>>) => Resultado;
}

function SelecaoZona({ familia, escolha, gravar }: PropsSelecaoZona): ReactElement {
  const zonas = zonasDaFamilia(familia);
  const fora = !zonas.includes(escolha.zona);
  return (
    <select
      className="fam-dlg-input fam-enca-zona"
      value={escolha.zona}
      aria-label={`Zona da escolha ${escolha.nome}`}
      title={fora ? 'Nenhuma peça está nesta zona hoje' : undefined}
      onChange={(e) => { gravar(`Editar zona da escolha ${escolha.id}`, { zona: e.target.value }); }}
    >
      {fora && <option value={escolha.zona}>{`${escolha.zona} (inválido)`}</option>}
      {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
    </select>
  );
}

interface PropsCelulaOpcoes {
  familia: Familia;
  escolha: Escolha;
}

function CelulaOpcoes({ familia, escolha }: PropsCelulaOpcoes): ReactElement {
  const param = familia.parametros.find((p) => p?.id === escolha.parametro);
  if (param === undefined) return <span className="fam-dlg-ro">—</span>;
  const opcoes = opcoesDeParametro(param);
  if (opcoes.length === 0) return <span className="fam-dlg-ro">valor livre</span>;
  return <span className="fam-enca-opcoes">{opcoes.join(' · ')}</span>;
}
