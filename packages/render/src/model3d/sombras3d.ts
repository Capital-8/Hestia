import * as THREE from 'three';

/** Campos do renderer que a sombra sob demanda usa (`WebGLRenderer.shadowMap` tem estes dois). */
export interface MapaDeSombraRenderer {
  shadowMap: { autoUpdate: boolean; needsUpdate: boolean; enabled?: boolean };
}

/**
 * Sombra sob demanda: por padrão o renderer refaz o mapa de sombra a cada quadro. Aqui ele não refaz: a cena marca o mapa
 * como sujo quando o modelo ou o sol mudam (`ModelScene.update`), e `aplicar`, antes de desenhar, pede a nova geração só
 * nesse quadro. Girar, dar zoom ou realçar não sujam o mapa: a luz e a geometria são as mesmas.
 */
export class SombraSobDemanda {
  private suja = true;

  /** Marca o mapa como sujo: o próximo `aplicar` pede a nova geração. */
  marcar(): void {
    this.suja = true;
  }

  /** Se o mapa está sujo, agora (sem alterar a marca). */
  get sujo(): boolean {
    return this.suja;
  }

  /**
   * Desliga a regeneração automática do renderer e, se o mapa estiver sujo, pede uma neste quadro. Devolve se pediu.
   * `adiar` (gesto de câmera ativo): o mapa continua sujo e o quadro desenha com o mapa anterior; a nova geração fica para
   * o primeiro quadro depois do gesto, para a órbita não pagar o passe de sombra inteiro logo depois de uma edição.
   */
  aplicar(renderer: MapaDeSombraRenderer, adiar = false): boolean {
    renderer.shadowMap.autoUpdate = false;
    if (!this.suja || adiar) return false;
    renderer.shadowMap.needsUpdate = true;
    this.suja = false;
    return true;
  }
}

/**
 * Teto padrão de triângulos do passe de sombra (Fase 2.7, orçamento de sombra). O passe de sombra desenha a cena uma
 * segunda vez; em 60 pavimentos × 256 paredes ele sozinho dobra os 1,7 M triângulos do quadro. Com o teto, só as faixas
 * mais próximas do alvo projetam sombra quando a cena inteira passaria do orçamento. Valor escolhido para o primeiro
 * quadro de 60 × 256 ficar abaixo de 3 M (1,70 M de cor + até 1,25 M de sombra).
 */
export const SOMBRA_MAX_TRIANGULOS = 1_250_000;

/** Uma faixa que pode projetar sombra: a caixa (mundo), os triângulos e os objetos que o orçamento liga/desliga. */
export interface FaixaDeSombra {
  caixa: THREE.Box3 | null;
  triangulos: number;
  alvos: readonly THREE.Mesh[];
}

/** Faixas escolhidas para o passe de sombra e o resultado do orçamento. */
export interface EscolhaDeSombra {
  /** Índices (na lista de faixas) que projetam sombra, na ordem de inclusão. */
  incluidas: readonly number[];
  /** Triângulos que o passe de sombra vai desenhar. */
  triangulos: number;
  /** Triângulos de todas as faixas (antes do orçamento). */
  triangulosDisponiveis: number;
  /** Caixa (mundo) das faixas incluídas; null sem geometria. */
  caixa: THREE.Box3 | null;
  /** Alguma faixa ficou de fora do passe de sombra. */
  limitada: boolean;
}

/**
 * Orçamento de sombra: inclui as faixas por ordem de distância ao alvo (o ponto de interesse da câmera) até o teto de
 * triângulos. A faixa mais próxima entra sempre, mesmo que sozinha passe do teto: uma cena sem nenhuma sombra mudaria
 * muito mais a imagem do que uma sombra sem a caixa distante.
 */
export function orcamentoDeSombra(
  faixas: readonly FaixaDeSombra[],
  alvo: THREE.Vector3,
  teto = SOMBRA_MAX_TRIANGULOS,
): EscolhaDeSombra {
  const limite = Number.isFinite(teto) ? Math.max(0, teto) : SOMBRA_MAX_TRIANGULOS;
  const ordem = faixas
    .map((f, i) => ({ i, d: f.caixa && !f.caixa.isEmpty() ? f.caixa.distanceToPoint(alvo) : Number.POSITIVE_INFINITY }))
    .filter((x) => faixas[x.i]!.triangulos > 0)
    .sort((a, b) => a.d - b.d || a.i - b.i);
  const incluidas: number[] = [];
  const caixa = new THREE.Box3();
  let triangulos = 0;
  let triangulosDisponiveis = 0;
  for (const f of faixas) triangulosDisponiveis += Math.max(0, f.triangulos);
  for (const { i } of ordem) {
    const f = faixas[i]!;
    // Contíguo a partir do alvo: a primeira faixa que não cabe encerra a seleção (sem buraco no mapa de sombra).
    if (incluidas.length > 0 && triangulos + f.triangulos > limite) break;
    incluidas.push(i);
    triangulos += f.triangulos;
    if (f.caixa && !f.caixa.isEmpty()) caixa.union(f.caixa);
  }
  return {
    incluidas,
    triangulos,
    triangulosDisponiveis,
    caixa: caixa.isEmpty() ? null : caixa,
    limitada: incluidas.length < ordem.length,
  };
}

