# Decisão 0058 — Terreno e lote (topografia, regiões, corte e aterro, linhas de propriedade e índices; contrato com o kernel Rust)

Data: 2026-11-15. Estado: **execução em andamento**; o estado de cada ficha está na §11.
Fontes: `docs/terreno/PLANO.md` (Parte A e emendas E1 a E4) e `docs/terreno/ESTADO.md`. Cada seção cita a origem. Onde o ESTADO registra algo diferente do plano, a seção diz isso.
Numeração: 0057 já foi usado por outras frentes (massa e suplementos); esta decisão usa 0058.

Marcações de confiança: esta decisão não tem pesquisa de produto própria, por isso não há marcações de pesquisa como em 0055 e 0056. Tudo o que está aqui vem do plano ou do estado citados.

---

## 1. Decisões do dono (de partida, não reabrir)

Origem: PLANO.md §A.0, D1 a D11. O ESTADO registra que, em 2026-11-13, a ordem do dono "agora implemente!" foi tomada como confirmação de D1 a D11, incluída a `spade`. A resposta sobre o modelo dos subagentes e sobre parar por fase não foi dada.

- **D1 · dependência `spade` 2.x** no kernel (triangulação de Delaunay com restrições, Rust puro, MIT OR Apache-2.0). Motivo: triangulação escrita à mão é a maior fonte de defeito desta frente. `spade 2.15.1` compila para `wasm32-unknown-unknown` com o toolchain do repositório (1.97.1), e o dono já a usa no repositório `infraestrutura`. Se o dono disser não: parar antes da ficha R1 e reescrever as regras de A.4. (O plano fala em devolver a um modelo mais forte; a emenda E3 restringe os subagentes a Sonnet e Haiku.)
- **D2 · uma primitiva só: TIN** (malha de triângulos com linhas obrigatórias). Curvas, perfil, volumes e cota em um ponto são derivados dela. Sem grade regular paralela. Motivo: mesma lógica da "pilha de seções" da massa.
- **D3 · cotas absolutas no projeto**, no mesmo eixo z das elevações dos níveis. Mudar a elevação de um nível não move o terreno. Motivo: o levantamento chega em cota absoluta.
- **D4 · coordenadas locais.** O projeto guarda um deslocamento (`localizacao`) para a coordenada real (UTM) e a altitude real. Motivo: coordenadas na casa dos milhões tremem no 3D.
- **D5 · entrada v1:** pontos clicados, curvas desenhadas, DXF de levantamento (com cota) e CSV de pontos. Motivo: é assim que o levantamento chega.
- **D6 · plataforma, região nivelada e subdivisão são um elemento só** (`terrainRegion`), com três papéis. Não destroem o terreno original: o kernel calcula o "existente" e o "proposto". Motivo: menos tipos de elemento, e corte e aterro saem de graça.
- **D7 · recuos e índices são configuráveis por lote**, sem tabela de município. Todo limite é digitado pelo usuário. Motivo: norma municipal não verificada entra como configurável.
- **D8 · o lote não usa o kernel.** Área, recuos e índices são 2D e saem do `@hestia/geom` (booleanas já existentes). Motivo: não é geometria pesada, e evita contrato novo.
- **D9 · Rastreamento e Referência é a Fase 7, opcional**, só de estado de interface (não grava no projeto), e só começa com o "pode" do dono. Motivo: toca o estado das vistas (frente `vistas/*`). Se o dono disser não: a fase não é feita.
- **D10 · esta frente não espera a massa.** Trabalha com ids próprios e segue o protocolo de sincronização de B.7. As fichas que dependem da massa (P5) só rodam se a massa já estiver na `main`. Motivo: o dono quer dar andamento.
- **D11 · faixa de ids do kernel: seções 160 a 199 e consultas 160 a 199.** Motivo: ids são para sempre (o briefing propunha até 179). Se o dono disser não: 160 a 179 também cabe.

