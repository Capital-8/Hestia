# Verificação visual — roteiro, capturas e veredito (A2, Fase 1)

- **Data:** 2026-10-26
- **Agente:** A2 — Squad 1 (Estabilização)
- **Ramo:** `gpu/a2-visual` (worktree `gpu-a2-visual`, sem push)
- **Base:** `181469f`
- **Origem:** handoff de inserção de 2026-10-26 (removido) §5/Passo 3 (“Conferência visual”); plano de subagentes de 2026-10-26 (documento removido) §4/Fase 1.2
- **Escopo:** só teste e documentação. Nenhum arquivo de `apps/web/src`, `packages/*/src`, baseline antiga de
  `tests/e2e/baseline*` ou `scripts/perf-baselines` foi alterado.
- **Resultado:** **44 PASS · 1 FAIL · 0 PENDENTE** em 6 itens — o FAIL é um defeito real do produto
  (seleção de linha de detalhe), descrito na §5.

## 1. Como reproduzir

```powershell
# na raiz do repositório
npm run build -w @hestia/web -- --target esnext --minify false   # ou, na raiz: npm run build
node tests/e2e/verificacao-visual.mjs
```

- Filtro por item: `node tests/e2e/verificacao-visual.mjs --item cotas` (aceita id ou parte do nome).
- Lista de itens: `--list`.
- Falha com código 1 (para CI): `--strict` (por padrão o roteiro termina com 0 e relata o veredito).
- Outra URL/build: `--url http://localhost:5173/index.html` ou `APP_URL=...`.
- Outro navegador: `--browser "C:\caminho\chrome.exe"` ou `CHROME_PATH=...`.

O roteiro abre o build por `file://` com `?debug=1`, usa Chrome/Edge do sistema via `playwright-core` (na falta,
o Chromium do `playwright-core`) e grava tudo em `tests/e2e/out/verificacao-visual/`:

- um PNG por critério (prefixo `1-`…`6-`);
- `resultados.md` — tabela gerada “esperado × observado” da última execução;
- `resumo.json` — o mesmo, em JSON (navegador, URL, contagens e cada critério).

**Não há comparação com baseline.** Os critérios são medidos no DOM da planta (`.labels .plan-note`), no projeto
(`window.__hestia`) e nos pixels da captura. Por isso o roteiro não cria nem altera baseline nenhuma.

## 2. Ambiente da execução registrada

| Item | Valor |
|---|---|
| Navegador | Chrome **155.0.8059.86** (executável do sistema) |
| Flags | `--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` |
| Backend | **WebGL2** (`useUi.gpu = webgl2`; SwiftShader, sem GPU real) |
| Viewport | 1440×900, `deviceScaleFactor: 1`; área útil `.canvas-wrap` **1148×624** |
| Build | `apps/web/dist` do worktree em `181469f`, `--minify false` (index 7,15 MB) |
| Erros de página | **0** em todos os itens |

## 3. Resumo por item

| # | Item | Critérios | Veredito |
|---|---|---:|---|
| 1 | Cotas individual e em cadeia (zooms 12/60/220) | 18 | **PASS** |
| 2 | Texto com caixa: negrito, itálico, alinhamento, quebra e máscara | 6 | **PASS** |
| 3 | Etiquetas, líderes e “Etiquetar todos” | 4 | **PASS** |
| 4 | Linha de detalhe tracejada/pontilhada e seleção 1,7× | 6 | **FAIL** (só a seleção 1,7×) |
| 5 | Rótulos de corte/elevação | 5 | **PASS** |
| 6 | 3D com caixas instanciadas: paredes, portas/janelas, silhueta e seleção | 6 | **PASS** |

## 4. Resultado por item

### 4.1 Cotas individual e em cadeia — PASS

Projeto sintético 8 × 6 m; cota individual na parede sul (8,00 m) e cadeia de três trechos no topo
(2,00 m / 1,50 m / 1,00 m). Para cada zoom, o enquadramento é centrado na cota; a cadeia é curta o bastante para
caber inteira até 220 px/m.

| Critério | Esperado | Observado | Veredito | Motivo / captura |
|---|---|---|---|---|
| Individual em 12 / 60 / 220 | texto `8,00 m` visível e dentro do canvas | 1/1 visível nas três | PASS | texto de papel escala com o zoom: 3,0 → 15,0 → 55,0 px |
| Cadeia em 12 / 60 / 220 | `2,00 m`, `1,50 m`, `1,00 m` visíveis e dentro do canvas | 3/3 nas três | PASS | três cotas encadeadas, sem sobreposição com a parede |
| Escala do texto | cresce com o zoom | 3,0 px → 15,0 px → 55,0 px | PASS | proporcional (2,5 mm de papel) |
| Controle de seleção | seleção de cota muda o desenho | 1 282 px alterados, 1 282 azuis | PASS | confirma que o caminho de seleção→desenho funciona para cotas |
| Erros de página | nenhum | 0 | PASS | — |

