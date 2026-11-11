# Decisão 0055 — Guarda-corpo e corrimão (modelo, norma configurável, contrato com o kernel Rust)

Data: 2026-11-08. Estado: **integração em andamento (`feat/gc-integracao`)**: fases 1, 2, 3a, 3b, 3c, 4, 6 e a exportação IFC mescladas; ver §14 a §20.
Numeração: o maior número visto em `origin/main` e nas branches remotas é 0054 (`feat/termino-camada`); 0051 a 0053 estão em branches do kernel. Há números duplicados históricos (0046, 0047, 0049); se 0055 colidir na hora de mesclar, renumere.

Marcações de confiança usadas abaixo: **[LIDO]** = página ou PDF aberto e lido nesta rodada; **[BUSCA]** = só o resultado da busca, página não aberta; **[A CONFIRMAR]** = valor que não está em fonte pública verificada (norma paga da ABNT, ou fonte secundária). Valores marcados [A CONFIRMAR] entram nos perfis de norma com `verificado: false` e aparecem como "(a conferir)" nas mensagens, como já faz a rampa (`RampType.normChecked`).

---

## 1. Decisões do dono (de partida, não reabrir)

1. **Hospedeiros automáticos: escada e rampa.** Ligar/desligar por lado (esquerdo/direito, visto de quem sobe) e por tipo de trecho (lance, patamar). O guarda-corpo segue lances, patamares, mudanças de direção e a escada caracol, e **se refaz quando a escada muda**.
2. **Hospedeiros manuais: borda de laje, varanda e mezanino.** O usuário traça o início e o fim do caminho (que pode encostar numa borda).
3. **Preenchimento completo:** balaústres em padrão (vários balaústres por padrão, espaçamento, justificação, por degrau), painéis (vidro, chapa, chapa perfurada, tela, cabo de aço) e postes (início, fim, canto, intermediários).
4. **Norma configurável:** um perfil de norma por projeto (e por país), editável, que só gera avisos. Vem o perfil Brasil (NBR 9077, NBR 14718, NBR 9050) e exemplos IBC (EUA) e Parte K (Reino Unido).
5. **Arquitetura:** modelo, família, UI, editor de tipo e quantidades em TS; geometria pesada no Rust (caminho 3D hospedado, varredura de perfil, junções, distribuição, malha, linhas de planta e corte). O TS entra só como referência em testes, como no resto do kernel.

---

## 2. Pesquisa

### 2.1 Revit (Autodesk)

[LIDO] [Railing System Type Properties](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-6385104B-4295-4659-855F-BA7DD2793CD5.htm):
- **Railing Height** (altura do corrimão superior); **Rail Structure (Non-Continuous)**: lista de trilhos, cada um com altura, deslocamento, material e perfil; **Baluster Placement**: abre o editor de padrão; **Baluster Offset** (deslocamento lateral do balaústre à linha do croqui).
- **Use Landing Height Adjustment** + **Landing Height Adjustment**: sobe ou desce o guarda-corpo nos patamares intermediário e de topo.
- **Angled Joins** (trechos em ângulo, sem conexão vertical): *Add Vertical/Horizontal Segments* ou *Add No Connector*. **Tangent Joins** (trechos colineares ou tangentes): os dois anteriores mais *Extend Rails to Meet*. **Rail Connections**: *Trim* (corte em plano vertical) ou *Weld* (mais próximo de esquadria, bom para perfil circular).
- **Top Rail** (altura e tipo) e **Handrail 1 / Handrail 2** (posição Esquerda, Direita ou as duas; tipo; altura vem do tipo do corrimão).

