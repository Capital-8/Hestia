# Plano de execução com os modelos baratos do opencode (rascunho de 2026-11-04, aguardando aprovação)

## Modelos permitidos e preços (US$ por milhão de tokens; lidos de `opencode models --verbose`)
| Modelo | Entrada | Saída | Contexto | Uso |
|---|---|---|---|---|
| `opencode/deepseek-v4.1-flash-free` | 0 | 0 | 200 mil | funções puras pequenas, QA, documentação |
| `opencode/mimo-v2.6-flash-free` | 0 | 0 | 200 mil | funções puras pequenas, QA, revisão cega |
| `opencode-go/qwen3.8-flash` | 0,15 | 0,47 | 1 milhão | interface e fichas médias |
| `opencode-go/deepseek-v4.1-flash` | 0,15 | 0,60 | 1 milhão | modelo de dados, motor, fichas médias e grandes |
Fora da lista (NÃO usar): `deepseek-v4-pro`, e qualquer outro. Mais baratos pagos existentes: `mimo-v2.6-flash` (0,14/0,28) e `mimo-v2.5` (0,14/0,28), ambos só se o dono liberar.

## Regra de alocação: o mais fraco no mais mecânico
A força relativa dos quatro é desconhecida; parto da hipótese (grátis = menor contexto, possível limite de taxa; deepseek pago = o que mais usamos e mais confiável) e a **calibração corrige**: quem aprova de primeira sobe de nível, quem é devolvido desce.
| Nível | Tarefas | Modelos (do mais fraco ao mais forte) |
|---|---|---|
| 1 mecânico | testes a partir da especificação (revisão cega), dados em massa (conectores nas 28 famílias), CSS, textos, renomeações, ligar um botão que já tem a lógica, scripts de QA, documentação | `mimo-v2.6-flash-free`, `deepseek-v4.1-flash-free` |
| 2 definido | função pura com contrato e exemplos numéricos, painel de interface com padrão vizinho, validação e edição de modelo seguindo exemplo | `qwen3.8-flash` |
| 3 delicado | comandos do modelo e integridade, composição do motor, ganchos no controlador e no `ViewportCanvas`, migração, portões difíceis | `deepseek-v4.1-flash` (pago) |
Fichas do nível 3 saem em passos pequenos (um comportamento por ficha) e com meus testes de aceite escritos antes; o que for ambíguo continua comigo, no contrato.

## Papel do orquestrador (fiscal)
1. Escrevo contrato, fichas e critérios de aceite numéricos; não escrevo código de funcionalidade (exceto correção pequena e delicada).
2. Portão automático em toda ficha: escopo de arquivos, tsc, eslint, units, boundaries, testes da ficha e suíte do pacote.
3. **Revisão cega** nas funções de motor: um modelo implementa; OUTRO modelo escreve os testes só a partir da ficha, sem ver o código; o portão roda os testes do segundo contra o código do primeiro. Divergência = defeito de um dos dois, que eu arbitro.
4. Eu leio o diff só dos arquivos centrais (controlador, `ViewportCanvas`, `commands`, contrato) e o resultado do QA.
5. Escalonamento: reprovou duas vezes com um modelo, troca por outro da lista; reprovou com dois, divido a ficha; só então faço eu.
6. Cada rodada de ondas termina com testadores no navegador (QA), como em 2026-11-03.
7. Tabela de calibração (`CALIBRACAO.md`): por ficha, modelo, aprovou de primeira, devoluções e tempo; define o modelo de cada tipo de tarefa.

## Ondas
- **Onda 0 (retomada):** relançar as 9 fichas já escritas conforme o nível: F1-modelo → `deepseek-v4.1-flash` (nível 3); F2-parede e F2-colisao → `qwen3.8-flash` (nível 2); F2-vizinho e F2-fila → `qwen3.8-flash` e `deepseek-v4.1-flash` em cruz para calibrar; ESC-modelo e ORC → `qwen3.8-flash`; USIN3D → `qwen3.8-flash`; CORR-2 → `deepseek-v4.1-flash-free` (interface com padrão pronto). Os testes de F2-* são reescritos por um modelo grátis em revisão cega (nível 1). Integrar.
- **Onda 1:** F3-core (`posarArrastado`, `facesDasParedes`, `corposDoNivel`, `caixaLocalDoComponente`) com revisão cega; painéis de conectores e escolhas no editor; conectores nas 28 famílias da biblioteca; conjunto na interface (agrupar, desagrupar, mover o grupo, copiar/colar grupo).
- **Onda 2 (interação 3D):** arrastar componente no 3D com encaixe; arrasto na planta com o mesmo encaixe; alças de largura/altura/profundidade; cotas editáveis no lugar; menu de contexto; biblioteca lateral com arrastar e soltar; guias de alinhamento.
- **Onda 3:** escolhas por clique (portas, gavetas, divisões); ferramenta de fila; cozinha em linha, canto em L, aéreos alinhados; "Meu conjunto".
- **Onda 4:** ferragens automáticas por regra; lateral compartilhada na lista e no corte; planos de referência na vista 3D; 3D abrir enquadrado e clique em móvel dentro da casa; DXF direto; desempenho (instanciar malhas iguais).
- **Onda 5:** QA completo, suíte inteira, build, relatório. Rust/WASM só depois da fatia C do kernel.

## Regras de custo e segurança
- Concorrência máxima: 6 executores ao mesmo tempo (os modelos grátis podem ter limite de taxa).
- Tamanho de ficha: caber em 200 mil de contexto (limite dos modelos grátis): ficha pequena, arquivos nomeados.
- Medir tokens das três primeiras fichas pagas e projetar o custo total.
- Modelos grátis podem registrar prompts: não colocar segredos (chaves, dados de clientes) nas fichas.
