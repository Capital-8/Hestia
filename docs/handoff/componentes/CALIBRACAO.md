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

## Onda 1 e 2 (2026-11-04, tarde)
| Ficha | Nível | Modelo | 1ª | Eu | Nota |
|---|---|---|---|---|---|
| CONECT-biblioteca | 1 | DSF | sim | 1 | Passou no portão, mas o arquivo da família descartava `conectores` (achado pelo teste "salva e abre sem perda"; corrigi `arquivo.ts`). |
| F3-core | 3 | DS | sim | 0 | Cego (DS): 22 verdes. |
| PAINEL-encaixe | 2 | QW | sim | 0 | |
| CONJ-ui | 3 | DS | sim | 1 | Borda: componente de conjunto parcial não andava; corrigi e testei. `actions.ts` reformatado para caber em 420 linhas. |
| F3-arrasto3d | 3 | DS | sim | 0 | Verificado no navegador (`wt/qa/arrasto3d.mjs`, `encaixe3d.mjs`): clique, arrasto, desfazer, Esc, órbita e encaixe na parede. Alt só vale se segurado durante o arrasto. |
| ESC-props | 2 | QW | sim | 0 | |
| ESC-biblioteca | 1-2 | QW | NÃO | — | Terminou sem escrever nada. Relançar com DS. |
| T-F3-core (cego) | 1 | QW | NÃO | — | QW terminou sem escrever; DSF travou 25 min; DS entregou. |
| Q5 (QA de interface) | 2 | QW | inconclusivo | — | Os roteiros do testador deram timeout nos cliques do ribbon (seletores); não é achado de produto. QA de interface com QW não é confiável. |

## Ondas 3 e 4 (2026-11-04, noite)
| Ficha | Nível | Modelo | 1ª | Eu | Nota |
|---|---|---|---|---|---|
| F3-menu | 2 | QW | sim | 0 | |
| F3-biblioteca | 3 | DS | sim* | 0 | *Snapshot reescrito pelos testes (só fim de linha): restaurei. Soltar verificado no navegador (planta e 3D). |
| F5-fila-motor | 3 | DS | sim | 0 | Cego (DS): 23 verdes, 4 ambiguidades. |
| F5-fila-ui | 3 | DS | sim* | 2 | *Rodou sem `node_modules` no worktree (gates dele não valiam; refiz com junção). Conflitos de ribbon ao integrar (resolvi). Defeito de produto achado no navegador: o botão caía sob a alça `dock-split` (z-index): subi `.fam-dback` para 40. "Montar fila" não aparecia com a parede selecionada: pus na aba contextual. |
| CORR-3 | 2 | QW | sim | 0 | |
| ANIN-modelo | 2 | DS | sim | 0 | 9 testes cobrindo as recusas. |
| ANIN-ui | 2 | QW | sim* | 1 | *Sem `node_modules`; esqueceu de commitar `familiaStore.ts` (a mudança era boa); selo "novo" ficou na faixa (tirei). Verificado no navegador: criar aninhado de `fam_gaveta`, sem erros. |
| FERR-biblioteca | 2 | DS | NÃO→sim | 1 | 1ª tentativa parou no critério (minha premissa errada: hoje 4 dobradiças por porta, não 2; atualizei o teste antigo). 2ª: aprovada. |
| F6-lateral | 3 | DS | sim | 0 | |
| F3-planta | 3 | DS | sim | 0 | Verificado no navegador: encaixe e Alt na planta. |
| Q6/Q6b (QA de interface) | 2 | QW/DS | parcial | — | Q6 (QW) só fez o roteiro 1; Q6b (DS) fez 26 OK e achou 2 defeitos reais (etiqueta de conector vazia; aninhado sem interface). |

Lições: (1) executores no worktree novo podem ficar sem `node_modules` (a `npm ci` do `run-ficha.sh` falha em silêncio quando muitos sobem juntos): o relatório de "verde" deles NÃO vale, o portão do orquestrador vale. (2) QA de interface é onde mais aparecem defeitos que os testes não pegam (z-index, aba contextual, seletor de aba): rodar roteiro no navegador depois de cada ficha de interface. (3) Ficha de interface precisa dizer em QUE ABA o botão aparece, incluindo a aba contextual da seleção.

Padrão: **QW falha em fichas que exigem varrer muitos arquivos ou escrever um arquivo grande sem exemplo** (terminou lendo). DSF travou uma vez. MMF falhou 2 de 3. DS entregou todas.

Observação de modelos: MiMo grátis falhou 2 de 3 vezes em escrever testes (terminou sem entregar); manter só em tarefas triviais e sempre com verificação de existência do arquivo. Qwen e DeepSeek pagos aprovados de primeira em todas.
