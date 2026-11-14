# Decisão 0057 — Massa conceitual (pilha de seções, kernel Rust, derivação de pisos e paredes)

Data: 2026-11-14. Estado: **implementada** (fichas M1 a Q1, branch `massa/*`, mescladas em `claude/youthful-dirac-l4egd1`; `SCHEMA_VERSION` 26, contrato do kernel `versao` 19, `abi` 2).
Fonte de trabalho: [docs/massa/PLANO.md](../massa/PLANO.md) (Parte A e emendas E1 a E18) e [docs/massa/ESTADO.md](../massa/ESTADO.md). Este texto resume a decisão e não copia o plano: onde houver diferença, vale o plano com as emendas.
Paridade: [docs/paridade/massas.md](../paridade/massas.md). Evidências: `docs/massa/evidencias/` (fase 2, fase 3 e final).

---

## 1. Resumo

Um elemento novo, **Massa** (`kind: 'mass'`), para estudo volumétrico: torres, blocos, torres torcidas, bulbos e conjuntos de pétalas. A massa aparece em **3D, planta, corte, elevação e prancha**, tem **áreas por pavimento** em tabela, sai em **IFC e DXF** e gera **pisos, lajes e paredes** a partir das suas fatias horizontais, tudo com desfazer.

Toda massa é uma **pilha de seções horizontais** em cotas crescentes. As "operações" da interface (extrusão, mistura, loft, bulbo, torção, arranjo polar) são atalhos que montam essa pilha. O **kernel Rust** faz toda a geometria; o TypeScript só envia as seções e desenha o que o kernel devolve.

## 2. Decisões do dono (de partida, não reabrir)

1. **A pilha de seções é a única primitiva.** Sem outro tipo de sólido na v1. Com uma primitiva só, a fatia horizontal em qualquer cota é exata (um anel interpolado), a malha fecha por construção e não é preciso booleana 3D. É isso que dá estabilidade.
2. **O kernel Rust faz toda a geometria** (malha, fatias, planta, corte, quantidades, avisos). **Nenhum caminho TypeScript gera a geometria da massa**: sem kernel, ou com erro dele, a massa continua no modelo, planta e 3D mostram só o contorno da base e o painel de avisos diz o motivo. Não existe segunda fonte da verdade.
3. **Sem `MassType` na v1.** A massa é só instância (como `Room` e `Generic`). A repetição de forma se faz com `arranjo` ou copiando.
4. **Escopo fechado (A.9).** Ficam de fora: booleana entre massas; NURBS e superfície livre; varredura por caminho; revolução de perfil não monótono; arcos no perfil livre; `MassType`; fachada em painéis e telhado ou forro por face; vínculo automático massa → piso/parede; terreno e lote; importação de massa por IFC ou OBJ; edição por alças no 3D (alças só em planta).
5. **Sem dependência nova** em `Cargo.toml` nem em `package.json`.
6. **Política de execução (E5):** subagentes só com modelos de custo baixo; ninguém muda a Parte A sem pergunta ao dono.

## 3. Modelo de dados (A.3 com as emendas E1 e E16 a E18)

Arquivos: `packages/model/src/massTypes.ts` (tipos e constantes), `mass.ts` (`makeMass`, `transformMass`), `validateMass.ts` (`massIssue`), `massCommands.ts`, `massDerivaCommands.ts`.

