# Plano: terreno e lote (topografia, regiões, corte e aterro, linhas de propriedade, índices)

Data: 2026-11-13. Estado: **plano escrito; nada implementado; aguarda o "pode executar" do dono**.
Base conferida: `main` em `236aa298`, `SCHEMA_VERSION = 25`, contrato do kernel `versao 18`, `abi 2`.
Branch de trabalho: `claude/happy-einstein-sgyixh` (sai da `main`; **não** contém a massa).

Este arquivo é a única fonte do trabalho. Ele serve a três leitores:

- **o fiscal** (a sessão que coordena; pode ser um modelo mais simples): segue a Parte B passo a passo, sem decidir nada de projeto;
- **cada subagente**: recebe o bloco comum (Parte C) mais a sua ficha (Parte D);
- **o dono**: lê a Parte A (o que será entregue), o §A.0 (o que foi assumido e ele precisa confirmar) e o §A.9 (o que fica de fora).

Regra de ouro: **tudo o que é decisão de projeto já está decidido na Parte A.** Se algo não estiver escrito aqui, ninguém inventa: o subagente para e relata, o fiscal pergunta ao dono.

**Se você é o fiscal e acabou de chegar:** leia `docs/terreno/ESTADO.md`. Se ele diz "passo 0 pendente", vá para B.2. Senão, retome da primeira ficha não mesclada (B.4).

Documentos irmãos: `docs/massa/PLANO.md` e `docs/massa/ESTADO.md` (frente da massa, branch `claude/youthful-dirac-l4egd1`) e `docs/terreno/BRIEFING-PARA-PLANEJAR.md` (na mesma branch da massa; este plano já responde a ele).

---

# Parte A — O que será construído (decisões fechadas)

## A.0 Decisões assumidas (o dono confirma no passo 0; depois disso, "não reabrir")

Estas decisões foram tomadas por quem escreveu o plano. O fiscal lê a lista ao dono **uma vez** (B.2 passo 4) e grava a resposta no ESTADO. Sem resposta contrária, valem como estão.

| # | Decisão | Motivo | Se o dono disser não |
|---|---|---|---|
| D1 | **Dependência nova no kernel: `spade` 2.x** (triangulação de Delaunay com restrições, Rust puro, MIT OR Apache-2.0). | Triangulação robusta escrita à mão é a maior fonte de defeito desta frente. Conferido em 2026-11-13: `spade 2.15.1` compila para `wasm32-unknown-unknown` com o toolchain do repositório (1.97.1). O dono já usa `spade` no repositório `infraestrutura`. | **Parar antes da ficha R1** e devolver o plano a um modelo mais forte: as regras de A.4 precisam ser reescritas. |
| D2 | **Uma primitiva só: TIN** (malha de triângulos com linhas obrigatórias). Curvas de nível, perfil, volumes e cota em um ponto são derivados dela. Sem grade regular paralela. | Mesma lógica da "pilha de seções" da massa. | — |
| D3 | **Cotas do terreno são absolutas no projeto** (mesmo eixo z das elevações dos níveis). Mudar a elevação de um nível não move o terreno. | Levantamento chega em cota absoluta. | — |
| D4 | **Coordenadas locais.** O projeto guarda um deslocamento (`localizacao`) para a coordenada real (UTM) e a altitude real. Toda geometria fica perto da origem. | Coordenadas na casa dos milhões tremem no 3D. | — |
| D5 | **Entrada v1:** pontos clicados, curvas desenhadas, DXF de levantamento (com cota) e CSV de pontos. | É como o levantamento chega. | — |
| D6 | **Plataforma, região nivelada e subdivisão são um elemento só** (`terrainRegion`) com três papéis. Não destroem o terreno original: o kernel calcula "existente" e "proposto". | Menos kinds, e corte e aterro sai de graça. | — |
| D7 | **Recuos e índices são configuráveis por lote**, sem tabela de município. Todo limite é digitado pelo usuário. | Norma municipal não verificada entra como configurável (regra da rampa e do guarda-corpo). | — |
| D8 | **O lote não usa o kernel.** Área, recuos e índices são 2D e saem do `@hestia/geom` (booleanas já existentes). | Não é geometria pesada; evita contrato novo. | — |
| D9 | **Rastreamento e Referência é a Fase 7, opcional**, só de estado de interface (não grava no projeto), e só começa com o "pode" do dono, porque toca o estado das vistas (frente `vistas/*` em andamento). | Evitar conflito com a frente de vistas. | A fase não é feita. |
| D10 | **Esta frente não espera a massa.** Trabalha na própria branch, com ids próprios, e segue o protocolo de sincronização de B.7. As duas fichas que dependem da massa (P5) só rodam se a massa já estiver na `main`. | O dono quer dar andamento. | Esperar a massa fechar a fase 1 antes da ficha M2. |
| D11 | **Faixa de ids do kernel: seções 160–199 e consultas 160–199.** (O briefing propunha até 179; pedimos até 199 porque ids são para sempre.) | — | Usar 160–179 (cabe: hoje o plano usa 160–165 e 160–168). |

## A.1 Objetivo e resultado final

Três elementos novos e um dado de projeto:

- **Terreno** (`kind: 'terrain'`): superfície topográfica feita de pontos, curvas de nível, linhas de quebra e borda.
- **Região de terreno** (`kind: 'terrainRegion'`): polígono sobre um terreno. Três papéis: **subdivisão** (só material e área), **plataforma** (plano com bordas verticais, corta e aterra) e **região nivelada** (plano com taludes).
- **Lote** (`kind: 'lot'`): linhas de propriedade, papel e recuo de cada lado, limites urbanísticos.
- **Localização do projeto** (`Project.localizacao`): deslocamento para coordenada real, altitude da cota zero e norte verdadeiro.

O terreno aparece em **planta** (curvas de nível, borda, regiões, rótulos), **corte e elevação** (solo cortado com hachura, perfil existente tracejado), **3D** e **prancha**. O lote aparece em planta e prancha.

Pronto significa: o dono importa um DXF de levantamento, vê as curvas de nível e o 3D, ajusta a cota de um ponto, desenha uma plataforma sob a casa e lê o volume de corte e aterro; desenha o lote pela tabela de rumos e distâncias, define os recuos e lê taxa de ocupação, coeficiente de aproveitamento e permeabilidade numa tabela ao vivo. Tudo com desfazer, salvar e abrir, sem erro nem travamento.

Referências de produto (o que copiamos de cada um):

| Vem do Revit | Vem do Archicad |
|---|---|
| Subdivisão, plataforma, linhas de propriedade por tabela de rumos e distâncias, rótulo de curva por linha, ponto de levantamento e norte verdadeiro, tabela de corte e aterro | Edição direta de ponto e de cota no próprio terreno (malha), criar terreno a partir de curvas desenhadas, **gravidade** (elemento nasce na cota do terreno), **Rastreamento e Referência** (Fase 7) |

## A.2 A única primitiva: TIN

Todo terreno é uma **malha de triângulos em planta com uma cota por vértice** (TIN). Não há outro tipo de superfície na v1.

- O modelo guarda só as **fontes**: pontos, curvas de nível (polilinha com uma cota), linhas de quebra (polilinha com cota por vértice) e borda. A malha **nunca** é gravada no projeto: o kernel Rust a deriva das fontes.
- Curvas e quebras entram como **arestas obrigatórias** da triangulação.
- Há duas superfícies por terreno: **existente (E)**, só das fontes, e **proposta (P)**, que é E modificada pelas regiões. Sem região com efeito, P = E.
- Tudo o mais é derivado de E e P: curvas de nível, perfil de corte, cota em um ponto, áreas, volumes de corte e aterro.

| Ferramenta da interface | O que ela escreve |
|---|---|
| Topografia › Colocar pontos | `pontos` do terreno |
| Topografia › Desenhar curvas | `curvas` do terreno |
| Topografia › Importar levantamento | `pontos`, `curvas`, `quebras` (de DXF ou CSV) |
| Editar terreno | operações sobre as fontes (mover ponto, mudar cota, linha de quebra, borda, rótulos) |
| Subdivisão, Plataforma, Região nivelada | um `terrainRegion` com o papel correspondente |
| Linhas de propriedade | um `lot` |

## A.3 Modelo de dados (TS exato)

Arquivos novos em `packages/model/src/`: `terrainTypes.ts` (tipos e constantes do terreno e da região), `lotTypes.ts` (lote) e `localizacao.ts`. Metros e radianos. Listas grandes são vetores planos de números (mesmo estilo de `Generic.mesh.positions`), para o arquivo e o desfazer ficarem leves.

```ts
/** Curva de nível: polilinha com uma cota só. `xy` = x0, y0, x1, y1... (2 ou mais pontos). */
export interface CurvaTerreno { z: number; xy: number[]; fechada: boolean }

/** Linha de quebra: polilinha com cota por vértice. `xyz` = x0, y0, z0, x1, y1, z1... (2 ou mais pontos). */
export interface QuebraTerreno { xyz: number[] }

export interface Terrain {
  id: Id;
  kind: 'terrain';
  /** Nível em cuja planta o terreno é desenhado. NÃO define cota: todas as cotas abaixo são absolutas no projeto. */
  levelId: Id;
  name: string;
  /** Pontos soltos: x0, y0, z0, x1, y1, z1... */
  pontos: number[];
  curvas: CurvaTerreno[];
  quebras: QuebraTerreno[];
  /** Polígono simples, anti-horário: x0, y0, x1, y1... (3 ou mais pontos). Ausente = envoltória convexa das fontes. */
  borda?: number[];
  /** Equidistância das curvas de nível desenhadas (m). Padrão 1. Mínimo 0,05. */
  intervaloCurvas: number;
  /** Uma curva mestra a cada N curvas. Padrão 5. Inteiro de 1 a 100. */
  mestraCada: number;
  /** Quanto o corpo do terreno desce abaixo do ponto mais baixo (m), no corte e no 3D. Padrão 3. De 0,1 a 100. */
  espessuraBase: number;
  /** Desenha também as curvas do terreno existente (tracejadas) quando há regiões que o alteram. Padrão false. */
  mostrarExistente: boolean;
  /** Linhas de rótulo de curva: x1, y1, x2, y2 por linha. Onde a linha cruza uma curva mestra aparece a cota. */
  linhasRotulo: number[];
  /** Pontos cotados: x, y por ponto. Cada um mostra a cota do terreno proposto ali. */
  pontosCotados: number[];
  materialId?: Id;
  color?: string;
  order: number;
}

export type PapelRegiaoTerreno = 'subdivisao' | 'plataforma' | 'nivelada';

export interface TerrainRegion {
  id: Id;
  kind: 'terrainRegion';
  levelId: Id;
  name: string;
  /** Terreno a que pertence. Apagar o terreno apaga as suas regiões. */
  terrenoId: Id;
  /** Polígono simples, anti-horário, 3 a 512 pontos, sem arcos. */
  contorno: Vec2[];
  papel: PapelRegiaoTerreno;
  /** Só plataforma e nivelada. Cota absoluta do plano no ponto de referência (média dos vértices do contorno). */
  cota: number;
  /** Só plataforma e nivelada. Declividade do plano (0,02 = 2 %). De 0 a 1. Padrão 0. */
  inclinacao: number;
  /** Só plataforma e nivelada. Direção em que o plano SOBE (rad, a partir de +x). */
  direcao: number;
  /** Talude onde o terreno é cortado: metros na horizontal para 1 m na vertical. 0 = borda vertical. De 0 a 10. */
  taludeCorte: number;
  /** Talude onde o terreno é aterrado. Mesma convenção. */
  taludeAterro: number;
  /** Conta como área permeável nos índices do lote. Padrão: true na subdivisão, false na plataforma e na nivelada. */
  permeavel: boolean;
  materialId?: Id;
  color?: string;
  order: number;
}

export const TERRENO_LIMITES = {
  /** Soma de pontos soltos, vértices de curvas, de quebras e de borda de UM terreno. */
  vertices: 200_000, curvas: 20_000, quebras: 5_000,
  intervaloMin: 0.05, mestraMax: 100, espessuraMin: 0.1, espessuraMax: 100,
  regiaoPontos: 512, regioesPorTerreno: 256, linhasRotulo: 64, pontosCotados: 256,
  taludeMax: 10, inclinacaoMax: 1, coordMax: 100_000, cotaMax: 10_000,
} as const;
```

```ts
// lotTypes.ts
export type PapelLadoLote = 'frente' | 'lateral' | 'fundo';
export interface LadoLote { papel: PapelLadoLote; /** Recuo obrigatório deste lado (m), 0 ou mais. */ recuo: number }

export interface LimitesLote {
  /** Frações (0,5 = 50 %). Ausente = sem limite informado. Sempre digitados pelo usuário (a conferir na lei local). */
  taxaOcupacaoMax?: number;
  coefAproveitamentoMax?: number;
  permeabilidadeMin?: number;
  /** Altura máxima (m) acima da cota do nível do lote. Usada pelo "Envelope legal". */
  gabaritoMax?: number;
}

export interface Lot {
  id: Id;
  kind: 'lot';
  levelId: Id;
  name: string;
  /** Polígono simples, anti-horário, 3 a 256 pontos. */
  contorno: Vec2[];
  /** Mesmo tamanho de `contorno`. O lado i vai de contorno[i] a contorno[i+1] (o último fecha no primeiro). */
  lados: LadoLote[];
  limites: LimitesLote;
  /** Desenha a área edificável (lote menos recuos) tracejada. Padrão true. */
  mostrarEdificavel: boolean;
  color?: string;
  order: number;
}
export const LOTE_LIMITES = { pontos: 256, recuoMax: 1000 } as const;
```

