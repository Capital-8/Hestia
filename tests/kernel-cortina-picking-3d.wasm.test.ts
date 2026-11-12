/**
 * Picking da parede cortina no 3D depois de (1) pôr uma porta numa célula, (2) encostar outra cortina em canto de 90 graus e (3) trocar o tipo da
 * esquadria várias vezes, refazendo a cena com a MESMA instância de `ModelScene` (o relato do dono). Raios reais (`pickElement`, o caminho do BVH)
 * no centro de um painel, num montante, na porta e na outra cortina, a cada troca; contagem de objetos da cena para achar acúmulo; e a conferência de
 * que nenhuma esquadria antiga sobra na camada de picking. Roda só em `npm run test:wasm` (precisa do kernel Rust).
 *
 * Causa que este teste pegou: a caixa de picking da cortina gravava as faixas em triângulos (e não em índices), então o raio lia as faces da frente
 * como se fossem da cortina seguinte (e a parede inteira sumia do clique); e a caixa cobria o vão da porta, no mesmo plano da folha.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, makeWall, type Project } from '@hestia/model';
import { definirGerenciadorDaCortina, idDoProjetoDoPick, idEsquadriaCortina, mesmoSubelemento, resolveLevel, subelementoDaCortinaEm, type ResolvedLevel } from '../packages/engine/src/index.ts';
import { projetoComCortina } from '../packages/engine/src/fixtureCortina.ts';
import { ModelScene, pickElement } from '../packages/render/src/index.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
  definirGerenciadorDaCortina(() => ger);
});

afterAll(() => definirGerenciadorDaCortina(() => null));

const OPCOES = { edges: false, shadows: false, dark: false };
const niveis = (p: Project): ResolvedLevel[] => p.levels.map((l) => resolveLevel(p, l.id));
const ESQUADRIA = idEsquadriaCortina('ct1', 1, 0);

/** Projeto do relato: cortina `ct1` (x de 0 a 6); porta na célula (1, 0) de `ct1` (preenchida, fundida com a de cima); e, com `comCanto`, a cortina `ct2` encostada em canto de 90 graus (x = 6, y de 0 a 4). */
function cenarioInicial(comCanto = true): ProjectStore {
  const s = new ProjectStore(projetoComCortina());
  s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 1, j: 0, openingTypeId: 'ot_p80', flipHand: false, flipFacing: false, mark: 'P1', fit: 'cell', fundir: true });
  if (comCanto) s.exec({ type: 'addWall', wall: makeWall({ id: 'ct2', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 6, y: 0 }, b: { x: 6, y: 4 }, height: 3 }) });
  return s;
}

/** Trocar o tipo da porta da célula (1, 0), como a ferramenta faz (mesma célula, outro tipo). */
function trocarTipo(s: ProjectStore, openingTypeId: string): void {
  s.exec({ type: 'setCellOpening', wallId: 'ct1', i: 1, j: 0, openingTypeId, flipHand: false, flipFacing: false, mark: 'P1', fit: 'cell', fundir: true });
}

/** Raio real do picking: a câmera olha de `origem` para `alvo` e lê o centro da tela (o caminho do BVH, sem GPU). */
function clicar(ms: ModelScene, origem: readonly [number, number, number], alvo: readonly [number, number, number]) {
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  cam.up.set(0, 0, 1);
  cam.position.set(...origem);
  cam.lookAt(...alvo);
  cam.updateMatrixWorld(true);
  return pickElement(ms.scene, cam, { x: 0, y: 0 });
}

/** Os pontos do relato: painel e montante de ct1 (vistos de -y), a porta (de -y) e a outra cortina (ct2, vista de +x no canto). */
const SONDAS = {
  painel: { origem: [0.75, -5, 0.75], alvo: [0.75, 0, 0.75] },
  montante: { origem: [1.5, -5, 0.75], alvo: [1.5, 0, 0.75] },
  porta: { origem: [2.25, -5, 1.0], alvo: [2.25, 0, 1.0] },
  outra: { origem: [9, 2, 1.5], alvo: [6, 2, 1.5] },
} as const;

type Sonda = keyof typeof SONDAS;

/** O que cada sonda pega: a parede (id do projeto), a esquadria (`esq:`) ou nada (`null`). */
function resultados(ms: ModelScene): Record<Sonda, string | null> {
  const out = {} as Record<Sonda, string | null>;
  for (const k of Object.keys(SONDAS) as Sonda[]) {
    const hit = clicar(ms, SONDAS[k].origem, SONDAS[k].alvo);
    out[k] = hit ? (hit.id.startsWith('cortina-esq|') ? `esq:${idDoProjetoDoPick(hit.id)}` : hit.id) : null;
  }
  return out;
}

/** Contagem de objetos da cena (malhas, linhas, grupos, geometrias) e da camada de picking. */
function contagem(ms: ModelScene) {
  let malhas = 0;
  let instanciadas = 0;
  let linhas = 0;
  let grupos = 0;
  const geos = new Set<string>();
  ms.scene.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) instanciadas++;
    else if ((o as THREE.Mesh).isMesh) malhas++;
    if ((o as THREE.LineSegments).isLineSegments) linhas++;
    if ((o as THREE.Group).isGroup) grupos++;
    const g = (o as THREE.Mesh).geometry;
    if (g) geos.add(g.uuid);
  });
  const camadaPick = (ms as unknown as { pickLayer: THREE.Object3D }).pickLayer;
  return { malhas, instanciadas, linhas, grupos, geometrias: geos.size, camadaPick: camadaPick.children.length };
}

