# Ficha F3-arrasto3d — arrastar o componente na vista 3D, com encaixe

Base: `feat/familias-interface` (com F3-core e CONJ-ui integrados).   Nível 3

## Contexto
Na vista 3D o botão esquerdo hoje sempre orbita (`apps/web/src/ui/ViewportCanvas.tsx`: em `onDown`, ramo `view === '3d'`, `drag.current.mode` vira `'orbit'`; a decisão 0016 diz que o 3D só seleciona por clique, sem arrasto de elementos). Esta ficha acrescenta UM comportamento novo: pressionar sobre um COMPONENTE e arrastar move o componente (ou o conjunto dele) no plano do piso, com encaixe na parede e nos vizinhos. Todo o resto do 3D (órbita, pan, clique, caixa, cotas) continua IDÊNTICO.
Pronto no motor (`@hestia/engine`): `posarArrastado`, `facesDasParedes`, `corposDoNivel`, `caixaLocalDoComponente` (`packages/engine/src/componentes/encaixe*.ts`; leia `encaixeTipos.ts` e os comentários). Pronto no modelo: `updateComponent`, `moveComponentGroup`. Leia ainda: `ViewportCanvas.tsx` (`onDown`/`onMove`/`onUp` do ramo 3D, `pickHover3d` e a linha ~542 que usa `pickElement`), `apps/web/src/editor/controller.ts` (`transaction`, `env`), `apps/web/src/editor/state.ts` (`clickSelect3d`, `useUi.selection`), `packages/render/src/model3d/pick3d.ts`.

## Faça
1. **Plano do piso** (arquivo novo `apps/web/src/ui/viewport/planoHorizontal.ts`): `pontoNoPlanoHorizontal(camera: THREE.Camera, ndc: {x,y}, z: number): { x: number; y: number } | null` — interseção do raio da câmera pelo ponto NDC com o plano z = `z` (m), no sistema do modelo. Cuidado com o eixo: o mundo do Hestia tem Z para cima (veja como `pickModelPoint` converte o ponto da cena para `x, y` e como `scene3d` posiciona o grupo do modelo, p. ex. rotação do eixo; reproduza a mesma conversão). `null` se o raio é paralelo ao plano ou aponta para o lado contrário. Teste `planoHorizontal.test.ts` com câmera ortográfica e perspectiva sintéticas (resultado calculado à mão).
2. **Lógica do arrasto** (arquivo novo `apps/web/src/editor/arrasto3d.ts`, SEM DOM e SEM three.js, testável): classe `Arrasto3D` criada com `{ projeto, ids: Id[] (os componentes que se movem: o componente clicado ou todos os membros do conjunto), levelId, ponteiro inicial: {x,y} }`. `mover(ponto: {x,y}, opcoes: { semEncaixe: boolean }): { poses: Map<Id, {x,y,rotation}>; parede?: number; vizinho?: string; colisoes: string[] }` calcula o deslocamento desde o ponto inicial, aplica à pose do componente "líder" (o clicado), chama `posarArrastado` para o líder (entorno: `corposDoNivel` sem os que se movem, e `facesDasParedes`), e move os demais membros com o MESMO deslocamento rígido do líder (translação e, se o líder girou ao encaixar, giro rígido em torno da posição inicial do líder). `projeto` pode ser trocado por função injetada `deps` (padrão: as reais) para os testes usarem versões simuladas. Teste `arrasto3d.test.ts`: deslocamento puro sem encaixe; com `semEncaixe` ignora o encaixe; conjunto de 3 move os 3 rigidamente; líder encaixado na parede gira os outros junto (valores à mão); `posarArrastado` simulado devolvendo pose fixa.
3. **Ligação no 3D** (mudanças MÍNIMAS em `ViewportCanvas.tsx`, com a lógica em arquivo novo `apps/web/src/ui/viewport/arrastoComponente3d.ts` que exporta funções chamadas de uma a três linhas):
   - `onDown` (3D, botão esquerdo, sem Alt, sem Espaço, sem Shift/Ctrl, sem prévia de colar): se `pickElement` sob o cursor devolve o id de um COMPONENTE: seleciona-o (se não está na seleção; se pertence a conjunto, seleciona o conjunto todo, como o clique já faz após a CONJ-ui) e arma o arrasto (`drag.current.mode = 'componente'`; novo valor do tipo, sem orbitar). O arrasto só "pega" depois de passar do limiar de movimento (o mesmo `passouDoLimiar` do 3D); antes disso, soltar é um CLIQUE normal (seleção), exatamente como hoje.
   - `onMove`: com o arrasto pegando, calcula o ponto no plano z = elevação do nível + `z` do líder com `pontoNoPlanoHorizontal`, chama `mover` (Alt pressionado = `semEncaixe`) e aplica as poses por `editor` numa TRANSAÇÃO DE SESSÃO única (`env.transaction('Mover componente', fn, sessao)` com o mesmo objeto de sessão em todos os movimentos: vira um só passo de desfazer), usando `updateComponent` por membro. Mostra na barra de status: "Encaixado na parede", "Colado em <marca ou id>", "Colide com <marca ou id>" ou nada.
   - `onUp`: encerra (a transação já está aplicada); sem ter pegado, é clique.
   - `Esc` durante o arrasto cancela: desfaz a sessão (volta as poses iniciais) e encerra, sem criar passo de desfazer.
   - O cursor da vista pode ficar `grabbing` durante o arrasto.
4. **Medição**: um teste de desempenho NÃO bloqueante em `arrasto3d.test.ts` (ou um script de console descrito no relatório): 60 chamadas de `mover` com 40 corpos e 12 faces; relate o tempo total no relatório (meta: < 50 ms no total).
5. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run apps/web packages/render` sem regressão (inclui `pick3d.test.ts` e os testes de seleção 3D: NADA pode mudar neles). Nada acima de 420 linhas nos arquivos novos (o `ViewportCanvas.tsx` já tem exceção de tamanho: não aumente mais que ~25 linhas); textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/viewport/{planoHorizontal.ts, planoHorizontal.test.ts, arrastoComponente3d.ts, arrastoComponente3d.test.ts}` (NOVOS), `apps/web/src/editor/{arrasto3d.ts, arrasto3d.test.ts}` (NOVOS), `apps/web/src/ui/ViewportCanvas.tsx` (mínimo), `apps/web/src/editor/state.ts` (só se precisar de um campo novo do estado, mínimo).

## Proibido
`packages/**`, `crates/**`, `docs/**`, testes existentes, snapshots, qualquer mudança de comportamento da órbita, do pan, da caixa de seleção ou do clique.

## Critério de parada
Se não for possível manter órbita/pan/clique idênticos, ou se a conversão de eixos não puder ser confirmada por teste: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (inclua o tempo medido).