```ts
// localizacao.ts
export interface Localizacao {
  /** Coordenada real (leste, norte), em metros, do ponto (0, 0) do projeto. */
  origemE: number;
  origemN: number;
  /** Altitude real (m) da cota 0 do projeto. Cota exibida = z do projeto + cotaZero. */
  cotaZero: number;
  /** Norte verdadeiro: ângulo (rad) medido do eixo +y do projeto, sentido horário. 0 = o norte é +y. */
  norteVerdadeiro: number;
  /** Texto livre do sistema de referência (ex.: "SIRGAS 2000 / UTM 23S"). Só informação. */
  sistema?: string;
}
// Project ganha:  localizacao?: Localizacao   (ausente = tudo zero)
```

Decisões do modelo:

1. **Sem tipos (`TerrainType`, `LotType`) na v1.** Os três elementos são só instância, como `Room`, `Generic` e `Mass`. Os painéis de propriedades, portanto, **não** são painéis de família (regra 2 do contrato de famílias não se aplica; classifique-os como "sem família" no teste-guarda).
2. `Element` ganha `Terrain`, `TerrainRegion` e `Lot`. `GraphicsCategory` ganha `'site'` (terreno e regiões) e `'lot'`. Estilo padrão: `site` peso de corte 3, projeção 1, cor DXF ACI 34; `lot` peso de projeção 3, traço-dois-pontos, cor DXF ACI 1.
3. **`SCHEMA_VERSION` sobe uma vez só nesta frente** (ficha M1), com migração que **não altera dados** (todos os campos novos do projeto são opcionais). O número é "o próximo livre": hoje 25 → 26. Se ao mesclar a `main` o número já estiver ocupado, renumera-se (B.7). **Todos os tipos da frente entram na M1**, mesmo os que só ganham ferramenta em fases posteriores.
4. Comandos (todos com desfazer):
   - `addTerrain`, `updateTerrain` (patch dos campos simples: nome, nível, intervalo, mestra, espessura, mostrarExistente, material, cor);
   - `editTerrainFontes(terrenoId, ops)`: lista de operações aplicada de uma vez (um passo de desfazer). Operações: `addPonto {x,y,z}`, `movePonto {i,x,y,z}`, `removePonto {i}`, `addCurva {z,xy,fechada}`, `setCurvaZ {i,z}`, `moveVerticeCurva {i,j,x,y}`, `removeCurva {i}`, `addQuebra {xyz}`, `moveVerticeQuebra {i,j,x,y,z}`, `removeQuebra {i}`, `setBorda {xy | null}`, `setLinhasRotulo {v}`, `setPontosCotados {v}`, `substituirFontes {pontos,curvas,quebras}` (usada pela importação). Índices são posições nas listas no momento da operação;
   - `addTerrainRegion`, `updateTerrainRegion` (patch), `setTerrainRegionContorno`;
   - `addLot`, `updateLot` (patch de nome, limites, mostrarEdificavel, cor), `setLotContorno(loteId, contorno, lados)`;
   - `setLocalizacao(loc | null)`;
   - apagar pelo comando genérico. **Apagar um terreno apaga as regiões com `terrenoId` igual** (na mesma transação; molde: parede e suas aberturas).
5. `transform` genérico leva os três kinds:
   - **terreno**: translação, rotação e espelho aplicados a todo par (x, y) de `pontos`, `curvas`, `quebras`, `borda`, `linhasRotulo` e `pontosCotados`; z não muda; no espelho a ordem da `borda` é invertida (continua anti-horária);
   - **região**: `contorno` transformado; rotação soma o ângulo a `direcao`; espelho em torno de uma linha de ângulo φ: `direcao' = 2φ − direcao` e a ordem dos pontos é invertida;
   - **lote**: `contorno` transformado; no espelho, com n pontos, `contorno'[k] = espelho(contorno[(n − k) mod n])` e `lados'[k] = lados[n − 1 − k]` (cada lado mantém o seu papel e o seu recuo).
6. Validação no modelo (`terrainIssue`, `terrainRegionIssue`, `lotIssue`: `string | null`; os comandos **recusam** elemento inválido):
   - todos: números finitos; |x| e |y| ≤ `coordMax`; |z| ≤ `cotaMax`;
   - terreno: vetores com tamanho múltiplo de 3 (ou de 2, ou de 4, conforme o campo); curva com 2 ou mais pontos; quebra com 2 ou mais; borda com 3 ou mais, simples, área > 0 (o comando normaliza o sentido); limites de `TERRENO_LIMITES`; `intervaloCurvas`, `mestraCada`, `espessuraBase` na faixa. **Terreno com menos de 3 vértices é aceito** (é o estado durante a criação); o kernel avisa (aviso 5);
   - região: `terrenoId` existe e é terreno; contorno simples, área > 0 (sentido normalizado), 3 a 512 pontos; `inclinacao`, taludes na faixa;
   - lote: contorno simples, área > 0, 3 a 256 pontos; `lados.length === contorno.length`; recuo de 0 a `recuoMax`; limites, quando presentes, > 0 (frações ≤ 100 para o coeficiente, ≤ 1 para as demais).
7. Cota exibida ao usuário: sempre `z + localizacao.cotaZero`, formatada por `formatQuantity`. Campo de cota digitado: o inverso. Função única `cotaExibida(p, z)` / `cotaDoProjeto(p, valor)` em `localizacao.ts`.

## A.4 Regras de geometria (o kernel Rust segue exatamente isto)

**Ordem canônica dos vértices de um terreno:** pontos soltos na ordem do vetor; depois os vértices de cada curva, curva por curva; depois os de cada quebra. O adaptador TS numera `id_num` nesta ordem, e o Rust percorre por `id_num` crescente.

1. **Fusão.** Dois vértices com a mesma chave `(round(x·1000), round(y·1000))` são o mesmo vértice; vale o primeiro na ordem canônica. Se as cotas diferem em mais de 0,001 m, aviso 1 no ponto.
2. **Arestas obrigatórias.** Cada trecho de curva (pares consecutivos, mais o trecho de fecho se `fechada`) e cada trecho de quebra é uma restrição, inserida na ordem canônica. Trecho cujas duas pontas caíram no mesmo vértice é ignorado. **Antes de inserir, testar `can_add_constraint`**; se for falso (cruza restrição já inserida), o trecho é pulado e sai o aviso 2 no ponto médio do trecho. **Nunca chamar uma API da `spade` que entra em pânico** (o WASM é compilado com `panic = "abort"`). Erro de inserção de vértice (não finito) vira `ENTRADA`.
3. **T0** = triangulação de Delaunay com restrições dos vértices e arestas acima. Menos de 3 vértices, ou todos colineares (zero triângulo): o terreno devolve saídas vazias e o aviso 5. Não é erro.
4. **Cota em (x, y) numa malha:** localizar o triângulo; interpolação linear (baricêntrica). Em aresta ou vértice, qualquer triângulo incidente dá o mesmo valor. Fora da malha: "fora".
5. **Superfície existente E.**
   - Sem `borda`: E = T0.
   - Com `borda`: (a) a borda é adensada com passo `max(1 m, perímetro / 2000)`, mantendo os cantos; (b) cada ponto da borda recebe a cota de T0 naquele (x, y); se estiver fora de T0, a cota do vértice de T0 mais próximo em planta (empate: menor `id_num`); (c) E = triangulação com restrições de: os vértices de T0 **dentro ou sobre** a borda, os pontos da borda, os trechos da borda como restrições, e as restrições de T0 cujas duas pontas ficaram; (d) removem-se os triângulos cujo centroide está fora da borda.
6. **Plano de uma região** (papéis plataforma e nivelada): `zR(p) = cota + inclinacao · ((p − ref) · u)`, com `u = (cos direcao, sin direcao)` e `ref` = média aritmética dos vértices do contorno (o adaptador TS calcula e envia).
7. **Cota proposta em um ponto p**, função única `zP(p)`: começa com `z = E(p)`. Para cada região do terreno **com papel plataforma ou nivelada**, em ordem crescente de `order` (empate: `id_num`):
   - se p está dentro ou sobre o contorno G: `z = zR(p)`;
   - senão, sejam `q` o ponto de G mais próximo de p e `d` a distância: se `d ≤ D`, `z = limitar(z, zR(q) − d / taludeAterro, zR(q) + d / taludeCorte)`. Talude 0 significa "sem limite daquele lado" (borda vertical).
   - `D` (alcance da região) = `0,02` se os dois taludes são 0; senão `min(50, Hmax · max(taludeCorte, taludeAterro) + h)`, onde `Hmax` é o maior `|E(q) − zR(q)|` nos pontos do contorno adensado.
   - `h` (passo da região) = `limitar(sqrt(área de G) / 40, 0,25, 2,0)`.
   Subdivisão não altera cota.
8. **Superfície proposta P** (só é diferente de E quando há plataforma ou nivelada; subdivisão só divide a malha). Vértices, nesta ordem, **todos com cota `zP(p)`**:
   - (a) os vértices de E que **não** estão estritamente dentro do contorno de alguma plataforma ou nivelada;
   - (b) para cada região (os três papéis), em ordem de `order`: o contorno adensado com passo `h` (cantos mantidos);
   - (c) para cada plataforma ou nivelada: um "gêmeo" de cada ponto do contorno adensado, 0,01 m para fora (na normal do trecho; nos cantos, na direção da soma normalizada das normais dos dois trechos). É o que faz a borda vertical;
   - (d) para cada plataforma ou nivelada com `D > 0,02`: os pontos da grade global de passo `h` (coordenadas múltiplas de `h`) com `0,02 < d ≤ D`, fora de G e dentro do domínio de E. Se passarem de 40 000 pontos, dobra-se `h` até caber e sai o aviso 4.
   - Vértices de (a), (c) e (d) estritamente dentro do contorno de **outra** plataforma ou nivelada são descartados. Vértice fora do domínio de E é descartado.
   - Restrições: os trechos dos contornos adensados de todas as regiões; depois as restrições de E cujas duas pontas ficaram. Todas passam pelo teste da regra 2 (as de E que cruzarem são puladas **sem** aviso).
   - Removem-se os triângulos fora da borda, como em E.
   - **Região do triângulo** (para material e quantidades): a região de maior `order` cujo contorno contém o centroide; nenhuma = "sem região".
   - Duas plataformas ou niveladas cujos contornos se sobrepõem: aviso 3 (o resultado continua definido pela regra 7).
   - Região com ponto do contorno fora do domínio de E: aviso 6.
9. **Malha de desenho** (`terreno_malha`): triângulos da superfície pedida, com a normal para cima, agrupados por região. Mais a **saia**: um quadrilátero vertical por aresta de borda, da superfície até `z_base = min(z de E e de P) − espessuraBase`. Mais a **base**: os mesmos triângulos da superfície, na cota `z_base`, com a orientação invertida.
10. **Curvas de nível** (`terreno_curvas`): cotas `k · intervaloCurvas`, k inteiro, entre o mínimo e o máximo da superfície. Vértice com cota **igual** à da curva conta como **acima** dela (regra única; evita caso degenerado). Um segmento por triângulo atravessado; segmento menor que `1e-9` é descartado; os segmentos são encadeados por extremidade quantizada em `1e-7`. Curva mestra: `k mod mestraCada == 0`. Mais de 2 000 cotas distintas: `LIMITE`.
11. **Corte vertical** (`terreno_corte`), saída em `(s, z)` com a mesma convenção de `guarda_corte` (ler `gc_corte.rs` antes):
    - **papel 0, cortado**: interseção do plano com P, ordenada por `s`, fechada por baixo em `z_base`. Um polígono por trecho contínuo.
    - **papel 1, perfil existente**: interseção do plano com E, polilinha aberta. Só é emitida quando o terreno tem plataforma ou nivelada.
    - **papel 2, silhueta**: para a parte de P no lado visível até `profundidade`: envoltória superior. Método: 2 048 faixas iguais de `s` na extensão do terreno; cada aresta de P no lado visível é projetada em `(s, z)` e atualiza o máximo das faixas que cobre (interpolando ao longo da aresta); sai uma polilinha por trecho contínuo de faixas com dado.
12. **Quantidades** (`quant_terreno`, `quant_terreno_regioes`): área em planta; área de superfície de E e de P (soma das áreas 3D dos triângulos); `z_min`, `z_max`; **volume de corte** = ∫ max(E − P, 0) e **volume de aterro** = ∫ max(P − E, 0). Método: só nos triângulos de P "ativos" (algum vértice com `|zP − E| > 1e-9`, ou centroide a menos de `D` de alguma plataforma ou nivelada); cada um é dividido em 16 subtriângulos iguais; em cada subtriângulo a diferença `P − E` é avaliada nos 3 cantos (E pela regra 4) e as partes positiva e negativa são integradas em forma fechada (função linear sobre triângulo, cortada na linha de zero). Volume de um triângulo ativo é atribuído à região de menor `d` (empate: maior `order`).
13. **Mapa de corte e aterro** (`terreno_corte_aterro`): os subtriângulos da regra 12 com `|diferença média| > 0,01 m`, classificados em corte ou aterro.
14. **Avisos do kernel** (não bloqueiam): `1` pontos coincidentes com cotas diferentes; `2` linha cruza outra (trecho ignorado); `3` regiões planas sobrepostas; `4` precisão reduzida (passo dobrado); `5` terreno sem triângulos; `6` região fora do terreno (total ou parcialmente).
15. **Determinismo.** Mesmas seções de entrada, mesmos bytes de saída. Ordem: `terreno_num`, depois a ordem natural de cada saída. Nenhum `NaN` nem infinito nas saídas (entrada com `NaN` é `ENTRADA`).
16. **Cache no kernel:** T0 e E por terreno (assinatura das seções 160 a 162 daquele terreno); P por terreno (assinatura de E mais as seções 163 e 164). As seções 160 a 165 ficam **fora** de `invalidar_caches` das paredes (molde: emenda E2 da massa e `secoes_gc.rs`). A seção 165 (sondas) nunca invalida malha.

**Lote (TS, sem kernel).** Arquivo `packages/engine/src/loteGeometria.ts`, usando só a API pública do `@hestia/geom` (`union`, `difference`, `intersection`, `ringArea`):

