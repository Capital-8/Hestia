import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Teste-guarda dos campos do tipo de porta/janela. Auditoria: campos gravados pelo diálogo que ninguém lia (reveal,
// glassKind, manufacturer, solarFactor, custo) ficaram mortos desde a primeira versão.
//
// 1. Os campos vêm do código: os de `OpeningType` (openingTypes.ts) e os de `OpeningComposition` (openingComposition.ts,
//    com prefixo `composition.`). Cada um precisa de entrada em LEITORES: quem lê este campo. Campo novo sem entrada
//    falha; entrada sobrando (campo removido) também.
// 2. Para cada campo com leitor declarado, o NOME precisa aparecer como leitura (`.campo`, fora de comentário) em pelo
//    menos um arquivo de produção de um dos pacotes consumidores. Arquivo só conta se fala de abertura.
// 3. Campo declarado sem nenhum leitor real falha com mensagem. Campo morto conhecido só entra em EXCECOES_CONHECIDAS
//    (decisão do fiscal); a exceção também falha quando deixar de ser morta, para não ficar esquecida.
//
// Limites: a checagem é por nome e por pacote, não por chamada. Leitura por desestruturação ou por laço sobre chaves
// (`for (const k of CHAVES)`) não conta. Campo que só é copiado para outra estrutura (ex.: `OPTION_KEYS`) também não
// conta como leitura, e é exatamente o caso de `glassRatio`.

const RAIZ = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const ARQ_TIPO = 'packages/model/src/openingTypes.ts';
const ARQ_COMPOSICAO = 'packages/model/src/openingComposition.ts';
const RAIZES = ['packages/engine/src', 'packages/render/src', 'packages/io/src', 'packages/model/src'];

/** Quem lê o campo. `ui-apenas` = só interface/identificação, com motivo em MOTIVO_UI_APENAS. */
type Leitor = 'resolve' | 'vao' | 'verificacoes' | 'planta' | '3D' | 'corte' | 'quadro' | 'ifc' | 'ui-apenas';

/** Pastas de produção que cada leitor ocupa. `planta`, `3D` e `corte` dividem o motor (engine) com o render. */
const PACOTES: Record<Exclude<Leitor, 'ui-apenas'>, readonly string[]> = {
  resolve: ['packages/model/src', 'packages/engine/src'],
  vao: ['packages/model/src', 'packages/engine/src'],
  verificacoes: ['packages/model/src', 'packages/engine/src'],
  planta: ['packages/engine/src', 'packages/render/src/plan'],
  '3D': ['packages/engine/src', 'packages/render/src/model3d'],
  corte: ['packages/engine/src', 'packages/render/src/section'],
  quadro: ['packages/engine/src'],
  ifc: ['packages/io/src'],
};

/** Campo de tipo de abertura cujo único leitor é a interface. Motivo obrigatório. */
const MOTIVO_UI_APENAS: Readonly<Record<string, string>> = {
  id: 'identificador do registro de tipos; é a chave de referência, não conduz regra de desenho',
  name: 'rótulo do tipo na interface (navegador de projeto e seletor); a regra não depende do texto',
};

/** Quem lê cada campo. Chave = nome em OpeningType; campos de OpeningComposition ganham o prefixo `composition.`. */
const LEITORES: Readonly<Record<string, readonly Leitor[]>> = {
  id: ['ui-apenas'],
  kind: ['resolve', 'vao', 'planta', '3D', 'quadro', 'ifc'],
  name: ['ui-apenas'],
  code: ['quadro', 'ifc'],
  description: ['quadro', 'ifc'],
  width: ['vao', 'resolve', 'planta', '3D', 'quadro', 'ifc', 'verificacoes'],
  height: ['vao', 'resolve', 'planta', '3D', 'quadro', 'ifc', 'verificacoes'],
  sill: ['vao', 'resolve', '3D', 'ifc'],
  leaves: ['resolve', 'planta', '3D', 'quadro', 'ifc'],
  plan: ['resolve', 'planta', '3D', 'ifc'],
  frameMaterialId: ['3D', 'quadro', 'ifc'],
  glassMaterialId: ['3D', 'ifc'],
  closure: ['vao', '3D'],
  frameWidth: ['resolve', 'vao', '3D', 'quadro', 'ifc'],
  frameDepth: ['resolve', 'vao'],
  frameDepthMode: ['resolve', 'vao'],
  leafThickness: ['resolve', '3D', 'quadro'],
  glassThickness: ['resolve', '3D'],
  roughOversize: ['vao'],
  casing: ['vao', '3D', 'resolve'],
  sillBoard: ['resolve', '3D', 'corte'],
  lintel: ['resolve', '3D', 'quadro', 'verificacoes'],
  sillBeam: ['resolve', '3D', 'quadro', 'verificacoes'],
  leafStyle: ['resolve', '3D', 'planta'],
  handle: ['3D', 'quadro'],
  frameStyle: ['resolve', '3D'],
  grid: ['resolve', '3D', 'ifc'],
  muntinPattern: ['resolve', '3D'],
  transom: ['resolve', '3D', 'vao'],
  sidelights: ['resolve', '3D', 'vao'],
  angle2d: ['resolve', 'planta'],
  angle3d: ['resolve', '3D'],
  planDisplay: ['resolve', 'planta'],
  detail2d: ['resolve', 'planta'],
  detail3d: ['resolve', '3D'],
  showSwing: ['resolve', 'planta'],
  swingStyle: ['resolve', 'planta'],
  leafPlan: ['resolve', 'planta'],
  leafSide: ['resolve', '3D', 'planta'],
  fireRating: ['quadro', 'ifc'],
  acousticRw: ['quadro', 'ifc'],
  uValue: ['quadro', 'ifc'],
  solarFactor: ['quadro', 'ifc'],
  cost: ['quadro'],
  manufacturer: ['quadro', 'ifc'],
  leafMaterialId: ['3D', 'quadro'],
  glassKind: ['resolve', '3D', 'quadro'],
  tiltAxis: ['resolve', '3D'],
  nominalRef: ['resolve', 'vao'],
  spanGap: ['resolve', 'vao'],
  glassRatio: ['resolve', '3D'],
  hinges: ['3D', 'quadro', 'verificacoes'],
  threshold: ['3D', 'quadro', 'verificacoes'],
  reveal: ['resolve', 'planta', '3D', 'vao', 'verificacoes'],
  leafUndercut: ['3D', 'quadro', 'verificacoes'],
  handleHeight: ['3D', 'quadro', 'verificacoes'],
  handleInset: ['3D', 'verificacoes'],
  composition: ['resolve', 'vao', '3D'],
  shape: ['vao', 'resolve'],
  'composition.version': ['resolve'],
  'composition.nominal': ['resolve', 'vao'],
  'composition.frame': ['resolve', '3D'],
  'composition.layout': ['resolve', '3D'],
  'composition.casing': ['vao', '3D'],
};

/**
 * Campo morto conhecido: ninguém lê o valor na produção hoje. O mapa diz quem DEVERIA ler; a exceção fica visível aqui
 * para o fiscal decidir. Quando o campo passar a ser lido, este teste falha e pede para remover a entrada.
 */
const EXCECOES_CONHECIDAS: readonly { campo: string; motivo: string }[] = [
  // campo morto conhecido: o diálogo grava glassRatio (porta-balcão do catálogo usa 0,5), mas nenhum consumidor lê o valor.
  // Só é copiado para LeafOptions (openingCompositionOf.ts / openingCompositionSync.ts) e apagado do vão sintético
  // (openingModelCells.ts). Motor e 3D ignoram a proporção de vidro.
  { campo: 'glassRatio', motivo: 'grava e copia para LeafOptions, mas nenhum consumidor lê o valor (campo morto conhecido)' },
  // campo morto conhecido: composition.version é preenchido com COMPOSITION_VERSION ao criar, mas nenhuma leitura de versão
  // existe em produção (a validação de formato do projeto ainda não a confere).
  { campo: 'composition.version', motivo: 'gravado com COMPOSITION_VERSION e nunca conferido na leitura (campo morto conhecido)' },
];

/** Campos de nível superior de `export interface <nome> { ... }`, com corpo indentado em 2 espaços. */
function camposDeInterface(rel: string, nome: string): string[] {
  const linhas = readFileSync(join(RAIZ, rel), 'utf8').split('\n');
  const ini = linhas.findIndex((l) => l.startsWith(`export interface ${nome} {`));
  if (ini < 0) throw new Error(`interface ${nome} não encontrada em ${rel}`);
  const campos: string[] = [];
  for (let i = ini + 1; i < linhas.length && linhas[i] !== '}'; i++) {
    const m = /^ {2}([A-Za-z_]\w*)\??:/.exec(linhas[i] ?? '');
    if (m) campos.push(m[1]!);
  }
  return campos;
}

const CAMPOS = [
  ...camposDeInterface(ARQ_TIPO, 'OpeningType'),
  ...camposDeInterface(ARQ_COMPOSICAO, 'OpeningComposition').map((c) => `composition.${c}`),
];

function arquivosDeProducao(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    if (nome.name === 'node_modules' || nome.name === 'dist' || nome.name.startsWith('.')) continue;
    const caminho = join(dir, nome.name);
    if (nome.isDirectory()) arquivosDeProducao(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome.name) && !/\.test\.(ts|tsx)$/.test(nome.name) && !nome.name.endsWith('.d.ts')) saida.push(caminho);
  }
  return saida;
}

