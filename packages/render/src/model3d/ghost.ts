import * as THREE from 'three';
import {
  frameOfWall,
  junctionLevel,
  openingGeometry,
  resolveCeilings,
  resolveFloors,
  resolveLevel,
  resolveRamps,
  resolveRoofs,
  resolveSlabs,
  resolveStairs,
  stairArrivalTop,
  type ResolvedLevel,
} from '@hestia/engine';
import { isOpening, isWall, wallBaseElevation, type Id, type Project } from '@hestia/model';
import { buildCadLines } from './cad3d.ts';
import { buildGenericSolids } from './genericSolids.ts';
import { geometriaDoLote, juntarLote } from './lotesMalha3d.ts';
import { buildRampSolids } from './rampSolids.ts';
import {
  buildCeilingSolids,
  buildFloorSolids,
  buildLevelSolids,
  buildRoofSolids,
  buildSlabSolids,
  filtrarParedesDoNivel,
  type SolidBatch,
} from './solids.ts';
import { buildStairSolids } from './stairSolids.ts';

/** Violeta do realce de prévia (`--preview` do tema). */
export const COR_DO_FANTASMA = 0xa855f7;
/** Opacidade dos fantasmas: translúcidos, mas ainda legíveis sobre o modelo. */
export const OPACIDADE_DO_FANTASMA = 0.28;
/** Arestas claras: dão a leitura da geometria quando há muita coisa sobreposta. */
export const COR_DAS_ARESTAS = 0xf5f3ff;

/** Opções da camada de fantasmas. */
export interface OpcoesFantasmas {
  /** Cor das faces e das linhas (padrão `COR_DO_FANTASMA`). */
  cor?: THREE.ColorRepresentation;
  /** Opacidade 0..1 (padrão `OPACIDADE_DO_FANTASMA`). */
  opacidade?: number;
  /** Níveis a considerar; sem eles, todos os níveis em que houver elemento novo. */
  niveis?: readonly Id[];
}

const caixaVazia = (): THREE.Box3 => new THREE.Box3();

/**
 * Camada de fantasmas do Colar alinhado: os elementos do rascunho que ainda não existem no projeto real,
 * desenhados em violeta translúcido sobre a cena. As malhas levam `userData.ghost` e `userData.semPick`: ficam
 * fora do picking, do realce e do zoom que não atravessa paredes (o realce usa `userData.ranges`, que a camada
 * não tem, e o raio do 3D ignora tudo o que é `semPick`).
 *
 * O grupo não pertence ao modelo da cena (`ModelScene.model`): fica na cena, ao lado dele. Assim não entra no
 * enquadramento padrão, na exportação da prancha nem no cache de malhas por nível.
 */
export class CamadaFantasmas {
  /** Grupo a acrescentar à cena (`scene.add(camada.grupo)`). */
  readonly grupo = new THREE.Group();
  private readonly material: THREE.MeshBasicMaterial;
  private readonly linhas: THREE.LineBasicMaterial;
  private readonly arestas: THREE.LineBasicMaterial;
  private caixaInterna = caixaVazia();
  private ultimaPrevia: Project | null = null;
  private ultimaBase: Project | null | undefined = undefined;
  private ultimaAssinatura = '';
  private ultimosElementos = 0;