O sinal do norte verdadeiro foi decidido pelo fiscal na emenda E4 (§10), porque o dono não respondeu. Essa decisão é do fiscal, não do dono, e o dono pode reverter.

## 2. A primitiva única: TIN e as fontes guardadas

Origem: PLANO.md §A.2.

- Todo terreno é uma malha de triângulos em planta com uma cota por vértice (TIN). Não há outro tipo de superfície na v1.
- O modelo guarda só as **fontes**: `pontos` (soltos), `curvas` (polilinha com uma cota), `quebras` (polilinha com cota por vértice) e `borda`. A malha nunca é gravada no projeto: o kernel Rust a deriva das fontes.
- Curvas e quebras entram como **arestas obrigatórias** da triangulação.
- Há duas superfícies por terreno:
  - **existente (E)**, só das fontes;
  - **proposta (P)**, E modificada pelas regiões. Sem região com efeito, P = E.
- Tudo o mais é derivado de E e P: curvas de nível, perfil de corte, cota em um ponto, áreas, volumes de corte e aterro.
- Ferramenta da interface e o que ela escreve:
  - Topografia › Colocar pontos: `pontos`;
  - Topografia › Desenhar curvas: `curvas`;
  - Topografia › Importar levantamento: `pontos`, `curvas`, `quebras`;
  - Editar terreno: operações sobre as fontes;
  - Subdivisão, Plataforma e Região nivelada: um `terrainRegion` com o papel correspondente;
  - Linhas de propriedade: um `lot`.

## 3. Modelo de dados em resumo

Origem: PLANO.md §A.3. Os arquivos novos são `packages/model/src/terrainTypes.ts`, `packages/model/src/lotTypes.ts` e `packages/model/src/localizacao.ts`, e são a fonte dos tipos. Os blocos completos ficam no plano; aqui estão só os campos principais.

- **`Terrain`** (`kind: 'terrain'`): `levelId` (nível em que é desenhado; não define cota), `name`, `pontos`, `curvas`, `quebras`, `borda?`, `intervaloCurvas`, `mestraCada`, `espessuraBase`, `mostrarExistente`, `linhasRotulo`, `pontosCotados`, `materialId?`, `color?`, `order`.
- **`CurvaTerreno`** (`z`, `xy`, `fechada`) e **`QuebraTerreno`** (`xyz`).
- **`TerrainRegion`** (`kind: 'terrainRegion'`): `terrenoId`, `contorno`, `papel` (`subdivisao`, `plataforma` ou `nivelada`), `cota`, `inclinacao`, `direcao`, `taludeCorte`, `taludeAterro`, `permeavel`.
- **`Lot`** (`kind: 'lot'`): `contorno`, `lados` (cada um com `papel` frente, lateral ou fundo, e `recuo`), `limites` (`taxaOcupacaoMax?`, `coefAproveitamentoMax?`, `permeabilidadeMin?`, `gabaritoMax?`), `mostrarEdificavel`.
- **`Localizacao`** (`Project.localizacao?`): `origemE`, `origemN`, `cotaZero`, `norteVerdadeiro`, `sistema?`.
- **Limites** (`TERRENO_LIMITES`): soma de pontos e vértices de um terreno, 200 000; curvas, 20 000; quebras, 5 000; pontos de região, 512; regiões por terreno, 256; linhas de rótulo, 64; pontos cotados, 256; talude máximo, 10; inclinação máxima, 1; coordenada máxima, 100 000 m; cota máxima, 10 000 m. (`LOTE_LIMITES`): 256 pontos por lote; recuo máximo, 1 000 m.

Decisões do modelo:

