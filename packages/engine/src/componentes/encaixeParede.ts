import type { CaixaLocal, EncaixeNaParede, FaceDeParede, Pose } from './encaixeTipos.ts';
import type { Vec2 } from '@hestia/geom';

/** Tolerância (m) para a projeção do ponto central do fundo cair dentro do segmento da face. */
const TOL_PROJECAO = 0.001;

/** Ponto local (x, y) → mundo: `R(rotation) · E · local + (x, y)`, com `E` espelhando X quando `mirrored`. */
function pontoNoPlano(pose: Pose, x: number, y: number): Vec2 {
  const cos = Math.cos(pose.rotation);
  const sen = Math.sin(pose.rotation);
  const lx = pose.mirrored ? -x : x;
  return { x: pose.x + lx * cos - y * sen, y: pose.y + lx * sen + y * cos };
}

/** Ângulo para o intervalo (−π, π] (com −π virando π; −0 preservado como −0). */
function normalizar(angulo: number): number {
  let a = angulo % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  else if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Face que o móvel enxerga de frente: centro no lado livre e projeção do fundo dentro do segmento. Guarda a geometria da face. */
interface Candidato {
  indice: number;
  /** Direção unitária de a→b. */
  d: Vec2;
  /** Normal unitária à esquerda de a→b (lado livre). */
  n: Vec2;
  /** Coordenada da face ao longo de n (qualquer ponto da face · n). */
  desloc: number;
  /** Distância (m) do fundo à face antes do encaixe. */
  distancia: number;
}

function candidato(i: number, f: FaceDeParede, centro: Vec2, fundo: Vec2, distanciaMax: number): Candidato | null {
  const dxBruto = f.b.x - f.a.x;
  const dyBruto = f.b.y - f.a.y;
  const comp = Math.hypot(dxBruto, dyBruto);
  if (comp === 0) return null;
  const d: Vec2 = { x: dxBruto / comp, y: dyBruto / comp };
  const n: Vec2 = { x: -d.y, y: d.x };
  if ((centro.x - f.a.x) * n.x + (centro.y - f.a.y) * n.y <= 0) return null;
  const aoLongo = (fundo.x - f.a.x) * d.x + (fundo.y - f.a.y) * d.y;
  if (aoLongo < -TOL_PROJECAO || aoLongo > comp + TOL_PROJECAO) return null;
  const distancia = (fundo.x - f.a.x) * n.x + (fundo.y - f.a.y) * n.y;
  if (distancia > distanciaMax) return null;
  return { indice: i, d, n, desloc: f.a.x * n.x + f.a.y * n.y, distancia };
}

/**
 * Encaixa o FUNDO do móvel (plano local y = caixa.max[1]) numa face de parede: gira o móvel para o fundo ficar paralelo à face
 * (frente voltada para o lado livre, a esquerda de a→b), encosta o fundo na face e preserva a posição ao longo da face. Escolhe a face
 * mais próxima do fundo dentro de `distanciaMax` (m, padrão 0,30), entre as que o móvel enxerga de frente (a frente está do lado livre).
 * Sem face dentro do alcance devolve null. Não altera `z` nem `mirrored`. Ver `encaixeTipos.ts` para as convenções.
 */
export function encaixarNaParede(pose: Pose, caixa: CaixaLocal, faces: readonly FaceDeParede[], distanciaMax = 0.3): EncaixeNaParede | null {
  const centroLocalX = (caixa.min[0] + caixa.max[0]) / 2;
  const centroLocalY = (caixa.min[1] + caixa.max[1]) / 2;
  const fundoY = caixa.max[1];
  const centro = pontoNoPlano(pose, centroLocalX, centroLocalY);
  const fundo = pontoNoPlano(pose, centroLocalX, fundoY);
  let melhor: Candidato | null = null;
  for (let i = 0; i < faces.length; i++) {
    const c = candidato(i, faces[i]!, centro, fundo, distanciaMax);
    if (c && (!melhor || c.distancia < melhor.distancia)) melhor = c;
  }
  if (!melhor) return null;
  // Rotação que põe a frente (local −Y) na normal n: R · (0, −1) = n ⟺ cos = −d.x, sen = −d.y.
  const rotation = normalizar(Math.atan2(-melhor.d.y, -melhor.d.x));
  // Com essa rotação, o ponto local (x, y) fica em p − (mx)·d − y·n (mx = x espelhado se `mirrored`).
  // Encostar o fundo: p · n = desloc + fundoY. Preservar o centro ao longo da face: p · d = centro · d + mx.
  const mx = pose.mirrored ? -centroLocalX : centroLocalX;
  const aoLongoCentro = centro.x * melhor.d.x + centro.y * melhor.d.y + mx;
  const naNormal = melhor.desloc + fundoY;
  return {
    pose: {
      x: aoLongoCentro * melhor.d.x + naNormal * melhor.n.x,
      y: aoLongoCentro * melhor.d.y + naNormal * melhor.n.y,
      rotation,
      mirrored: pose.mirrored,
      z: pose.z,
    },
    face: melhor.indice,
    distancia: Math.max(0, melhor.distancia),
  };
}