  constructor(opcoes: OpcoesFantasmas = {}) {
    const cor = opcoes.cor ?? COR_DO_FANTASMA;
    const opacidade = opcoes.opacidade ?? OPACIDADE_DO_FANTASMA;
    this.material = new THREE.MeshBasicMaterial({
      color: cor,
      transparent: true,
      opacity: opacidade,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.linhas = new THREE.LineBasicMaterial({
      color: COR_DAS_ARESTAS,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: true,
    });
    this.arestas = new THREE.LineBasicMaterial({
      color: COR_DAS_ARESTAS,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      depthTest: true,
    });
    this.grupo.name = 'fantasmas-do-colar';
    this.grupo.userData = { ghost: true };
    this.grupo.visible = true;
  }

  /** Quantos elementos do rascunho a camada desenhou na última atualização. */
  get quantidade(): number {
    return this.ultimosElementos;
  }

  /** Caixa (mundo) dos fantasmas; vazia quando não há nada novo. */
  get caixa(): THREE.Box3 {
    return this.caixaInterna.clone();
  }

  /**
   * Refaz a camada a partir do rascunho (`previa`) e do projeto real (`base`): só o que não existe em `base`
   * vira fantasma. Repetir a mesma prévia não refaz nada. Devolve a caixa dos fantasmas.
   */
  atualizar(previa: Project, base: Project | null = null, opcoes: OpcoesFantasmas = {}): THREE.Box3 {
    const assinatura = opcoes.niveis ? [...opcoes.niveis].join('\u0001') : '*';
    if (this.ultimaPrevia === previa && this.ultimaBase === base && this.ultimaAssinatura === assinatura) return this.caixa;
    this.limpar();
    this.ultimaPrevia = previa;
    this.ultimaBase = base;
    this.ultimaAssinatura = assinatura;

    const niveisPermitidos = opcoes.niveis ? new Set(opcoes.niveis) : null;
    const novos = new Set<Id>();
    for (const id of Object.keys(previa.elements)) {
      if (base && id in base.elements) continue;
      const e = previa.elements[id];
      if (!e) continue;
      if (niveisPermitidos && !niveisPermitidos.has(nivelDoElemento(previa, e))) continue;
      novos.add(id);
    }
    this.ultimosElementos = novos.size;
    if (!novos.size) return this.caixa;

    const projetoNovo = soComElementos(previa, novos);
    const niveis = new Set<Id>();
    for (const id of novos) {
      const e = previa.elements[id];
      if (e) niveis.add(nivelDoElemento(previa, e));
    }

    let escadas: ReturnType<typeof resolveStairs> | null = null;
    let rampas: ReturnType<typeof resolveRamps> | null = null;
    const resolvidos = new Map<Id, ResolvedLevel>();
    const lotes: SolidBatch[] = [];
    for (const nivelId of niveis) {
      if (!previa.levels.some((l) => l.id === nivelId)) continue;
      const lv = resolveLevel(previa, nivelId);
      resolvidos.set(nivelId, lv);
      const juncao = junctionLevel(previa, nivelId);
      escadas ??= resolveStairs(previa);
      rampas ??= resolveRamps(previa);
      const dasEscadas = escadas.filter((s) => s.levelId === nivelId && novos.has(s.id));
      const dasRampas = rampas.filter((r) => r.levelId === nivelId && novos.has(r.id));
      lotes.push(
        ...buildLevelSolids(filtrarParedesDoNivel(lv, (id) => novos.has(id)), juncao).batches,
        ...buildFloorSolids(resolveFloors(previa, nivelId).filter((f) => novos.has(f.floorId)), juncao),
        ...buildCeilingSolids(resolveCeilings(previa, nivelId).filter((c) => novos.has(c.ceilingId))),
        ...buildSlabSolids(resolveSlabs(previa, nivelId).filter((s) => novos.has(s.slabId)), juncao),
        ...buildRoofSolids(resolveRoofs(previa, nivelId).filter((r) => novos.has(r.roofId))),
        ...buildStairSolids(dasEscadas, (s) => stairArrivalTop(previa, s).top),
        ...buildRampSolids(dasRampas),
        ...buildGenericSolids(projetoNovo, nivelId),
      );
    }

    const filtrados: SolidBatch[] = [];
    for (const b of lotes) {
      const f = filtrarLote(b, novos);
      if (f) filtrados.push(f);
    }
    if (filtrados.length) {
      const fusao = juntarLote(filtrados);
      const malha = new THREE.Mesh(geometriaDoLote(fusao), this.material);
      malha.castShadow = false;
      malha.receiveShadow = false;
      malha.renderOrder = 3;
      malha.userData = { ghost: true, semPick: true };
      this.comArestas(malha);
      this.grupo.add(malha);
    }

    // Esquadrias: um bloco violeta no vão, na cota da parede hospedeira (as paredes fantasmas já têm o furo).
    for (const id of novos) {
      const o = previa.elements[id];
      if (!o || !isOpening(o)) continue;
      const host = previa.elements[o.hostId];
      if (!host || !isWall(host)) continue;
      const f = frameOfWall(previa, host.id);
      if (!f || !previa.openingTypes[o.typeId]) continue;
      const g = openingGeometry(previa, o, f);
      const baseZ = resolvidos.get(host.levelId)?.walls[host.id]?.baseZ ?? wallBaseElevation(previa, host);
      const geo = new THREE.BoxGeometry(g.width, Math.max(0.02, g.thickness), g.height);
      const malha = new THREE.Mesh(geo, this.material);
      malha.position.set(g.center.x, g.center.y, baseZ + g.sill + g.height / 2);
      malha.rotation.z = Math.atan2(g.u.y, g.u.x);
      malha.castShadow = false;
      malha.receiveShadow = false;
      malha.renderOrder = 3;
      malha.userData = { ghost: true, semPick: true };
      this.comArestas(malha);
      this.grupo.add(malha);
    }

    // CAD: as linhas do desenho copiado, com o material de linha violeta.
    for (const nivelId of niveis) {
      const cota = previa.levels.find((l) => l.id === nivelId)?.elevation ?? 0;
      const cad = buildCadLines(projetoNovo, nivelId, cota);
      if (!cad) continue;
      cad.traverse((o) => {
        o.userData = { ...o.userData, ghost: true, semPick: true };
        if (o instanceof THREE.LineSegments) o.material = this.linhas;
      });
      this.grupo.add(cad);
    }

    this.grupo.updateMatrixWorld(true);
    this.caixaInterna = caixaVazia().setFromObject(this.grupo);
    return this.caixa;
  }

  /** Arestas de leitura da malha fantasma (claras, sem profundidade gravada). */
  private comArestas(malha: THREE.Mesh): void {
    const arestas = new THREE.LineSegments(new THREE.EdgesGeometry(malha.geometry, 28), this.arestas);
    arestas.renderOrder = 4;
    arestas.userData = { ghost: true, semPick: true };
    malha.add(arestas);
  }

  /** Tira os fantasmas do grupo e libera as geometrias; o material é reaproveitado. */
  limpar(): void {
    for (const filho of [...this.grupo.children]) {
      this.grupo.remove(filho);
      liberarGeometrias(filho);
    }
    this.caixaInterna = caixaVazia();
    this.ultimosElementos = 0;
    this.ultimaPrevia = null;
    this.ultimaBase = undefined;
    this.ultimaAssinatura = '';
  }

  /** Limpa e libera também os materiais (a camada não é mais usada). */
  dispose(): void {
    this.limpar();
    this.material.dispose();
    this.linhas.dispose();
    this.arestas.dispose();
  }
}

/** Nível do elemento; aberturas não têm `levelId` e seguem a parede hospedeira. */
function nivelDoElemento(p: Project, e: Project['elements'][Id]): Id {
  if (e && isOpening(e)) {
    const host = p.elements[e.hostId];
    return host && isWall(host) ? host.levelId : '';
  }
  return e && 'levelId' in e ? e.levelId : '';
}

/** Projeto com só os elementos dados (os construtores que varrem `elements`, genéricos e CAD, leem daqui). */
function soComElementos(p: Project, ids: ReadonlySet<Id>): Project {
  const elements: Project['elements'] = {};
  for (const [id, e] of Object.entries(p.elements)) if (ids.has(id)) elements[id] = e;
  return { ...p, elements };
}

/**
 * Lote só com os triângulos dos elementos novos: os índices e as faixas são remontados, de modo que o fantasma
 * não carregue o original. Sem triângulo de elemento novo, null.
 */
function filtrarLote(b: SolidBatch, manter: ReadonlySet<Id>): SolidBatch | null {
  const out: SolidBatch = { materialId: b.materialId, category: b.category, positions: [], normals: [], indices: [], ids: [] };
  for (const faixa of b.ids) {
    if (!manter.has(faixa.id)) continue;
    const inicio = out.indices.length;
    for (let i = faixa.start; i < faixa.start + faixa.count; i++) {
      const v = b.indices[i];
      if (v === undefined) continue;
      out.indices.push(out.positions.length / 3);
      out.positions.push(b.positions[v * 3] ?? 0, b.positions[v * 3 + 1] ?? 0, b.positions[v * 3 + 2] ?? 0);
      out.normals.push(b.normals[v * 3] ?? 0, b.normals[v * 3 + 1] ?? 0, b.normals[v * 3 + 2] ?? 1);
    }
    const count = out.indices.length - inicio;
    if (count > 0) out.ids.push({ id: faixa.id, start: inicio, count });
  }
  return out.indices.length ? out : null;
}

/** Libera as geometrias de um objeto e dos filhos (materiais compartilhados não são tocados). */
function liberarGeometrias(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh || c instanceof THREE.LineSegments) c.geometry.dispose();
  });
}
