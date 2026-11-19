import type { Pose } from './encaixeTipos.ts';

/** Pose no plano devolvida para cada membro do movimento rígido. */
export interface PoseNoPlano {
  x: number;
  y: number;
  rotation: number;
}

/** Entrada de `posarGrupoRigido`: o líder, as poses iniciais dos membros e a pose final do líder. */
export interface EntradaGrupoRigido {
  lider: string;
  iniciais: ReadonlyMap<string, Pose>;
  poseFinalDoLider: Pose;
}

/**
 * Movimento rígido de um conjunto de componentes: o líder recebe a pose final e cada outro membro mantém, em relação ao líder,
 * a mesma posição inicial girada por Δθ = final.rotation − inicial.rotation em torno da pose inicial do líder; a rotação de cada
 * membro é a inicial + Δθ. É a conta que o arrasto do 3D fazia inline (`Arrasto3D.mover`) e que o arrasto da planta reaproveita.
 * Puro e numérico (metros e radianos). Lança se o líder não estiver em `iniciais`.
 */
export function posarGrupoRigido(entrada: EntradaGrupoRigido): Map<string, PoseNoPlano> {
  const inicialDoLider = entrada.iniciais.get(entrada.lider);
  if (!inicialDoLider) throw new Error('Líder do movimento rígido não existe nas poses iniciais: ' + entrada.lider);
  const final = entrada.poseFinalDoLider;
  const dTheta = final.rotation - inicialDoLider.rotation;
  const cos = Math.cos(dTheta);
  const sin = Math.sin(dTheta);
  const poses = new Map<string, PoseNoPlano>();
  for (const [id, inicial] of entrada.iniciais) {
    if (id === entrada.lider) {
      poses.set(id, { x: final.x, y: final.y, rotation: final.rotation });
      continue;
    }
    const lx = inicial.x - inicialDoLider.x;
    const ly = inicial.y - inicialDoLider.y;
    poses.set(id, {
      x: final.x + lx * cos - ly * sin,
      y: final.y + lx * sin + ly * cos,
      rotation: inicial.rotation + dTheta,
    });
  }
  return poses;
}
