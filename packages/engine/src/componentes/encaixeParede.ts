import type { CaixaLocal, EncaixeNaParede, FaceDeParede, Pose } from './encaixeTipos.ts';

/**
 * Encaixa o FUNDO do móvel (plano local y = caixa.max[1]) numa face de parede: gira o móvel para o fundo ficar paralelo à face
 * (frente voltada para o lado livre, a esquerda de a→b), encosta o fundo na face e preserva a posição ao longo da face. Escolhe a face
 * mais próxima do fundo dentro de `distanciaMax` (m, padrão 0,30), entre as que o móvel enxerga de frente (a frente está do lado livre).
 * Sem face dentro do alcance devolve null. Não altera `z` nem `mirrored`. Ver `encaixeTipos.ts` para as convenções.
 */
export function encaixarNaParede(_pose: Pose, _caixa: CaixaLocal, _faces: readonly FaceDeParede[], _distanciaMax = 0.3): EncaixeNaParede | null {
  throw new Error('não implementado');
}
