import { adicionarAninhado, editarAninhado } from '@hestia/model/src/familia/edicaoAninhados.ts';
import { BIBLIOTECA_BASE, type Aninhado } from '@hestia/model';
import { useState, type ReactElement } from 'react';
import { useProject } from '../../editor/controller.ts';
import { Janela } from './FamiliaJanela.tsx';
import {
  ROTACOES_ANINHADO,
  familiasParaAninhar,
  idLivreDeAninhado,
  montarAninhado,
  patchDoAninhado,
  validarEntrada,
  type EntradaAninhado,
} from './familiaAninhado.ts';
import { executarPeca } from './familiaPecaAviso.ts';
import { useFamilia } from './familiaStore.ts';
import './familiaAninhado.css';

/*
 * Diálogo de módulo aninhado (ficha ANIN-ui): cria ou edita um `Aninhado` pela interface. A lista de famílias
 * mistura a biblioteca base com as do projeto aberto, sem a própria família; o resto (id repetido, família própria,
 * rotação inválida) é recusado pelas operações de `edicaoAninhados` — sempre por `executarPeca`, um passo de
 * desfazer, com a recusa dentro do diálogo sem alterar nada. O roteador monta com `key`, então o formulário nasce
 * do aninhado que foi selecionado no navegador.
 */

export function FamiliaAninhado(): ReactElement {
  const familia = useFamilia((s) => s.historico.atual);
  const emEdicaoId = useFamilia((s) => s.aninhadoEmEdicao);
  const projeto = useProject();
  const aninhados = Array.isArray(familia.aninhados) ? familia.aninhados : [];
  const original: Aninhado | undefined = emEdicaoId === null ? undefined : aninhados.find((a) => a?.id === emEdicaoId);
  const familias = familiasParaAninhar(BIBLIOTECA_BASE, Object.values(projeto.componentFamilies ?? {}), familia.id);
  const [entrada, setEntrada] = useState<EntradaAninhado>(() => original === undefined
    ? { familiaId: '', tipoId: '', nome: '', id: idLivreDeAninhado(familia), origem: ['0', '0', '0'], rotacao: '0' }
    : {
      familiaId: original.familiaId ?? '',
      tipoId: original.tipoId ?? '',
      nome: original.nome ?? '',
      id: original.id ?? '',
      origem: [original.origem?.[0] ?? '0', original.origem?.[1] ?? '0', original.origem?.[2] ?? '0'],
      rotacao: original.rotacao ?? '0',
    });
  const [nomeTocado, setNomeTocado] = useState(original !== undefined);
  const [erro, setErro] = useState<string | null>(null);

  const escolhida = familias.find((f) => f.id === entrada.familiaId);

  const trocarFamilia = (id: string): void => {
    const fam = familias.find((f) => f.id === id);
    setEntrada((e) => ({ ...e, familiaId: id, tipoId: '', nome: nomeTocado ? e.nome : (fam?.nome ?? e.nome) }));
  };

  const fechar = (): void => useFamilia.getState().set({ dialogo: null, aninhadoEmEdicao: null });

  const criar = (): void => {
    const motivo = validarEntrada(entrada);
    if (motivo !== null) {
      setErro(motivo);
      return;
    }
    const recusa = original === undefined
      ? executarPeca('Novo módulo aninhado', (f) => adicionarAninhado(f, montarAninhado(entrada, familias)))
      : executarPeca('Editar módulo aninhado', (f) => editarAninhado(f, original.id, patchDoAninhado(entrada, familias, original.valores ?? {})));
    if (recusa !== null) {
      setErro(recusa);
      return;
    }
    fechar();
  };

  const campoOrigem = (indice: 0 | 1 | 2, rotulo: string): ReactElement => (
    <div className="fam-row"><label htmlFor={`an-origem-${indice}`}>{rotulo}</label>
      <input
        id={`an-origem-${indice}`}
        className="fam-f mono"
        value={entrada.origem[indice]}
        onChange={(e) => {
          const novo: [string, string, string] = [entrada.origem[0], entrada.origem[1], entrada.origem[2]];
          novo[indice] = e.target.value;
          setEntrada((atual) => ({ ...atual, origem: novo }));
        }}
      />
    </div>
  );

  return (
    <Janela titulo={original === undefined ? 'Novo módulo aninhado' : `Editar módulo aninhado · ${original.nome}`}>
      <div className="fam-row"><label htmlFor="an-familia">Família</label>
        <select id="an-familia" className="fam-f" value={entrada.familiaId} onChange={(e) => { trocarFamilia(e.target.value); }}>
          <option value="">— escolha a família —</option>
          {familias.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
      </div>
      <div className="fam-row"><label htmlFor="an-tipo">Tipo da família</label>
        <select id="an-tipo" className="fam-f" value={entrada.tipoId} onChange={(e) => setEntrada((atual) => ({ ...atual, tipoId: e.target.value }))}>
          <option value="">Padrão</option>
          {(escolhida?.tipos ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </div>
      <div className="fam-row"><label htmlFor="an-nome">Nome</label>
        <input
          id="an-nome"
          className="fam-f"
          value={entrada.nome}
          placeholder={escolhida?.nome ?? 'nome da família'}
          onChange={(e) => { setNomeTocado(true); setEntrada((atual) => ({ ...atual, nome: e.target.value })); }}
        />
      </div>
      <div className="fam-row"><label htmlFor="an-id">Id</label>
        <input
          id="an-id"
          className="fam-f mono"
          value={entrada.id}
          disabled={original !== undefined}
          title={original === undefined ? 'gerado livre; pode editar' : 'o id do aninhado não muda na edição'}
          onChange={(e) => setEntrada((atual) => ({ ...atual, id: e.target.value }))}
        />
      </div>
      {campoOrigem(0, 'Origem X')}
      {campoOrigem(1, 'Origem Y')}
      {campoOrigem(2, 'Origem Z')}
      <div className="fam-row"><label htmlFor="an-rotacao">Rotação</label>
        <select id="an-rotacao" className="fam-f" value={entrada.rotacao} onChange={(e) => setEntrada((atual) => ({ ...atual, rotacao: e.target.value }))}>
          {ROTACOES_ANINHADO.map((r) => <option key={r} value={String(r)}>{r}°</option>)}
        </select>
      </div>
      <div className="fam-hint">Origem em fórmula mm; rotação em graus com a base da família. A família aninhada
        resolve as próprias peças e aparece no 3D.</div>
      {erro !== null && <div className="fam-msg erro" role="alert">{erro}</div>}
      <div className="fam-pop-acoes">
        <button type="button" className="fam-bt" onClick={fechar}>Cancelar</button>
        <button type="button" className="fam-bt pri" onClick={criar}>{original === undefined ? 'Criar' : 'Salvar'}</button>
      </div>
    </Janela>
  );
}
