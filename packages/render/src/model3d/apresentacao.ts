/**
 * Regra única do modo apresentação (estúdio, vídeo, imagem final): o que entra na imagem é só a construção do usuário.
 *
 * Quem decide é `ehElementoDeApresentacao`, usada por `ModelScene.exportarCenaDeRender` e por `ModelScene.modoApresentacao`.
 * A regra segue a visibilidade que `visivelNaCena` já exige (o objeto e os ancestrais têm de estar `visible`) e acrescenta
 * só o que não é construção: datum e rótulos de nível (`levels`, `levelsPlane`), o chão de sombra (`chaoDeSombra`), o
 * contorno de Reveal (`reveal`), malhas de picking das caixas (`caixasPick`), auxiliares marcados (`helper`) e os
 * auxiliares do three.js (grade, eixos, câmera, setas, caixa, plano, esqueleto).
 *
 * Função pura: só lê metadados (tipo, visibilidade, userData e pais), sem DOM nem WebGL.
 */

/** Metadados mínimos de um objeto da cena. `THREE.Object3D` satisfaz esta forma. */
export interface MetadadosDeObjeto {
  type?: string;
  visible: boolean;
  userData?: Record<string, unknown>;
  parent?: MetadadosDeObjeto | null;
}

/** Marcas de userData que identificam o que não é construção do usuário. */
const MARCAS_FORA_DA_APRESENTACAO = ['levels', 'levelsPlane', 'chaoDeSombra', 'reveal', 'caixasPick', 'helper'] as const;

/** Tipos three.js de auxiliares de depuração/edição: nunca entram na imagem final. */
const TIPOS_AUXILIARES = new Set([
  'GridHelper',
  'PolarGridHelper',
  'AxesHelper',
  'CameraHelper',
  'ArrowHelper',
  'BoxHelper',
  'PlaneHelper',
  'SkeletonHelper',
]);

/**
 * `true` quando o objeto (e todos os seus ancestrais) está visível e nenhum deles é datum, chão, grade, picking,
 * realce ou auxiliar. Objetos sem marca nenhuma, visíveis, são construção do usuário.
 */
export function ehElementoDeApresentacao(objeto: MetadadosDeObjeto): boolean {
  for (let atual: MetadadosDeObjeto | null | undefined = objeto; atual; atual = atual.parent) {
    if (!atual.visible) return false;
    if (atual.type !== undefined && TIPOS_AUXILIARES.has(atual.type)) return false;
    const marcas = atual.userData;
    if (marcas) {
      for (const marca of MARCAS_FORA_DA_APRESENTACAO) {
        if (marcas[marca] === true) return false;
      }
    }
  }
  return true;
}
