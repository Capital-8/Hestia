# Plano: estrutura (pilar arquitetônico, pilar estrutural, viga e fundação)

Frente nova. Base: `main` (esquema 25, kernel v18). Branch de trabalho: `claude/loving-archimedes-j3rx7i`.
Este arquivo é a lei da frente: Parte A (o que se constrói), B (manual do fiscal), C (bloco comum dos subagentes), D (fichas).
Referências: `docs/05-REFERENCIA-REVIT-ARCHICAD.md`, `docs/06-PROPRIEDADES-E-DIALOGOS.md`, `docs/contratos/*`,
ADR 0055 (guarda-corpo) e 0056 (parede cortina), que são os moldes de código.

# Parte A — O que será construído (decisões fechadas)

## A.0 Decisões do dono (2026-11-13) — "não reabrir"

1. **Dois tipos de pilar**: pilar **arquitetônico** e pilar **estrutural**. Cada um nasce no seu lugar: o arquitetônico
   na aba Arquitetura (botão "Pilar", hoje esmaecido), o estrutural na aba Estrutura (botão "Pilar").
2. **Toda geometria vai para o kernel Rust**, independentemente de desempenho. TS só guarda modelo, valida, orquestra e
   desenha a interface. Nenhum caminho TS gera malha, contorno em planta ou corte de pilar, viga ou fundação.
3. **Todos os perfis desde a primeira versão** (A.2).
4. **Escopo**: Pilar (2 disciplinas), Viga, Fundação (isolada, corrida, radier). **Fora**: contraventamento, treliça,
   sistema de vigas, emenda, armadura, cobrimento, modelo analítico, cargas, aço de ligação, pré-moldado. A treliça será
   a frente seguinte e usa a Viga como barra; por isso a Viga já nasce com extremidades **articuláveis** (`extremidade`).
5. **Dependência de esquema**: terreno e massa usam esquema 26 e kernel v19. Esta frente desenvolve sobre a `main`
   (esquema 25) usando **o próximo número livre** (26) e renumera na sincronização (B.7). Ids do kernel: seções e
   consultas **200 a 229**, que ninguém usa.
6. Sem web: Autodesk e Graphisoft estão bloqueados pela rede deste ambiente. A referência vem do repositório
   (`docs/05`, `docs/06`) e da documentação pública já conhecida; nada de engenharia reversa.

## A.1 Elementos

| kind | O que é | Forma em planta |
|---|---|---|
| `column` | Pilar. Campo `disciplina: 'arquitetonico' \| 'estrutural'`. | ponto + rotação |
| `beam` | Viga (só estrutural). | segmento (eixo `a`→`b`) |
| `footing` | Fundação rasa ou profunda. `modo: 'isolada' \| 'corrida'`. | ponto (isolada) ou segmento (corrida) |

- **Radier** não é kind novo: é `Slab` cujo `SlabType` tem `uso: 'fundacao'` (campo opcional novo; ausente = `'piso'`).
- **Pilar arquitetônico** (Revit: Architectural Column): é revestimento ou elemento decorativo; pode ser hospedado numa
  parede (`hostWallId`, segue a parede e herda o material de acabamento), não entra no quantitativo estrutural, vai
  para IFC como `IFCCOLUMN` com `PredefinedType = COLUMN` e `Pset_Hestia.disciplina = arquitetonico`.
- **Pilar estrutural** (Revit: Structural Column): material estrutural (concreto, aço, madeira, alvenaria estrutural),
  entra nos quantitativos (volume, forma, peso), `IFCCOLUMN`.
- **Viga**: `IFCBEAM`. **Fundação**: `IFCFOOTING` (sapata, baldrame) e `IFCPILE` quando `forma === 'estaca'`.

## A.2 Perfis (todos, desde o início)

`PerfilForma` (união fechada):

| forma | Parâmetros (metros) | Observação |
|---|---|---|
| `retangular` | `b` (largura), `h` (altura) | |
| `circular` | `d` | contorno com 96 lados |
| `L` | `b`, `h`, `tf` (alma e aba) | cantoneira de abas iguais ou desiguais |
| `T` | `b`, `h`, `tf`, `tw` | |
| `I` | `b`, `h`, `tf`, `tw` | cobre IPE, HEA, HEB, W |
| `U` | `b`, `h`, `tf`, `tw` | cobre UPN e U enrijecido sem enrijecedor |
| `tuboRetangular` | `b`, `h`, `t` | oco; o contorno tem um furo |
| `tuboCircular` | `d`, `t` | oco; um furo |
| `personalizado` | `anel: [x,y][]`, `furos?: [x,y][][]` | contorno livre fechado, ≥ 3 vértices |

