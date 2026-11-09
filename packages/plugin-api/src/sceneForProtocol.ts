import type { SceneContent } from './hostPorts.ts';
import type { SceneEntity, SceneMesh, SceneSnapshot } from './scene.ts';
import { lightIssue, materialSanitized, meshSanitized, siteSanitized } from './sceneValidate.ts';

/**
 * Adapta o conteúdo da cena à versão de protocolo negociada com o plugin. Regra única, nos dois sentidos:
 *  - 1.0 a 1.2: sai EXATAMENTE o formato de antes. Sem normais, sem luzes, sem `site`, sem campos PBR e com
 *    `groups[].materialId` em null (mesmo que o host saiba o material por triângulo).
 *  - 1.3 ou superior: os campos novos saem, mas só os válidos. Campo inválido é descartado (não derruba a cena).
 *
 * Nunca altera o `content` de entrada: devolve estruturas novas quando precisa mudar algo.
 */

/** Teto de floats de normais por entidade. Acima disso as normais da entidade saem (o quadro tem teto de 64 MiB). */
export const NORMALS_MAX_FLOATS = 2_000_000;

export function contentForProtocol(c: SceneContent, minor: number): SceneContent {
  return minor >= 3 ? sceneV13(c) : sceneUpTo12(c);
}

/** Cena 1.3 para o plugin: só o que é válido. `lights` sempre presente (lista, mesmo vazia). */
function sceneV13(c: SceneContent): SceneContent {
  const lights = (c.lights ?? []).filter((l) => lightIssue(l) === null);
  const site = c.site ? siteSanitized(c.site) : undefined;
  return {
    projectName: c.projectName,
    entities: c.entities.map((e) => (e.mesh ? { ...e, mesh: normalsWithinLimit(e.mesh) } : e)),
    materials: c.materials.map(materialSanitized),
    textures: c.textures,
    lights,
    ...(site ? { site } : {}),
  };
}

/** Normais dentro do teto por entidade; normais inválidas ou grandes demais saem, o resto da malha fica. */
function normalsWithinLimit(m: SceneMesh): SceneMesh {
  const limpa = meshSanitized(m);
  if (limpa.normals && limpa.normals.length > NORMALS_MAX_FLOATS) {
    const { normals: _drop, ...rest } = limpa;
    return rest as SceneMesh;
  }
  return limpa;
}

/** Cena 1.0 a 1.2: sem nada de 1.3. */
function sceneUpTo12(c: SceneContent): SceneContent {
  return {
    projectName: c.projectName,
    entities: c.entities.map(stripEntity),
    materials: c.materials.map((m) => {
      const { metallic: _a, emissive: _b, ior: _c, transmission: _d, ...rest } = m;
      return rest;
    }),
    textures: c.textures,
  };
}

function stripEntity(e: SceneEntity): SceneEntity {
  if (!e.mesh) return e;
  const { normals: _drop, ...rest } = e.mesh;
  return { ...e, mesh: { ...rest, groups: e.mesh.groups.map((g) => ({ ...g, materialId: null })) } as SceneMesh };
}

/** Campos de 1.3 do snapshot (cabeçalho). Vazio para 1.0 a 1.2. */
export function snapshotExtensionFields(c: SceneContent, minor: number): Pick<SceneSnapshot, 'lights' | 'site'> {
  if (minor < 3) return {};
  return { lights: c.lights ?? [], ...(c.site ? { site: c.site } : {}) };
}