/** Código de produção (rel posix → fonte sem comentários). Os arquivos que só declaram o tipo ficam de fora. */
const CODIGO: ReadonlyMap<string, string> = (() => {
  const mapa = new Map<string, string>();
  for (const raiz of RAIZES) {
    for (const abs of arquivosDeProducao(join(RAIZ, raiz))) {
      const rel = relative(RAIZ, abs).split(sep).join('/');
      if (rel === ARQ_TIPO || rel === ARQ_COMPOSICAO) continue;
      const src = readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      mapa.set(rel, src);
    }
  }
  return mapa;
})();

/**
 * Só conta leitura em arquivo que fala de abertura (evita `.width` de canvas e afins). Campo de composição exige arquivo
 * que fala de composição: sem isso, `.version` de plugin ou de `store` casaria com `composition.version`.
 */
const CONTEXTO_ABERTURA = /[Oo]pening|[Aa]bertura|OpeningType/;
const CONTEXTO_COMPOSICAO = /[Cc]omposi/;

/** Leitores declarados (exceto ui-apenas) que leem o nome do campo em pelo menos um arquivo dos seus pacotes. */
function leitoresReais(campo: string, leitores: readonly Leitor[]): Leitor[] {
  const nome = campo.split('.').pop() as string;
  const leitura = new RegExp(`\\.${nome}\\b`);
  const contexto = campo.startsWith('composition.') ? CONTEXTO_COMPOSICAO : CONTEXTO_ABERTURA;
  return leitores
    .filter((l): l is Exclude<Leitor, 'ui-apenas'> => l !== 'ui-apenas')
    .filter((l) =>
      [...CODIGO].some(([rel, src]) => PACOTES[l].some((p) => rel.startsWith(`${p}/`)) && contexto.test(src) && leitura.test(src)),
    );
}