/** Liga `castShadow` só nas faixas escolhidas (as demais deixam de desenhar no passe de sombra). */
export function aplicarSombra(faixas: readonly FaixaDeSombra[], escolha: EscolhaDeSombra): void {
  const dentro = new Set(escolha.incluidas);
  faixas.forEach((f, i) => {
    const projetar = dentro.has(i);
    for (const m of f.alvos) m.castShadow = projetar;
  });
}

/** Medidas do enquadramento da câmera do sol (para o relatório e os testes). */
export interface EnquadramentoSombra {
  largura: number;
  altura: number;
  /** Tamanho (m) de um texel do mapa de sombra no chão: a medida da nitidez da sombra. */
  texelM: number;
  /** Lado do mapa de sombra usado neste enquadramento (potência de 2). */
  mapa: number;
  near: number;
  far: number;
}

/**
 * Lado do mapa de sombra (potência de 2) para a região enquadrada: um texel por pixel de tela na distância do alvo.
 * Um mapa maior que a tela não melhora nada e paga fill rate em dobro (o mapa de 2048² com a caixa justa do prédio
 * custava ~8 ms no primeiro quadro da RX 580). Um mapa menor que a tela serrilha a sombra.
 */
export function tamanhoDoMapaDeSombra(regiaoM: number, metrosPorPixel: number, min = 512, max = 2048): number {
  const regiao = Number.isFinite(regiaoM) ? Math.max(1, regiaoM) : 1;
  const densidade = Number.isFinite(metrosPorPixel) && metrosPorPixel > 0 ? metrosPorPixel : regiao / max;
  const texels = regiao / densidade;
  const potencia = 2 ** Math.ceil(Math.log2(Math.max(1, texels)));
  return Math.max(min, Math.min(max, potencia));
}

/**
 * Volume que o mapa de sombra precisa cobrir: a caixa dos projetores **mais onde a sombra deles cai no chão**. Sem essa
 * segunda parte, o receptor (chão) fica além do plano distante da câmera do sol e nenhuma sombra aparece nele — era o
 * defeito do primeiro enquadramento "justo" desta frente. A luz vem de `direcao` (do alvo para a luz), então o ponto
 * `p` projeta no chão em `p − direcao·(p.z/direcao.z)`.
 */
export function volumeDeSombra(caixa: THREE.Box3, direcao: THREE.Vector3): THREE.Box3 {
  const volume = caixa.clone();
  if (volume.isEmpty()) return volume;
  const dir = direcao.clone();
  if (dir.lengthSq() === 0) return volume;
  dir.normalize();
  if (dir.z <= 1e-6) return volume;
  const chao = volume.min.z <= 0 ? volume.min.z : 0;
  const canto = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    canto.set(i & 1 ? volume.max.x : volume.min.x, i & 2 ? volume.max.y : volume.min.y, i & 4 ? volume.max.z : volume.min.z);
    const t = Math.max(0, (canto.z - chao) / dir.z);
    volume.expandByPoint(new THREE.Vector3(canto.x - dir.x * t, canto.y - dir.y * t, chao));
  }
  return volume;
}

/**
 * Enquadra a câmera ortográfica do sol (Fase 2.7). O enquadramento antigo usava um cubo de lado igual à diagonal do
 * modelo (≈ 380 m em 60 pavimentos), o que dava ~19 cm por texel num mapa de 2048²; este usa o volume de sombra
 * (`volumeDeSombra`: projetores + onde a sombra cai) nos eixos da luz e devolve a nitidez possível. Com o orçamento de
 * sombra o volume encolhe quando a câmera se aproxima.
 */
