# Relatório do E2E do terreno e do lote (ficha Q1b)

Data: 2026-11-15. Branch `terreno/Q1b`. Roteiro: B.5 do PLANO, automatizado em `tests/e2e/terreno.mjs` (módulos `terreno-base`, `terreno-servidor`, `terreno-passos-a` a `-d` e `terreno-medicoes`). Comando: `npm run build && node tests/e2e/terreno.mjs`.

## Como o E2E roda

- Chromium do sistema (`/opt/pw-browsers/chromium`, SwiftShader), `deviceScaleFactor: 1`, viewport 1760 x 960, build de produção (`apps/web/dist`), `?debug=1&gl=1`.
- **O build é servido por HTTP, não por `file://`.** O kernel Rust (WASM) só carrega por HTTP (`fetch` de `file://` é bloqueado no Chrome) e o terreno depende do kernel; por `file://` o app sequer abre um projeto (ver defeito D7). `terreno-servidor.mjs` é um servidor estático mínimo que responde 204 ao `/favicon.ico` (o Chromium o pede sozinho e o 404 viraria erro de console sem relação com o terreno).
- Os passos centrais passam pela interface (faixa, diálogos, modo Editar terreno, campos, teclas, mouse). Ganchos de `window.__hestia` só onde indicado: `zoomToBox`/`zoomExtents` para enquadrar a planta de forma repetível, a criação da prancha vazia (`addSheet`), a laje (`perimetroPorPontos`, o mesmo auxiliar dos outros E2E) e o terreno de 50 mil vértices.
- Erros de console: capturados da sessão inteira (console `error`, `pageerror` e respostas HTTP >= 400). Resultado final: **nenhum erro**.

## Resultado por passo do roteiro B.5

| # | Passo | Resultado | Como foi feito | O que a captura mostra |
|---|---|---|---|---|
| 1 | Gerenciar › Localização: norte 30°, altitude 740 | passou | interface (aba Gerenciar, botão Localização, campos, Aplicar) | `01-localizacao.png`: diálogo com 740 m e 30,0000° preenchidos; gravado `cotaZero 740`, `norteVerdadeiro` = π/6. |
| 2 | Importar levantamento DXF; curvas na planta e terreno no 3D | passou (depois das correções D1 e D2) | interface (Topografia ▾ › Importar levantamento…, campo de arquivo, Importar) | `02-importado-planta.png`: 12 curvas fechadas concêntricas (morro), barra de status com `z terreno 742,53 m`. `02-importado-3d.png`: disco de terreno areia com saia e borda, sem o resto do modelo. O diálogo lê 12 curvas de cota constante e 40 pontos, faixa 741,00 a 752,40 m (já com a localização). |
| 3 | Editar terreno: +2 m num ponto; curvas se redesenham; Ctrl+Z | passou | interface (Editar terreno, clique no ponto, campo Cota, Ctrl+Z) | `03-edicao.png`: alças em todos os vértices, ponto escolhido (campo Cota 744,812 após +2), curva local deformada; Ctrl+Z devolve a cota original exata. |
| 4 | Rótulo de curva (valor = z + 740) e corte com solo | passou (depois da correção D3; hachura ver D8) | interface (Rótulo de curva, 2 cliques; Vista › Corte, 2 cliques) | `04-rotulos.png`: rótulo `750,00 m` alinhado à curva mestra (z=10, + 740). `04-corte.png`: perfil do morro, solo cortado preenchido em areia, linhas de nível tracejadas; **o solo é cor sólida, sem hachura** (D8). |
| 5 | Plataforma 10 x 10 no meio, 1 m abaixo da cota local | passou | interface (cota local lida na barra de status 752,29; Plataforma, campo Cota 751,29, 4 cliques, Enter) | `05-plataforma-corte.png` (aproximada) e `05-plataforma-corte-geral.png`: degrau retangular de paredes verticais no topo do morro e o perfil existente tracejado acima. |
| 6 | Corte e aterro: tabela e mapa | passou (depois da correção D4) | interface (Corte e aterro; Mapa de corte e aterro) | `06-tabela-corte-aterro.png`: Plataforma 1, área 100,94 m², corte 95,544 m³, aterro 0, e totais. `06-mapa.png`: a plataforma pintada de vermelho (corte). A coluna Saldo fica cortada à direita (D9). |
| 7 | Linhas de propriedade › Por tabela: 12 x 30, fechamento 0, recuos 5/1,5/3, edificável 198 m² | passou (depois da correção D5) | interface (menu Linhas de propriedade ▾, tabela de rumos, painel de propriedades do lote) | `07-lote.png`: lote azul (selecionado) girado 30° pelo norte verdadeiro, edificável tracejada, painel com área 360 m², edificável 198,00 m², lados Frente 5 / Lateral 1,5 / Fundo 3 / Lateral 1,5. Erro de fechamento `0,00 m`. Primeiro lado a 120,000° (azimute 90° + norte 30°, regra E4). |
| 8 | Laje 9 x 10 no lote; taxa de ocupação 25 % | passou | laje por gancho (`perimetroPorPontos`); tabela pela interface (Índices do lote) | `08-indices.png`: Lote 1, área 360,00, edificável 198,00, projeção 90,00, construída 90,00, **taxa de ocupação 25,00 %**, coeficiente 0,25. |
| 9 | Gravidade: `baseOffset` = cota do terreno no 1º clique | passou | interface (botão Gravidade da barra de status, ferramenta Parede, 2 cliques) | `09-gravidade.png`: painel da parede com Desloc. da base 7,2271 m (terreno lido na barra: 747,23 m, ou 7,23 m no projeto; diferença de 3 mm, do arredondamento do clique). `09-gravidade-3d.png`: a parede (azul) sobre a superfície do terreno. |
| 10 | Prancha com planta, corte e 3D; salvar e reabrir; kernel desligado; console limpo | passou, **menos "kernel desligado" (não deu para testar em produção, ver D7)** | prancha vazia por gancho, vistas pelo diálogo Adicionar vistas (1:500, folha A1), Ctrl+S › Baixar arquivo, reabrir por `#file-open` | `10-prancha.png` e `10-prancha-folha.png`: três vistas na folha (planta com curvas, mapa vermelho, lote e laje; corte; 3D em disco). Os traços saem em cada vista (91 / 7 / 288 caminhos). Salvar e reabrir: localização, pranchas, vistas, terreno, região, lote, parede e laje idênticos; `10-reaberto-planta.png`. |
| 10 (kernel desligado) | aviso e borda de reserva sem travar | **verificado só no servidor de desenvolvimento** com `?kernel=ts` | script avulso (não faz parte do E2E, ver D7) | `10-sem-kernel-planta.png`: só a borda tracejada de reserva, e na barra de status `1 aviso`. `10-sem-kernel-3d.png`: borda tracejada de reserva no 3D, o app responde. |

