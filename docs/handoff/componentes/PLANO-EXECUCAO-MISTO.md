# Execução do plano profissional em três níveis (rascunho de 2026-11-04, aguardando aprovação)

Substitui `PLANO-EXECUCAO-CLAUDE.md`. Conteúdo técnico de cada item: `PLANO-PROFISSIONAL.md` (P1 a P7). Calibração dos modelos: `CALIBRACAO.md`.

## Regra dos três níveis
| Nível | Modelo | Para quê |
|---|---|---|
| 1 | opencode: `deepseek-v4.1-flash` (DS, o mais confiável), `qwen3.8-flash` (QW), `deepseek-v4.1-flash-free` (DSF), `mimo-v2.6-flash-free` (MMF) | A maior parte: ficha definida, com padrão vizinho, arquivos nomeados, casos numéricos. DS leva o que é delicado dentro do definido; QW as fichas pequenas; DSF/MMF só o trivial. |
| 2 | **Claude Haiku 5.5, esforço médio** | O mais complexo: geometria, captura 3D, ganchos no render e no pick, vários arquivos acoplados. |
| 3 | **Claude Sonnet, esforço médio** | O ainda mais complexo: linguagem de fórmulas e grafo, ancoragem que reescreve fórmulas, renderização de textura em lote, desempenho do 3D. |
Eu fico com contratos, fichas, portões, roteiros de navegador, integração e decisões. Falhou duas vezes num nível, sobe para o seguinte; falhou no Sonnet, divido a ficha.

## Protocolo
- Executores opencode: como até aqui (`rodar-fila.sh`, no máximo 6), mas com a junção do `node_modules` verificada antes (o verde que eles relatam não vale; o meu portão vale).
- Subagentes Claude (Haiku e Sonnet): worktree isolado; primeiro passo obrigatório = junção do `node_modules` do worktree principal; entrega com commits pequenos e relatório com a última linha de cada comando.
- Portão do orquestrador em todas (escopo, tsc, eslint, units, boundaries, testes) e roteiro Playwright no navegador real em toda ficha de interface.
- **Teste cego** nas funções de motor: outro executor escreve testes só da especificação (DS), e o portão os roda contra a implementação.
- Total em paralelo: até 6 opencode + 3 Claude; fichas com arquivos em comum não rodam juntas.

## Divisão
| Item | O que é | Nível |
|---|---|---|
| P1a | Aba Vista do editor (estilo de exibição, isolar/ocultar, planos, enquadrar) | 1 · QW |
| P1b | Aba Inserir (carregar família/arquivo, contorno DXF, imagem de referência, ferragem, usinagem) | 1 · QW |
| P1c | Aba Gerenciar (parâmetros, tipos, encaixe, catálogo, materiais, validar, preferências) | 1 · DS |
| P1d | Aba Modificar: casca com botões e atalhos | 1 · DSF |
| P2a | Contrato das referências de peça e plano na linguagem de fórmulas | **eu** |
| P2b | Linguagem e grafo: peças como nós, ciclos, resolução, validação, renomear | 3 · **Sonnet** |
| P2c | Teste cego do P2b | 1 · DS |
| P2d | `capturarPontos` (vértice, meio de aresta, centro de face, plano) | 2 · Haiku |
| P2e | Teste cego do P2d | 1 · DS |
| P3a | Marcadores de captura e seleção de vértice/aresta/face no 3D do editor | 2 · Haiku |
| P3b | Mover com mouse (livre, travado em eixo, digitar), gravando a ancoragem | 3 · **Sonnet** |
| P3c | Alinhar por ponto de referência (grava ancoragem) | 3 · **Sonnet** |
| P3d | Girar, espelhar, copiar, matriz (vira `repetir`) | 1 · DS |
| P3e | Cota temporária entre referências e cadeado ligado a parâmetro | 2 · Haiku |
| P3f | Vistas 2D do editor com as mesmas ferramentas | 1 · DS |
| P4a | Alinhar módulos no projeto por ponto de referência | 2 · Haiku |
| P4b | Alças de largura, altura e profundidade e cotas editáveis no 3D do projeto | 2 · Haiku |
| P4c | Escolha de porta/gaveta clicando no móvel (pick por peça) | 2 · Haiku |
| P5a | Motor de corte e elevação (`cortarComponente`, `projetarComponente`) | 2 · Haiku |
| P5a-teste | Teste cego do P5a | 1 · DS |
| P5b | Render de corte e elevação em `section/build.ts` | 2 · Haiku |
| P5c | Seleção e propriedades em corte/elevação | 1 · QW |
| P5d | Planta detalhada (linhas internas, arco de porta, níveis de detalhe) | 1 · DS |
| P6a | Contrato de textura no material (esquema 26) | **eu** |
| P6b | Dezesseis texturas procedurais (função pura de pixels), com revisão minha | 1 · QW |
| P6c | UVs na malha dos componentes com orientação do veio | 2 · Haiku |
| P6c-teste | Teste cego dos UVs | 1 · DS |
| P6d | Render 3D com textura (projeto e editor), cache e desempenho | 3 · **Sonnet** |
| P6e | Interface de materiais (lista, miniatura, importar imagem, escala, rotação, seletor por peça) | 1 · DS |
| P6f | Exportação (IFC com estilo de superfície, DXF sem textura) | 1 · QW |
| P7a | Ícones, tooltips e atalhos, português e inglês | 1 · QW |
| P7b | Desempenho (instanciar malhas iguais, mipmaps, 100 móveis) | 3 · **Sonnet** |
| P7c | Teclado e foco nos diálogos, mensagens, estados vazios | 1 · QW |
| P7d | Manual curto no app e em `docs/` | 1 · DSF |
| P7e | QA final por área (roteiros no navegador) | 1 · DS, mais meus roteiros |

Contagem: 19 em nível 1 (opencode), 9 em nível 2 (Haiku), 5 em nível 3 (Sonnet), 2 comigo.

## Ondas
1. **A:** P1a, P1b, P1c, P5a (Haiku), P6b; eu escrevo P2a e P6a.
2. **B:** P2b (Sonnet), P2d (Haiku), os testes cegos, P6c (Haiku), P1d.
3. **C:** P3a (Haiku), P3b e P3c (Sonnet, em série), P5b (Haiku), P6d (Sonnet), P6e.
4. **D:** P3d, P3e, P3f, P4a, P4b, P4c, P5c, P5d, P6f.
5. **E:** P7 inteiro, QA, suíte completa.

## Custo
Nível 1 praticamente não pesa; as 9 fichas de Haiku e as 5 de Sonnet concentram o custo. A calibração do DS (entregou fichas delicadas de primeira, como o arrasto 3D e a camada de encaixe) é o motivo de eu manter nele muita coisa que antes iria para Claude.
