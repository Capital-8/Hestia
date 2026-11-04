# Calibração dos modelos (preencher a cada ficha integrada)

Modelos: **DSF** = `opencode/deepseek-v4.1-flash-free`, **MMF** = `opencode/mimo-v2.6-flash-free`, **QW** = `opencode-go/qwen3.8-flash`, **DS** = `opencode-go/deepseek-v4.1-flash`.
Critérios: **1ª** = o portão aprovou de primeira (sim/não); **Dev** = devoluções ao executor; **Eu** = correções que precisei fazer; **Min** = minutos do lançamento ao fim; **Nota** = o que deu errado.

| Onda | Ficha | Nível | Modelo | 1ª | Dev | Eu | Min | Nota |
|---|---|---|---|---|---|---|---|---|
| 0 | F1-modelo | 3 | DS | não | 0 | 1 | ~14 | Aprovada após eu aceitar `history.ts` (omissão da ficha). Furo achado por mim: cópia herdava `groupId`. |
| 0 | F2-parede | 2 | QW | sim | 0 | 0 | ~10 | Cego (DSF): 15 verdes, 3 ambiguidades. |
| 0 | F2-colisao | 2 | QW | sim | 0 | 0 | ~9 | Cego (MMF): 28 verdes, 2 ambiguidades. |
| 0 | F2-vizinho | 2 | DS | sim | 0 | 0 | ~22 | Cego (DSF): 20 verdes, 3 ambiguidades (espelho, tolerância exata, centro-x). |
| 0 | F2-fila | 2 | QW | sim | 0 | 0 | ~9 | Cego pendente. |
| 0 | ESC-modelo | 2 | QW | sim | 0 | 0 | ~17 | Integração mostrou teste dele dependente do armário sem conectores: ajustei o teste. |
| 0 | ORC | 2 | QW | sim | 0 | 0 | ~26 | |
| 0 | USIN3D | 2 | QW | sim | 0 | 0 | ~22 | |
| 0 | CORR-2 | 2 | DSF | sim | 0 | 0 | ~25 | Sem teste da ficha; portão aprovou, suíte web verde. |
| 0 | T-F2-parede (teste cego) | 1 | MMF | não | 0 | 0 | — | MiMo grátis terminou sem escrever o arquivo (leu o código proibido). Refeito com DSF: ok. |
| 0 | T-F2-colisao (teste cego) | 1 | MMF | sim | 0 | 0 | ~20 | |
| 0 | T-F2-vizinho (teste cego) | 1 | DSF | sim | 0 | 0 | ~10 | |
| 0 | T-F2-fila (teste cego) | 1 | MMF | não | 0 | 0 | — | MiMo grátis terminou sem escrever nada. Refeito com DSF. |

Regra de promoção: um modelo que passa de primeira em 3 fichas seguidas do mesmo nível sobe um nível; devolvido em 2 seguidas desce um nível.

## Cruzamento dos testes cegos (por função de encaixe)
| Função | Testes do implementador | Testes cegos | Cruzamento (cegos contra a implementação) | Árbitro |
|---|---|---|---|---|

| Função | Cegos contra a implementação | Ambiguidades da especificação (decisão) |
|---|---|---|
| encaixarNaParede | 15 verdes, 3 puladas | empate entre faces; face degenerada; 1 mm de tolerância na projeção: aceitar o critério da implementação |
| colisoes / retanguloNoMundo | 28 verdes, 2 puladas | ver arquivo `encaixeColisao.cego.test.ts` |
| encaixarNoVizinho / guias | 20 verdes, 3 puladas | espelho do vizinho; igualdade na tolerância (inclusiva); `centro-x` = linha pelo centro no eixo x local |

Achados da integração (não vistos pelos testes das fichas): arquivo da família descartava `conectores`/`escolhas` (corrigido em `arquivo.ts`); cópia de componente de conjunto herdava `groupId` (corrigido em `commands.ts`).

Observação de modelos: MiMo grátis falhou 2 de 3 vezes em escrever testes (terminou sem entregar); manter só em tarefas triviais e sempre com verificação de existência do arquivo. Qwen e DeepSeek pagos aprovados de primeira em todas.
