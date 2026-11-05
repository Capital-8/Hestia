# Execução do plano profissional com subagentes Claude (rascunho de 2026-11-04, aguardando aprovação)

Substitui, para esta fase, a regra dos modelos do opencode (`PLANO-EXECUCAO-MODELOS.md`). Conteúdo técnico das fichas: `PLANO-PROFISSIONAL.md` (itens P1 a P7).

## Regra de modelos
- **Haiku 5.5, esforço médio:** trabalho definido, repetitivo ou com padrão vizinho para copiar (interface, abas, painéis, ligação de botões, testes escritos a partir da especificação, QA no navegador, documentação).
- **Sonnet, esforço médio:** o que é difícil para o Haiku: linguagem de fórmulas e grafo, captura 3D, ferramentas de modificar, cortes, UVs e renderização de textura, ganchos no `ViewportCanvas`/`scene3d`, tudo que mexe no esquema.
- **Eu (orquestrador):** contratos, fichas, portões, roteiros de navegador, integração, decisões. Não escrevo funcionalidade, salvo correção pequena e delicada.
- Subagente Claude que falha duas vezes: sobe de nível (Haiku → Sonnet); falhou no Sonnet: divido a ficha.

## Protocolo de cada subagente
1. Roda em worktree isolado (`isolation: worktree`), a partir do commit atual da branch `feat/familias-interface`; **primeiro passo obrigatório:** criar a junção do `node_modules` do worktree principal (`cmd /c mklink /J <worktree>\node_modules C:\Users\Dennylson\Desktop\programas\Hestia\wt\componentes-adr\node_modules`), porque executores novos ficaram sem dependências e relataram "verde" falso.
2. Ficha com contexto, arquivos permitidos, arquivos proibidos, casos numéricos de aceite e critério de parada (mesmo molde de `fichas/*.md`).
3. Entrega: commits pequenos na branch do worktree e relatório curto com a última linha de cada comando (tsc, eslint, units, boundaries, testes).
4. Eu rodo `gate.mjs` (escopo, tsc, eslint, units, boundaries, testes) e, em fichas de interface, um roteiro Playwright em `wt/qa/` no navegador real; só então integro (`git merge`).
5. **Teste cego** nas funções de motor: um segundo subagente (Haiku) escreve testes só a partir da especificação, sem ver o código; o portão roda os testes dele contra a implementação do Sonnet.
6. No máximo 5 subagentes ao mesmo tempo; fichas com arquivos em comum não rodam juntas.

## Divisão do trabalho
| Item | O que é | Modelo |
|---|---|---|
| P1a | Aba Vista do editor: estilo de exibição, isolar/ocultar peças, planos, enquadrar | Haiku |
| P1b | Aba Inserir: carregar família/arquivo, contorno DXF, imagem de referência, ferragem, usinagem | Haiku |
| P1c | Aba Gerenciar: parâmetros, tipos, encaixe, catálogo, materiais, validar, preferências | Haiku |
| P1d | Aba Modificar: casca com os botões e atalhos (ligados pelo P3) | Haiku |
| P2a | Contrato de referências de peça e plano na linguagem (e esquema da família) | **eu** |
| P2b | Implementação: expressão, grafo com peças como nós, ciclos, resolver, validação | **Sonnet** |
| P2c | Teste cego do P2b | Haiku |
| P2d | `capturarPontos` (vértice, meio de aresta, centro de face, plano) | **Sonnet** |
| P2e | Teste cego do P2d | Haiku |
| P3a | Marcadores de captura e seleção de vértice/aresta/face no 3D do editor | **Sonnet** |
| P3b | Mover com mouse (livre, travado em eixo, digitar distância) gravando ancoragem | **Sonnet** |
| P3c | Alinhar por ponto de referência (grava ancoragem) | **Sonnet** |
| P3d | Girar, espelhar, copiar, matriz (matriz vira `repetir`) | Haiku |
| P3e | Cota temporária entre referências e cadeado ligado a parâmetro | **Sonnet** |
| P3f | Vistas 2D do editor (frente, lateral, planta) com as mesmas ferramentas | Haiku |
| P4a | Alinhar módulos no projeto por ponto de referência (face a face, frente a frente) | **Sonnet** |
| P4b | Alças de largura/altura/profundidade e cotas editáveis no 3D do projeto | **Sonnet** |
| P4c | Escolha de porta/gaveta clicando no móvel (pick por peça) | **Sonnet** |
| P5a | Motor de corte e elevação do componente (`cortarComponente`, `projetarComponente`) | **Sonnet** |
| P5a-teste | Teste cego do P5a | Haiku |
| P5b | Render de corte e elevação em `section/build.ts` | **Sonnet** |
| P5c | Seleção e propriedades em corte/elevação | Haiku |
| P5d | Planta detalhada (linhas internas, arco de porta, níveis de detalhe) | Haiku |
| P6a | Contrato de textura no material (esquema 26) | **eu** |
| P6b | Gerador de texturas procedurais (16) | Haiku, com revisão minha |
| P6c | UVs na malha dos componentes com orientação do veio | **Sonnet** |
| P6c-teste | Teste cego dos UVs | Haiku |
| P6d | Render 3D com textura (projeto e editor), cache e desempenho | **Sonnet** |
| P6e | Interface de materiais: lista, miniatura, importar imagem, escala, rotação, seletor por peça | Haiku |
| P6f | Exportação (IFC com estilo de superfície, DXF sem textura) | Haiku |
| P7a | Ícones, tooltips e atalhos, em português e inglês | Haiku |
| P7b | Desempenho (instanciar malhas iguais, mipmaps, medição com 100 móveis) | **Sonnet** |
| P7c | Teclado e foco nos diálogos, mensagens, estados vazios | Haiku |
| P7d | Manual curto no app e em `docs/` | Haiku |
| P7e | QA final por área (editor, projeto, cortes, texturas) | Haiku (roteiros) + eu |

## Ondas (paralelas dentro de cada onda)
1. **Onda A:** P1a, P1b, P1c (Haiku, abas), P5a (Sonnet), P6b (Haiku) e eu escrevo P2a e P6a.
2. **Onda B:** P2b e P2d (Sonnet), P2c e P2e (Haiku, cegos), P5a-teste, P6c (Sonnet), P1d.
3. **Onda C:** P3a, P3b, P3c (Sonnet, em série nos arquivos comuns), P5b (Sonnet), P6d (Sonnet), P6e (Haiku).
4. **Onda D:** P3d, P3e, P3f, P5c, P5d, P6f, P4a, P4b, P4c.
5. **Onda E:** P7a a P7e e rodadas de QA, correções, suíte completa.
Em cada onda: portões e roteiros de navegador por minha conta antes da próxima.

## Custo e cautelas
- Haiku e Sonnet médios custam mais por ficha que os modelos do opencode: ~30 fichas, das quais ~16 Haiku e ~14 Sonnet. Prefiro fichas pequenas e com critério de parada, para não pagar iteração sem rumo.
- O que mais falhou até agora foi ambiente (sem `node_modules`) e interface que os testes não pegam (z-index, aba contextual): por isso o roteiro de navegador é obrigatório e a ficha de interface precisa dizer em que aba/lugar o botão aparece.