- Origem no centro geométrico da caixa envolvente; X ao longo da largura, Y ao longo da altura do perfil.
- **Catálogo** de presets (`perfisCatalogo`, dados, sem lógica): retangulares e circulares de concreto usuais
  (15×30, 20×20, 20×40, 25×25, 30×30, 30×60, φ30, φ40…), madeira (6×12, 6×16, 6×20, 8×8, 10×10, 12×12),
  aço laminado (IPE 100–400, HEA/HEB 100–300, UPN 80–300, L 50–150, tubos 50–200). O catálogo é semente de tipos:
  o usuário cria tipos próprios com qualquer `PerfilForma`.
- Regras de validação (`validarPerfil`): dimensões finitas e > 0; `tf*2 < h`, `tw < b`, `t*2 < min(b,h)`; anel sem
  autointerseção e área > 1e-6 m²; furos dentro do anel e sem cruzar. Violação → `ENTRADA` no kernel e aviso no app.
- O contorno (anéis e furos) é calculado **só no Rust** (`estr_perfil.rs`); o TS só serve a prévia 2D do diálogo
  chamando a consulta de perfil do kernel (A.5), nunca refaz a conta.

## A.3 Modelo de dados (TS)

```ts
export type PerfilForma = /* união da A.2, com campo `forma` como discriminante */;

export interface EstrMaterialRef { materialId: Id }            // material do corpo (concreto, aço, madeira…)

export interface ColumnType {
  id: Id; name: string; code: string; description: string;
  disciplina: 'arquitetonico' | 'estrutural';
  perfil: PerfilForma;
  materialId: Id;                       // corpo
  /** Só arquitetônico: camadas de acabamento sobre o perfil, de dentro para fora (como `Layer`). */
  camadas?: Layer[];
  cost: number;                         // custo por metro (informativo)
  hatch?: HatchKind;                    // padrão: do material
}

export interface Column {
  id: Id; kind: 'column'; typeId: Id; levelId: Id;
  disciplina: 'arquitetonico' | 'estrutural';   // espelha o tipo; validado
  pos: Vec2; rotation: number;                  // radianos
  baseOffset: number;                           // m, relativo à cota do nível `levelId`
  topLevelId: Id | null; topOffset: number;     // topo: nível + offset; se null, `height` manda
  height: number | null;                        // usado quando topLevelId = null
  hostWallId?: Id;                              // só arquitetônico
  mark: string; comments: string; order: number;
  ifcProperties?: IfcProperty[];
}

export interface BeamType {
  id: Id; name: string; code: string; description: string;
  perfil: PerfilForma; materialId: Id; cost: number; hatch?: HatchKind;
}
export type BeamAlinhamento = 'topo' | 'centro' | 'base';       // do eixo em relação à seção
export type BeamExtremidade = 'rigida' | 'articulada';           // reservado à treliça; v1 só grava
export interface Beam {
  id: Id; kind: 'beam'; typeId: Id; levelId: Id;
  a: Vec2; b: Vec2;                                    // eixo em planta
  zOffsetA: number; zOffsetB: number;                  // m acima da cota do nível (inclinada se diferentes)
  alinhamento: BeamAlinhamento;                        // padrão 'topo'
  rotation: number;                                    // giro da seção em torno do eixo (rad)
  extremidadeA: BeamExtremidade; extremidadeB: BeamExtremidade;
  mark: string; comments: string; order: number; ifcProperties?: IfcProperty[];
}

export type FootingForma = 'sapata' | 'bloco' | 'estaca';
export interface FootingType {
  id: Id; name: string; code: string; description: string;
  modo: 'isolada' | 'corrida';
  forma: FootingForma;                   // corrida só 'sapata'
  base: PerfilForma;                     // sapata/bloco: retangular|circular|personalizado; estaca: circular|tuboCircular
  alturaBase: number;                    // m (estaca: comprimento)
  pescoco?: PerfilForma;                 // opcional, isolada: pilarete sobre a base
  alturaPescoco?: number;
  materialId: Id; cost: number; hatch?: HatchKind;
}
export interface Footing {
  id: Id; kind: 'footing'; typeId: Id; levelId: Id;
  pos?: Vec2; rotation: number;                       // isolada
  a?: Vec2; b?: Vec2; hostWallId?: Id;                // corrida (segue a parede se hospedada)
  topOffset: number;                                  // m: cota do TOPO da peça relativa ao nível (negativo = enterrada)
  mark: string; comments: string; order: number; ifcProperties?: IfcProperty[];
}
```

- `Project` ganha `columnTypes`, `beamTypes`, `footingTypes` (`Record<Id,…>`, **opcionais**: ausente = padrões por leitura,
  a primeira escrita grava o conjunto completo, como `mullionTypes`) e `perfisCustom?` não é necessário (o perfil vai no tipo).