- `Mass`: `id`, `levelId`, `name`, `origem` (planta), `baseOffset`, `secoes` (2 a 64), `interpolacao` (`linear` | `suave`), `resolucao` (16 a 128, padrão 64), `arranjo?`, `color?`, `order`.
- `SecaoMassa`: `z` (a primeira é 0; crescente com passo mínimo 0,01 m), `perfil`, `rotacao` (rad; diferença máxima entre vizinhas π), `escala` (> 0), `dx`, `dy`.
- `PerfilMassa`: `circulo` (raio), `elipse` (rx, ry), `poligono` (3 a 64 lados, raio de inscrição, **vértice em +x**, E1 item 2) e `livre` (3 a 256 pontos, polígono simples anti-horário, sem arcos).
- `ArranjoMassa`: `n` (2 a 64, a original conta), centro `(cx, cy)` em coordenadas de mundo, `anguloTotal` (2π = volta completa; a última cópia não repete a primeira).
- `Element` ganha `Mass`; `GraphicsCategory` ganha `'mass'` (peso de corte 2, de projeção 1, ACI 8, camada DXF de corte `CORTE_MASSA`, E1 item 5; opacidade 0,35 no 3D).
- **Esquema 25 → 26** com migração que não altera dados (protege versões antigas do app). `Floor`, `Slab` e `Wall` ganham `origemMassa?: { massaId, nivelId }` **sem migração** (campo opcional; arquivo antigo abre igual).
- **Comandos** (todos com desfazer): `addMass`, `updateMass` (patch parcial), apagar pelo comando genérico, `setMassSecoes`, `setMassArranjo(id, arranjo | null)` (`null` remove, E1 item 3). `addMass` e `updateMass` **recusam** massa inválida e nível inexistente.
- **`transform`:** translação move `origem` e `arranjo.cx/cy`; rotação soma o ângulo a **todas** as `rotacao` e gira `origem`, `dx/dy` e o centro do arranjo; espelho em torno de uma linha de ângulo φ espelha o perfil em y local (perfil livre com a ordem invertida), usa `rotacao' = 2φ − rotacao`, reflete `dx/dy` e troca o sinal de `anguloTotal` (E1 item 1; para φ = 0 é a regra simples do plano). Copiar não herda `origemMassa` (E16, E17).
- **Validação** (`massIssue`): número de seções, z crescente, dimensões > 0, `livre` simples e anti-horário (o comando normaliza o sentido), `escala > 0`, `resolucao` e `arranjo.n` nos limites, rotação entre vizinhas ≤ π; valores não finitos recusados (E1 item 4).

## 4. Regras de geometria (A.4; implementação em `crates/geom-wasm/src/massa_*.rs`)

1. **Parâmetro do anel:** cada perfil é uma curva fechada em `t ∈ [0, 1)`, comprimento de arco normalizado, anti-horário, começando onde a semirreta +x local cruza o perfil (vários cruzamentos: o mais distante; sem cruzamento: o vértice de maior x, E3 item 4).
2. **Conjunto comum `T`:** grade uniforme de `resolucao` pontos mais o parâmetro de cada vértice dos perfis `poligono` e `livre` de todas as seções; fusão a menos de 1e-9; `|T| ≤ 512` (senão `LIMITE`).
3. **Anel de uma seção:** ponto local × `escala`, depois `rotacao`, depois `(dx, dy) + origem`.
4. **Entre seções:** interpolam-se **em separado** os pontos locais já escalados, a rotação, `dx` e `dy`; só depois se aplica a rotação e a translação. **Nunca** interpolar pontos de mundo (a torre torcida encolheria). `suave` usa PCHIP (Fritsch-Carlson, pesos harmônicos), que não ultrapassa, então raio não fica negativo.
5. **Anéis intermediários da malha** por `lod` (0: 15° e 3 m; 1: 5° e 1 m; 2: 2,5° e 0,5 m); tetos de 256 por trecho e 2048 por cópia (`LIMITE`).
6. **Malha:** lateral em quadriláteros divididos pela mesma diagonal; tampas por orelhas; **fechada por construção** (cada aresta em exatamente 2 triângulos, normais para fora).
7. **Arranjo:** cópia `i` = a massa girada `i · anguloTotal / n` em torno de `(cx, cy)`; cada cópia é uma casca separada; **sem booleana entre cópias**.
8. **Fatia horizontal** (planta, áreas, pisos, paredes): anel interpolado direto das seções, **independente do `lod` e da malha**. Nível dentro da massa com pontas inclusivas (E4 item 1).
9. **Corte vertical** em `(s, z)`: **cortado** (estilo 0, interseção do plano com a malha `lod 2`, encadeada pela identidade da aresta, E6 item 3), **projetado** (estilo 1, faixa por anel visível) e **feição** (estilo 3: linha em cada seção do usuário e curva de cada quina voltada ao observador). Estilos 0 e 1 repetem o primeiro ponto no fim; saída na grade de 1 µm (E6 item 2). Limitação aceita: anel côncavo cortado pelo plano pode ter a projeção um pouco maior que a real.
10. **Planta** na cota de corte com faixa de vista: cortado (estilo 0), seções do usuário abaixo do corte (estilo 1) e acima (estilo 2, tracejado). Sem união 2D.
11. **Quantidades:** volume pelo teorema da divergência sobre a malha `lod 2`; áreas lateral, da base e do topo; altura. Por pavimento: área e perímetro da fatia em cada nível, **somados por cópia**.
12. **Avisos do kernel** (não bloqueiam): 1 anel autointersecta; 2 cópias se sobrepõem num nível; 3 limite atingido; 4 face com inclinação > 5° (informativo, usado por "Paredes da massa"). Massa inválida é `ENTRADA`, não aviso (E4 item 4).
13. **Determinismo:** mesmas seções, mesmos bytes; ordem `massa_num`, cópia, anel, `t`; nenhuma saída `NaN` ou infinita.

