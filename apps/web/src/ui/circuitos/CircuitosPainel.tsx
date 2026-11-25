import { dimensionarProjeto } from '@hestia/engine';
import { consultarCircuitos, ehQuadro } from '@hestia/model';
import { useMemo, useState, type ReactElement } from 'react';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { CircuitosView, type AcoesCircuitos } from './CircuitosView.tsx';
import * as acao from './circuitosAcoes.ts';
import { TabelasEletricasDialog } from './TabelasEletricasDialog.tsx';
import { useTabelasEletricas } from './tabelasNavegador.ts';

/** Painel Circuitos (ficha C4): liga a vista aos comandos do projeto. Seleção do desenho = componentes a atribuir. */
export function CircuitosPainel(): ReactElement {
  const project = useProject();
  const selecao = useUi((s) => s.selection);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tabelasAbertas, setTabelasAbertas] = useState(false);
  const tabelas = useTabelasEletricas();
  const consulta = useMemo(() => consultarCircuitos(project), [project]);
  const dimensionamento = useMemo(() => dimensionarProjeto(project, tabelas), [project, tabelas]);
  const selecionados = selecao.filter((id) => project.elements[id]?.kind === 'component' && !ehQuadro(project.elements[id])).length;
  const alvo = editor.store;

  const rodar = (fn: () => void): void => {
    setAviso(null);
    setErro(acao.tentarAcao(fn));
  };
  const acoes: AcoesCircuitos = {
    onNovo: () => rodar(() => void acao.novoCircuito(alvo)),
    onRenomear: (id, nome) => rodar(() => acao.renomear(alvo, id, nome)),
    onTipo: (id, tipo) => rodar(() => acao.mudarTipo(alvo, id, tipo)),
    onTensao: (id, tensao) => rodar(() => acao.mudarTensao(alvo, id, tensao)),
    onCor: (id, cor) => rodar(() => acao.mudarCor(alvo, id, cor)),
    onQuadro: (id, quadroId) => rodar(() => acao.mudarQuadro(alvo, id, quadroId)),
    onAtribuir: (id) =>
      rodar(() => {
        const r = acao.atribuirSelecionados(alvo, id, selecao, acao.POTENCIA_INICIAL_VA);
        setAviso(r.atribuidos > 0 ? `${r.atribuidos} ponto(s) atribuído(s)${r.ignorados > 0 ? `, ${r.ignorados} ignorado(s)` : ''}.` : 'Nenhum componente elétrico selecionado.');
      }),
    onApagar: (id) => rodar(() => acao.apagarCircuitoPorId(alvo, id)),
    onPotencia: (circuitoId, componenteId, potenciaVA, fator) => rodar(() => acao.definirPotencia(alvo, circuitoId, { componenteId, potenciaVA, ...(fator !== undefined ? { fator } : {}) })),
    onTirar: (componenteId) => rodar(() => acao.tirarPonto(alvo, componenteId)),
    onTabelas: () => setTabelasAbertas(true),
    onFp: (id, fp) => rodar(() => acao.mudarFp(alvo, id, fp)),
    onSecao: (id, secao) => rodar(() => acao.mudarSecao(alvo, id, secao)),
    onDisjuntor: (id, d) => rodar(() => acao.mudarDisjuntor(alvo, id, d)),
    onRenomearQuadro: (id, nome) => rodar(() => acao.renomearQuadro(alvo, id, nome)),
  };
  return (
    <>
      <CircuitosView consulta={consulta} selecionados={selecionados} erro={erro} aviso={aviso} acoes={acoes} dimensionamento={dimensionamento} />
      {tabelasAbertas ? <TabelasEletricasDialog onClose={() => setTabelasAbertas(false)} /> : null}
    </>
  );
}