- `Element` ganha `Column | Beam | Footing`. `GraphicsCategory` ganha `'columns'`, `'beams'`, `'footings'` com estilo próprio.
- `SlabType.uso?: 'piso' | 'fundacao'`.
- Comandos (um arquivo por kind, molde `guardaCorpoCommands.ts`): `addColumn`, `addBeam`, `addFooting`, `updateColumn`,
  `updateBeam`, `updateFooting`, `deleteElements` já genérico, `setColumnType`/`setBeamType`/`setFootingType`,
  `upsertColumnType` etc., `transform` (mover, girar, espelhar) levando os três kinds.
- Migração: `SCHEMA_VERSION` + 1, **sem alteração de dados** (campos opcionais), com teste de ida e volta.
- Valores padrão de criação: pilar estrutural 25×25 cm de concreto, topo = nível seguinte; pilar arquitetônico 20×20,
  topo = nível seguinte; viga 15×40 concreto, alinhamento topo; sapata isolada 80×80×30 com pescoço 25×25; corrida 40×30.

## A.4 Regras de geometria (o kernel Rust segue exatamente isto)

1. **Prisma**: o sólido de pilar e viga é a extrusão do perfil (anéis e furos) ao longo do eixo. Pilar: eixo vertical da
   `baseZ` ao `topoZ`. Viga: eixo de `a` a `b` com `z` linear; a seção fica num plano perpendicular ao eixo, com o eixo Y
   do perfil na vertical (giro `rotation` em torno do eixo). `alinhamento` desloca o eixo para o topo, centro ou base
   da seção. Eixo com comprimento < 1 mm → `ENTRADA`.
2. **Fundação**: isolada = base (extrusão `alturaBase` para baixo do topo da base) + pescoço (extrusão `alturaPescoco`
   para cima). O topo da peça é `topOffset`. Estaca = extrusão do perfil de `topOffset` para baixo `alturaBase`.
   Corrida = extrusão do perfil retangular ao longo do segmento, `topOffset` no topo.
3. **Planta** (consulta de planta): corte horizontal na cota de corte da vista. Pilar cortado → seção do perfil
   (hachura de concreto/aço/madeira). Viga **abaixo** da cota de corte (z máximo < corte) → contorno tracejado (convenção
   brasileira); viga cortada → seção. Fundação abaixo do corte → contorno tracejado fino. Elementos acima do corte
   (depois do intervalo de vista) não saem. Cada primitiva leva `id`, `categoria`, `estilo` (`0` cheio, `1` tracejado).
4. **Corte e elevação**: interseção do sólido com o plano da seção (recorte por profundidade igual ao das paredes), seção
   cortada hachurada e restante em linhas de contorno projetadas. Reusar `geo2d.rs`.
5. **Junções** (consulta separada, aplicada pelo TS aos recortes das paredes e das vigas): (a) pilar estrutural **vence**
   parede e alvenaria: a parede é recortada pela área do pilar no trecho vertical comum; (b) pilar arquitetônico **une**
   com a parede hospedeira (sem recorte, mesma hachura do acabamento); (c) viga termina na face do pilar: a extremidade
   que cai dentro da caixa de um pilar é aparada no contorno do pilar; (d) fundação isolada sob pilar: `footing` cujo
   `pos` coincide (≤ 5 cm) com um pilar estrutural herda `rotation` do pilar na criação assistida (comando do TS, não do kernel).
6. **Quantidades**: por elemento e por tipo: volume (m³), área de forma (m², superfície lateral menos faces apoiadas),
   peso (kg) quando o material tem `densidade` (aço 7850, concreto armado 2500, madeira conforme material), comprimento.
   Volume de pilar e viga por **integração exata** do prisma; interseções entre elementos não são abatidas (nota no relatório).
7. **Avisos** (id estável, consulta própria): perfil inválido; pilar com altura ≤ 0; viga com comprimento < 5 cm; pilar
   estrutural sem fundação sob ele (aviso informativo); viga cujas duas extremidades não encostam em pilar, parede ou
   viga (informativo); fundação com topo acima do nível do pilar.
8. **Determinismo**: a malha de um elemento depende só da linha do próprio elemento, do tipo e do nível. Sem aleatoriedade.

## A.5 Contrato TS ↔ Rust

Arquivo único do contrato: `crates/geom-wasm/schema/cena-v11.json` (só acrescentar; sobe `versao`).

- **Seções** (chave `id_num u32`, `definir_secao`/`upsert`/`remover`): `200 pilares`, `201 vigas`, `202 fundacoes`,
  `203 tipos_pilar`, `204 tipos_viga`, `205 tipos_fundacao`, `206 perfis` (anéis/furos dos perfis personalizados, uma linha por vértice).
  As colunas são fixadas na ficha K1, seguindo o molde `secoes_gc.rs`, e **congelam** ao fim da K1.
- **Consultas** (todas com `nivel_num`, `NIVEL_TODOS` aceito): `200 estr_malha` (malha por elemento e LOD),
  `201 estr_planta` (primitivas da A.4.3), `202 estr_corte` (A.4.4), `203 estr_quant` (A.4.6), `204 estr_avisos` (A.4.7),
  `205 estr_perfil` (anéis e furos de um `PerfilForma`, para a prévia do diálogo), `206 estr_juncoes` (A.4.5),
  `207 estr_apoio` (pontos e segmentos de snap, regra 6 do contrato).