export function enquadrarSombra(
  sol: THREE.DirectionalLight,
  caixaProjetores: THREE.Box3,
  direcao: THREE.Vector3,
): EnquadramentoSombra | null {
  if (caixaProjetores.isEmpty()) return null;
  const dir = direcao.clone();
  if (dir.lengthSq() === 0) return null;
  dir.normalize();
  const caixa = volumeDeSombra(caixaProjetores, dir);
  const centro = caixa.getCenter(new THREE.Vector3());
  const tamanho = caixa.getSize(new THREE.Vector3());
  const raio = tamanho.length() / 2;
  const cam = sol.shadow.camera;
  const distancia = Math.max(1, raio * 2 + 1);
  cam.position.copy(centro).addScaledVector(dir, distancia);
  cam.up.set(0, 0, 1);
  cam.lookAt(centro);
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse;
  const canto = new THREE.Vector3();
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    canto.set(i & 1 ? caixa.max.x : caixa.min.x, i & 2 ? caixa.max.y : caixa.min.y, i & 4 ? caixa.max.z : caixa.min.z);
    canto.applyMatrix4(inv);
    if (canto.x < x0) x0 = canto.x;
    if (canto.y < y0) y0 = canto.y;
    if (canto.z < z0) z0 = canto.z;
    if (canto.x > x1) x1 = canto.x;
    if (canto.y > y1) y1 = canto.y;
    if (canto.z > z1) z1 = canto.z;
  }
  // Folga de um texel em cada lado (evita perder a borda por arredondamento da matriz).
  const folgaLateral = Math.max(0.05, raio * 0.01);
  cam.left = x0 - folgaLateral;
  cam.right = x1 + folgaLateral;
  cam.bottom = y0 - folgaLateral;
  cam.top = y1 + folgaLateral;
  cam.near = Math.max(0.05, -z1 - folgaLateral);
  cam.far = Math.max(cam.near + 1, -z0 + folgaLateral);
  cam.updateProjectionMatrix();
  sol.position.copy(cam.position);
  sol.target.position.copy(centro);
  sol.target.updateMatrixWorld();
  const largura = cam.right - cam.left;
  const altura = cam.top - cam.bottom;
  const mapa = sol.shadow.mapSize;
  const texelM = Math.max(largura / Math.max(1, mapa.x), altura / Math.max(1, mapa.y));
  return { largura, altura, texelM, mapa: Math.max(mapa.x, mapa.y), near: cam.near, far: cam.far };
}

/**
 * Prepara o passe de sombra do quadro a partir do renderer (gancho `scene.onBeforeRender`): o orçamento por faixa, o
 * enquadramento do sol e o LOD do mapa pela densidade da tela. Fica aqui, e não na cena, para a cena só chamar uma linha.
 */
export function prepararSombraDoQuadro(op: {
  renderer: MapaDeSombraRenderer & { getSize?(alvo: THREE.Vector2): THREE.Vector2 };
  sombras: SombrasDaCena;
  faixas: readonly FaixaDeSombra[];
  sol: THREE.DirectionalLight;
  alvo: THREE.Vector3;
  direcao: THREE.Vector3;
  camera: THREE.Camera;
  /** Distância da câmera ao alvo (m): entra na densidade da tela. */
  distancia: number;
  teto: number;
  /** Vetor de reuso do tamanho da tela (evita alocar por quadro). */
  tamanhoTela: THREE.Vector2;
}): void {
  if (op.faixas.length === 0) return;
  const metrosPorPixel = metrosPorPixelDaTela(op.renderer, op.camera, op.distancia, op.tamanhoTela);
  const sm = op.renderer.shadowMap;
  // LOD de sombra por distância: enquadramento novo (zoom) pede outro lado de mapa; refaz neste mesmo quadro, antes do
  // passe de sombra, para o mapa já nascer no tamanho certo (sem quadro com sombra velha).
  if (!sm.needsUpdate && op.sombras.resolucaoIdeal(op.sol, metrosPorPixel) !== null) sm.needsUpdate = true;
  if (!sm.needsUpdate) return;
  op.sombras.preparar(op.renderer, op.faixas, op.sol, op.alvo, op.direcao, op.teto, metrosPorPixel);
}

/**
 * Metros por pixel de tela na distância do alvo: a densidade que a sombra pode mostrar. O mapa não precisa de mais
 * texels que isso (e o dobro de texels custa o dobro de fill rate no passe de sombra).
 */
export function metrosPorPixelDaTela(
  renderer: { getSize?(alvo: THREE.Vector2): THREE.Vector2 },
  camera: THREE.Camera,
  distancia: number,
  tamanhoTela: THREE.Vector2,
): number | null {
  if (!renderer.getSize) return null;
  const altura = renderer.getSize(tamanhoTela).y;
  if (!(altura > 0)) return null;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    return (2 * distancia * Math.tan(fov / 2)) / altura;
  }
  const ortho = camera as THREE.OrthographicCamera;
  return (ortho.top - ortho.bottom) / altura;
}
/**
 * Política de sombra da cena: mantém a sombra sob demanda e, quando o mapa vai mesmo ser refeito, aplica o orçamento de
 * triângulos por faixa e enquadra o sol no volume de sombra. É usada pelo gancho `scene.onBeforeRender` (via
 * `prepararSombraDoQuadro`), que o three chama antes da lista de desenho e antes do passe de sombra.
 */
