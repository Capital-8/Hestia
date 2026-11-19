# Cortes e elevações: o relato "não aparece vão nem esquadria"

Data: 2026-11-19. Continua `29` (vistas e DXF com contorno), `35` (mescla com main) e `36` (diagnóstico no app real). Marcas: [V] verificado nesta sessão (teste ou navegador); [I] inferência.

Relato: no app completo (artifact), em cortes e elevações "não aparece nem abertura nem portas/esquadrias", ao que parece em geral.

## 1. Reprodução no navegador

Build sem clobber (`vite build --outDir` no scratchpad, `geom_wasm.wasm` ao lado), servido por http, Playwright (Chromium, `?gl=1&debug=1`). Também em modo "artifact" (só `index.html` + wasm, sem os `*Worker-*.js`: `resolveWorker` cai na thread principal). Projeto montado por `store.exec` (parede com `ot_p90`, `ot_j120`, `ot_parcop_90x210` P-86 e `ot_jarcop_120x150` J-60), vistas por `addView` e `editor.generateElevations()`, aberta por `editor.openSection`.

| Caso | Resultado |
|---|---|
| Elevação e cortes com retangulares (`ot_p90`, `ot_j120`), build do HEAD, com worker | Aparecem: caixilho, folha, vidro, divisões, maçaneta, V da abertura. [V] |
| Idem, modo artifact (sem worker, cliente do furo na thread principal) | Idêntico ao com worker. [V] |
| Elevações geradas (Norte/Sul/Leste/Oeste) em casa fechada, `house2` e `esquadrias` | Vãos e esquadrias aparecem. No `esquadrias` o enquadramento inicial é de ~100 m e os vãos ficam tracinhos de pixels; com zoom aparecem todos. [V] |
| Retangular vs origin/main (worktree em pasta do scratchpad) | `computeSection` (JSON) e `buildSectionDrawList` (JSON) com hash IGUAL nos 3 casos (corte pela porta, corte pela janela, elevação). [V] |
| Vão com forma (P-86, J-60), HEAD antes das peças | Aparecia só preenchimento liso (cor da porta ou do vidro) com o perfil; sem caixilho, folha, divisões. É o limite documentado em `29` §5. [V] |
| Sem `geom_wasm.wasm` | Falha explícita do kernel em TUDO (planta e 3D também), não só nas vistas. [V] |

## 2. Causa

[V] Não há regressão de vão retangular: o caminho de código e a saída são idênticos aos de origin/main (hash igual da engine e da lista de desenho). A mescla (`35`) não quebrou o corte nem a elevação, e o artifact sem worker funciona. Não consegui reproduzir "nada aparece".

[V] O que existia de fato, no HEAD desta branch: o vão COM FORMA no corte e na elevação saía sem esquadria (só o perfil e a cor lisa), porque `build.ts` tomava o caminho "sem modelo" quando havia `o.contorno`. Isso bate com "não aparece esquadria" nos tipos novos.

[I] Para os retangulares, as hipóteses mais prováveis do relato são: build mais antigo que o HEAD no artifact do usuário; enquadramento inicial em projeto grande (o template `esquadrias` deixa os vãos minúsculos); parede sem face preenchida (a face da parede na elevação é cor de papel, o furo só se nota pelo contorno e pelo preenchimento do vão). Se o relato persistir com um build atual, peço o `.hestia` e os passos.

## 3. Correção

As peças no vão com contorno (caixilho recortado pelo arco, folha sob o arco, vidro, divisões, hachura de corte nos perfis cortados) foram ligadas por outro trabalho em paralelo na mesma árvore: `packages/render/src/section/build.ts` (o vão com `o.contorno` segue o caminho completo com o modelo, já recortado por `contornoDoModelo`) e `packages/render/src/section/perfis.ts` (`fatiaTz`: o prisma recortado é fatiado pelo plano de corte). Eu NÃO editei esses arquivos, para não colidir. [V] Conferido no navegador com esse estado.

Antes (HEAD) x depois (árvore atual), mesmo projeto, wall 4 m com P-86 e J-60:
- Elevação: antes, silhuetas lisas (porta bege, janela azul); depois, caixilho em arco, folha com a diagonal de abertura e maçaneta, vidro com batente em arco.
- Corte pela porta (x = 1): antes, vão liso; depois, batente com hachura, folha, e o vazio sob o arco.
- Corte pela janela (x = 3 e 3,4): antes, faixa azul lisa; depois, peitoril e verga com hachura, vidro e caixilho em corte.
- Retangulares: inalterados (hash igual ao de origin/main, ver §1).

Capturas: `scratchpad/shots2/mont-z-antes.png` e `mont-z-depois.png` (quatro vistas cada); `depois1-ve1.png` e `depois1-vs1.png` (os quatro vãos na elevação e o corte pelo P-86).

## 4. Testes de regressão (novos)

- `packages/engine/src/sectionVaosNasVistas.test.ts` (6): com e sem cliente do furo, a elevação devolve os três vãos com polígono e peças do modelo; o campo `contorno` só existe no vão com forma e só com o cliente; no corte, o vão cortado traz peças e a parede não cobre o vão (e cobre acima dele), também no vão com forma.
- `packages/render/src/section/vaosNasVistas.test.ts` (6): na lista de desenho, cada vão (retangular e com forma, elevação e dois cortes) tem preenchimento e pelo menos dois traços (contorno e peças) dentro da sua caixa. Reprova o comportamento antigo do vão com forma (só um traço).

Rodados (só as áreas): engine `section*` e `vaoContorno*`, render `section/`, io `dxf*`, web `dxf*` e `elevations`: 83 arquivos, 713 testes verdes. `tsc` sem erro nos arquivos tocados (restam erros em `packages/engine/src/zzdbg.test.ts`, arquivo temporário de outro agente); `check-boundaries` e `check-units` ok; eslint limpo nos dois testes.

## 5. O que ficou de fora

- DXF de corte e elevação: continua só com o contorno do vão (retângulo ou arcos), sem caixilho nem folha, para os retangulares também (igual a origin/main). [V pelo código `dxfSection.ts`]
- Corte oblíquo ao eixo da parede e face atrás do vão: limites de `29` §5, inalterados.
- Não rodei a suíte inteira.