## 5. Contrato com o kernel (A.5)

`crates/geom-wasm/schema/cena-v11.json`, `versao` 18 → **19**, `abi` 2. Faixa reservada à massa: **seções 140 a 142** e **consultas 140 a 145**. O contrato está **congelado** desde a ficha M2.

| Seção | Nome | Conteúdo |
|---|---|---|
| 140 | `massas` | nível, origem, cota da base, interpolação, resolução, arranjo |
| 141 | `massa_secoes` | massa, ordem, z, forma, dimensões, rotação, escala, dx, dy |
| 142 | `massa_pontos` | pontos do perfil livre |

| Consulta | Nome | Saída |
|---|---|---|
| 140 | `massa_malha` | grupos (massa, cópia, papel), vértices, índices |
| 141 | `massa_planta` | linhas por estilo (0, 1, 2) |
| 142 | `massa_fatias` | fatias por nível alvo, com área e perímetro |
| 143 | `massa_corte` | linhas por estilo (0, 1, 3) em `(s, z)` |
| 144 | `quant_massa` | volume, áreas, altura |
| 145 | `massa_avisos` | avisos 1 a 4 com medidas |

O Rust só lê as seções (não conhece `Project`). O adaptador TS é `packages/engine/src/kernelMassa.ts`; o serviço é `massaServico.ts` (`servicoMassa()`: uma cena do Rust, envio por diferença, respostas por assinatura; `null` sem kernel; nunca lança). **Esclarecimento (E16 item 1):** a consulta 142 filtra a massa pelo nível da própria massa e devolve as fatias de todos os níveis da pilha em `nivel_alvo_num`; para escolher o nível da fatia, chame `fatias(p)` uma vez e filtre por `nivelId`.

## 6. Interface (A.6)

- **Aba "Massa e terreno":** ficam reais Extrusão, Mistura, Loft, Bulbo, Mostrar massa, Pisos da massa e Paredes da massa; o resto segue `soon`. Atalhos `MA` (perfil Revit) e `VM` (perfil simples).
- **Ferramenta `mass`** (modos extrusão, mistura, loft, bulbo; perfis círculo, elipse, polígono regular, livre) sobre o núcleo comum de desenho; altura (padrão 9 m) e lados digitáveis; só age na planta. Barra de opções preserva os ajustes ao trocar de modo.
- **Painel de propriedades** (`MassProperties.tsx`): nome, nível, base, altura (leitura), interpolação, resolução, **Torção total (graus)** (distribui a rotação linearmente), **Arranjo polar**, cor, "Editar seções…".
- **Diálogo "Seções da massa"** (`MassSecoesDialog.tsx`, lógica em `massSecoesForm.ts`): tabela, adicionar, remover, duplicar, prévia ao vivo; aplicar = um passo de desfazer. Os pontos do perfil livre não se editam na tabela.
- **Navegador:** categoria "Massas". **Tabela "Massas por pavimento"** (aba Vista, painel Criar, Tabelas) com CSV: uma linha por massa e pavimento, rodapé com volume e áreas totais e a maior altura (E14).
- **Seleção, snaps e alças:** clique e caixa na planta e no corte; snaps de vértice, meio e aresta do anel cortado (chave `m<cópia>.l<laço>.v<índice>`); alças de origem e de vértice do perfil livre da base (planta); mover no corte (horizontal move `origem`, vertical muda `baseOffset`); Aparar, Estender, Dividir e Deslocar são `null` com o motivo "massa não é elemento linear".
- **Textos** em pt e en (e os demais idiomas da faixa) pelo sistema de i18n; números por `formatQuantity`.