- Consultas ainda não implementadas devolvem `NAO_IMPLEMENTADO` até a ficha que as entrega.
- Cache no TS por assinatura do elemento+tipo+nível; envio por diferença (molde de gc e cortina).

## A.6 Interface

- **Ribbon**: Arquitetura → painel Construir: botão `Pilar` (arquitetônico) vira ferramenta; Estrutura → painel Estrutura:
  `Pilar` (estrutural) e `Viga` viram ferramentas; Estrutura → Fundação: `Isolada`, `Parede` (corrida sobre parede) e `Laje`
  (radier = laje com tipo de fundação). Contraventamento, Sistema de vigas, Treliça e Emenda **continuam esmaecidos**.
- **Ferramentas**: `columnArchTool`, `columnStructTool` (um clique, barra de opções com tipo, rotação, nível de topo,
  "No nível seguinte"/"Altura", e "Em grades" que cria um pilar em cada interseção de grade selecionada), `beamTool`
  (traça pelo núcleo `desenhoPolilinha.ts`, regra 1; cada segmento vira uma viga; snap nos eixos e faces dos pilares),
  `footingIsolatedTool`, `footingWallTool` (clique numa parede hospeda a fundação corrida). Comando "Sapata sob pilares".
- **Painel de propriedades**: um `*Properties.tsx` por kind, com `TypeSelector` + "Editar tipo" (regra 2). Campos do pilar:
  nível base e deslocamento, nível de topo e deslocamento (ou altura), rotação, marca, comentários, (arquitetônico) parede
  hospedeira. Viga: nível, `zOffsetA/B`, alinhamento, giro, extremidades, comprimento (somente leitura), marca. Fundação: topo,
  rotação, parede hospedeira. Mostra os campos calculados pelo kernel: volume, área de forma, peso.
- **Modal de tipo** (regra 4, esqueleto comum): três diálogos (`ColumnTypeDialog`, `BeamTypeDialog`, `FootingTypeDialog`)
  com seções **Perfil** (forma, parâmetros que a forma pede, prévia 2D), **Material**, **Camadas** (só arquitetônico),
  **Fundação** (base e pescoço), **Identidade** (código, descrição, custo, hachura) e um seletor de **preset do catálogo**.
- **Quadro/Tabela**: lista de pilares, vigas e fundações com tipo, quantidade, volume e peso, na janela de quantitativos existente.
- **i18n**: pt, en e os outros cinco idiomas já mantidos, por `i18n.ts` (texto de interface nunca literal).

## A.7 Integração com o resto

- Regra 3 (modificação): os três kinds entram no `transform`, `selectedMovables`, copiar/colar, alinhar (feição `transladar`),
  corte/elevação. Hospedado: `Column.hostWallId` e `Footing.hostWallId` seguem a parede (padrão do guarda-corpo).
- Regra 6 (snaps): `apoioDoElemento` fornece vértices, meios de aresta, centro do pilar, eixo e faces da viga.
- Extensão do modelo (`COLETORES`): os três kinds **entram** (`entra: true`) com os pontos em planta.
- Visibilidade por vista (`visibleInView`): categorias `columns`, `beams`, `footings`; filtrável como as demais.
- 3D: malha do kernel; cor por material.
- IFC: exportação `IFCCOLUMN`, `IFCBEAM`, `IFCFOOTING`, `IFCPILE` com perfil extrudado (`IfcExtrudedAreaSolid` e
  `IfcArbitraryProfileDefWithVoids` para perfis com furo), psets do Hestia; importação **não** entra nesta frente.
- DXF: camadas `HESTIA-PILAR`, `HESTIA-VIGA`, `HESTIA-FUNDACAO` na planta e no corte.

## A.8 Critérios de estabilidade (valem em todas as fichas)

1. Nenhum comando que passava na linha de base passa a falhar; a contagem de testes só sobe.
2. Entradas inválidas (NaN, perfil degenerado, eixo nulo, anel autointersectante) devolvem `ENTRADA` ou aviso; **nunca derrubam o WASM**.
3. Mover, copiar, desfazer e refazer funcionam com os três kinds em 1000 elementos sem travar a interface (> 30 fps no arraste).
4. A malha de um perfil com furo tem a área da seção igual à área analítica em 1e-9 relativo.
5. Binário WASM reproduzível (`wasm:check`).

## A.9 Fora desta entrega (não fazer, mesmo que pareça fácil)

Armadura e cobrimento; cargas e condições de contorno; contraventamento, treliça, sistema de vigas, emenda, conexões de aço;
importação IFC de pilar e viga; pilar inclinado (eixo não vertical); pilar de seção variável; fundação com estacas agrupadas
em bloco com paramétrica de estacas; dimensionamento; peças pré-moldadas.

