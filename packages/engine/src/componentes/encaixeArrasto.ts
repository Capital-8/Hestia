import { colisoes } from './encaixeColisao.ts';
import { encaixarNaParede } from './encaixeParede.ts';
import { encaixarNoVizinho, guiasDeAlinhamento } from './encaixeVizinho.ts';
import type { Corpo, EntradaArrasto, OpcoesArrasto, Pose, ResultadoArrasto } from './encaixeTipos.ts';

/**
 * Alcance padrão (m) do encaixe na parede durante o arrasto. É maior que o padrão de `encaixarNaParede` para o móvel ainda solto
 * (com o fundo a quase um metro da face) já grudar na parede ao ser arrastado.
 */
const DISTANCIA_PAREDE_PADRAO = 1;

/** Tolerância (rad) para considerar que o reencoste manteve a rotação da parede. */
const TOL_ROTACAO = 1e-9;

/**
 * Compõe o encaixe de um arrasto: primeiro a parede (`encaixarNaParede`), depois o vizinho (`encaixarNoVizinho`) sobre a pose já
 * encostada na parede, sem desfazer o encosto (o vizinho só desliza o móvel ao longo da parede), depois `colisoes` e `guiasDeAlinhamento`
 * na pose final. Com `semEncaixe` devolve a pose desejada com as colisões e sem guias. Nunca lança: sem encaixe, a pose é a desejada.
 */
export function posarArrastado(entrada: EntradaArrasto, opcoes: OpcoesArrasto = {}): ResultadoArrasto {
  const alvo = entrada.alvo;
  if (opcoes.semEncaixe) {
    return {
      pose: alvo.pose,
      colisoes: colisoes(alvo, entrada.outros, entrada.faces),
      guias: [],
    };
  }

  const distanciaParede = opcoes.distanciaParede ?? DISTANCIA_PAREDE_PADRAO;
  let pose: Pose = alvo.pose;
  let parede: number | undefined;
  let vizinho: string | undefined;

  const naParede = encaixarNaParede(alvo.pose, alvo.caixa, entrada.faces, distanciaParede);
  if (naParede) {
    pose = naParede.pose;
    parede = naParede.face;
  }

  const noVizinho = encaixarNoVizinho(pose, alvo.caixa, entrada.outros, { distanciaMax: opcoes.distanciaVizinho });
  if (noVizinho) {
    if (parede === undefined) {
      pose = noVizinho.pose;
      vizinho = noVizinho.vizinho;
    } else {
      // Já encostado na parede: o vizinho só pode deslizar o móvel ao longo dela. Reencosta e só aceita se a rotação continuar a mesma.
      const reencoste = encaixarNaParede(noVizinho.pose, alvo.caixa, entrada.faces, distanciaParede);
      if (reencoste && Math.abs(reencoste.pose.rotation - pose.rotation) < TOL_ROTACAO) {
        pose = reencoste.pose;
        parede = reencoste.face;
        vizinho = noVizinho.vizinho;
      }
    }
  }

  const final: Corpo = { id: alvo.id, pose, caixa: alvo.caixa };
  return {
    pose,
    parede,
    vizinho,
    colisoes: colisoes(final, entrada.outros, entrada.faces),
    guias: guiasDeAlinhamento(pose, alvo.caixa, entrada.outros),
  };
}
