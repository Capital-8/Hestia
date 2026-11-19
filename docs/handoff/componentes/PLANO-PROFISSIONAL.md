# Plano — deixar componentes e editor de famílias profissionais (rascunho de 2026-11-04, aguardando aprovação)

## 1. O que você relatou e o que eu confirmei no código/navegador
| Relato | Causa confirmada | Situação |
|---|---|---|
| A Biblioteca não fecha | A barra de título da janela captura o ponteiro para arrastar, e o clique no × nunca chega ao botão (`PaletaMoveis.tsx`). | **Corrigido** (commit `f17f256d`; testado: fecha, reabre e continua arrastável). |
| Abas Inserir, Modificar, Vista e Gerenciar do editor de famílias não funcionam | São placeholders desabilitados de propósito: `FamiliaFaixa.tsx:112` (`disabled`, "Aba ainda sem painéis"). Só a aba Criar tem botões. | A construir (onda P1). |
| Peças do criador não se movem com o mouse; faltam as ferramentas de modificar (pegar por vértice ou ponto de referência e alinhar a outro elemento) | A posição de cada peça é uma fórmula numérica; o 3D do editor só seleciona. Não existe captura (snap) de vértice, aresta, face ou plano, nem restrição "alinhar a". | A construir (ondas P2 a P4): é o maior item. |
| Os móveis não aparecem em cortes e elevações | `packages/render/src/section/build.ts` e `packages/engine/src/section.ts` não conhecem `component`. Na planta só sai a pegada. | A construir (onda P5). |
| Sem textura no 3D e sem como configurar | `Material` só tem cor, brilho e opacidade (`packages/model/src/types.ts:36`); a malha dos componentes não tem coordenadas de textura (UV). | A construir (ondas P6 a P7). |

## 2. Decisões de arquitetura que preciso que você valide
1. **Mover peça com o mouse sem perder o paramétrico.** Uma peça tem fórmulas (`origem`, `tamanho`). Se eu só somar um número ao arrastar, o móvel deixa de acompanhar a largura. A solução profissional (a do Revit) é **ancorar**: ao arrastar ou alinhar, o editor grava uma fórmula que referencia o alvo (por exemplo, "a face direita da lateral esquerda + 18 mm"), e o móvel continua flexionando. Para isso a linguagem de fórmulas ganha **referências a peças e planos**: `lateralEsq.x1`, `base.z1`, `@planoFrente`, com detecção de ciclo. É a mudança mais funda do plano; a vantagem é que o Rust herda a mesma semântica. Alternativa mais simples: só deslocamento numérico, sem ancoragem (não recomendo).
2. **Texturas: procedurais mais imagem do usuário.** Uma biblioteca nossa de ~16 texturas geradas em código (MDF branco, cinza e preto; carvalho, nogueira, freijó; concreto, pedra, mármore, aço escovado...), sem arquivo de imagem e sem questão de licença, e a opção de importar a própria imagem (guardada dentro do projeto). Orientação do veio da peça respeitada.
3. **Ordem:** primeiro o editor (P1 a P4), depois cortes (P5), depois texturas (P6 e P7), com polimento ao longo de tudo. Posso inverter se textura ou corte forem mais urgentes: P5 e P6 são independentes do editor e rodam em paralelo com ele.

## 3. Ondas e fichas
Regra de modelos: a de sempre (`PLANO-EXECUCAO-MODELOS.md`): o mais fraco no mais mecânico; funções de motor com teste cego; todo portão e todo roteiro de navegador por minha conta.