## A.10 Fixtures de referência (únicas, usadas por todas as fases)

| id | Descrição | Valores esperados |
|---|---|---|
| E1 | Pilar retangular 0,20 × 0,40, altura 3,00 | volume 0,24 m³; forma lateral 3,60 m² |
| E2 | Pilar circular φ0,30, altura 3,00 | volume 0,2121 m³ (96 lados: 0,2119, tolerância 1e-3 relativo ao círculo ideal) |
| E3 | Perfil I (b 0,10 h 0,20 tf 0,008 tw 0,005), pilar 3,00 | área 0,10·0,008·2 + 0,184·0,005 = 0,00252 m²; volume 0,00756 m³ |
| E4 | Tubo retangular 0,10×0,10 t 0,005, 3,00 | área 0,10² − 0,09² = 0,0019 m²; volume 0,0057 m³ |
| E5 | Viga 0,15×0,40 de `(0,0)` a `(5,0)`, topo, alinhamento topo | volume 0,30 m³; comprimento 5,00 |
| E6 | Viga E5 com pilar 0,20×0,40 em cada ponta | viga aparada no contorno dos pilares: comprimento livre 4,80 |
| E7 | Sapata isolada 0,80×0,80×0,30 + pescoço 0,25×0,25×0,50 | volume 0,192 + 0,03125 = 0,22325 m³ |
| E8 | Baldrame 0,40×0,30 de comprimento 6,00 | volume 0,72 m³ |
| E9 | Perfil personalizado L (anel de 6 vértices) | área do polígono por Shoelace |
| E10 | Perfil inválido (tf ≥ h/2, anel com cruzamento) | `ENTRADA`, sem pânico |

# Parte B — Manual do fiscal

O fiscal (a sessão principal) coordena. **Não decide projeto.** Ordem e regras:

## B.1 Regras

1. Uma ficha por vez, na ordem de B.4; paralelismo só onde B.4 indica.
2. **Nunca confiar em relatório.** Rodar os comandos do portão (B.3) mesmo quando o agente os rodou.
3. Parte A não muda sem decisão do dono. Dúvida de projeto: registrar em "Pendências" no ESTADO e seguir pelo caminho mais conservador.
4. Correção pelo fiscal só se pequena (≤ 20 linhas, sem mudar comportamento). O resto volta ao agente, no máximo 2 devoluções.
5. Estado em `docs/estrutura/ESTADO.md` depois de cada ficha.
6. Git: tudo na branch `claude/loving-archimedes-j3rx7i`; `git push -u origin claude/loving-archimedes-j3rx7i` depois de cada mescla aprovada. Sem PR sem pedido do dono.
7. Nada de atalho: não desligar teste, não afrouxar tolerância, não mexer em `eslint.config.js`, `vitest*.config.ts`, `scripts/check-*.mjs`, `.github`, `package.json`.
8. **Modelos:** trabalho mecânico (i18n, tabelas de registro, ESTADO, limpeza, conferências, catálogo de presets) usa **exclusivamente Haiku 5.5 em esforço médio**. Fichas de lógica usam o modelo padrão; K2 e K4 (geometria e junções no Rust) e V1 usam o mais forte disponível.
9. Arquivos de outras frentes: nunca tocar `terrain*`, `lot*`, `mass*`, `planView*`, `secoes_terreno.rs`, `secoes_massa.rs`.

## B.2 Passo 0

1. Linha de base na `main` limpa: `npm run typecheck`, `npm run lint`, `npm run test:rapido`, `cargo test -p geom-wasm`,
   `cargo clippy -p geom-wasm` (contar avisos), com `CARGO_TARGET_DIR=/tmp/hestia-target-estrutura`. Anotar no ESTADO.
2. Portão do clippy: total de avisos não pode passar da linha de base; arquivo novo ou alterado por esta frente não pode ter aviso.

## B.3 Ciclo de cada ficha

- **Worktree**: `git worktree add /home/user/hestia-wt/<ficha> -b estr/<ficha> claude/loving-archimedes-j3rx7i` e `npm ci` nele (sem symlink de `node_modules`).
- **Prompt do agente**: "Seu diretório de trabalho é `/home/user/hestia-wt/<ficha>`, na branch `estr/<ficha>`." + Parte C inteira + a ficha. Modelo conforme B.1.8.
- **Conferir** (no worktree): (1) escopo: `git diff --stat claude/loving-archimedes-j3rx7i...estr/<ficha>` só com arquivos da lista "Pode tocar"; (2) trapaça: `git diff … | grep -nE "^\+.*(\.skip\(|\.only\(|it\.fails|xit\(|eslint-disable|@ts-ignore|@ts-expect-error|as any|console\.log|#\[ignore\]|todo!\(|unimplemented!\(|\.unwrap\(\)|\.expect\(|panic!\()"` (`unwrap`, `expect` e `panic!` só dentro de `#[cfg(test)]`); (3) portão geral `npm run typecheck && npm run lint && npm run test:rapido`; fichas de Rust também `cargo test`, `cargo clippy`, `npm run build:wasm`, `npm run wasm:check`, `npm run test:wasm`; (4) portão da ficha; (5) `node scripts/check-lixo.mjs`.
- **Decidir**: verde → `git merge --no-ff estr/<ficha>` na branch de trabalho, repetir portão geral, push, atualizar ESTADO, remover worktree. Vermelho → devolver com o comando e a saída.