export class SombrasDaCena {
  readonly sobDemanda = new SombraSobDemanda();
  private _ultima: EscolhaDeSombra | null = null;
  private _enquadramento: EnquadramentoSombra | null = null;

  /** Último orçamento aplicado (null enquanto não houve passe de sombra). */
  get ultima(): EscolhaDeSombra | null {
    return this._ultima;
  }

  /** Último enquadramento da câmera do sol. */
  get enquadramento(): EnquadramentoSombra | null {
    return this._enquadramento;
  }

  /** Marca o mapa como sujo (o modelo ou o sol mudaram). */
  marcar(): void {
    this.sobDemanda.marcar();
  }

  /**
   * Lado do mapa que a densidade da tela pede hoje, ou null quando o mapa atual já está na faixa certa (ou ainda não há
   * escolha). Serve de LOD de sombra por distância: ao aproximar, o mapa cresce (sombra nítida); ao afastar, encolhe.
   */
  resolucaoIdeal(sol: THREE.DirectionalLight, metrosPorPixel: number | null): number | null {
    if (metrosPorPixel === null || !(metrosPorPixel > 0) || !this._ultima?.caixa) return null;
    const tamanho = volumeDeSombra(this._ultima.caixa, this._direcao).getSize(new THREE.Vector3());
    const regiao = Math.max(tamanho.x, tamanho.y, tamanho.z);
    const ideal = tamanhoDoMapaDeSombra(regiao, metrosPorPixel);
    return ideal === sol.shadow.mapSize.x ? null : ideal;
  }

  /** Direção do sol da última preparação (para dimensionar o mapa fora do passe de sombra). */
  private _direcao = new THREE.Vector3(0, 0, 1);

  /** Sombra sob demanda: chamado pela vista antes de desenhar. */
  aplicar(renderer: MapaDeSombraRenderer): boolean {
    return this.sobDemanda.aplicar(renderer);
  }

  /**
   * Prepara o passe de sombra do quadro: se o renderer vai refazer o mapa, escolhe as faixas dentro do orçamento e
   * enquadra o sol. Sem refazer o mapa, não faz nada (a câmera do sol não pode mudar com o mapa velho).
   *
   * `metrosPorPixel` (opcional) é a densidade da tela na distância do alvo: o mapa de sombra é redimensionado para um
   * texel por pixel, em potência de 2. Sem ele o mapa fica no tamanho configurado (`mapSize`).
   */
  preparar(
    renderer: MapaDeSombraRenderer,
    faixas: readonly FaixaDeSombra[],
    sol: THREE.DirectionalLight,
    alvo: THREE.Vector3,
    direcao: THREE.Vector3,
    teto = SOMBRA_MAX_TRIANGULOS,
    metrosPorPixel: number | null = null,
  ): EscolhaDeSombra | null {
    const sm = renderer.shadowMap;
    if (sm.enabled === false || !sm.needsUpdate) return null;
    const escolha = orcamentoDeSombra(faixas, alvo, teto);
    aplicarSombra(faixas, escolha);
    this._ultima = escolha;
    this._direcao.copy(direcao);
    if (escolha.caixa) {
      // O mapa é redimensionado antes do enquadramento (o texel medido é o do tamanho que vai ser usado neste passe).
      if (metrosPorPixel !== null && metrosPorPixel > 0) this.redimensionarMapa(sol, escolha.caixa, direcao, metrosPorPixel);
      this._enquadramento = enquadrarSombra(sol, escolha.caixa, direcao);
    } else this._enquadramento = null;
    return escolha;
  }

  /** Ajusta o lado do mapa ao volume de sombra e à tela; só troca a textura quando o tamanho muda (e libera a antiga). */
  private redimensionarMapa(sol: THREE.DirectionalLight, caixaProjetores: THREE.Box3, direcao: THREE.Vector3, metrosPorPixel: number): void {
    const tamanho = volumeDeSombra(caixaProjetores, direcao).getSize(new THREE.Vector3());
    const regiao = Math.max(tamanho.x, tamanho.y, tamanho.z);
    const mapa = tamanhoDoMapaDeSombra(regiao, metrosPorPixel);
    if (sol.shadow.mapSize.x === mapa && sol.shadow.mapSize.y === mapa) return;
    sol.shadow.mapSize.set(mapa, mapa);
    sol.shadow.map?.dispose();
    sol.shadow.map = null;
  }
}
