/**
 * TESTE-GUARDA do contrato de ferramentas de MODIFICAÇÃO (docs/contratos/familias-e-ferramentas.md, regra 3): todo
 * `kind` de elemento do modelo precisa estar classificado aqui, dizendo como mover/girar/espelhar/copiar (comando
 * genérico `transform`), copiar/colar e alinhar o tratam.
 *
 * Duas travas:
 * 1. Compilação: `CLASSIFICACAO` é um `Record<Element['kind'], ...>`. Um kind novo em `Element` sem linha aqui não
 *    compila (o `tsc` falha). Foi assim que o guarda-corpo ficou de fora das ferramentas de modificação.
 * 2. Execução: cada marca (`mover`, `colar`, `alinhar`) aponta um símbolo que tem de existir no código da ferramenta;
 *    `null` exige o motivo escrito (exceção explícita, com TODO).
 *
 * A mesma regra vale para o CORTE e a ELEVAÇÃO (`CORTE`): Mover, Copiar e Alinhar da vista levam o kind pelo mecanismo único
 * `comandosMoverNoCorte` (`sectionMoverElementos.ts`), e o Alinhar escolhe o alvo pelo desenho da vista. O fluxo do Mover e do Copiar
 * da vista é o MESMO da planta (ponto base e destino com os snaps do índice da vista, Orto/Polar, distância digitada + Enter, prévia
 * com o contorno do elemento, cota do deslocamento, Esc, várias cópias): ver `CORTE.previa` e o teste do núcleo comum abaixo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Element } from '@hestia/model';

const aqui = dirname(fileURLToPath(import.meta.url));
const lerTools = (arq: string): string => readFileSync(join(aqui, arq), 'utf8');
const lerModel = (arq: string): string => readFileSync(join(aqui, '..', '..', 'model', 'src', arq), 'utf8');

interface Marca {
  /** Símbolo que leva o kind ao comando `transform` (mover, girar, espelhar, copiar, matriz) em `edit.ts`, ou null com motivo. */
  mover: string | null;
  /** Campo do `ClipBuffer` (copiar e colar, inclusive entre pavimentos), ou null com motivo. */
  colar: string | null;
  /** Feição do Alinhar (`alignFeatures.ts`), ou null com motivo. */
  alinhar: string | null;
  /** Obrigatório quando alguma marca é null. */
  motivo?: string;
}

const CLASSIFICACAO: Record<Element['kind'], Marca> = {
  wall: { mover: 'selectedWalls', colar: 'walls', alinhar: 'wallFeatures' },
  door: { mover: 'selectedOpenings', colar: 'openings', alinhar: 'openingFeatures' },
  window: { mover: 'selectedOpenings', colar: 'openings', alinhar: 'openingFeatures' },
  floor: { mover: 'selectedFloors', colar: 'floors', alinhar: 'ringFeatures' },
  slab: { mover: 'selectedSlabs', colar: 'slabs', alinhar: 'ringFeatures' },
  ceiling: { mover: 'isCeiling', colar: 'ceilings', alinhar: 'ringFeatures' },
  roof: { mover: 'selectedRoofs', colar: 'roofs', alinhar: 'ringFeatures' },
  stair: { mover: 'selectedStairs', colar: 'stairs', alinhar: 'stairRampFeatures' },
  ramp: { mover: 'selectedRamps', colar: 'ramps', alinhar: 'stairRampFeatures' },
  railing: { mover: 'selectedGuardaCorpos', colar: 'railings', alinhar: 'railingFeatures' },
  mass: { mover: 'selectedMasses', colar: 'masses', alinhar: 'massFeatures' },
  room: { mover: 'selectedRooms', colar: 'rooms', alinhar: null, motivo: 'TODO: o ambiente não tem linha alinhável (o contorno é derivado das paredes).' },
  generic: { mover: null, colar: 'generics', alinhar: null, motivo: 'TODO: o objeto importado tem malha em coordenadas de mundo; o `transform` ainda não a move (o Colar translada por conta própria).' },
  cad: { mover: 'selectedCads', colar: 'cad', alinhar: null, motivo: 'TODO: o desenho CAD é um objeto só; alinhar pelas linhas dele ainda não existe.' },
};

/**
 * Corte e elevação. `mover`: símbolo que leva o kind no Mover e no Copiar da vista; `alinhar`: símbolo que trata o kind como
 * alvo do Alinhar da vista; `previa`: símbolo de `sectionMoverPrevia.ts` que desenha o fantasma (contorno deslocado) do kind no Mover e
 * no Copiar. `null` exige o motivo (TODO).
 */
