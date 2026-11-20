import * as THREE from 'three';
import type { AlcaGizmoComponente, AlvoComponente3D, HitGizmoComponente, ModoGizmoComponente } from './gizmoComponenteTipos.ts';

const COR_MOVER_XY = 0x0ea5e9;
const COR_MOVER_X = 0x10b981;
const COR_MOVER_Y = 0x22c55e;
const COR_ANEL_GIRAR = 0xf59e0b;
const COR_DIM_L = 0xef4444;
const COR_DIM_P = 0x06b6d4;
const COR_DIM_A = 0x3b82f6;
const COR_HASTE = 0xe2e8f0;
const COR_HOVER = 0xfef08a;

/** Pequena elevação sobre z = 0 para evitar z-fighting com o piso do pavimento. */
const OFFSET_CHAO = 0.008;
const RECUO_SETA_FRENTE = 0.11;
const HASTE_COMP = 0.11;
const CONE_ALT = 0.075;
const CONE_RAIO = 0.03;
const RAIO_PEGADOR = 0.044;
const RAIO_ANEL_MIN = 0.38;
const FOLGA_ANEL = 0.14;
const ANGULO_PEGADOR = -Math.PI / 4;
const RENDER_ORDER_GIZMO = 25;

function criarGeometriaSetaChao(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.105);
  s.lineTo(-0.085, 0.025);
  s.lineTo(-0.032, 0.025);
  s.lineTo(-0.032, 0.095);
  s.lineTo(0.032, 0.095);
  s.lineTo(0.032, 0.025);
  s.lineTo(0.085, 0.025);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function materialGizmo(cor: number, opacidade = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: cor,
    transparent: opacidade < 1,
    opacity: opacidade,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function quaternionDeYPara(dx: number, dy: number, dz: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
}

/**
 * Gizmo 3D do componente selecionado na vista 3D do projeto:
 * - Alças de movimento: centro `mover_xy` (arrasto no piso com snaps), lateral `mover_x` e frente `mover_y`.
 * - Anel laranja `girar` com pegador amplo e hitbox invisível.
 * - Setas cônicas dimensionais (`dim_L`, `dim_P`, `dim_A`) sempre visíveis (`depthTest: false`) e com hitbox ampla.
 * - Dois modos: `mover` (padrão) mostra só mover + anel; `redimensionar` mostra só as setas de tamanho. O que está fora do modo
 *   não é criado, então não aparece nem pode ser pego.
 */
export class GizmoComponente3D {
  readonly group = new THREE.Group();

  private readonly raycaster = new THREE.Raycaster();
  private readonly geoSetaChao = criarGeometriaSetaChao();
  private readonly geoHaste = new THREE.CylinderGeometry(0.008, 0.008, 1, 10);
  private readonly geoCone = new THREE.ConeGeometry(CONE_RAIO, CONE_ALT, 14);
  private readonly geoHitAlca = new THREE.CylinderGeometry(0.085, 0.085, 1, 10);
  private readonly geoHitCentro = new THREE.SphereGeometry(0.11, 14, 10);
  private readonly geoPadCentro = new THREE.CylinderGeometry(0.055, 0.055, 0.014, 20);
  private readonly geoAnelCentro = new THREE.RingGeometry(0.068, 0.088, 24);
  private readonly geoPegador = new THREE.SphereGeometry(RAIO_PEGADOR, 16, 12);
  private readonly geoHitPegador = new THREE.SphereGeometry(0.095, 12, 10);
  private geoAnel: THREE.TorusGeometry | null = null;
  private geoHitAnel: THREE.TorusGeometry | null = null;
  private ultimoRaio = -1;

  private readonly matHit = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  private readonly mats: Record<AlcaGizmoComponente, THREE.MeshBasicMaterial> = {
    mover_xy: materialGizmo(COR_MOVER_XY, 0.92),
    mover_x: materialGizmo(COR_MOVER_X, 0.92),
    mover_y: materialGizmo(COR_MOVER_Y, 0.92),
    girar: materialGizmo(COR_ANEL_GIRAR, 0.8),
    dim_L: materialGizmo(COR_DIM_L),
    dim_P: materialGizmo(COR_DIM_P),
    dim_A: materialGizmo(COR_DIM_A),
  };
  private readonly coresOriginais: Record<AlcaGizmoComponente, number> = {
    mover_xy: COR_MOVER_XY,
    mover_x: COR_MOVER_X,
    mover_y: COR_MOVER_Y,
    girar: COR_ANEL_GIRAR,
    dim_L: COR_DIM_L,
    dim_P: COR_DIM_P,
    dim_A: COR_DIM_A,
  };
  private readonly matHaste = materialGizmo(COR_HASTE, 0.9);

  private meshAnel: THREE.Mesh | null = null;
  private alvosPick: THREE.Mesh[] = [];
  private hoverAlca: AlcaGizmoComponente | null = null;
  private destruido = false;

  constructor() {
    this.group.visible = false;
    this.group.userData = { gizmoComponente: true, semPick: true };
  }

  /** Destaca visualmente a alça sob o cursor (ou limpa com `null`). Devolve true se mudou. */
  definirHover(alca: AlcaGizmoComponente | null): boolean {
    if (this.hoverAlca === alca) return false;
    if (this.hoverAlca) this.mats[this.hoverAlca].color.setHex(this.coresOriginais[this.hoverAlca]);
    this.hoverAlca = alca;
    if (alca) this.mats[alca].color.setHex(COR_HOVER);
    return true;
  }

  /** Reposiciona e remonta os elementos do gizmo para o componente alvo, ou oculta se `null`. */
  atualizar(alvo: AlvoComponente3D | null, cameraPos?: { x: number; y: number; z: number }, modo: ModoGizmoComponente = 'mover'): void {
    if (this.destruido) return;
    this.group.clear();
    this.alvosPick = [];
    this.meshAnel = null;

    if (!alvo) {
      this.definirHover(null);
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

    let esc = 1;
    if (cameraPos) {
      const dist = Math.hypot(cameraPos.x - alvo.x, cameraPos.y - alvo.y, cameraPos.z - (alvo.z + czG));
      esc = Math.min(2.1, Math.max(0.85, dist * 0.16));
    }

    if (modo === 'mover') {
      // 1. Seta de frente no chão (alça `mover_y`: move para frente/trás ao longo da orientação)
      const seta = new THREE.Mesh(this.geoSetaChao, this.mats.mover_y);
      seta.position.set(cxG, min[1] - RECUO_SETA_FRENTE * esc, OFFSET_CHAO);
      seta.scale.set(esc, esc, 1);
      seta.renderOrder = RENDER_ORDER_GIZMO;
      seta.userData = { semPick: true, gizmoAlca: 'mover_y' satisfies AlcaGizmoComponente };
      this.group.add(seta);
      this.alvosPick.push(seta);

      // 2. Pad central de movimento livre XY (`mover_xy`: arrasta no piso com encaixe de parede/vizinhos)
      const pad = new THREE.Mesh(this.geoPadCentro, this.mats.mover_xy);
      pad.rotation.set(Math.PI / 2, 0, 0);
      pad.position.set(cxG, cyG, OFFSET_CHAO + 0.01);
      pad.scale.set(esc, 1, esc);
      pad.renderOrder = RENDER_ORDER_GIZMO + 1;
      pad.userData = { semPick: true };
      this.group.add(pad);

      const anelPad = new THREE.Mesh(this.geoAnelCentro, this.mats.mover_xy);
      anelPad.position.set(cxG, cyG, OFFSET_CHAO + 0.012);
      anelPad.scale.set(esc, esc, 1);
      anelPad.renderOrder = RENDER_ORDER_GIZMO + 1;
      anelPad.userData = { semPick: true };
      this.group.add(anelPad);

      const hitCentro = new THREE.Mesh(this.geoHitCentro, this.matHit);
      hitCentro.position.set(cxG, cyG, OFFSET_CHAO + 0.02);
      hitCentro.scale.setScalar(esc);
      hitCentro.renderOrder = RENDER_ORDER_GIZMO + 2;
      hitCentro.userData = { semPick: true, gizmoAlca: 'mover_xy' satisfies AlcaGizmoComponente };
      this.group.add(hitCentro);
      this.alvosPick.push(hitCentro);

      // 3. Anel de rotação no chão + pegador grande + hitbox larga
      const raio = Math.max(RAIO_ANEL_MIN, Math.hypot(dx / 2, dy / 2) + FOLGA_ANEL * esc);
      const { geoAnel, geoHitAnel } = this.garantirGeometriasAnel(raio);
      const anel = new THREE.Mesh(geoAnel, this.mats.girar);
      anel.position.set(cxG, cyG, OFFSET_CHAO);
      anel.renderOrder = RENDER_ORDER_GIZMO;
      anel.userData = { semPick: true };
      this.group.add(anel);
      this.meshAnel = anel;

      const hitAnel = new THREE.Mesh(geoHitAnel, this.matHit);
      hitAnel.position.set(cxG, cyG, OFFSET_CHAO);
      hitAnel.renderOrder = RENDER_ORDER_GIZMO;
      hitAnel.userData = { semPick: true, gizmoAlca: 'girar' satisfies AlcaGizmoComponente };
      this.group.add(hitAnel);
      this.alvosPick.push(hitAnel);

      const px = cxG + raio * Math.cos(ANGULO_PEGADOR);
      const py = cyG + raio * Math.sin(ANGULO_PEGADOR);
      const pegador = new THREE.Mesh(this.geoPegador, this.mats.girar);
      pegador.position.set(px, py, OFFSET_CHAO + 0.01);
      pegador.scale.setScalar(esc);
      pegador.renderOrder = RENDER_ORDER_GIZMO + 2;
      pegador.userData = { semPick: true };
      this.group.add(pegador);

      const hitPegador = new THREE.Mesh(this.geoHitPegador, this.matHit);
      hitPegador.position.set(px, py, OFFSET_CHAO + 0.01);
      hitPegador.scale.setScalar(esc);
      hitPegador.renderOrder = RENDER_ORDER_GIZMO + 2;
      hitPegador.userData = { semPick: true, gizmoAlca: 'girar' satisfies AlcaGizmoComponente };
      this.group.add(hitPegador);
      this.alvosPick.push(hitPegador);

      // 4. Alça de deslize lateral (`mover_x` no lado esquerdo oposto a `dim_L`)
      const dirMovX = espelhaX ? 1 : -1;
      const xFaceMov = espelhaX ? -min[0] : min[0];
      this.adicionarSeta({
        alca: 'mover_x',
        material: this.mats.mover_x,
        inicio: [xFaceMov, cyG, czG],
        direcao: [dirMovX, 0, 0],
        escala: esc,
      });
    }

    // 5. Alças dimensionais (L, P, A) com setas cônicas e hitboxes amplas (só no modo redimensionar)
    if (modo === 'redimensionar') {
      if (alvo.editavelL) {
        const dirX = espelhaX ? -1 : 1;
        const xFace = espelhaX ? -max[0] : max[0];
        this.adicionarSeta({
          alca: 'dim_L',
          material: this.mats.dim_L,
          valorAtualMm: alvo.Lmm,
          inicio: [xFace, cyG, czG],
          direcao: [dirX, 0, 0],
          escala: esc,
        });
      }

      if (alvo.editavelP) {
        this.adicionarSeta({
          alca: 'dim_P',
          material: this.mats.dim_P,
          valorAtualMm: alvo.Pmm,
          inicio: [cxG, min[1], czG],
          direcao: [0, -1, 0],
          escala: esc,
        });
      }

      if (alvo.editavelA) {
        this.adicionarSeta({
          alca: 'dim_A',
          material: this.mats.dim_A,
          valorAtualMm: alvo.Amm,
          inicio: [cxG, cyG, max[2]],
          direcao: [0, 0, 1],
          escala: esc,
        });
      }
    }

    this.group.visible = true;
  }

  /** Faz raycast apenas nos alvos de picking do gizmo quando visível. */
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

  destruir(): void {
    if (this.destruido) return;
    this.destruido = true;
    this.group.clear();
    this.group.visible = false;
    this.alvosPick = [];
    this.meshAnel = null;

    this.geoSetaChao.dispose();
    this.geoHaste.dispose();
    this.geoCone.dispose();
    this.geoHitAlca.dispose();
    this.geoHitCentro.dispose();
    this.geoPadCentro.dispose();
    this.geoAnelCentro.dispose();
    this.geoPegador.dispose();
    this.geoHitPegador.dispose();
    this.geoAnel?.dispose();
    this.geoHitAnel?.dispose();
    this.geoAnel = null;
    this.geoHitAnel = null;

    this.matHit.dispose();
    this.matHaste.dispose();
    for (const mat of Object.values(this.mats)) mat.dispose();
  }

  private garantirGeometriasAnel(raio: number): { geoAnel: THREE.TorusGeometry; geoHitAnel: THREE.TorusGeometry } {
    if (this.geoAnel && this.geoHitAnel && Math.abs(raio - this.ultimoRaio) < 1e-4) {
      return { geoAnel: this.geoAnel, geoHitAnel: this.geoHitAnel };
    }
    this.geoAnel?.dispose();
    this.geoHitAnel?.dispose();
    this.geoAnel = new THREE.TorusGeometry(raio, 0.016, 10, 64);
    this.geoHitAnel = new THREE.TorusGeometry(raio, 0.065, 8, 48);
    this.ultimoRaio = raio;
    return { geoAnel: this.geoAnel, geoHitAnel: this.geoHitAnel };
  }

  private adicionarSeta(cfg: {
    alca: AlcaGizmoComponente;
    material: THREE.MeshBasicMaterial;
    valorAtualMm?: number;
    inicio: [number, number, number];
    direcao: [number, number, number];
    escala: number;
  }): void {
    const [sx, sy, sz] = cfg.inicio;
    const [dx, dy, dz] = cfg.direcao;
    const s = cfg.escala;
    const compHaste = HASTE_COMP * s;
    const compCone = CONE_ALT * s;
    const quat = quaternionDeYPara(dx, dy, dz);

    const haste = new THREE.Mesh(this.geoHaste, this.matHaste);
    haste.scale.set(s, compHaste, s);
    haste.quaternion.copy(quat);
    haste.position.set(sx + dx * (compHaste / 2), sy + dy * (compHaste / 2), sz + dz * (compHaste / 2));
    haste.renderOrder = RENDER_ORDER_GIZMO + 1;
    haste.userData = { semPick: true };
    this.group.add(haste);

    const cone = new THREE.Mesh(this.geoCone, cfg.material);
    cone.scale.setScalar(s);
    cone.quaternion.copy(quat);
    cone.position.set(sx + dx * (compHaste + compCone / 2), sy + dy * (compHaste + compCone / 2), sz + dz * (compCone / 2 + compHaste));
    cone.renderOrder = RENDER_ORDER_GIZMO + 2;
    cone.userData = { semPick: true };
    this.group.add(cone);

    const compTotal = compHaste + compCone + 0.03 * s;
    const hit = new THREE.Mesh(this.geoHitAlca, this.matHit);
    hit.scale.set(s, compTotal, s);
    hit.quaternion.copy(quat);
    hit.position.set(sx + dx * (compTotal / 2), sy + dy * (compTotal / 2), sz + dz * (compTotal / 2));
    hit.renderOrder = RENDER_ORDER_GIZMO + 3;
    hit.userData = { semPick: true, gizmoAlca: cfg.alca, valorAtualMm: cfg.valorAtualMm };
    this.group.add(hit);
    this.alvosPick.push(hit);
  }
}