17. **Área edificável** = lote menos a união das faixas de recuo. Faixa do lado i (recuo `r > 0`): o conjunto dos pontos a distância ≤ `r` do segmento do lado, como polígono "estádio": retângulo de meia-largura `r` em torno do segmento mais meio-círculo em cada ponta, cada meio-círculo com 12 trechos. Lado com recuo 0 não gera faixa.
18. **Índices** (`loteIndices.ts`):
    - **projeção da edificação** = união dos contornos resolvidos de todos os `Floor` e `Slab` do projeto (todos os níveis), recortada pelo lote;
    - **área construída** = soma, por nível, da área da união dos contornos de `Floor` e `Slab` daquele nível, recortada pelo lote;
    - **taxa de ocupação** = área da projeção / área do lote; **coeficiente de aproveitamento** = área construída / área do lote;
    - **permeabilidade** = (área do lote − área da união de [projeção, regiões de terreno com `permeavel = false`], recortada pelo lote) / área do lote;
    - quando a massa existir no projeto (ficha P5), a opção "incluir massas" soma as fatias de `massa_fatias` do mesmo jeito que pisos e lajes.
19. **Tabela de rumos e distâncias** (só método de entrada; o modelo guarda o polígono): cada linha tem azimute (graus, a partir do **norte verdadeiro**, sentido horário) e distância. Direção no projeto: ângulo a partir de +y, sentido horário = `azimute − norteVerdadeiro`. **Erro de fechamento** = distância entre o último ponto calculado e o primeiro; o diálogo mostra o erro e só aceita se for ≤ 0,05 m ou se o usuário marcar "fechar no primeiro ponto".

## A.5 Contrato TS ↔ Rust

Em `crates/geom-wasm/schema/cena-v11.json`. **Faixa reservada ao terreno: seções 160 a 199 e consultas 160 a 199.** Ocupadas por outras frentes: seções 1–25, 60–81, 100–113 (cortina, reservada até 139), 140–159 (massa); consultas 1–16, 60–65, 100–107 (cortina até 139), 140–159 (massa). `versao` sobe uma unidade na ficha M2 (o próximo livre; os **ids** não mudam). `abi` continua 2. Mesmo esquema das outras frentes: `id_num u32` como chave, `definir_secao` / `upsert` / `remover`.

Seções de entrada:

| id | nome | colunas |
|---|---|---|
| 160 | `terrenos` | `id_num u32, nivel_num u32, espessura_base f64, intervalo f64, mestra_cada u32` |
| 161 | `terreno_linhas` | `id_num u32, terreno_num u32, tipo u8 (0 curva, 1 quebra, 2 borda), fechada u8` |
| 162 | `terreno_vertices` | `id_num u32, terreno_num u32, linha_num u32 (ID_AUSENTE = ponto solto), ordem u32, x f64, y f64, z f64` (z ignorado nos vértices de borda) |
| 163 | `terreno_regioes` | `id_num u32, terreno_num u32, ordem u32, papel u8 (0 subdivisão, 1 plataforma, 2 nivelada), cota f64, inclinacao f64, direcao f64, ref_x f64, ref_y f64, talude_corte f64, talude_aterro f64` |
| 164 | `terreno_regiao_pontos` | `id_num u32, regiao_num u32, ordem u32, x f64, y f64` |
| 165 | `terreno_sondas` | `id_num u32, x f64, y f64` (pontos onde `terreno_cotas` responde) |

Consultas (argumento `superficie`: 0 existente, 1 proposta; `nivel_num` aceita `NIVEL_TODOS`):

| id | nome | args | saídas |
|---|---|---|---|
| 160 | `terreno_malha` | `nivel_num, superficie` | `grupos u32 [terreno_num, regiao_num (ID_AUSENTE = sem região), papel (0 superfície, 1 saia, 2 base), primeiro_indice, n_indices]`, `vertices f64 [x, y, z]`, `indices u32` |
| 161 | `terreno_curvas` | `nivel_num, superficie` | `linhas u32 [terreno_num, mestra (0/1), fechada (0/1), n_pontos]`, `pontos f64 [x, y]`, `cotas f64 [z]` (uma por linha) |
| 162 | `terreno_planta` | `nivel_num, superficie` | `linhas u32 [terreno_num, papel (0 borda), fechada (0/1), n_pontos]`, `pontos f64 [x, y]` |
| 163 | `terreno_cotas` | `superficie` | `linhas u32 [sonda_num, terreno_num (ID_AUSENTE = fora de todo terreno)]`, `valores f64 [z, declividade]` (terrenos sobrepostos: responde o de menor `id_num`) |
| 164 | `terreno_corte` | `nivel_num, ox, oy, dx, dy, profundidade` | `linhas u32 [terreno_num, papel (0 cortado, 1 perfil existente, 2 silhueta), fechada (0/1), n_pontos]`, `pontos f64 [s, z]` |
| 165 | `quant_terreno` | `nivel_num` | `linhas u32 [terreno_num]`, `valores f64 [area_planta, area_sup_existente, area_sup_proposta, z_min, z_max, volume_corte, volume_aterro, n_triangulos]` |
| 166 | `quant_terreno_regioes` | `nivel_num` | `linhas u32 [regiao_num, terreno_num]`, `valores f64 [area_planta, area_superficie, volume_corte, volume_aterro]` |
| 167 | `terreno_corte_aterro` | `nivel_num` | `grupos u32 [terreno_num, tipo (0 corte, 1 aterro), primeiro_ponto, n_pontos]`, `pontos f64 [x, y]` (3 por triângulo) |
| 168 | `terreno_avisos` | `nivel_num` | `avisos u32 [terreno_num, codigo, regiao_num, indice]`, `valores f64 [medido, limite, x, y, z]` |

Regras: o Rust só lê as seções (não conhece `Project`); o adaptador TS é `packages/engine/src/kernelTerreno.ts`; o esquema TS é regenerado por `scripts/gerar-esquema-kernel.mjs`; os testes `contrato_confere_com_json` (Rust) e `esquema.test.ts` (TS) cobrem os ids novos.

**Dependência:** `spade = { version = "2", default-features = false, features = ["std"] }` em `crates/geom-wasm/Cargo.toml` (decisão D1), acrescentada **só** na ficha R1, com o parágrafo correspondente no `NOTICE` (bibliotecas que entram no binário: `spade`, `robust`, `num-traits`, `smallvec`, `hashbrown`, `foldhash` [Zlib], `equivalent`, `allocator-api2`; conferir com `cargo tree`). Nenhuma outra dependência nova, nem em `Cargo.toml` nem em `package.json`.

**Kernel desligado ou com erro:** os elementos continuam no modelo; a planta e o 3D mostram só a borda (ou a envoltória das fontes, calculada com `convexHull` do `@hestia/geom`) tracejada, e o painel de avisos mostra `terreno-sem-kernel` ou `terreno-invalido`. **Nenhum caminho TS gera a malha, as curvas ou o perfil do terreno** (sem segunda fonte da verdade). Pontos e curvas **das fontes** podem ser desenhados pelo TS no modo de edição: são dados do modelo, não geometria derivada.

## A.6 Interface

Aba **Massa e terreno** (`apps/web/src/ui/ribbon/tabsSoon.ts`). O painel `mas-massa` e o `mas-por-massa` são da frente da massa: **não tocar**. O terreno mexe só nos painéis abaixo.

| Painel | Botão | Ação | Fase |
|---|---|---|---|
| Terreno (`mas-terreno`) | **Topografia** (com menu) | **Colocar pontos**: clique coloca ponto na cota do campo "Cota" da barra de opções. **Desenhar curvas**: polilinha pelo núcleo comum de desenho, com a cota do campo; Enter conclui a curva e a cota avança pelo campo "Passo". **Importar levantamento…**: abre o diálogo de importação. Enter final cria o terreno (ou acrescenta ao terreno selecionado). | 3 |
| | **Editar terreno** | Entra no modo de edição do terreno selecionado (ver abaixo). Duplo clique no terreno faz o mesmo. | 3 |
| | **Subdivisão** | Desenha polígono fechado sobre um terreno; cria região com papel `subdivisao`. | 4 |
| | **Plataforma** | Desenha polígono, ou clica numa laje ou piso para copiar o contorno; cota inicial = face inferior do elemento clicado, ou a do campo "Cota"; taludes 0. | 4 |
| | **Região nivelada** | Desenha polígono; cota do campo; taludes padrão 1,5 (corte) e 2 (aterro). | 4 |
| | Componente de terreno | Continua `soon` (fora da v1). | — |
| Lote (`mas-lote`, novo) | **Linhas de propriedade** (com menu) | **Desenhar**: polígono pelo núcleo comum. **Por tabela…**: diálogo de rumos e distâncias. | 5 |
| | **Índices do lote** | Abre a tabela de índices. | 5 |
| | **Envelope legal** | Gera uma massa com a área edificável e o gabarito (só se a massa existir; senão `soon`). | 5 |
| Análise do terreno (`mas-analise`, novo) | **Corte e aterro** | Abre a tabela de volumes; a caixa "Mapa" liga o mapa de corte e aterro na planta. | 4 |
| | **Rótulo de curva** | Dois cliques: uma linha; onde ela cruza curvas mestras aparece a cota. | 3 |
| | **Cota de ponto** | Um clique: marca a cota do terreno proposto ali. | 3 |
| Gerenciar › Gerenciar projeto | **Localização** | Diálogo: leste, norte, altitude da cota zero, norte verdadeiro (graus), sistema. | 3 |

Outros pontos da interface:

- **Modo "Editar terreno"** (estado de interface `terrenoEdicao: { terrenoId }`; Esc ou "Concluir" sai). Mostra as fontes: pontos, vértices de curvas e de quebras. Com mais de 500 vértices na tela, mostra a mensagem "aproxime para editar pontos" e não desenha alças. Ações: clicar seleciona o vértice mais próximo (tolerância de tela); arrastar move em planta; campo **Cota** na barra de opções edita a cota do ponto (ou da curva inteira, se o vértice é de curva); Delete remove; botões do modo: **Ponto**, **Curva**, **Linha de quebra** (polilinha; cota de cada vértice = a do terreno ali, ou a digitada), **Borda** (polígono; "Remover borda" volta à envoltória). Cada gesto concluído é um `editTerrainFontes` (um desfazer).
- **Diálogo "Importar levantamento"**: escolhe arquivo `.dxf` ou `.csv`. DXF: tabela de camadas com contagem de entidades com cota e faixa de z, e para cada camada o destino (ignorar, pontos, curvas, linhas de quebra); unidade (detectada); **simplificação** das polilinhas (tolerância, padrão 0,05 m; 0 desliga). CSV: separador e ordem das colunas (`x y z` ou `n e z`) detectados e ajustáveis. Se as coordenadas forem maiores que 100 000 m em módulo e o projeto não tiver `localizacao`, o diálogo propõe: origem = centro da caixa arredondado para 100 m; altitude da cota zero = menor z arredondado para baixo. Mostra a contagem final de vértices contra o limite de 200 000. Aplicar = uma transação (localização mais terreno), um desfazer.
- **Propriedades** (`TerrainProperties.tsx`, `TerrainRegionProperties.tsx`, `LotProperties.tsx`), cada uma com os campos de A.3 e leituras calculadas: terreno (vértices, área em planta, cota mínima e máxima, volumes de corte e de aterro, botões "Editar terreno" e "Importar…"); região (área, volumes); lote (área, perímetro, área edificável; tabela de lados com comprimento, azimute, papel e recuo, editáveis).
- **Alças em planta**: região e lote têm alça em cada vértice (molde: `outlineEdit.ts`). A plataforma e a nivelada têm também a seta da direção de subida quando `inclinacao > 0`.
- **Navegador**: categorias "Terrenos" e "Lotes".
- **Tabelas com CSV**: "Terreno: corte e aterro" (terreno, região, papel, área, corte, aterro, saldo; rodapé com totais) e "Índices do lote" (lote, área, área edificável, projeção, área construída, taxa de ocupação, coeficiente, permeabilidade, cada um com o limite e a marca "dentro" ou "excede").
- **Avisos**: os 6 do kernel, mais `lote-excede-ocupacao`, `lote-excede-coeficiente`, `lote-abaixo-permeabilidade`, `lote-edificacao-fora-do-edificavel` (projeção fora da área edificável), todos com "Ir para".
- **Barra de status**: em planta, com o cursor sobre um terreno, mostra a cota do terreno proposto ("z terreno"). Botão **Gravidade** ao lado de Orto e Snap (ficha G1).
- **Textos**: pt e en pelo i18n existente. Prefixos reservados: `md_tn_*`, `tl_tn_*`, `ui_tn_*` (terreno e região), `md_lt_*`, `tl_lt_*`, `ui_lt_*` (lote), `ui_loc_*` (localização), `ui_rf_*` (referência), `md_cat_site`, `md_cat_lot`. Valores pela unidade do projeto (`formatQuantity`).

## A.7 Integração com o resto do projeto

- **Gravidade** (ficha G1): com o botão ligado, a cota inicial do elemento criado vem do terreno proposto sob o **primeiro clique**: parede (`baseOffset`), piso e laje (`heightOffset`), plataforma e nivelada (`cota`). Valor = cota do terreno menos a elevação do nível (ou a cota absoluta, na região). Sem terreno sob o clique, nada muda. É só valor inicial: **sem vínculo** (mudar o terreno depois não move o elemento).
- **Massa** (ficha P5, só se o `kind 'mass'` existir na branch): "Envelope legal" chama o comando público `addMass` com perfil `livre` (um por polígono da área edificável; mais de 256 pontos: simplificar; com furo: recusar com mensagem), 2 seções (z = 0 e z = `gabaritoMax`), `baseOffset` 0, no nível do lote. Os índices ganham a opção "incluir massas" por `massa_fatias`. **A massa não conhece o lote nem o terreno.**
- **Corte e elevação**: o terreno entra pelo mesmo mecanismo do guarda-corpo e da massa (`packages/render/src/section/`). Sem mecanismo novo de oclusão.
- **IFC**: terreno sai como `IfcGeographicElement` (tipo predefinido `TERRAIN`) com a malha da superfície proposta, sob o `IfcSite` que o exportador já cria; a `localizacao` preenche `RefElevation` do `IfcSite`. Lote e regiões não saem no IFC na v1.
- **DXF**: camadas `TERRENO_CURVAS`, `TERRENO_CURVAS_MESTRAS`, `TERRENO_BORDA`, `TERRENO_REGIAO`, `LOTE`, `LOTE_EDIFICAVEL` na planta; `CORTE_TERRENO` no corte.