## B.4 Ordem das fichas

```
Fase 0  base            M1 → K1
Fase 1  kernel          K2 ∥ K3  (K1 pronta) → K4
        interface base  U1 (após M1, em paralelo a K2/K3)
Fase 2  vistas e uso    R1 ∥ T1 ∥ I1 (após K2+K3; T1 também após U1) 
Fase 3  fecho           I18 (i18n, Haiku) → V1 (verificação final)
```

## B.5 Roteiro de aceite final (V1 automatiza o que der)

Criar projeto, desenhar 4 pilares estruturais e 4 arquitetônicos, 4 vigas ligando os estruturais, sapata sob cada pilar, baldrame
sob uma parede e um radier; conferir planta (tracejado das vigas e fundações), corte, 3D, quantitativos, IFC e DXF; desfazer e
refazer tudo; salvar, reabrir, e conferir identidade; abrir um projeto v25 e conferir que abre sem alteração.

## B.6 Modelo do `docs/estrutura/ESTADO.md`

Tabela de fichas (estado, commit de mescla, devoluções, observações), decisões do dono, sincronizações com a `main`,
pendências, lições de processo.

## B.7 Sincronização com a `main`, terreno e massa

Antes de cada ficha de modelo ou kernel: `git fetch origin`. Se a `main` ou a branch do terreno/massa ocupou esquema ou
ids de kernel, **renumerar nesta frente** (nunca nas outras). Quando a `main` ganhar o esquema 26 ou o kernel v19, a
ficha seguinte mescla a `main` primeiro e renumera esquema e versão do contrato.

# Parte C — Bloco comum (vai inteiro no prompt de todo subagente)

```
REGRAS (valem para toda a tarefa)

1. Trabalhe SOMENTE no diretório indicado (um git worktree próprio). Não rode comandos em outros diretórios, não faça
   push, não crie PR, não troque de branch.
2. Antes de codar leia: docs/estrutura/PLANO.md (Parte A inteira e a sua ficha), docs/contratos/familias-e-ferramentas.md,
   docs/contratos/trabalho-de-agentes.md. A Parte A é lei. Se algo parecer errado ou faltar, PARE e relate.
3. Toque só nos arquivos da lista "Pode tocar" da ficha. Exceção: pontos de registro que enumeram kinds, categorias,
   seções ou consultas (um Record<Element['kind'], …>, um switch, um export de index.ts, a lista de ToolId); nesses,
   a entrada mínima com o marcador "estrutura: ficha XX". Nunca edite package.json, eslint.config.js, vitest*.config.ts,
   scripts/check-*.mjs, .github/, docs/estrutura/PLANO.md, docs/estrutura/ESTADO.md, nada de terrain*, lot*, mass*,
   planView*, secoes_terreno.rs, secoes_massa.rs.
4. Estilo: código, comentários e textos em português, como os vizinhos. Máximo de 420 linhas por arquivo (ESLint
   max-lines). Moldes: guardaCorpo*, curtain*, mullionProfile*, gc_*.rs, cortina_*.rs, secoes_gc.rs.
5. Proibido: dependência nova; .skip, .only, it.fails, #[ignore]; eslint-disable; @ts-ignore; `as any`; console.log;
   todo!()/unimplemented!(); .unwrap(), .expect() e panic!() fora de teste em Rust (o WASM aborta); apagar ou afrouxar teste.
6. Toda função nova tem teste ao lado. Texto de interface passa pelo i18n; número exibido por formatQuantity.
7. Nenhum caminho TS gera malha, contorno, planta ou corte de pilar, viga ou fundação: só o kernel Rust (A.0 item 2).
8. Rust: CARGO_TARGET_DIR=/tmp/hestia-target-estrutura. Nunca deixe crates/*/target no worktree.
9. Commits pequenos na branch atual; `wip: …` a cada marco verde; o último `feat(estrutura): …`.
10. Antes de terminar deixe verde: npm run typecheck ; npm run lint ; npm run test:rapido ; o "Aceite" da ficha. Se tocou
    Rust: cargo test -p geom-wasm, cargo clippy, npm run build:wasm, npm run wasm:check, npm run test:wasm, e inclua o
    binário regravado em packages/geom/assets/. Se NÃO tocou Rust e rodou build:wasm, desfaça: git checkout packages/geom/assets.
11. RELATÓRIO FINAL: branch e hash; arquivos criados/alterados; resultado de cada comando do item 10; cada item do Aceite
    (feito/não feito, com o nome do teste); decisões não escritas e dúvidas; o que NÃO foi feito.
```

