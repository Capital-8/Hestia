import type { Vec2 } from '@hestia/geom';
import { DOMINIOS_DE_TUBO, EletrodutoTool, TuboTool, opcoesEletroduto, opcoesTubo, origemDoComponente } from '@hestia/tools';
import type { Component, Id, Project } from '@hestia/model';
import type { Tool, ToolId } from '@hestia/tools';
import { useUi } from './state.ts';

/*
 * 'Criar tubo a partir daqui' (fase 4, ficha F5; no Revit, clicar com o direito numa conexão ou tubo e Criar tubo): com UM componente
 * selecionado, ativa a ferramenta Tubo ou Eletroduto já com o início na porta livre mais perto do cursor ou, num tubo, no ponto do
 * meio dele sob o cursor (a divisão com tê ou junção acontece ao confirmar o primeiro trecho). Devolve o motivo se não há de onde sair.
 */

/** O que a função precisa do editor (evita importar o controlador, que importa este módulo). */
export interface EditorDoTubo {
  project: Project;
  activeTool: Tool;
  setTool: (id: ToolId) => void;
}

/** O componente tem ligação de tubulação? O menu só oferece com uma, e diz se é Tubo ou Eletroduto. */
export function podeCriarTuboAqui(familias: Project['componentFamilies'], c: Component): 'tubo' | 'eletroduto' | null {
  const lig = familias?.[c.familyId]?.ligacoes?.find((l) => DOMINIOS_DE_TUBO.has(l.dominio));
  if (!lig) return null;
  return lig.dominio === 'eletroduto' ? 'eletroduto' : 'tubo';
}

/** Executa o comando; `cursor` é o ponto da planta em que o menu foi aberto (sem ele: a primeira porta livre ou o centro do tubo). */
export function criarTuboAPartirDaqui(ed: EditorDoTubo, selecao: readonly Id[], cursor?: Vec2): string | null {
  const id = selecao.length === 1 ? selecao[0] : undefined;
  if (id === undefined) return 'Selecione uma peça para criar o tubo a partir dela.';
  const o = origemDoComponente(ed.project, id, cursor);
  if ('erro' in o) {
    useUi.setState({ status: o.erro });
    return o.erro;
  }
  const opc = o.ferramenta === 'eletroduto' ? opcoesEletroduto : opcoesTubo;
  if (o.dn !== null && o.dn > 0) opc.dn = o.dn;
  opc.z = o.origem.xyz[2];
  if (o.familiaId) {
    if (o.ferramenta === 'eletroduto') opcoesEletroduto.familiaId = o.familiaId;
    else useUi.setState((s) => ({ options: { ...s.options, componentFamilyId: o.familiaId as string } }));
  }
  ed.setTool(o.ferramenta);
  useUi.setState({ selection: [] }); // o painel volta a mostrar as opções da ferramenta (DN, cota), não o componente
  const t = ed.activeTool;
  if (t instanceof TuboTool || t instanceof EletrodutoTool) t.iniciarEm(o.origem);
  return null;
}