## 7. Derivação (A.7, fichas D1 e D2)

- **Pisos da massa:** para cada nível escolhido, a fatia (união 2D das cópias com `@hestia/geom`) é simplificada por Douglas-Peucker (padrão 5 mm) e vira o contorno **estático** de um piso ou laje, um por componente conexo, com furos. Uma transação, um desfazer. Rodar de novo apaga os gerados antes pela mesma massa **e** o mesmo nível (`origemMassa`).
- **Paredes da massa:** o contorno simplificado (padrão 5 cm, segmento mínimo 0,40 m) vira uma cadeia fechada de paredes retas do tipo escolhido, do nível ao próximo nível dentro da massa ou ao topo (E17). Só o anel externo de cada componente (furos ignorados). O ponto onde a semirreta +x cruza o contorno é mantido como vértice: um lado pode sair dividido em dois segmentos colineares (uma parede a mais que os lados). A torção aparece como degrau por pavimento; o diálogo avisa quando o aviso 4 acusa face inclinada.
- **Sem vínculo automático:** mudar a massa não muda o piso nem a parede; o comando se roda de novo.

## 8. Saídas (X1, E18)

- **IFC:** um `IfcBuildingElementProxy` por massa, `ObjectType` "MASSA", malha `lod 2` de todas as cópias num `IfcTriangulatedFaceSet`, `Pset_Hestia_Massa` (Secoes, Copias, Altura, Volume, áreas) e `Pset_Hestia_Element` (`HestiaKind` "mass"). A malha vem do kernel no app (`ifcExportMassa.ts`), porque o `io` não importa o engine; sem kernel a massa não é exportada e o IFC registra um aviso. **Limitação:** o importador devolve a massa como `Generic` com a malha, sem seções nem arranjo.
- **DXF:** planta na camada `MASSA` (só o estilo "acima" tracejado); corte e elevação em `CORTE_MASSA` (cortado) e `CORTE_MASSA_PROJECAO` (projetado); a feição não sai.
- **Prancha:** nenhuma mudança de código: planta, corte, elevação e 3D vetorial leem as camadas V2, V3 e V1. PDF com as quatro vistas provado por teste e pelo E2E.

## 9. Estabilidade (A.8) e desempenho

Os oito critérios e o teste que prova cada um estão em [massas.md](../paridade/massas.md), seção "Estabilidade". Em resumo: massa inválida recusada pelo comando e erro do kernel vira aviso; fuzz de 200 massas (`fuzz_200`, `lacos_fechados_fuzz`, `fuzz_200_fatias_planta_quant_avisos`); valores de referência M1 a M5; cache por assinatura (editar uma massa não recalcula as outras; mudar só a cor não recalcula geometria); 3D em lote transparente posterior sem escrita de profundidade; desfazer, refazer, copiar/colar, salvar/abrir e migração; E2E no navegador (`tests/e2e/massa.mjs`).

**Tempo** (alvo, não bloqueio, salvo acima do dobro; flor de 12 pétalas no WASM real, mediana de 15 chamadas): `massa_malha` lod 1 ≤ 50 ms, `massa_corte` ≤ 50 ms, `massa_planta` ≤ 10 ms. O teste `packages/engine/src/massaDesempenho.perf.test.ts` (`npm run test:perf`) reprova só acima do dobro e imprime a mediana. Medido nesta máquina: malha lod 1 cerca de 1,5 ms, corte cerca de 2,8 ms, planta cerca de 0,8 ms.

**Contador de quadros:** `packages/render/src/perf/contadores.ts` ganhou a camada `massa` em `CamadaRebuild`. A contagem em `PlanFrame` (uma chamada `contarRebuild('massa')` quando a chave da massa muda, em `planFrame.ts`) ficou como pendência de uma linha, fora da lista da ficha Q1.

## 10. Consequências e dívidas conhecidas

