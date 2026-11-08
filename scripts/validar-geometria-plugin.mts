/**
 * Validação da geometria que o app entrega aos plugins (docs/plugins/08-validacao-geometria-projeto-real.md).
 *
 * Para cada projeto real (.hestia.json): monta a cena 3D como o app (resolveLevel + ModelScene.update), extrai a
 * geometria por elemento com `extractElementMeshes`/`buildSceneContent` (o mesmo código do plugin) e compara com o que a
 * cena DESENHA: triângulos desenhados (inclusive instanciados), elementos sem malha, inventário de malhas e o tamanho e o
 * tempo do snapshot (JSON do protocolo).
 *
 * Uso: npx vite-node scripts/validar-geometria-plugin.mts <projeto.hestia.json>... [--json saida.json]
 * O projeto nunca é copiado nem gravado: só lido.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { migrateProject, view3dOf, type Project } from '@hestia/model';
import { diffScene } from '@hestia/plugin-api';
import { ModelScene } from '@hestia/render';
import { buildSceneContent, extractElementMeshes } from '../apps/web/src/plugins/sceneExport.ts';

const OPT = { edges: true, shadows: true, dark: false } as const;

const visivel = (o: THREE.Object3D): boolean => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

const trianglesOf = (m: THREE.Mesh): number => {
  const g = m.geometry;
  const idx = Math.min(g.drawRange.count, g.index ? g.index.count : g.attributes.position?.count ?? 0);
  return (idx / 3) * (m instanceof THREE.InstancedMesh ? m.count : 1);
};

interface MeshRow { classe: string; kind: string; ranges: number; caixasPick: boolean; semPick: boolean; instanciada: boolean; visivel: boolean; triangulos: number; elementos: number }

function inventario(root: THREE.Object3D): MeshRow[] {
  const rows = new Map<string, MeshRow>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const ranges = (m.userData.ranges as Array<{ id: string }> | undefined) ?? [];
    const key = [m instanceof THREE.InstancedMesh ? 'Instanced' : 'Mesh', m.userData.kind ?? '-', ranges.length > 0, !!m.userData.caixasPick, !!m.userData.semPick, visivel(m)].join('|');
    const r = rows.get(key) ?? { classe: m instanceof THREE.InstancedMesh ? 'InstancedMesh' : 'Mesh', kind: String(m.userData.kind ?? '-'), ranges: 0, caixasPick: !!m.userData.caixasPick, semPick: !!m.userData.semPick, instanciada: m instanceof THREE.InstancedMesh, visivel: visivel(m), triangulos: 0, elementos: 0 };
    r.ranges += ranges.length > 0 ? 1 : 0;
    r.triangulos += trianglesOf(m);
    r.elementos += new Set(ranges.map((x) => x.id)).size;
    rows.set(key, r);
  });
  return [...rows.values()].sort((a, b) => b.triangulos - a.triangulos);
}

/** Triângulos de face que a cena desenha (mesmo critério do teste faixasCena3d): malhas do modelo visíveis, instâncias contadas. */
function triangulosDesenhados(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.kind === undefined || !visivel(m)) return;
    total += trianglesOf(m);
  });
  return Math.round(total);
}


/** Chave exata de um triângulo: os três vértices em float32, ordenados (independe da ordem dos vértices). */
function chaves(pos: ArrayLike<number>, idx: ArrayLike<number> | null, destino: Map<string, number>, porElemento?: { id: string; mapa: Map<string, string> }): void {
  const n = idx ? idx.length : pos.length / 3;
  const f = (x: number): number => Math.fround(x);
  for (let t = 0; t + 2 < n; t += 3) {
    const k = [0, 1, 2].map((q) => { const i = idx ? idx[t + q]! : t + q; return `${f(pos[i * 3]!)},${f(pos[i * 3 + 1]!)},${f(pos[i * 3 + 2]!)}`; }).sort().join('|');
    destino.set(k, (destino.get(k) ?? 0) + 1);
    if (porElemento) porElemento.mapa.set(k, porElemento.id);
  }
}

/** Multiconjuntos: o que a cena tem e o plugin não (faltando) e o que o plugin tem e a cena não (sobrando). */
function comparar(verdade: Map<string, number>, obtido: Map<string, number>, donos: Map<string, string>): { faltando: number; sobrando: number; sobrandoPorElemento: Record<string, number>; faltandoAmostra: string[] } {
  let faltando = 0;
  let sobrando = 0;
  const sobrandoPorElemento: Record<string, number> = {};
  const faltandoAmostra: string[] = [];
  for (const [k, c] of verdade) {
    const d = c - (obtido.get(k) ?? 0);
    if (d > 0) { faltando += d; if (faltandoAmostra.length < 3) faltandoAmostra.push(k); }
  }
  for (const [k, c] of obtido) {
    const d = c - (verdade.get(k) ?? 0);
    if (d > 0) { sobrando += d; const id = donos.get(k) ?? '?'; sobrandoPorElemento[id] = (sobrandoPorElemento[id] ?? 0) + d; }
  }
  return { faltando, sobrando, sobrandoPorElemento, faltandoAmostra };
}

const ms = (a: number, b: number): number => Math.round((b - a) * 10) / 10;
const mib = (n: number): number => Math.round((n / 1048576) * 100) / 100;