## A.8 Critérios de estabilidade (valem para todas as fases)

1. Nenhuma entrada do usuário derruba o app: elemento inválido é recusado pelo comando; erro do kernel vira aviso e desenho de reserva.
2. Fuzz no Rust: 200 terrenos aleatórios (semente fixa; 50 a 500 pontos, 0 a 5 curvas, 0 a 3 quebras **que podem se cruzar**, 0 a 3 regiões de papéis variados) → sem pânico; saídas finitas; mesma saída em duas execuções; todo triângulo de superfície com área em planta > 0 e normal para cima; cada aresta interna em exatamente 2 triângulos; cada curva de nível com todos os pontos na sua cota (1e-9) e dentro do domínio; volumes ≥ 0.
3. Valores de referência (fixtures de A.10) dentro das tolerâncias escritas.
4. Cache por assinatura: editar um terreno não recalcula os outros; mudar cor, nome, `mostrarExistente`, rótulos ou pontos cotados não recalcula geometria; mover uma região não recalcula E.
5. Tempo (medir e registrar no ESTADO; alvo, não bloqueio, salvo acima do dobro), em terreno de 50 000 vértices: primeira `terreno_malha` ≤ 1,5 s; consultas seguintes com cache ≤ 50 ms; `terreno_curvas` ≤ 200 ms; `terreno_corte` ≤ 50 ms; `terreno_cotas` com 1 sonda ≤ 1 ms.
6. 3D: terreno opaco, um lote de malha por terreno e material; seleção, realce e picking funcionam (`ElementRange`, decisão 0016); sem tremor entre plataforma e laje (a plataforma fica na face inferior da laje; conferir visualmente).
7. Planta: clicar **dentro** do terreno não o seleciona (senão ele engole todos os cliques); seleciona-se pela borda e pelas curvas.
8. Desfazer e refazer, copiar e colar, salvar e abrir, e migração cobertos por teste.
9. E2E com navegador: projeto de referência aberto em planta, corte, elevação, 3D e prancha, sem erro no console.

## A.9 Fora desta entrega (não fazer, mesmo que pareça fácil)

Tipos de terreno com camadas de solo; furos na borda (lagos, ilhas); vínculo persistente "base da parede acompanha o terreno" e reanexação automática quando o terreno muda; componentes de terreno (árvore, poste, vaga); terreno a partir de nuvem de pontos, de imagem de satélite ou de serviço de mapas; importação de terreno por IFC ou LandXML; hidrologia e drenagem; terraplenagem com camadas ou com fases de obra; suavização de curvas (spline); correção de triângulos planos entre curvas; curvas de nível desenhadas no 3D; lote e regiões no IFC; perfis de recuo por município; cálculo do gabarito real da edificação; rótulo de curva arrastável; **imagem ou PDF como fundo** (o DXF importado já serve de fundo para traçar); terreno visível na planta de outros níveis além do seu.

## A.10 Fixtures de referência (únicas, usadas por todas as fases)

Arquivo `packages/engine/src/fixtureTerreno.ts` (TS) e o equivalente `crates/geom-wasm/src/terreno_fixture.rs` (Rust, só em teste). Em todos, `intervaloCurvas` 0,5 salvo indicação, `espessuraBase` 3, sem `localizacao`.

| Id | Descrição | Valores esperados |
|---|---|---|
| **T1 plano** | 4 pontos nos cantos do quadrado (0,0)–(20,20), z = 10 | área em planta 400 e de superfície 400 (1e-9); cota em (5, 5) = 10; nenhuma curva de nível |
| **T2 rampa** | mesmos cantos, z = 10,25 + 0,1·x | área de superfície 400·√1,01 = 401,99502 (1e-6); cota em (10, 10) = 11,25; 4 curvas (10,5; 11; 11,5; 12) retas em x = 2,5; 7,5; 12,5; 17,5, cada uma com 20 m; corte por y = 10 na direção +x: perfil reto de z 10,25 a 12,25 |
| **T3 pirâmide** | cantos com z = 0 e ponto central (10, 10) com z = 5; `intervaloCurvas` 1 | 4 triângulos; área de superfície 447,21360 (1e-5); 4 curvas fechadas (z = 1, 2, 3, 4), quadrados de lado 16, 12, 8, 4 (perímetros 64, 48, 32, 16) |
| **T4 vale** | cantos com z = 2 e linha de quebra de (10, 0, 0) a (10, 20, 0) | cota em (10, 10) = 0 e em (5, 7) = 1 (1e-9); área de superfície 400·√1,04 = 407,92156 (1e-5) |
| **T5 plataforma** | T1 mais plataforma no quadrado (5,5)–(15,15), cota 8, taludes 0 | volume de corte entre 200 e 200,6; aterro 0 (1e-9); cota proposta em (10, 10) = 8 e em (2, 2) = 10 |
| **T6 talude** | T1 mais região nivelada no mesmo quadrado, cota 8, talude de corte 1 | volume de corte 288,38 ± 2 % (200 da base, 80 das faces, 8,38 dos cantos em cone); cota proposta em (4, 10) = 9 (± 0,02) |
| **T7 aterro** | T2 mais plataforma no quadrado (5,5)–(15,15), cota 12,25, taludes 0 | volume de aterro entre 100 e 100,4; corte 0 (1e-6) |
| **T8 borda** | T3 com borda no quadrado (5,5)–(15,15) | área em planta 100 (1e-9); cota em (10, 10) = 5 |
| **T9 cruzadas** | T1 mais duas quebras que se cruzam em X | aviso 2 presente uma vez; malha válida; cota em (5, 5) = 10 |
| **L1 lote** | retângulo (0,0)–(12,30); lado y = 0 é frente, recuo 5; laterais 1,5; fundo 3 | área 360; perímetro 84; área edificável 198 (1e-6) |
| **L2 lote em L** | (0,0), (20,0), (20,10), (10,10), (10,20), (0,20); recuo 2 em todos os lados | área 300; área edificável 156,86 ± 0,05 (canto reentrante arredondado) |
| **I1 índices** | L1 mais uma laje 9 × 10 dentro do lote em dois níveis, e uma subdivisão impermeável de 30 m² fora das lajes | taxa de ocupação 0,25; coeficiente 0,5; permeabilidade (360 − 90 − 30) / 360 = 0,6667 (1e-4) |

---

# Parte B — Manual do fiscal

Você coordena. **Você não decide nada de projeto.** Seu trabalho: executar uma ficha por vez (por subagente ou você mesmo, ver B.3), conferir o resultado com os comandos abaixo, mesclar ou devolver, e registrar o estado.

## B.1 Regras do fiscal

1. **Uma ficha por vez**, na ordem de B.4. Só há paralelismo onde B.4 diz "em paralelo", e mesmo assim é opcional: na dúvida, sequencial.
2. **Nunca confie em relatório.** Rode você mesmo os comandos do portão (B.3), mesmo quando foi você quem implementou.
3. **Não mude a Parte A.** Se uma regra da Parte A não funcionar, pare e pergunte ao dono com o trecho exato e a evidência. A resposta entra como emenda datada no fim deste arquivo.
4. **Correções suas só se forem pequenas** (até cerca de 20 linhas, sem mudar comportamento: import esquecido, linha do `index.ts`, texto de i18n). O resto volta para quem implementou.
5. **Devolução:** no máximo 2 por ficha, sempre com a saída exata do comando que falhou. Na terceira falha, pare e relate ao dono.
6. **Registre tudo** em `docs/terreno/ESTADO.md` (modelo em B.6) depois de cada ficha. Se a sessão reiniciar, é por ele que você retoma.
7. **Git:** todo o trabalho entra na branch `claude/happy-einstein-sgyixh`. Não crie pull request sem o dono pedir. `git push -u origin claude/happy-einstein-sgyixh` depois de cada mescla aprovada (o contêiner é descartável: o que não foi enviado se perde).
8. **Nada de atalho para ficar verde:** não desligue teste, não aumente tolerância, não mexa em `eslint.config.js`, `vitest*.config.ts`, `scripts/check-*.mjs` nem em workflows.
9. **Lista "Pode tocar" incompleta.** Se a ficha precisar de um arquivo fora da lista, você pode autorizar **só** nestes dois casos, registrando como emenda: (a) é um ponto de registro ou despacho que enumera kinds, categorias, seções ou consultas (um `Record<Element['kind'], …>`, um `switch` exaustivo, uma lista de frentes); (b) é um arquivo **novo** do mesmo módulo da ficha, criado para respeitar o limite de 420 linhas. Qualquer outro caso: pare e pergunte ao dono.
10. **Arquivos de outras frentes.** Nunca toque: os painéis `mas-massa` e `mas-por-massa` da faixa; arquivos `mass*`, `massa*`; a entidade de vistas (`planView*`, se existir). Seções e consultas fora de 160–199 não mudam.

## B.2 Passo 0 (antes da primeira ficha)

1. `git status` limpo e `git log -1` na branch `claude/happy-einstein-sgyixh`.
2. `npm ci` (se `node_modules` não existir).
3. Rode a linha de base e **anote no ESTADO o resultado de cada comando** (passou, falhou, não roda neste ambiente):
   ```
   npm run typecheck
   npm run lint
   npm run test:rapido
   CARGO_TARGET_DIR=/tmp/hestia-target-terreno cargo test -p geom-wasm --manifest-path crates/geom-wasm/Cargo.toml
   CARGO_TARGET_DIR=/tmp/hestia-target-terreno cargo clippy -p geom-wasm --manifest-path crates/geom-wasm/Cargo.toml -- -D warnings
   npm run build:wasm
   npm run wasm:check
   npm run test:wasm
   git checkout packages/geom/assets
   ```
   (O último comando desfaz a regravação do binário WASM feita pelo `build:wasm`; faça isso sempre que a ficha não for de Rust.) O portão de cada ficha compara com esta linha de base: **nenhum comando que passava pode passar a falhar, e a contagem de testes não pode cair.** Comando que já falhava na linha de base é relatado ao dono antes de começar.
4. Pergunte ao dono, **uma vez, numa só mensagem**:
   - "Confirma as decisões D1 a D11 de A.0? Em especial a D1 (dependência `spade`) e a D10 (não esperar a massa)."
   - "Posso lançar subagentes para as fichas? Qual modelo nas fichas R1, R2, R3 e V3?" Recomendação: o mais forte disponível nessas quatro; o padrão nas demais. Se o dono não autorizar subagentes, você executa as fichas no modo B (B.3).
   - "Executo todas as fases em sequência ou paro ao fim de cada fase para o seu aceite?" Recomendação: parar ao fim das fases 2, 3, 4 e 5.
   Grave as respostas em "Decisões do dono" no ESTADO.
5. Atualize `docs/terreno/ESTADO.md` (ele já existe; troque "passo 0 pendente" pela linha de base) e faça o commit.

## B.3 Ciclo de cada ficha

**Preparar o worktree** (sempre à mão; `isolation: "worktree"` da ferramenta de agente parte da `main` local e não serve):

```
git worktree add /home/user/hestia-wt/<ficha> -b terreno/<ficha> claude/happy-einstein-sgyixh
cd /home/user/hestia-wt/<ficha> && npm ci
```

Nunca faça symlink de `node_modules` (os pacotes `@hestia` apontariam para o checkout principal).

**Executar.** Dois modos; o resultado e o portão são os mesmos:

- **Modo A (subagente; só com a autorização do passo 0).** Lance um agente `general-purpose` com o prompt, nesta ordem e sem resumir: (1) a frase "Seu diretório de trabalho é `/home/user/hestia-wt/<ficha>`, já na branch `terreno/<ficha>`."; (2) o **bloco comum** da Parte C, inteiro; (3) a **ficha** da Parte D, inteira; (4) a frase "Leia `docs/terreno/PLANO.md` Parte A antes de escrever código."
- **Modo B (você mesmo).** Entre no worktree, leia a Parte A e a ficha, e implemente obedecendo ao bloco comum da Parte C como se fosse o subagente. Depois troque de papel e confira como fiscal.

**Conferir** (no worktree):

1. **Escopo:** `git diff --stat claude/happy-einstein-sgyixh...terreno/<ficha>`. Todo arquivo alterado tem de estar na lista "Pode tocar" da ficha (ou nas exceções de B.1 item 9).
2. **Trapaça:** nenhum resultado nestes comandos sobre o diff:
   ```
   git diff claude/happy-einstein-sgyixh...terreno/<ficha> | grep -nE "^\+.*(\.skip\(|\.only\(|it\.fails|xit\(|eslint-disable|@ts-ignore|@ts-expect-error|as any|console\.log|#\[ignore\]|todo!\(|unimplemented!\(|\.unwrap\(\)|panic!\()"
   git diff claude/happy-einstein-sgyixh...terreno/<ficha> --stat -- eslint.config.js "vitest*.config.ts" scripts/check-*.mjs .github package.json crates/geom-wasm/Cargo.toml
   ```
   `.unwrap()` e `panic!` só são aceitos dentro de testes Rust (`#[cfg(test)]`); em código de produção são devolução (o WASM aborta). `Cargo.toml` só pode aparecer na ficha R1, e só com a linha da `spade`. Teste apagado ou tolerância afrouxada em arquivo de teste existente também é devolução (olhe as linhas `-` dos `.test.ts`).