/** Ids de esquadria virtual que têm malha de picking na cena (uma só: a esquadria atual). */
function esquadriasNaCena(ms: ModelScene): Set<string> {
  const out = new Set<string>();
  ms.scene.traverse((o) => {
    const faixas = (o as THREE.Mesh).userData?.ranges as Array<{ id: string }> | undefined;
    for (const f of faixas ?? []) if (f.id.startsWith('cortina-esq|')) out.add(f.id);
  });
  return out;
}

/** Uuids das geometrias da cena (para ver se uma atualização refez alguma malha). */
function geometriasNaCena(ms: ModelScene): Set<string> {
  const out = new Set<string>();
  ms.scene.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (g) out.add(g.uuid);
  });
  return out;
}

describe('parede cortina: picking depois de porta, canto e troca de tipo (kernel real)', () => {
  for (const comCanto of [false, true]) {
    it.skipIf(!bytes)(`${comCanto ? 'com' : 'sem'} canto: painel, montante, porta e outra cortina são pegos certo a cada troca de tipo, com a cena refeita`, () => {
      const s = cenarioInicial(comCanto);
      const ms = new ModelScene();
      const tipos = ['ot_p90', 'ot_pp80', 'ot_pe80', 'ot_p70', 'ot_p80', 'ot_p90'];
      const esperado = { painel: 'ct1', montante: 'ct1', porta: `esq:ct1`, outra: comCanto ? 'ct2' : null };
      // Antes de qualquer troca: a porta acabou de entrar e a cortina foi encostada.
      let p = s.project;
      ms.update(p, niveis(p), OPCOES);
      expect(resultados(ms)).toEqual(esperado);
      for (const tipo of tipos) {
        trocarTipo(s, tipo);
        p = s.project;
        ms.update(p, niveis(p), OPCOES);
        expect(resultados(ms), `depois de trocar para ${tipo}`).toEqual(esperado);
      }
    });
  }

  it.skipIf(!bytes)('trocar o tipo várias vezes e refazer a cena não acumula objetos: o mesmo tipo dá a mesma contagem', () => {
    const s = cenarioInicial(true);
    const ms = new ModelScene();
    const ciclo = ['ot_p80', 'ot_pp80'];
    const contagens: Array<ReturnType<typeof contagem>> = [];
    for (let k = 0; k < 8; k++) {
      trocarTipo(s, ciclo[k % 2]!);
      const p = s.project;
      ms.update(p, niveis(p), OPCOES);
      contagens.push(contagem(ms));
    }
    // Mesmo tipo em posições de mesma paridade: a cena tem exatamente os mesmos objetos (nada se acumula a cada troca).
    expect(contagens[2]).toEqual(contagens[0]);
    expect(contagens[4]).toEqual(contagens[0]);
    expect(contagens[6]).toEqual(contagens[0]);
    expect(contagens[3]).toEqual(contagens[1]);
    expect(contagens[7]).toEqual(contagens[1]);
    // A camada de picking tem uma peça por nível com cortina (não uma por troca).
    for (const c of contagens) expect(c.camadaPick).toBe(1);
  });

  it.skipIf(!bytes)('atualizar a cena sem mudar nada reusa as geometrias (nada é refeito a cada quadro)', () => {
    const s = cenarioInicial(true);
    const ms = new ModelScene();
    const p = s.project;
    ms.update(p, niveis(p), OPCOES);
    const antes = geometriasNaCena(ms);
    ms.update(p, niveis(p), OPCOES);
    expect(geometriasNaCena(ms)).toEqual(antes);
  });

  it.skipIf(!bytes)('nenhuma esquadria antiga sobra no picking: só a esquadria atual tem faixa de picking depois de cada troca', () => {
    const s = cenarioInicial(true);
    const ms = new ModelScene();
    for (const tipo of ['ot_p90', 'ot_pp80', 'ot_pe80', 'ot_p80']) {
      trocarTipo(s, tipo);
      const p = s.project;
      ms.update(p, niveis(p), OPCOES);
      expect([...esquadriasNaCena(ms)]).toEqual([ESQUADRIA]);
    }
  });

  it.skipIf(!bytes)('porta fundida com a célula de cima: o clique na metade de cima devolve a esquadria canônica, a mesma do clique embaixo (Tab e realce)', () => {
    const p = cenarioInicial(false).project;
    const embaixo = subelementoDaCortinaEm(p, 'ct1', { x: 2.25, y: 0, z: 0.5 }, 0.05);
    const emCima = subelementoDaCortinaEm(p, 'ct1', { x: 2.25, y: 0, z: 2.5 }, 0.05);
    expect(embaixo).toMatchObject({ wallId: 'ct1', kind: 'opening', cell: { i: 1, j: 0 } });
    expect(emCima).toEqual(embaixo);
    expect(mesmoSubelemento(emCima, embaixo)).toBe(true);
  });
});