# Parte D — Fichas

Cada uma: depende de, pode tocar, passos, aceite.

## Fase 0 — Base

### M1 · Modelo, comandos e migração (TS)
- **Depende de:** nada. **Molde:** `git diff --name-status d5d139a4^1 d5d139a4` (merge da M1 da massa) lista todos os pontos que enumeram kinds.
- **Pode tocar:** `packages/model/src/` (novos `estrTypes.ts`, `perfis.ts`, `perfisCatalogo.ts`, `column.ts`, `columnCommands.ts`, `beam.ts`, `beamCommands.ts`, `footing.ts`, `footingCommands.ts`, `validateEstr.ts` e testes; `types.ts`, `commands.ts`, `migrate.ts`, `graphics.ts`, `elementLevel.ts`, `copyLink.ts`, `historyRotulos.ts`, `i18n.ts`, `index.ts` e os testes que enumeram kinds); pontos de registro de `apps/web`, `packages/io`, `packages/render`, `packages/tools` só com a entrada mínima marcada "estrutura: ficha XX" (`contratoModificacao.test.ts`, `contratoSnaps.test.ts`, `extensaoDoModelo.ts`, `typeActions.ts`, `graphicsLabels.ts`, `canvas-nav.ts`, `dxf*.ts`, `ifcHestia.ts`).
- **Passos:** tipos de A.3 exatamente; validações (`validarPerfil` e cada regra de A.2); comandos e `transform`; padrões por leitura de `columnTypes`, `beamTypes`, `footingTypes`; `SlabType.uso`; `SCHEMA_VERSION`+1 com migração sem dados e teste de ida e volta; marcar cada ponto de registro que quebrar com `"estrutura: ficha …"`.
- **Aceite:** testes por regra de validação (um caso por regra de A.2); cada comando com desfazer/refazer; `transform` dos três kinds (mover, girar 90°, espelhar); migração 25→26 sem diferença nos projetos existentes; typecheck, lint, test:rapido verdes; lista dos marcadores no relatório.

### K1 · Contrato do kernel (JSON, esboços Rust, esquema TS)
- **Depende de:** M1. **Molde:** `secoes_gc.rs`, `secoes_massa.rs`, `secoes_cortina.rs`.
- **Pode tocar:** `crates/geom-wasm/schema/cena-v11.json`; `crates/geom-wasm/src/esquema.rs`, `lib.rs`, `consultas.rs` (só registro), `cena.rs` (SOMENTE `use`, campo, roteamento de `definir_secao`/`upsert`/`remover`); novo `secoes_estr.rs`; `packages/geom/src/kernel/v2/esquema.gerado.ts` (regenerado), `quadros.test.ts` (lista de seções); `packages/geom/assets/*` (binário).
- **Passos:** declarar seções 200–206 e consultas 200–207 de A.5, coluna por coluna (campos de A.3, perfis em linhas de vértices); subir `versao`; `$comentario` da versão; regenerar o esquema TS; seções aceitam `definir_secao`; consultas devolvem `NAO_IMPLEMENTADO`.
- **Aceite:** `contrato_confere_com_json` e `esquema.test.ts` verdes; JSON só acrescenta; portão de Rust completo. **Depois da K1 o contrato congela.**

## Fase 1 — Kernel Rust (modelo mais forte em K2 e K4)

### K2 · Perfis, prismas, pilar e viga (`estr_perfil.rs`, `estr_malha.rs`, consultas 200, 205)
- **Depende de:** K1. **Pode tocar:** novos `estr_perfil.rs`, `estr_prisma.rs`, `estr_malha.rs`, `estr_testes.rs`; `secoes_estr.rs`, `lib.rs`, `consultas.rs`; teste WASM; binário.
- **Passos:** contornos dos 9 perfis da A.2 (anel e furos, 96 lados no círculo), validação; prisma por extrusão com tampas e furos (triangulação de polígono com furos por `geo2d.rs`/ear clipping sem dependência nova); pilar e viga conforme A.4.1; consultas 200 e 205.
- **Aceite (testes Rust):** `e1`, `e2`, `e3`, `e4`, `e5`, `e9`, `e10` com os valores de A.10; `malha_valida` (cada aresta interna em 2 triângulos, normais para fora, volume da malha = analítico em 1e-9); `perfil_com_furo_area` (A.8.4); `fuzz_perfis_200` sem pânico; teste WASM chama 200 e 205 pela ABI.

