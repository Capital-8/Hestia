import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Material } from '@hestia/model';
import { aplicarTexturaTriplanar, removerTexturaTriplanar } from '@hestia/render';
import { texturas3d } from '../../../editor/texturas3d.ts';
import { FRESTA, RAIO_CANTO, TONS_LADRILHO, gerarLadrilhos, gradeLadrilhos, parametrosMaterial } from './sceneMaterial.ts';

export type PreviewShape = 'sphere' | 'cube' | 'plane';

/** Renderizador WebGL único (um contexto para todas as prévias), contado por referência. */
let compartilhado: { renderer: THREE.WebGLRenderer; env: THREE.Texture; usos: number } | null = null;

export function obterRenderer(): { renderer: THREE.WebGLRenderer; env: THREE.Texture } {
  if (!compartilhado) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    // Ambiente procedural (sem HDR externo): sala neutra convertida em PMREM.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x?.dispose());
    });
    pmrem.dispose();
    compartilhado = { renderer, env, usos: 0 };
  }
  compartilhado.usos++;
  return compartilhado;
}

export function liberarRenderer(): void {
  if (!compartilhado || --compartilhado.usos > 0) return;
  compartilhado.env.dispose();
  compartilhado.renderer.dispose();
  compartilhado.renderer.forceContextLoss();
  compartilhado = null;
}

