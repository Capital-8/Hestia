/**
 * TESTE-GUARDA do contrato de CAPTURA (docs/contratos/familias-e-ferramentas.md, regra 6): todo `kind` de elemento do
 * modelo fornece pontos de snap na planta (para Cota, Medir, desenho, Alinhar, Deslocar, Aparar... pelo mesmo motor), ou
 * diz por que não.
 *
 * Duas travas:
 * 1. Compilação: `CLASSIFICACAO` é um `Record<Element['kind'], ...>`. Um kind novo em `Element` sem linha aqui não
 *    compila (o `tsc` falha). Foi assim que o guarda-corpo ficou sem snap.
 * 2. Execução: cada marca aponta um símbolo que existe no código que fornece os pontos (`fonte`) e a ligação desse
 *    fornecedor ao motor (`ligacao`, em `base.ts`/`infer.ts`); `null` exige o motivo escrito (exceção explícita, com TODO).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Element } from '@hestia/model';

const aqui = dirname(fileURLToPath(import.meta.url));
/** Raiz dos pacotes (`packages/`): as fontes de pontos de snap moram em `tools` e em `engine`. */
const pacotes = join(aqui, '..', '..');
const ler = (rel: string): string => readFileSync(join(pacotes, rel), 'utf8');

interface Fonte {
  /** Arquivo (relativo a `packages/`) que calcula os pontos do kind. */
  arquivo: string;
  /** Símbolo que tem de existir nele. */
  simbolo: string;
}

interface Marca {
  /** Quem calcula os pontos de captura do kind, ou null com motivo. */
  fonte: Fonte | null;
  /** Símbolo, em `tools/src/base.ts` ou `infer.ts`, que liga a fonte ao motor de captura. Null só junto com `fonte` null. */
  ligacao: { arquivo: 'tools/src/base.ts' | 'tools/src/infer.ts'; simbolo: string } | null;
  /** Obrigatório quando a marca é null. */
  motivo?: string;
}

const CLASSIFICACAO: Record<Element['kind'], Marca> = {
  wall: { fonte: { arquivo: 'tools/src/infer.ts', simbolo: 'wallsOnLevel' }, ligacao: { arquivo: 'tools/src/infer.ts', simbolo: 'wallMid' } },
  door: { fonte: { arquivo: 'tools/src/openingSnapPoints.ts', simbolo: 'openingSnapGeometry' }, ligacao: { arquivo: 'tools/src/base.ts', simbolo: 'openingSnapGeometry' } },
  window: { fonte: { arquivo: 'tools/src/openingSnapPoints.ts', simbolo: 'openingSnapGeometry' }, ligacao: { arquivo: 'tools/src/base.ts', simbolo: 'openingSnapGeometry' } },
  floor: { fonte: { arquivo: 'tools/src/floorPick.ts', simbolo: 'floorVertices' }, ligacao: { arquivo: 'tools/src/base.ts', simbolo: 'floorVertices' } },
  slab: { fonte: { arquivo: 'tools/src/floorPick.ts', simbolo: 'slabsOnLevel' }, ligacao: { arquivo: 'tools/src/base.ts', simbolo: 'floorEdges' } },
  stair: { fonte: { arquivo: 'engine/src/apoioDeSnap.ts', simbolo: 'apoioDaEscada' }, ligacao: { arquivo: 'tools/src/base.ts', simbolo: 'componentSnapIndex' } },
  ramp: { fonte: { arquivo: 'engine/src/apoioDeSnap.ts', simbolo: 'apoioDaRampa' }, ligacao: { arquivo: 'tools/src/base.ts', simbolo: 'componentSnapIndex' } },
  railing: { fonte: { arquivo: 'engine/src/apoioDeSnap.ts', simbolo: 'apoioDoGuarda' }, ligacao: { arquivo: 'tools/src/base.ts', simbolo: 'componentSnapIndex' } },
  cad: { fonte: { arquivo: 'tools/src/snapCad.ts', simbolo: 'addCadSnaps' }, ligacao: { arquivo: 'tools/src/infer.ts', simbolo: 'addCadSnaps' } },
  column: { fonte: null, ligacao: null, motivo: 'estrutura: ficha T1 (os pontos de captura do pilar vêm do kernel, consulta 207).' },
  beam: { fonte: null, ligacao: null, motivo: 'estrutura: ficha T1 (eixo e faces da viga vêm do kernel, consulta 207).' },
  footing: { fonte: null, ligacao: null, motivo: 'estrutura: ficha T1 (os pontos de captura da fundação vêm do kernel, consulta 207).' },
  ceiling: { fonte: null, ligacao: null, motivo: 'TODO: o forro não entra na captura de planta (só pisos e lajes têm vértices e arestas); o contorno do forro ainda não é ponto de snap.' },
  roof: { fonte: null, ligacao: null, motivo: 'TODO: o telhado não entra na captura de planta (beirais e cumeeiras ainda não são pontos de snap).' },
  room: { fonte: null, ligacao: null, motivo: 'TODO: o ambiente não tem geometria própria (o contorno é derivado das paredes, que já fornecem os pontos).' },
  generic: { fonte: null, ligacao: null, motivo: 'TODO: o objeto importado tem malha em coordenadas de mundo; ainda não há pontos de snap derivados dela.' },
};

describe('contrato: todo kind de elemento está classificado na captura (snap) de planta', () => {
  for (const [kind, m] of Object.entries(CLASSIFICACAO)) {
    it(`${kind}: marcas apontam código que existe`, () => {
      if (m.fonte) expect(ler(m.fonte.arquivo), `${kind}: ${m.fonte.arquivo} não tem ${m.fonte.simbolo}`).toContain(m.fonte.simbolo);
      if (m.ligacao) expect(ler(m.ligacao.arquivo), `${kind}: ${m.ligacao.arquivo} não liga ${m.ligacao.simbolo} ao motor`).toContain(m.ligacao.simbolo);
      if (m.fonte === null || m.ligacao === null) expect(m.motivo, `${kind}: marca null exige motivo`).toBeTruthy();
      expect((m.fonte === null) === (m.ligacao === null), `${kind}: fonte e ligação são nulas juntas`).toBe(true);
    });
  }

  it('o motor único serve a todas as ferramentas: a fonte dos pontos é montada em `ToolBase.ctx`, não em cada ferramenta', () => {
    // Nenhuma ferramenta consulta a geometria de escada/guarda-corpo por conta própria: só `base.ts` chama o fornecedor.
    const base = ler('tools/src/base.ts');
    expect(base).toContain('componentSnapIndex(project');
    const quem = ['stairTool.ts', 'wallTool.ts', 'dimensionTool.ts', 'offsetTool.ts', 'trimTool.ts', 'alignTool.ts'].filter((a) => ler(`tools/src/${a}`).includes('componentSnapIndex'));
    expect(quem, 'ferramenta com snap próprio de escada/guarda-corpo').toEqual([]);
  });
});