1. Sem tipos (`TerrainType`, `LotType`) na v1. Os três elementos são só instância.
2. `Element` ganha os três kinds; `GraphicsCategory` ganha `site` (terreno e regiões) e `lot`. Estilo padrão de `site`: peso de corte 3, projeção 1, cor DXF ACI 34. De `lot`: peso de projeção 3, traço-dois-pontos, cor ACI 1. O ESTADO registra duas diferenças: a M1 gravou o estilo `lot` com cutWeight 1, e a P2 deixou o contorno do lote tracejado longo, não traço-dois-pontos, porque `StrokeOp.dash` só aceita [traço, vão].
3. `SCHEMA_VERSION` sobe de 25 para 26 uma vez só, na M1, com migração que não altera dados (todos os campos novos são opcionais).
4. Comandos, todos com desfazer: `addTerrain`, `updateTerrain`, `editTerrainFontes` (lista de operações num só passo de desfazer), `addTerrainRegion`, `updateTerrainRegion`, `setTerrainRegionContorno`, `addLot`, `updateLot`, `setLotContorno`, `setLocalizacao`. Apagar um terreno apaga, na mesma transação, as regiões com o mesmo `terrenoId`.
5. O `transform` genérico leva os três kinds: no terreno, translação, rotação e espelho sobre `pontos`, `curvas`, `quebras`, `borda`, `linhasRotulo` e `pontosCotados` (z não muda); na região, o `direcao` soma o ângulo na rotação e vira `2φ − direcao` no espelho; no lote, o espelho inverte a ordem dos pontos e dos lados, e cada lado mantém o seu papel e o seu recuo.
6. Validação (`terrainIssue`, `terrainRegionIssue`, `lotIssue`): os comandos recusam elemento inválido. Terreno com menos de 3 vértices é aceito (é o estado durante a criação); o kernel avisa.
7. Cota exibida ao usuário: sempre `z + localizacao.cotaZero`, formatada por `formatQuantity`. Funções `cotaExibida(p, z)` e `cotaDoProjeto(p, valor)` em `localizacao.ts`.

## 4. Regras de geometria do kernel e do lote

Origem: PLANO.md §A.4 (regras 1 a 19), com a correção da E4 na regra 19, e o ESTADO para o que foi decidido na R1 e o que ficou registrado.

**Ordem canônica dos vértices de um terreno:** pontos soltos na ordem do vetor; depois os vértices de cada curva; depois os de cada quebra. O adaptador TS numera `id_num` nessa ordem, e o Rust percorre por `id_num` crescente.

**Kernel (regras 1 a 16):**

