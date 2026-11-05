import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeWall, ProjectStore, buildTemplate, type Id } from '@hestia/model';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import { ModelScene, type Scene3DOptions } from '@hestia/render';
import { Montagem3dProgressiva, type CenaMontagem, type FonteNiveis } from './montagem3dProgressiva.ts';

/**
 * Nível provisório × cache de malha da cena 3D.
 *
 * Depois do "Colar alinhado" (diálogo → pré-visualizar → Colar), a montagem mantém na tela a resolução **anterior** dos
 * níveis colados enquanto a exata não chega. A chave do nível no cache da cena vem do projeto atual, então a malha
 * montada com a resolução anterior ficava guardada sob a chave nova — e, quando o nível correto chegava, a chave era a
 * mesma e o cache devolvia a malha velha: o pavimento colado aparecia só com portas e janelas até alguma edição mudar a
 * chave de novo. O `provisorios` de `Scene3DOptions` impede esse cache.
 */

const OPT: Scene3DOptions = { edges: false, shadows: false, dark: false };

/** Projeto com três níveis; cada nível recebe uma parede quando `comParedes`. */
function projeto(comParedes: boolean, nomes = ['lv_0', 'lv_1', 'lv_2']): ProjectStore {
  const store = new ProjectStore(buildTemplate('blank'));
  const base = store.project.levels[0]!;
  for (const [i, id] of nomes.entries()) {
    store.exec({ type: 'upsertLevel', level: { ...base, id, name: id, elevation: i * 3 } });
  }
  if (comParedes) {
    for (const id of nomes) {
      store.exec({
        type: 'addWall',
        wall: makeWall({ id: `w_${id}`, typeId: store.project.defaults.wallTypeId, levelId: id, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }),
      });
    }
  }
  return store;
}

/** Assinatura da geometria desenhada: muda quando a cena remonta alguma malha. */
function assinatura(cena: ModelScene): string[] {
  const linhas: string[] = [];
  cena.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments)) return;
    const pos = o.geometry.getAttribute('position');
    linhas.push([o.type, String(o.userData.kind), o instanceof THREE.InstancedMesh ? o.count : 0, pos ? pos.count : 0].join('|'));
  });
  return linhas.sort();
}

describe('cenário: nível provisório no cache de malha', () => {
  it('a malha montada com a resolução anterior não ocupa a chave do nível', () => {
    const antes = projeto(false).project;
    const depois = projeto(true).project;
    const provisorio = resolveLevel(antes, 'lv_1');
    const exato = resolveLevel(depois, 'lv_1');
    expect(Object.keys(provisorio.walls)).toHaveLength(0);
    expect(Object.keys(exato.walls)).toHaveLength(1);

    const cena = new ModelScene();
    // 1º quadro depois da edição: a cena recebe a resolução antiga do nível, marcada como provisória.
    cena.update(depois, [provisorio], { ...OPT, provisorios: new Set<Id>(['lv_1']) });
    const comProvisorio = assinatura(cena);

    // 2º quadro: chegou a resolução exata do MESMO projeto — a malha é refeita, não vem do cache.
    cena.update(depois, [exato], OPT);
    const comExato = assinatura(cena);

    expect(comExato).not.toEqual(comProvisorio);
    expect(comExato.length).toBeGreaterThan(comProvisorio.length);
  });
});

describe('cenário: a montagem avisa a cena quais níveis são provisórios', () => {
  it('os níveis que continuam na malha antiga vão marcados em `provisorios`', () => {
    const antes = projeto(false);
    const depois = projeto(true);
    const chamadas: Array<{ ids: Id[]; provisorios: Id[] }> = [];
    const cena: CenaMontagem = {
      update: (_p, niveis: ResolvedLevel[], opt) => {
        chamadas.push({ ids: niveis.map((n) => n.levelId), provisorios: [...(opt.provisorios ?? [])] });
      },
    };
    const fonte: FonteNiveis = { resolver: (id) => resolveLevel(depois.project, id) };
    const montagem = new Montagem3dProgressiva({
      cena,
      fonte,
      aoAtualizar: () => undefined,
      aoConcluir: () => undefined,
      agendar: (t) => t(),
    });

    montagem.atualizar(antes.project, OPT, 'lv_0');
    chamadas.length = 0;
    // Os três níveis mudaram de conteúdo: a primeira fatia monta um, e os outros dois seguem na malha antiga.
    montagem.atualizar(depois.project, OPT, 'lv_0');

    const primeiraDepoisDaEdicao = chamadas[0]!;
    expect(primeiraDepoisDaEdicao.provisorios.length).toBeGreaterThan(0);
    for (const id of primeiraDepoisDaEdicao.provisorios) expect(primeiraDepoisDaEdicao.ids).toContain(id);
    expect(chamadas.at(-1)!.provisorios).toHaveLength(0);
  });
});
