# Orbita 3D: medição de quadros (dev x produção) e atribuição de temporizadores

Gesto: Alt + botão esquerdo (órbita, `ViewportCanvas.tsx` `isOrbitReq`), 3 s de movimento contínuo, 8 px a cada ~16 ms, ida e volta. Chrome headless **sem GPU** (swiftshader). Um run por cenário; a amostra tem 15 a 72 quadros, então os percentis altos são instáveis.

## Tabela (passada sem instrumentação, "tempo")

| Id | Cenário | Níveis | Malhas visíveis | Triângulos | Quadros | p50 ms | p95 ms | p99 ms | máx ms | % > 33 ms | script ms/quadro | tarefa principal ms/quadro | thread principal % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | Produção (vite preview), predio10 | 10 | 24 | 194634 | 19 | 16.7 | 466.7 | 466.7 | 466.7 | 42.1 | 9.2 | 60.5 | 38.3 |
| B | Desenvolvimento (vite, 4802), predio10 | 10 | 24 | 194634 | 16 | 33.3 | 516.7 | 516.7 | 516.7 | 56.3 | 24.3 | 56.3 | 29.5 |
| C | Produção, projeto real (maior arquivo; nome omitido) | 2 | 15 | 3182 | 51 | 49.9 | 200 | 400 | 400 | 51 | 5.4 | 14.5 | 24.3 |

## Contadores do renderer (passada com `?perf=1`, só para contagens)

| Id | Quadros | p50 | p95 | máx | % > 33 | script ms/quadro | draw calls (mediana/quadro) | triângulos (mediana/quadro) | rebuilds (total) |
|---|---|---|---|---|---|---|---|---|---|
| A | 18 | 16.7 | 500 | 500 | 50 | 11.1 | 74.5 | 194674 | 6 |
| B | 15 | 349.9 | 400.1 | 400.1 | 66.7 | 25.6 | 89 | 194674 | 6 |
| C | 72 | 16.8 | 100.1 | 149.9 | 50 | 4.9 | 25 | 3190 | 6 |

## Temporizadores e rebuilds durante a órbita

### A: 310 callbacks na janela, soma 138.3 ms, 0 rebuilds na janela

| soma ms | n | max ms | tipo / atraso | origem |
|---|---|---|---|---|
| 85.5 | 1 | 85.5 | raf / 0 | `()=>{yc.current.frame=0;const Ne=yc.current.at,xt=r();if(!Ne\|\|xt.view!=="3d")return;if(xt.` |
| 45.5 | 10 | 8.4 | raf / 0 | `()=>DRo(No)` |
| 4.8 | 278 | 0.1 | setTimeout / 4 | `function a(){switch(t.clientWaitSync(e,t.SYNC_FLUSH_COMMANDS_BIT,0)){case t.WAIT_FAILED:i(` |
| 2.5 | 21 | 0.4 | raf / 0 | `() => { const s = window.__hestiaPerf.snapshot(); if (W.ultimo && s.total.rebuilds !== W.u` |

### B: 51 callbacks na janela, soma 140.8 ms, 0 rebuilds na janela

| soma ms | n | max ms | tipo / atraso | origem |
|---|---|---|---|---|
| 91.1 | 1 | 91.1 | raf / 0 | `() => { hover3d.current.frame = 0; const at = hover3d.current.at; const stNow = paneState(` |
| 47 | 11 | 5.4 | raf / 0 | `() => medirQuadro(renderQuadro)` |
| 2 | 21 | 0.3 | raf / 0 | `() => { const s = window.__hestiaPerf.snapshot(); if (W.ultimo && s.total.rebuilds !== W.u` |
| 0.7 | 18 | 0.2 | setTimeout / 4 | `function probe() { switch (gl.clientWaitSync(sync, gl.SYNC_FLUSH_COMMANDS_BIT, 0)) { case ` |