Capturas: [`1-cota-individual-z12.png`](../../tests/e2e/out/verificacao-visual/1-cota-individual-z12.png) ·
[`1-cota-individual-z60.png`](../../tests/e2e/out/verificacao-visual/1-cota-individual-z60.png) ·
[`1-cota-individual-z220.png`](../../tests/e2e/out/verificacao-visual/1-cota-individual-z220.png) ·
[`1-cota-cadeia-z12.png`](../../tests/e2e/out/verificacao-visual/1-cota-cadeia-z12.png) ·
[`1-cota-cadeia-z60.png`](../../tests/e2e/out/verificacao-visual/1-cota-cadeia-z60.png) ·
[`1-cota-cadeia-z220.png`](../../tests/e2e/out/verificacao-visual/1-cota-cadeia-z220.png) ·
[`1-controle-selecao-cota.png`](../../tests/e2e/out/verificacao-visual/1-controle-selecao-cota.png) ·
[`1-controle-selecao-cota-ativa.png`](../../tests/e2e/out/verificacao-visual/1-controle-selecao-cota-ativa.png).

Ressalva: em 220 px/m a cota individual mostra o texto e o trecho central; as pontas ficam fora do quadro
(limite geométrico do zoom, não defeito). A cadeia cabe inteira porque foi dimensionada para isso.

### 4.2 Texto com caixa — PASS

| Critério | Esperado | Observado | Veredito | Motivo / captura |
|---|---|---|---|---|
| Negrito | `font-weight: 700` | 700 | PASS | `TextNote.bold` chega ao DOM |
| Itálico | `font-style: italic` | italic | PASS | `TextNote.italic` chega ao DOM |
| Alinhamento e quebra | `text-align: right`, `white-space: normal`, mais de uma linha | right / normal; 60 px de altura para 17,3 px de fonte (3 linhas) | PASS | `width` de 45 mm abre a quebra |
| Líder de texto | linha de chamada até o modelo | texto `Líder` com 38×20 px sobre o líder | PASS | líder desenhado junto do texto |
| Máscara de região | centro na cor do papel; faixa vizinha ainda amarela | antes `231,226,208`; depois centro `251,251,250`, faixa `231,226,208` | PASS | a máscara cobre só a região interna |
| Erros de página | nenhum | 0 | PASS | — |

Capturas: [`2-texto-caixa.png`](../../tests/e2e/out/verificacao-visual/2-texto-caixa.png) (visão geral),
[`2-texto-caixa-detalhe.png`](../../tests/e2e/out/verificacao-visual/2-texto-caixa-detalhe.png) (quebra em close),
[`2-mascara-antes.png`](../../tests/e2e/out/verificacao-visual/2-mascara-antes.png) (região sem máscara).

### 4.3 Etiquetas, líderes e “Etiquetar todos” — PASS

Projeto com 4 paredes, uma porta e uma janela; etiqueta manual com líder na parede sul e, depois, o comando real
da faixa (`Anotar` → `Etiquetar todos`).

| Critério | Esperado | Observado | Veredito | Motivo / captura |
|---|---|---|---|---|
| Etiqueta com líder | texto e linha de chamada visíveis | `PA-14`; 4/4 pontos do líder com tinta | PASS | etiqueta associativa + líder até o eixo da parede |
| Etiquetar todos | 6 etiquetas (4 paredes + porta + janela) | 6 etiquetas; status “5 etiquetas criadas.” | PASS | respeita a etiqueta já existente |
| Rótulos na vista | ao menos 6 rótulos não vazios | 6 rótulos (3 textos distintos) | PASS | códigos de tipo por elemento |
| Erros de página | nenhum | 0 | PASS | — |

Capturas: [`3-etiqueta-lider.png`](../../tests/e2e/out/verificacao-visual/3-etiqueta-lider.png),
[`3-etiqueta-lider-detalhe.png`](../../tests/e2e/out/verificacao-visual/3-etiqueta-lider-detalhe.png),
[`3-etiquetar-todos.png`](../../tests/e2e/out/verificacao-visual/3-etiquetar-todos.png),
[`3-etiquetar-todos-detalhe.png`](../../tests/e2e/out/verificacao-visual/3-etiquetar-todos-detalhe.png).

