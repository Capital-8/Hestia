/**
 * Geometria da câmera de render na planta (H13): funções puras, sem tela nem projeto. A ferramenta Câmera de render
 * e a sobreposição da planta usam as mesmas contas, para o cone desenhado ser o campo de visão que o render usa.
 * Unidades: metros, plano XY (0 rad = +X, sentido anti-horário). Z só aparece onde é a altura do olho.
 */

/** Altura do olho acima do piso do nível (m), quando a câmera é colocada. */
export const ALTURA_OLHO_M = 1.6;

/** Distância (m) do alvo e comprimento do cone desenhado na planta. */
export const DISTANCIA_CAMERA_M = 10;

/** Campo de visão horizontal (graus) das câmeras novas. */
export const FOV_CAMERA_PADRAO_DEG = 60;

/** Proporção das câmeras novas (largura:altura). */
export const ASPECT_CAMERA_PADRAO = { w: 16, h: 9 } as const;

interface Ponto2 {
  x: number;
  y: number;
}

/** Ângulo (rad, plano XY) da direção da câmera: do ponto de vista ao alvo. Só XY; a altura não entra. */
export function direcaoDaCamera(posicao: Ponto2, alvo: Ponto2): { angulo: number } {
  return { angulo: Math.atan2(alvo.y - posicao.y, alvo.x - posicao.x) };
}

/**
 * Triângulo do cone de visão: [posição, ponta esquerda, ponta direita]. As pontas ficam a `distancia` da posição, em
 * `angulo - fov/2` e `angulo + fov/2`, então o ângulo entre elas é exatamente o FOV horizontal pedido.
 */
export function poligonoDoCone(posicao: Ponto2, angulo: number, fovDeg: number, distancia: number): Array<{ x: number; y: number }> {
  const meio = (fovDeg * Math.PI) / 360;
  const ponta = (a: number): { x: number; y: number } => ({ x: posicao.x + distancia * Math.cos(a), y: posicao.y + distancia * Math.sin(a) });
  return [{ x: posicao.x, y: posicao.y }, ponta(angulo - meio), ponta(angulo + meio)];
}

/** Alvo a `distancia` da posição na direção `angulo`, à altura `zAlvo` (a mesma da câmera quando olha horizontal). */
export function alvoAPartirDaDirecao(posicao: Ponto2, angulo: number, distancia: number, zAlvo: number): { x: number; y: number; z: number } {
  return { x: posicao.x + distancia * Math.cos(angulo), y: posicao.y + distancia * Math.sin(angulo), z: zAlvo };
}

/** Altura absoluta do olho: elevação do nível + 1,6 m. Sem elevação finita (nível inexistente), 1,6 m. */
export function alturaDoOlho(elevacaoDoNivel: number): number {
  return Number.isFinite(elevacaoDoNivel) ? elevacaoDoNivel + ALTURA_OLHO_M : ALTURA_OLHO_M;
}

const cruz = (o: Ponto2, a: Ponto2, b: Ponto2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Ponto dentro do triângulo (ou sobre a borda), por sinais do produto vetorial. */
function noTriangulo(p: Ponto2, t: Ponto2[]): boolean {
  const [a, b, c] = t as [Ponto2, Ponto2, Ponto2];
  const d1 = cruz(a, b, p);
  const d2 = cruz(b, c, p);
  const d3 = cruz(c, a, p);
  const temNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const temPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(temNeg && temPos);
}

/**
 * Câmera sob o ponto (clique em planta): a posição dentro do raio, ou o cone de visão. Devolve o id da primeira que
 * casar, ou null. `raio` em metros (a interface passa ~8 px convertidos).
 */
export function cameraEmPonto<T extends { id: string; position: Ponto2; target: Ponto2; fovDeg: number }>(cameras: readonly T[], ponto: Ponto2, raio: number): string | null {
  for (const c of cameras) {
    if (Math.hypot(ponto.x - c.position.x, ponto.y - c.position.y) <= raio) return c.id;
    const { angulo } = direcaoDaCamera(c.position, c.target);
    if (noTriangulo(ponto, poligonoDoCone(c.position, angulo, c.fovDeg, DISTANCIA_CAMERA_M))) return c.id;
  }
  return null;
}
