# Estilo de prancha técnica

Planta, corte e elevação com a aparência de uma prancha de CAD. É só apresentação: geometria, camadas e junções não mudam.
Referência visual (nunca copiada): o CreaBIM, que é GPL-3, ao contrário do Hestia (MIT).

## O que o app faz

- **Linha oculta é o visual de prancha, para todos.** Superfícies em papel (branco), hachura cinza neutra, contorno do que
  é cortado em tinta cheia, arestas de telhado em tinta. A cor de material só aparece no estilo Sombreado. O campo antigo
  `ViewGraphics.estiloPrancha` é ignorado e fica no tipo só para arquivos já gravados.
- **Hachura em mm de papel**, com cobertura analítica (antialiasing) no shader: passo de 1,5 mm e linha de 0,13 mm (escala
  até 1:75) ou 0,09 mm (escalas menores). Com "Linhas finas (tela)", que vem LIGADA por padrão, a espessura da hachura fica
  limitada a um fio, como já acontecia com os contornos. Folha, PDF e DXF não usam o modo e imprimem a espessura de papel.
- **Hachuras novas.** Dezesseis padrões além dos antigos: cinco simples (`brick`, `concrete`, `timber`, `insulation`,
  `earth`) e onze por primitivas (`hatchDefs.ts`: reta com ângulo, passo e tracejado com fase, e pontos). Cada padrão é
  desenhado igual no gerador de CPU, na folha, no shader e no espelho em software (`rasterSoftware.ts`), e há testes de
  paridade entre eles. O seletor do material mostra uma miniatura de cada.
- **Conjuntos de penas** (Gerenciar, ícone de pena): Padrão, Leve e Forte, mais "Meus conjuntos" gravados em
  `Project.penSets` (opcional, sem mudar a versão do esquema do arquivo).
- **Paredes prontas** (só em projetos novos): bloco de concreto, concreto armado, parede dupla com câmara de ar, fachada
  com isolamento, tijolo aparente, drywall, steel frame, wood frame, muro de pedra e painel sanduíche.
- **3D:** espigão e rincão do telhado passam a ter aresta (limite de 8° para o telhado, contra 28° das outras peças).
- **Folha e PDF:** traço sem espessura de papel e todo tracejado são medidos em px de tela a 96 dpi.

## Verificação

Roteiro de navegador `tests/e2e/estilo-prancha.mjs` (Chrome com SwiftShader, sem placa de vídeo). O build serve o
`geom_wasm.wasm` como arquivo separado, então por `file://` o Chrome só o abre com `--allow-file-access-from-files`.