- Rebuilds: em A e B o vigia de rebuild não registrou nenhum durante os 3 s de órbita. Os 6 rebuilds da sessão (geometria 1, sobreposição 3, guarda-corpo 1, massa 1) acontecem antes do arrasto, na montagem da cena. O gatilho exato não foi identificado.
- O LoAF de A (`loafLongos`) cobre a sessão inteira, inclusive o carregamento. Os 922 ms de `TimerHandler:setTimeout` citados antes vêm dessa janela, não da órbita: dentro da órbita, todos os callbacks somam ~140 ms.
- Callback mais caro: `hover3d` (`ViewportCanvas.tsx:987`, requestAnimationFrame do pick de hover em 3D). Chama `pickFace`, uma vez, ~85 a 91 ms. Acontece no primeiro movimento do ponteiro antes do arrasto.
- Segundo: `render = () => medirQuadro(renderQuadro)` (`ViewportCanvas.tsx:753`, desenho do quadro 3D em `ViewportCanvas.tsx:465`), 10 a 11 chamadas, ~45 a 47 ms somados, ~4 a 5 ms cada.
- Terceiro: polling `clientWaitSync` por `setTimeout` (`node_modules/three/src/renderers/webgl-fallback/utils/WebGLUtils.js:279-281`, `_clientWaitAsync`). É a leitura assíncrona do pick por ID (`packages/render/src/model3d/pickIdBuffer3d.ts:412-413`). Muitas chamadas (278 em A, 18 em B), custo pequeno (4,8 ms em A, 0,7 ms em B).

## Diferença dev x produção

- Em A (produção) o script por quadro foi ~9 ms; em B (dev) foi ~24 ms na passada "tempo" e ~26 ms na passada de contadores (A: ~11 ms). Dev gasta mais CPU por quadro, de forma consistente nas duas passadas.
- Os callbacks da janela são os mesmos nos dois ambientes (hover de ~90 ms, render ~45 ms). A diferença do quadro está no restante do script, que não foi atribuído.
- Os picos de 400 a 520 ms (p95 e máximo) aparecem em A e em B. Os callbacks somam só ~140 ms na janela. O resto do tempo do quadro não é JavaScript nos callbacks medidos: é desenho ou rasterização no swiftshader, ou trabalho fora do JS que não foi medido.

## Projeto real (C)

- O maior arquivo tem 2 níveis e ~3 mil triângulos visíveis (15 malhas). É uma cena pequena. Ele carregou sem erro (`editor.load(migrateProject(...))`), e só a contagem agregada foi registrada; nome e caminho não entraram nos resultados.
- Passada de tempo: 51 quadros, p50 49,9 ms, p95 200 ms, 51% acima de 33 ms (pior p50 que A, mas com cena de 15 malhas e 3 mil triângulos). Passada de contadores: 72 quadros, p50 16,8 ms, p95 100 ms. A diferença entre as duas passadas mostra o ruído de uma amostra curta; C não representa o caso de lag relatado.

## Limites

- Chrome headless sem GPU: o custo de GPU e de rasterização real não é mensurável. O que aparece como "não JS" pode ser isso.
- Um run por cenário; amostras de 15 a 72 quadros. Máquina compartilhada com outros executores (fila do guarda). Os percentis altos são instáveis.
- `paredes` e `porTipo` saíram vazios: a contagem por nível não encontrou as paredes. A contagem de malhas e triângulos é a da cena 3D.
- A passada de contadores usa `?perf=1`, que pesa na CPU; ela serve para contagem, não para tempo.
- A atribuição dos temporizadores (`orbita3d-timers.mjs`) usa a passada de contadores. Em produção os nomes estão minificados; em dev, os nomes aparecem.

## Reproduzir

- Produção: `npm run build` e `cd apps/web && npx vite preview --port 4801 --strictPort`
- Dev: `cd apps/web && npx vite --port 4802 --strictPort`
- Medição: `PERF_URL=http://127.0.0.1:4801/ PERF_CENARIO=A PERF_PROJETO=predio10 PERF_OUT=saida.json node tests/perf/orbita3d.mjs` (rodar pelo `~/hestia-tools/pesado.sh`)
- Atribuição: `node tests/perf/orbita3d-timers.mjs` (mesmas variáveis)
- Projeto real: `PERF_PROJETO=arquivo:/caminho/projeto.hestia.json` (lido por caminho; nada é gravado no repositório)
