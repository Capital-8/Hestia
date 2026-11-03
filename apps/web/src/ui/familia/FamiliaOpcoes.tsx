import type { Parametro } from '@hestia/model';
import type { ReactElement } from 'react';
import { CampoNumero, CampoTexto } from './FamiliaParametrosCampos.tsx';
import { useFamilia } from './familiaStore.ts';
import { adicionarOpcao, alterarOpcao, removerOpcao } from './familiaDialogos.ts';

/** Lista editável de opções de um parâmetro enum/chapa, aberta dentro do diálogo de Parâmetros. */

interface PropsFamiliaOpcoes {
  param: Parametro;
  registrar: (motivo: string | null) => boolean;
}

export function FamiliaOpcoes({ param, registrar }: PropsFamiliaOpcoes): ReactElement {
  const executar = useFamilia((s) => s.executar);
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
      </div>
    </div>
  );
}