Observação de produto (não é falha do teste): “Etiquetar todos” posiciona a etiqueta no centro do elemento, então
em paredes ela cai sobre a hachura e fica pequena no zoom de enquadramento; o close mostra os textos legíveis.

### 4.4 Linha de detalhe: traço e seleção 1,7× — FAIL na seleção

Três linhas horizontais de 4 m (contínua, tracejada e pontilhada) em zoom 60. O perfil de tinta é medido na
captura, perpendicular ao traço (o alargamento na direção da linha fecharia os vãos e foi descartado).

| Critério | Esperado | Observado | Veredito | Motivo / captura |
|---|---|---|---|---|
| Contínua | 1 ciclo, ocupação ~100 % | 1 ciclo, 100,0 % | PASS | traço inteiro |
| Tracejada | ciclos de traço/vão (7/4 px) | 21 ciclos, 81,6 % | PASS | padrão visível e distinto |
| Pontilhada | pontos (1/3 px) | 57 ciclos, 74,9 % | PASS | padrão visível e distinto |
| Distinção | pontilhada com mais ciclos | 21 × 57 ciclos | PASS | — |
| **Seleção 1,7×** | traço 1,7× mais grosso, na cor de seleção | **0 px alterados, 0 azuis**; clique real seleciona (`selection=["dl-dash"]`, `hover="dl-dash"`) | **FAIL** | ver §5 |
| Erros de página | nenhum | 0 | PASS | — |

Capturas: [`4-linhas-detalhe.png`](../../tests/e2e/out/verificacao-visual/4-linhas-detalhe.png) ·
[`4-selecao-1.7x.png`](../../tests/e2e/out/verificacao-visual/4-selecao-1.7x.png) — os dois PNG são **byte a byte
iguais** (10 015 bytes cada), o que confirma a ausência de mudança visual.

### 4.5 Rótulos de corte/elevação — PASS

| Critério | Esperado | Observado | Veredito | Motivo / captura |
|---|---|---|---|---|
| Rótulo do corte | `A` nas duas pontas | 2 rótulos `A` | PASS | `placement: both` |
| Rótulo da elevação | `Sul` nas duas pontas | 2 rótulos `Sul` | PASS | `placement: both` |
| Linha de corte | traço-ponto | 34 ciclos, 81,9 % | PASS | padrão do corte |
| Linha de elevação | contínua | 1 ciclo, 100 % | PASS | padrão da elevação |
| Erros de página | nenhum | 0 | PASS | — |

Capturas: [`5-cortes-elevacoes.png`](../../tests/e2e/out/verificacao-visual/5-cortes-elevacoes.png),
[`5-cortes-elevacoes-detalhe.png`](../../tests/e2e/out/verificacao-visual/5-cortes-elevacoes-detalhe.png).

### 4.6 3D com caixas instanciadas — PASS

Casa 8 × 6 m com porta e janela, vista 3D, enquadrada por `ModelScene.fit()`.

| Critério | Esperado | Observado | Veredito | Motivo / captura |
|---|---|---|---|---|
| 3D aberto | vista 3D enquadrada | `view=3d`; caixa −0,09/−0,09/0,00 → 8,09/6,09/2,80 | PASS | modelo completo |
| Paredes retas instanciadas | ≥ 4 caixas de parede | **89 caixas** de parede em **6 `InstancedMesh`**; 3 malhas de parede fora do caminho instanciado | PASS | paredes retas viram caixas |
| Portas e janelas | caixas de porta e de janela | 4 peças de porta, 7 de janela | PASS | esquadrias também instanciadas |
| Silhueta | esconder a camada instanciada muda a imagem | **18,0 %** dos pixels mudam | PASS | a silhueta desenhada vem das caixas |
| Seleção | realce azul da parede selecionada | 44 712 px alterados, 42 134 azuis | PASS | realce sobreposto, modelo não refeito |
| Erros de página | nenhum | 0 | PASS | — |

Capturas: [`6-3d-caixas.png`](../../tests/e2e/out/verificacao-visual/6-3d-caixas.png),
[`6-3d-silhueta-sem-instancias.png`](../../tests/e2e/out/verificacao-visual/6-3d-silhueta-sem-instancias.png)
(camada instanciada oculta; restam as sobras/picking, por isso a imagem é de diagnóstico),
[`6-3d-selecao.png`](../../tests/e2e/out/verificacao-visual/6-3d-selecao.png).

## 5. O achado: seleção de linha de detalhe não chega ao desenho