Observação: o passo 4 do plano fala em "cruzando 3 curvas mestras". O levantamento tem 12 curvas e `mestraCada = 5`, então só duas são mestras (z = 5 e z = 10, exibidas 745 e 750). O teste cruza as duas.

## Tempos medidos no navegador (SwiftShader, sem GPU; alvo, não bloqueio)

Método: capturas seguidas da área da vista até ela parar de mudar (resolução ~100 ms, custo de cada captura); valem como ordem de grandeza.

| Medida | Resultado | Alvo (A.8 item 5) |
|---|---|---|
| Primeiro desenho da planta com o terreno importado (328 vértices), do clique em Importar | 0,49 s (0,38 a 0,55 s nas rodadas) | n/d |
| Abertura da vista 3D com o terreno importado | 1,20 s (1,0 a 1,3 s; inclui subir o WebGL) | n/d |
| Abertura do corte (2º clique até o perfil parar de mudar) | 0,64 s (0,52 a 0,72 s) | `terreno_corte` <= 50 ms no kernel |
| Terreno de 50 176 vértices: da criação (comandos + kernel) até a planta parar de mudar | 0,97 s (0,97 a 1,15 s) | primeira malha <= 1,5 s |
| Terreno de 50 176 vértices: abertura do 3D | 1,78 s (1,8 a 2,3 s) | n/d |

Capturas do terreno grande: `11-terreno-grande-planta.png` (curvas de um relevo ondulado, borda quadrada) e `11-terreno-grande-3d.png` (superfície ondulada com saia).

## Defeitos encontrados