3. **Portão geral:** `npm run typecheck && npm run lint && npm run test:rapido`. Fichas que tocam Rust: também `cargo test`, `cargo clippy -- -D warnings` (com `CARGO_TARGET_DIR=/tmp/hestia-target-terreno`), `npm run build:wasm`, `npm run wasm:check`, `npm run test:wasm`, e o binário regravado em `packages/geom/assets/` **entra no commit**.
4. **Portão da ficha:** os comandos e os valores da seção "Aceite" da ficha.
5. **Lixo:** `node scripts/check-lixo.mjs`.

**Decidir.**

- Tudo verde → na branch de trabalho: `git merge --no-ff terreno/<ficha>`, rode o portão geral de novo, `git push`, atualize o ESTADO, `git worktree remove /home/user/hestia-wt/<ficha>`.
- Algo vermelho → devolva a quem implementou (no modo A, **o mesmo** agente, por continuação) com: o comando, a saída colada e a frase "corrija só isto, sem ampliar o escopo".
- Pedido de decisão de projeto → pare, pergunte ao dono, registre a resposta no ESTADO e como emenda datada no fim deste arquivo.

## B.4 Ordem das fichas

```
Fase 0  fundação            M1 → M2
Fase 1  kernel Rust         R1 → R2 → R3
Fase 2  motor e vistas      E1 → V1 → V2 → V3            (V1 e V2 podem ir em paralelo)
Fase 3  terreno utilizável  I1 → T1 → T2 → U1            (I1 pode ir em paralelo com T1)
Fase 4  regiões             T3 → U2
Fase 5  lote                P1 → P2 → P3 → P4 → P5       (P5 só se a massa estiver na branch)
Fase 6  integração e fecho  G1 → X1 → Q1
Fase 7  referência          F1 → F2                      (opcional; só com o "pode" do dono, decisão D9)
```

Antes de **cada fase**, execute o protocolo de sincronização de B.7.

Portões de fase (além do portão de cada ficha; o fiscal confere e anota):

- **Fim da fase 1:** os valores de A.10 (T1 a T9) batem nos testes Rust; fuzz de A.8 item 2 verde; tempos de A.8 item 5 medidos no Rust nativo e anotados.
- **Fim da fase 2:** `npm run dev`, abrir o app com o projeto de referência (fixtures T3, T5 e T6 carregadas por script do E2E) e tirar captura de planta, corte, elevação e 3D. **Olhe as imagens**: curvas de nível fechadas e concêntricas em T3; plataforma rebaixada visível no corte de T5. Guarde em `docs/terreno/evidencias/fase2/`.
- **Fim da fase 3:** os passos 1 a 4 do roteiro B.5 funcionam. Pare e mostre ao dono (se ele pediu parada por fase).
- **Fim da fase 4:** passos 5 e 6 de B.5.
- **Fim da fase 5:** passos 7 a 9 de B.5.
- **Fim da fase 6:** A.8 inteiro conferido, item por item, no ESTADO.

## B.5 Roteiro de aceite final (o E2E da ficha Q1 automatiza)

1. Gerenciar › Localização: norte verdadeiro 30°, altitude da cota zero 740.
2. Topografia › Importar levantamento: o DXF de teste `tests/fixtures/terreno/levantamento.dxf` (criado na ficha I1: 12 curvas de nível de 1 em 1 m e 40 pontos cotados). Aparecem as curvas na planta e o terreno no 3D.
3. Editar terreno: mudar a cota de um ponto em +2 m. As curvas se redesenham. Ctrl+Z volta.
4. Rótulo de curva cruzando 3 curvas mestras: aparecem 3 cotas, com o valor exibido = z + 740. Corte atravessando o terreno: solo cortado com hachura.
5. Plataforma de 10 × 10 m no meio do terreno, 1 m abaixo da cota local. No corte aparecem o degrau e o perfil existente tracejado.
6. Corte e aterro: a tabela mostra o volume de corte da plataforma; o mapa pinta a região de corte.
7. Linhas de propriedade › Por tabela: 4 lados de um retângulo 12 × 30 m. Erro de fechamento zero. Recuos: frente 5, laterais 1,5, fundo 3. A área edificável tracejada mede 198 m².
8. Uma laje 9 × 10 m dentro do lote. Índices do lote: taxa de ocupação 25 %.
9. Gravidade ligada: uma parede criada sobre o terreno nasce com `baseOffset` igual à cota do terreno no primeiro clique.
10. Prancha com planta, corte e 3D. Salvar, reabrir: tudo igual. Desligar o kernel: aparecem o aviso e a borda de reserva, sem travar. Sem erro no console em nenhum passo.

## B.6 Modelo do `docs/terreno/ESTADO.md`

O arquivo já existe com este formato. Mantenha-o.

```
# Terreno e lote: estado
Linha de base (data, commit): typecheck ✔ | lint ✔ | test:rapido N arquivos / N testes | cargo test N | clippy ✔ | wasm ✔/✘
Modo de execução: A (subagentes, modelo ...) ou B (o próprio fiscal)

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
| M1 | pendente / em curso / mesclada / parada / pulada (motivo) | | 0 | |
...
## Decisões do dono (data, pergunta, resposta)
## Sincronizações com a main (data, commit da main, conflitos, o que foi renumerado)
## Pendências conhecidas
## Tempos medidos (A.8 item 5)
## Lições de processo
```

## B.7 Protocolo de sincronização com a `main` e com a massa

Rode **antes de cada fase** e **antes da ficha Q1**. Nunca mescle a branch da massa (`claude/youthful-dirac-l4egd1`) nesta branch: só a `main`.

1. `git fetch origin main` e `git log --oneline HEAD..origin/main | head -20`. Se não há commits novos, acabou.
2. `git merge origin/main`. Se não houver conflito, vá para o passo 5.
3. Conflitos de **texto** (resolva mantendo **os dois lados**; a outra frente acrescentou as linhas dela, você as suas):
   - `packages/model/src/types.ts` (união `Element`), `graphics.ts`, `elementLevel.ts`, `commands.ts`, `index.ts`, `i18n.ts`;
   - `crates/geom-wasm/schema/cena-v11.json`, `src/esquema.rs`, `src/cena.rs`, `src/lib.rs`, `src/consultas.rs`, `src/abi2.rs`;
   - `apps/web/src/ui/ribbon/tabsSoon.ts` (a aba "Massa e terreno" é uma só; cada frente tem os seus painéis);
   - os testes-guarda (`contratoModificacao.test.ts`, `contratoSnaps.test.ts`, `extensaoDoModelo.ts`): uma linha por kind.
4. Conflitos de **número** (não são resolvidos "mantendo os dois"):
   - `SCHEMA_VERSION` e `packages/model/src/migrate.ts`: se a `main` trouxe o número que esta frente usou, **a nossa migração vira o número seguinte** (ela não altera dados, então basta renumerar o passo e os testes que citam o número). Anote no ESTADO.
   - `versao` em `cena-v11.json`: idem, o próximo livre; acrescente o parágrafo da nossa versão ao `$comentario` depois do parágrafo da outra frente. Os **ids** 160–199 nunca mudam.
   - `packages/geom/src/kernel/v2/esquema.gerado.ts`: **nunca à mão**. Aceite qualquer lado e rode `node scripts/gerar-esquema-kernel.mjs`.
   - `packages/geom/assets/geom_wasm.wasm`, `.sha256`, `.fonte.sha256`: **nunca à mão**. Aceite qualquer lado e rode `npm run build:wasm`; o resultado entra no commit da mescla. O teste `tests/hash-fontes.test.ts` confere.
5. Rode o portão geral completo (com os comandos de Rust) e só então `git push`. Registre a sincronização no ESTADO.
6. Se um conflito não se encaixar nos passos 3 e 4, **pare** e relate ao dono com o `git status` e o trecho em conflito.

Depois de cada sincronização, teste se a massa chegou: `test -f packages/model/src/massTypes.ts && echo "massa presente"`. Anote. É isso que libera a ficha P5.

---

# Parte C — Bloco comum (vai inteiro no prompt de todo subagente)

```
REGRAS (valem para toda a tarefa)

1. Você trabalha no repositório Hestia, SOMENTE no diretório de trabalho indicado (um git worktree próprio). Não leia
   para alterar nem rode comandos em outros diretórios. Não faça push, não crie pull request, não troque de branch.
2. Antes de codar leia: docs/terreno/PLANO.md (Parte A inteira e a sua ficha), docs/contratos/familias-e-ferramentas.md,
   docs/contratos/trabalho-de-agentes.md. A Parte A é lei: não mude modelo, contrato, regra de geometria nem escopo.
   Se uma regra parecer errada ou faltar informação, PARE e relate; não invente.
3. Toque só nos arquivos da lista "Pode tocar" da sua ficha. Exceção única: a linha de export no index.ts do pacote.
   Se precisar de outro arquivo, PARE e relate qual e por quê. Nunca edite: package.json, eslint.config.js,
   vitest*.config.ts, scripts/check-*.mjs, .github/, docs/paridade/ORDEM.json, docs/07-STATUS-V1.md,
   docs/terreno/PLANO.md, docs/terreno/ESTADO.md, nada de docs/massa/, nenhum arquivo mass* ou massa*, e os painéis
   mas-massa e mas-por-massa da faixa. Cargo.toml só na ficha R1 e só a linha da spade.
4. Estilo: código, comentários e textos em português, como os arquivos vizinhos. Limite de 420 linhas por arquivo
   (ESLint max-lines): arquivo perto do limite se divide, não se espreme. Siga o padrão do guarda-corpo e da parede
   cortina (arquivos gc_*, cortina_*, guardaCorpo*, cortina*), que são o molde desta frente.
5. Proibido: dependência nova (além da spade, na R1); .skip, .only, it.fails, #[ignore]; eslint-disable; @ts-ignore;
   `as any`; console.log; todo!()/unimplemented!(); .unwrap(), .expect() e panic!() fora de teste em Rust (o WASM
   aborta); apagar ou afrouxar teste existente; arquivo de depuração no repositório.
6. Toda função nova tem teste ao lado. Texto de interface passa pelo i18n (pt e en) e número exibido por
   formatQuantity. Cota exibida ao usuário passa por cotaExibida (A.3 item 7).
7. Nenhum caminho TS gera malha, curva de nível ou perfil de terreno: isso vem só do kernel Rust (A.5).
8. Rust: compile com CARGO_TARGET_DIR=/tmp/hestia-target-terreno. Nunca deixe crates/*/target no worktree.
9. Commits pequenos na branch atual. Faça `wip: ...` a cada marco que passe em typecheck e nos testes do pacote
   (o contêiner pode reiniciar). O último commit é `feat(terreno): ...`.
10. Antes de terminar, rode e deixe verde: npm run typecheck ; npm run lint ; npm run test:rapido ; e os comandos do
    "Aceite" da sua ficha. Se tocou Rust: cargo test -p geom-wasm, cargo clippy -- -D warnings, npm run build:wasm,
    npm run wasm:check, npm run test:wasm, e inclua no commit o binário regravado em packages/geom/assets/.
    Se NÃO tocou Rust e rodou build:wasm, desfaça com `git checkout packages/geom/assets`.
11. RELATÓRIO FINAL obrigatório, neste formato:
    - Branch e hash do último commit.
    - Arquivos criados e alterados.
    - Resultado de cada comando do item 10 (cole a linha de resumo de cada um).
    - Cada item do "Aceite" da ficha: feito / não feito, com o nome do teste que prova.
    - Decisões que tomou que não estavam escritas (deveria ser nenhuma) e dúvidas.
    - O que NÃO foi feito. Não declare sucesso sem ter rodado os comandos.
```

---

# Parte D — Fichas

Cada ficha tem: objetivo, depende de, pode tocar, passos, aceite. "Molde" é o arquivo existente a imitar; **leia o molde antes de escrever**.

## Fase 0 — Fundação

### M1 · Modelo, comandos e migração (TS)

- **Depende de:** nada.
- **Pode tocar:** `packages/model/src/` (novos `terrainTypes.ts`, `terrain.ts`, `terrainCommands.ts`, `terrainFontes.ts`, `validateTerrain.ts`, `lotTypes.ts`, `lot.ts`, `lotCommands.ts`, `validateLot.ts`, `localizacao.ts` e testes; `types.ts`, `commands.ts`, `migrate.ts`, `graphics.ts`, `elementLevel.ts`, `historyRotulos.ts`, `copyLink.ts`, `index.ts`, `i18n.ts`); os testes existentes que citam o número de `SCHEMA_VERSION` (só o número); e, **só para o projeto voltar a compilar**, os arquivos que têm `Record<Element['kind'], …>`, `Record<GraphicsCategory, …>` ou `switch` exaustivo sobre `kind` em `packages/*` e `apps/web/src`.
- **Molde:** o commit da massa `bac2b3f8` ("modelo, comandos e migração 26 da massa"), visível com `git show bac2b3f8 --stat` depois de `git fetch origin claude/youthful-dirac-l4egd1`. Ele mostra todos os pontos do repositório que enumeram kinds.
- **Passos:**
  1. Criar os tipos de A.3 exatamente como escritos. `Element` ganha `Terrain`, `TerrainRegion` e `Lot`; `GraphicsCategory` ganha `'site'` e `'lot'` com os estilos de A.3 item 2; `Project` ganha `localizacao?`.
  2. Validações, comandos e `transform` de A.3 itens 4, 5 e 6. `cotaExibida` e `cotaDoProjeto` (item 7).
  3. `SCHEMA_VERSION` + 1 com migração sem alteração de dados; teste de ida e volta em `esquema.test.ts`.
  4. Rodar `npm run typecheck` e, em **cada** ponto que quebrar por kind ou categoria nova, pôr a entrada mínima: nos contratos (`contratoModificacao.test.ts`, `contratoSnaps.test.ts`, `extensaoDoModelo.ts`) usar `null` / `entra: false` com o motivo `"terreno: ficha T1"`, `"terreno: ficha V2"`, `"terreno: ficha T3"` ou `"lote: ficha P2"` / `"lote: ficha P3"`. Não implementar comportamento de vista nem de ferramenta aqui.