### K3 · Fundações (`estr_fundacao.rs`)
- **Depende de:** K1 (K2 para os utilitários de prisma; pode rodar em paralelo se K2 já mesclou `estr_prisma.rs`, senão após K2).
- **Aceite:** `e7`, `e8` com os valores de A.10; estaca com `tuboCircular`; radier não passa pelo kernel de fundação (é `Slab`); malha válida.

### K4 · Planta, corte, junções, quantidades, avisos e apoio (consultas 201–204, 206, 207)
- **Depende de:** K2, K3. **Pode tocar:** novos `estr_planta.rs`, `estr_corte.rs`, `estr_juncoes.rs`, `estr_quant.rs`, `estr_avisos.rs`, `estr_apoio.rs`.
- **Aceite:** `e6` (viga aparada pelo pilar), planta com tracejado das vigas abaixo do corte, corte hachurado, quantidades batem com a malha (`quant_bate_com_malha`), avisos A.4.7, snaps (vértices, meios, centro, eixo), fuzz de junções sem pânico, desempenho: 2000 elementos em planta < 50 ms nativo (registrar).

## Fase 1b — Interface base

### U1 · Painéis, modais de tipo e seletor de perfil (TS/React)
- **Depende de:** M1 (consulta 205 pode ser mockada até K2). **Pode tocar:** `apps/web/src/ui/` (novos `ColumnProperties.tsx`, `BeamProperties.tsx`, `FootingProperties.tsx`, `dialogs/ColumnTypeDialog.tsx`, `BeamTypeDialog.tsx`, `FootingTypeDialog.tsx`, `PerfilEditor.tsx`, `PerfilPreview.tsx`), testes-guarda de classificação (`contratoPaineisFamilia.test.ts`, `contratoModaisFamilia.test.ts`, `alinhamentoModaisFamilia.test.ts`), `apps/web/src/editor/typeActions.ts`.
- **Aceite:** painéis com `TypeSelector` + Editar tipo (regra 2); modais no esqueleto comum (regra 4); seletor de perfil com todas as formas, campos conforme a forma e prévia 2D vinda da consulta 205; presets do catálogo; testes de renderização.

## Fase 2 — Vistas e uso (em paralelo após K2+K3+K4 conforme dependência)

### R1 · Render: planta, corte, elevação e 3D
- **Depende de:** K2, K3, K4. **Pode tocar:** `packages/render/src/` (planta: camadas de pilar, viga, fundação; corte; 3D), `packages/engine/src/` (adaptador do kernel para os três kinds, cache por assinatura, aviso `estr-sem-kernel`), `apps/web/src/editor/` (só pontos de ligação do render).
- **Aceite:** planta com hachura, viga tracejada e categorias com estilo; corte e elevação; 3D com cor por material; ouro de render dos projetos existentes **idêntico**; teste de snapshot dos três kinds.

### T1 · Ferramentas, botões, modificação e snaps
- **Depende de:** M1, K2, K4, U1. **Pode tocar:** `packages/tools/src/` (novos `columnArchTool.ts`, `columnStructTool.ts`, `beamTool.ts`, `footingTools.ts`, `estrAssist.ts` — "Em grades" e "Sapata sob pilares"), `packages/tools/src/` pontos de modificação (regra 3) e snaps (regra 6), `apps/web/src/ui/ribbon/tabsMain.ts`, `tabsSoon.ts`, `actions.ts`, `registry`, `apps/web/src/editor/` ligações.
- **Aceite:** botões habilitados nos lugares da A.6; viga pelo núcleo `desenhoPolilinha.ts`; "Em grades" cria um pilar por interseção; hospedagem em parede; contratos de modificação, snaps e ferramentas atualizados sem exceções TODO; testes de cada ferramenta.

### I1 · IFC, DXF e quantitativos
- **Depende de:** K2, K3, K4. **Pode tocar:** `packages/io/src/` (`ifc/`, `dxf*.ts`), `scripts/test-ifc-export.mjs` (só acrescentar casos), janela de quantitativos em `apps/web`.
- **Aceite:** IFC com `IFCCOLUMN`, `IFCBEAM`, `IFCFOOTING`, `IFCPILE`, perfil extrudado com furo; DXF com as três camadas; tabela de quantitativos com volume, forma e peso; `test:ifc-export` verde.

## Fase 3 — Fecho

### I18 · Tradução (Haiku 5.5, esforço médio)
- Mecânico: preencher as chaves `estr_*` nos outros idiomas mantidos em `apps/web/src/editor/i18n/areas/` seguindo a gramática e a tabela de termos já existentes; rodar `test:i18n`. Sem lógica.

### V1 · Verificação final (modelo mais forte)
- Roteiro B.5, checagem cruzada das fichas, relatório `docs/estrutura/RELATORIO.md`, ADR `docs/decisoes/0057-estrutura.md`, atualização de `docs/07-STATUS-V1.md`, limpeza (`/tmp/hestia-target-estrutura`, worktrees), push.