| # | Sintoma | Causa | Estado |
|---|---|---|---|
| D1 | A barra de navegação (Aproximar, Afastar, **Enquadrar tudo**) não responde ao mouse de verdade, na planta e no 3D. Só funciona com `.click()` de script. | A barra mora dentro de `.canvas-wrap`, que captura o ponteiro no `pointerdown`; com a captura o `click` é redirecionado ao `.canvas-wrap` e o botão nunca o recebe. O ViewCube já tinha `stopPropagation`; a barra não. Pré-existente e fora do terreno, mas bloqueava "Enquadrar tudo" no roteiro. | **Corrigido** em `ViewportCanvas.tsx` (`onDown`/`onUp` ignoram o ponteiro vindo da barra) com `controlesDaVista.ts` e seu teste. O E2E clica a barra de verdade (passo 2). |
| D2 | **Com um terreno no projeto, a vista 3D fica toda em branco** (nem grade nem paredes). Aconteceu também com a casa de exemplo + terreno. | A neblina da cena é fixa (60 a 170 m). O "Enquadrar" de um terreno de ~100 m põe a câmera a ~290 m, além da neblina: tudo se dissolve no fundo. | **Corrigido** em `scene3d.ts`: a neblina cresce com o tamanho do modelo (`near >= 2,5 x` e `far >= 6 x` a diagonal; sem terreno continua 60/170). Teste `neblinaTerreno.test.ts`. |
| D3 | Rótulo de curva repetido: `750,00 m` aparecia 4 vezes (2 por cruzamento) e `745,00 m` 2 vezes (devia ser 1: o cruzamento cai no fim da linha). | Cruzamento exatamente num vértice da curva acerta os dois segmentos vizinhos e gerava dois rótulos no mesmo ponto. | **Corrigido** em `terrenoRotulos.ts` (deduplica por posição). Teste `terrenoRotulosVertice.test.ts`. |
| D4 | O botão **Mapa de corte e aterro** liga, mas a planta não pinta o mapa até que algo mude no projeto. | O ESTADO registra que o fiscal incluiu `mapaCorteAterro` na chave do `QuadroPlanta`, mas a `geometryKey` do `PlanFrame` (que decide refazer a geometria da camada de terreno) não leva o estado do mapa. | **Corrigido** em `planFrame.ts` (a chave inclui `mapaCorteAterroLigado()` quando há terreno). Teste `planFrameMapa.test.ts`. |
| D5 | "Enquadrar tudo" não mostra o lote: num projeto só com lote a planta fica no enquadramento padrão (5; 3,5), fora do lote. | O lote não entra em `extensaoDoModelo` (de propósito, não aparece em corte nem elevação), e a caixa da planta (`levelFrameBox`) vem dela. | **Corrigido** em `molduraDoNivel.ts`: a caixa da planta soma o contorno dos lotes do nível; a das elevações, não. Teste `frameBoxLote.test.ts`. |
| D6 | **Intermitente:** depois de um zoom, os rótulos HTML da planta (cotas, rótulos de curva) podem ficar escondidos até o próximo movimento do mouse (em 4 de 4 tentativas, 2 ficaram `display: none`). | `renderQuadro` publica os rótulos novos por estado do React e chama `syncView` com o conjunto ANTIGO; o conjunto novo só é alinhado no quadro seguinte, que pode não vir. Código genérico de `PlanLabels.tsx`/`ViewportCanvas.tsx`, não da frente do terreno. | **Não corrigido** (fora da frente). Correção sugerida: `useLayoutEffect` em `PlanLabels` chamando o alinhamento com `v` quando `labels` muda. O E2E move o mouse antes de conferir. |
| D7 | Sem o kernel (WASM que não carrega: build aberto por `file://`, ou wasm bloqueado) o app **não abre nenhum projeto**: `Novo projeto` dispara `ErroDespachoKernel: kernel Rust (fatia A, nível lv_0): kernel indisponível`, a tela de projetos continua. | O kernel Rust é obrigatório em produção desde 2026-11-06 e a resolução do nível (paredes) lança sem ele. Não é do terreno. Com `?kernel=ts` (só em desenvolvimento) o terreno degrada como o plano manda: borda de reserva e aviso. | **Não corrigido** (kernel, outra frente). Por isso o E2E não testa "desligar o kernel" em produção; o caso foi visto no servidor de desenvolvimento (capturas `10-sem-kernel-*.png`). Os E2E antigos que abrem o `dist` por `file://` provavelmente já estão quebrados por isso. |
| D8 | O solo do corte não tem hachura. | Por projeto (V3): "hachura do material, senão cor sólida". A biblioteca não tem material de terra/solo (os materiais com hachura são reboco, bloco, concreto...), então o terreno nunca sai hachurado. O roteiro B.5 pede hachura. | **Não corrigido** (decisão de produto: criar um material "Terra"/"Solo" ou dar hachura padrão ao solo). |
| D9 | A tabela Corte e aterro tem a coluna Saldo cortada: a tabela tem largura mínima 880 px e o diálogo 860 px (rola na horizontal). | `.wsched { min-width: 880px }` contra `.dialog { width: 860px }`. | **Não corrigido** (cosmético; o scroll existe). |

Observações que não são defeitos do terreno: o clique na planta passa por snap (o contorno da plataforma saiu 10,094 m de largura, área 100,94 m²); o diálogo Adicionar vistas da prancha usa uma escala só para todas as vistas e com a automática (1:20) não cabe: foi preciso 1:500 e folha A1 para as três vistas.

## O que NÃO foi feito ou não deu para testar

- Desligar o kernel em produção (D7).
- Hachura do solo no corte (D8): não há material de solo; só se vê cor sólida.
- A.8 itens 1 a 9 marcados um a um, checklists de paridade e decisão `docs/decisoes/00NN` ficam para o restante da ficha Q1.
- Teste de tremor entre plataforma e laje no 3D (A.8 item 6): a plataforma foi vista no 3D (`09-gravidade-3d.png` mostra a depressão no topo do morro) mas não houve laje sobre ela.
- Seleção por clique/caixa de terreno e lote no corte, Alinhar e Colar do terreno: fora do roteiro B.5.
- Mapa de corte e aterro nas pranchas: a prancha mostrou o mapa ligado (vermelho); a liga é global (limite já registrado na ficha U2).

## Comandos finais

`npm run typecheck` sem erros; `npm run lint` 0 erros (8 avisos de base); `npm run test:rapido` 1055 arquivos / 12 137 testes verdes; `node scripts/check-lixo.mjs` limpo; `node tests/e2e/terreno.mjs` sai com código 0 (13 passos e medição passando, nenhum erro de console).