describe('contrato: campos do tipo de porta e janela', () => {
  it('todo campo de OpeningType e de OpeningComposition tem entrada em LEITORES', () => {
    const sem = CAMPOS.filter((c) => !(c in LEITORES));
    expect(
      sem,
      `campo novo sem entrada no mapa: ${sem.join(', ')}. Declare quem lê este campo em LEITORES (contratoCamposEsquadria.test.ts).`,
    ).toEqual([]);
  });

  it('nenhuma entrada de LEITORES sobra (campo removido ou renomeado)', () => {
    const sobra = Object.keys(LEITORES).filter((c) => !CAMPOS.includes(c));
    expect(sobra, `entrada de LEITORES sem campo correspondente: ${sobra.join(', ')}. Remova a entrada.`).toEqual([]);
  });

  it('todo ui-apenas tem motivo e todo motivo aponta para um ui-apenas', () => {
    const uiApenas = Object.keys(LEITORES).filter((c) => (LEITORES[c] ?? []).length === 1 && LEITORES[c]?.[0] === 'ui-apenas');
    expect(uiApenas.filter((c) => !MOTIVO_UI_APENAS[c]), 'ui-apenas sem motivo em MOTIVO_UI_APENAS').toEqual([]);
    expect(Object.keys(MOTIVO_UI_APENAS).filter((c) => !uiApenas.includes(c)), 'motivo ui-apenas sem campo ui-apenas').toEqual([]);
  });

  it('todo campo declarado tem pelo menos um leitor que lê o nome em produção', () => {
    const excecoes = new Set(EXCECOES_CONHECIDAS.map((e) => e.campo));
    const falhas: string[] = [];
    for (const campo of CAMPOS) {
      const leitores = LEITORES[campo];
      if (!leitores || excecoes.has(campo) || leitores.every((l) => l === 'ui-apenas')) continue;
      if (leitoresReais(campo, leitores).length === 0) falhas.push(`${campo} (declarado para ${leitores.join(', ')}; nenhum o lê)`);
    }
    expect(
      falhas,
      `campo declarado sem leitor real: ${falhas.join('; ')}. Corrija o consumo; se for morto e ficar assim, marque em EXCECOES_CONHECIDAS com 'campo morto conhecido'.`,
    ).toEqual([]);
  });

  it('cada exceção conhecida é de fato morta, está no mapa e tem motivo', () => {
    for (const { campo, motivo } of EXCECOES_CONHECIDAS) {
      expect(motivo.trim().length, `exceção ${campo} sem motivo`).toBeGreaterThan(0);
      expect(LEITORES[campo], `exceção ${campo} precisa estar em LEITORES`).toBeDefined();
      expect(leitoresReais(campo, LEITORES[campo] ?? []), `exceção ${campo} já é lida em produção: remova-a de EXCECOES_CONHECIDAS`).toEqual([]);
    }
  });
});