- **Aceite:**
  - Testes novos: validação (um caso por regra de A.3 item 6); cada comando com desfazer e refazer; cada operação de `editTerrainFontes`; apagar terreno apaga as regiões (e o desfazer devolve tudo); `transform` dos três kinds (mover, girar 90°, espelhar; no lote, conferir que cada lado mantém papel e recuo depois do espelho); `cotaExibida`; migração.
  - `npm run typecheck`, `npm run lint`, `npm run test:rapido` verdes; contagem de testes só sobe.
  - Lista, no relatório, de todos os pontos onde entrou marcador `"terreno: ficha …"` ou `"lote: ficha …"`.

### M2 · Contrato do kernel (JSON, esboços Rust, esquema TS)

- **Depende de:** M1.
- **Pode tocar:** `crates/geom-wasm/schema/cena-v11.json`; `crates/geom-wasm/src/esquema.rs`, `lib.rs`, `abi2.rs`, `consultas.rs` (só o registro dos ids novos), `cena.rs` (SOMENTE: o `use`, o campo `terreno` em `Cena`, os três braços de roteamento em `definir_secao` / `upsert` / `remover` e a condição que deixa as seções 160 a 165 fora de `invalidar_caches`); novo `crates/geom-wasm/src/secoes_terreno.rs`; `packages/geom/src/kernel/v2/esquema.gerado.ts` (regenerado pelo script) e os testes de contrato dos dois lados; fixtures de teste que guardam `esquemaVersao` (regenerados, mudando só esse número).
- **Molde:** `secoes_gc.rs`, `secoes_cortina.rs` e como `cena.rs` os roteia (`SecoesGC::e_minha`).
- **Passos:** declarar as seções 160–165 e as consultas 160–168 de A.5, coluna por coluna; subir `versao`; acrescentar ao `$comentario` o parágrafo da versão nova (o que entrou; "consultas ainda sem implementação devolvem `NAO_IMPLEMENTADO`"); regenerar o esquema TS; `secoes_terreno.rs` aceita `definir` / `upsert` / `remover` com decodificação atômica (`ENTRADA` para enum fora da faixa, valor não finito, chave ausente ou duplicada); as consultas devolvem `NAO_IMPLEMENTADO`.
- **Aceite:** `contrato_confere_com_json` e `esquema.test.ts` verdes cobrindo os ids novos; todos os testes de kernel existentes verdes; nenhuma seção ou consulta antiga alterada (`git diff` do JSON só acrescenta); portão de Rust completo.
- **Depois desta ficha o contrato fica congelado.** Mudança de coluna exige emenda na Parte A aprovada pelo dono.

## Fase 1 — Kernel Rust

Moldes: `gc_tipos.rs`, `gc_malha.rs`, `gc_planta.rs`, `gc_corte.rs`, `gc_quant.rs`, `gc_avisos.rs`, `secoes_gc.rs`, `geo2d.rs` (geometria 2D já existente: reutilize, não duplique). **Recomendado o modelo mais forte nestas três fichas.**

### R1 · Triangulação, superfície existente, malha e cota (`terreno_malha`, `terreno_cotas`)

- **Depende de:** M2 **e a decisão D1 confirmada pelo dono**.
- **Pode tocar:** `crates/geom-wasm/Cargo.toml` (só a linha da `spade` de A.5), `crates/geom-wasm/Cargo.lock` (regravado pelo cargo), `NOTICE` (parágrafo das bibliotecas novas); novos `terreno_tipos.rs`, `terreno_tin.rs`, `terreno_avalia.rs`, `terreno_malha.rs`, `terreno_fixture.rs`, `terreno_testes*.rs`; `secoes_terreno.rs`; registro em `lib.rs`, `consultas.rs`, `cena.rs` (só o que a M2 já delimitou, mais o cache da regra 16); `tests/kernel-terreno-malha.wasm.test.ts`; `tests/hash-fontes.test.ts` **não** se edita (ele se acerta com o `build:wasm`).
- **Passos:**
  1. Acrescentar a `spade`. Rodar `cargo tree -p geom-wasm` e conferir a lista do `NOTICE`. Conferir na documentação da versão baixada (`~/.cargo/registry/src/*/spade-*/src/cdt.rs`) os nomes `ConstrainedDelaunayTriangulation`, `insert`, `can_add_constraint`, `add_constraint`; se algum não existir, **PARE**.
  2. A.4 regras 1 a 5, 9 (com `superficie` 0; com 1 devolve o mesmo que 0 até a R3), 15 e 16; aviso 5.
  3. Consultas 160 e 163.
- **Aceite (testes Rust nomeados):**
  - `t1_plano_areas`, `t2_rampa_superficie_e_cota`, `t3_piramide_quatro_triangulos`, `t4_vale_respeita_quebra`, `t8_borda_recorta` com os valores de A.10.
  - `fusao_de_pontos_coincidentes`: dois pontos a menos de 1 mm viram um; o primeiro vence.
  - `t9_restricoes_cruzadas_nao_derrubam`: malha válida, sem pânico.
  - `malha_valida`: em T1 a T4, T8 e T9: área em planta de cada triângulo > 0, normal para cima, cada aresta interna em 2 triângulos; saia e base presentes com `z_base` correto.
  - `cotas_batem_com_vertices`: a consulta 163 em cada vértice de fonte devolve a cota dele (1e-9); ponto fora devolve `ID_AUSENTE`.
  - `menos_de_tres_pontos_saida_vazia`; `entrada_nan_e_ENTRADA`.
  - `fuzz_200_existente`: A.8 item 2 no que se aplica a E.
  - `cache_por_terreno`: mudar o terreno 2 não refaz a triangulação do 1 (contador interno só de teste).
  - Teste WASM chama as consultas 160 e 163 pela ABI real e confere contagens de T3.
  - Tempo da triangulação de 50 000 pontos aleatórios (semente fixa) em Rust nativo registrado no relatório.

### R2 · Curvas de nível, borda em planta, corte e quantidades básicas

- **Depende de:** R1.
- **Pode tocar:** novos `terreno_curvas.rs`, `terreno_planta.rs`, `terreno_corte.rs`, `terreno_quant.rs`, `terreno_avisos.rs` e testes; registro em `consultas.rs`, `secoes_terreno.rs`; `tests/kernel-terreno-curvas.wasm.test.ts`.
- **Passos:** A.4 regras 10, 11 e 12 (áreas e cotas; volumes ainda 0) e os avisos 1 e 2; consultas 161, 162, 164, 165 e 168.
- **Aceite:**
  - `t2_curvas_retas` (4 curvas, posições e comprimentos de A.10), `t3_curvas_quadradas` (perímetros 64, 48, 32, 16, todas fechadas; nenhuma curva em z = 0 nem em z = 5).
  - `curva_mestra_a_cada_n`; `limite_de_cotas` (mais de 2 000 cotas devolve `LIMITE`).
  - `t2_corte_perfil_reto`; `corte_bate_com_cotas`: em 50 valores de `s`, o z do perfil é igual ao da consulta 163 no mesmo ponto (1e-9); `corte_fecha_na_base`: polígono fechado com área > 0; `corte_fora_do_terreno_vazio`; `silhueta_t3`: plano fora do terreno olhando para ele devolve a envoltória com pico em z = 5.
  - `planta_borda_t8`: um laço fechado de área 100.
  - `quant_t1_t2_t3_t4` com os valores de A.10.
  - `aviso_cotas_diferentes`, `aviso_linha_cruzada` (T9): um caso positivo e um negativo cada.
  - Fuzz estendido: saídas finitas e determinísticas nas consultas novas; toda curva na sua cota e dentro do domínio.

### R3 · Regiões: superfície proposta, corte e aterro

- **Depende de:** R2.
- **Pode tocar:** novos `terreno_regioes.rs`, `terreno_proposta.rs`, `terreno_volumes.rs` e testes; `terreno_malha.rs`, `terreno_quant.rs`, `terreno_avisos.rs`, `terreno_corte.rs`, `terreno_curvas.rs` (só para aceitar `superficie` 1 e o papel 1 do corte); registro em `consultas.rs`, `secoes_terreno.rs`, `cena.rs` (cache de P); `tests/kernel-terreno-regioes.wasm.test.ts`.
- **Passos:** A.4 regras 6, 7, 8, 12 (volumes), 13 e os avisos 3, 4 e 6; consultas 166 e 167; `superficie` 1 em 160, 161, 162, 163; papel 1 em 164.
- **Aceite:**
  - `zp_funcao_unica`: valores de `zP` em pontos escolhidos de T5, T6 e T7 (dentro, na borda, no talude, longe) conferidos à mão no teste.
  - `t5_plataforma_corte`, `t6_talude_corte`, `t7_aterro` com as faixas de A.10.
  - `subdivisao_nao_muda_cota`: T2 com subdivisão; `zP == E` em 100 pontos (1e-9); a malha tem grupo com `regiao_num` da subdivisão e a soma das áreas dos grupos é a área do terreno (1e-6); `quant_terreno_regioes` devolve a área do polígono.
  - `sem_regiao_proposta_igual_existente`: mesmos bytes nas consultas 160 e 161 com `superficie` 0 e 1.
  - `perfil_existente_so_com_plano`: papel 1 presente em T5, ausente em T2.
  - `mapa_corte_aterro_t5`: soma das áreas dos triângulos de corte entre 100 e 101; nenhum de aterro.
  - `aviso_regioes_sobrepostas`, `aviso_regiao_fora`, `aviso_precisao_reduzida`: um caso positivo e um negativo cada.
  - `mover_regiao_nao_refaz_existente` (cache).
  - `fuzz_200_completo`: A.8 item 2 inteiro.
  - Tempos de A.8 item 5 em Rust nativo registrados no relatório.

## Fase 2 — Motor e vistas (TS)

### E1 · Adaptador e serviço no motor

- **Depende de:** R3.
- **Pode tocar:** novos `packages/engine/src/kernelTerreno.ts`, `kernelTerrenoEnvio.ts`, `kernelTerrenoServico.ts`, `terrenoVista.ts`, `terrenoIssues.ts`, `terrenoQuantities.ts`, `fixtureTerreno.ts` e testes; `index.ts`; os pontos de despacho do kernel que listam frentes (molde: como `kernelGuardaCorpoServico.ts` e `kernelCortinaServico.ts` são ligados).
- **Molde:** `kernelGuardaCorpo.ts`, `kernelGuardaCorpoEnvio.ts`, `kernelGuardaCorpoServico.ts`, `guardaCorpoVista.ts`.
- **Passos:** `Project` → seções 160–164 na ordem canônica de A.4; envio por diferença de linhas e cache por assinatura (A.8 item 4); funções `malha`, `curvas`, `planta`, `corte`, `quantidades`, `quantidadesRegioes`, `mapaCorteAterro`, `avisos` e `cotaDoTerreno(p, pontos, superficie)` (escreve a seção 165 e chama a 163; devolve `number | null` por ponto); avisos `terreno-sem-kernel` e `terreno-invalido` no painel de avisos; `fixtureTerreno.ts` com T1 a T9.
- **Aceite:** teste WASM de integração com T1 a T9 por todas as funções; teste de cache (editar T1 não reenvia T2; mudar `color`, `name`, `linhasRotulo` não muda a assinatura de geometria; mover um ponto reenvia só as linhas mudadas da seção 162); teste do kernel desligado (funções devolvem `null`, aviso presente, sem exceção); `cotaDoTerreno` em T2 confere com a fórmula.

### V1 · Vista 3D

- **Depende de:** E1. Pode ir em paralelo com V2.
- **Pode tocar:** novos `packages/render/src/model3d/terreno3d.ts` e testes; `scene3d.ts`, `chaveNivel3d.ts` (registro); seleção e picking no 3D onde os kinds são listados; `apps/web/src/editor/viewVisibility.ts`.
- **Molde:** `guardaCorpo3d.ts`, `cortina3d.ts`, `genericSolids.ts`.
- **Aceite:** A.8 item 6, com testes: um lote de malha por terreno e por material (cor do material da região, senão a do terreno, senão o padrão `#b5a27a`); `ElementRange` por terreno e por região (clicar numa região seleciona a região; fora dela, o terreno); categoria `site` desligada some do 3D; reserva sem kernel (borda tracejada); atualização só do terreno editado. O lote **não** aparece no 3D.

### V2 · Planta, snaps e extensão do modelo

- **Depende de:** E1. Pode ir em paralelo com V1.
- **Pode tocar:** novos `packages/render/src/plan/terreno.ts`, `terrenoCamada.ts`, `terrenoRotulos.ts` e testes; `plan/build.ts`, `view.ts`, `planOverlay.ts`, `versoesPlanta.ts`, `planFrame.ts`, `extensaoDoModelo.ts` (+ teste); `packages/engine/src/apoioDeSnap.ts` (+ teste), `assinaturasNivel.ts`, `resolveLevels.ts`; `packages/tools/src/contratoSnaps.test.ts`; novo `packages/tools/src/terrainPick.ts`.
- **Molde:** `plan/guardaCorpo.ts`, `guardaCorpoCamada.ts`, `guardaCorpoNoPonto` e `guardaCorposNaCaixa` em `guardaCorpoVista.ts`.
- **Aceite:**
  - Planta do nível do terreno desenha: curvas normais (peso de projeção) e mestras (um peso acima) da superfície proposta; as da existente tracejadas se `mostrarExistente`; borda; contorno das regiões (do modelo) com preenchimento translúcido na cor do material; rótulos de curva (texto sobre a curva mestra, na interseção com cada linha de rótulo, alinhado à curva, valor por `cotaExibida`) e pontos cotados (cruz mais valor, pela função `cotaDoTerreno`). Em outros níveis o terreno não aparece.
  - Seleção: por clique na borda ou numa curva (tolerância de tela) e por caixa; **clique no interior não seleciona** (A.8 item 7); região seleciona pelo contorno.
  - Snaps: vértices e arestas da borda; vértices das fontes como extremidade (índice espacial montado uma vez por assinatura); vértices e arestas do contorno das regiões. Chaves estáveis.
  - `COLETORES.terrain` e `COLETORES.terrainRegion` com `entra: true`; `CLASSIFICACAO` de snaps apontando código real (os marcadores da M1 para estas fichas saem).
  - Terreno de 50 000 vértices: a planta abre e faz zoom sem travar (registrar o tempo do primeiro desenho).