[LIDO] [Continuous Rail Type Properties](https://help.autodesk.com/cloudhelp/2023/ENU/Revit-ArchDesign/files/GUID-B6A3CEF7-E14C-46DA-8F0C-61556908EB99.htm) (corrimão e top rail):
- **Default Join** (esquadria ou filete) e **Fillet Radius**; **Hand Clearance** (borda externa do corrimão à parede/poste); **Projection**; **Profile**; **Height** (topo do corrimão acima do hospedeiro).
- **Transitions**: *None* (o corrimão interno acaba na quina do primeiro ou do último degrau), *Gooseneck* (transições apertadas e perfis complexos), *Simple* (transições apertadas com perfil circular).
- **Supports**: família, layout (*None, Fixed Distance, Align with Posts, Fixed Number, Maximum Spacing, Minimum Spacing*), espaçamento, número, justificação (início, centro, fim).
- **Extensions** (início/base e fim/topo): estilo *None, 1 - Wall, 2 - Floor, 3 - Post*, comprimento e **Plus Tread Depth** (soma uma profundidade de degrau; a página diz que "pode ser necessário para atender a muitos códigos de corrimão"). **Terminations** nas duas pontas.

[LIDO] [Create a Custom Baluster Pattern](https://help.autodesk.com/cloudhelp/2018/ENU/Revit-Model/files/GUID-84F925AC-E09A-4C79-A7F7-EA2F20FF6364.htm) e [BUSCA] [BalusterPlacement (API)](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/33c016f2-bf39-a852-052f-b1c80b0f1860.htm):
- Padrão principal (*Main Pattern*): por linha, *Name, Baluster Family, Base* (hospedeiro ou um trilho), *Base Offset, Top, Top Offset, Distance from previous, Offset*. **Break Pattern**: *Each Segment End*, *Angles Greater Than* (quebra e põe poste onde o giro em planta passa do valor) ou *Never*. **Justify** (início, fim, centro) e **Excess Length Fill** (como preencher a sobra quando a justificação não é "espalhar"). Postes (*Start, Corner, End*) ficam no mesmo editor (`PostPattern` na API). **Use Baluster Per Tread on Stairs** e número de balaústres por degrau.
- Página que descreve **Main Pattern: Spacing, Justify e Excess Length Fill** em detalhe não foi aberta (a página lida remete a outro tópico): o cálculo exato da sobra do Revit é [A CONFIRMAR].
- Não lido: *Railing System Instance Properties* (Base Level, Base Offset, Tread/Stringer Offset, Host, Slope). A busca mostra que o corrimão do Revit tem **Place on Tread / Stringer** ([BUSCA] em [Override the Main Baluster Pattern for Stairs](https://help.autodesk.com/cloudhelp/2015/ENU/Revit-Model/files/GUID-2F7A63EC-3756-4021-ABD8-133593CC041F.htm)); o nome das propriedades de instância é [A CONFIRMAR].
- Já registrado em `docs/05-REFERENCIA-REVIT-ARCHICAD.md` §5: o corrimão sai com o lance e é desligável ([Run Component Tool](https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-26053199-6B08-44B9-907C-F5D9AA7CEC81.htm)); corrimão contínuo entre escadas separadas não é possível.

### 2.2 ArchiCAD (Graphisoft)

[LIDO] [Railing Settings: Overview](https://help.graphisoft.com/AC/28/INT/_AC28_Help/040_ElementsVB/040_ElementsVB-211.htm) e [BUSCA] das páginas irmãs ([About the Railing Tool](https://help.graphisoft.com/AC/30/INT/Topics/040_ElementsVB/040_ElementsVB-205.html), [Inner Post Settings](https://help.graphisoft.com/AC/25/INT/_AC25_Help/040_ElementsVB/040_ElementsVB-230.htm), [Panel Settings](https://help.graphisoft.com/AC/21/INT/AC21Help/03_1_Elements_Virtual_Building/03_1_Elements_Virtual_Building-198.htm), [Pattern Distribution](https://community.graphisoft.com/t5/Modeling/Railing-Tool-Basics-Pattern-Distribution-Settings/ta-p/303682), esta última com erro 403 ao abrir):
- Dois níveis: **Segmentos** (trecho entre dois nós; tem o *Railing Pattern* e a altura do segmento) e **Nós** (os pontos que dividem os segmentos; um ou mais **Postes** em cada nó).
- O padrão do segmento é feito de: **Toprail**, **Handrail** (até dois, cada um pode ser duplicado nos dois lados), **Rails**, **Inner Posts** (entre nós, ao contrário dos Posts, que ficam nos nós), **Balusters** ("um padrão dentro do padrão", pode haver mais de um conjunto) e **Panels** (preenchem o vão entre dois Inner Posts ou Rails; onde já há balaústres não cabe painel).
- Distribuição do padrão: dividir o segmento em N partes, distribuir igualmente por comprimento máximo, ou comprimentos fixos. O padrão **para no nó e recomeça no segmento seguinte**; a configuração *Pattern Continuity* do nó carrega o padrão adiante.
- Páginas separadas para *Connection Settings* e *Railing Ends* (extremidades e conexões de Toprail, Handrail e Rail): [BUSCA], conteúdo não aberto.
- A associação do corrimão com escada/laje no ArchiCAD (guarda-corpo que segue a escada) não foi confirmada em página oficial: **[A CONFIRMAR]**. O Hestia segue o modelo do Revit nesse ponto (decisão do dono, item 1).

### 2.3 Normas

**NBR 9077 (saídas de emergência)** — [LIDO] texto da norma em cópia pública ([mprj.mp.br, NBR 9077](https://www.mprj.mp.br/documents/20184/74453/nbr_9077_saidas_de_emergencia_em_edificios_2001.pdf); o corpo do texto traz o cabeçalho "NBR 9077/1993", o arquivo se chama 2001: diferenças entre as edições são [A CONFIRMAR]). Item 4.8:
- 4.8.1.1: guarda em todo desnível maior que **19 cm** (corredores, balcões, terraços, mezaninos, patamares, escadas, rampas).
- 4.8.1.2: altura mínima **1,05 m** ao longo de patamares, corredores, mezaninos; pode cair para **0,92 m nas escadas internas**, medida na vertical do topo da guarda à linha que une as pontas dos bocéis (quinas dos degraus).
- 4.8.1.3: escadas externas, patamares e balcões **a mais de 12 m** do solo: **1,30 m**.
- 4.8.1.4: guardas vazadas (exceto grupos I e J): **esfera de 15 cm** não passa por nenhuma abertura; sem saliências que enganchem roupa; material não estilhaçável (vidro aramado ou laminado).
- 4.8.2: corrimão entre **80 e 92 cm**; seção circular **38 a 65 mm**; afastado **40 mm no mínimo** da parede/guarda; contínuo, sem arestas; outros corrimãos em alturas diferentes são permitidos (escolas).
- 4.8.3: guarda resiste a **730 N/m** horizontal a 1,05 m e **1,20 kPa** na área bruta; corrimão resiste a **900 N** em qualquer ponto, vertical e horizontal.
- 4.8.4: escada com mais de **2,20 m** de largura leva corrimão intermediário a cada **1,80 m** no máximo; lanços entre corrimãos com no mínimo **1,10 m**.
- 4.7.2 b: corrimão pode invadir até **10 cm** de cada lado sem alargar a escada. 4.6.2.7: rampas têm guardas e corrimãos "de forma análoga" a 4.8.
- Complemento estadual [LIDO] ([Orientação Técnica 001-17, CBMPR](https://www.bombeiros.pr.gov.br/sites/bombeiros/arquivos_restritos/files/documento/2018-12/OrientacaoTecnica00117guardaCorpoEcorrimao.pdf), baseada na NPT 11): o guarda-corpo interno da escada pode servir de corrimão se tiver 0,92 m e cumprir 5.8.2 (os itens equivalentes da NPT 11 são os de 4.8 da NBR 9077). É norma de incêndio estadual, não vale como geral.

**NBR 14718 (guarda-corpos de edificação)** — a norma é paga; nada foi lido nesta rodada. O repositório já traz uma tabela em `docs/aberturas/archicad/04-brasil-tipos-e-normas.md` §6.5 (lida de um PDF público da edição 2001, hoje fora do ar para este agente; há revisões de 2008 e 2019): altura mínima **1,10 m**; mureta de 20 a 80 cm pede guarda de **0,90 m** acima dela; vão entre perfis **110 mm**; carga horizontal e vertical **1000 N/m** (uso privativo) e **1670 N/m** (uso comum); impacto de **700 J** no painel; ancoragem. Tudo isso fica **[A CONFIRMAR]** contra a edição vigente; outras fontes de editais ([BUSCA], Lages-SC) repetem 1,10 m citando "NBR 9050:2020 e NBR 14718:2008".

**NBR 9050 (acessibilidade)** — norma paga, nada lido. [BUSCA, fonte secundária]: corrimãos em **dois lados** de escadas e rampas, em **duas alturas**, **0,92 m e 0,70 m** (do topo do corrimão à quina do degrau); seção circular de **30 a 45 mm**; **prolongamento de 0,30 m** no início e no fim (editais citam; não achei a página da norma); afastamento da parede: os 40 mm achados na busca são de barras de apoio, não de corrimão (para corrimão a norma mais citada diz 40 mm, mas **[A CONFIRMAR]**). Tudo [A CONFIRMAR].

**IBC 2021 (EUA)** — [BUSCA] [1015.3 Height](https://codes.iccsafe.org/s/IBC2021P1/chapter-10-means-of-egress/IBC2021P1-Ch10-Sec1015.3) e [1015.4 Opening limitations](https://codes.iccsafe.org/s/IBC2021P1/chapter-10-means-of-egress/IBC2021P1-Ch10-Sec1015.4): guarda **42 pol (1067 mm)** do piso ou da linha das quinas dos degraus; esfera de **4 pol (102 mm)** (e 4 3/8 pol = 111 mm em faixas e em unidades residenciais); abertura triangular de degrau: esfera de **6 pol (152 mm)**; guarda servindo de corrimão em R-3: **34 a 38 pol** acima da linha das quinas. Corrimão 34-38 pol, extensão horizontal de 12 pol no topo e um degrau embaixo, pegada de 1 1/4 a 2 pol, folga de 1 1/2 pol da parede, cargas de 50 lbf/pé e 200 lbf pontual (ASCE 7): **[A CONFIRMAR]** (conhecimento geral, não verificado).

**Approved Document K (Inglaterra)** — [BUSCA] só visões gerais ([gov.uk](https://www.gov.uk/government/publications/protection-from-falling-collision-and-impact-approved-document-k)); os valores abaixo são de memória e **[A CONFIRMAR]**: guarda de **900 mm** em escadas e patamares internos de casas, **1100 mm** em sacadas e bordas externas; esfera de **100 mm**; corrimão de **900 a 1000 mm**; extensão de 300 mm só em rampas e escadas de uso público.

---

## 3. Como o código está hoje (leitura)

- **Escada** (`packages/model/src/stairTypes.ts`): `Stair` guarda `components: Array<StairRun | StairLanding>`; `StairRun` é um croqui (`boundaryLeft`, `boundaryRight`, `risers`, `path`, `spiral?`); `StairCurve = {a, b, sag}` (reta ou arco por flecha). Escada livre: `freePath`, `manualLandings`. `StairType` traz `maxRiser, minRiser, minTread, calc*` e `minRunWidth`. **Não há corrimão nem guarda-corpo** no modelo (`docs/02-MODELO-BIM.md` §9 apenas prevê "guarda-corpo por trajetória com baluste/montante").
- **Rampa** (`rampTypes.ts`): mesmo `components` (cada lance tem exatamente 2 linhas de espelho), `shape`, `freePath`, `turn`; `RampType.normProfile/normTable/normChecked` é o precedente de norma configurável por tipo.
- **Resolução** (`packages/engine/src/stairs.ts`, `ramps.ts`): `ResolvedStair` (degraus com polígono e `z`, espelhos com `a`, `b`, `z0`, `z1`, `spiral?`) e `ResolvedRamp` (lances com `startEdge`, `endEdge`, `z0`, `z1`; patamares com anel e `z`). Normas da escada em `stairNorms.ts` (`StairNorms`, `DEFAULT_STAIR_NORMS`), avisos em `stairIssues.ts` (`StairIssueItem`, `makeStairIssue`). O patamar de giro é um anel de 6 pontos `[aIn, inner, bIn, bOut, outer, aOut]` (`docs/handoff/escada-livre/contrato-escada-livre.md` §1).
- **Tipos no projeto:** `Project.stairTypes`, `rampTypes`, `openingTypes` (`types.ts:786-789`) com `upsertStairType`/`deleteStairType` em `commands.ts`; `SCHEMA_VERSION = 23` com migração por versão em `migrate.ts`. `Element` é uma união fechada (`types.ts`, hoje `Wall | Opening | Floor | Slab | Ceiling | Roof | Stair | Ramp | Room | Generic | CadDrawing`) e `hasLevel` em `elementLevel.ts` é lista explícita.
- **Famílias autorais (componentes):** decisão 0049 (`origin/feat/familias-interface`, ainda fora da main) define `ComponentFamily/ComponentType/Component` com parâmetros e fórmulas. Aqui, o guarda-corpo **não depende dela** (o tipo é um registro tipado, como `StairType`); a integração futura é balaústre e poste usarem uma `ComponentFamily` (ver §12, ponto aberto 4).
- **Kernel Rust** (`crates/geom-wasm`, contrato `schema/cena-v11.json`, `versao: 12`, `abi: 2`): seções em colunas planas (`u32`, `i32`, `f64`, `u8`), chave `id_num`, seções 1 a 25 (paredes, tipos, camadas, faixas, pisos, lajes, contornos, furos, forros...), 16 consultas (`resolver_nivel`, `pisos_lajes_nivel`, `quant_paredes` ... `quant_forros`); saídas são vetores planos tipados com `elementos` por linha; limites `4_194_304` linhas por seção e `268_435_456` bytes por chamada; constantes espelhadas em `esquema.rs` com teste `contrato_confere_com_json`. O adaptador TS (`packages/engine/src/kernelB.ts`) monta as seções a partir do `Project` e decide o que enviar pronto ao Rust (furos de escada e rampa já vão resolvidos por elemento).
- **Quantidades, IFC e renderização de escada** são módulos por tipo: `engine/stairQuantities.ts`, `io/src/ifc/ifcElements.ts` (`addStairs`, `addRamps`, IFC4), `render/src/model3d`, `render/src/plan`, `render/src/section`, `tools/src/stair*.ts`, `apps/web/src/ui/Stair*.tsx`.

---

## 4. Modelo de dados (TS exato)

Arquivo novo `packages/model/src/guardaCorpoTypes.ts` (só tipos e constantes, no molde de `stairTypes.ts`). Metros e radianos em todo o modelo. Nomes em português, como pediu o dono; o discriminante do elemento é `'railing'` (os outros `kind` do projeto são em inglês: `'stair'`, `'ramp'`).

### 4.1 Elemento

```ts
/** Lado de um caminho, visto de quem sobe (escada, rampa) ou de quem percorre o caminho manual. */
export type LadoGC = 'esquerdo' | 'direito';

/** Em que parte do hospedeiro o guarda-corpo existe: ligar/desligar por lado e por tipo de trecho. */
export interface LadoHospedado {
  /** Acompanha os lances (e, na rampa, os lances inclinados). */
  lance: boolean;
  /** Acompanha os patamares (inclui o patamar de giro). */
  patamar: boolean;
}

/** Revit: Place on Treads / Stringer. */
export type PosicaoBaseGC = 'degrau' | 'lateral';

export interface HospedeiroEscada {
  tipo: 'escada';
  escadaId: Id;
  lados: Record<LadoGC, LadoHospedado>;
  posicaoBase: PosicaoBaseGC;
}
export interface HospedeiroRampa {
  tipo: 'rampa';
  rampaId: Id;
  lados: Record<LadoGC, LadoHospedado>;
  posicaoBase: PosicaoBaseGC;
}
/** Borda de laje, varanda, mezanino: o usuário traça o caminho. `referenciaId` só ajuda a ferramenta e o "Ir para". */
export interface HospedeiroManual {
  tipo: 'manual';
  uso: 'borda-laje' | 'varanda' | 'mezanino' | 'livre';
  referenciaId?: Id;
  /** Vértices em planta; `dz` é o desnível sobre `cotaBase` (0 = horizontal). Mínimo 2 pontos. */
  caminho: PontoCaminhoGC[];
  /** Laço fechado (último ponto liga ao primeiro). */
  fechado: boolean;
  /** Lado do caminho para o qual o deslocamento lateral vale. */
  ladoDeslocamento: LadoGC | 'centro';
}
export interface PontoCaminhoGC { x: number; y: number; dz: number }

export type HospedeiroGC = HospedeiroEscada | HospedeiroRampa | HospedeiroManual;

export interface GuardaCorpo {
  id: Id;
  kind: 'railing';
  levelId: Id;
  typeId: Id;
  hospedeiro: HospedeiroGC;
  /** Cota do ponto de partida sobre o nível, só no modo manual (m). Em escada e rampa vem do hospedeiro. */
  cotaBase: number;
  /** Deslocamento lateral do eixo do guarda-corpo (m); positivo = para dentro do hospedeiro (sobre o degrau/laje). null = usa o do tipo. */
  deslocamento: number | null;
  /** Altura do guarda-corpo (m) quando difere do tipo; null = a do tipo. */
  altura: number | null;
  /** Inverte o sentido do caminho (muda o início e o fim; no manual, o lado "esquerdo"). */
  inverter: boolean;
  /** Sobrescritas de instância (Revit: parâmetros de instância). Só o que o usuário alterou. */
  sobrescritas?: Partial<SobrescritasGC>;
  mark: string;
  comments: string;
  /** Ordem de criação. */
  order: number;
}
export interface SobrescritasGC {
  postesIntermediarios: boolean;
  preenchimentoAtivo: boolean;
  corrimaoAtivo: boolean;
  normaId: Id | null;
}
```

Regras do elemento:
- `GuardaCorpo` **não guarda geometria**. A geometria deriva do hospedeiro a cada resolução; é isso que o faz se refazer quando a escada muda (§6.1).
- Hospedeiro escada/rampa inexistente: erro de validação `railing-host-missing` (o guarda-corpo fica no modelo, sem desenho, e entra na lista de problemas).
- `levelId` de escada e rampa = `levelId` do hospedeiro (o nível da base). Mudar o hospedeiro troca o `levelId` no comando.
- Um guarda-corpo por hospedeiro e conjunto de lados é o padrão; o botão "Criar guarda-corpo" na escada cria um com os dois lados ligados.

### 4.2 Tipo (família)

Arquivo `guardaCorpoTypes.ts`, `Project.tiposGuardaCorpo: Record<Id, TipoGuardaCorpo>`.

```ts
export type FormaPerfilGC = 'circular' | 'retangular' | 'poligono';

/** Perfil de varredura ou de extrusão vertical. Origem no centro; Y para cima. */
export interface PerfilGC {
  forma: FormaPerfilGC;
  /** circular: diâmetro; retangular: largura (m). */
  largura: number;
  /** retangular: altura (m); ignorado no circular. */
  altura: number;
  /** poligono: vértices anti-horários (m), 3 a 64 pontos. */
  pontos?: Vec2[];
}

export type RefBaseGC =
  | { de: 'hospedeiro' }                 // piso/degrau/linha das quinas
  | { de: 'trilho'; indice: number };    // um dos `trilhos` do tipo
export type RefTopoGC =
  | { de: 'altura' }                     // altura do guarda-corpo
  | { de: 'trilho'; indice: number }
  | { de: 'corrimao'; indice: number };

/** Revit: Rail Structure (trilho não contínuo). */
export interface TrilhoGC {
  nome: string;
  /** Altura do eixo sobre o hospedeiro (m). */
  altura: number;
  /** Deslocamento lateral (m). */
  deslocamento: number;
  perfil: PerfilGC;
  materialId: Id;
}

export type ExtremidadeEstiloGC = 'nenhum' | 'parede' | 'piso' | 'poste';
export interface ExtensaoGC {
  estilo: ExtremidadeEstiloGC;
  /** Comprimento horizontal da extensão (m). */
  comprimento: number;
  /** Revit: Plus Tread Depth. Soma a profundidade de um degrau (só escada e rampa). */
  maisPiso: boolean;
}
export type LayoutSuporteGC = 'nenhum' | 'distancia-fixa' | 'alinhar-postes' | 'numero-fixo' | 'espacamento-maximo' | 'espacamento-minimo';
export interface SuportesGC {
  layout: LayoutSuporteGC;
  espacamento: number;
  numero: number;
  justificacao: JustificacaoGC;
  perfil: PerfilGC;
  /** Comprimento do suporte (m), do eixo do corrimão ao ponto de fixação. */
  comprimento: number;
  materialId: Id;
}
export type TransicaoCorrimaoGC = 'nenhuma' | 'simples' | 'pescoco-de-ganso';
export type JuncaoCorrimaoGC = 'esquadria' | 'filete';

/** Corrimão ou travessa superior (Revit: Continuous Rail; ArchiCAD: Toprail e Handrail). */
export interface CorrimaoGC {
  nome: string;
  /** 'topo' = travessa superior sobre os postes (não é para agarrar); demais = corrimão. */
  funcao: 'topo' | 'corrimao';
  /** Em que lado do guarda-corpo fica. 'eixo' = sobre o eixo (travessa superior). */
  posicao: 'eixo' | 'esquerda' | 'direita' | 'ambas';
  /** Altura do TOPO do corrimão sobre o hospedeiro (m): sobre a linha das quinas em escada e rampa. */
  altura: number;
  /** Folga entre a face lateral do corrimão e a face do guarda-corpo ou da parede (m). */
  afastamento: number;
  perfil: PerfilGC;
  materialId: Id;
  extensaoInicio: ExtensaoGC;
  extensaoFim: ExtensaoGC;
  suportes: SuportesGC;
  transicao: TransicaoCorrimaoGC;
  juncao: JuncaoCorrimaoGC;
  raioFilete: number;
}

export type PapelPosteGC = 'inicio' | 'fim' | 'canto' | 'intermediario';
export interface PosteGC {
  ativo: boolean;
  perfil: PerfilGC;
  materialId: Id;
  /** Quanto o poste sobe acima da altura do guarda-corpo (m, ≥ 0). */
  alturaAcima: number;
  /** Quanto desce abaixo da base (m, ≥ 0; embute na laje/degrau). */
  profundidadeAbaixo: number;
}
export interface PostesGC {
  inicio: PosteGC;
  fim: PosteGC;
  /** Poste em cada vértice cujo giro em planta passa de `anguloCanto`. */
  canto: PosteGC;
  anguloCanto: number;      // rad, padrão 5° (0,0873)
  intermediario: PosteGC & {
    modo: 'nenhum' | 'espacamento-maximo' | 'espacamento-fixo' | 'numero-fixo';
    espacamento: number;    // m
    numero: number;         // por trecho
  };
}

export type JustificacaoGC = 'inicio' | 'fim' | 'centro' | 'distribuir';
export type QuebraPadraoGC = 'cada-segmento' | 'angulo' | 'nunca';
export type SobraPadraoGC = 'nenhuma' | 'balaustre-extra' | 'folga-nas-pontas';

/** Um balaústre dentro do padrão. `modelo: null` = vazio (só ocupa espaço). */
export interface ElementoPadraoGC {
  modelo: { perfil: PerfilGC; materialId: Id } | null;
  /** Distância horizontal ao elemento anterior do padrão (m); o primeiro usa 0. */
  distanciaAnterior: number;
  deslocamentoLateral: number;
  /** Cortes de altura em relação à base e ao topo do padrão (m). */
  deslocamentoBase: number;
  deslocamentoTopo: number;
}

/** Padrão de balaústres (Revit: Main Pattern; ArchiCAD: Balusters). */
export interface PadraoBalaustresGC {
  tipo: 'balaustres';
  nome: string;
  base: RefBaseGC;
  topo: RefTopoGC;
  elementos: ElementoPadraoGC[];            // 1 a 16
  /** Distância horizontal entre o início de uma repetição e o da seguinte (m). Maior que a soma das `distanciaAnterior`. */
  periodo: number;
  justificacao: JustificacaoGC;
  sobra: SobraPadraoGC;
  quebra: QuebraPadraoGC;
  anguloQuebra: number;                     // rad, usado com quebra 'angulo'
  /** O padrão é distribuído em cada vão entre postes ('vao') ou no segmento inteiro ('segmento'). */
  escopo: 'vao' | 'segmento';
  /** Só escada/rampa: balaústres por degrau no lugar do `periodo` nos lances. */
  porDegrau: { ativo: boolean; quantidade: number; distanciaDaQuina: number; modelo: ElementoPadraoGC['modelo'] };
}

export type FamiliaPainelGC = 'vidro' | 'chapa' | 'chapa-perfurada' | 'tela' | 'cabo-aco';
export interface PainelGC {
  tipo: 'painel';
  nome: string;
  familia: FamiliaPainelGC;
  base: RefBaseGC;
  topo: RefTopoGC;
  deslocamentoBase: number;
  deslocamentoTopo: number;
  /** Espessura do painel (m): vidro, chapa, chapa perfurada. */
  espessura: number;
  /** Folga lateral entre o painel e o poste (m). */
  folgaLateral: number;
  /** Largura máxima de um painel (m); acima disso divide em painéis iguais. 0 = sem limite (um painel por vão). */
  larguraMaxima: number;
  materialId: Id;
  /** Só 'chapa-perfurada'. Furo circular. */
  perfuracao?: { diametro: number; passoX: number; passoY: number; alternado: boolean };
  /** Só 'tela': malha retangular e fio. */
  tela?: { larguraMalha: number; alturaMalha: number; diametroFio: number };
  /** Só 'cabo-aco': cabos paralelos. */
  cabos?: { diametro: number; espacamento: number; orientacao: 'horizontal' | 'vertical'; tensao?: number };
}

export type PreenchimentoGC = PadraoBalaustresGC | PainelGC;

export type JuncaoAngularGC = 'segmento-vertical' | 'nenhum';
export type JuncaoTangenteGC = 'segmento-vertical' | 'nenhum' | 'estender-trilhos';
export type ConexaoTrilhoGC = 'cortar' | 'soldar';

export interface TipoGuardaCorpo {
  id: Id;
  name: string;
  code: string;
  description: string;
  /** Altura nominal do guarda-corpo (m), medida do hospedeiro ao topo do trilho superior. */
  altura: number;
  /** Deslocamento lateral padrão do eixo (m). */
  deslocamento: number;
  /** Revit: Landing Height Adjustment. Soma à altura nos patamares (0 = desligado). */
  ajusteAlturaPatamar: number;
  /** Folga entre a base do preenchimento e o hospedeiro (m), para o aviso de vão inferior. */
  folgaInferior: number;
  trilhos: TrilhoGC[];                      // 0 a 12
  corrimaos: CorrimaoGC[];                  // 0 a 4
  postes: PostesGC;
  preenchimentos: PreenchimentoGC[];        // 0 a 8, desenhados na ordem
  juncaoAngular: JuncaoAngularGC;
  juncaoTangente: JuncaoTangenteGC;
  conexaoTrilho: ConexaoTrilhoGC;
  /** Perfil de norma que vale para este tipo; null = o do projeto. */
  normaId: Id | null;
  /** Para o IFC (IfcRailingTypeEnum): null = o Hestia escolhe pela composição (§9). */
  ifcPredefinido: 'GUARDRAIL' | 'HANDRAIL' | 'BALUSTRADE' | 'USERDEFINED' | null;
  materialPadraoId: Id;
  /** Cargas que o tipo declara suportar (o Hestia não calcula estrutura); null = não declarada. */
  cargaLinear: number | null;   // N/m
  cargaArea: number | null;     // kPa
  cargaPontual: number | null;  // N
  /** Custo informativo (R$ por metro). */
  cost: number;
}
```

Limites (defesa e determinismo, no molde da decisão 0049): `trilhos ≤ 12`, `corrimaos ≤ 4`, `preenchimentos ≤ 8`, `elementos` por padrão ≤ 16, perfil poligonal ≤ 64 pontos, caminho manual ≤ 512 vértices, balaústres por guarda-corpo ≤ 20 000 (acima disso o Rust devolve `LIMITE` e o app avisa).

`stairTypeIssue`-equivalente: `tipoGuardaCorpoIssue(tipo, lang)` (em `guardaCorpoTypes.ts`) confere ao salvar: altura > 0; `periodo > soma das distanciaAnterior`; larguras de perfil > 0; `RefBaseGC/RefTopoGC` apontando para trilho existente; trilho de referência abaixo do topo; `porDegrau.quantidade ≥ 1`; sem ciclo (base referindo trilho que referencia a si).

Tipos iniciais (`tiposGuardaCorpo(lang)`), nomes de i18n `md_gc_*`:
`gct_balaustres` (corrimão superior + balaústres redondos a cada 0,11 m de centro, 2 postes de extremidade), `gct_vidro` (painéis de vidro laminado entre postes de aço, corrimão tubular), `gct_cabos` (cabos de aço horizontais a 0,09 m), `gct_chapa_perfurada`, `gct_corrimao_parede` (só corrimão, sem preenchimento: corrimão de parede da NBR 9050, duas alturas 0,92 e 0,70).

### 4.3 Perfil de norma

Arquivo `packages/model/src/guardaCorpoNorma.ts`. `Project.perfisNorma?: Record<Id, PerfilNorma>` (opcional, semeado com os presets na primeira vez, no molde de `openingProfiles?`) e `ProjectSettings.normaGuardaCorpoId?: Id`.

```ts
/** Fonte de um limite: norma, item e se o valor foi verificado em texto público. */
export interface FonteNormaGC { norma: string; item: string; verificado: boolean }

/** Todos os limites são opcionais: `undefined` = não verificar. Metros, newtons, radianos. */
export interface LimitesNormaGC {
  // --- guarda ---
  /** Desnível a partir do qual a guarda é exigida (m). NBR 9077 4.8.1.1: 0,19. */
  desnivelExigeGuarda?: number;
  /** Altura mínima da guarda sobre piso, patamar, mezanino, varanda (m). */
  alturaMinima?: number;
  /** Altura mínima da guarda em escada INTERNA, medida da linha das quinas (m). */
  alturaMinimaEscadaInterna?: number;
  /** Altura mínima acima de uma cota de queda e o valor exigido ali (NBR 9077 4.8.1.3: 12 m → 1,30 m). */
  alturaMinimaAlta?: { acimaDe: number; altura: number };
  /** Maior esfera que não pode passar por nenhuma abertura da guarda (m). */
  esferaMaxima?: number;
  /** Idem, na abertura triangular entre degrau, espelho e trilho inferior. */
  esferaMaximaTriangulo?: number;
  /** Maior folga entre a base do preenchimento e o hospedeiro (m). */
  folgaInferiorMaxima?: number;
  /** Cargas de projeto (informativas: a verificação é "o tipo declara carga"). */
  cargaLinearHorizontal?: number;   // N/m
  cargaAreaHorizontal?: number;     // kPa
  cargaPontualGuarda?: number;      // N
  // --- corrimão ---
  /** Faixa de altura do topo do corrimão (m), medida da linha das quinas em escada. */
  corrimaoAlturaMin?: number;
  corrimaoAlturaMax?: number;
  /** Alturas adicionais exigidas para o corrimão duplo (NBR 9050: 0,70 m). */
  corrimaoAlturasAdicionais?: number[];
  /** Diâmetro de seção circular (m). */
  corrimaoDiametroMin?: number;
  corrimaoDiametroMax?: number;
  /** Afastamento mínimo da parede/guarda (m). */
  corrimaoAfastamentoMin?: number;
  /** Prolongamento mínimo no início e no fim (m). */
  corrimaoExtensaoMin?: number;
  /** Exige corrimão nos dois lados. */
  corrimaoDoisLados?: boolean;
  /** Corrimão contínuo (sem interrupção) nos lances e patamares. */
  corrimaoContinuo?: boolean;
  /** Largura de escada acima da qual exige corrimão intermediário, e espaçamento máximo entre corrimãos (m). */
  corrimaoIntermediarioLargura?: number;
  corrimaoIntermediarioEspacamento?: number;
  cargaCorrimao?: number;           // N
}

export interface PerfilNorma {
  id: Id;
  name: string;
  /** Código ISO 3166-1 alfa-2 ou 'XX' para personalizado. */
  pais: string;
  limites: LimitesNormaGC;
  /** Fonte por campo de `limites`. Campo sem fonte = valor do usuário. */
  fontes: Partial<Record<keyof LimitesNormaGC, FonteNormaGC>>;
  /** false = tem valores "a conferir": as mensagens acrescentam "(norma a conferir)". */
  verificado: boolean;
  /** Para onde a guarda vale: 'residencial' | 'publico' | 'saida-emergencia' (informativo, ver §8). */
  uso: 'geral' | 'residencial' | 'publico' | 'saida-emergencia';
}
```

Presets (`PERFIS_NORMA_PADRAO`):

| id | Campo | Brasil composto (`nbr-br`) | IBC 2021 (`ibc-us`) | Parte K (`uk-k`) |
|---|---|---|---|---|
| `desnivelExigeGuarda` | | 0,19 (9077 4.8.1.1) | 0,762 (30 pol) [A CONFIRMAR] | 0,6 [A CONFIRMAR] |
| `alturaMinima` | | **1,10** (14718, a confirmar; a 9077 pede 1,05) | 1,067 | 1,10 (sacada); 0,90 (interno) |
| `alturaMinimaEscadaInterna` | | **0,92** (9077 4.8.1.2) | 1,067 | 0,90 |
| `alturaMinimaAlta` | | 12 m → 1,30 (9077 4.8.1.3) | — | — |
| `esferaMaxima` | | **0,110** (14718, a confirmar; a 9077 pede 0,15) | 0,102 | 0,100 |
| `esferaMaximaTriangulo` | | 0,15 (9077) | 0,152 | — |
| `corrimaoAlturaMin/Max` | | 0,80 / 0,92 (9077 4.8.2.1; 9050 0,92) | 0,864 / 0,965 | 0,90 / 1,00 |
| `corrimaoAlturasAdicionais` | | [0,70] (9050, a confirmar) | — | — |
| `corrimaoDiametroMin/Max` | | 0,038 / 0,045 (interseção 9077 38-65 e 9050 30-45) | 0,032 / 0,051 | — |
| `corrimaoAfastamentoMin` | | 0,040 (9077 4.8.2.4) | 0,038 | — |
| `corrimaoExtensaoMin` | | 0,30 (9050, a confirmar) | 0,305 [A CONFIRMAR] | 0,30 (público) |
| `corrimaoDoisLados` | | true (9050 e 9077 4.7.x) | true | false |
| `corrimaoIntermediario*` | | 2,20 / 1,80 (9077 4.8.4.1) | — | — |
| `cargaLinearHorizontal` | | 1000 (14718, a confirmar) a 730 (9077) | 730 (50 lbf/pé) | — |
| `cargaAreaHorizontal` | | 1,20 kPa (9077) | 0,24 kPa (5 psf) [A CONFIRMAR] | — |
| `cargaCorrimao` | | 900 N (9077 4.8.3.2) | 890 N (200 lbf) | — |

Regra de composição do Brasil: **vale o mais restritivo** entre as três normas (maior altura mínima, menor esfera, interseção de diâmetro). Os campos onde as normas divergem ficam anotados em `fontes` com as duas referências no texto do item (ex.: `item: '14718 (1,10); 9077 4.8.1.2 (1,05)'`). Todos os presets saem com `verificado: false`, exceto os campos da NBR 9077 lidos nesta rodada, que o preset marca com `FonteNormaGC.verificado: true`. O usuário edita qualquer valor (`upsertPerfilNorma`), duplica o preset e escolhe o perfil do projeto em Configurações do projeto; cada `TipoGuardaCorpo.normaId` pode apontar para outro perfil (ex.: guarda de saída de emergência com outro uso).

### 4.4 Comandos e migração

Em `commands.ts`: `addGuardaCorpo`, `updateGuardaCorpo` (patch), `deleteGuardaCorpo`, `upsertTipoGuardaCorpo`, `deleteTipoGuardaCorpo` (como `deleteStairType`: não apaga o último, não apaga tipo em uso), `upsertPerfilNorma`, `deletePerfilNorma` (não apaga o do projeto), `setNormaGuardaCorpo`. Comandos de escada e rampa que mudam geometria **não precisam** tocar nos guarda-corpos (derivação em tempo de resolução); `deleteStair`/`deleteRamp` marcam os guarda-corpos dependentes como órfãos (erro `railing-host-missing`) em vez de apagá-los, e o painel oferece "excluir órfãos". `moveElements`/espelhar/girar/copiar tratam o manual com `transformPlanar.ts`; guarda-corpo hospedado em escada acompanha o hospedeiro (não se move sozinho).

Migração `SCHEMA_VERSION` 23 → 24: acrescenta `tiposGuardaCorpo` (tipos iniciais) a projetos antigos; `perfisNorma` e `normaGuardaCorpoId` são opcionais (sem migração). Se outra branch já tiver subido a versão na hora de mesclar, a Fase 1 renumera.

Pontos de integração do elemento novo (lista da Fase 1; mesmo roteiro da decisão 0049 §2): `Element` em `types.ts`, `isGuardaCorpo`, `hasLevel` (`elementLevel.ts`), `GraphicsCategory` ganha `'railing'` (`graphics.ts`), `validate.ts` (`validateGuardaCorpo.ts`), `clipboard`/colar, `selectTool`/`pick`, `transform`, lista de problemas, i18n (`md_gc_*`).

---

## 5. Regras de geometria

Convenções: planta em `Vec2` (x, y), cota z absoluta, tolerância de soldagem de nós `1e-6 m`, grade de saída de 1 µm (mesma regra das quantidades, memória "Quantidades no Rust"). **Esquerdo/direito** = lado visto de quem sobe a escada ou percorre o caminho no sentido do início ao fim.

### 5.1 Caminho hospedado (o "eixo" do guarda-corpo)

O Rust constrói, por guarda-corpo e por lado ligado, uma **cadeia de nós 3D** `N_k = (x, y, z, tipoTrecho, origem)` e trechos entre eles; o eixo do guarda-corpo é essa cadeia deslocada.

**Escada.** Para cada componente na ordem de `components`:
1. **Lance reto:** a borda do lado escolhido é a cadeia `boundaryLeft` ou `boundaryRight` do croqui. A cota segue a **linha das quinas**: para cada espelho `i`, o ponto da borda mais próximo da linha de espelho recebe `z1_i` (topo do espelho); entre dois espelhos a cota varia **linearmente com o comprimento horizontal** (a reta de inclinação da escada, não o serrote dos degraus). Vira um único trecho inclinado por lance reto (os `z1` são colineares); o nó só existe nas pontas do lance.
2. **Lance curvo ou caracol:** a borda é uma sequência de `StairCurve` (reta ou arco por flecha `sag`). O arco é discretizado por **flecha de corda ≤ 2 mm** (`tolCorda` do tipo, ajustável 0,5 a 10 mm) com no mínimo 8 segmentos por quarto de volta, e a cota cresce linearmente com o comprimento de arco horizontal (a hélice). Nenhum nó de canto no meio do arco: o trecho é marcado `curvo`, e a varredura trata o conjunto como uma curva suave.
3. **Patamar (`StairLanding`, incluindo patamar de giro):** a cadeia do lado é o anel do patamar **sem a aresta de entrada e sem a aresta de saída** (as arestas que coincidem com a linha de espelho final do lance anterior e a inicial do seguinte). No anel de 6 pontos do giro, a cadeia interna é `aIn → inner → bIn` e a externa é `aOut → outer → bOut`; qual é "esquerda" ou "direita" vem do sinal do produto vetorial entre a direção de entrada e a de saída. Cota constante = `z` do patamar. Em patamar retangular em linha, as duas cadeias são as laterais.
4. **Emendas:** o fim da cadeia de um componente e o início do seguinte coincidem dentro de `1e-6 m` e são soldados num nó. Se não coincidirem (croqui editado à mão), o Rust devolve o aviso `gc-hospedeiro-descontinuo` e abre o caminho em dois (cada parte com poste de fim/início).
5. **Ligar/desligar:** `lados[lado].lance` e `lados[lado].patamar` filtram os componentes. Onde o filtro interrompe a cadeia, ela se parte em **trechos independentes**, cada um com seus postes de início e fim, extensões de corrimão e padrão de balaústres (não existe guarda-corpo "fantasma" atravessando o intervalo).
6. **Posição de base:** `degrau` = a base do guarda-corpo está na linha das quinas (a face superior do degrau no ponto da borda), com o eixo recuado `deslocamento` para dentro. `lateral` = o eixo fica no plano da borda externa da escada (deslocamento medido para fora a partir da borda: `-deslocamento`) e a base desce `profundidadeAbaixo` do poste ao longo da face lateral. O valor padrão do `deslocamento` do tipo é metade da largura do poste mais 1 cm.
7. **Altura:** `altura` do tipo (ou da instância) **medida na vertical a partir da linha das quinas** em lances e a partir do piso nos patamares (alinhado a NBR 9077 4.8.1.2 e à linha das quinas do IBC). Nos patamares soma `ajusteAlturaPatamar` do tipo. A transição de altura entre lance e patamar é a **junção** do nó (§5.3).

**Rampa.** Usa `flights` (início e fim com cotas `z0`, `z1`, bordas `startEdge`/`endEdge`) e `landings` (anel com `z` constante). O lado esquerdo/direito do lance vem das bordas; a cota é linear entre `z0` e `z1`. Patamares seguem a mesma regra do item 3. A altura vem do piso do lance (não há quinas), igual ao patamar.

**Manual.** `caminho` + `cotaBase` + `dz` por vértice; o eixo é o caminho deslocado `deslocamento` para o lado `ladoDeslocamento`. `fechado` liga o último ao primeiro com nó de canto.

**Deslocamento lateral:** o eixo é a cadeia da borda deslocada de `deslocamento` na normal à esquerda da cadeia orientada (para a direita, a normal à direita), com **esquadria nos vértices** e limite de esquadria 2,5× (acima disso, chanfro). Deslocamento que faria a cadeia se auto-cruzar (largura de lance menor que `2·deslocamento`) é recusado com o aviso `gc-deslocamento-excede-largura`.

**Escada que muda:** o `ResolvedStair` e o `ResolvedRamp` já são recalculados a cada edição; o adaptador TS reenvia só as linhas das seções do hospedeiro alterado (upsert por `id_num`, ABI v2). Os guarda-corpos dependentes são recalculados na próxima consulta; a cache de malha é por `(guarda-corpo, hash do hospedeiro, hash do tipo, hash da norma)`. Nenhum campo do `GuardaCorpo` precisa ser reescrito pela edição da escada (esse é o ponto de "se refaz").

### 5.2 Trechos, segmentos e nós (modelo do ArchiCAD com motor do Revit)

A cadeia de nós se divide em **segmentos** (trechos retos em planta, ou um arco discretizado). **Nó de canto** = vértice com giro em planta maior que `postes.anguloCanto` (padrão 5°). Mudança de inclinação sem giro em planta (lance → patamar) é **nó de transição**, que recebe poste só se `canto.ativo` (configurável: `postes.canto` vale para ambos? **não**: o poste de transição usa `postes.intermediario` quando o tipo tiver `modo ≠ nenhum`, e senão `canto`). Início e fim de cada trecho independente recebem `inicio` e `fim`.

### 5.3 Junções (cotovelo, ponta, gooseneck)

Aplicadas pelo tipo (`juncaoAngular`, `juncaoTangente`, `conexaoTrilho`) a trilhos, travessa superior e corrimão em cada nó entre dois trechos com direções `u1`, `u2` (vetores 3D unitários):
- **Angular em planta** (giro > 3°): `esquadria` (padrão): corte pelo plano bissetor, com limite de esquadria; `filete`: arco de raio `raioFilete` tangente aos dois trechos (só no corrimão, `juncao: 'filete'`); `conexaoTrilho: 'soldar'` gera cunha/curva para perfil circular, `cortar` faz o corte plano. Com `juncaoAngular: 'segmento-vertical'` um desnível entre os dois lados vira um segmento vertical.
- **Tangente** (giro ≤ 3° e inclinações diferentes: lance → patamar reto): `nenhum` (os trilhos acabam em cada trecho), `segmento-vertical` (liga com trecho vertical no poste) ou `estender-trilhos` (cada trilho se prolonga até encontrar o seguinte, junção suave).
- **Corrimão em transição lance → patamar:** `transicao: 'simples'` = arco vertical de raio `r = max(0,15 m, 2·diâmetro)` tangente às duas retas; `'pescoco-de-ganso'` = dois arcos em S que sobem do nível do lance ao do patamar numa distância horizontal `dg = max(0,30 m, 3·diâmetro)` antes do nó, para o corrimão do patamar ficar na altura de patamar (≠ altura de lance quando `ajusteAlturaPatamar ≠ 0`); `'nenhuma'` = corta no nó.
- **Quina do degrau** (extensão `maisPiso`): a extensão inferior do corrimão de escada começa **uma profundidade de degrau antes** da primeira quina (`Plus Tread Depth`), seguindo a inclinação da escada; a superior é horizontal ao nível do patamar de chegada.

### 5.4 Altura que segue o hospedeiro

- Em lance inclinado, a cota de cada ponto do eixo = cota da linha das quinas + `altura`. Postes e balaústres são **verticais**; trilhos e corrimão são **paralelos à inclinação**; painéis são paralelogramos (base e topo inclinados, laterais verticais).
- Mudança de altura entre lance e patamar (`ajusteAlturaPatamar`) é absorvida no nó de transição conforme §5.3.
- Hospedeiro manual com `dz` segue as mesmas regras (sem distinção de lance/patamar; o `ajusteAlturaPatamar` não se aplica).

### 5.5 Distribuição de postes

No segmento de comprimento horizontal `L` entre nós: postes de nó conforme §5.2; `intermediario`: `espacamento-maximo`: `n = ceil(L / espacamento) - 1` postes igualmente espaçados (nunca passa do máximo); `espacamento-fixo`: a partir do início, sobra no fim (aviso se `< 0,3·espacamento`); `numero-fixo`: `numero` postes iguais. O espaçamento é medido no plano horizontal (os postes são verticais). Poste que cairia a menos de `meia largura dos dois` de um poste de nó é descartado.

### 5.6 Distribuição de balaústres e o padrão que não cabe

Escopo `vao` (padrão quando há postes intermediários): cada vão entre postes recebe o padrão separadamente; escopo `segmento`: o padrão cobre o segmento inteiro, ignorando os postes intermediários (elementos que colidem com o poste são removidos). O comprimento útil `Lu = L_vão − folga_poste_esquerdo − folga_poste_direito`, com folga = meia largura do poste + meia largura do primeiro/último elemento. A medida é **horizontal** (a esfera de norma enxerga a folga horizontal entre balaústres verticais). *(Divergência do Revit, que mede ao longo do comprimento do croqui: [A CONFIRMAR]; ver §13.)*

Seja `D = Σ distanciaAnterior` (extensão do padrão) e `P = periodo`, `k = floor((Lu - D) / P) + 1` repetições inteiras possíveis:
- `justificacao: 'inicio'|'fim'|'centro'`: `k` repetições a partir da ponta (ou centralizadas); a sobra `S = Lu - ((k-1)·P + D)`. Com `sobra: 'balaustre-extra'` e `S ≥ P/2`, põe o primeiro elemento do padrão no fim da fila; com `'folga-nas-pontas'` reparte `S/2` em cada ponta; com `'nenhuma'` a sobra fica no lado oposto à justificação.
- `justificacao: 'distribuir'` (**padrão recomendado e o dos presets de norma**): refaz o período `P' = (Lu - D) / ceil((Lu - D) / P)` (≤ P, nunca maior que o pedido); assim o vão nunca passa do `periodo`, e o padrão preenche o vão de ponta a ponta. Se `P' < 0,5·P`, o aviso `gc-padrao-comprimido`.
- **Padrão que não cabe:** `Lu < D` (o padrão inteiro não cabe): gera só os elementos do início do padrão que cabem (sem cortar nenhum) e emite o aviso `gc-padrao-nao-cabe`; `Lu ≤ 0`: nenhum balaústre e aviso `gc-vao-sem-espaco`. Elemento vazio (`modelo: null`) conta espaço mas não gera malha. Nenhum elemento é truncado pelo poste.
- **Quebra:** `cada-segmento`: o padrão reinicia em cada segmento; `angulo`: reinicia nos nós com giro maior que `anguloQuebra`; `nunca`: o padrão corre pelo comprimento da cadeia contínua (ao contornar um canto, elementos dentro de `meia largura` do poste de canto são removidos).
- **`porDegrau`** (só em lance de escada): em cada degrau o Rust coloca `quantidade` balaústres igualmente espaçados na profundidade do degrau a partir de `distanciaDaQuina` da quina; cada um tem a base na cota do degrau naquele ponto (base **no degrau**, não na linha das quinas), e o topo na cota do trilho de referência. Substitui o `periodo` nos lances; nos patamares vale o padrão normal. Em caracol, o degrau é uma cunha: os balaústres ficam igualmente espaçados no arco da borda.
- **Balaústres inclinados:** não há. Todos verticais. A folga entre dois balaústres vizinhos numa escada é medida na horizontal.

### 5.7 Painéis

Painel entre dois postes consecutivos (ou, sem postes intermediários, no segmento): `larguraMaxima > 0` divide em `n = ceil(Lu / larguraMaxima)` painéis iguais com `folgaLateral` entre eles. Geometria: placa de espessura `espessura` ao longo do eixo (quadriláteros no vão reto; **facetas planas** de flecha ≤ `tolCorda` em trecho curvo). Perfurada: furos circulares dispostos em malha (`passoX`, `passoY`, `alternado` = quincôncio); a malha 3D recebe os furos como **vazados** só quando o furo tem ≥ 8 segmentos e `passo ≤ 0,2 m` e o total de furos ≤ 2000 por painel; acima disso o 3D usa um sólido sem furo marcado `simplificado`, a planta e a quantidade mantêm a área líquida real. Tela: malha de fios `diametroFio`; no 3D é um painel translúcido (não vira malha de fios por padrão). Cabos: cilindros de seção circular `cabos.diametro` nos vãos `espacamento`, entre postes, com `orientacao`.

### 5.8 Perfis e varredura

Cada trilho, corrimão e suporte é a **varredura** de um `PerfilGC` ao longo da cadeia. Quadro de varredura: *rotation-minimizing frames* (transporte paralelo da normal), inicializado com a normal horizontal perpendicular ao trecho, para evitar torção em hélice e em tangente vertical. Perfil circular usa 16 lados (24 acima de 80 mm de diâmetro); `poligono` é usado como está. Terminação: topo plano, sem tampa embutida em poste. Soldagem de vértices em grade de 1 µm. Esquadria: o plano bissetor; `soldar`: curva com 8 segmentos no ângulo. Não há operações booleanas (a interseção de trilho com poste é só sobreposição de sólidos fechados); a malha final por guarda-corpo é uma lista de **grupos** (um por peça lógica), cada um fechado e orientado para fora.

---

## 6. Contrato TS ↔ Rust

Novas seções e consultas em `crates/geom-wasm/schema/cena-v11.json`. `versao` 12 → 13, `abi` continua 2. Os ids de seção e de consulta **começam em 60** (reservado para o guarda-corpo, para não colidir com as fatias C a E em andamento, que usam a faixa de 26 em diante); a colisão com as branches 0051 a 0053 deve ser conferida pela Fase 2 antes de congelar. Mesmo esquema: coluna `id_num` (`u32`) como chave de upsert.

### 6.1 Seções de entrada (TS → Rust)

Hospedeiro, enviado pelo adaptador a partir de `ResolvedStair`/`ResolvedRamp` (**sem** que o Rust conheça o Project):

| id | `nome` | chave | colunas (tipo) |
|---|---|---|---|
| 60 | `escadas_gc` | `id_num` | `id_num u32, nivel_num u32, z_base f64, z_topo f64, altura_espelho f64, profundidade_piso f64` |
| 61 | `escada_componentes_gc` | `id_num` | `id_num u32, escada_num u32, indice u32, tipo u8 (0 lance, 1 patamar), caracol u8, centro_x f64, centro_y f64, r_int f64, r_ext f64` |
| 62 | `escada_curvas_gc` | `id_num` | `id_num u32, componente_num u32, lado u8 (0 esq, 1 dir), ordem u32, ax f64, ay f64, bx f64, by f64, sag f64` |
| 63 | `escada_espelhos_gc` | `id_num` | `id_num u32, componente_num u32, indice u32, ax f64, ay f64, bx f64, by f64, z0 f64, z1 f64` |
| 64 | `escada_patamares_gc` | `id_num` | `id_num u32, componente_num u32, indice u32, x f64, y f64, z f64` (um vértice por linha, anel em ordem) |
| 65 | `rampas_gc` | `id_num` | `id_num u32, nivel_num u32, z_base f64, z_topo f64` |
| 66 | `rampa_lances_gc` | `id_num` | `id_num u32, rampa_num u32, indice u32, sx f64, sy f64, ex f64, ey f64, ax f64, ay f64, bx f64, by f64, cx f64, cy f64, dx f64, dy f64, z0 f64, z1 f64` (bordas de início A-B e fim C-D) |
| 67 | `rampa_patamares_gc` | `id_num` | `id_num u32, rampa_num u32, componente u32, indice u32, x f64, y f64, z f64` (a coluna `componente` foi acrescentada na Fase 2: sem ela vários patamares da mesma rampa não se distinguem) |

Guarda-corpo, tipo e norma:

| id | `nome` | colunas principais |
|---|---|---|
| 70 | `guardas_corpo` | `id_num u32, nivel_num u32, tipo_num u32, hosp u8 (0 manual, 1 escada, 2 rampa), hosp_num u32 (ID_AUSENTE no manual), lados u8 (bit0 esq-lance, bit1 esq-patamar, bit2 dir-lance, bit3 dir-patamar), pos_base u8, desloc f64, altura f64 (NaN = do tipo), inverter u8, fechado u8, lado_desloc u8 (0 esq, 1 dir, 2 centro), cota_base f64, flags u8 (bit0 postes intermediários, bit1 preenchimento, bit2 corrimão)` |
| 71 | `guarda_caminhos_manuais` | `id_num u32, guarda_num u32, indice u32, x f64, y f64, dz f64` |
| 72 | `tipos_guarda` | `id_num u32, altura f64, desloc f64, ajuste_patamar f64, folga_inferior f64, junc_angular u8, junc_tangente u8, conexao u8, tol_corda f64, norma_num u32` |
| 73 | `perfis_guarda` | `id_num u32, forma u8, largura f64, altura f64, n_pontos u32, lados u32` |
| 74 | `perfis_guarda_pontos` | `id_num u32, perfil_num u32, indice u32, x f64, y f64` |
| 75 | `trilhos_guarda` | `id_num u32, tipo_num u32, indice u32, altura f64, desloc f64, perfil_num u32, material_num u32` |
| 76 | `corrimaos_guarda` | `id_num, tipo_num, indice, funcao u8, posicao u8, altura f64, afastamento f64, perfil_num, material_num, ext_ini_estilo u8, ext_ini_comp f64, ext_ini_mais_piso u8, ext_fim_estilo u8, ext_fim_comp f64, ext_fim_mais_piso u8, sup_layout u8, sup_espac f64, sup_numero u32, sup_justif u8, sup_perfil_num u32, sup_comp f64, transicao u8, juncao u8, raio_filete f64` |
| 77 | `postes_guarda` | `id_num, tipo_num, papel u8 (0 início, 1 fim, 2 canto, 3 intermediário), ativo u8, perfil_num, material_num, acima f64, abaixo f64, ang_canto f64, modo u8, espacamento f64, numero u32` |
| 78 | `padroes_guarda` | `id_num, tipo_num, indice, base_tipo u8, base_idx u32, topo_tipo u8, topo_idx u32, periodo f64, justif u8, sobra u8, quebra u8, ang_quebra f64, escopo u8, pd_ativo u8, pd_qtd u32, pd_dist f64, pd_perfil_num u32, pd_material_num u32` |
| 79 | `padrao_elementos_guarda` | `id_num, padrao_num, indice, perfil_num (ID_AUSENTE = vazio), material_num, dist_anterior f64, desloc_lateral f64, desloc_base f64, desloc_topo f64` |
| 80 | `paineis_guarda` | `id_num, tipo_num, indice, familia u8, base_tipo u8, base_idx u32, topo_tipo u8, topo_idx u32, desl_base f64, desl_topo f64, espessura f64, folga_lateral f64, largura_max f64, material_num, perf_diam f64, perf_passo_x f64, perf_passo_y f64, perf_alternado u8, tela_larg f64, tela_alt f64, tela_fio f64, cabo_diam f64, cabo_espac f64, cabo_orient u8` |
| 81 | `normas_guarda` | `id_num u32, n_flags u32 (máscara de limites definidos), + um f64 por limite de LimitesNormaGC (NaN = não verificar)` |

Todos são enviados com `definir_secao` na carga e com `upsert`/`remover` nas edições (ABI v2 já existe). O `material_num` reusa o mapa de materiais da cena (`kernelB.ts`). O adaptador novo é `packages/engine/src/kernelGuardaCorpo.ts`.

### 6.2 Consultas (Rust → TS)

Todas por nível (`nivel_num`, `NIVEL_TODOS` aceito), ids 60 em diante; saída em vetores planos como as consultas existentes:

| id | `nome` | args | saídas |
|---|---|---|---|
| 60 | `guarda_caminhos` | `nivel_num, tol_juncao` | `trechos u32 [guarda_num, trecho, origem(0 lance,1 patamar,2 manual,3 caracol), n_nos, flags]`, `nos f64 [x, y, z]` (cadeia deslocada), `avisos` (§8) |
| 61 | `guarda_malha` | `nivel_num, lod (0 grosso, 1 médio, 2 fino)` | `grupos u32 [guarda_num, papel, material_num, primeiro_indice, n_indices]` (papel: 0 poste, 1 balaústre, 2 trilho, 3 corrimão, 4 suporte, 5 painel, 6 cabo, 7 travessa superior), `vertices f64 [x, y, z]`, `indices u32` |
| 62 | `guarda_planta` | `nivel_num, corte_z, detalhe` | `linhas u32 [guarda_num, papel, estilo (0 cortado, 1 projetado, 2 oculto), n_pontos]`, `pontos f64 [x, y]` (polilinhas fechadas para peças cortadas pelo plano `corte_z`, abertas para o eixo) |
| 63 | `guarda_corte` | `nivel_num, ox, oy, dx, dy, profundidade` | `linhas` e `pontos` como acima, em coordenadas `(s, z)` do plano de corte (s ao longo de `dx,dy`), mais `poligonos` cortados (perfis de trilho e poste cortados) |
| 64 | `quant_guarda` | `nivel_num` | `linhas u32 [guarda_num, papel, perfil_num, material_num, n_pecas]`, `valores f64 [comprimento, area, volume, area_projetada]` por linha |
| 65 | `guarda_avisos` | `nivel_num, norma_num` | `avisos u32 [guarda_num, codigo, trecho, indice]`, `valores f64 [medido, limite, x, y, z]` |

Regras do contrato:
- **Determinismo:** mesmas seções → mesmos bytes. Ordem das saídas por `guarda_num`, `trecho`, `papel`, `indice`.
- **Sem estado do projeto no Rust além das seções;** o Rust não lê `Project`.
- **Erros:** `ENTRADA` para seção inconsistente (perfil inexistente, índice de trilho fora), `LIMITE` para >20 000 balaústres ou >512 vértices; o aviso `gc-hospedeiro-descontinuo` não é erro.
- **Teste de contrato** `contrato_confere_com_json` e o equivalente TS (`kernel*.contrato.test.ts`) passam a cobrir as 16+ novas seções e 6 consultas; `VERSAO_ESQUEMA` 13.
- **Referência TS:** `packages/engine/src/guardaCorpoRef/` (caminho, varredura, distribuição, avisos) com a mesma saída plana, **usada só pelos testes de paridade** (`*.paridade.test.ts`), como o resto do kernel. Tolerância de paridade: posições 1e-6 m, contagens exatas. O app não chama a referência.
- **Kernel Rust desligado:** o guarda-corpo vive só no Rust (decisão do dono). Com o kernel desligado, o elemento permanece no modelo e na lista; o 3D e a planta mostram o eixo (uma polilinha simples do hospedeiro, sem varredura) e um aviso "ligue o kernel Rust para ver o guarda-corpo completo". Ponto aberto para o dono (§12, 1).

---

## 7. Quantidades e IFC

### 7.1 Quantidades (TS, `packages/engine/src/guardaCorpoQuantities.ts`)

O TS só **agrega** o que `quant_guarda` devolve (sem recalcular geometria). Por guarda-corpo:
- `comprimentoEixo` (m, planta) e `comprimentoDesenvolvido` (m, no espaço, contando a inclinação);
- por papel e perfil: **comprimento** de cada trilho, corrimão, suporte; **contagem** de postes por papel (início, fim, canto, intermediário), de balaústres por modelo, de painéis; **área** dos painéis (bruta e líquida de furos), **volume** das peças (m³), massa estimada = volume × densidade do material quando o material tem densidade;
- `custo` = `tipo.cost × comprimentoDesenvolvido` (informativo, igual a escada e rampa).
Linhas com `{ tipo, hospedeiro, nivel, ... }` para o quadro de quantidades, com o mesmo molde de `stairQuantities.ts` (`GuardaCorpoQuantities`, `guardaCorpoQuantities(...)`); entra no quadro de elementos por tipo e na lista de materiais pelas camadas de `materialId` das peças.

### 7.2 IFC (`packages/io/src/ifc/ifcGuardaCorpo.ts`, esquema IFC4 como o restante)

- **Um `IFCRAILING` por `GuardaCorpo`**, contido no pavimento do `levelId` (`IFCRELCONTAINEDINSPATIALSTRUCTURE`), com `PredefinedType` (`IfcRailingTypeEnum`: `HANDRAIL`, `GUARDRAIL`, `BALUSTRADE`, `USERDEFINED`, `NOTDEFINED`) conforme `tipo.ifcPredefinido` ou, se `null`, pela composição: tem preenchimento (balaústre/painel) → `GUARDRAIL`; só balaústres sem painel e sem corrimão → `BALUSTRADE`; só corrimão → `HANDRAIL`; outro → `USERDEFINED` com `ObjectType = 'GUARDA-CORPO'`.
- **Partes agregadas** (`IFCRELAGGREGATES`): corrimões e travessas → `IFCRAILING` filho com `HANDRAIL`; postes → `IFCMEMBER` com `PredefinedType = POST`; balaústres → `IFCMEMBER` `USERDEFINED` com `ObjectType = 'BALUSTER'` (um por modelo, malha instanciada); painéis de vidro e chapa → `IFCPLATE` (`SHEET`; vidro `CURTAIN_PANEL`); cabos → `IFCMEMBER` `USERDEFINED`/`CABLE`. **[A CONFIRMAR]** a escolha de enumerações para balaústre e cabo com visualizadores (BIMcollab, Solibri, Revit) na Fase 7.
- Geometria: malha triangulada por parte (`IfcTriangulatedFaceSet`), a mesma saída de `guarda_malha`; tipo `IFCRAILINGTYPE` por `TipoGuardaCorpo` (`gct_*`), ligado por `IFCRELDEFINESBYTYPE`.
- Propriedade `Pset_RailingCommon` (`Reference`, `Height`, `Diameter`, `IsExternal`, `FireRating`) com `Height = altura` e `Diameter` do corrimão; `Qto_RailingBaseQuantities` (`Length`) pelo `comprimentoDesenvolvido`; `Pset_Hestia_GuardaCorpo` com `hospedeiro`, `lados`, `norma`.
- Importação: `IFCRAILING` do IFC lido continua entrando como `Generic` (hoje `ifcImport` trata como proxy); a conversão para `GuardaCorpo` está **fora do escopo** deste recurso.

---

## 8. Regras de aviso de norma

Avisos **nunca bloqueiam** (como as escadas). Cada aviso tem `code`, `severity` ('warning' sempre; 'error' só para hospedeiro ausente e geometria inválida), `guardaId`, `trecho?` e `ids?` (para "Ir para"); formato `GuardaCorpoIssueItem` no molde de `StairIssueItem`, mensagens com i18n `md_gc_*` e o sufixo "(norma a conferir)" quando o campo do perfil tem `fontes[campo].verificado === false` ou o perfil tem `verificado: false`.

O Rust devolve **medidas** (`guarda_avisos`: medido, limite, posição) para o que depende de geometria; o TS decide texto e severidade. As regras de configuração do tipo são avaliadas só no TS (`guardaCorpoIssues.ts`), sem esperar o Rust.

| Código | Quem avalia | Regra (campo do perfil) |
|---|---|---|
| `gc-altura-baixa` | TS (tipo) | `altura < alturaMinima`; em lance de escada interna, `altura < alturaMinimaEscadaInterna`. O Rust devolve a altura medida real (considera `ajusteAlturaPatamar` e a linha das quinas). |
| `gc-altura-alta-exige` | Rust (medida) | Guarda a mais de `alturaMinimaAlta.acimaDe` do solo adjacente com altura abaixo de `alturaMinimaAlta.altura` (cota do solo = menor cota de nível do projeto abaixo; **[A CONFIRMAR]** o que conta como "solo adjacente": usa o nível mais baixo do projeto). |
| `gc-vao-grande` | Rust | Maior esfera que passa por uma abertura do preenchimento (§8.1) `> esferaMaxima`. Devolve a posição do vão. |
| `gc-vao-triangulo` | Rust | Folga entre degrau, espelho e trilho inferior (maior esfera que passa) `> esferaMaximaTriangulo`. |
| `gc-vao-inferior` | Rust | Folga entre a base do preenchimento e o hospedeiro `> folgaInferiorMaxima`. |
| `gc-sem-guarda` | TS | Hospedeiro com desnível `> desnivelExigeGuarda` e lado sem guarda-corpo nem parede (escada com lado ligado = 0; borda de laje não coberta: só avisa quando a laje tem `edge` aberta, **fora de escopo na v1**; v1 avisa só escada e rampa). |
| `gc-corrimao-ausente` | TS | Escada/rampa sem corrimão num lado quando `corrimaoDoisLados`. |
| `gc-corrimao-altura` | Rust (medida) + TS | Topo do corrimão fora de `[corrimaoAlturaMin, corrimaoAlturaMax]`, medido da linha das quinas; e para `corrimaoAlturasAdicionais` (ex.: 0,70), falta um corrimão nessa altura (± 1 cm). |
| `gc-corrimao-diametro` | TS | Perfil circular com diâmetro fora de `[corrimaoDiametroMin, Max]`; perfil não circular: aviso informativo "seção não circular, confira preensão". |
| `gc-corrimao-afastamento` | TS | `afastamento < corrimaoAfastamentoMin`. |
| `gc-corrimao-extensao` | Rust (medida) | Extensão de início ou fim menor que `corrimaoExtensaoMin`; com `maisPiso` conta o degrau. |
| `gc-corrimao-descontinuo` | Rust | Corrimão interrompido (lado de patamar desligado, junção `nenhuma` com descontinuidade) quando `corrimaoContinuo`. |
| `gc-corrimao-intermediario` | TS | Largura do lance `> corrimaoIntermediarioLargura` sem corrimão intermediário; ou espaçamento `> corrimaoIntermediarioEspacamento`. |
| `gc-carga-nao-declarada` | TS | Tipo sem `cargaDeclarada` ≥ limites de carga do perfil (campos `cargaLinear`, `cargaArea`, `cargaPontual` do tipo); o Hestia **não calcula** estrutura. |
| `gc-padrao-nao-cabe`, `gc-padrao-comprimido`, `gc-vao-sem-espaco` | Rust | §5.6. |
| `gc-hospedeiro-descontinuo`, `gc-deslocamento-excede-largura` | Rust | §5.1. |
| `railing-host-missing`, `railing-type-missing` | TS (`validateGuardaCorpo.ts`) | Erros de modelo. |

### 8.1 Medida do vão (esfera)

O Rust trabalha no desenho plano `(s, h)` do guarda-corpo (s = comprimento horizontal, h = altura sobre o hospedeiro, "desdobramento" em que balaústres e postes verticais viram faixas verticais, trilhos viram faixas horizontais corrigidas pelo cosseno da inclinação). Obstáculos: poste (faixa de `s`), balaústre (faixa de `s`), trilho (faixa de `h`), painel sólido (retângulo cheio), painel perfurado/tela (abertura = furo ou malha), cabo (faixa de `h`). As **células livres** são os retângulos livres maximais entre obstáculos; a esfera máxima que passa por uma célula retangular é `min(largura, altura)`; o aviso usa o maior valor entre células na faixa `[folgaInferior, alturaMinima]`. Cálculo `O(n log n)` por vão. Folga do vão considera a largura do perfil dos vizinhos. Isto é aproximação 2D da esfera (válida para peças verticais/horizontais, que é o caso das guardas de norma); guardas com padrão em losango ou inclinado são avaliadas pelo menor espaço projetado (conservador).

---

## 9. Fases de implementação (1 a 7)

Cada fase termina com testes passando (`npm test` nos pacotes tocados, `cargo test -p geom-wasm`, `cargo clippy`), commit em português e `CHANGELOG`/handoff curto. **Regra dos arquivos compartilhados:** a Fase 1 cria e mescla, **sozinha**, todos os "ganchos" em arquivos que várias fases tocariam (`types.ts` / união `Element`, `index.ts` dos pacotes, `commands.ts`, `registry.ts` de ferramentas, `lib.rs`, `cena.rs`, `esquema.rs`, `cena-v11.json` com as seções e consultas vazias, `i18n`), com módulos vazios que as fases seguintes só preenchem. Assim as fases paralelas só editam arquivos próprios.

### Fase 1 — Modelo, tipos, norma, comandos (TS puro; fase bloqueante)
Arquivos: `packages/model/src/guardaCorpoTypes.ts`, `guardaCorpo.ts` (`makeGuardaCorpo`, `tiposGuardaCorpo(lang)`, constantes), `guardaCorpoNorma.ts` (`PERFIS_NORMA_PADRAO`, `normaDe(projeto, tipo)`), `validateGuardaCorpo.ts`, `commands.ts` (comandos §4.4), `types.ts` (`Element`, `Project.tiposGuardaCorpo`, `perfisNorma?`), `migrate.ts` + `SCHEMA_VERSION` 24, `elementLevel.ts`, `graphics.ts`, `index.ts`, `i18n.ts`. Mais os esqueletos vazios (módulos com `export {}`) para as demais fases: `engine/src/guardaCorpoRef/`, `engine/src/kernelGuardaCorpo.ts`, `render/src/model3d/guardaCorpo3d.ts`, `tools/src/guardaCorpoTool.ts` registrado no `registry.ts`, e o esquema JSON com as seções 60 a 81 e consultas 60 a 65 (colunas definidas em §6, sem implementação Rust).
Testes: criação, migração 23 → 24 (projeto antigo ganha tipos), `tipoGuardaCorpoIssue` (cada regra), comandos com desfazer, validação (hospedeiro ausente, tipo ausente), presets de norma (valores e `fontes`), serialização ida e volta JSON, `deleteTipo` em uso recusado.
Depende de: nada. Bloqueia todas.

### Fase 2 — Contrato Rust e adaptador TS
Arquivos: `crates/geom-wasm/schema/cena-v11.json` (já com os ganchos; aqui são conferidos e ajustados), `crates/geom-wasm/src/esquema.rs`, `secoes_gc.rs` (decodificação e tabelas das seções 60-81), `cena.rs` (despacho de `definir_secao`/`upsert`/`remover`), `lib.rs`, `packages/engine/src/kernelGuardaCorpo.ts` (monta as seções a partir de `Project`, `ResolvedStair`, `ResolvedRamp`; upsert incremental por hospedeiro).
Testes: `contrato_confere_com_json` e o contrato TS; ida e volta de cada seção (TS monta, Rust decodifica, devolve contagens); limites; upsert/remover; hospedeiro editado só reenvia as linhas dele.
Depende de: Fase 1. **Congela o JSON** no primeiro commit (as fases 3 a 5 leem o contrato).

### Fase 3 — Motor Rust da geometria (3a, 3b e 3c em paralelo)
- **3a Caminho hospedado:** `crates/geom-wasm/src/gc_caminho.rs` (cadeias de lance, patamar, caracol, rampa, manual; deslocamento com esquadria; cortes por lado e tipo; emendas) e a consulta `guarda_caminhos`. Referência TS em `engine/src/guardaCorpoRef/caminho.ts`. Testes: escada reta, L, U, patamar de giro (anel de 6 pontos), caracol (hélice, sem torção, cota linear), escada livre com `freePath`, rampa, manual aberto/fechado, lado desligado, descontinuidade, deslocamento excessivo; paridade com a referência TS; propriedades (comprimento desenvolvido ≥ planta; z monótono em lance).
- **3b Varredura e junções:** `gc_varredura.rs` (quadros RMF, perfis, esquadria, filete, solda, goosenecks, extensões `maisPiso`, suportes), `gc_malha.rs` (grupos, soldagem em grade de 1 µm). Testes: malha fechada e orientada (Euler, volume > 0), torção nula em hélice, esquadria em 90° e 135°, gooseneck com altura de patamar diferente, perfil poligonal, determinismo.
- **3c Distribuição:** `gc_distribuicao.rs` (postes §5.5, balaústres §5.6, `porDegrau`, painéis §5.7). Testes: justificações, sobra, `distribuir` nunca passa do período, padrão que não cabe, quebra por ângulo, vãos com poste intermediário, por degrau com 1/2/3 por degrau, caracol, limite de 20 000 elementos.
Depende de: Fases 1 e 2 (tipos Rust das seções). 3a, 3b e 3c mexem em arquivos diferentes e podem rodar juntas; 3b e 3c consomem a cadeia de 3a, então as três começam com uma **estrutura `CadeiaGC` de teste** (cadeias sintéticas fixas) definida em `gc_tipos.rs` pela Fase 2 e usam essa estrutura nos testes até a 3a ficar pronta; integração das três ao final (consulta `guarda_malha`).

### Fase 4 — Linhas de planta e corte, quantidades, avisos (4a Rust, 4b TS em paralelo)
- **4a Rust:** `gc_planta.rs` (`guarda_planta`: eixo, contornos de postes, balaústres e trilhos cortados em `corte_z`, estilo cortado/projetado/oculto por nível de detalhe), `gc_corte.rs` (`guarda_corte`), `gc_quant.rs` (`quant_guarda`), `gc_avisos.rs` (`guarda_avisos`, §8.1). Testes: a planta de uma guarda reta tem o eixo; poste cortado a 1,0 m gera retângulo; corte no meio de um vão não corta balaústre; avisos com guardas sintéticas (vão 120 mm contra limite 110; corrimão a 0,95 m; extensão curta).
- **4b TS:** `engine/src/guardaCorpoQuantities.ts`, `engine/src/guardaCorpoIssues.ts` (regras do tipo e tradução das medidas do Rust para avisos com i18n e "a conferir"), `engine/src/guardaCorpoRef/` (completar referência: avisos, distribuição, quantidades), `io/src/ifc/ifcGuardaCorpo.ts` + registro em `ifcElements.ts`. Testes: agregação de quantidades de um tipo conhecido (contagens e comprimentos exatos), cada código de aviso, IFC (`IFCRAILING` por guarda, `PredefinedType` por composição, partes agregadas, quantidade `Length`).
Depende de: Fase 2 (4a precisa das seções; 4b só do contrato JSON). 4a e 4b rodam juntas; 4a depende de 3a para a cadeia (usar `CadeiaGC` sintética até lá).

### Fase 5 — Renderização (3D, planta, corte) e seleção
Arquivos: `packages/render/src/model3d/guardaCorpo3d.ts` (malha por grupo e material, cache por `(guarda, hash do hospedeiro, tipo, norma)`, LOD), integração nos pontos de `levels3d.ts`, `pick3d.ts`, `indiceDeElementos3d.ts`, `highlight3d.ts`; `packages/render/src/plan/` (camada de guarda-corpo com a categoria gráfica `railing`); `packages/render/src/section/` (linhas do corte). Fallback do kernel desligado (§6.2): eixo simples. Testes: unitários com malha sintética; contagem de peças desenhadas; seleção por clique; visibilidade por categoria; cache invalidado quando a escada muda; captura visual de referência (escada em U com balaústres, vidro, cabos, caracol).
Depende de: Fase 3 (consulta `guarda_malha`) e Fase 4a (linhas). Pode começar com mocks do contrato assim que a Fase 2 congelar o JSON.

### Fase 6 — Ferramentas e interface (6a, 6b, 6c em paralelo)
- **6a Ferramenta:** `packages/tools/src/guardaCorpoTool.ts` (traçar caminho manual com snap em borda de laje, parede e escada; início/fim; teclas); `guardaCorpoGrips.ts` (alças de vértice); botão "Criar guarda-corpo" na escada e na rampa (`stairCommands.ts`/`rampCommands.ts` chamam `addGuardaCorpo` com lados ligados); ribbon (`apps/web/src/ui/ribbon/model.ts`). Testes: sessão de desenho sem `resolve` por movimento, snap, fechar caminho, desfazer.
- **6b Propriedades e opções:** `apps/web/src/ui/GuardaCorpoProperties.tsx` (hospedeiro, lados por tipo de trecho, posição de base, deslocamento, altura, inverter, sobrescritas, lista de avisos com "Ir para"), `GuardaCorpoOptionsBar.tsx`, painel de Problemas.
- **6c Editor de tipo e de norma:** `apps/web/src/ui/dialogs/guardaCorpoType/` (abas: Geral; Trilhos; Corrimão; Postes; Preenchimento com lista de padrões e painéis e prévia de padrão; Junções; Norma) e `dialogs/normaGuardaCorpo/` (editor do `PerfilNorma` com fonte e "a conferir" por campo; duplicar/restaurar preset; escolher perfil do projeto). Prévia usando o mini-projeto, como `previewProject.ts`.
Depende de: Fase 1 (tipos); 6a/6b/6c não se tocam. 6b e 6c usam a Fase 5 só na prévia 3D (podem usar o eixo simples até lá).

### Fase 7 — Integração, desempenho e acabamento
Arquivos: DXF (`io/src/dxf.ts`, camada `GUARDA-CORPO`, linhas de `guarda_planta`), quadro de quantidades e de materiais (UI), documentos de prancha (vistas e cortes mostram o guarda-corpo), IFC exportado conferido em visualizador, gabaritos (`templates.ts` ganha guarda-corpo na casa de dois pavimentos), desempenho (medir `guarda_malha` num prédio de 10 pavimentos com guarda-corpo em todas as escadas e sacadas; meta: reconstrução incremental < 16 ms por guarda-corpo editado, memória de malha < 20 MB), documentação (handoff `docs/handoff/guarda-corpo/ESTADO.md`), validação visual com o dono, fechamento dos pontos de norma que estavam [A CONFIRMAR] se o dono conseguir os textos.
Testes: e2e de ponta a ponta (criar escada, ligar guarda-corpo, mudar escada, ver refazer), regressão visual, benchmark, importar/exportar projeto.
Depende de: Fases 4 a 6.

### Mapa de paralelismo

```
F1 ─┬─ F2 ─┬─ F3a ┐
    │      ├─ F3b ┼─ F5 ─┐
    │      ├─ F3c ┘      │
    │      ├─ F4a ───────┤
    │      └─ F4b        ├─ F7
    ├─ F6a ──────────────┤
    ├─ F6b ──────────────┤
    └─ F6c ──────────────┘
```

Podem rodar ao mesmo tempo sem conflito de arquivo: {F3a, F3b, F3c, F4a, F4b} depois de F2; {F6a, F6b, F6c} logo depois de F1 (em paralelo com F2 a F4). F5 espera F3 e F4a. F7 por último. Arquivos tocados por mais de uma fase (todos criados vazios pela F1 e editados só por quem os "possui"): `cena.rs` e `lib.rs` (só F2), `cena-v11.json` e `esquema.rs` (só F2, congelado), `engine/src/index.ts` (só F1), `tools/src/registry.ts` (F1 cria a entrada, F6a preenche a ferramenta), `i18n.ts` (cada fase acrescenta chaves num bloco próprio `md_gc_<fase>_*` para evitar conflito de merge).

---

## 10. Riscos e testes transversais

- **Desempenho do 3D:** um guarda-corpo de 30 m com balaústres a cada 11 cm tem ~270 balaústres × 16 lados = ~35 mil triângulos; o `lod` grosso usa prismas de 6 lados e agrupa por modelo (instanciação). Medido na Fase 7.
- **Hélice (caracol):** o maior risco numérico é a torção do perfil; o teste de torção nula e a paridade com a referência cobrem.
- **Escada que muda e o guarda-corpo cai em lado inexistente** (ex.: caracol vira reta): os lados do `HospedeiroEscada` continuam válidos (esq/dir sempre existem); caminho vazio vira o aviso `gc-hospedeiro-descontinuo`, não erro.
- **Regras sobre `Element` fechado:** a Fase 1 percorre a lista de pontos de integração da decisão 0049 §2 (clipboard, selectTool, pick, transform, copyLink etc.).
- **Licença:** só conceito e método de Revit e ArchiCAD; nenhuma geometria, família ou texto de norma copiado (as normas ABNT e ICC são citadas por valor e por item, não transcritas).

---

## 11. O que não entra nesta decisão

Escada importada do IFC como hospedeiro; guarda-corpo em borda de laje com detecção automática de bordas abertas; cálculo estrutural de guarda (só declaração de carga); famílias autorais de balaústre via componentes (`ComponentFamily`); guarda-corpo de cobertura de telhado; corrimão contínuo entre escadas separadas.

---

## 12. Pontos em aberto para o dono

1. **Kernel Rust desligado:** o guarda-corpo vive só no Rust. Quando o dono desliga o kernel (opção que a memória do projeto manda manter visível), o 3D mostra só o eixo e um aviso. Aceitável, ou prefere um motor TS completo de fallback (desfaz a decisão 5)?
2. **Valores de norma a confirmar** (preciso dos textos ou de alguém para conferir): NBR 14718 (altura 1,10 m, vão 110 mm, cargas), NBR 9050 (corrimão 0,92/0,70, diâmetro 30-45 mm, prolongamento 0,30 m, afastamento), IBC 1014 (corrimão, extensões, pegada) e Parte K inteira. Os presets saem marcados "(a conferir)" até lá.
3. **Perfil Brasil "mais restritivo" ou "um por norma":** o preset composto pega o maior valor entre NBR 9077, 14718 e 9050 (guarda 1,10 m e esfera 110 mm). Prefere três perfis separados (um por norma) que o usuário alterna?
4. **Balaústre e poste como componente:** hoje são perfil extrudido + material. Quer permitir uma `ComponentFamily` (decisão 0049, ainda fora da main) como modelo de balaústre/poste no futuro? Exigiria o contrato do Rust receber malha instanciada.
5. **Guarda-corpo automático na abertura da laje do nível de topo da escada:** a decisão pede manual para borda de laje; a borda do furo da escada no pavimento superior é o caso mais comum e poderia ser sugerida. Fica fora da v1.
6. **Corrimão de parede** (sem guarda-corpo, só fixado na parede ao lado da escada): modelado como `TipoGuardaCorpo` sem preenchimento e hospedeiro escada/rampa; o afastamento da parede vem do `afastamento`. Confirmar que atende (não há hospedeiro "parede").
7. **Numeração** (0055) e `SCHEMA_VERSION` 24: conferir contra as branches no dia da mesclagem.

## 13. Divergências Revit × ArchiCAD que exigiram escolha

| Tema | Revit | ArchiCAD | Escolha no Hestia |
|---|---|---|---|
| Postes | Só início, fim e canto entram no editor de balaústres; postes intermediários vêm do padrão | Postes nos **nós**; *Inner Posts* entre nós como componente do padrão | Modelo de nós e postes intermediários do ArchiCAD, com espaçamento próprio (§5.5), que dá vãos para painéis |
| Segmentação | Rail contínuo ao longo do croqui; quebra do padrão por ângulo ou nunca | Segmentos e nós; o padrão recomeça no nó, salvo *Pattern Continuity* | Segmentos e nós do ArchiCAD; `quebra` de 3 valores do Revit |
| Preenchimento | Padrão principal (e quebra) mais famílias de balaústre; painel só como família de balaústre | Balaústres ("padrão dentro do padrão") e **Painéis** nativos entre postes ou trilhos; onde há balaústre não há painel | Lista de `preenchimentos` ordenada, balaústre e painel como tipos irmãos, painel nativo (ArchiCAD) |
| Corrimão | Top Rail e Handrail 1/2 em tipos de rail contínuo com extensões, suportes e transições | Toprail, até dois Handrails (cada um dobrável nos dois lados), Rails; conexões e extremidades em página própria | Dados do Revit (extensão, suporte, transição, `maisPiso`) em até 4 corrimãos (`posicao` esquerda/direita/ambas) |
| Escada hospedeira | Hospedagem explícita (degrau/viga lateral, balaústre por degrau, refaz com a escada) | Guarda-corpo associado à escada **não confirmado** em fonte oficial | Hospedagem do Revit (decisão do dono) |
| Medida do espaçamento do padrão | Ao longo do comprimento do croqui [A CONFIRMAR] | Por divisões iguais ou comprimento máximo do segmento | **Horizontal** (porque a esfera de norma enxerga a folga horizontal), com `distribuir` (igual ao ArchiCAD) como justificação recomendada |
| Altura de patamar | *Landing Height Adjustment* | altura de segmento por segmento | Ajuste do Revit no tipo (`ajusteAlturaPatamar`), coerente com a NBR 9077 (0,92 m na escada, 1,05 m no patamar) |

---

## 14. Registro da Fase 1 (o que ficou pronto e as escolhas feitas)

Estado: **Fase 1 implementada** (modelo, tipos padrão, perfis de norma, comandos, migração 23 → 24, contrato do kernel declarado em `cena-v11.json` v13). As fases 2 a 7 seguem pendentes.

**Ganchos entregues para as fases seguintes** (arquivos compartilhados já mesclados na Fase 1):
- `packages/model`: `guardaCorpoTypes.ts` (tipos da §4, `LIMITES_GUARDA_CORPO`), `guardaCorpo.ts` (`makeGuardaCorpo`, `tiposGuardaCorpo(lang)`, `tipoGuardaCorpoIssue`), `guardaCorpoNorma.ts` (`PerfilNorma`, `PERFIS_NORMA_PADRAO`, `perfisNormaPadrao(lang)`, `normaDe`, `perfilNormaIssue`), `validateGuardaCorpo.ts` (`guardaCorpoIssues`), `guardaCorpoCommands.ts` (`applyGuardaCorpoCommand`, chamado por `applyCommand`). `types.ts` (união `Element`, `Project.tiposGuardaCorpo`, `Project.perfisNorma?`, `ProjectSettings.normaGuardaCorpoId?`, `isGuardaCorpo`, esquema 24), `migrate.ts`, `defaults.ts`, `elementLevel.ts`, `graphics.ts` (categoria `railing`), `validate.ts`, `history.ts`, `copyLink.ts`, `index.ts`, `i18n.ts` (chaves `md_gc_*`, `md_cmd_gc_*`, `md_cat_railing` nos sete idiomas).
- `crates/geom-wasm`: `schema/cena-v11.json` (v13: seções 60 a 81, consultas 60 a 65), `src/esquema.rs` (constantes `SECAO_*` e `CONSULTA_*`, entradas de `SECOES` e `CONSULTAS`, `VERSAO_ESQUEMA` 13). `packages/geom/src/kernel/v2/esquema.gerado.ts` regenerado.
- Esqueletos vazios: `packages/engine/src/kernelGuardaCorpo.ts`, `packages/engine/src/guardaCorpoRef/index.ts` (exportado por `engine/src/index.ts`), `packages/render/src/model3d/guardaCorpo3d.ts`, `packages/tools/src/guardaCorpoTool.ts` (ver escolha 8).
- `apps/web`: `graphicsLabels.ts`, `editor/typeActions.ts` e `i18n/areas/canvas-nav.ts` (`cvn_cat_railing`). `packages/io`: categoria `railing` em `dxf.ts` (cor 9), `dxfSection.ts` (camada `CORTE_GUARDA_CORPO`) e `ifc/ifcHestia.ts`.

**Escolhas tomadas onde a ADR era ambígua ou silenciosa:**
1. **Perfis de norma (§4.3).** `Project.perfisNorma` ausente = a leitura dos presets. A primeira escrita (`upsertPerfilNorma` ou `deletePerfilNorma`) grava o conjunto completo; sem isso, apagar um preset faria ele voltar. A migração 23 → 24 não grava perfis. A norma do projeto ausente vale `nbr-br`.
2. **Regra "sem ciclo" (§4.2).** Não se aplica: `TrilhoGC` não tem referências próprias, então não há como formar ciclo. A regra não foi implementada.
3. **Alturas adicionais do corrimão na seção 81.** A lista do TS (`corrimaoAlturasAdicionais`) entra como até 4 colunas (`corrimao_altura_adicional_1..4`, NaN = ausente). Booleanos da seção 81 são `u8`, não `f64`. Se algum perfil precisar de mais de 4 alturas, a seção sobe de versão.
4. **Colunas das consultas que a ADR não detalhava.** `guarda_caminhos`: `avisos u32 4n` e `valores f64 5n`. `guarda_corte`: `poligonos f64 livre`.
5. **Tipos padrão.** Sete famílias com os ids da ADR (`gct_balaustres`, `gct_vidro`, `gct_madeira`, `gct_cabos`, `gct_tela`, `gct_chapa_perfurada`, `gct_corrimao_parede`). Altura 1,10 m (corrimão de parede 0,92 m), deslocamento 0,035 m, postes circulares de 0,05 m, corrimão superior sobre o eixo. O corrimão de parede tem dois corrimãos (0,92 e 0,70 m, NBR 9050 a conferir) e nenhum preenchimento.
6. **Exclusão de escada ou rampa.** Nenhum comando novo: o guarda-corpo fica com o hospedeiro ausente e a validação aponta `railing-host-missing`. A ação "excluir órfãos" fica com a Fase 6b.
7. **Cota ao trocar de nível (`applyElementLevel`).** Só o guarda-corpo manual tem cota própria (`cotaBase`); o hospedado segue o hospedeiro. Vínculo de andar-tipo (`copyLink`): a v1 não sincroniza guarda-corpo (`syncOne` devolve `null`).
8. **Ferramenta fora do registro nesta fase.** `ToolId` `'railing'` não foi registrado: o teste de faixa exige que toda ferramenta registrada esteja na fita, e a fita é da Fase 6a. Isto é um desvio da lista de ganchos da Fase 1; `guardaCorpoTool.ts` é só o esqueleto, a registrar na 6a.
9. **Comportamento do kernel sem implementação.** Seções 60 a 81 ainda sem implementação devolvem `ENTRADA` em definir e upsert; consultas 60 a 65 devolvem `NAO_IMPLEMENTADO`. Como o kernel é sempre ligado (decisão do dono), essas chamadas só ocorrem depois da Fase 2 e da Fase 4.
10. **Textos de validação.** `guardaCorpoIssues` usa o dicionário no idioma pedido (`lang`, padrão PT), diferente do `validateRamps`, que é fixo em PT. Os avisos de norma com "(a conferir)" ficam para a Fase 4.
11. **Testes de versão.** Asserções de versão de esquema passaram de 23 para 24 (12 linhas de asserção em 7 arquivos de teste) e de versão do kernel de 12 para 13 (`gerenciador`, `quadros`, `real.wasm`); a lista de seções em `quadros.test.ts` ganhou os 20 nomes novos.
12. **Fase 6a (ferramenta e criação):** `ToolId` `'railing'` entra no registro, na faixa (Construir e Circulação) e no `TOOL_LABEL`. A ferramenta traça o caminho manual só por cliques: Enter conclui (dois pontos ou mais), C fecha o laço (três ou mais), Esc cancela; a criação é um só comando `addGuardaCorpo`, com um passo de desfazer. Sem entrada numérica nesta fase.
13. **Criar guarda-corpo de escada ou rampa:** o botão ficou na faixa (ação `railingForHost`, ao lado da ferramenta na aba Arquitetura, painel Circulação), e não no painel de propriedades da escada, que não estava nos arquivos desta fase. A criação pelo hospedeiro liga os dois lados nos lances e patamares, com a base no degrau. Escolha simples: **um guarda-corpo por escada ou rampa**; o segundo é recusado com a mensagem `tl_msg_railing_host_exists`.
14. **Textos da interface:** os textos de tela das fases 6b e 6c estão em `apps/web/src/editor/i18n/areas/guarda-corpo.ts`, com as chaves `gc6a_*`, `gc6b_*` e `gc6c_*` nos sete idiomas. O plano falava em `md_gc_6x_*` no pacote model, mas o dicionário do model não é exportado e a interface não o lê. Os textos da ferramenta estão em `packages/tools/src/i18n.ts` (`tl_hint_railing`, `tl_msg_railing_*`), como as demais ferramentas.
15. **Fiação em arquivos compartilhados** (além dos da lista da fase): `Properties.tsx` (ramo do guarda-corpo selecionado), `OptionsBar.tsx` (barra da ferramenta), `App.tsx` e `editor/state.ts` (diálogos `guardaCorpoType` e `normaGuardaCorpo`), `ribbon/model.ts`, `ribbon/actions.ts`, `ribbon/tabsMain.ts`, `packages/tools/src/index.ts` e `types.ts` (opção `railingTypeId`). Não houve mudança em `cena.rs`, `lib.rs`, `cena-v11.json`, `esquema.rs` nem em nenhum arquivo das fases 2 a 5.
16. **Alças de vértice (6a):** `guardaCorpoGrips.ts` tem as funções puras (lista e patch de um vértice). A ligação às alças da seleção do canvas não entrou: falta o encaixe no sistema de alças da planta. Hoje a edição do caminho se faz pela ferramenta e pelo painel.
17. **Propriedades e avisos (6b):** o painel mostra tipo, lados por trecho (lance e patamar), posição da base, deslocamento, altura e sentido, e lista os avisos de modelo com "Ir para" (`guardaCorpoIssues`, já ligado ao painel de problemas pela F1). Cada edição vale para toda a seleção de guarda-corpos num passo de desfazer. Os avisos de norma e de geometria esperam as Fases 4 e 5. A barra da ferramenta escolhe o tipo dos próximos guarda-corpos (`railingTypeId`, padrão = o do projeto).
18. **Editor de tipo (6c):** sete abas (Geral, Trilhos, Corrimãos, Postes, Preenchimento, Junções, Norma), com os campos de dados da §4.2 e a validação de `tipoGuardaCorpoIssue` (o OK e o Salvar ficam desabilitados com erro). Ficaram para depois: a prévia (a ADR pedia o mini-projeto), as extensões, suportes e `maisPiso` do corrimão, o padrão por degrau (`porDegrau`) e a reordenação dos preenchimentos. Trilhos, corrimãos e preenchimentos são listas com adicionar e remover, respeitando os limites da §4.2.
19. **Editor de norma (6c):** cada limite numérico mostra a fonte (`fontes`) e o selo "a conferir" quando não verificado. Presets: "Restaurar predefinição" (só para os ids de fábrica), "Usar no projeto" (grava `normaGuardaCorpoId`) e "Duplicar". O tipo escolhe o perfil na aba Norma (vazio = o do projeto).
20. **Estado:** o kernel Rust ainda não gera malha (Fases 2 a 5). O guarda-corpo é gravado, listado e editado, mas o 3D e a planta não o desenham até a Fase 5. Os testes desta fase cobrem a ferramenta, a criação pelo hospedeiro, a regra de um por hospedeiro e as alças (`guardaCorpoTool.test.ts`). As telas de propriedades e dos dois diálogos ficaram sem teste automatizado, só com tsc.
21. **Complemento (alças, editor e prévia):** a alça de vértice agora está ligada ao canvas: `railingGrip` em `selectGrips.ts` (depois da rampa), com arrasto mostrando o caminho e gravação em uma transação "Mover vértice do guarda-corpo". A seleção mostra as alças dos vértices de guarda-corpos manuais (`railingHandlePreview`). Hospedados em escada ou rampa não têm alça de vértice, pois o caminho vem do hospedeiro. O item 16 fica superado por isto.
22. **Editor de tipo, completo:** o corrimão edita as extensões de início e de fim (apoio, comprimento e `maisPiso`) e os suportes (layout, espaçamento ou número, justificação e comprimento). O balaústre edita o `porDegrau` (ativo, quantidade, distância da quina). Os preenchimentos podem subir e descer. Os campos novos estão nos sete idiomas (`gc6c_ext_*`, `gc6c_sup_*`, `gc6c_sl_*`, `gc6c_just_*`, `gc6c_pd_*`, `gc6c_move_*`).
23. **Prévia do tipo:** `guardaCorpoType/preview.tsx` desenha uma elevação esquemática de um vão de 2,4 m, só com os parâmetros (altura, postes, trilhos, corrimãos, balaústres e painéis). Não usa a malha do kernel, então não depende das fases 3 a 5. A prévia 3D real segue na Fase 5.
24. **Visibilidade e seleção do guarda-corpo:** a categoria `railing` entra em `categoriaDoElemento` (antes faltava, e ocultar ou isolar a categoria deixava os guarda-corpos de fora). Com isso `visibilityOf()` cobre ocultar, isolar e revelar por categoria e por elemento, num único critério. A planta registra os guarda-corpos na categoria `railing` (`categoryHiddenIds`). "Mesmo tipo neste pavimento" inclui guarda-corpos (`idsOfType` e `selectedTypeId`). Na planta, `pickRailingAt` acha o guarda-corpo pelo caminho e ignora o oculto; ao passar o cursor, o caminho aparece tracejado. Testes: `railingPick.test.ts` (seleção, oculto, tipo, gancho) e `viewVisibilityRailing.test.ts` (ocultar, isolar e revelar por categoria e por elemento).
25. **O que depende das fases 3, 4 e 5:**
    - (a) Seleção na planta de guarda-corpo hospedado em escada ou rampa: falta a polilinha do eixo. Gancho pronto: `setRailingPlanShapes` (em `railingPick.ts`), que a fase 3/4 chama com o caminho do kernel. Até lá, o hospedado não se seleciona pela planta; ele se seleciona pela lista e pelo painel.
    - (b) Seleção e ocultação no 3D: precisa da malha do guarda-corpo (Fase 5, `guardaCorpo3d.ts`) para o pick por id. O critério já é `visibilityOf()`, o mesmo das outras vistas.
    - (c) Seleção nos cortes e elevações: precisa da geometria de corte (Fase 4a, `guarda_corte`) e da malha (Fase 5). O critério é o mesmo.
    - (d) Avisos de norma e de geometria no painel: Fase 4.
    - Para as três vistas, o que falta é apenas a geometria. A regra de visibilidade e o modo de seleção já são os mesmos.
26. **Filtro de seleção por categoria:** o filtro `ElementCategory` do menu de seleção continua com as nove categorias antigas; não entrou `railings` nesta rodada. A visibilidade por categoria (diálogo de visibilidade gráfica) já lista `railing`.
27. **Retomada (pausa do dono):** o que ficou pronto está no branch feat/gc-f6 (6a, 6b, 6c e complemento: alças, extensões e suportes, porDegrau, subir/descer, prévia, visibilidade e seleção por categoria railing). Para retomar: (1) rodar `npx vitest run packages/tools/src/guardaCorpoTool.test.ts packages/tools/src/railingPick.test.ts apps/web/src/editor/viewVisibilityRailing.test.ts`; (2) pendente da Fase 3 a 5: polilinha do hospedado via `setRailingPlanShapes`, malha 3D e seleção nos cortes (itens 25a a 25c); (3) pendente de decisão: entrar `railings` no filtro `ElementCategory` (item 26) e a seleção de hospedado pela planta.


---

## 15. Registro da Fase 2 (o que ficou pronto, os ganchos e as escolhas)

Estado: **Fase 2 implementada** em `feat/gc-f2`. O JSON do contrato (`cena-v11.json`, versão 13) fica **congelado** a partir do primeiro commit da fase; as fases 3 a 5 leem esse contrato.

**Conferência de colisão (§6):** nenhuma branch remota (`origin/*`) usa ids de seção acima de 25 nem de consulta acima de 16; os ids 60 a 81 e 60 a 65 estão livres. As branches 0051 a 0053 ainda estão em `VERSAO_ESQUEMA` 10 a 12; quem mesclar depois da `feat/guarda-corpo` precisa renumerar a versão para 14 em diante.

**Ajustes ao contrato feitos na Fase 2:**
- `rampa_patamares_gc` ganhou a coluna `componente` (índice do patamar na rampa, `ResolvedRampLanding.componentIndex`).
- Cada seção e cada consulta do guarda-corpo ganhou `descricao` no JSON (códigos dos enums, bits de `lados`, `flags` e `n_flags`).
- `normas_guarda.n_flags`: o bit `k` liga a `k`-ésima coluna depois de `n_flags` (bit 0 `desnivel_exige_guarda` ... bit 25 `carga_corrimao`; são 26 limites). Bit zerado ignora a coluna; bit ligado exige valor finito. O par `alturaMinimaAlta` (bits 3 e 4) liga junto, senão `ENTRADA`. Os dois booleanos entram como `u8`.

**Ganchos para as fases 3 e 4:**
- Rust: `crates/geom-wasm/src/secoes_gc.rs` (`SecoesGC` em `Cena.gc`, uma tabela tipada por seção, ordem canônica por id, módulo `limite` com os índices dos limites de norma, `NORMA_COLUNAS`), `validar_referencias()` (referências entre seções e limites de defesa; a Fase 3a chama no começo de `guarda_caminhos`) e `gc_tipos.rs` (códigos dos enums, limites da ADR, `CadeiaGC`/`TrechoGC`/`No3`/`OrigemTrecho` com cadeias sintéticas `reta`, `em_l` e `lance_inclinado` para os testes das fases 3b, 3c e 4a).
- `guarda_caminhos` hoje é só um **gancho**: valida as referências (`ENTRADA`/`LIMITE`) e devolve as quatro saídas vazias. A Fase 3a troca o corpo (função `guarda_caminhos_gancho` em `secoes_gc.rs`) e mantém a validação. As consultas 61 a 65 seguem `NAO_IMPLEMENTADO`.
- TS: `engine/src/kernelGuardaCorpo.ts` (`montarCenaGC(p, { anterior, materialDe, escadas, rampas })`), `kernelGuardaCorpoEnvio.ts` (`enviarCenaGC`, `diferencaGC`, `aplicarDiferencaGC`, `sincronizarCenaGC`), `kernelGuardaCorpoLinhas.ts` e `kernelGuardaCorpoTabelas.ts` (colunas e enums). Fixture de teste: `engine/src/fixtureGuardaCorpo.ts`. A cena anterior encadeia a numeração: editar uma escada reenvia só as linhas dela. `CenaGC.normaProjetoNum` é o `norma_num` das consultas de avisos.
- Testes: `cargo test -p geom-wasm secoes_gc`, `engine/src/kernelGuardaCorpo.test.ts` e `tests/kernel-gc2.wasm.test.ts` (entrou em `vitest.wasm.config.ts`).

**Escolhas tomadas onde a ADR era ambígua ou silenciosa:**
1. **`tol_corda` do tipo.** O modelo (`TipoGuardaCorpo`) não tem o campo; o adaptador envia a constante `TOL_CORDA_PADRAO_GC = 0,002 m` (2 mm, dentro da faixa da §5.1). O Rust aceita de 0,5 a 10 mm (`TOL_CORDA_MIN`/`MAX`, a faixa da própria §5.1) e devolve `ENTRADA` fora disso. Se o dono quiser a flecha editável, a Fase 6c acrescenta o campo ao tipo.
2. **`profundidade_piso`.** A distância média entre linhas de espelho consecutivas do primeiro lance com dois ou mais espelhos; sem isso, `minTread` do tipo de escada. Só serve à extensão `maisPiso`.
3. **Patamar da escada.** `escada_patamares_gc` leva o polígono do passo de patamar (`ResolvedStairStep`), com o `z` dele, na ordem dos vértices; o anel de 6 pontos do patamar de giro é o que o resolvedor já produz. A Fase 3a deriva dele as arestas de entrada e de saída.
4. **Sobrescrita `normaId` da instância.** Não vai para o Rust: a norma da instância só muda qual norma o TS passa em `guarda_avisos`. `flags` leva só `postesIntermediarios`, `preenchimentoAtivo` e `corrimaoAtivo` (ausente = ligado).
5. **Hospedeiro ausente ou que não resolveu.** O guarda-corpo fica de fora da cena (`CenaGC.ignorados`); o modelo continua apontando `railing-host-missing`. Só entram hospedeiros, tipos, perfis e normas usados por algum guarda-corpo (perfis iguais são internados uma vez; das normas, só a do projeto e as dos tipos usados).
6. **Referências entre seções.** Não são checadas na decodificação (as seções chegam em qualquer ordem); `validar_referencias` as confere por consulta. Também confere: `n_pontos` do perfil poligonal igual às linhas (3 a 64), `lados` do circular de 3 a 256, no máximo 12 trilhos, 4 corrimãos e 8 preenchimentos (padrões e painéis dividem a numeração do `indice`, sem repetir), 1 a 16 elementos por padrão, caminho manual de 2 a 512 vértices (`LIMITE` acima de 512). O limite de 20 000 balaústres fica para o motor da Fase 3c.
7. **Cache.** Escrever seções 60 a 81 não esvazia os caches de paredes, pisos, lajes e forros (nenhum deles lê o guarda-corpo).
8. **Correção de passagem.** `abi2::testes::versoes` ainda esperava a versão 12 do esquema (esquecida na Fase 1); passou para 13.

**Fase 3b (varredura e junções), registro:** implementada em `feat/gc-f3b`. `crates/geom-wasm/src/gc_malha.rs` (`MalhaGC`: grupos por peça, soldagem na grade de 1 µm com `floor(v/1e-6 + 0,5)`, análise de Euler, volume e fechamento/orientação) e `gc_varredura.rs` (perfil, quadros por rotação mínima, `varrer`, `filete`, `soldar`, `corrimao_lance_patamar`, `estender`, `posicoes_suportes`, `suporte`). `lib.rs` ganhou só as duas linhas `pub mod`. Referência TS em `engine/src/guardaCorpoRef/malha.ts` e `varredura.ts` (não exportada pelo `index.ts`, que é da Fase 1); paridade por `varredura.paridade.json` (gerado com `GERAR_PARIDADE_GC=1` pelo teste TS e lido pelo teste cargo `gc_varredura::testes::paridade`, contagens exatas e 1e-6 m). `guarda_malha` segue `NAO_IMPLEMENTADO`: a consulta é a integração final da Fase 3 (junta 3a, 3b e 3c). Validado também com o caminho real da 3a (`gc_varredura::caminho_real`: escada reta, com patamar, em U, caracol, rampa com patamar).

Escolhas onde a ADR era ambígua:
1. **Esquadria sem escala de perfil:** o anel de cada nó é o corte do perfil (no quadro do segmento) pelo plano bissetor, deslizando ao longo do tangente; o quadro do segmento seguinte é a rotação mínima do anterior, então os dois anéis coincidem. Acima de `1/cos(meio giro) > 2,5` (ou giro de 180 graus) o canto vira chanfro: dois anéis perpendiculares ligados por uma faixa.
2. **Solda (`conexaoTrilho: soldar`):** filete de 8 segmentos com raio de uma largura de perfil. **Filete do corrimão:** raio `raioFilete`, tangente limitada à metade do menor segmento vizinho (o raio efetivo diminui); sem número fixo, flecha de corda <= `tol_corda`.
3. **Pescoço de ganso:** curva de Hermite cúbica (12 segmentos) de `dg` antes do nó, com a inclinação do lance na entrada e horizontal na saída, chegando ao nível do patamar (`h_patamar`). Transição simples: arco vertical `max(0,15; 2·d)` no encontro das duas retas do corrimão. Lance e patamar não colineares em planta (giro > 3 graus): um só caminho com degrau vertical no nó e esquadria.
4. **Extensões:** ponta inferior segue a inclinação, superior é horizontal; `maisPiso` soma `profundidade_piso`. O estilo (`parede`, `piso`, `poste`) não muda o comprimento aqui; quem chama decide se há extensão.
5. **Suportes:** posições pelo comprimento desenvolvido; máximo e mínimo incluem as duas pontas; o suporte é um prisma horizontal perpendicular ao corrimão.
6. **Tampas** por triangulação por orelhas (perfil poligonal simples, anti-horário); laço fechado sem tampas. Laço fechado com holonomia não nula ganha faixa de torção.
---

## 16. Registro da Fase 3a (caminho hospedado no Rust)

Estado: **Fase 3a implementada** em `feat/gc-f3a`. `crates/geom-wasm/src/gc_caminho.rs` substitui `guarda_caminhos_gancho` (removido de `secoes_gc.rs`); a consulta mantém `validar_referencias` e devolve `ENTRADA` se `tol_corda` do tipo sair de 0,5 a 10 mm. Referência TS em `packages/engine/src/guardaCorpoRef/caminho.ts` (importada direto pelos testes; `guardaCorpoRef/index.ts` não foi tocado). Testes: `cargo test -p geom-wasm gc_caminho` (13), `tests/kernel-gc3a.wasm.test.ts` (paridade com `fixtureGuardaCorpo.ts` e variantes), `guardaCorpoRef/caminho.test.ts`. Wasm regenerado.

**Formato da saída de `guarda_caminhos`** (para as fases 3b, 3c e 4): `trechos` `[guarda_num, trecho, origem (0 lance, 1 patamar, 2 manual, 3 caracol), n_nos, flags]`, com `flags` bit0 curvo, bit1 fechado, bit2 soldado ao trecho anterior (mesma sequência contínua), bit3 lado direito; `nos` `[x, y, z]` em grade de 1 µm; `avisos` `[guarda_num, codigo, trecho, indice]` com código 1 = `gc-hospedeiro-descontinuo` (indice = componente) e 2 = `gc-deslocamento-excede-largura`; `valores` `[medido, limite, x, y, z]` (descontinuidade: folga em planta e `tol_juncao`; deslocamento: o pedido e 0). Trechos por guarda-corpo: lado esquerdo primeiro, depois o direito, na ordem dos componentes. O argumento `nivel_num` filtra por `nivel` do guarda-corpo (`NIVEL_TODOS` aceito).

**Escolhas onde a ADR era ambígua:**
1. **Um trecho por componente** (lance, patamar, caracol), sem fundir; componentes consecutivos ligados e contínuos formam uma sequência, com o deslocamento e a esquadria calculados na sequência inteira (o nó comum recebe o mesmo ponto em planta; cada trecho guarda a sua cota). Folga em planta maior que `tol_juncao` abre a sequência e avisa; componente desligado entre dois ligados abre sem aviso.
2. **Cota do lance** pelo `z1` do primeiro e do último espelho, linear no comprimento da borda; a cadeia é cortada entre o primeiro e o último espelho (pontos da borda mais próximos de cada linha de espelho). Sem espelhos: constante em `z_base`; um espelho: constante nele.
3. **Arcos:** flecha de corda <= `tol_corda`, no mínimo 8 segmentos por quarto de volta, no máximo 720 por arco. Cadeias retas perdem os vértices colineares; curvas mantêm todos. Caracol = lance cujo componente tem `caracol`, sempre `curvo`.
4. **Patamar:** a aresta de entrada é a do anel mais próxima da última linha de espelho (ou da borda final da rampa) do componente anterior; a de saída, a mais próxima da primeira linha do seguinte. Ausente uma delas, vale a aresta de ponto médio mais distante da outra. As duas cadeias vão da entrada à saída; esquerda é a de maior produto vetorial com a direção entrada-centro do anel. Em patamar em L a cadeia interna degenera num ponto e é omitida (sem guarda-corpo de um nó só).
5. **Deslocamento:** `degrau` recua para dentro (esquerda desloca para a direita), `lateral` desloca para fora do eixo da escada; manual: `0` esquerda, `1` direita, `2` sem deslocamento. Esquadria com limite 2,5x e, acima, chanfro de dois pontos. A recusa (`gc-deslocamento-excede-largura`) dispara quando algum segmento deslocado se inverte; não há ainda checagem pela largura entre as duas bordas.
6. **`inverter`** só reverte a ordem dos nós de cada trecho (lado e ordem dos trechos não mudam). Manual fechado não repete o primeiro nó no fim.
7. **Rampa:** lado esquerdo do lance por produto vetorial com a direção `inicio -> fim`; patamares pela mesma regra do item 4 usando as bordas dos lances vizinhos.
8. **Alturas, `ajusteAlturaPatamar` e junções** não entram aqui (são das fases 3b e 3c); os nós são do eixo no nível da linha das quinas / do piso.

## 17. Registro da Fase 3c (distribuição: postes, balaústres, por degrau e painéis)

Estado: **Fase 3c implementada** em `feat/gc-f3c` (a partir de `feat/gc-f2`). Arquivos: `crates/geom-wasm/src/gc_distribuicao.rs` (+ `gc_distribuicao/testes.rs`), uma linha `pub mod gc_distribuicao;` em `lib.rs` (única linha fora da 3c; inevitável), `packages/engine/src/guardaCorpoRef/distribuicao.ts` (referência TS), `distribuicao.paridade.test.ts` e `distribuicao.ouro.json` (casos de ouro lidos pelo cargo e pelo vitest) e o wasm regenerado. `guarda_malha` segue `NAO_IMPLEMENTADO`: a integração das três frentes da Fase 3 monta os parâmetros a partir das tabelas de `secoes_gc` e chama `distribuir`.

**API** (funções puras, sem tabelas): `distribuir(&TrechoGC, &ConfigDistribuicao, restante) -> Result<SaidaDistribuicao, u32>` devolve postes, balaústres por padrão, painéis, peças de malha (`papel` 0 poste, 1 balaústre, 5 painel, 6 cabo; sólido fechado e orientado, grade de 1 µm) e avisos (`1` padrão não cabe, `2` comprimido, `3` vão sem espaço, `4` sobra curta de poste). `restante` é quantos balaústres ainda cabem no guarda-corpo (`LIMITE_BALAUSTRES` menos o já usado); passar dele devolve `LIMITE`, padrão inválido devolve `ENTRADA`. Testes: 24 no cargo (suíte do crate: 235 ok), 23 na paridade TS, `tests/kernel-gc2.wasm.test.ts` verde com o wasm novo. Não há consulta nova, então não há teste wasm novo da 3c.

**Escolhas onde a ADR era ambígua:**
1. **`modoPoste`.** A ADR §4.2 foi alinhada ao código: `nenhum=0, espacamento-maximo=1, espacamento-fixo=2, numero-fixo=3`.
2. **Cota da cadeia.** `CadeiaGC` guarda a cota do eixo sobre o hospedeiro; as alturas (`altura`, `h_base`, `h_topo`, já resolvidas pela integração a partir de `RefBaseGC`/`RefTopoGC`, trilhos e `ajusteAlturaPatamar`) somam a ela. O poste vai de `z - abaixo` a `z + altura + acima`.
3. **Folga do vão.** Folga de cada ponta = meia largura do poste do limite (0 se não há) + meia largura do primeiro (ou último) elemento do padrão. O comprimento útil `Lu` vai do centro do primeiro ao centro do último elemento; `D` é a soma das `distanciaAnterior`. `Lu` menor que 1e-9 dá `gc-vao-sem-espaco`; `Lu < D` coloca só os elementos do início que cabem e avisa `gc-padrao-nao-cabe`.
4. **Fronteiras dos vãos.** Escopo `vao`: pontas, todos os postes e as quebras. Escopo `segmento`: só pontas e quebras; poste interior tira os elementos que o tocam. Trecho curvo nunca quebra. Quebra `cada-segmento` quebra em todo nó interior; `angulo`, onde o giro passa de `anguloQuebra`.
5. **Sobra `balaustre-extra`.** Com justificação início ou fim e `S >= P/2`, o primeiro elemento do padrão entra rente à ponta livre (no fim do vão útil para início; no começo para fim). Pôr no passo `k·P` nunca cabe (a sobra é menor que `P`). Em `centro` e `distribuir` a sobra não gera extra.
6. **`folga-nas-pontas`** reparte `S/2` nas duas pontas também nas justificações início e fim.
7. **Poste de transição** (lance para patamar sem giro): intermediário se o tipo tem intermediário ativo com modo diferente de `nenhum`, senão canto (conforme §5.2). Trecho curvo só tem poste nas pontas; trecho fechado não tem início nem fim, só cantos e transições.
8. **Poste fixo.** `espacamento-fixo` mede a partir do início do vão e avisa (código 4) quando a sobra do fim é menor que 0,3 do espaçamento. Poste intermediário a menos de (meia largura dele + meia largura do vizinho) do poste de nó é descartado.
9. **`porDegrau`.** `DegrauP { s0, profundidade, z }` (a quina, a pisada e a cota do degrau) vem da integração (espelhos da escada). Posições: `s0 + distanciaDaQuina + j·(profundidade - distanciaDaQuina)/quantidade`, `j = 0..quantidade`. Base na cota do degrau, topo no eixo mais `h_topo`. Vale em trecho de origem lance ou caracol; patamar usa o padrão normal. Sem degraus informados, cai no padrão normal.
10. **Painéis.** Cada vão entre postes consecutivos vira `n = ceil((vão - meias - 2·folga)/larguraMaxima)` painéis iguais (`larguraMaxima = 0`: um) com `folgaLateral` entre eles e até o poste. Malha: uma caixa fechada por faceta (paralelogramo no trecho inclinado, facetas nos nós do trecho curvo). Chapa perfurada e tela saem como sólido sem furo marcado `simplificado` (a regra de furos vazados da §5.7 fica para a Fase 4a/7, junto da área líquida); a tela usa `max(diâmetro do fio, 2 mm)` de espessura. Cabos: cilindros de 16 lados, centrados no painel; horizontais seguem as facetas, verticais ficam espaçados em `s`.
11. **Perfil retangular.** `largura` ao longo do caminho e `altura` na lateral; polígono em coordenadas locais (`x` ao longo do caminho, `y` à esquerda), corrigido para anti-horário. Tampas por triangulação de orelhas.
12. **Limite de 20 000** é checado dentro da distribuição (cada balaústre colocado), por guarda-corpo, via `restante`; o aviso do app vem da integração.
13. **Validação com o caminho real da 3a** (`gc_distribuicao/real.rs`): lance de 11 espelhos, patamar e caracol montados nas tabelas, cadeias vindas de `guarda_caminhos`. Como a 3a corta a cadeia nas quinas por projeção em arco discretizado, a quina de um degrau pode cair até 5 mm fora da cadeia: o `porDegrau` aceita isso e prende a posição às pontas (acima de 5 mm descarta).

---

## 18. Registro das Fases 4a e 4b (`feat/gc-f4`)

**4a (Rust).** `gc_planta.rs`, `gc_corte.rs`, `gc_quant.rs` e `gc_avisos.rs` implementam a lógica pura de `guarda_planta`, `guarda_corte`, `quant_guarda` e das medidas de `guarda_avisos`, sobre a `CadeiaGC` e sobre `PecaGC` (peça lógica definida em `gc_planta.rs`). `cadeia_de_saida` converte a saída real de `guarda_caminhos` (3a) em `CadeiaGC`; há teste com o caminho real.
- **Ainda não ligadas a `executar`.** As consultas 62 a 65 seguem `NAO_IMPLEMENTADO` até a 3b/3c entregarem as peças reais (balaústres, postes, trilhos). Ligar é só montar `Vec<PecaGC>` e chamar `achatar_*`.
- Estilo de planta e corte é por peça, não por segmento: peça que cruza o plano sai inteira como cortada. Eixo sai com papel 255.
- Corte: normal esquerda de `(dx, dy)` é o lado visível; elevação é o corte com plano fora da edificação e profundidade grande. `poligonos` = `[guarda, papel, n, s, z, ...]`.
- Códigos de `guarda_avisos`: 1 vão grande, 2 vão inferior, 3 altura do corrimão, 4 extensão, 5 altura baixa (`CODIGO_AVISO_GC` no TS).

**4b (TS).** `guardaCorpoQuantities.ts`, `guardaCorpoIssues.ts` (mensagens pt/en locais, os outros idiomas caem em pt, para não mexer no dicionário `egb_` espelhado no app), `guardaCorpoRef/avisos.ts` (esfera), `ifc/ifcGuardaCorpo.ts` (um `IFCRAILING` por guarda-corpo, corrimões do tipo como `IFCRAILING` HANDRAIL agregados; postes, balaústres e painéis como partes ficam para quando houver malha, Fase 5; `Length` só no manual enquanto o kernel não devolver o comprimento).
- **Requisito do dono (aparece, seleciona, isola/oculta).** Arquivo extra, fora da lista da 4b: `viewVisibility.ts` não mapeava `railing` em `categoriaDoElemento`; corrigido, então ocultar/isolar por categoria `railing` e por elemento vale em planta, corte/elevação e 3D pelo `visibilityOf()`. `guardaCorpoVista.ts` decodifica as linhas de planta/corte, aplica o conjunto `hidden` e escolhe o guarda-corpo sob o cursor; a Fase 5 só liga isso ao desenho e ao `pick`. Testes em `viewVisibility.guardaCorpo.test.ts`. O desenho em si (planta, 3D, corte) é a Fase 5.
- Mesclada `origin/feat/gc-f3a`; wasm regenerado e `--check` ok.
## 19. Registro da exportação IFC (`feat/gc-ifc`)

Estado: **exportação IFC pronta** em `packages/io/src/ifc/ifcGuardaCorpo.ts` (`addRailings`, chamado por `exportIfc` depois de escadas e rampas). Entrada nova em `IfcGeometry.railings?: IfcGuardaCorpoGeo[]` (`ifcTypes.ts`): por guarda-corpo, os grupos de `guarda_malha` (papel, `materialId` já resolvido pelo chamador, malha com cota absoluta) e `comprimentoDesenvolvido`. Enquanto as fases 3a a 3c não entregam a malha, os testes usam caixas sintéticas; falta só o chamador em `apps/web` converter a resposta de `guarda_malha` (papel numérico → `IfcPapelGC`, `material_num` → `materialId`) e montar `railings`. `ifcGeneric.ts` passou a exportar `faceSetOf` e `tessellatedShape`.

**Escolhas onde a ADR era ambígua ou silenciosa:**
1. **Regra do `PredefinedType` (§7.2) se contradizia** ("tem preenchimento → GUARDRAIL" e "só balaústres sem painel e sem corrimão → BALUSTRADE"). Ordem adotada: `tipo.ifcPredefinido` se houver; só balaústres, sem painel e sem corrimão → `BALUSTRADE`; qualquer preenchimento → `GUARDRAIL`; só corrimão → `HANDRAIL`; senão `USERDEFINED` com `ObjectType = 'GUARDA-CORPO'`. "Corrimão" conta só `funcao: 'corrimao'`; a travessa superior (`'topo'`) não conta.
2. **Trilhos (`TrilhoGC`) e suportes de corrimão** não aparecem na §7.2: trilho → `IFCMEMBER` `RAIL`; suporte → `IFCMEMBER` `USERDEFINED` com `ObjectType = 'HANDRAIL_SUPPORT'`. Travessa e corrimão → `IFCRAILING` filho `HANDRAIL`. Painel de vidro → `IFCPLATE` `CURTAIN_PANEL`; demais painéis `SHEET`. Continua [A CONFIRMAR] com visualizadores.
3. **Sem instanciamento.** Cada grupo de `guarda_malha` (papel + material) vira uma entidade com a malha do grupo (todos os balaústres juntos), e não um `IFCMEMBER` por balaústre com malha instanciada. Reduz entidades em prédios grandes; o preço é não selecionar um balaústre isolado.
4. **O pai não tem representação própria**; a geometria fica nas partes agregadas. O `IFCRAILINGTYPE` leva o `PredefinedType` do tipo e `IFCRELDEFINESBYTYPE` liga as instâncias (um relacionamento por tipo).
5. **`Pset_RailingCommon`:** `Reference` (código ou nome do tipo), `Height` (altura da instância ou do tipo) e `Diameter` (primeiro corrimão circular). `IsExternal` e `FireRating` não saem (o modelo não os tem). `Pset_Hestia_GuardaCorpo`: `Hospedeiro`, `HospedeiroId`, `Lados`, `Norma` (nome do perfil usado), `NormaConferida`, `Tipo`. `Qto_RailingBaseQuantities.Length` só sai se o chamador passar `comprimentoDesenvolvido` (a quantidade vem do kernel, não da malha).
6. **Hospedeiro escada/rampa:** `IFCRELCONNECTSELEMENTS` (relacionante = escada ou rampa, relacionado = guarda-corpo), achando o produto por `products` ou pelo GlobalId; sem hospedeiro exportado, não sai a relação (o `HospedeiroId` fica no pset).
7. **Nomes das partes** em pt/es ou en (tabela local no módulo), sem passar pelo `i18n` de `io`, para não tocar outros arquivos.

## 20. Unificação das quantidades (Fase 4a, `feat/gc-f5q`)

- **Um único `gc_quant.rs`.** `quantificar_pecas` aplica as regras de contagem (postes, balaústres, painéis, trilhos, corrimãos) sobre a `CadeiaGC` real da 3a e as seções do tipo, e gera `PecaGC`; `quant_guarda` (da f4) agrega por `(guarda, papel, perfil, material)`; `consulta_quant_guarda` liga a consulta 64 em `executar`. Não há segundo somador.
- **Um único `guardaCorpoQuantities.ts`.** Base da f4 (totais por guarda, custo, eixo) mais `decodificarQuantidadesGC(s, cena)`, `quantidadesGuardaNivelRust` e `totaisPorTipoGC` (a soma por tipo sai de `porPapel`).
- **Ambiguidades decididas:**
  - `distribuir`: n + 1 repetições por vão, a última encostando no fim do vão (n = ceil(Lu - D) / P).
  - Transição lance → patamar sem giro em planta: nó; recebe poste de canto só com `canto.ativo`.
  - Painel: área lateral de duas faces (convenção da f4); o TS divide por 2 em `areaPaineis`.
  - Corrimão com extensão: o comprimento da extensão (horizontal) soma ao eixo 3D; `maisPiso` não entra.
  - As peças de quantidade têm x, y = 0 até a 3b definir o eixo nas peças.
- **Pendente:** balaústres de `porDegrau`; quebras `angulo` e `nunca` sem a remoção por canto da 3c; área líquida de painel perfurado; suportes e cabos. A tabela de quantitativos do app não consome a consulta ainda: não existe despachante de guarda-corpo no app (a ligação é da Fase 7).

## 21. Registro da integração (`feat/gc-integracao`)

Mescladas na ordem: gc-f3a, gc-f3c, gc-f4, gc-ifc, gc-f6, gc-f3b e gc-f5q. Numeração das seções renumerada na mescla: §16 (3a), §17 (3c), §18 (4a e 4b), §19 (IFC), §20 (quantidades unificadas) e este §21.

**Decisões da mescla.**
1. **IFC.** Fica a exportação completa da gc-ifc (`IFCRAILING` pai, partes agregadas, Psets, `IFCRAILINGTYPE`); a versão simples da gc-f4 (`addGuardaCorpos(c)`, `ifcPredefinidoGC`) foi descartada, com os testes dela (sem geometria) substituídos pelos da gc-ifc e pelo teste de ponta a ponta.
2. **Quantidades: fonte única.** `gc_quant.rs` deixou de derivar peças (`quantificar_pecas` saiu). `quant_guarda` agrupa as `PecaGC` que `gc_montagem::montar` produz, as mesmas da malha, da planta e do corte: distribuição da 3c (`gc_distribuicao::distribuir`: postes, balaústres com `porDegrau` e quebras, painéis, cabos) e varredura da 3b (trilhos, corrimão, travessa, suportes). Teste `quantidade_e_malha_contam_as_mesmas_pecas_com_cabos_e_suportes`: cada grupo da malha tem exatamente uma peça lógica do mesmo papel, com ou sem gerar a malha. Os eixos dos cabos viraram `gc_distribuicao::cabos_do_painel` (usado pela malha e pelas peças).
3. **`gc_montagem.rs` (novo).** Monta o nível: caminho (3a) → por trecho, config de postes/padrões/painéis a partir das seções e das alturas (`folgaInferior`, trilho, corrimão, `ajusteAlturaPatamar` no patamar) → `distribuir` → varredura. Trilhos e corrimão varrem a sequência soldada (lance + patamar) de uma vez; transição simples ou pescoço de ganso só no par lance/patamar reto e colinear; filete do corrimão por `raioFilete`; extensões (`maisPiso` soma a profundidade do degrau); suportes pelo layout da seção 76. `lod` só muda os lados dos perfis circulares (8 / como está / 24). Limites conhecidos: `conexaoTrilho: soldar` e `juncaoAngular: filete` ficam em esquadria nos trilhos; suporte com layout "alinhar com postes" não recebe as posições dos postes; área líquida de painel perfurado e tela segue pendente; os degraus do `porDegrau` associam o k-ésimo lance de um guarda-corpo ao k-ésimo componente de lance da escada (módulo o número de lances).
4. **Consultas 61 a 65** ligadas a `executar` (`TOL_JUNCAO_GC` = 1 mm para o caminho). `guarda_avisos` mede altura real, folga inferior, vão (maior esfera, com postes, balaústres, painéis sólidos e trilhos), altura e extensão do corrimão.
5. **TS.** `ServicoGuardaCorpo` (engine) mantém uma cena do Rust por processo, envia só a diferença e memoriza por projeto; devolve malha por guarda-corpo, linhas de planta e corte, quantidades, eixos e avisos. Sem kernel pronto devolve `null` e nada é desenhado (nunca TypeScript no lugar). O 3D (`guardaCorpo3d.ts`, categoria `railing`), a planta (`plan/guardaCorpo.ts`), o corte e a elevação (`section/guardaCorpo.ts`, o plano vem de `planoDaSecao`), o pick nas três vistas (`guardaCorpoNoPonto`; no 3D pelas faixas de índices do lote), o eixo hospedado (`railingPick`), o painel de avisos, o chamador do IFC (`railingsOf` em `apps/web/src/editor/ifcExport.ts`) e a tabela de guarda-corpos (`GuardaCorpoScheduleDialog`, alimentada por `quant_guarda`) leem desse serviço.
6. **Pendências.** Os arquivos `guardaCorpoRef/malha.ts`, `varredura.ts` e `varredura.paridade.test.ts` (3b) levam `@ts-nocheck`: a referência de paridade usa vetores fixos que não passam em `noUncheckedIndexedAccess`; tipar com tuplas nomeadas. Validação visual no navegador com o kernel carregado ainda a fazer pelo dono.

## 22. Fechamento das lacunas de geometria do Rust (`feat/gc-rust-fim`)

Fecha três limites da §21 (item 3), todos em `gc_montagem.rs` e `gc_quant.rs`; os primitivos `filete` e `soldar` já existiam na 3b e na referência de paridade, então a referência TS não mudou.

1. **Solda nos trilhos.** `conexaoTrilho: soldar` com perfil circular aplica `soldar` (arco de 8 segmentos, raio de uma largura de perfil) aos cantos do trilho; perfil não circular segue em esquadria (a §5.8 só define a curva para perfil circular). Trilho de laço fechado não recebe solda nem filete.
2. **Filete nos trilhos.** O modelo e a seção 72 não têm campo de filete para o trilho (`juncaoAngular` é `segmento-vertical` ou `nenhum`), e a §5.8 define o raio só no corrimão. Escolha: se o tipo tem um corrimão com `juncao: filete` e `raioFilete > 0`, os trilhos usam o raio do primeiro; o filete tem precedência sobre a solda. Mesmo limite de tangente (metade do menor segmento) e flecha `tolCorda`.
3. **Suporte "alinhar com postes".** A montagem guarda as posições (x, y) dos postes de cada trecho (saída da 3c) e projeta cada uma no caminho do corrimão varrido; as distâncias desenvolvidas, ordenadas e sem repetição (1 µm), vão para `posicoes_suportes`. Assim a posição acompanha extensões e filete.
4. **Área líquida.** `fracao_aberta`: perfurada = `π d² / 4 / (passoX · passoY)` (vale também alternado, quincôncio); tela = `(larguraMalha − fio)(alturaMalha − fio) / (larguraMalha · alturaMalha)`; limite de 0,99. A peça de painel guarda a seção já descontada (`area_secao`) e `quant_guarda` deriva a área lateral e o volume líquidos. A área projetada (silhueta em elevação) continua bruta. A malha 3D não muda (sólido `simplificado`).

## 23. Decisões do dono e ajustes finais (2026-11-10)

1. **Inverter (`inverter`).** Inverter muda só a orientação: o início vira fim e o fim vira início. A forma e o lado não mudam, inclusive no caminho manual (lados 0, 1 e 2 e o fechado continuam iguais). Isto **substitui** o trecho da §4.2 (comentário do campo `inverter`) que dizia que, no manual, inverter trocava o lado "esquerdo".

2. **Verificação permanente.** `invariantes_do_guarda_corpo_sentido_normal_e_invertido` (`crates/geom-wasm/src/gc_caminho_testes.rs`) monta cada caso no sentido normal e no invertido e confere: nenhuma peça cruza o caminho em nenhum dos dois sentidos; o número de peças lógicas por papel é igual; a quantidade por papel é igual; o volume bate (tolerância de 0,1%) e o lado médio bate (1%). Casos: reta com escada, lance-patamar-lance, U com patamar de giro, caracol, rampa com patamar, manual aberto com lados 0, 1 e 2, e manual fechado.

3. **Desempenho.**
   - O lote 3D do guarda-corpo tem chave própria (`chavesDeGuardaCorpo`, `packages/render/src/model3d/chaveNivel3d.ts`). Editar paredes, lajes ou o resto do nível não refaz esse lote, e a visibilidade dos guarda-corpos entra só na chave deles.
   - Camada própria na planta: em andamento.
   - `ServicoGuardaCorpo` (`packages/engine/src/kernelGuardaCorpoServico.ts`) descarta a memória só quando a diferença enviada ao kernel não é vazia. Projeto novo com as seções idênticas mantém malhas, linhas, quantidades e avisos.

4. **Família padrão.** Nos tipos metálico, madeira, cabo, tela e chapa perfurada, a travessa inferior (trilho) fica a 0,08 m do piso (`ALTURA_TRAVESSA_INFERIOR` em `packages/model/src/guardaCorpo.ts`). Balaústres e painéis de cabo, tela e chapa nascem nela. Vidro e corrimão de parede ficam como estavam.

5. **Painel e ferramenta.** Seguem `docs/contratos/familias-e-ferramentas.md`: o painel `GuardaCorpoProperties.tsx` abre com `TypeSelector` e "Editar tipo" (regra 2), e a ferramenta `guardaCorpoTool.ts` traça pelo núcleo comum `desenhoPolilinha.ts` (regra 1). Os testes-guarda `contratoPaineisFamilia.test.ts` e `contratoFerramentas.test.ts` cobrem os dois.

6. **Avisos de geometria degenerada.** Em andamento, ainda não entregues.

## 24. Avisos de geometria degenerada (`feat/gc-avisos-geometria`)

Os casos degenerados deixam de sumir em silêncio: cada um gera um aviso (código, guarda-corpo, trecho e mensagem) e nunca uma peça inválida. O Rust devolve as medidas pela consulta 65 (`guarda_avisos`, mesmas colunas) e o TS escolhe o texto, nos sete idiomas (`guardaCorpoIssues.ts`, `mensagemGeometria`). Os avisos nunca bloqueiam.

| Código (`guarda_avisos`) | Código textual | Quando | `medido` / `limite` |
|---|---|---|---|
| 6 | `gc-hospedeiro-descontinuo` | emenda entre componentes com folga maior que a tolerância (já existia em `guarda_caminhos`, agora sobe) | folga / tolerância |
| 7 | `gc-deslocamento-excede-largura` | o deslocamento faz o caminho se auto-cruzar (já existia, agora sobe) | deslocamento / 0 |
| 8 | `gc-trecho-curto` | lado do patamar que sobra com um nó só (lado interno do patamar em L), ou trecho de comprimento horizontal nulo (até 1 µm) | comprimento / 1e-6 |
| 9 | `gc-caminho-repetido` | caminho manual com vértices repetidos em sequência (segmento nulo): são descartados | quantos / 0 (`indice` = primeiro repetido) |
| 10 | `gc-caminho-nulo` | caminho manual com menos de dois vértices distintos | vértices distintos / 2 |
| 11 | `gc-sem-borda` | lado pedido sem borda no hospedeiro: lance sem cadeia, patamar sem anel, escada ou rampa sem componentes | 0 / 0 (`indice` = componente) |
| 12 | `gc-perfil-auto-intersecta` | curva apertada: o perfil de meia largura `m` recua `m·tan(θ/2)` por dentro e passa do menor segmento vizinho (trilhos e corrimãos; laço fechado inclui o vértice de fechamento) | recuo / menor segmento |
| 13 a 16 | `gc-padrao-nao-cabe`, `gc-padrao-comprimido`, `gc-vao-sem-espaco`, `gc-poste-sobra-curta` | avisos da distribuição (3c, que já existiam no Rust mas não chegavam ao app) | vão ou valor / 0 |

Decisões. (1) Trecho que vira ponto não é distribuído nem varrido: a montagem o tira da lista e avisa; as sequências soldadas só juntam trechos consecutivos. (2) O código textual `gc-deslocamento-excede-largura` segue a §5; o numérico 7 espelha o 2 do caminho, e a tradução está em `gc_avisos::de_caminho` e `de_distribuicao` (e nos espelhos TS `deCaminho`, `deDistribuicao`). (3) Referência TS de paridade: `guardaCorpoRef/caminho.ts` (códigos 3 a 6 do caminho) e `guardaCorpoRef/avisos.ts` (`avisoTrechoCurto`, `avisoPerfilAutoIntersecta`). (4) No app, os avisos entram na lista de avisos do projeto (`useIssues`, no mesmo tempo de silêncio, refeitos quando o kernel fica pronto) e no painel do guarda-corpo, com "Ir para" (`issueTarget` enquadra o caminho manual ou a escada ou rampa hospedeira). (5) Verificação: `invariantes_do_guarda_corpo_sentido_normal_e_invertido` confere peças fechadas e com volume; os testes `aviso_*` repetem a verificação nos casos degenerados, nos dois sentidos, e conferem que o aviso é o mesmo ao inverter.

## 25. Guarda-corpo nas ferramentas de modificação (`fix/gc-edicao`)

O guarda-corpo ficou de fora do comando genérico `transform` e do registro de ferramentas de modificação. Agora usa o
mesmo mecanismo das paredes (`docs/contratos/familias-e-ferramentas.md`, regra 3).

**Regras.** (1) **Manual:** o caminho se transforma (`transformGuardaCorpo`, `packages/model/src/guardaCorpoTransform.ts`); o desnível `dz` e a `cotaBase` ficam; espelhar troca `ladoDeslocamento` (esquerdo e direito), para a geometria espelhada ser a mesma. (2) **Hospedado em escada ou rampa:** o caminho vem do hospedeiro. Mover, girar ou copiar o hospedeiro leva o guarda-corpo junto sem tocar nele; espelhar o hospedeiro troca `lados.esquerdo` e `lados.direito` (o croqui da escada troca os limites ao espelhar, §4.4). (3) **Hospedado sozinho: bloqueado.** A ADR (§4.4) já dizia "não se move sozinho" mas não dizia como; fica decidido: a ferramenta recusa com a mensagem `tl_msg_railing_hosted_locked` e nada muda (não desliga do hospedeiro). O comando `transform` ignora, em silêncio, hospedado cujo hospedeiro não está nos ids. (4) **Copiar a escada ou rampa copia os guarda-corpos dela** (`mapaDeIdsDeGuardaCorpos`, ids `gc_*`, hospedeiro remapeado); o colar por níveis (`ClipBuffer.railings`, `PasteIds.railings`) faz o mesmo, fora do vínculo de andar-tipo (§11). Hospedado sozinho não se copia. (5) **Apagar escada ou rampa** continua deixando o guarda-corpo órfão (§4.4), com o aviso `railing-host-missing`.

**Ferramentas.** Mover, Copiar, Girar, Espelhar e Matriz usam `selectedMovables`/`makeIdMap`/`ghostBands`. Alinhar: feição `caminhoGuardaCorpo` por segmento (manual `transladar`; hospedado só referência, com a mensagem acima). Deslocar: caminho paralelo em esquadria, para o lado do cursor, copiando ou movendo. Dividir: corta o caminho manual em dois guarda-corpos (laço fechado vira aberto). Aparar/Estender: leva a ponta mais distante do clique até a reta da referência (parede, aresta ou outro guarda-corpo). Mover no corte: o manual anda ao longo do corte e sobe ou desce pela `cotaBase`. Alças de vértice (§14, item 21) e propriedades em lote (painel aplica `updateGuardaCorpo` a todos os selecionados) já existiam. Teste-guarda: `contratoModificacao.test.ts`; testes por ferramenta: `guardaCorpoEdicao.test.ts` e `guardaCorpoTransform.test.ts`.

## 26. Montante por degrau sobre o piso (`fix/gc-montantes-degrau`)

**Onde caía antes.** Nos lances, o balaústre "por degrau" era posto a `s0 + distância` do início da pisada, e `s0` é a quina do espelho (a borda frontal do piso). Com distância 0 (ou menor que o raio do perfil) o centro ficava exatamente na face do espelho e a seção entrava no espelho e no bocel; com N > 1 o espaçamento era `(pisada - d) / N`, sem folga no fundo, então o último podia encostar no espelho seguinte.

**O que mudou (estilo "balusters per tread" do Revit).**
- Posição medida a partir do **bocel** (borda frontal do piso). Padrão: **centro da pisada**. Com N montantes, o centro de cada uma de N faixas iguais da pisada (N = 1: meio da pisada). Com distância dada `d`: N = 1 em `d`; N > 1 igualmente espaçados de `d` até `pisada - d`.
- O montante fica **sempre inteiro sobre o piso**: o centro tem de estar entre a meia largura do perfil e `pisada - meia largura`. O que não cabe **não é desenhado e gera o aviso** `gc-montante-fora-do-piso` (código 17 de `guarda_avisos`; vem da distribuição, código 5; `medido` = pisada útil; um aviso por trecho). Nada é empurrado em silêncio.
- Rampa sem degraus, patamares e padrão por espaçamento: inalterados.
- Tipo: `porDegrau.distanciaDoBocel: number | null` (`null` = centro da pisada, padrão) e `quantidade` (padrão 1). No kernel, `pd_dist = -1` (`PD_CENTRO`) significa centro; o esquema não mudou. O painel do tipo ganhou a caixa "Centro da pisada" e o campo "Distância do bocel" (só aparece fora do centro); chave `gc6c_pd_center` e `gc6c_pd_edge` revista nos sete idiomas. O sentido invertido não troca sinal de distância: a pisada tem sinal e corre para trás.
- Os tipos de fábrica continuam com "por degrau" desligado (mantêm o padrão por espaçamento); ligado, o padrão é 1 por degrau no meio da pisada. **Superado pelo modo automático abaixo (2026-11-10): os tipos de fábrica nascem com "por degrau" ligado e automático.**

**Integração com o acabamento da escada (`feat/escada-gc-integra`, ADR 0011 §8).** Toda referência do degrau continua em `piso_do_degrau(&DegrauP) -> (s da borda frontal, pisada útil)` em `gc_distribuicao.rs` (espelho TS: `pisoDoDegrau` em `guardaCorpoRef/distribuicao.ts`). A geometria resolvida da escada já é a ACABADA (espelho `h = H ÷ N`, cotas `z` no topo do piso acabado, linha do espelho na face acabada), então `s0`, `profundidade` e `z` já são medidos nas faces acabadas. O que o acabamento acrescenta é o bocel, e ele chega por duas colunas novas de `escada_espelhos_gc` (o contrato `cena-v11.json` mudou, `versao` segue 13 porque a seção do guarda-corpo ainda está em desenvolvimento): `bocel` (projeção do bocel do degrau que sobe por aquele espelho; 0 sem acabamento) e `z_piso` (topo do piso acabado; sem acabamento, igual a `z1`). O TS as deriva de `stairFinishModel` (`acabamentoDosDegraus` em `kernelGuardaCorpoLinhas.ts`: `bocel` só onde o piso tem aresta frontal com bocel, `z_piso` = `z1` do sólido do piso), sem recalcular nada.

No Rust, `DegrauP` ganhou `bocel` e `bocel_seguinte` (o `z` passou a ser `z_piso`) e `piso_do_degrau` devolve: **borda frontal** = `s0 - sinal·bocel` (a frente do bocel acabado, contra o sentido da pisada) e **pisada útil** = `profundidade + sinal·(bocel - bocel_seguinte)`, isto é, até a face acabada do espelho seguinte MENOS o bocel dele, que passa por cima do piso à altura do montante (o último degrau não tem seguinte, então a pisada vai até a face do espelho de cima). A base do montante é `z_piso`, o topo do piso acabado: nem afundada nem flutuando. Sem acabamento (`bocel` = 0) o resultado é idêntico ao anterior. O restante (`deslocamentos_no_piso`, folgas e o aviso `gc-montante-fora-do-piso`) mede a partir dessa referência.

**Testes.** Rust: `montante_por_degrau_fica_inteiro_sobre_o_piso_em_escadas_variadas` (4 escadas, sentido normal e invertido, N = 1, 2, 3, três diâmetros, centro e distância dada: nenhum montante invade espelho ou quina, e a posição padrão é o meio da pisada), `montante_que_nao_cabe_no_piso_avisa_e_nao_e_desenhado`, `por_degrau_uma_duas_e_tres_por_degrau`, os reais de lance e caracol e o invariante de inverter sentido. Ouro compartilhado Rust/TS: quatro casos novos (centro 1, centro 3, não cabe, centro invertido). Com acabamento: Rust `montante_por_degrau_com_acabamento_mede_do_bocel_acabado` (sentido normal e invertido, N = 1 a 3, dois diâmetros: nenhum montante invade espelho acabado nem bocel, base em `z_piso`, padrão no centro da pisada útil) e `piso_do_degrau_sem_acabamento_e_a_quina_e_a_pisada`; ouro compartilhado com dois casos novos (acabado centro 3 e acabado invertido); TS `kernelGuardaCorpoAcabamento.test.ts` (linhas `bocel` e `z_piso` com e sem acabamento, piso sem bocel, `pisoDoDegrau`).

### 26.1 Quantidade por degrau automática (`feat/gc-por-degrau-auto`, decisão do dono de 2026-11-10)

**Regra.** Com `porDegrau.automatico = true` o motor calcula a quantidade por degrau: o **mínimo N** para que nenhum vão livre horizontal entre montantes passe da **esfera máxima da norma do tipo** (ex.: 11 cm na NBR). Os N montantes ficam no centro de N faixas iguais da pisada útil (inteiros sobre o piso, como em §26). Dois vãos contam: dentro do degrau, `pisada útil / N - largura`; e do último montante de um degrau ao primeiro do seguinte (centro a centro menos a largura). É o mesmo critério horizontal do aviso `gc-vao-grande`, então o padrão de fábrica não dispara o aviso. Um só N vale para o lance inteiro (o maior que algum degrau exige; o último degrau, sem bocel seguinte, tem pisada útil um pouco maior). Exemplo: pisada 28 cm e balaústre de 2 cm dão **N = 3** (com 2 o vão seria 12 cm); balaústre de 4 cm dá N = 2.
- **Fora dos degraus** (patamar, trecho livre, rampa sem degraus) o padrão automático usa o **espaçamento máximo da norma**: período = esfera + largura do balaústre, centro a centro, com a justificação do tipo (`distribuir` reparte a sobra e nunca passa do período).
- **Sem esfera na norma:** 2 por degrau e o período do tipo (nada a calcular).
- O usuário pode desligar o automático e fixar N (`quantidade`, `distanciaDoBocel`), como antes. Projetos já gravados não mudam: o campo `automatico` é opcional e ausente vale falso.

**Onde.** Rust: `quantidade_automatica`, `resolver_automatico` e `QTD_AUTOMATICA = 0` em `gc_distribuicao.rs`; `ConfigDistribuicao.esfera` (vem do limite `ESFERA_MAXIMA` da norma do tipo). No kernel o automático vai como `pd_qtd = 0` (antes 0 era recusado): **o esquema não mudou**, só a descrição de `pd_qtd`. Espelho TS: `quantidadeAutomatica` em `guardaCorpoRef/distribuicao.ts`; ouro com 5 casos novos (escada normal e invertida, perfil largo, sem norma, patamar). **Norma do tipo na cena:** `tipos_guarda.norma_num` agora é sempre a norma que vale para o tipo (a dele ou a do projeto), porque a geometria (malha, planta, quantidades) não recebe a norma do projeto como os avisos; assim a malha e os avisos leem a mesma esfera.
- Fábrica: os tipos de balaústres (`gct_balaustres`, `gct_madeira`) nascem com por degrau ligado e automático. Painel do tipo: caixa "Automático (norma): o mínimo que a norma exige" (`gc6c_pd_auto`, sete idiomas); ligada, esconde "Quantidade por degrau" e "Centro da pisada".
- **Bocel padrão da escada 1,5 cm** (ADR 0011 §8), para o aviso de projeção do bocel não disparar no padrão.

**Testes permanentes.** Rust: `quantidade_automatica_e_o_minimo_que_a_norma_exige_e_nao_depende_do_sentido` (pisadas 25 a 32 cm, perfis 2, 3 e 4 cm, bocel 1,5 cm, sentido normal e invertido: vão ≤ esfera, N mínimo porque com N-1 passaria, montantes inteiros sobre o piso, saída espelhada idêntica) e `automatico_fora_da_escada_usa_o_espacamento_maximo_da_norma`; ouro Rust/TS. Wasm (`tests/kernel-gc-montantes.wasm.test.ts`, caminho real do app): para as 24 combinações pisada x perfil o aviso `gc-vao-grande` não dispara no padrão e dispara com N-1; posições dos tipos de fábrica com e sem acabamento.