/** Sombra de contato: gradiente radial gerado por código (DataTexture), sem canvas 2D. */
function texturaContato(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      const a = Math.max(0, 1 - r);
      const i = (y * n + x) * 4;
      data[i + 3] = Math.round(255 * a * a * 0.75);
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export interface CenaMaterial {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Atualiza só o material físico (sem recriar a cena). */
  aplicarMaterial(m: Material): void;
  definirForma(s: PreviewShape): void;
  /** Mostra ou esconde piso, parede e sombra de contato (só o objeto quando falso). */
  definirCenario(visivel: boolean): void;
  /** Gira o objeto (radianos). */
  girar(yaw: number, pitch: number): void;
  dispose(): void;
}

/** Cena: objeto sobre piso e parede de ladrilhos soltos; luz principal com sombra suave, preenchimento e contato. */
export function criarCena(env: THREE.Texture, forma: PreviewShape, material: Material, low: boolean): CenaMaterial {
  const scene = new THREE.Scene();
  scene.environment = env;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 3.1, 7.2);
  camera.lookAt(0, 1.0, 0);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  // O mapa de ambiente pertence ao renderer compartilhado: não entra aqui.
  const texs: THREE.Texture[] = [];

  // Material do objeto (único): props novas só atualizam seus campos.
  const mat = new THREE.MeshPhysicalMaterial();
  mats.push(mat);
  let comTextura = false;
  const aplicarMaterial = (m: Material): void => {
    const p = parametrosMaterial(m);
    mat.color.set(p.color);
    mat.roughness = p.roughness;
    mat.metalness = p.metalness;
    const mudouTransp = mat.transparent !== p.transparent;
    mat.opacity = p.opacity;
    mat.transparent = p.transparent;
    mat.depthWrite = p.depthWrite;
    mat.clearcoat = p.clearcoat;
    mat.clearcoatRoughness = p.clearcoatRoughness;
    mat.envMapIntensity = p.envMapIntensity;
    // Duas faces sempre: o plano tem verso visível quando se gira o objeto (e o vidro mostra o interior).
    mat.side = THREE.DoubleSide;
    // Textura do catálogo (projeção triplanar, escala real): só com os mapas já baixados; senão fica a cor do material.
    const textura = m.aparencia?.textura;
    const mapas = textura ? texturas3d.obter(textura.imagemId) : undefined;
    if (textura && mapas) {
      aplicarTexturaTriplanar(mat, mapas, textura);
      comTextura = true;
    } else if (comTextura) {
      removerTexturaTriplanar(mat);
      comTextura = false;
    }
    if (mudouTransp) mat.needsUpdate = true;
  };
  aplicarMaterial(material);

  // Cenário (piso, parede, ladrilhos e sombra de contato) num grupo só: dá para mostrar apenas o objeto.
  const cenario = new THREE.Group();
  scene.add(cenario);
  // Fundo visível pelas frestas: argamassa escura.
  const lado = 1;
  const { colunas, linhas } = gradeLadrilhos(low);
  const largura = colunas * lado;
  const espessura = lado * 0.3;
  // Piso e parede têm a MESMA profundidade de fresta: o fundo fica logo atrás da face de trás do ladrilho.
  const recuoFundo = espessura + 0.02;
  const fundoMat = new THREE.MeshStandardMaterial({ color: '#4a4845', roughness: 0.9 });
  mats.push(fundoMat);
  const pisoFundo = new THREE.Mesh(new THREE.PlaneGeometry(largura, linhas * lado), fundoMat);
  geos.push(pisoFundo.geometry);
  pisoFundo.rotation.x = -Math.PI / 2;
  pisoFundo.position.set(0, -recuoFundo, 0);
  pisoFundo.receiveShadow = !low;
  cenario.add(pisoFundo);
  const paredeFundo = new THREE.Mesh(new THREE.PlaneGeometry(largura, linhas * lado), fundoMat);
  geos.push(paredeFundo.geometry);
  const zParede = -linhas * lado * 0.5;
  paredeFundo.position.set(0, (linhas * lado) / 2, zParede - 0.02);
  paredeFundo.receiveShadow = !low;
  cenario.add(paredeFundo);

  // Ladrilhos: RoundedBox em InstancedMesh, cor por instância (três tons), piso e parede.
  const aresta = lado * (1 - FRESTA);
  // Uma única geometria e um único material de ladrilho para piso e parede: mesmo raio de canto e mesma fresta.
  const tileGeo = new RoundedBoxGeometry(aresta, espessura, aresta, low ? 3 : 5, aresta * RAIO_CANTO);
  geos.push(tileGeo);
  const tileMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.35 });
  mats.push(tileMat);
  const tons = TONS_LADRILHO.map((c) => new THREE.Color(c));
  const montar = (ladrilhos: ReturnType<typeof gerarLadrilhos>, alvo: (u: number, v: number, m: THREE.Matrix4) => void): void => {
    const im = new THREE.InstancedMesh(tileGeo, tileMat, ladrilhos.length);
    const m4 = new THREE.Matrix4();
    ladrilhos.forEach((l, i) => {
      alvo(l.u, l.v, m4);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, tons[l.tom]!);
    });
    im.receiveShadow = !low;
    cenario.add(im);
  };
  const rotParede = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  montar(gerarLadrilhos(colunas, linhas, lado), (u, v, m) => m.makeTranslation(u, -espessura / 2, v));
  montar(gerarLadrilhos(colunas, linhas, lado, [0, linhas / 2]), (u, v, m) =>
    m.makeTranslation(u, v, zParede + espessura / 2 - 0.0).multiply(rotParede),
  );

  // Objeto
  // `elevador` assenta o objeto no piso; `grupo` gira em torno do CENTRO do objeto (nada de pêndulo em volta do chão).
  const elevador = new THREE.Group();
  scene.add(elevador);
  const grupo = new THREE.Group();
  elevador.add(grupo);
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(0.9, low ? 32 : 64, low ? 24 : 48), mat);
  const cubo = new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.5, 1.5, 3, 0.08), mat);
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
  geos.push(esfera.geometry, cubo.geometry, plano.geometry);
  for (const o of [esfera, cubo, plano]) {
    o.castShadow = !low;
    grupo.add(o);
  }
  let atual: THREE.Mesh = esfera;
  const caixa = new THREE.Box3();
  /** Apoia o ponto mais baixo do objeto girado no piso: ele encosta e não atravessa. */
  const assentar = (): void => {
    elevador.position.y = 0;
    scene.updateMatrixWorld(true);
    caixa.setFromObject(atual);
    elevador.position.y = -caixa.min.y + 0.002;
  };
  const definirForma = (s: PreviewShape): void => {
    esfera.visible = s === 'sphere';
    cubo.visible = s === 'cube';
    plano.visible = s === 'plane';
    atual = s === 'sphere' ? esfera : s === 'cube' ? cubo : plano;
    assentar();
  };
  definirForma(forma);

  // Sombra de contato (fica sob o objeto, não gira).
  const tc = texturaContato();
  texs.push(tc);
  const contatoMat = new THREE.MeshBasicMaterial({ map: tc, transparent: true, depthWrite: false, color: '#000000' });
  mats.push(contatoMat);
  const contato = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), contatoMat);
  geos.push(contato.geometry);
  contato.rotation.x = -Math.PI / 2;
  contato.position.y = 0.005;
  cenario.add(contato);

  // Luzes: principal (sombra suave PCFSoft) e preenchimento.
  const sol = new THREE.DirectionalLight('#fff4e6', 2.4);
  sol.position.set(-3.5, 6, 4);
  sol.target.position.set(0, 0.8, 0);
  scene.add(sol, sol.target);
  if (!low) {
    sol.castShadow = true;
    sol.shadow.mapSize.set(1024, 1024);
    sol.shadow.radius = 4;
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.02;
    const c = sol.shadow.camera;
    c.left = -5;
    c.right = 5;
    c.top = 5;
    c.bottom = -5;
    c.near = 1;
    c.far = 18;
  }
  const fill = new THREE.DirectionalLight('#dbe6ff', 0.7);
  fill.position.set(4, 2.5, 3);
  scene.add(fill);

  return {
    scene,
    camera,
    aplicarMaterial,
    definirForma,
    definirCenario(visivel) {
      cenario.visible = visivel;
    },
    girar(yaw, pitch) {
      // Ordem XYZ: o giro vertical é sempre em torno do eixo X da TELA (com YXZ ele acompanhava o giro horizontal e
      // ficava invertido depois de virar o objeto).
      grupo.rotation.set(Math.max(-1.5, Math.min(1.5, pitch)), yaw, 0, 'XYZ');
      assentar();
    },
    dispose() {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texs.forEach((t) => t.dispose());
      scene.traverse((o: THREE.Object3D) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      sol.shadow.map?.dispose();
      scene.environment = null;
    },
  };
}