1. **Fusão:** vértices com a mesma chave de 1 mm são o mesmo vértice. Se as cotas diferem em mais de 0,001 m, aviso 1.
2. **Restrições (arestas obrigatórias):** cada trecho de curva e de quebra vira restrição. Trecho que cruza outra restrição é pulado com aviso 2. O WASM é compilado com `panic = "abort"`, então nenhuma API da `spade` que entra em pânico pode ser chamada.
3. **T0:** triangulação de Delaunay com restrições. Menos de 3 vértices, ou todos colineares: saídas vazias e aviso 5, sem erro.
4. **Cota em (x, y):** interpolação linear no triângulo; fora da malha, "fora".
5. **Superfície existente E:** sem `borda`, E = T0. Com `borda`, a borda é adensada, recebe a cota de T0, e a triangulação é refeita; os triângulos cujo centroide está fora da borda são removidos.
6. **Plano de região (plataforma e nivelada):** `zR(p) = cota + inclinacao · ((p − ref) · u)`, com `u = (cos direcao, sin direcao)`. O adaptador TS calcula `ref`.
7. **Cota proposta `zP(p)`:** começa em E(p) e, em ordem de `order`, aplica cada plataforma ou nivelada: dentro do contorno, `z = zR(p)`; fora, a cota fica limitada pelos taludes de aterro e de corte a partir do ponto do contorno mais próximo. Talude 0 quer dizer "sem limite daquele lado". A subdivisão não altera cota.
8. **Superfície proposta P:** vértices com cota `zP`, vindos de E (fora das regiões), dos contornos adensados, dos gêmeos 0,01 m para fora (bordas verticais) e, nas plataformas e niveladas com `D > 0,02`, de uma grade global de passo `h`. Até 40 000 pontos na grade; se passar, dobra-se `h` e sai o aviso 4. Triângulos fora da borda são removidos. Material de cada triângulo vem da região de maior `order` cujo contorno contém o centroide.
9. **Malha de desenho (`terreno_malha`):** triângulos com normal para cima, agrupados por região; mais a saia (um quadrilátero vertical por aresta de borda, até `min(z de E e de P) − espessuraBase`) e a base (os mesmos triângulos na cota da base, orientação invertida).
10. **Curvas de nível (`terreno_curvas`):** cotas `k · intervaloCurvas` entre o mínimo e o máximo. Vértice com cota igual à da curva conta como acima dela. Curva mestra quando `k mod mestraCada == 0`. Mais de 2 000 cotas distintas: `LIMITE`.
11. **Corte vertical (`terreno_corte`):** saída em `(s, z)`. Papel 0, cortado: interseção com P, fechada em baixo na cota da base. Papel 1, perfil existente: interseção com E, só quando há plataforma ou nivelada. Papel 2, silhueta: envoltória superior das partes de P visíveis até a profundidade, por 2 048 faixas de `s`.
12. **Quantidades (`quant_terreno`, `quant_terreno_regioes`):** área em planta; área de superfície de E e de P; `z_min`, `z_max`; volume de corte = ∫ max(E − P, 0) e volume de aterro = ∫ max(P − E, 0), calculados em subtriângulos de 16 partes nos triângulos ativos. Volume atribuído à região de menor `d`.
13. **Mapa de corte e aterro (`terreno_corte_aterro`):** subtriângulos com `|diferença média| > 0,01 m`, classificados em corte ou aterro.
14. **Avisos (não bloqueiam):** 1 pontos coincidentes com cotas diferentes; 2 linha que cruza outra (trecho ignorado); 3 regiões planas sobrepostas; 4 precisão reduzida (passo dobrado); 5 terreno sem triângulos; 6 região fora do terreno, total ou parcial.
15. **Determinismo:** mesma entrada, mesmos bytes de saída. Nenhum `NaN` nem infinito nas saídas.
16. **Cache:** T0 e E por terreno; P por terreno, com a assinatura de E mais as seções 163 e 164. A E2 fixou que a assinatura de cache cobre só as seções 161 e 162. Mudar cor, nome, `mostrarExistente`, rótulos ou pontos cotados não recalcula geometria.

**Decisões da R1 registradas pelo fiscal (E2):** `declividade` (consulta 163) é o módulo do gradiente em fração; triângulo com área menor ou igual a zero em f64 é descartado; trecho de borda ou de T0 que cruza é pulado com aviso 2.

**Registros do ESTADO sobre as regras:**

- Na R1, os avisos 1, 2 e 5 ficaram guardados e a consulta 168 aparecia como NAO_IMPLEMENTADO, para ser tratada na R2. O ESTADO não confirma se a consulta 168 foi fechada depois da R2; isso está a conferir.
- Limitação da R3 (regra 8 literal): região plana que passa da borda de E descarta os vértices de E dentro dela e os pontos do contorno fora de E. A área de P some nessa parte e sai o aviso 6. Ao desenhar a plataforma, é preciso avisar ou impedir contorno fora do terreno.

**Lote (TS, sem kernel).** Arquivo `packages/engine/src/loteGeometria.ts`, com só a API pública do `@hestia/geom` (`union`, `difference`, `intersection`, `ringArea`).

17. **Área edificável:** lote menos a união das faixas de recuo. Cada faixa é um "estádio" (retângulo de meia-largura `r` mais meio-círculo em cada ponta, com 12 trechos). Lado com recuo 0 não gera faixa.
18. **Índices (`loteIndices.ts`):**
    - projeção da edificação: união dos contornos de `Floor` e `Slab` de todos os níveis, recortada pelo lote;
    - área construída: soma, por nível, da união dos contornos de `Floor` e `Slab`, recortada pelo lote;
    - taxa de ocupação = projeção / área do lote; coeficiente de aproveitamento = área construída / área do lote;
    - permeabilidade = (área do lote − área da união de [projeção, regiões com `permeavel = false`]) / área do lote;
    - com a massa na branch (P5), a opção "incluir massas" soma as fatias de `massa_fatias`.
