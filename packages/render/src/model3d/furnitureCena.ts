import * as THREE from 'three';
import type { FurnitureAsset, Id, Material, Project } from '@hestia/model';
import { hashTexto } from '@hestia/engine';
import { filaDeVersoesLeves } from './furnitureLod.ts';
import { assinaturaDeMoveis, buildFurnitureLevel, type MoveisDoNivel, type OpcoesMoveis, type QualidadeDesenhada } from './furnitureSolids.ts';
import { texturaDoMovel, texturaServeNaLeve } from './furnitureTexturas.ts';
import type { Materiais3D } from './materiais3d.ts';

/**
 * Liga os móveis à cena 3D: materiais (cor e opacidade do `Material` do projeto criado junto com o asset; textura embutida
 * só na versão leve, quando pequena e permitida) e o grupo three do nível. A montagem em si está em `furnitureSolids.ts`.
 */

/** Material do projeto de um material do asset; se o projeto não o tem (asset sem `Material`), um equivalente. */
function materialDoProjeto(p: Project, asset: FurnitureAsset, materialIndex: number): Material | undefined {
  const fm = asset.materials[materialIndex];
  if (!fm) return undefined;
  return (
    p.materials[fm.id] ?? {
      id: fm.id,
      name: fm.name,
      color: fm.color,
      hatch: 'none' as Material['hatch'],
      gloss: fm.roughness !== undefined ? Math.min(1, Math.max(0, 1 - fm.roughness)) : 0.1,
      opacity: fm.opacity,
      cost: 0,
      unit: 'm2',
      category: fm.category,
    }
  );
}

/** Cópia do material com as duas faces visíveis (grupos `doubleSided`: chapas, tecidos, faces do .skp com frente e verso iguais). */
function comDuasFaces(mats: Materiais3D, base: THREE.Material): THREE.Material {
  if (base.side === THREE.DoubleSide) return base;
  return mats.cached(`ds|${base.uuid}`, () => {
    const m = base.clone();
    m.side = THREE.DoubleSide;
    return m;
  });
}

function materialDoMovel(mats: Materiais3D, p: Project, asset: FurnitureAsset, materialIndex: number, q: QualidadeDesenhada, aoCarregar: () => void, doubleSided = false): THREE.Material {
  const um = mats.face(materialDoProjeto(p, asset, materialIndex), 'component');
  // A variante de dois lados sai ANTES da textura: o clone com textura (que o retorno da imagem tinge de branco) e dela.
  const base = doubleSided ? comDuasFaces(mats, um) : um;
  const fm = asset.materials[materialIndex];
  const estilo = mats.marco.view.style;
  if (q !== 'leve' || !fm || fm.textureIndex === undefined || fm.useEmbeddedTexture === false || estilo === 'hiddenLine' || estilo === 'wireframe') return base;
  const tex = asset.textures[fm.textureIndex];
  if (!tex || !texturaServeNaLeve(tex)) return base;
  const chave = `fmtex|${base.uuid}|${tex.sha256}`;
  return mats.cached(chave, () => {
    const m = base.clone() as THREE.MeshStandardMaterial;
    const t = texturaDoMovel(tex, () => {
      // A imagem chegou: a textura já traz a cor (a cor do material era a média dela).
      m.color.set(0xffffff);
      m.needsUpdate = true;
      aoCarregar();
    });
    if (t) m.map = t;
    return m;
  });
}

/** Grupo three dos móveis do nível (instâncias compartilhando geometria), ou null se o nível não tem móveis. */
export function moveisParaCena(mats: Materiais3D, p: Project, levelId: Id, opt: OpcoesMoveis, sombras: boolean, aoCarregarTextura: () => void): MoveisDoNivel | null {
  const wireframe = mats.marco.view.style === 'wireframe';
  return buildFurnitureLevel(
    p,
    levelId,
    {
      material: (asset, mi, q, ds) => materialDoMovel(mats, p, asset, mi, q, aoCarregarTextura, ds === true),
      pick: mats.cached('pick', () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })),
      linha: wireframe ? mats.edge() : undefined,
      wireframe,
      sombras,
    },
    opt,
  );
}

/**
 * Estado dos móveis de uma `ModelScene`: opções (qualidade padrão do projeto, meta da versão leve, modo síncrono), aviso ao
 * app quando uma versão leve ou uma textura chega depois da montagem, e a assinatura que renova a chave do nível.
 */
export class MoveisDaCena {
  /** Opções vivas: mude e chame `ModelScene.update` (a assinatura de qualidade entra na chave do nível). */
  opcoes: OpcoesMoveis;
  /** Chamado depois que a cena se refez sozinha (versão leve pronta, textura carregada): a interface pede um quadro. */
  aoAtualizar: (() => void) | null = null;
  /** A última montagem deixou móveis na caixa, esperando a versão leve. */
  private pendentes = false;
  private cancelar: () => void;

  constructor(recarregar: () => void, opcoes: OpcoesMoveis = {}) {
    this.opcoes = opcoes;
    this.cancelar = filaDeVersoesLeves.aoConcluir(() => {
      if (this.pendentes) recarregar();
    });
  }

  /** Começo de uma atualização da cena. */
  inicio(): void {
    this.pendentes = false;
  }

  /** Acrescenta à chave de cada nível a qualidade pronta dos móveis dele (versão leve gerada = outra chave). */
  chaves(p: Project, chaves: Map<Id, string>, ocultos?: ReadonlySet<Id>): void {
    if (!p.furniture) return;
    for (const [id, k] of chaves) {
      const s = assinaturaDeMoveis(p, id, { ...this.opcoes, ...(ocultos ? { ocultos } : {}) });
      if (s) chaves.set(id, `${k}|mv:${hashTexto(s)}`);
    }
  }

  /** Monta os móveis do nível dentro de `grupo`. */
  montar(grupo: THREE.Object3D, mats: Materiais3D, p: Project, levelId: Id, sombras: boolean, ocultos?: ReadonlySet<Id>): void {
    const m = moveisParaCena(mats, p, levelId, { ...this.opcoes, ...(ocultos ? { ocultos } : {}) }, sombras, () => this.aoAtualizar?.());
    if (!m) return;
    if (m.plano.pendentes.length) this.pendentes = true;
    grupo.add(m.grupo);
  }

  dispose(): void {
    this.cancelar();
    this.aoAtualizar = null;
  }
}
