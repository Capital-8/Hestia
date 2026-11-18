import * as THREE from 'three';
import { levelElevation, type Component, type Project } from '@hestia/model';
import { buildComponentSolids, MATERIAIS_DE_COMPONENTE } from './componentSolids.ts';
import { arestasDosLotes, geometriaDoLote } from './lotesMalha3d.ts';

/**
 * Prévia 3D em tempo real de um componente sendo posicionado da biblioteca: compila as malhas locais uma única vez
 * por família/tipo/espelho usando `buildComponentSolids` e só atualiza `position` e `rotation` a cada movimento do mouse.
 * Todas as malhas recebem `userData.semPick = true` e `userData.ghost = true` para o raio 3D atravessar direto para a
 * parede ou o piso sob o cursor.
 */
export class PreviaComponente3D {
  readonly grupo = new THREE.Group();
  private assinatura = '';
  private recursos: Array<THREE.BufferGeometry | THREE.Material> = [];

  constructor() {
    this.grupo.visible = false;
    this.grupo.userData = { ghost: true, semPick: true };
  }

  atualizar(projeto: Project | null, componente: Component | null): void {
    if (!projeto || !componente) {
      this.grupo.visible = false;
      return;
    }
    const chave = `${componente.familyId}|${componente.typeId ?? ''}|${componente.mirrored ? '1' : '0'}`;
    if (chave !== this.assinatura) {
      this.reconstruir(projeto, componente);
      this.assinatura = chave;
    }
    if (this.grupo.children.length === 0) {
      this.grupo.visible = false;
      return;
    }
    this.grupo.visible = true;
    const elevacao = levelElevation(projeto, componente.levelId);
    this.grupo.position.set(componente.x, componente.y, elevacao + componente.z);
    this.grupo.rotation.set(0, 0, componente.rotation);
  }

  private reconstruir(projeto: Project, componente: Component): void {
    this.limpar();
    const nivel = projeto.levels.find((l) => l.id === componente.levelId);
    if (!nivel) return;
    const rascunhoProjeto: Project = {
      ...projeto,
      levels: [{ ...nivel, elevation: 0 }],
      elements: { [componente.id]: { ...componente, x: 0, y: 0, z: 0, rotation: 0 } },
    };
    const lotes = buildComponentSolids(rascunhoProjeto, componente.levelId);
    for (const lote of lotes) {
      const geo = geometriaDoLote(lote);
      const corHex = MATERIAIS_DE_COMPONENTE[lote.materialId]?.color ?? '#d8b98b';
      const mat = new THREE.MeshLambertMaterial({
        color: corHex,
        transparent: true,
        opacity: 0.78,
        depthWrite: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { ghost: true, semPick: true };
      this.grupo.add(mesh);
      this.recursos.push(geo, mat);
    }
    const arestasGeo = arestasDosLotes(lotes, 25);
    if (arestasGeo) {
      const arestasMat = new THREE.LineBasicMaterial({
        color: 0x0078d4,
        transparent: true,
        opacity: 0.9,
      });
      const linhas = new THREE.LineSegments(arestasGeo, arestasMat);
      linhas.userData = { ghost: true, semPick: true };
      this.grupo.add(linhas);
      this.recursos.push(arestasGeo, arestasMat);
    }
  }

  private limpar(): void {
    this.grupo.clear();
    for (const r of this.recursos) r.dispose();
    this.recursos = [];
  }

  destruir(): void {
    this.limpar();
    this.assinatura = '';
  }
}