19. **Rumos e distâncias (só método de entrada; o modelo guarda o polígono):** cada linha tem azimute (graus a partir do norte verdadeiro, sentido horário) e distância. **Com a correção da E4:** direção no projeto = azimute + `norteVerdadeiro`, medida a partir de +y, sentido horário; o inverso é `azimute = direção do lado − norteVerdadeiro`, em [0, 360). Erro de fechamento = distância entre o último ponto calculado e o primeiro. O diálogo só aceita se for até 0,05 m, ou se o usuário marcar "fechar no primeiro ponto".

## 5. Contrato TS ↔ Rust

Origem: PLANO.md §A.5, com a versão atual do ESTADO.

- Arquivo: `crates/geom-wasm/schema/cena-v11.json`.
- Faixa reservada ao terreno: seções 160 a 199 e consultas 160 a 199 (D11). Ocupadas pelas outras frentes: seções 1 a 25, 60 a 81, 100 a 113 (cortina, reservada até 139) e 140 a 159 (massa); consultas 1 a 16, 60 a 65, 100 a 107 (cortina até 139) e 140 a 159 (massa).
- `versao`: o plano parte da versão 18; a ficha M2 sobe uma unidade, e o ESTADO registra "contrato versao 19" depois da M2. Os ids não mudam. `abi` continua 2.
- Mesmo esquema das outras frentes: `id_num u32` como chave, com `definir_secao`, `upsert` e `remover`.

Seções de entrada:

| id | nome | colunas (resumo) |
|---|---|---|
| 160 | `terrenos` | id_num, nivel_num, espessura_base, intervalo, mestra_cada |
| 161 | `terreno_linhas` | id_num, terreno_num, tipo (0 curva, 1 quebra, 2 borda), fechada |
| 162 | `terreno_vertices` | id_num, terreno_num, linha_num (ID_AUSENTE = ponto solto), ordem, x, y, z (z ignorado na borda) |
| 163 | `terreno_regioes` | id_num, terreno_num, ordem, papel (0 subdivisão, 1 plataforma, 2 nivelada), cota, inclinacao, direcao, ref_x, ref_y, talude_corte, talude_aterro |
| 164 | `terreno_regiao_pontos` | id_num, regiao_num, ordem, x, y |
| 165 | `terreno_sondas` | id_num, x, y (pontos onde `terreno_cotas` responde) |

Consultas (`superficie`: 0 existente, 1 proposta; `nivel_num` aceita `NIVEL_TODOS`):

| id | nome | argumentos |
|---|---|---|
| 160 | `terreno_malha` | nivel_num, superficie |
| 161 | `terreno_curvas` | nivel_num, superficie |
| 162 | `terreno_planta` | nivel_num, superficie |
| 163 | `terreno_cotas` | superficie |
| 164 | `terreno_corte` | nivel_num, ox, oy, dx, dy, profundidade |
| 165 | `quant_terreno` | nivel_num |
| 166 | `quant_terreno_regioes` | nivel_num |
| 167 | `terreno_corte_aterro` | nivel_num |
| 168 | `terreno_avisos` | nivel_num |

Regras:

- O Rust só lê as seções; não conhece o `Project`.
- O adaptador TS é `packages/engine/src/kernelTerreno.ts`. O esquema TS é regenerado por `scripts/gerar-esquema-kernel.mjs`.
- Os testes `contrato_confere_com_json` (Rust) e `esquema.test.ts` (TS) cobrem os ids novos.
- As seções 160 a 165 ficam fora de `invalidar_caches` das paredes.
- **Dependência:** `spade = { version = "2", default-features = false, features = ["std"] }` em `crates/geom-wasm/Cargo.toml`, acrescentada na R1, com o parágrafo correspondente no `NOTICE`. O plano prevê as bibliotecas que entram no binário (`spade`, `robust`, `num-traits`, `smallvec`, `hashbrown`, `foldhash`, `equivalent`, `allocator-api2`), a conferir com `cargo tree`. Nenhuma outra dependência nova.
- **Kernel desligado ou com erro:** os elementos continuam no modelo. A planta e o 3D mostram só a borda (ou a envoltória das fontes, pelo `convexHull` do `@hestia/geom`), tracejada, e o painel de avisos mostra `terreno-sem-kernel` ou `terreno-invalido`. Nenhum caminho TS gera malha, curvas ou perfil do terreno.

## 6. Interface em resumo

Origem: PLANO.md §A.6 e o ESTADO para o que foi entregue. A aba é **Massa e terreno**. Os painéis `mas-massa` e `mas-por-massa` são da frente da massa e não são tocados.

- **Painel Terreno (`mas-terreno`):** Topografia (com menu: Colocar pontos, Desenhar curvas, Importar levantamento); Editar terreno; Subdivisão, Plataforma e Região nivelada. Componente de terreno continua fora da v1.
- **Painel Lote (`mas-lote`):** Linhas de propriedade (com menu: Desenhar e Por tabela); Índices do lote; Envelope legal (só com massa).
- **Painel Análise (`mas-analise`):** Corte e aterro; Rótulo de curva; Cota de ponto.
- **Localização:** em Gerenciar › Gerenciar projeto.
- **Modo Editar terreno:** estado `terrenoEdicao: { terrenoId }`, sai com Esc ou Concluir. Acima de 500 vértices na tela, mostra "aproxime para editar pontos" e não desenha alças. Cada gesto concluído é um `editTerrainFontes`, com um desfazer.
- **Importar levantamento:** `.dxf` ou `.csv`, com a tabela de camadas (DXF) ou as colunas (CSV), unidade e simplificação das polilinhas (padrão 0,05 m; 0 desliga). Limite de 200 000 vértices.
- **Propriedades, alças, navegador, tabelas com CSV e avisos** seguem A.6.

O que está entregue, pelo ESTADO:

- Ferramenta `terrain` (T1), com seleção, mover, copiar e demais comandos levando as regiões.
- `terrainEdit`, `terrainLabel` e `terrainSpot` (T2), com o modo Editar terreno.
- `terrainRegion` (T3), com os botões Subdivisão, Plataforma e Região nivelada ativos.
- Faixa Massa e terreno, propriedades do terreno, da região, do lote e da Localização, barra de opções, navegador Terrenos e Lotes, e diálogos montados no App (U1).
- Diálogo de importação (I1, montado pela U1).
- Lote em planta com snaps (P2).

O que ainda não está entregue: ferramenta do lote e contorno por tabela (P3), tabela "Índices do lote" (P4), tabela "Terreno: corte e aterro" (U2), gravidade (G1) e E2E (Q1). Ver §11.

## 7. Integração: gravidade, corte e elevação, IFC e DXF

Origem: PLANO.md §A.7, com o ESTADO para X1, V3 e G1.

