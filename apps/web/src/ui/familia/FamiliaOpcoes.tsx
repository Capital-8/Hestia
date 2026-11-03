import { opcoesDeChapa, type Parametro } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { CampoNumero, CampoTexto } from './FamiliaParametrosCampos.tsx';
import { useFamilia } from './familiaStore.ts';
import { adicionarOpcao, alterarOpcao, removerOpcao } from './familiaDialogos.ts';
import './familiaCatalogo.css';

/** Lista editável de opções de um parâmetro enum/chapa, aberta dentro do diálogo de Parâmetros. */

interface PropsFamiliaOpcoes {
  param: Parametro;
  registrar: (motivo: string | null) => boolean;
}

export function FamiliaOpcoes({ param, registrar }: PropsFamiliaOpcoes): ReactElement {
  const executar = useFamilia((s) => s.executar);
  const catalogo = useFamilia((s) => s.catalogo);
  const [listaAberta, setListaAberta] = useState(false);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [mensagemLocal, setMensagemLocal] = useState<string | null>(null);
  const chapa = param.tipo === 'chapa';
  const opcoes = param.opcoes ?? [];
  const alterar = (indice: number, campo: 'valor' | 'rotulo' | 'esp', texto: string): boolean =>
    registrar(executar(`Editar opções de ${param.id}`, (f) => alterarOpcao(f, param.id, indice, campo, texto)));
  const adicionar = (): void => {
    registrar(executar(`Adicionar opção a ${param.id}`, (f) => adicionarOpcao(f, param.id)));
  };
  const remover = (indice: number): void => {
    registrar(executar(`Remover opção de ${param.id}`, (f) => removerOpcao(f, param.id, indice)));
  };
  const abrirCatalogo = (): void => {
    const atuais = new Set(opcoes.map((o) => String(o.valor)));
    setEscolhidas(catalogo.chapas.filter((c) => atuais.has(c.id)).map((c) => c.id));
    setMensagemLocal(null);
    setListaAberta(true);
  };
  const alternarChapa = (id: string): void => {
    setEscolhidas((atuais) => (atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]));
  };
  const confirmarCatalogo = (): void => {
    const ordemDoCatalogo = catalogo.chapas.map((c) => c.id).filter((id) => escolhidas.includes(id));
    if (!ordemDoCatalogo.includes(String(param.padrao))) {
      setMensagemLocal('Mantenha a chapa padrão do parâmetro entre as escolhidas.');
      return;
    }
    const novas = opcoesDeChapa(catalogo, ordemDoCatalogo);
    const motivo = executar(`Substituir opções de ${param.id}`, (f) => {
      const alvo = f.parametros.find((p) => p?.id === param.id);
      if (alvo === undefined) return `parâmetro “${param.id}” não existe`;
      alvo.opcoes = novas;
      return null;
    });
    if (registrar(motivo)) {
      setListaAberta(false);
      setMensagemLocal(null);
    }
  };
  return (
    <div className="fam-dlg-opcoes">
      <div className={`fam-dlg-opcoes-cab${chapa ? '' : ' sem-esp'}`}>
        <span>Valor</span><span>Rótulo</span>{chapa && <span>esp (mm)</span>}<span />
      </div>
      {opcoes.length === 0 && <div className="fam-hint">Sem opções: acrescente a primeira.</div>}
      {opcoes.map((o, i) => (
        <div key={i} className={`fam-dlg-opcoes-linha${chapa ? '' : ' sem-esp'}`}>
          <CampoTexto
            valor={String(o.valor)}
            ariaLabel={`Valor da opção ${i + 1} de ${param.id}`}
            aoGravar={(texto) => alterar(i, 'valor', texto)}
          />
          <CampoTexto
            valor={o.rotulo ?? ''}
            ariaLabel={`Rótulo da opção ${i + 1} de ${param.id}`}
            aoGravar={(texto) => alterar(i, 'rotulo', texto)}
          />
          {chapa && (
            <CampoNumero
              valor={o.esp}
              ariaLabel={`Espessura da opção ${i + 1} de ${param.id}`}
              aoGravar={(n) => n !== undefined && alterar(i, 'esp', String(n))}
            />
          )}
          <button
            className="fam-bt fam-dlg-excluir"
            title={o.valor === param.padrao ? 'A opção padrão não pode ser removida' : 'Remover opção'}
            disabled={o.valor === param.padrao}
            onClick={() => remover(i)}
          >
            Remover
          </button>
        </div>
      ))}
      <div className="fam-dlg-opcoes-acoes">
        <button className="fam-bt" onClick={adicionar}>+ Opção</button>
        {chapa && <button className="fam-bt" onClick={abrirCatalogo}>Do catálogo…</button>}
      </div>
      {chapa && listaAberta && (
        <div className="fam-cat-escolha">
          <div className="fam-cat-escolha-lista">
            {catalogo.chapas.length === 0 && <div className="fam-hint">O catálogo não tem chapas.</div>}
            {catalogo.chapas.map((c) => (
              <label key={c.id} className="fam-cat-escolha-item">
                <input type="checkbox" checked={escolhidas.includes(c.id)} onChange={() => alternarChapa(c.id)} />
                <span>{c.nome}</span>
                <span className="fam-mut">{c.id}</span>
              </label>
            ))}
          </div>
          {mensagemLocal !== null && <div className="fam-cat-erro" role="alert">{mensagemLocal}</div>}
          <div className="fam-dlg-opcoes-acoes">
            <button className="fam-bt pri" onClick={confirmarCatalogo}>Usar escolhidas</button>
            <button className="fam-bt" onClick={() => { setListaAberta(false); setMensagemLocal(null); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
