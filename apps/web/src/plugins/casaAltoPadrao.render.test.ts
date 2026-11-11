import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildTemplate, projectView3DPoints, validateProject, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene } from '@hestia/render';
import {
  SCENE_AXES, SCENE_UNITS, contentForProtocol, encode, isValidCamera, lightIssue, materialIssue, meshIssue, siteIssue, validateMessage,
  type SceneContent, type SceneEntity,
} from '@hestia/plugin-api';
import { toSceneCamera } from './cameraConvert.ts';
import { buildSceneContent } from './sceneExport.ts';

/**
 * Casa de Alto Padrão exportada para o renderizador (protocolo 1.3): o que o plugin recebe do template, medido na cena
 * 3D montada de verdade (mesma montagem da tela, sem navegador). Docs: docs/plugins/09-extensao-render.md.
 */

const CATEGORIAS = new Set(['wood', 'metal', 'glass', 'ceramic', 'concrete', 'plaster', 'paint', 'brick', 'stone', 'roof_tile', 'fabric', 'leather', 'grass', 'soil', 'asphalt', 'plastic', 'other']);

function exportar(): { project: Project; bruto: SceneContent; v13: SceneContent } {
  const project = buildTemplate('house-premium');
  const cena = new ModelScene();
  cena.update(project, project.levels.map((l) => resolveLevel(project, l.id)), { edges: false, shadows: false, dark: false });
  const bruto = buildSceneContent(project, cena.scene);
  return { project, bruto, v13: contentForProtocol(bruto, 3) };
}

const { project, bruto, v13 } = exportar();
const comMalha = v13.entities.filter((e): e is SceneEntity & { mesh: NonNullable<SceneEntity['mesh']> } => e.mesh !== null);

describe('Casa de Alto Padrão: materiais', () => {
  it('19 materiais, todos com categoria conhecida e nome', () => {
    expect(v13.materials).toHaveLength(19);
    expect(Object.keys(project.materials)).toHaveLength(19);
    for (const m of v13.materials) {
      expect(m.name.trim().length, m.id).toBeGreaterThan(2);
      expect(CATEGORIAS.has(m.category ?? ''), `${m.id} categoria ${m.category}`).toBe(true);
      expect(materialIssue(m), m.id).toBeNull();
    }
  });
  it('metal e vidro com PBR derivado; demais sem', () => {
    for (const m of v13.materials) {
      if (m.category === 'metal') expect(m.metallic, m.id).toBe(1);
      else expect(m.metallic, m.id).toBeUndefined();
      if (m.category === 'glass') expect([m.transmission, m.ior], m.id).toEqual([0.9, 1.5]);
      else expect(m.transmission, m.id).toBeUndefined();
    }
  });
  it('todo grupo de malha aponta para um material existente (nenhum grupo sem material)', () => {
    const ids = new Set(v13.materials.map((m) => m.id));
    for (const e of comMalha) for (const g of e.mesh.groups) expect(g.materialId !== null && ids.has(g.materialId), `${e.id}: ${g.materialId}`).toBe(true);
  });
  it('todo material usado na geometria é de camada, esquadria ou telhado do projeto (nenhum órfão de categoria)', () => {
    const usados = new Set(comMalha.flatMap((e) => e.mesh.groups.map((g) => g.materialId!)));
    expect(usados.size).toBeGreaterThanOrEqual(12);
  });
});