- **Gravidade (G1, pendente):** com o botão Gravidade ligado, a cota inicial do elemento criado vem do terreno proposto sob o primeiro clique: parede pelo `baseOffset`, piso e laje pelo `heightOffset`, plataforma e nivelada pela `cota`. É só o valor inicial, sem vínculo: mudar o terreno depois não move o elemento.
- **Massa (P5, condicional):** "Envelope legal" chama `addMass` com perfil livre, duas seções (z = 0 e z = `gabaritoMax`), no nível do lote. Só existe se o kind `mass` estiver na branch. O ESTADO registra que a massa estava ausente da `main` em 2026-11-13. A massa não conhece o lote nem o terreno.
- **Corte e elevação:** o terreno entra pelo mesmo mecanismo do guarda-corpo e da massa (`packages/render/src/section/`), sem mecanismo novo de oclusão. Registro da V3: traços do terreno atrás do edifício podem aparecer sobre a hachura (ordem do renderer), e as capturas de corte e elevação não foram geradas.
- **IFC (X1, mesclada):** o terreno sai como `IFCGEOGRAPHICELEMENT` com predefinido `TERRAIN`, contido no `IFCSITE`. Com localização, `RefElevation` do `IFCSITE` vem de `cotaZero`. Sem kernel, o terreno não sai e aparece um aviso, sem falha. Pelo ESTADO, a malha exportada é só da superfície, sem saia nem base. Lote e regiões não saem no IFC na v1.
- **DXF (X1, mesclada):** seis camadas na planta (`TERRENO_CURVAS`, `TERRENO_CURVAS_MESTRAS`, `TERRENO_BORDA`, `TERRENO_REGIAO`, `LOTE`, `LOTE_EDIFICAVEL`) e `CORTE_TERRENO` no corte. Curvas saem como LWPOLYLINE com elevação (código 38) igual à cota exibida (z + `cotaZero`). Malha IFC e corte ficam em z do projeto. As curvas do terreno existente não vão para o DXF.
- **Prancha:** a X1 não precisou alterar nada; usa `ModelScene` e as camadas de V1, V2 e V3.

## 8. Critérios de estabilidade

Origem: PLANO.md §A.8 (valem para todas as fases).

1. Nenhuma entrada do usuário derruba o app: elemento inválido é recusado pelo comando; erro do kernel vira aviso e desenho de reserva.
2. Fuzz no Rust: 200 terrenos aleatórios com semente fixa, sem pânico, saídas finitas, mesma saída em duas execuções, triângulos com área positiva e normal para cima, arestas internas em dois triângulos, curvas na sua cota e volumes não negativos.
3. Valores de referência das fixtures (A.10: T1 a T9, L1, L2 e I1) dentro das tolerâncias escritas.
4. Cache por assinatura: editar um terreno não recalcula os outros; mover uma região não recalcula E.
5. Tempo, alvo (não bloqueio, salvo acima do dobro), em terreno de 50 000 vértices: primeira `terreno_malha` até 1,5 s; consultas seguintes com cache até 50 ms; `terreno_curvas` até 200 ms; `terreno_corte` até 50 ms; `terreno_cotas` com uma sonda até 1 ms.
6. 3D: terreno opaco, um lote de malha por terreno e material; seleção, realce e picking; sem tremor entre plataforma e laje, a conferir visualmente.
7. Planta: clicar dentro do terreno não o seleciona; seleciona-se pela borda e pelas curvas.
8. Desfazer e refazer, copiar e colar, salvar e abrir, e migração cobertos por teste.
9. E2E com navegador: projeto de referência aberto em planta, corte, elevação, 3D e prancha, sem erro no console.

Medições registradas no ESTADO (a conferir contra os alvos do item 5):

- R1, Rust nativo, 50 mil pontos: primeira malha 0,54 s; com cache 16 ms; cota de uma sonda 16 µs.
- R3, Rust nativo, 50 mil vértices e 4 regiões: primeira malha 0,80 s; cache 16,8 ms; corte 4,8 ms; cota 13,8 µs; `quant_terreno` 48,7 ms; `corte_aterro` 46,9 ms. `terreno_curvas` em relevo realista não foi medido (só um caso patológico de 2,37 s); fica para Q1.
- V2, WASM real, 50 176 vértices: primeiro desenho da planta 478 ms; segundo 20 ms; snaps 123 ms.
- Não conferido ainda (V1): tremor plataforma/laje (item 6) e teste WASM com malha real no 3D.

## 9. O que não entra nesta entrega

