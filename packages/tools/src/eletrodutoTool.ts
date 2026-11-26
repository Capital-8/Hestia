import { LIMITE_CURVAS_ENTRE_CAIXAS, tipoSemConexoes, trechosAcimaDoLimite, type TrechoEncontro } from '@hestia/engine';
import { isComponent, type Id, type Project } from '@hestia/model';
import { planejarFlexivel } from './eletrodutoFlexivel.ts';
import { ligacoesAbertas, type ContextoTraco } from './tuboApoio.ts';
import type { PontoTubo } from './tuboGeometria.ts';
import { TuboTool, type ConfigTraco, type OpcoesTraco } from './tuboTool.ts';
import { bloqueioDeDerivacao, type Verificacao } from './tuboRota.ts';
import type { ToolEnv } from './types.ts';

/*
 * Ferramenta Eletroduto (ficha C3): o MESMO motor de traçado do Tubo (`TuboTool`), configurado para o tipo `krona_eletroduto_pvc`
 * (`engine/componentes/tiposTubulacao.ts`): tubo = eletroduto cortado, curva 90° e luva da Krona elétrica; peça que o catálogo não
 * tem (curva 45°, tê, redução) fica sem regra e o encontro vira aviso. Caixas (`fam_krona_eletrica_caixa*`) são nós: o eletroduto que
 * termina numa entrada compatível liga nela; sem caixa a ponta fica aberta e 'Verificar rede' a lista. O limite de curvas entre caixas
 * só ALERTA (não bloqueia): ver `LIMITE_CURVAS_ENTRE_CAIXAS`, valor provisório a conferir.
 */

/** Eletroduto cortado da Krona (ponta lisa nas duas pontas), tubo do tipo `krona_eletroduto_pvc`. */
export const FAMILIA_ELETRODUTO = 'fam_krona_eletrica_tubo_corte';

/** Ajustes que o painel `EletrodutoProperties` edita: DN em mm (20, 25 ou 32 do catálogo), altura (z) em m, declividade em % e modo de cota. */
export const opcoesEletroduto: OpcoesTraco = { dn: 20, z: 0, declividade: 0, modoCota: 'subir_primeiro', familiaId: FAMILIA_ELETRODUTO };

/** Distância (m) até a qual uma ponta aberta de eletroduto perto de uma entrada aberta de caixa é apontada como "quase ligada". */
const PERTO_DA_CAIXA = 0.02;

/** Avisos do projeto já gravado: curvas demais entre caixas e ponta que ficou ao lado de uma entrada de caixa sem ligar (DN que não casa). */
function avisosDoEletroduto(p: Project, ids: Id[]): string[] {
  const avisos = trechosAcimaDoLimite(p)
    .filter((t) => t.componentes.some((c) => ids.includes(c)))
    .map((t) => `Alerta: ${t.curvas} curvas entre caixas, acima do limite de ${LIMITE_CURVAS_ENTRE_CAIXAS} (valor provisório, CONFERIR contra a norma vigente). Nada foi bloqueado.`);
  const abertas = ligacoesAbertas(p);
  for (const a of abertas) {
    if (!ids.includes(a.componentId) || !isComponent(p.elements[a.componentId])) continue;
    const caixa = abertas.find((b) => !ids.includes(b.componentId) && b.lig.dominio === a.lig.dominio && Math.hypot(b.lig.posicaoMundo[0] - a.lig.posicaoMundo[0], b.lig.posicaoMundo[1] - a.lig.posicaoMundo[1], b.lig.posicaoMundo[2] - a.lig.posicaoMundo[2]) <= PERTO_DA_CAIXA);
    if (caixa) avisos.push(`A ponta ficou ao lado da entrada da caixa, mas não ligou (bitola ${Math.round(a.lig.diametro * 1000)} mm contra ${Math.round(caixa.lig.diametro * 1000)} mm, ou a entrada não está de frente): ponta aberta.`);
  }
  return avisos;
}

export const CONFIG_ELETRODUTO: ConfigTraco = {
  id: 'eletroduto',
  nome: 'Eletroduto',
  hint: 'Eletroduto: clique o ponto inicial e o final (termine sobre a entrada de uma caixa para ligar; Shift trava no eixo; digite o comprimento e Enter). Esc encerra a cadeia.',
  opcoes: opcoesEletroduto,
  familiaInicial: () => opcoesEletroduto.familiaId ?? FAMILIA_ELETRODUTO,
  luvaEmLinha: true,
  respeitaEntradas: true,
  avisosDepois: avisosDoEletroduto,
};

/**
 * Ferramenta Eletroduto: `TuboTool` com a configuração elétrica. Com o tipo CORRUGADO (sem conexões, ficha F2) cada clique cria um
 * trecho reto ligado ao anterior por ligação flexível, sem peça no canto, com direção e cota livres e o raio mínimo conferido
 * (`eletrodutoFlexivel.ts`); com o rígido tudo segue como antes.
 */
export class EletrodutoTool extends TuboTool {
  constructor(env: ToolEnv, cfg: ConfigTraco = CONFIG_ELETRODUTO) {
    super(env, cfg);
  }

  protected override verificar(ctx: ContextoTraco, a: PontoTubo, b: PontoTubo, avisos: string[]): Verificacao {
    if (!tipoSemConexoes(ctx.familia.id)) return super.verificar(ctx, a, b, avisos);
    // Corrugado não deriva (ficha F5): clicar no meio de outro trecho bloqueia com o motivo e a sugestão de caixa.
    const sem = bloqueioDeDerivacao(ctx, null, a, b);
    if (sem) return sem;
    return planejarFlexivel(this.env.project(), ctx.familia, this.opc.dn, this.env.levelId(), a, b);
  }

  /** Corrugado: a ponta liga DIRETO ao que há no ponto (trecho anterior, caixa ou dispositivo); sem peça, sem recuo. */
  protected override ligarPonta(ctx: ContextoTraco, id: Id, ponta: 'a' | 'b', pt: PontoTubo, novo: TrechoEncontro, avisos: string[]): void {
    if (!tipoSemConexoes(ctx.familia.id)) return super.ligarPonta(ctx, id, ponta, pt, novo, avisos);
    if (!pt.alvo) return;
    const minha = ponta === 'a' ? ctx.pontas.inicio.id : ctx.pontas.fim.id;
    this.env.exec({ type: 'connectComponents', a: id, ligacaoA: minha, b: pt.alvo.componentId, ligacaoB: pt.alvo.ligacaoId });
  }
}