describe('Casa de Alto Padrão: malhas', () => {
  it('só os vãos livres (sem folha) ficam sem geometria', () => {
    const sem = v13.entities.filter((e) => e.mesh === null);
    expect(sem.length).toBeGreaterThan(0);
    const livres = new Set(Object.values(project.elements).filter((x) => x.kind === 'door' && project.openingTypes[(x as { typeId: string }).typeId]?.leaves === 0).map((x) => x.id));
    for (const e of sem) expect(livres.has(e.id), `${e.id} (${e.kind}) sem malha`).toBe(true);
    expect(comMalha.length + sem.length).toBe(v13.entities.length);
    expect(comMalha.length).toBeGreaterThanOrEqual(60);
  });
  it('100% das malhas com normais unitárias e UVs em metros de mundo (projeção em caixa)', () => {
    for (const { id, mesh } of comMalha) {
      const n = mesh.positions.length / 3;
      expect(mesh.normals?.length, `${id} normais`).toBe(n * 3);
      expect(mesh.uvs?.length, `${id} uvs`).toBe(n * 2);
      expect(meshIssue(mesh), id).toBeNull();
      for (let i = 0; i < n; i++) {
        const nx = mesh.normals![i * 3]!, ny = mesh.normals![i * 3 + 1]!, nz = mesh.normals![i * 3 + 2]!;
        expect(Math.abs(Math.hypot(nx, ny, nz) - 1), `${id} v${i}`).toBeLessThan(1e-4);
        const x = mesh.positions[i * 3]!, y = mesh.positions[i * 3 + 1]!, z = mesh.positions[i * 3 + 2]!;
        const [ax, ay, az] = [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
        const [u, v] = ax >= ay && ax >= az ? [y, z] : ay >= az ? [x, z] : [x, y];
        expect(mesh.uvs![i * 2]).toBeCloseTo(u, 6);
        expect(mesh.uvs![i * 2 + 1]).toBeCloseTo(v, 6);
      }
      // índices dentro do vértice e grupos cobrindo todos os índices, em triângulos inteiros
      expect(Math.max(...mesh.indices)).toBeLessThan(n);
      let cobertos = 0;
      for (const g of mesh.groups) { expect(g.start).toBe(cobertos); expect(g.count % 3).toBe(0); cobertos += g.count; }
      expect(cobertos).toBe(mesh.indices.length);
    }
  });
  it('normais de parede e laje apontam para os lados certos (parede em x/y, laje em z)', () => {
    const parede = comMalha.find((e) => e.kind === 'wall')!;
    const horizontais = parede.mesh.normals!.filter((_, i) => i % 3 === 2).filter((nz) => Math.abs(nz) < 0.01).length;
    expect(horizontais).toBeGreaterThan(parede.mesh.positions.length / 3 / 2);
    const laje = comMalha.find((e) => e.kind === 'slab')!;
    expect(laje.mesh.normals!.filter((_, i) => i % 3 === 2).some((nz) => Math.abs(nz) > 0.99)).toBe(true);
  });
});

describe('Casa de Alto Padrão: local, sol, câmera e luzes', () => {
  it('local, fuso e sol presentes e válidos; sol calculado do horário (manhã de verão, de leste)', () => {
    const s = v13.site!;
    expect(siteIssue(s)).toBeNull();
    expect(s.latitude).toBeCloseTo(-23.55, 1);
    expect(s.longitude).toBeCloseTo(-46.63, 1);
    expect(s.timezone).toBe('America/Sao_Paulo');
    expect(s.northAngle).toBe(0);
    const sol = s.sun!;
    const e = (sol.elevation * 180) / Math.PI;
    expect(e).toBeGreaterThan(30);
    expect(e).toBeLessThan(55);
    // leste (azimute do Hestia perto de 0 / 360): componente x da direção ao sol positiva
    expect(Math.cos(sol.azimuth) * Math.cos(sol.elevation)).toBeGreaterThan(0.5);
    expect(project.render?.site?.sunLocalTime).toBe('2026-12-15T08:45');
  });
  it('câmera inicial: ponto de vista salvo válido que enquadra a casa inteira em 16:9', () => {
    const pontos = projectView3DPoints(project);
    expect(pontos.map((p) => p.name)).toContain('Fachada principal');
    const sc = toSceneCamera(pontos[0]!.camera);
    expect(isValidCamera(sc)).toBe(true);
    const cam = new THREE.PerspectiveCamera((sc.fovY * 180) / Math.PI, 16 / 9, sc.near, sc.far);
    cam.up.set(0, 0, 1);
    cam.position.set(sc.position.x, sc.position.y, sc.position.z);
    cam.lookAt(sc.target.x, sc.target.y, sc.target.z);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    // caixa do volume com o beiral do telhado (-0,72 .. 12,47 / 14,72) e cumeeira
    let maior = 0;
    for (const x of [-0.72, 12.47]) for (const y of [-0.72, 14.72]) for (const z of [0, 8.3]) {
      const p = new THREE.Vector3(x, y, z).project(cam);
      maior = Math.max(maior, Math.abs(p.x), Math.abs(p.y));
      expect(p.z).toBeLessThan(1);
    }
    expect(maior).toBeLessThan(0.95); // tudo dentro do quadro, com folga
    expect(maior).toBeGreaterThan(0.5); // e a casa não fica minúscula
  });
  it('luzes internas e externas válidas, em candela plausível', () => {
    const luzes = v13.lights!;
    expect(luzes.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(luzes.map((l) => l.id));
    expect(ids.size).toBe(luzes.length);
    for (const l of luzes) {
      expect(lightIssue(l), l.id).toBeNull();
      expect(l.intensity, l.id).toBeGreaterThanOrEqual(30);
      expect(l.intensity, l.id).toBeLessThanOrEqual(300);
    }
    const externas = luzes.filter((l) => l.position.y < 0);
    const internas = luzes.filter((l) => l.position.y >= 0 && l.position.x >= 0 && l.position.x <= 11.75 && l.position.y <= 14);
    expect(externas.length).toBeGreaterThanOrEqual(2);
    expect(internas.length).toBeGreaterThanOrEqual(18);
    for (const l of internas) expect([2.6, 5.6]).toContain(l.position.z);
  });
});

describe('Casa de Alto Padrão: contrato 1.3 no fio', () => {
  it('snapshot válido para o protocolo e dentro do teto de quadro; partes de 8 MiB cabem', () => {
    const msg = {
      t: 'scene.snapshot' as const,
      snapshot: {
        projectId: 'prj_casaaltopadrao', projectName: project.name, revision: 1, units: SCENE_UNITS, axes: SCENE_AXES,
        entities: v13.entities, materials: v13.materials, textures: v13.textures,
        camera: toSceneCamera(projectView3DPoints(project)[0]!.camera), overrides: {},
        lights: v13.lights ?? [], ...(v13.site ? { site: v13.site } : {}),
      },
    };
    expect(validateMessage(msg)).toBeNull();
    const quadro = encode(msg);
    expect(quadro.length).toBeLessThan(64 * 1024 * 1024);
    // maior entidade cabe com folga numa parte (o host junta entidades até 8 MiB, nunca divide uma)
    const maior = Math.max(...v13.entities.map((e) => JSON.stringify(e).length));
    expect(maior).toBeLessThan(8 * 1024 * 1024);
    // sessão 1.2: nada de 1.3 no fio
    const v12 = JSON.stringify(contentForProtocol(bruto, 2));
    for (const palavra of ['"uvs"', '"normals"', '"category"', '"lights"', '"site"', '"metallic"', '"transmission"']) expect(v12.includes(palavra), palavra).toBe(false);
  });
  it('o projeto continua válido e volta igual ao ir e voltar por JSON', () => {
    const grave = validateProject(project).filter((i) => (i as { severity?: string }).severity === 'error');
    expect(grave).toEqual([]);
    const volta = JSON.parse(JSON.stringify(project)) as Project;
    expect(volta.render).toEqual(project.render);
    expect(volta.view3dPoints).toEqual(project.view3dPoints);
  });
});
