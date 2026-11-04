import type { Colisoes, CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';
import type { Vec2 } from '@hestia/geom';

/** Retângulo da caixa no plano (mundo): os 4 cantos em sentido anti-horário, na ordem local (min,min), (max,min), (max,max), (min,max). */
export function retanguloNoMundo(pose: Pose, caixa: CaixaLocal): [Vec2, Vec2, Vec2, Vec2] {
  const cos = Math.cos(pose.rotation);
  const sen = Math.sin(pose.rotation);
  const ponto = (x: number, y: number): Vec2 => {
    const lx = pose.mirrored ? -x : x;
    return { x: pose.x + lx * cos - y * sen, y: pose.y + lx * sen + y * cos };
  };
  const [x0, y0] = caixa.min;
  const [x1, y1] = caixa.max;
  return [ponto(x0, y0), ponto(x1, y0), ponto(x1, y1), ponto(x0, y1)];
}

/**
 * Colisões do móvel: com outros móveis (retângulos orientados que se sobrepõem em planta por mais de 1 mm de penetração E em altura
 * por mais de 1 mm; encostar NÃO conta; teste de eixos separadores) e com faces de parede (o retângulo tem algum canto mais de 1 mm
 * além da face, no lado SÓLIDO = direita de a→b, dentro do comprimento da face). Os índices e ids saem em ordem crescente/por id.
 * O móvel de mesmo id na lista `outros` é ignorado.
 */
export function colisoes(_alvo: Corpo, _outros: readonly Corpo[], _faces: readonly FaceDeParede[] = []): Colisoes {
  throw new Error('não implementado');
}
