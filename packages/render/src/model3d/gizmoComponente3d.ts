import * as THREE from 'three';
import type { AlcaGizmoComponente, AlvoComponente3D, HitGizmoComponente } from './gizmoComponenteTipos.ts';

const COR_SETA_FRENTE = 0x22c55e;
const COR_ANEL_GIRAR = 0xf59e0b;
const COR_DIM_L = 0xef4444;
const COR_DIM_P = 0x06b6d4;
const COR_DIM_A = 0x3b82f6;
const COR_HASTE = 0x94a3b8;

/** Pequena elevação sobre z = 0 para evitar z-fighting com o piso do pavimento. */
const OFFSET_CHAO = 0.005;
/** Recuo da seta de frente à frente de `min[1]` (m). */
const RECUO_SETA_FRENTE = 0.08;
const HASTE_COMP = 0.036;
const TAM_CUBO = 0.044;
const RAIO_PEGADOR = 0.03;
const RAIO_ANEL_MIN = 0.35;
const FOLGA_ANEL = 0.12;
const ANGULO_PEGADOR = -Math.PI / 4;
const RENDER_ORDER_GIZMO = 10;

function criarGeometriaSeta(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.07);
  s.lineTo(-0.065, 0.02);
  s.lineTo(-0.022, 0.02);
  s.lineTo(-0.022, 0.065);
  s.lineTo(0.022, 0.065);
  s.lineTo(0.022, 0.02);
  s.lineTo(0.065, 0.02);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function materialBasico(cor: number, opacidade = 1): THREE.MeshBasicMaterial {
  const transparente = opacidade < 1;
  return new THREE.MeshBasicMaterial({
    color: cor,
    transparent: transparente,
    opacity: opacidade,
    depthWrite: !transparente,
    toneMapped: false,
  });
}

/**
 * Gizmo 3D do componente selecionado na vista 3D do projeto:
 * seta verde de frente no chão, anel de rotação no plano XY e alças dimensionais (`dim_L`, `dim_P`, `dim_A`).
 */
export class GizmoComponente3D {
  readonly group = new THREE.Group();

  private readonly raycaster = new THREE.Raycaster();
  private readonly geoSeta = criarGeometriaSeta();
  private readonly geoCubo = new THREE.BoxGeometry(TAM_CUBO, TAM_CUBO, TAM_CUBO);
  private readonly geoHaste = new THREE.CylinderGeometry(0.0045, 0.0045, 1, 8);
  private readonly geoPegador = new THREE.SphereGeometry(RAIO_PEGADOR, 16, 12);
  private geoAnel: THREE.TorusGeometry | null = null;
  private ultimoRaio = -1;