### V3 · Corte e elevação

- **Depende de:** V2.
- **Pode tocar:** novos `packages/render/src/section/terreno.ts` e testes; `section/build.ts`, `pick.ts`, `visibility.ts`; no motor, só o que liga a camada do terreno ao resultado do corte (molde: `corteGuardaCorpoDaSecao`, `linhasVisiveisGC`).
- **Passos:** primeiro ler como o guarda-corpo entra no corte (`section/guardaCorpo.ts`) e usar **o mesmo mecanismo** de desenho, visibilidade, seleção e realce. Não criar mecanismo novo de oclusão. Papel 0: contorno com peso de corte e preenchimento (hachura do material, se houver; senão cor sólida); papel 1: tracejado fino; papel 2: linha fina. O terreno é desenhado **antes** dos elementos do edifício (fica atrás).
- **Aceite:** testes com T2, T3 e T5 em corte e em elevação (contagem e estilo das operações de desenho); seleção e realce do terreno na vista; categoria desligada some; elevação de edifício num projeto só com terreno é gerada (extensão do modelo); capturas de corte de T5 e elevação de T3 anexadas ao relatório (caminho em `docs/terreno/evidencias/`).

## Fase 3 — Terreno utilizável

### I1 · Importação de levantamento (DXF e CSV)

- **Depende de:** E1. Pode ir em paralelo com T1.
- **Pode tocar:** novos `packages/io/src/dxfTerreno.ts`, `csvPontos.ts`, `simplificarPolilinha.ts` e testes; `packages/io/src/dxfImport.ts` (**só** para exportar o leitor de pares e registros já existente, sem mudar comportamento); `packages/io/src/index.ts`, `i18n.ts`; novos `apps/web/src/editor/terrenoImport.ts`, `apps/web/src/ui/dialogs/ImportTerrenoDialog.tsx`, `importTerrenoModel.ts` e testes; i18n do app; novo `tests/fixtures/terreno/levantamento.dxf` e `pontos.csv`.
- **Molde:** `dxfImport.ts`, `ImportCadDialog.tsx`, `cadImport.ts`.
- **Passos:**
  1. `dxfTerreno.ts`: lê `POINT` (10, 20, 30), `LWPOLYLINE` com elevação (código 38), `POLYLINE` 3D com `VERTEX` (cota por vértice), `LINE` com z e `3DFACE` (só os vértices, como pontos). Aplica a unidade do arquivo. Devolve, por camada: pontos, polilinhas de cota constante (candidatas a curva), polilinhas de cota variável (candidatas a quebra), contagens e faixa de z. Entidade sem cota (z = 0 em arquivo que tem outras cotas) é contada à parte e ignorada por padrão.
  2. `csvPontos.ts`: separador (`;`, `,`, tabulação ou espaço) e vírgula decimal detectados; cabeçalho opcional; ordem `x y z` ou `n e z`; linhas inválidas contadas e puladas.
  3. `simplificarPolilinha.ts`: Douglas-Peucker em planta com tolerância; nunca remove as pontas.
  4. Diálogo e modelo do diálogo conforme A.6 (proposta de `localizacao`, contagem contra o limite). Aplicar: `setLocalizacao` (se proposto e aceito) mais `addTerrain` com `substituirFontes`, numa transação.
- **Aceite:** testes do leitor DXF com um arquivo por tipo de entidade e com o `levantamento.dxf`; testes do CSV (4 separadores, vírgula decimal, cabeçalho); simplificação (reta com ruído vira 2 pontos; erro máximo ≤ tolerância); modelo do diálogo (proposta de origem e de cota zero com coordenadas UTM de exemplo; bloqueio acima de 200 000 vértices com mensagem); importação do `levantamento.dxf` gera terreno válido (`terrainIssue` nulo) e um desfazer remove terreno e localização.

### T1 · Ferramenta Topografia e contrato de modificação do terreno

- **Depende de:** V3.
- **Pode tocar:** novos `packages/tools/src/terrainTool.ts`, `terrainToolCurva.ts`, `terrainHandles.ts` e testes; `registry.ts`, `selectTool.ts`, `edit.ts`, `clipboard.ts`, `pasteLevels/command.ts`, `alignFeatures.ts`, `contratoModificacao.test.ts`, `contratoFerramentas.test.ts`; `sectionMoverElementos.ts`.
- **Passos:** ferramenta `terrain` com modos `pontos` e `curvas`. Curvas usam o **núcleo comum de desenho** `desenhoPolilinha.ts` (regra 1 do contrato de famílias; incluir em `LINEARES`). Campo "Cota" e "Passo" na barra de opções (o valor digitado passa por `cotaDoProjeto`). Enter conclui a curva; segundo Enter (ou Enter sem curva em curso) cria o terreno, ou acrescenta as fontes ao terreno selecionado. Regra 3 do contrato para `terrain`: mover, copiar, girar, espelhar, matriz, alinhar (feição: borda, política `transladar`), apagar, copiar e colar; **mover, copiar, girar e espelhar um terreno levam as suas regiões juntas** (molde: hospedeiro e hospedado em `edit.ts`); mover no corte: horizontal é `transform`, vertical soma o deslocamento a todas as cotas das fontes (um comando). `null` com motivo escrito: aparar, estender, dividir e deslocar ("terreno não é linear"); colar entre pavimentos ("cotas absolutas: o terreno é um só para todos os níveis").
- **Aceite:** `contratoModificacao.test.ts` com `terrain` apontando código real; um teste por ferramenta de modificação com desfazer; criação de T1 (pontos) e de T3 (curvas quadradas mais ponto) pela ferramenta em teste (sem navegador); mover terreno leva a região; mover no corte na vertical sobe todas as cotas.

### T2 · Modo "Editar terreno", rótulos e pontos cotados

- **Depende de:** T1.
- **Pode tocar:** novos `packages/tools/src/terrainEditTool.ts`, `terrainEditPick.ts`, `terrainEditGestos.ts`, `terrainLabelTool.ts` e testes; `registry.ts`, `contratoFerramentas.test.ts`; `apps/web/src/editor/state.ts` (campo `terrenoEdicao`), novo `apps/web/src/editor/terrenoEdicao.ts`; novos `packages/render/src/plan/terrenoEdicaoOverlay.ts` e teste; `planOverlay.ts`.
- **Passos:** o modo de A.6: escolha do vértice mais próximo por índice espacial das **fontes** (dado do modelo, permitido em TS); arrastar, cota, remover; submodos Ponto, Curva, Linha de quebra (núcleo comum de desenho) e Borda; limite de 500 alças na tela. Ferramentas `terrainLabel` (linha de rótulo, 2 cliques) e `terrainSpot` (ponto cotado, 1 clique), que escrevem `linhasRotulo` e `pontosCotados`; apagar um rótulo: clicar nele no modo de edição e Delete.
- **Aceite:** testes sem navegador: mover ponto (um `editTerrainFontes`, um desfazer); mudar a cota de um vértice de curva muda a curva inteira; remover ponto; desenhar linha de quebra com cota tirada do terreno; definir e remover borda; mais de 500 vértices na janela não desenha alças e devolve a mensagem; Esc sai do modo sem alterar; linha de rótulo e ponto cotado criados e removidos.

### U1 · Faixa, propriedades, localização, navegador e avisos

- **Depende de:** T2 e I1.
- **Pode tocar:** `apps/web/src/ui/ribbon/tabsSoon.ts` (só os painéis `mas-terreno`, `mas-lote`, `mas-analise`), `tabsMain.ts` (só o botão Localização em `gerenciar-projeto`), `actions.ts`, `model.ts`; novos `apps/web/src/ui/TerrainProperties.tsx`, `ui/dialogs/LocalizacaoDialog.tsx`, `localizacaoForm.ts` e testes; `OptionsBar.tsx`, novo `TerrainOptionsBar.tsx`; `Properties.tsx`, `ui/browser/`, `ui/contratoPaineisFamilia.test.ts` (classificar como "sem família"); `StatusBar.tsx` (cota do terreno sob o cursor); `useIssues.ts`, `goToIssue.ts`; `graphicsLabels.ts`; i18n do app (arquivo novo `apps/web/src/editor/i18n/areas/terreno.ts`).
- **Aceite:** os botões da fase 3 de A.6 funcionam e os das fases 4 e 5 continuam `soon` (os painéis `mas-lote` e `mas-analise` já existem); `TerrainProperties` com os campos e as leituras de A.6; diálogo de Localização (graus na interface, radianos no modelo; testado em `localizacaoForm.test.ts`); navegador com "Terrenos"; avisos 1, 2 e 5 no painel com "Ir para"; barra de status mostra "z terreno" com o valor de `cotaExibida`; `npm run check:ribbon-i18n`, `npm run test:i18n`, `npm run audit:i18n`, `node scripts/check-props-density.mjs` e `node scripts/check-units.mjs` verdes.

## Fase 4 — Regiões, corte e aterro

### T3 · Ferramenta de região e contrato de modificação

- **Depende de:** U1.
- **Pode tocar:** novos `packages/tools/src/terrainRegionTool.ts`, `terrainRegionHandles.ts`, `terrainRegionPick.ts` e testes; `registry.ts`, `selectTool.ts`, `edit.ts`, `clipboard.ts`, `pasteLevels/command.ts`, `alignFeatures.ts`, `contratoModificacao.test.ts`, `contratoFerramentas.test.ts`, `contratoSnaps.test.ts`, `sectionMoverElementos.ts`; novos `apps/web/src/ui/TerrainRegionProperties.tsx`, `TerrainRegionOptionsBar.tsx`; `Properties.tsx`, `OptionsBar.tsx`, `ribbon/tabsSoon.ts` (painel `mas-terreno`), `ribbon/actions.ts`, `contratoPaineisFamilia.test.ts`; i18n.
- **Molde:** `detailRegionTool.ts` (polígono fechado pelo núcleo comum), `outlineEdit.ts` (alças de vértice).
- **Passos:** ferramenta `terrainRegion` com três predefinições (Subdivisão, Plataforma, Região nivelada) e os padrões de A.6. O polígono tem de começar sobre um terreno (o terreno sob o primeiro clique vira `terrenoId`; sem terreno, mensagem e nada é criado). Plataforma: opção "Por elemento" (clique em laje ou piso copia o contorno resolvido; cota = face inferior). Alças de vértice; seta de direção quando `inclinacao > 0`. Regra 3 para `terrainRegion`: mover, copiar, girar, espelhar, matriz, alinhar, apagar, copiar e colar; mover no corte: horizontal é `transform`, vertical muda `cota` (subdivisão não anda na vertical: mensagem na barra de status). `null` com motivo: aparar, estender, dividir, deslocar ("região é polígono fechado"); colar entre pavimentos (mesmo motivo do terreno).
- **Aceite:** `contratoModificacao.test.ts` e `contratoSnaps.test.ts` com `terrainRegion` apontando código real; criação de T5 e T6 pela ferramenta em teste; "Por elemento" a partir de uma laje; um teste por ferramenta de modificação com desfazer; painel com os campos de A.3 (os de plano escondidos na subdivisão) e as leituras de área e volumes; avisos 3, 4 e 6 no painel com "Ir para".

### U2 · Tabela e mapa de corte e aterro

- **Depende de:** T3.
- **Pode tocar:** novos `packages/engine/src/terrenoSchedule.ts` e teste; `apps/web/src/ui/dialogs/TerrenoScheduleDialog.tsx`; o ponto onde as tabelas são listadas; novos `packages/render/src/plan/terrenoMapa.ts` e teste; `plan/terrenoCamada.ts`; `apps/web/src/editor/state.ts` (campo `mapaCorteAterro: boolean`); `ribbon/tabsSoon.ts` (painel `mas-analise`), `ribbon/actions.ts`; i18n.
- **Molde:** `guardaCorpoSchedule.ts`, `GuardaCorpoScheduleDialog.tsx`.
- **Aceite:** tabela e CSV de A.6 com T5 (corte na faixa de A.10, aterro 0, saldo) e T7; totais no rodapé; o mapa pinta de vermelho translúcido o corte e de azul o aterro (teste de contagem das operações de desenho com T5); mapa desligado não consulta o kernel.

## Fase 5 — Lote

### P1 · Geometria e índices do lote (motor, TS)

- **Depende de:** M1 (pode começar a qualquer momento depois da fase 0, mas a ordem padrão é depois da fase 4).
- **Pode tocar:** novos `packages/engine/src/loteGeometria.ts`, `loteIndices.ts`, `loteRumos.ts`, `loteIssues.ts`, `fixtureLote.ts` e testes; `index.ts`.
- **Passos:** A.4 regras 17, 18 e 19, só com a API pública do `@hestia/geom`. `loteRumos.ts`: tabela de azimute e distância ↔ polígono, erro de fechamento, e o inverso (comprimento e azimute de cada lado, para exibir). `loteIssues.ts`: os quatro avisos de A.6.
- **Aceite:** `l1_area_e_edificavel` (360; 84; 198), `l2_canto_reentrante` (156,86 ± 0,05), `i1_indices` (0,25; 0,5; 0,6667); `recuo_zero_nao_gera_faixa`; `rumos_retangulo_fecha` (erro < 1e-9) e `rumos_com_norte_verdadeiro` (norte a 30°: o polígono sai girado 30°); `rumos_ida_e_volta`; cada aviso com um caso positivo e um negativo; lote sem edificação: índices zero, sem divisão por zero.

### P2 · Lote em planta, snaps e extensão