interface MarcaCorte {
  mover: string | null;
  alinhar: string | null;
  previa: string | null;
  motivo?: string;
}

const CORTE: Record<Element['kind'], MarcaCorte> = {
  wall: { mover: 'isWall', alinhar: 'applyWall', previa: 'isWall' },
  door: { mover: 'selectedOpenings', alinhar: 'applyOpening', previa: 'aberturas' },
  window: { mover: 'selectedOpenings', alinhar: 'applyOpening', previa: 'aberturas' },
  floor: { mover: 'isFloor', alinhar: 'isFloor', previa: 'movidos' },
  slab: { mover: 'isSlab', alinhar: 'isSlab', previa: 'movidos' },
  ceiling: { mover: null, alinhar: null, previa: null, motivo: 'TODO: o forro não está em `selectedMovables` (planta) e o corte ainda não o leva; mover e alinhar o forro no corte ficam para depois.' },
  roof: { mover: 'isRoof', alinhar: null, previa: 'movidos', motivo: 'TODO: a água do telhado é inclinada e não oferece linha horizontal ou vertical segura para alinhar; no corte ele só se move.' },
  stair: { mover: 'isStair', alinhar: 'isStair', previa: 'movidos' },
  ramp: { mover: 'isRamp', alinhar: 'isRamp', previa: 'movidos' },
  railing: { mover: 'isGuardaCorpo', alinhar: 'guardaCorpoPieces', previa: 'isGuardaCorpo' },
  mass: { mover: 'isMass', alinhar: 'massaCortePieces', previa: 'massaCortePieces' },
  room: { mover: null, alinhar: null, previa: null, motivo: 'TODO: o ambiente não aparece no desenho do corte nem da elevação.' },
  generic: { mover: null, alinhar: null, previa: null, motivo: 'TODO: o objeto importado não aparece no corte (e o `transform` ainda não o move).' },
  cad: { mover: null, alinhar: null, previa: null, motivo: 'TODO: o desenho CAD não aparece no corte nem na elevação.' },
};

/**
 * Ferramentas que só fazem sentido para elemento LINEAR (parede, borda de piso...): Aparar, Estender, Dividir e Deslocar. Um kind que não é
 * linear marca `null` com o motivo escrito; o teste abaixo confere que nenhuma delas recebe o kind pelo mecanismo genérico (`selectedMovables`).
 */
const FERRAMENTAS_LINEARES: Partial<Record<Element['kind'], { aparar: null; estender: null; dividir: null; deslocar: null; motivo: string }>> = {
  mass: { aparar: null, estender: null, dividir: null, deslocar: null, motivo: 'massa não é elemento linear' },
};

const CODIGO_MOVER = ['edit.ts', 'arrayRadial.ts'].map(lerTools).join('\n');
const CODIGO_CORTE_MOVER = ['sectionMoverElementos.ts', 'sectionEditTools.ts', 'sectionMoveTool.ts'].map(lerTools).join('\n');
const CODIGO_CORTE_PREVIA = lerTools('sectionMoverPrevia.ts');
const CODIGO_CORTE_ALINHAR = lerTools('sectionEditTools.ts');
const CODIGO_COLAR = lerTools('clipboard.ts');
const CODIGO_ALINHAR = lerTools('alignFeatures.ts');

