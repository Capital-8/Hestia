import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Teste-guarda da parede cortina (decisão 0056, §4.1 e §12 risco 1). Varre o código de produção (não os testes).
//
// 1. `totalThickness` só aparece em `wallType.ts`: quem precisa da espessura de uma parede usa `wallThicknessOf`.
// 2. Ler `layers` de um tipo de parede só nos arquivos listados abaixo. A lista é a de consumidores de tipo de parede
//    que leem camadas (saiu de `grep` na fase 0 e fica como lista a revisar na fase 1). Um arquivo novo que leia
//    `layers` de parede cai aqui e precisa ser revisado: a camada-sombra da cortina não pode virar fonte de verdade.
//
// Limite conhecido: a checagem é por arquivo, não por chamada. Dentro de um arquivo listado, uma leitura nova de
// `layers` de cortina não é pega aqui; essa parte fica para a revisão da fase 1 (§12 risco 1).

const RAIZ = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const RAIZES = ['packages', 'apps', 'tests'];

function arquivosDeProducao(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    if (nome.name === 'node_modules' || nome.name === 'dist' || nome.name.startsWith('.')) continue;
    const caminho = join(dir, nome.name);
    if (nome.isDirectory()) arquivosDeProducao(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome.name) && !/\.test\.(ts|tsx)$/.test(nome.name) && !nome.name.endsWith('.d.ts')) saida.push(caminho);
  }
  return saida;
}

const relativos = (caminhos: string[]) => caminhos.map((c) => relative(RAIZ, c).split(sep).join('/')).sort();

const producao = () => relativos(RAIZES.flatMap((r) => arquivosDeProducao(join(RAIZ, r))));

const lerArquivos = (rels: string[]) => rels.map((rel) => [rel, readFileSync(join(RAIZ, rel), 'utf8')] as const);

/** Arquivos de produção que leem `layers` de um tipo de parede (lista da fase 0, §12 risco 1). */
const PONTOS_PERMITIDOS_LAYERS = new Set([
  // Falso positivo: lê `r.layers[0]` de lajes e pisos JÁ RESOLVIDOS (não as camadas de um tipo de parede); só cita wallTypes ao montar o projeto de teste.
  'tests/termino-camada-matriz.ts',
  // Núcleo do tipo de parede e o próprio tipo cortina (camada-sombra e validação).
  'packages/model/src/wallType.ts',
  'packages/model/src/wallCurtain.ts',
  'packages/model/src/curtainCommands.ts',
  // Consumidores de parede que leem camadas (fase 1 revisa cada um para a cortina).
  'apps/web/src/editor/pastePreview.ts',
  'apps/web/src/editor/typeActions.ts',
  'apps/web/src/plugins/sceneExport.ts',
  'apps/web/src/ui/Properties.tsx',
  'apps/web/src/ui/dialogs/WallTypeDialog.tsx',
  'packages/engine/src/kernelA1.ts',
  'packages/engine/src/partialStructure.ts',
  'packages/engine/src/quantities.ts',
  'packages/engine/src/resolve.ts',
  'packages/engine/src/schedule.ts',
  'packages/engine/src/wrap.ts',
  'packages/io/src/dxfNotes.ts',
  'packages/io/src/ifc/ifcExport.ts',
  'packages/io/src/ifc/ifcQuantities.ts',
  'packages/model/src/queries.ts',
  'packages/render/src/plan/tags.ts',
  'tests/ifc-export/canonical.ts',
]);

describe('guarda da parede cortina', () => {
  it('totalThickness só existe em wallType.ts (espessura de parede passa por wallThicknessOf)', () => {
    const usam = lerArquivos(producao())
      .filter(([rel, src]) => rel !== 'packages/model/src/wallType.ts' && /\btotalThickness\b/.test(src))
      .map(([rel]) => rel);
    expect(usam).toEqual([]);
  }, 60_000);

  it('ler layers de um tipo de parede só nos pontos permitidos', () => {
    const fora = lerArquivos(producao())
      .filter(([, src]) => /\.layers\b/.test(src) && /WallType|wallTypes|wallType\(/.test(src))
      .map(([rel]) => rel)
      .filter((rel) => !PONTOS_PERMITIDOS_LAYERS.has(rel));
    expect(fora).toEqual([]);
  }, 60_000);
});
