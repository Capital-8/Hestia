# Sondagem: junções entre paredes de inclinações diferentes (pf/fprobe)

Teste: `packages/render/src/model3d/wallTiltDiferentes.probe.test.ts` (19 testes, todos verdes). t=0,2, H=3, paredes de 4 m, funções de produção (`junctionLevel`, `wallLayerSolid`, `wallTiltJoinIssues`). Esperado por fórmula à mão: nó = cruzamento dos eixos deslocados z·tanθ; volume = ∫ t/cosθ · comprimento do eixo entre nós dz (Simpson de 3 níveis). Fresta = distância (Hausdorff) entre os pontos dos dois sólidos na junção em z=0/1,5/3, incluindo cruzamentos de arestas com o plano.

| Caso | Malha fechada / normais | Volume medido vs esperado | Fresta z=0 / 1,5 / 3 | Avisos |
|---|---|---|---|---|
| C1 -20/-15 | sim / 100% | 4,442930 = esperado (2e-16) | 0 / 0 / 0 | nenhum |
| C1 +20/-15, -20/+15 | sim / 100% | 5,121187 e 4,956192 = esperado | 0 / 0 / 0 | nenhum |
| C1 -20/-20, -15/-15 (controle) | sim / 100% | 4,410861 e 4,470003 = esperado | 0 / 0 / 0 | nenhum |
| C2 rampa -11,3099/-8,5308 e as 4 variações | sim / 100% | 4,554692; 4,918719; 4,830039; 4,527929; 4,580679 = esperado | 0 / 0 / 0 | nenhum |
| C3 colineares -20/-15 | sim / 100% | 5,038689 = esperado | 0,0029 / 0,1469 / 0,2910 | `inclinacaoInviavelNaJuncao` em A e B |
| C4 anel -20,-15,-20,-15 | 4 de 4 / 100% | 11,218087 = esperado | 4 cantos: 0 / 0 / 0 | nenhum |
| C4 anel todas -15 | 4 de 4 / 100% | 10,693610 = esperado | 4 cantos: 0 / 0 / 0 | nenhum |
| C5 T host -20, ramo -15 | sim / 100% | 5,967563 = esperado | ponta do ramo a 0 do plano da face (z=0/1,5/3) | nenhum |
| C5 T host -15, ramo -20 | sim / 100% | 5,833042 = esperado | idem, 0 | nenhum |
| C6 2 arcos r=3, -20/-15 | sim / 100% | 9,991320 vs 9,992651 (1,3e-4, tesselação) | 0,0029 / 0,1469 / 0,2910 nas 2 tangências | `arcoInclinadoSemJuncao` em A e B |
| C7 agudo 60°, -20/-15 | sim / 100% | 4,005361 = esperado | 0 / 0 / 0 | nenhum |
| C7 obtuso 120°, -20/-15 | sim / 100% | 4,696169 = esperado | 0 / 0 / 0 | nenhum |

Notas de leitura:
- Rampa -20%/-15% (C2) é só tilt de -11,3099 e -8,5308 graus: o comportamento é o mesmo de C1, sem fresta. Quem digitar "%" como grau recebe 20° e 15°; a UI não tem campo de rampa.
- Cantos (C1, C2, C4, C7) e T (C5): inclinações diferentes, de sinais iguais ou opostos, não deixam fresta nem sobreposição (o nó é o cruzamento dos eixos por nível e a esquadria é refeita em z=0 e z=3). A fresta medida em C3/C6 em z=0 (0,0029) e a metade da diferença de largura t/cos20 - t/cos15 (0,2128 - 0,2071), não é fresta de verdade.
- C3 (colineares): degrau lateral no topo de 0,2881 m (centro a centro, = 3·(tan20-tan15)); a medida 0,2910 inclui a meia diferença de largura. Como a espessura horizontal é 0,21 m, as faces de topo das duas paredes ficam disjuntas no topo (ressalto aberto, sem sobreposição), e em z=1,5 o degrau é 0,144. O código não funde nem corrige: cada parede termina em corte simples vertical na junção e o aviso `inclinacaoInviavelNaJuncao` aparece (eixos paralelos, sem cruzamento).
- C6 (arcos): degrau idêntico de 0,2881 nas duas tangências, sem fresta em x, sem sobreposição; aviso `arcoInclinadoSemJuncao` (plano B da E4 faz exatamente isso). Volume do arco confere à tesselação.

## Falhas
Nenhuma falha de malha, normais, volume ou NaN. Nenhum `it.fails`. Os únicos comportamentos de risco são os degraus de C3 e C6, que são o esperado (e documentado) do plano B / corte simples, não bugs.

Causa do degrau em C3 (para registro): `analyzeLevelTilt` em `wallTiltJoinLevel.ts` só monta junção por nível quando os eixos deslocados se cruzam; com direções paralelas e tilts diferentes não há cruzamento, o par vira `inclinacaoInviavelNaJuncao` e cada parede usa o corte vertical simples da F2.3, de modo que a diferença z·(tan20-tan15) aparece inteira como ressalto no topo.

Causa do degrau em C6: a E4 reprovou a junção exata com arco (S1: o caminho do canto não é suave em z) e adotou `wallTiltJoinPlanoB`; as pontas de arco inclinado ficam com corte de topo simples e o aviso `arcoInclinadoSemJuncao`.