**Reprodução:** item 4, zoom 60; clique real no meio da linha tracejada (mundo `2, 2`). A seleção é aplicada
(`useUi.selection = ["dl-dash"]`, `hover = "dl-dash"`) e a captura seguinte é **idêntica** à anterior (0 px
diferentes; arquivos com o mesmo tamanho). A linha não engrossa para 1,7× nem muda para a cor de seleção.

**Por que é defeito e não artefato do teste:**

1. O caminho existe: `packages/render/src/plan/notes.ts:75-78` desenha a linha com
   `espessuraVezes(projecao, 1.7)` e `look.select` quando `look.selection` contém o id.
2. Mas `buildPlanGeometry` passa a seleção filtrada por `planGeometrySelection`
   (`packages/render/src/plan/build.ts:114-122`), que só inclui **cotas**, **separadores de ambiente** e **vistas**.
   Linhas de detalhe não entram — e a chave da geometria (`planFrame.ts`) também não muda por causa delas.
3. A sobreposição (`buildPlanScreenOverlay`) não desenha as notas, então não há segundo caminho.
4. O controle do item 1 prova que o pipeline funciona: selecionar uma **cota** muda 1 282 px para azul. O problema
   é específico das linhas de detalhe. As regiões de detalhe seguem o mesmo filtro no código, mas a seleção delas
   não foi medida nesta rodada (o roteiro cobre a linha, que é o caso pedido).

**Próximo passo sugerido (fora do escopo do A2, que não altera produto):** incluir as linhas/regiões de detalhe na
seleção da geometria (ou desenhar o realce na sobreposição) e cobrir com o item 4 deste roteiro. É uma correção
pequena e localizada, mas mexe em `packages/render`, então precisa de dono e de orçamento de L1 (typecheck +
`node tests/e2e/verificacao-visual.mjs --item linhas` + baseline visual da vista afetada, sem tocar nas baselines
existentes).

## 6. Capturas geradas

Todas em `tests/e2e/out/verificacao-visual/` (22 PNG + `resultados.md` + `resumo.json`, ~0,6 MB):

```
1-cota-individual-z12.png          2-texto-caixa.png                 4-linhas-detalhe.png
1-cota-individual-z60.png          2-texto-caixa-detalhe.png         4-selecao-1.7x.png
1-cota-individual-z220.png         2-mascara-antes.png               5-cortes-elevacoes.png
1-cota-cadeia-z12.png              3-etiqueta-lider.png              5-cortes-elevacoes-detalhe.png
1-cota-cadeia-z60.png              3-etiqueta-lider-detalhe.png      6-3d-caixas.png
1-cota-cadeia-z220.png             3-etiquetar-todos.png             6-3d-selecao.png
1-controle-selecao-cota.png        3-etiquetar-todos-detalhe.png     6-3d-silhueta-sem-instancias.png
1-controle-selecao-cota-ativa.png  resultados.md · resumo.json
```

## 7. Limitações e o que ficou fora

- **1 FAIL de produto** (§5), com causa e próximo passo. Não foi “consertado” aqui de propósito: o brief do A2 é
  teste e documentação, sem alterar código de produto.
- **SwiftShader (WebGL2 por software), não RX 580.** As capturas provam comportamento e legibilidade, não pixels de
  GPU real. Por isso nenhum critério compara com baseline; números absolutos de ciclos/px podem variar alguns
  por cento em outra GPU/DPR.
- **Tema escuro, zoom além de 220, pranchas e DXF** não entram nesta rodada; o handoff pede só os itens acima.
- **3D:** a montagem é progressiva; o roteiro espera até 20 s por `InstancedMesh` + `bounds` e enquadra com
  `fit()`. Em máquina mais lenta, aumente o timeout do `waitForFunction` se necessário.
- **Etiquetas:** o comando “Etiquetar todos” foi exercitado pelo botão real da faixa (aba Anotar), não por chamada
  interna; o clique no DOM faz parte do critério.
- Nenhuma baseline antiga (`tests/e2e/baseline*`) foi lida, criada ou alterada; o build `dist` é local e não entra
  no commit (`.gitignore`).

## 8. Ligação com o board

Este documento fecha o item “Conferência visual” do handoff de inserção de 2026-10-26 (removido) §5/Passo 3 e a entrega do
**A2** no board (execução de subagentes de 2026-10-26, removida; §2/Squad 1). Para o gate **G1** falta o A1
(inserção/abertura) e a integração I1; o roteiro pode ser reexecutado no L1 de cada mudança visual com
`node tests/e2e/verificacao-visual.mjs` (≈1 min) e no L2 da fase junto do `visual-regression.mjs`.