describe('contrato: todo kind de elemento está classificado nas ferramentas de modificação', () => {
  for (const [kind, m] of Object.entries(CLASSIFICACAO)) {
    it(`${kind}: marcas apontam código que existe`, () => {
      if (m.mover) expect(CODIGO_MOVER, `${kind}: mover/girar/espelhar/copiar não tem ${m.mover}`).toContain(m.mover);
      if (m.colar) expect(CODIGO_COLAR, `${kind}: copiar/colar não tem ${m.colar}`).toMatch(new RegExp(`\\b${m.colar}\\b`));
      if (m.alinhar) expect(CODIGO_ALINHAR, `${kind}: alinhar não tem ${m.alinhar}`).toContain(m.alinhar);
      if (m.mover === null || m.colar === null || m.alinhar === null) expect(m.motivo, `${kind}: marca null exige motivo`).toBeTruthy();
    });
  }

  for (const [kind, m] of Object.entries(CORTE)) {
    it(`${kind}: Mover, Copiar e Alinhar do corte e da elevação apontam código que existe`, () => {
      if (m.mover) expect(CODIGO_CORTE_MOVER, `${kind}: Mover/Copiar do corte não tem ${m.mover}`).toContain(m.mover);
      if (m.alinhar) expect(CODIGO_CORTE_ALINHAR, `${kind}: Alinhar do corte não tem ${m.alinhar}`).toContain(m.alinhar);
      if (m.previa) expect(CODIGO_CORTE_PREVIA, `${kind}: o fantasma do Mover/Copiar do corte não tem ${m.previa}`).toContain(m.previa);
      if (m.mover === null || m.alinhar === null || m.previa === null) expect(m.motivo, `${kind}: marca null exige motivo`).toBeTruthy();
    });
  }

  it('Mover, Copiar e Alinhar estão entre as ferramentas permitidas na vista de corte e elevação, e o registro escolhe a ferramenta do corte', () => {
    const controlador = readFileSync(join(aqui, '..', '..', '..', 'apps', 'web', 'src', 'editor', 'controller.ts'), 'utf8');
    const linha = controlador.split('\n').find((l) => l.includes('const SECTION_TOOLS')) ?? '';
    for (const id of ['move', 'copy', 'align']) expect(linha, `SECTION_TOOLS sem '${id}'`).toContain(`'${id}'`);
    const registro = lerTools('registry.ts');
    expect(registro).toMatch(/case 'copy':\s*return env\.section\?\.\(\) \? new SectionMoveTool\(env, true\)/);
    expect(registro).toMatch(/case 'move':\s*return env\.section\?\.\(\) \? new SectionMoveTool\(env\)/);
  });

  it('Mover e Copiar do corte usam o núcleo comum da planta: ponto base e destino por snap, digitado, cota do deslocamento e sessão de cópias', () => {
    const corte = lerTools('sectionMoveTool.ts');
    const planta = lerTools('transformTools.ts');
    // O mesmo módulo de gesto nas duas vistas (nada de cópia do fluxo): estender o núcleo, não duplicar (regra 1).
    for (const [nome, codigo] of [['corte', corte], ['planta', planta]] as const) {
      expect(codigo, `${nome}: não usa o núcleo do gesto`).toContain("from './gestoDeslocamento.ts'");
      for (const simbolo of ['deslocamentoDigitado', 'cotaDoDeslocamento', 'SessaoDeCopias']) expect(codigo, `${nome}: sem ${simbolo}`).toContain(simbolo);
    }
    // Snaps do índice da vista com o ponto base como origem do Orto, Polar e rastreios, e ponto de destino capturado do mesmo jeito.
    expect(corte).toMatch(/this\.snap\(travado, \{ from \}\)/);
    expect(corte).toContain('tempDims(');
    expect(corte).toContain('inputPrompt(');
    expect(corte).toContain('fantasmaDoMover(');
    // Nada de arraste: o fluxo é por clique, como na planta.
    expect(corte).not.toMatch(/\bdown\(|\bdrag\(|\bup\(/);
  });

  it('Aparar, Estender, Dividir e Deslocar: a massa não é elemento linear (null com motivo escrito)', () => {
    const m = FERRAMENTAS_LINEARES.mass!;
    expect(m.motivo).toBe('massa não é elemento linear');
    // As ferramentas lineares não escolhem alvo por `selectedMovables`/`selectedMasses`: a massa não entra nelas.
    for (const arq of ['trimTool.ts', 'splitTool.ts', 'offsetTool.ts']) expect(lerTools(arq), `${arq} não deve levar a massa`).not.toContain('selectedMasses');
  });

  it('o comando `transform` do modelo trata os kinds marcados como móveis', () => {
    const cmd = lerModel('commands.ts') + lerModel('guardaCorpoTransform.ts');
    for (const [kind, m] of Object.entries(CLASSIFICACAO)) {
      if (!m.mover || kind === 'door' || kind === 'window') continue; // aberturas seguem a parede anfitriã
      const guarda = { wall: 'transformWall', floor: 'isFloor', slab: 'isSlab', ceiling: 'isCeiling', roof: 'isRoof', stair: 'isStair', ramp: 'isRamp', railing: 'transformarGuardaCorpos', room: 'isRoom', cad: 'isCad', mass: 'transformMass' }[kind];
      expect(guarda, `${kind}: falta o símbolo do comando transform no teste-guarda`).toBeDefined();
      expect(cmd, `${kind}: o comando transform não trata este kind`).toContain(guarda!);
    }
  });
});
