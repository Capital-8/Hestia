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

interface Tri { cx: number; cy: number; cz: number; area: number; usado: boolean; id?: string }

/** Triângulos (centroide e área) de um vetor de posições, com índice opcional. */
function triangulos(pos: ArrayLike<number>, idx: ArrayLike<number> | null, destino: Tri[], id?: string): void {
  const n = idx ? idx.length : pos.length / 3;
  for (let t = 0; t + 2 < n; t += 3) {
    const v = [0, 1, 2].map((k) => { const i = idx ? idx[t + k]! : t + k; return [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!] as const; });
    const [a, b, c] = v as [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    destino.push({ cx: (a[0] + b[0] + c[0]) / 3, cy: (a[1] + b[1] + c[1]) / 3, cz: (a[2] + b[2] + c[2]) / 3, area, usado: false, ...(id ? { id } : {}) });
  }
}

const CELULA = 0.002; // 2 mm
const TOL_CENTROIDE = 1e-3; // 1 mm
const cel = (n: number): number => Math.floor(n / CELULA);

/**
 * Casa os triângulos do plugin com os da cena por centroide (1 mm) e área (0,1 %). Triângulos coincidentes na cena e no plugin
 * se anulam; sobra o que falta de um lado e o que sobra do outro. Tolerante a float32 e à quantização de 1 µm.
 */
function comparar(verdade: Tri[], obtido: Tri[]): { faltando: number; sobrando: number; sobrandoPorElemento: Record<string, number>; faltandoAmostra: number[][] } {
  const grade = new Map<string, Tri[]>();
  for (const t of verdade) {
    const k = `${cel(t.cx)},${cel(t.cy)},${cel(t.cz)}`;
    const l = grade.get(k);
    if (l) l.push(t); else grade.set(k, [t]);
  }
  let sobrando = 0;
  const sobrandoPorElemento: Record<string, number> = {};
  for (const o of obtido) {
    let achou = false;
    const [ix, iy, iz] = [cel(o.cx), cel(o.cy), cel(o.cz)];
    busca: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const t of grade.get(`${ix + dx},${iy + dy},${iz + dz}`) ?? []) {
        if (t.usado) continue;
        if (Math.abs(t.cx - o.cx) > TOL_CENTROIDE || Math.abs(t.cy - o.cy) > TOL_CENTROIDE || Math.abs(t.cz - o.cz) > TOL_CENTROIDE) continue;
        if (Math.abs(t.area - o.area) > 1e-5 + 1e-3 * t.area) continue;
        t.usado = true;
        achou = true;
        break busca;
      }
    }
    if (!achou) { sobrando += 1; if (o.id) sobrandoPorElemento[o.id] = (sobrandoPorElemento[o.id] ?? 0) + 1; }
  }
  let faltando = 0;
  const faltandoAmostra: number[][] = [];
  for (const t of verdade) if (!t.usado) { faltando += 1; if (faltandoAmostra.length < 5) faltandoAmostra.push([t.cx, t.cy, t.cz].map((n) => Math.round(n * 1000) / 1000)); }
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
  const verdade: Tri[] = [];
  triangulos(vetores.trianglePositions, null, verdade);
  const obtido: Tri[] = [];
  for (const [id, m] of extraidas) triangulos(m.positions, m.indices, obtido, id);
  const { faltando, sobrando, sobrandoPorElemento, faltandoAmostra } = comparar(verdade, obtido);
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
    verificacaoGeometrica: { triangulosDaCena: triVerdade, tolerancia: 'centroide 1 mm, area 0,1 %', faltandoNoPlugin: faltando, sobrandoNoPlugin: sobrando, igual: faltando === 0 && sobrando === 0, elementosDivergentes: Object.keys(sobrandoPorElemento).length, divergencias, faltandoAmostra },
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