- O app, no build de produção, **exige o kernel** (sem ele recusa abrir qualquer projeto). O caminho "sem kernel" da massa só existe no modo de desenvolvimento (`?kernel=ts`), onde o E2E o prova.
- Reimportação de IFC perde a parametrização da massa (E18). Conferência dos arquivos exportados em programas externos não foi feita.
- `sectionEditTools.ts` (655 linhas) e `alignFeatures.ts` (478) estouram o limite de linhas por dívida anterior à massa (E13).
- Contraste do 3D (opacidade 0,35): mantido pela decisão A.3; sugestão ao dono: 0,5 se a leitura for ruim (E10 item 4).
- Defeitos do app fora da massa, relatados ao dono: botão "Enquadrar tudo" da barra de navegação não recebe o clique na planta (E15); app sem favicon; o kernel não sobe abrindo o `dist` por `file://` (E10).

## Apêndice — Emendas e esclarecimentos (E1 a E18, uma linha cada)

- **E1 (M1):** espelho em torno de φ (`rotacao' = 2φ − rotacao`), polígono com vértice em +x, `setMassArranjo(null)` remove, validações extras, estilo gráfico padrão, `SCHEMA_VERSION` 26.
- **E2 (M2):** a M2 também toca `cena.rs` e `secoes_massa.rs` para as seções 140 a 142 aceitarem `definir_secao`, `upsert` e `remover`.
- **E3 (R1):** `vitest.wasm.config.ts` inclui `kernel-massa*`; M3 usa raio 4·√2; fixture M5 do Rust definida; regras de perfil livre, "perfis diferem" e PCHIP.
- **E4 (R2):** nível dentro da massa com pontas inclusivas; planta sem limite de `z_max` no estilo 2; volume somado ao primeiro vértice; avisos 1 a 4 definidos; M5 não gera aviso 2.
- **E5:** política de modelos dos subagentes (só haiku `high` ou sonnet `medium`).
- **E6 (R3):** formato da consulta 143 (estilos 0 e 1 repetem o primeiro ponto; grade de 1 µm), encadeamento pela identidade da aresta, projetado e feição, tempo medido.
- **E7 (E1):** API do motor (`servicoMassa`, avisos, quantidades, fixtures) para as fichas de vista, interface e derivação.
- **E8 (V1, V2):** 3D por lote por nível, reserva sem kernel só com o contorno da primeira seção; planta com chave de snap `m<cópia>.l<laço>.v<índice>`; pendências para T1, U2 e Q1.
- **E9 (V3):** corte com cortado pesado, projetado fino, feição fraca; prioridade de clique por estilo; sem reserva sem kernel no corte.
- **E10 (portão da fase 2):** capturas aprovadas; achados de névoa do 3D (corrigido na V1b), favicon, kernel por `file://` e contraste.
- **E11 (T1a):** divisão da T1 em criação e modificação; ligação mínima em `apps/web` (rótulo, atalho, botão) obrigatória pelos testes-guarda.
- **E12 (T1a, T1b):** atalhos `MA` e `VM`; massa depois de piso, laje e telhado na seleção; alças de origem e vértice; pendências para a T1c.
- **E13 (T1c, U1):** colar por clique, Alinhar com alvo `'massa'`, peças no corte, cota associativa; painel, diálogo, navegador, "Mostrar massa"; dívida de tamanho anterior à massa.
- **E14 (U2):** tabela "Massas por pavimento" (soma por cópia, maior altura, aviso 2 marca todas as linhas da massa) e avisos no painel; `test:i18n` não roda neste ambiente.
- **E15 (G3):** roteiro de interface no navegador passa; defeito do "Enquadrar tudo" (fora da massa); botão da tabela fica em Vista, Criar, Tabelas.
- **E16 (D1):** `massa_fatias` filtra pelo nível da própria massa; `comandoDerivarPisos` em uma transação; `origemMassa` opcional sem migração; copiar limpa `origemMassa`.
- **E17 (D2):** `comandoDerivarParedes` em uma transação; cadeia fechada, furos ignorados, tolerância e segmento mínimo; `origemMassa` também em `Wall`.
- **E18 (X1):** IFC por massa com `Pset_Hestia_Massa`, sem kernel não exporta; DXF `MASSA`, `CORTE_MASSA`, `CORTE_MASSA_PROJECAO`; prancha sem mudança de código; importador IFC devolve `Generic`.
