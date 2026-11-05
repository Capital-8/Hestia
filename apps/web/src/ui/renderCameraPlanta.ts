/**
 * Câmera de render na planta (H13): as contas da ferramenta e do desenho do cone. A implementação mora em
 * `@hestia/tools` (a ferramenta precisa delas e a camada `tools` não importa a interface); este módulo reexporta para a
 * interface e para os testes.
 */
export {
  ALTURA_OLHO_M,
  ASPECT_CAMERA_PADRAO,
  DISTANCIA_CAMERA_M,
  FOV_CAMERA_PADRAO_DEG,
  alturaDoOlho,
  alvoAPartirDaDirecao,
  cameraEmPonto,
  direcaoDaCamera,
  poligonoDoCone,
} from '@hestia/tools';
