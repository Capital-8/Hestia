# Calibração dos modelos (preencher a cada ficha integrada)

Modelos: **DSF** = `opencode/deepseek-v4.1-flash-free`, **MMF** = `opencode/mimo-v2.6-flash-free`, **QW** = `opencode-go/qwen3.8-flash`, **DS** = `opencode-go/deepseek-v4.1-flash`.
Critérios: **1ª** = o portão aprovou de primeira (sim/não); **Dev** = devoluções ao executor; **Eu** = correções que precisei fazer; **Min** = minutos do lançamento ao fim; **Nota** = o que deu errado.

| Onda | Ficha | Nível | Modelo | 1ª | Dev | Eu | Min | Nota |
|---|---|---|---|---|---|---|---|---|
| 0 | F1-modelo | 3 | DS | | | | | |
| 0 | F2-parede | 2 | QW | | | | | |
| 0 | F2-colisao | 2 | QW | | | | | |
| 0 | F2-vizinho | 2 | DS | | | | | |
| 0 | F2-fila | 2 | QW | | | | | |
| 0 | ESC-modelo | 2 | QW | | | | | |
| 0 | ORC | 2 | QW | | | | | |
| 0 | USIN3D | 2 | QW | | | | | |
| 0 | CORR-2 | 2 | DSF | | | | | |
| 0 | T-F2-parede (teste cego) | 1 | MMF | | | | | |
| 0 | T-F2-colisao (teste cego) | 1 | MMF | | | | | |
| 0 | T-F2-vizinho (teste cego) | 1 | DSF | | | | | |
| 0 | T-F2-fila (teste cego) | 1 | MMF | | | | | |

Regra de promoção: um modelo que passa de primeira em 3 fichas seguidas do mesmo nível sobe um nível; devolvido em 2 seguidas desce um nível.

## Cruzamento dos testes cegos (por função de encaixe)
| Função | Testes do implementador | Testes cegos | Cruzamento (cegos contra a implementação) | Árbitro |
|---|---|---|---|---|