- **Depende de:** P1.
- **Pode tocar:** novos `packages/render/src/plan/lote.ts`, `loteCamada.ts` e testes; `plan/build.ts`, `view.ts`, `planOverlay.ts`, `versoesPlanta.ts`, `extensaoDoModelo.ts` (+ teste); `packages/engine/src/apoioDeSnap.ts` (+ teste), `assinaturasNivel.ts`; `packages/tools/src/contratoSnaps.test.ts`; `packages/render/src/model3d/` e `section/` **só** onde os kinds são listados (o lote não é desenhado ali).
- **Aceite:** planta desenha o contorno (traço-dois-pontos, peso da categoria `lot`), a área edificável tracejada se `mostrarEdificavel`, e em cada lado o comprimento e o papel (texto pequeno, alinhado ao lado); seleção por clique no contorno e por caixa (interior não seleciona); snaps de vértice, meio e aresta do contorno e da área edificável; `COLETORES.lot`: `entra: false` com o motivo "lote não aparece em corte nem em elevação"; categoria `lot` desligada some.

### P3 · Ferramenta do lote, propriedades e contrato de modificação

- **Depende de:** P2.
- **Pode tocar:** novos `packages/tools/src/lotTool.ts`, `lotHandles.ts`, `lotPick.ts` e testes; `registry.ts`, `selectTool.ts`, `edit.ts`, `clipboard.ts`, `pasteLevels/command.ts`, `alignFeatures.ts`, `contratoModificacao.test.ts`, `contratoFerramentas.test.ts`; novos `apps/web/src/ui/LotProperties.tsx`, `ui/dialogs/LoteRumosDialog.tsx`, `loteRumosForm.ts` e testes; `Properties.tsx`, `ui/browser/`, `ribbon/tabsSoon.ts` (painel `mas-lote`), `ribbon/actions.ts`, `contratoPaineisFamilia.test.ts`; i18n.
- **Passos:** ferramenta `lot`: polígono pelo núcleo comum; ao concluir, cada lado nasce `lateral` com recuo 0, exceto o primeiro lado desenhado, que nasce `frente`. Diálogo "Por tabela": linhas de azimute (graus) e distância, ponto inicial (clique na planta ou coordenada), erro de fechamento ao vivo e a regra de aceite de A.4 regra 19. Alças de vértice (mover um vértice mantém `lados`); inserir vértice num lado duplica o papel e o recuo daquele lado; remover vértice funde os dois lados (fica o do primeiro). Painel: tabela de lados editável (papel, recuo), limites, leituras. Regra 3 para `lot`: mover, copiar, girar, espelhar, matriz, alinhar, apagar, copiar e colar, colar entre pavimentos (o lote é 2D: funciona); `null` com motivo: aparar, estender, dividir, deslocar ("lote é polígono fechado"); mover no corte: `null` ("lote não aparece no corte").
- **Aceite:** `contratoModificacao.test.ts` com `lot` apontando código real; criação de L1 pela ferramenta e pelo diálogo (mesmo polígono, 1e-9); inserir e remover vértice mantêm `lados.length === contorno.length`; um teste por ferramenta de modificação com desfazer; `loteRumosForm.test.ts` (erro de fechamento, bloqueio acima de 0,05 m sem a caixa marcada).

### P4 · Tabela "Índices do lote" e avisos

- **Depende de:** P3.
- **Pode tocar:** novos `packages/engine/src/loteSchedule.ts` e teste; `apps/web/src/ui/dialogs/LoteScheduleDialog.tsx`; o ponto onde as tabelas são listadas; `useIssues.ts`, `goToIssue.ts`; `ribbon/actions.ts`; i18n.
- **Aceite:** tabela e CSV de A.6 com I1 (25 %; 0,5; 66,67 %), cada índice com o limite e "dentro" ou "excede"; limite ausente mostra "—"; os quatro avisos do lote no painel com "Ir para"; criar uma laje dentro do lote atualiza a tabela aberta sem reabrir.

### P5 · Envelope legal e massas nos índices (CONDICIONAL)

- **Só execute se** `test -f packages/model/src/massTypes.ts` e a consulta `massa_fatias` estiver implementada no kernel desta branch. Senão, marque a ficha como **"pulada (massa ausente)"** no ESTADO, deixe o botão "Envelope legal" como `soon`, e siga. Ela pode ser feita depois, numa sincronização futura.
- **Depende de:** P4.
- **Pode tocar:** novos `packages/engine/src/loteEnvelope.ts` e teste; `loteIndices.ts` (opção "incluir massas"); `apps/web/src/editor/` (novo `loteEnvelopeActions.ts`); `LotProperties.tsx`, `LoteScheduleDialog.tsx`; `ribbon/tabsSoon.ts` (painel `mas-lote`), `ribbon/actions.ts`; i18n. **Nenhum arquivo `mass*` ou `massa*`**: só chamar o comando público `addMass` e o serviço público da massa.
- **Aceite (A.7):** L1 com gabarito 12 → uma massa com perfil `livre` 9 × 22, 2 seções (0 e 12), que passa em `massIssue`; L2 → perfil com o canto arredondado simplificado, ≤ 256 pontos; lote sem `gabaritoMax` → mensagem, nada criado; um desfazer; índices com "incluir massas" somam as fatias.

## Fase 6 — Integração e fecho

### G1 · Gravidade

- **Depende de:** U1 (terreno) e T3 (região).
- **Pode tocar:** `apps/web/src/editor/state.ts` (campo `gravidade: boolean`, salvo na sessão), novo `apps/web/src/ui/GravidadeButton.tsx` (molde: `OrthoButton.tsx`, `SnapButton.tsx`), `StatusBar.tsx`; `packages/tools/src/types.ts` (um campo opcional no ambiente da ferramenta: `cotaDoTerreno?: (x, y) => number | null`), `wallTool.ts`, `floorTool.ts`, `slabTool.ts`, `perimeterCommit.ts` (só o valor inicial de `heightOffset`), `terrainRegionTool.ts`; o ponto do app que monta o ambiente das ferramentas; testes ao lado; i18n.
- **Passos:** A.7 "Gravidade". A função vem do serviço `cotaDoTerreno` da ficha E1 (superfície proposta). Com o botão desligado, ou sem terreno sob o clique, o comportamento atual não muda em nada.
- **Aceite:** com T2 e gravidade ligada, parede iniciada em (10, 10) nasce com `baseOffset = 11,25 − elevação do nível`; laje iniciada ali nasce com `heightOffset` correspondente; com gravidade desligada os testes existentes das três ferramentas passam sem alteração; fora do terreno nada muda; nenhum vínculo é gravado no elemento.

### X1 · IFC, DXF e prancha

- **Depende de:** P4 (ou P5, se foi feita) e G1.
- **Pode tocar:** `packages/io/src/ifc/` (novo `ifcTerreno.ts`; `ifcExport.ts` e `ifcHestia.ts` só no registro), `packages/io/src/dxf*.ts` e `apps/web/src/editor/dxf*.ts` (camadas de A.7), o 3D vetorial da prancha onde os kinds são listados; testes ao lado.
- **Molde:** `ifcGeneric.ts` (malha), `ifcGuardaCorpo.ts`.
- **Aceite:** `npm run test:ifc-export` verde com um terreno no fixture (`IFCGEOGRAPHICELEMENT` com tipo `TERRAIN`, malha da superfície proposta sem saia nem base, sob o `IFCSITE`; `RefElevation` = `cotaZero`); teste DXF com as camadas de A.7 (curvas com a elevação no código 38); prancha com planta, corte e 3D vetorial de T5 gera PDF sem erro (teste existente de PDF estendido).

### Q1 · E2E, desempenho, paridade e documentação

- **Depende de:** X1. Rode B.7 antes.
- **Pode tocar:** novo `tests/e2e/terreno.mjs`; novos `docs/paridade/terrenos.md` e `docs/paridade/lotes.md`; novo `docs/decisoes/00NN-terreno-e-lote.md` (próximo número livre, conferido em `origin`; conteúdo = Parte A deste plano mais as emendas); `tests/` (teste de desempenho do terreno no molde dos `*.perf.test.ts`).
- **Passos:** E2E com o navegador já instalado (Playwright, `--trace off`) executando B.5; capturas em `docs/terreno/evidencias/final/`; medir A.8 item 5 no WASM.
- **Aceite:** `node tests/e2e/terreno.mjs` sai com código 0 e sem erro de console; A.8 itens 1 a 9 marcados um a um no relatório com o teste que prova cada um; checklists de paridade escritos com cada item marcado feito ou fora de escopo (A.9).
- **Só o fiscal** (depois desta ficha): acrescentar `terrenos` e `lotes` em `docs/paridade/ORDEM.json`, atualizar `docs/07-STATUS-V1.md` e `docs/04-ROTEIRO.md`, rodar `npm run check` completo e relatar ao dono.

## Fase 7 — Rastreamento e Referência (opcional; decisão D9)

**Antes de começar:** pergunte ao dono "posso executar a Fase 7 agora? A frente de vistas já foi mesclada na `main`?". Se as vistas **não** estiverem na `main`, avise que haverá conflito em `apps/web/src/editor/state.ts` quando elas chegarem, e só siga com o "pode".

Escopo fechado: a referência é **estado de interface** (salvo na sessão, não no projeto; sem migração). Ela generaliza o "Subpavimento" que já existe (`showUnderlay`). Fonte: a planta de **qualquer nível** do projeto. Controles: ligar, nível de origem, opacidade (10 a 100 %), cor única (ou "cores originais"), deslocamento (dx, dy) e rotação da referência, "na frente" ou "atrás". O DXF importado já é um elemento visível na planta e continua servindo de fundo como hoje. Fora: imagem e PDF, corte como fonte, comparação com divisor.

### F1 · Estado e desenho da referência

- **Pode tocar:** `apps/web/src/editor/state.ts`, `sessao.ts`, novo `apps/web/src/editor/referencia.ts` e teste; o ponto do render de planta que hoje desenha o subpavimento (procure `showUnderlay` em `packages/render/src/plan/` e em `apps/web/src/ui/ViewportCanvas.tsx`); testes ao lado.
- **Aceite:** com a referência desligada, nenhuma mudança de imagem (os testes de ouro da planta passam sem regravar); "Subpavimento" continua funcionando e passa a ser a referência com "nível abaixo"; referência de outro nível com deslocamento e rotação aparece no lugar certo (teste das operações de desenho); os elementos da referência **não** são selecionáveis, mas dão snap (como o subpavimento hoje; se hoje não dão, não mude).

### F2 · Interface da referência

- **Pode tocar:** `apps/web/src/ui/ribbon/tabsMain.ts` (ao lado do botão Subpavimento), `actions.ts`, novo `apps/web/src/ui/ReferenciaPanel.tsx`, `ViewOptionRows.tsx`; i18n (`ui_rf_*`).
- **Aceite:** painel com os controles do escopo; "Redefinir" zera deslocamento e rotação; `npm run check:ribbon-i18n` e `npm run test:i18n` verdes; captura da planta do térreo com o pavimento superior como referência em vermelho a 40 %, em `docs/terreno/evidencias/fase7/`.

---

# Parte E — Riscos e o que fazer

| Risco | Sinal | Ação do fiscal |
|---|---|---|
| Dono não aprova a `spade` (D1) | Resposta "não" no passo 0 | Não iniciar a R1. Fases 0 e a ficha P1 a P4 (lote) podem seguir. Relatar que A.4 precisa ser reescrita por um modelo mais forte. |
| Agente amplia o escopo (furos, vínculo de parede, imagem de fundo, tipos de terreno) | Arquivos fora da lista ou itens de A.9 no diff | Devolver; citar A.9. |
| Agente cria segunda geometria em TS | Triangulação, curva de nível ou interpolação de cota em `packages/engine`, `render` ou `tools` fora de teste | Devolver; citar A.5 "Kernel desligado". (Desenhar as **fontes** do modelo é permitido.) |
| Pânico no WASM | `INTERNO` nos testes WASM, ou `.unwrap()` / `panic!` no diff de produção | Devolver com a entrada que falha; citar A.4 regra 2. |
| Contrato muda depois da M2 | Diff em `cena-v11.json` fora da ficha M2 | Parar; perguntar ao dono. |
| `versao` ou `SCHEMA_VERSION` colide com a massa ou com as vistas | Conflito ao sincronizar (B.7) | Renumerar para o próximo livre; os ids 160–199 não mudam. |
| Conflito no binário WASM | `geom_wasm.wasm` em conflito | Nunca à mão: `npm run build:wasm` (B.7 passo 4). |
| Arquivo estoura 420 linhas | `npm run lint` | Devolver pedindo divisão; nunca mexer no limite. |
| Volume de T6 fora dos 2 % | Teste `t6_talude_corte` vermelho | Não afrouxar. Devolver pedindo conferência do passo `h`, dos gêmeos e da subdivisão em 16. Se persistir após 2 devoluções, parar e relatar ao dono com os números. |
| Curvas de nível abertas ou quebradas | Fuzz ou `t3_curvas_quadradas` vermelho | Não aceitar tolerância maior; devolver com a semente; citar A.4 regra 10 (vértice igual conta como acima). |
| Desempenho ruim com terreno grande | Tempos de A.8 item 5 acima do dobro | Registrar; perguntar ao dono se bloqueia. Sugestão já aprovada: aumentar a tolerância padrão de simplificação na importação. |
| Terreno engole os cliques da planta | Não dá para selecionar parede sobre o terreno | Devolver a V2; citar A.8 item 7. |
| Lista "Pode tocar" incompleta | Agente parou pedindo arquivo | B.1 item 9. |
| Ambiente sem WASM, sem `cargo` ou sem navegador | Comando falha já na linha de base | Relatar ao dono antes da ficha que depende dele; não pular o portão em silêncio. |
| Sessão reinicia no meio | — | Ler `docs/terreno/ESTADO.md`, conferir `git log` e `git worktree list`, retomar da primeira ficha não mesclada. Worktree perdido (as branches `terreno/<ficha>` não são enviadas ao GitHub): recriar o worktree (B.3) e refazer a ficha do começo. |

---

# Emendas (registradas pelo fiscal durante a execução)

(nenhuma)