Origem: PLANO.md §A.9.

- Tipos de terreno com camadas de solo.
- Furos na borda (lagos, ilhas).
- Vínculo persistente "base da parede acompanha o terreno" e reanexação automática quando o terreno muda.
- Componentes de terreno (árvore, poste, vaga).
- Terreno a partir de nuvem de pontos, de imagem de satélite ou de serviço de mapas.
- Importação de terreno por IFC ou LandXML.
- Hidrologia e drenagem; terraplenagem com camadas ou com fases de obra.
- Suavização de curvas (spline); correção de triângulos planos entre curvas.
- Curvas de nível desenhadas no 3D.
- Lote e regiões no IFC.
- Perfis de recuo por município; cálculo do gabarito real da edificação.
- Rótulo de curva arrastável.
- Imagem ou PDF como fundo (o DXF importado já serve de fundo para traçar).
- Terreno visível na planta de outros níveis além do seu.

## 10. Emendas durante a execução (E1 a E4)

Origem: PLANO.md, seção "Emendas".

- **E1 (2026-11-13, passo 0):** `cargo clippy -- -D warnings` já falha na base, com 39 avisos em código existente. O portão passa a ser: rodar `cargo clippy` sem `-D`; o total não passa de 39; nenhum aviso aponta para arquivo novo da frente (`terreno_*.rs`, `secoes_terreno.rs`). A P1 pode rodar junto com a M2 e com a cadeia R1 a R3, porque os arquivos são disjuntos.
- **E2 (2026-11-13, R1):** fixa a área de T2 em 400·√1,01 com tolerância 1e-6. Acrescenta `'tests/kernel-terreno*.wasm.test.ts'` ao `include` de `vitest.wasm.config.ts`. Confirma as decisões da R1: `declividade` é o módulo do gradiente em fração; triângulo com área menor ou igual a zero é descartado; a assinatura de cache cobre só as seções 161 e 162; trecho de borda ou de T0 que cruza é pulado com aviso 2.
- **E3 (2026-11-14, ordem do dono):** subagentes só podem usar Sonnet ou Haiku; Fable e Opus ficam proibidos. Haiku só em fichas pequenas e mecânicas; as de geometria pesada (R3, V3) usam Sonnet.
- **E4 (2026-11-15, decisão do fiscal, sem resposta do dono):** o sinal do norte verdadeiro passa a ser direção no projeto = azimute + `norteVerdadeiro`, como descrito na regra 19 da §4. A correção do código entra na ficha P3 (`packages/engine/src/loteRumos.ts`). O dono pode reverter.

## 11. Estado de entrega

Origem: tabela de `docs/terreno/ESTADO.md`, na data do próprio ESTADO (2026-11-15). O ESTADO diz "execução em andamento; retome da primeira ficha não mesclada".

Fichas mescladas, por fase do plano (estado de 2026-11-15, depois da P4):

- Fase 0: M1, M2.
- Fase 1: R1, R2, R3.
- Fase 2: E1, V1, V2, V3.
- Fase 3: I1, T1, T2, U1 (U1a e U1b), mais a T1b, que fechou o Alinhar e o Colar do terreno.
- Fase 4: T3, U2.
- Fase 5: P1, P2, P3, P4.
- Fase 6: G1, X1.

Pendentes: Q1 (E2E no navegador, medições e fecho; os checklists `docs/paridade/terrenos.md` e `lotes.md` e esta decisão já existem), P5 (envelope legal, condicional: só se a massa conceitual existir na branch, e hoje não existe) e F1 e F2 (Rastreamento e Referência, opcionais, dependem do "pode" do dono, D9).

Pelo ESTADO, ainda não foram conferidos visualmente: desenhar e editar terreno, importar levantamento, planta com curvas, 3D e corte (U1); desenhar região (T3); capturas de corte e elevação (V3). Só a faixa foi vista (`docs/terreno/evidencias/fase3/faixa-massa-e-terreno.png`).