### P1 — Faixa do editor completa (abas Inserir, Modificar, Vista, Gerenciar)
- **P1a Vista** (nível 2, QW): estilo de exibição (sombreado, aramado, textura), isolar e ocultar peças, mostrar e ocultar planos, pontos e eixos, enquadrar, vistas padrão (já existem), grade e unidades.
- **P1b Inserir** (nível 2, QW): Carregar família do arquivo ou da biblioteca como módulo aninhado, importar contorno de DXF, imagem de referência, plano de referência, ferragem, usinagem (atalhos para o que já existe, em um só lugar).
- **P1c Gerenciar** (nível 2, QW): Parâmetros, Tipos, Encaixe, Catálogo, **Materiais da família**, Validar, Unidades, preferências de captura.
- **P1d Modificar** (casca, nível 1, DSF): os botões e atalhos das ferramentas de P3 (desabilitados até elas existirem).
- Critério: nenhuma aba desabilitada; cada botão faz algo ou some; roteiro de navegador que clica todos.

### P2 — Núcleo de referência e captura (motor, com teste cego)
- **P2a Contrato** (eu): referências na linguagem (`peca.id.x0|x1|y0|y1|z0|z1|cx|cy|cz`, `@plano.id`), grafo com peças como nós, ciclo detectado, `renomearReferencias` acompanha; migração do formato da família (`versao`); ADR curto.
- **P2b Implementação** (nível 3, DS): `expressao.ts`, `grafo.ts`, `resolver.ts`, validação; testes.
- **P2c Teste cego** (nível 1/2, DSF/QW): testes só da especificação.
- **P2d Captura 3D** (nível 3, DS): `capturarPontos(pecas, planos, raio)` pura: vértices, meio de aresta, centro de face, interseções com planos, devolvendo o candidato mais próximo do raio do mouse com prioridade e tolerância; teste cego.

### P3 — Ferramentas de modificar com mouse no editor (3D e vistas 2D)
- **P3a Marcadores e seleção por vértice/aresta/face** (nível 3, DS): em `packages/render/src/familia/`, destaque de captura sob o mouse (quadrado no vértice, triângulo no meio, etc., como no AutoCAD), seleção de peça, face e aresta.
- **P3b Mover** (nível 3, DS): arrastar a peça (livre no plano da vista ou travado em eixo X, Y ou Z por tecla), digitar a distância; resultado em fórmula ancorada se o ponto de captura é de outro elemento, ou deslocamento se livre (pergunta uma vez por sessão). Preview e um passo de desfazer.
- **P3c Alinhar** (nível 3, DS): escolher a referência no destino e a feição na peça (face, borda, ponto); grava a ancoragem (fórmula referenciando o alvo).
- **P3d Girar, Espelhar, Copiar e Matriz** (nível 2, QW, com os testes do P2): Matriz vira `repetir` com espaçamento.
- **P3e Dimensionar e travar** (nível 3, DS): cota temporária entre duas referências, "cadeado" que vincula a cota a um parâmetro (como Revit).
- **P3f Vistas 2D editáveis** (nível 2, QW): as abas Frente, Lateral e Planta do editor aceitam as mesmas ferramentas com alças.
- Critério: roteiro de navegador (mover a lateral e ver o móvel flexionar; alinhar a prateleira à face da lateral; desfazer); sem regressão do 3D atual.

### P4 — Montagem de módulos mais fácil (editor e projeto)
- **P4a** (nível 3, DS): "Alinhar módulos" no projeto com as mesmas referências (face a face, frente a frente, topo ao topo) pelo ponto escolhido; reaproveita o encaixe da F2.
- **P4b** alças de largura, altura e profundidade e cotas editáveis direto no 3D do projeto (nível 3, DS).
- **P4c** escolha de porta, gaveta e divisão clicando no móvel no 3D (nível 3, DS; precisa de pick por peça: ver P5a).

### P5 — Cortes e elevações (e planta detalhada)
- **P5a Motor** (nível 3, DS, teste cego): `cortarComponente(p, c, plano)` (polígonos dos sólidos cortados por cada peça, com material) e `projetarComponente(p, c, direcao)` (contornos visíveis e ocultos); funções puras em metros.
- **P5b Render** (nível 3, DS): `packages/render/src/section/build.ts` desenha o corte (preenchimento e hachura do material) e a elevação (linhas) dos componentes, respeitando visibilidade, ocultar em vista e níveis de detalhe.
- **P5c Seleção e propriedades em corte/elevação** (nível 2, QW).
- **P5d Planta detalhada** (nível 2, QW): linhas internas das peças, arco de abertura das portas, gavetas; nível de detalhe grosso/médio/fino.
- Critério: roteiro de navegador com corte e elevação de um armário e de uma cozinha montada; comparação visual das capturas.