function validar(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const p0 = migrateProject(raw);
  const project: Project = { ...p0, view3d: { ...view3dOf(p0), style: 'realistic', shadows: true, edges: true } };
  const porTipo: Record<string, number> = {};
  for (const e of Object.values(project.elements)) porTipo[e.kind] = (porTipo[e.kind] ?? 0) + 1;

  const t0 = performance.now();
  const niveis: ResolvedLevel[] = project.levels.map((l) => resolveLevel(project, l.id));
  const t1 = performance.now();
  const cena = new ModelScene({});
  cena.update(project, niveis, OPT);
  const t2 = performance.now();

  const desenhados = triangulosDesenhados(cena.scene);
  const t3 = performance.now();
  const extraidas = extractElementMeshes(cena.scene);
  const t4 = performance.now();
  const content = buildSceneContent(project, cena.scene);
  const t5 = performance.now();

  let triExtraidos = 0;
  let vertices = 0;
  for (const m of extraidas.values()) { triExtraidos += m.indices.length / 3; vertices += m.positions.length / 3; }

  // Verdade independente: os triângulos que a própria cena exporta para a prancha (`exportarVetores`, mundo, instâncias incluídas).
  const vetores = cena.exportarVetores();
  // Para a comparação exata a extração roda SEM o arredondamento de 1 µm (mesma aritmética da cena ⇒ mesmos bits em float32).
  const exatas = extractElementMeshes(cena.scene, false);
  const verdade = new Map<string, number>();
  chaves(vetores.trianglePositions, null, verdade);
  const obtido = new Map<string, number>();
  const donos = new Map<string, string>();
  for (const [id, m] of exatas) chaves(m.positions, m.indices, obtido, { id, mapa: donos });
  const { faltando, sobrando, sobrandoPorElemento, faltandoAmostra } = comparar(verdade, obtido, donos);
  const divergencias = Object.entries(sobrandoPorElemento).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ id, tipo: project.elements[id]?.kind ?? '?', triangulos: n }));
  const triVerdade = vetores.trianglePositions.length / 9;

  // Elementos do projeto sem malha na cena (por tipo) e malhas sem elemento.
  const semMalha: Record<string, string[]> = {};
  let comMalha = 0;
  for (const e of content.entities) {
    if (e.mesh) comMalha += 1;
    else (semMalha[e.kind] ??= []).push(e.id);
  }
  const semMalhaContagem = Object.fromEntries(Object.entries(semMalha).map(([k, v]) => [k, { total: v.length, exemplos: v.slice(0, 3) }]));
  const idsProjeto = new Set(Object.keys(project.elements));
  const malhasOrfas = [...extraidas.keys()].filter((id) => !idsProjeto.has(id));

  // Snapshot do protocolo: JSON do conteúdo + o restante do envelope.
  const snapshot = { projectId: 'prj_validacao', projectName: project.name, revision: 1, units: { length: 'm', angle: 'rad' }, axes: {}, entities: content.entities, materials: content.materials, textures: content.textures, camera: {}, overrides: {} };
  const t6 = performance.now();
  const json = JSON.stringify({ t: 'scene.snapshot', seq: 1, snapshot });
  const t7 = performance.now();

  // Delta de uma edição: move a primeira parede 1 cm e refaz a cena e o diff.
  const parede = Object.values(project.elements).find((e) => e.kind === 'wall');
  let delta: { ms: number; ops: number; bytes: number } | null = null;
  if (parede && parede.kind === 'wall') {
    const editado: Project = { ...project, elements: { ...project.elements, [parede.id]: { ...parede, b: { x: parede.b.x + 0.01, y: parede.b.y } } } };
    const d0 = performance.now();
    const niv2 = editado.levels.map((l) => resolveLevel(editado, l.id));
    cena.update(editado, niv2, OPT);
    const novo = buildSceneContent(editado, cena.scene);
    const ops = diffScene(content, novo);
    const bytes = JSON.stringify({ t: 'scene.delta', seq: 2, delta: { baseRevision: 1, revision: 2, ops } }).length;
    delta = { ms: ms(d0, performance.now()), ops: ops.length, bytes };
  }

  return {
    projeto: path.split(/[\\/]/).pop(),
    nome: project.name,
    niveis: project.levels.length,
    elementosPorTipo: porTipo,
    elementos: Object.keys(project.elements).length,
    tempos_ms: { resolverNiveis: ms(t0, t1), montarCena3D: ms(t1, t2), contarDesenhados: ms(t2, t3), extrairMalhas: ms(t3, t4), conteudoDoSnapshot: ms(t4, t5), serializarJSON: ms(t6, t7) },
    verificacaoGeometrica: { triangulosDaCena: triVerdade, comparacao: 'exata em float32, multiconjunto de triangulos', faltandoNoPlugin: faltando, sobrandoNoPlugin: sobrando, igual: faltando === 0 && sobrando === 0, elementosDivergentes: Object.keys(sobrandoPorElemento).length, divergencias, faltandoAmostra },
    triangulos: { desenhadosPelaCena: desenhados, extraidos: Math.round(triExtraidos), cobertura: desenhados ? Math.round((triExtraidos / desenhados) * 1000) / 10 : null },
    vertices,
    entidades: { total: content.entities.length, comMalha, semMalha: content.entities.length - comMalha },
    semMalhaPorTipo: semMalhaContagem,
    malhasSemElementoNoProjeto: malhasOrfas.length,
    materiais: content.materials.length,
    snapshot: { bytes: json.length, MiB: mib(json.length), limiteDoQuadroMiB: 64, bytesPorTriangulo: triExtraidos ? Math.round(json.length / triExtraidos) : null },
    deltaDeUmaParede: delta,
    inventarioDeMalhas: inventario(cena.scene),
  };
}

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const saida = jsonIdx >= 0 ? args.splice(jsonIdx, 2)[1] : null;
const resultados = args.map((a) => validar(a));
const texto = JSON.stringify(resultados, null, 2);
if (saida) writeFileSync(saida, texto);
else console.log(texto);
