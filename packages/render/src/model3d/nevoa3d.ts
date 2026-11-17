/**
 * Faixa da névoa linear da cena 3D, dimensionada pela câmera e pela caixa da cena. Com a névoa fixa de 60 a 170 m, o
 * "Enquadrar tudo" numa obra grande (câmera a ~230 m) esmaecia a cena inteira até sumir. Agora a faixa cresce até a
 * parte mais distante da cena ficar antes do esmaecimento total; cenas pequenas continuam exatamente em 60 a 170 m.
 */

/** Ponto (m) no formato de `THREE.Vector3`: a função não depende do three. */
export interface PontoNevoa {
  x: number;
  y: number;
  z: number;
}

/** Caixa (m) da cena no formato de `THREE.Box3`. Vazia quando `min` passa de `max` (o `Box3` vazio do three). */
export interface CaixaNevoa {
  min: PontoNevoa;
  max: PontoNevoa;
}

/** Faixa de partida da névoa (m): a que o app usava desde sempre. Cenas pequenas ficam exatamente nela. */
export const NEVOA = { near: 60, far: 170 } as const;

/** Folga mínima (m) além do canto mais distante, para o ponto mais longe nunca cair no esmaecimento total. */
const FOLGA_MINIMA = 1;

function caixaVazia(c: CaixaNevoa): boolean {
  return c.min.x > c.max.x || c.min.y > c.max.y || c.min.z > c.max.z;
}

/** Distância (m) da câmera ao canto da caixa mais longe dela: nenhum ponto da caixa fica mais longe que isso. */
function distanciaAoCantoMaisLonge(p: PontoNevoa, c: CaixaNevoa): number {
  const dx = Math.max(Math.abs(p.x - c.min.x), Math.abs(p.x - c.max.x));
  const dy = Math.max(Math.abs(p.y - c.min.y), Math.abs(p.y - c.max.y));
  const dz = Math.max(Math.abs(p.z - c.min.z), Math.abs(p.z - c.max.z));
  return Math.hypot(dx, dy, dz);
}

/**
 * Faixa (`near`, `far`) da névoa linear para a câmera em `camera` e a cena na `caixa` (ou null sem cena).
 * `far` = distância da câmera ao canto mais longe da caixa mais a diagonal dela (o mesmo "×2 do raio" do plano distante
 * da câmera), e nunca menos que 170 m. `near` mantém a proporção de partida (60/170) e nunca menos que 60 m.
 * Com câmera ou caixa inválidas, devolve a faixa de partida.
 */
export function faixaDaNevoa(camera: PontoNevoa, caixa: CaixaNevoa | null): { near: number; far: number } {
  const partida = { near: NEVOA.near, far: NEVOA.far };
  if (!caixa || caixaVazia(caixa)) return partida;
  const profundidade = distanciaAoCantoMaisLonge(camera, caixa);
  const diagonal = Math.hypot(caixa.max.x - caixa.min.x, caixa.max.y - caixa.min.y, caixa.max.z - caixa.min.z);
  if (!Number.isFinite(profundidade) || !Number.isFinite(diagonal)) return partida;
  const far = Math.max(NEVOA.far, profundidade + Math.max(diagonal, FOLGA_MINIMA));
  const near = Math.max(NEVOA.near, (far * NEVOA.near) / NEVOA.far);
  return { near, far };
}