  private readonly matSeta = new THREE.MeshBasicMaterial({
    color: COR_SETA_FRENTE,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly matAnel = materialBasico(COR_ANEL_GIRAR, 0.65);
  private readonly matPegador = materialBasico(COR_ANEL_GIRAR);
  private readonly matDimL = materialBasico(COR_DIM_L);
  private readonly matDimP = materialBasico(COR_DIM_P);
  private readonly matDimA = materialBasico(COR_DIM_A);
  private readonly matHaste = materialBasico(COR_HASTE, 0.85);

  private meshAnel: THREE.Mesh | null = null;
  private alvosPick: THREE.Mesh[] = [];
  private destruido = false;

  constructor() {
    this.group.visible = false;
    this.group.userData = { gizmoComponente: true, semPick: true };
  }

  /** Reposiciona e remonta os elementos do gizmo para o componente alvo, ou oculta se `null`. */
  atualizar(alvo: AlvoComponente3D | null): void {
    if (this.destruido) return;
    this.group.clear();
    this.alvosPick = [];
    this.meshAnel = null;

    if (!alvo) {
      this.group.visible = false;
      return;
    }

    const { min, max } = alvo.caixa;
    const espelhaX = alvo.mirrored;
    const cxLocal = (min[0] + max[0]) / 2;
    const cxG = espelhaX ? -cxLocal : cxLocal;
    const cyG = (min[1] + max[1]) / 2;
    const czG = (min[2] + max[2]) / 2;
    const dx = Math.max(0.05, max[0] - min[0]);
    const dy = Math.max(0.05, max[1] - min[1]);

    this.group.position.set(alvo.x, alvo.y, alvo.z);
    this.group.rotation.set(0, 0, alvo.rotation);
    this.group.scale.set(1, 1, 1);

    // 1. Seta de frente no chão (aponta em -Y local, à frente da caixa)
    const seta = new THREE.Mesh(this.geoSeta, this.matSeta);
    seta.position.set(cxG, min[1] - RECUO_SETA_FRENTE, OFFSET_CHAO);
    seta.renderOrder = RENDER_ORDER_GIZMO;
    seta.userData = { semPick: true };
    this.group.add(seta);

    // 2. Anel de rotação no chão + esfera pegadora
    const raio = Math.max(RAIO_ANEL_MIN, Math.hypot(dx / 2, dy / 2) + FOLGA_ANEL);
    const geoAnel = this.garantirGeometriaAnel(raio);
    const anel = new THREE.Mesh(geoAnel, this.matAnel);
    anel.position.set(cxG, cyG, OFFSET_CHAO);
    anel.renderOrder = RENDER_ORDER_GIZMO;
    anel.userData = { semPick: true, gizmoAlca: 'girar' satisfies AlcaGizmoComponente };
    this.group.add(anel);
    this.meshAnel = anel;
    this.alvosPick.push(anel);

    const pegador = new THREE.Mesh(this.geoPegador, this.matPegador);
    pegador.position.set(
      cxG + raio * Math.cos(ANGULO_PEGADOR),
      cyG + raio * Math.sin(ANGULO_PEGADOR),
      OFFSET_CHAO + 0.006,
    );
    pegador.renderOrder = RENDER_ORDER_GIZMO + 1;
    pegador.userData = { semPick: true, gizmoAlca: 'girar' satisfies AlcaGizmoComponente };
    this.group.add(pegador);
    this.alvosPick.push(pegador);

    // 3. Alças dimensionais (L, P, A)
    if (alvo.editavelL) {
      const dirX = espelhaX ? -1 : 1;
      const xFace = espelhaX ? -max[0] : max[0];
      this.adicionarAlcaDimensional({
        alca: 'dim_L',
        material: this.matDimL,
        valorAtualMm: alvo.Lmm,
        inicioHaste: [xFace, cyG, czG],
        direcao: [dirX, 0, 0],
        rotacaoHaste: [0, 0, Math.PI / 2],
      });
    }

    if (alvo.editavelP) {
      this.adicionarAlcaDimensional({
        alca: 'dim_P',
        material: this.matDimP,
        valorAtualMm: alvo.Pmm,
        inicioHaste: [cxG, min[1], czG],
        direcao: [0, -1, 0],
        rotacaoHaste: [0, 0, 0],
      });
    }

    if (alvo.editavelA) {
      this.adicionarAlcaDimensional({
        alca: 'dim_A',
        material: this.matDimA,
        valorAtualMm: alvo.Amm,
        inicioHaste: [cxG, cyG, max[2]],
        direcao: [0, 0, 1],
        rotacaoHaste: [Math.PI / 2, 0, 0],
      });
    }

    this.group.visible = true;
  }

  /** Faz raycast apenas nos meshes clicáveis do gizmo quando visível. */
  pick(camera: THREE.Camera, ndc: { x: number; y: number }): HitGizmoComponente | null {
    if (this.destruido || !this.group.visible || this.alvosPick.length === 0) return null;

    this.group.updateMatrixWorld(true);
    camera.updateMatrixWorld();

    this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    const hits = this.raycaster.intersectObjects(this.alvosPick, false);
    const hit = hits[0];
    if (!hit) return null;

    const alca = hit.object.userData.gizmoAlca as AlcaGizmoComponente | undefined;
    if (!alca) return null;

    const valorAtualMm = hit.object.userData.valorAtualMm as number | undefined;
    const posAlca = new THREE.Vector3();
    if (hit.object === this.meshAnel) {
      posAlca.copy(hit.point);
    } else {
      hit.object.getWorldPosition(posAlca);
    }
    posAlca.project(camera);

    return {
      alca,
      pontoMundo: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      valorAtualMm,
      ndc: { x: posAlca.x, y: posAlca.y },
    };
  }

  /** Libera geometrias e materiais próprios do gizmo. */
  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    this.group.clear();
    this.group.visible = false;
    this.alvosPick = [];
    this.meshAnel = null;

    this.geoSeta.dispose();
    this.geoCubo.dispose();
    this.geoHaste.dispose();
    this.geoPegador.dispose();
    this.geoAnel?.dispose();
    this.geoAnel = null;

    this.matSeta.dispose();
    this.matAnel.dispose();
    this.matPegador.dispose();
    this.matDimL.dispose();
    this.matDimP.dispose();
    this.matDimA.dispose();
    this.matHaste.dispose();
  }

  private garantirGeometriaAnel(raio: number): THREE.TorusGeometry {
    if (this.geoAnel && Math.abs(raio - this.ultimoRaio) < 1e-4) {
      return this.geoAnel;
    }
    this.geoAnel?.dispose();
    this.geoAnel = new THREE.TorusGeometry(raio, 0.011, 10, 64);
    this.ultimoRaio = raio;
    return this.geoAnel;
  }

  private adicionarAlcaDimensional(cfg: {
    alca: 'dim_L' | 'dim_P' | 'dim_A';
    material: THREE.MeshBasicMaterial;
    valorAtualMm?: number;
    inicioHaste: [number, number, number];
    direcao: [number, number, number];
    rotacaoHaste: [number, number, number];
  }): void {
    const [sx, sy, sz] = cfg.inicioHaste;
    const [dx, dy, dz] = cfg.direcao;

    const haste = new THREE.Mesh(this.geoHaste, this.matHaste);
    haste.scale.set(1, HASTE_COMP, 1);
    haste.rotation.set(cfg.rotacaoHaste[0], cfg.rotacaoHaste[1], cfg.rotacaoHaste[2]);
    haste.position.set(sx + dx * (HASTE_COMP / 2), sy + dy * (HASTE_COMP / 2), sz + dz * (HASTE_COMP / 2));
    haste.renderOrder = RENDER_ORDER_GIZMO;
    haste.userData = { semPick: true };
    this.group.add(haste);

    const distCubo = HASTE_COMP + TAM_CUBO / 2;
    const cubo = new THREE.Mesh(this.geoCubo, cfg.material);
    cubo.position.set(sx + dx * distCubo, sy + dy * distCubo, sz + dz * distCubo);
    cubo.renderOrder = RENDER_ORDER_GIZMO + 1;
    cubo.userData = {
      semPick: true,
      gizmoAlca: cfg.alca,
      valorAtualMm: cfg.valorAtualMm,
    };
    this.group.add(cubo);
    this.alvosPick.push(cubo);
  }
}