### P6 — Texturas: modelo, biblioteca e renderização
- **P6a Contrato** (eu): `Material.textura?: { origem: 'procedural' | 'imagem'; id?: string; imagem?: string (data URL); escala: number (mm por repetição); rotacao: number; usaVeio: boolean }`; `Chapa.materialId`; esquema 26 e migração; cache e limite de tamanho de imagem.
- **P6b Texturas procedurais** (nível 2, QW, com revisão): gerador em canvas (sem DOM nos testes: função pura que devolve pixels), 16 texturas; amostra de teste de variância e repetibilidade (ladrilhável).
- **P6c UVs na malha** (nível 3, DS, teste cego): `malhaDasPecas` passa a devolver UV por face (mapeamento planar por normal, em mm, com o veio `a/b` da peça orientando o eixo da textura); testes por face.
- **P6d Render 3D** (nível 3, DS): materiais com textura em `scene3d.ts` e no `VisualizadorFamilia`: cache de `THREE.Texture`, repetição por escala, rotação, brilho; sem perder o desempenho (instanciação por material).
- **P6e Interface** (nível 2, QW): em Gerenciar > Materiais (app e editor): lista, miniatura, trocar textura, importar imagem, escala e rotação com prévia; seletor de material por peça com miniatura; botão "textura" na barra de estilo.
- **P6f Exportação** (nível 1/2): IFC com estilo de superfície (cor; imagem opcional), DXF sem textura.
- Critério: o armário aparece com carvalho nas laterais e branco nas portas; trocar a textura atualiza o 3D do projeto e do editor; recarregar o projeto mantém a textura.

### P7 — Profissionalização transversal
- **P7a Ícones e tooltips próprios** da faixa do editor e do projeto (hoje reaproveita ícones do app), atalhos de teclado para todas as ferramentas novas, tudo em português e inglês.
- **P7b Desempenho:** malhas iguais instanciadas, texturas com mipmap e limite de memória, medição com 100 móveis (meta: quadro < 33 ms em hardware comum).
- **P7c Acessibilidade e fluxo:** teclado e foco nos diálogos, mensagens de erro claras, estado vazio com orientação, desfazer por gesto em tudo.
- **P7d Manual:** guia curto no próprio app e em `docs/` com o fluxo "criar uma cozinha em 5 minutos".
- **P7e QA final:** quatro testadores (editor, projeto, cortes, texturas) mais os meus roteiros, repetidos a cada onda.

## 4. Paralelismo e ordem
- **Já em paralelo (sem dependência):** P1a, P1b, P1c, P5a, P6a/P6b. Até 6 executores ao mesmo tempo.
- Depois: P2 (contrato primeiro), depois P3 e P5b e P6c/P6d em paralelo; P4 e P6e em seguida; P7 fecha.
- Uma onda só termina quando o roteiro de navegador passa e a suíte está verde.

## 5. Riscos
- **Ancoragem por fórmula** (P2/P3) é a parte difícil: referências entre peças criam dependências; o grafo já detecta ciclos, e o teste cego cobre. Se ficar instável, o fallback é deslocamento numérico.
- **Texturas e desempenho** (P6): muitas texturas grandes pesam; limite de imagem e mipmaps entram no contrato.
- **Cortes** (P5): peças com contorno poligonal e usinagens: v1 corta a caixa e o contorno; as usinagens aparecem só como linhas.
- **Modelos baratos** em tarefas amplas: mitigado por fichas pequenas, teste cego e portão próprio.
