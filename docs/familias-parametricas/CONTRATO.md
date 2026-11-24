# Contrato das famílias paramétricas (ADR 0061)

Fonte da verdade dos **tipos**: `packages/model/src/familia/tiposCorpo.ts`, `tiposLigacao.ts`, `tiposRepresentacao.ts`, `packages/model/src/sistemasMep.ts`, `packages/engine/src/componentes/corposTipos.ts` (já no repositório, só tipos). Este documento é a fonte da verdade da **semântica**: o que cada campo significa, como se resolve e quais números de aceitação valem. Em caso de conflito entre uma ficha e este documento, vale este documento; a ficha deve ser corrigida, não contornada.

Convenções herdadas da 0049: texto da família em **mm e graus**; resolução em **metros e radianos**, arredondada a 1 µm; eixos da família X largura, Y profundidade (frente em y = 0), Z altura; mão direita; ângulo positivo anti-horário visto de +eixo.

## 1. Invariantes

1. Tudo é aditivo e opcional. Família sem `corpos`, `ligacoes`, `simbolos`, `detalhes`, `tabelas`, `verificacoes` ou `ifc` resolve **bit a bit igual** a hoje (teste de regressão obrigatório na ficha A7).
2. Nenhuma fórmula nova usa `eval`. A gramática continua fechada (§8).
3. Resolver nunca lança por entrada do usuário: devolve diagnósticos (`erro` ou `aviso`) com `onde` no estilo atual (`corpos[tubo].forma.caminho`). Estouro de limite é erro de validação.
4. Malha é função pura e determinística de `CorpoResolvido`; mesmos números, mesmos bytes.
5. Nada de `any`, nada de `eslint-disable`, arquivos de até 420 linhas, textos de interface em português (i18n nas `areas/familias.ts`).

## 2. Corpos

### 2.1 Quadro
`Corpo.quadro = { origem, rotacao? }`. Rotação em graus `[rx, ry, rz]`; matriz `R = Rz(rz) · Ry(ry) · Rx(rx)` aplicada ao ponto local do corpo; depois soma-se a origem: `p_familia = R · p_corpo + origem`. `CorpoResolvido.rotacao` é `R` em 9 números, ordem de linha.

### 2.2 Perfil → `PerfilResolvido`
(u, v) em metros; externo anti-horário, furos horários. `segmentos` padrão 32 para círculo e anel (mín. 8, máx. 128). Círculo com N segmentos começa no ângulo 0 (ponto `(r, 0)`) e segue anti-horário.

| Perfil | Contorno externo | Furos | Área exata |
|---|---|---|---|
| `circulo` | polígono regular inscrito de N lados, raio `diametro/2` | — | `N/2 · r² · sin(2π/N)` |
| `anel` | círculo externo | círculo interno (horário) | externo − interno |
| `retangulo` | retângulo centrado `largura × altura`; com `raio > 0` os 4 cantos viram arcos de 6 segmentos | — | `l·a` (menos os cantos) |
| `retanguloOco` | retângulo `largura × altura` centrado | retângulo `(largura−2e) × (altura−2e)` | `l·a − (l−2e)(a−2e)` |
| `poligono` | os pontos dados; se horário, inverte; precisa de ≥ 3 pontos, sem auto-interseção | — | shoelace |
| `perfilI` | I duplo T: mesas `largura × mesaEsp` em cima e em baixo, alma `almaEsp` entre elas, altura total `altura`, centrado | — | `2·b·tf + (h−2tf)·tw` |
| `perfilU` | U com a abertura voltada para +u; alma em −u | — | `h·tw + 2·(b−tw)·tf` (h = `altura`, b = `largura`) |
| `perfilL` | L com `abaA` na vertical (v) e `abaB` na horizontal (u), canto em (−, −), espessura `esp` | — | `abaA·esp + (abaB−esp)·esp` |
| `perfilT` | T: mesa em cima `largura × mesaEsp`, alma `almaEsp` descendo, altura total `altura` | — | `b·tf + (h−tf)·tw` |

Validação: todas as medidas > 0; `diametroInterno < diametroExterno`; `espessura*2 < min(largura, altura)`; `mesaEsp*2 < altura`; `almaEsp < largura`; perfil de revolução tem todo `u ≥ 0`.

### 2.3 Formas

**Extrusão.** O perfil no plano XY do quadro, crescendo de z = 0 a z = `comprimento` (mm > 0). Tampas planas (a de baixo com normal −Z, a de cima +Z). Furos do perfil viram túnel. Parede lateral: uma face por aresta do contorno.

**Revolução.** O perfil fica no plano XZ do quadro: `u` = distância ao eixo Z (≥ 0), `v` = z. **Posição do perfil (decisão de 2026-11-24, ESTADO):** perfis centrados (todos menos `poligono`) são deslocados para que o menor `u` seja `afastamento` (mm, padrão 0, ou seja, o perfil encosta no eixo; círculo com afastamento > 0 = toro, caso de teste: círculo Ø50 com afastamento 100 e 360° ⇒ volume `2π·0,125·π·0,025²` = 1,5421e-3 m³ ±0,5 %); em `poligono` os `u` são literais e somam o `afastamento`. Todo `u` final precisa ser ≥ 0 (erro "perfil de revolução cruza o eixo"). Gira `angulo` graus (0 < ângulo ≤ 360) anti-horário visto de +Z, com `segmentos` passos (padrão 32 por volta completa, proporcional ao ângulo, mínimo 1). 360° = sólido fechado (sem tampas); menor que 360° = duas tampas planas nos extremos. Pontos com `u = 0` não geram faces degeneradas (triângulos de área nula são omitidos).

**Varredura.** O perfil em (u, v) varre o caminho; `u` segue `N`, `v` segue `B` do quadro móvel. Quadro móvel por **transporte paralelo** (rotation-minimizing frame), sem torção:
- Tangente inicial `T0` = direção do primeiro segmento.
- Normal inicial: se `T0` é paralelo a Z (|T0×Z| < 1e-9), `N0 = X`; senão `N0 = normalize(Z × T0)`. Sempre `B0 = T0 × N0`.
- Para cada ponto seguinte, `N` é a reflexão de `N` anterior pelo método dos dois espelhos (Wang et al.) ou equivalente numérico estável; `B = T × N`. Em cada vértice vivo (raio 0) a seção sofre **junta de esquadro** (seção no plano bissetor, com o fator `1/cos(φ/2)` de alargamento); em arcos a seção é perpendicular à tangente.
- Tampas planas nas pontas, perpendiculares à tangente (normal −T no início, +T no fim).

**Caminho com curvas.** `raios[i]` é o raio no vértice interior `i+1`. Em cada vértice com raio R > 0:
- `d1` = direção unitária que chega, `d2` = que sai, `φ = acos(d1·d2)` (ângulo de desvio, 0 = reto, π = retorno).
- `φ < 1e-6` (colinear): o raio é ignorado. `φ > π − 1e-6`: erro "retorno de 180° não pode ter curva".
- Comprimento tangente `t = R · tan(φ/2)`. O arco vai de `A = P − d1·t` até `B = P + d2·t`, tangente aos dois segmentos, com centro `C = A + n·R` onde `n = normalize(d2 − (d2·d1)·d1)`, discretizado em `segmentosPorCurva` passos (padrão 12, mín. 2, máx. 64) → `segmentos + 1` pontos.
- Validação: `t(i) + t(i+1) ≤ comprimento do segmento entre os vértices i e i+1` (em mm, tolerância 1e-6); senão erro "curvas se sobrepõem no trecho N".
- `CaminhoResolvido.pontos` já traz as curvas discretizadas; `vertices` lista os índices dos vértices originais (e dos pontos A/B das curvas ficam como pontos comuns).

**Transição.** Dois perfis, ao longo de +Z de `z = 0` até `comprimento`, com `desvio` opcional (deslocamento (x, y) da seção B, mm). Os dois perfis são reamostrados em M = 64 pontos por comprimento de arco a partir do mesmo ponto de referência (ângulo 0 / canto à direita da base), e ligados ponto a ponto. **Sem furos** (erro se algum perfil tiver). Para redução de tubo oco, use dois corpos (externo e vazio interno) ou duas transições `anel`-equivalentes na v2; na v1 a redução é sólida e documentada como tal.

**Malha.** `malhaDosCorpos(corpos: CorpoResolvido[]): MalhasDasPecas`-compatível (`solidas`/`vazios`, com `pecaDoTriangulo` apontando o **corpo**). Superfícies laterais curvas usam **normais suaves** (vértices compartilhados ao longo do anel da seção; a costura e as tampas têm vértices próprios para ficar chapadas). Tampas: ver nota de furos abaixo. Limite: `LIMITES_CORPO.triangulosPorCorpo`.
Nota de furos nas tampas: se `triangulate` de `@hestia/geom` não aceitar furos, a ficha A5 liga cada furo ao contorno por uma ponte de corte (par de arestas coincidentes) e documenta a escolha; o teste de área da tampa (área do externo − áreas dos furos) decide.

### 2.4 Repetição, condição, detalhe
`repetir` (1..64, com `i` e `n` nas fórmulas do corpo) e `quando` seguem a regra da `Peca`. `detalhe3d` filtra por nível de detalhe como a peça. `vistas` ausente = aparece em todas.

### 2.5 Códigos de validação (`onde` → mensagem)
Cada um vira teste: `corpos[id]` duplicado ou id vazio · limite de corpos · forma desconhecida · perfil inválido por campo (medida ≤ 0, interno ≥ externo, polígono < 3 pontos ou auto-interseção) · caminho com < 2 pontos, > 64 pontos, segmento de comprimento 0, retorno de 180° com raio, curvas sobrepostas · revolução com `u < 0` ou ângulo fora de (0, 360] · transição com furos · fórmula inválida ou referência inexistente (reusa `validarFormulas`) · estouro de triângulos (na resolução).

## 3. Ligações

**Resolução.** `posicao` em m; `direcao` normalizada (vetor nulo = erro); `diametro`/`largura`/`altura` em m, 0 quando não se aplica à seção; `secao: 'redonda'` exige `diametro > 0`; `'retangular'` exige `largura > 0` e `altura > 0`. `propriedades` vira número (fórmula resolvida). `aceita` ausente = `[dominio]`. `quando` falso = a ligação some da lista resolvida.

**Compatibilidade** (função pura `ligacoesCompativeis(a, b)`, a ser feita na ficha C4):
1. `a.aceita` inclui `b.dominio` **e** `b.aceita` inclui `a.dominio`.
2. Mesma seção (`redonda` com redonda, `retangular` com retangular).
3. Medidas iguais com tolerância de 0,5 mm (diâmetro, ou largura e altura).
4. Direções opostas: `a.direcao · b.direcao ≤ −0,999` (≈ 2,5°), no mundo.
5. Fluxo: não podem ser ambas `entrada` nem ambas `saida`; `ambos` casa com qualquer.
Resultado: `{ ok: true }` ou `{ ok: false, motivo }` com motivo em português e fixo por regra (testável).

**Encaixe:** `encaixarLigacoes(alvo, candidatas, tolerancia)` devolve a melhor candidata (menor distância entre posições no mundo, dentro de `tolerancia` de 50 mm por padrão) e a transformação (posição, rotação, inclinação) que alinha a instância arrastada. Pura, no engine, sem estado.

**Propagação:** ao conectar, se a ligação da instância A tem `propagaParametro` e a ligação B é de seção maior ou menor, o parâmetro de A recebe o diâmetro de B em mm (arredondado ao inteiro). A resolução da instância já usa `Component.values`; a propagação é um comando único com desfazer.

## 4. Representações por vista

- **Símbolo 2D** (`Simbolo2D`): lista de primitivos em coordenadas locais do plano indicado. `xy` (planta): x → x, y → y; `xz` (elevação frontal): x → x, z → y do desenho; `yz` (elevação lateral): y → x, z → y. Em planta e elevação o símbolo acompanha a instância (rotação Z, espelhamento). Em **corte** vale o símbolo cujo `plano` é o do plano de corte (`xz` para corte paralelo a XZ, `yz` para YZ).
- `substituiGeometria: true`: as vistas listadas **não** desenham a projeção automática de peças e corpos; só o símbolo (útil para registro, tomada, luminária na planta).
- Sem símbolo, a projeção automática vale (peças: `projecaoPlanta.ts`; corpos: contorno da silhueta, ficha B3).
- **Visibilidade por corpo:** `Corpo.vistas`. `Peca` fica como está (por nível de detalhe).
- Primitivo `texto`: `texto` é fórmula de texto (aspas) ou número formatado com o valor de um parâmetro; altura em mm de papel × escala? **Decisão:** altura em mm de **modelo** (constante); o desenho da prancha escala junto.

## 5. Detalhamento

- `DetalheFamilia`: `vista` + `plano` (corte: eixo normal e posição em mm; elevação: eixo e sentido) + `escala` (denominador) + `cotas` + lista de ids de `simbolos` a mostrar.
- `CotaFamilia`: mede a distância entre dois `ReferenciaCota` projetada na direção do eixo dominante do segmento (planos de referência medem ao longo do próprio eixo). Com `parametro`, a cota é **dirigida**: o valor no detalhe é o do parâmetro; editar a cota edita o parâmetro (cadeado), com desfazer.
- `TabelaFamilia`: uma linha por tipo (`porTipo: true`) ou uma linha só da instância; cada coluna é uma fórmula sobre os parâmetros resolvidos; valores numéricos formatados em mm com 0 casas por padrão (ou `unidade`).
- `Verificacao`: `condicao` verdadeira ⇒ diagnóstico `severidade` com `mensagem` (interpolação `{param}` com os valores atuais). `erro` impede inserir a instância com aquele conjunto de valores no painel (mostra o motivo); `aviso` só mostra.

## 6. Categorias, IFC e quantitativos

| Categoria | Classe IFC padrão | Observação |
|---|---|---|
| marcenaria, mobiliario, generico | `IFCFURNITURE` (como hoje) | |
| loucas, terminal_hidraulico | `IFCSANITARYTERMINAL` | |
| equipamento | `IFCFLOWTERMINAL` | |
| tubulacao | `IFCPIPESEGMENT` | |
| conexao_tubo | `IFCPIPEFITTING` | |
| reservatorio | `IFCTANK` | caixas, fossas, sumidouros |
| eletroduto | `IFCCABLECARRIERSEGMENT` | eletroduto e eletrocalha |
| dispositivo_eletrico | `IFCOUTLET` (tomada) / `IFCSWITCHINGDEVICE` (interruptor) | via `Familia.ifc` |
| luminaria | `IFCLIGHTFIXTURE` | |
| duto | `IFCDUCTSEGMENT` | |
| terminal_ar | `IFCAIRTERMINAL` | |
| perfil_estrutural | `IFCMEMBER` | |
| chapa_estrutural | `IFCPLATE` | |
`Familia.ifc` sobrescreve. As ligações exportam como `IfcDistributionPort` ligadas por `IfcRelConnectsPorts` (ficha E2). Propriedades de tipo e instância vão em `Pset_HestiaFamilia`.

Quantitativos (ficha E3): por categoria, agrupar por tipo; tubulação soma comprimento por DN; reservatório lista volume útil (fórmula `volumeUtil` se existir como parâmetro derivado); perfil estrutural soma comprimento e massa (área × comprimento × densidade 7850 kg/m³).

## 7. Projeto: instância 3D e redes

**Instância** (`Component`):
`mundo = Rz(rotation) · E · Ry(inclinacao[0]) · Rz(inclinacao[1]) · local + (x, y, z)`; `inclinacao` ausente = `[0, 0]` (o de sempre). `E` espelha X local. A função `orientarSegmento(a, b)` (ficha C5) devolve `{ x, y, z, rotation, inclinacao }` para um tubo de comprimento `|ab|` cujo eixo Z local vai de `a` a `b`: `inclinacao[0] = acos(dz/L)`, `rotation = atan2(dy, dx)` (0 se vertical), `giro = 0`. Caso de teste: `a = (0,0,0)`, `b = (1,0,0)` ⇒ `inclinacao[0] = π/2`, `rotation = 0`; o ponto local `(0,0,L)` cai em `b`.

**Conexões:** `Component.ligacoes[idLigacao] = { componenteId, ligacaoId, sistemaId? }`, **simétrica**; o comando `connectComponents` grava os dois lados e o `disconnectComponents` apaga os dois. Excluir uma instância desconecta as vizinhas. Validação de projeto: toda conexão aponta para instância e ligação existentes e é recíproca.

**Sistemas:** `Project.sistemasMep[id] = { id, nome, dominio, cor? }`. Ao conectar duas ligações de sistemas diferentes, o comando funde (o da instância arrastada vira o do alvo) e reaponta as conexões. Domínio fixa o padrão de cor (água fria azul, esgoto marrom, elétrica vermelha, ar cinza…, tabela em `render`).

**Regras de conexão automática** (ficha C6): `Project.regrasConexao?` NÃO existe nesta fase; a regra vive na **família do tubo** como lista `conexoes` de ids de família para curva, tê e redução (campo adicional futuro). Até lá, a ficha C6 usa constantes por domínio no engine.

## 8. Linguagem de fórmulas (acréscimos)

Mantém a gramática. Novas funções (ficha A1): `sin(x) cos(x) tan(x)` (x em **graus**), `asin(x) acos(x) atan(x) atan2(y, x)` (devolvem **graus**), `pow(x, y)`, `busca(chave, k1, v1, k2, v2, ..., padrao?)` (tabela de pares; chave exata, senão `padrao`, senão erro), e a constante `PI`. Novo tipo de parâmetro `angulo` (número em graus, padrão 0, min/max/passo como `numero`), tratado como `numero` na resolução e com campo de ângulo na interface.

## 9. Arquivo e versões

- `FAMILIA_VERSAO`: 1 → 2 (ficha A9). O leitor aceita 1 e 2; `lerArquivo` mantém a lista branca de chaves do primeiro nível e passa a aceitar `corpos`, `ligacoes`, `simbolos`, `detalhes`, `tabelas`, `verificacoes`, `ifc`. Arquivo 1 sem as chaves novas abre igual. Arquivo 2 num programa antigo é recusado.
- `SCHEMA_VERSION`: 33 → 34 (ficha B1): `Component.inclinacao`, `Component.ligacoes`, `Project.sistemasMep` (migração só avança a versão). `check-parity` e o teste de migração cobrem.
- Colaboração: os comandos novos entram em `collabHistory` como os demais (nada de estado fora dos comandos).

## 10. Casos numéricos de aceitação (usados pelos testes cegos)

Tolerância relativa 0,5 % onde há discretização (64 segmentos), exata (1e-9) onde não há.

| # | Caso | Esperado |
|---|---|---|
| N1 | Extrusão círculo Ø100 mm, 64 seg., L = 1000 mm | volume do polígono `(64/2)·0,05²·sin(2π/64)·1,0` = 7,8413e-3 m³ (exato, 1e-9); `π·r²·L` = 7,8540e-3 (dentro de 0,2 %) |
| N2 | Cotovelo: círculo Ø50, caminho `(0,0,0)→(0,0,500)→(500,0,500)` com raio 100 no vértice | comprimento do eixo `400 + 100·π/2 + 400` = 957,08 mm; volume `A·957,08 mm` com `A = π·0,025²` ⇒ 1,8792e-3 m³ (±1 %) |
| N3 | Revolução: retângulo `u∈[0,0,05]`, `v∈[0,0,1]`, 360°, 64 seg. | volume do polígono 7,8413e-4 m³ (exato) ≈ `π·0,05²·0,1` = 7,854e-4 (±0,5 %) |
| N4 | Transição círculo Ø100 → Ø50, L = 100 mm | tronco de cone `π·L/3·(R²+Rr+r²)` com R = 0,05, r = 0,025, L = 0,1 ⇒ **4,5815e-4 m³** (±0,5 %) |
| N5 | Extrusão perfil I (h 200, b 100, tw 6, tf 10), L = 1000 mm | área 3080 mm² exata; volume 3,08e-3 m³ exato (1e-9) |
| N6 | `retanguloOco` 100 × 50, esp. 5 | área 1400 mm² exata |
| N7 | Normalização: ligação com `direcao = [0,0,-5]` | `[0,0,-1]` |
| N8 | Compatibilidade | `agua_fria` DN50 dir (1,0,0) × `agua_fria` DN50 dir (−1,0,0): ok · DN50 × DN75: recusa "bitolas diferentes" · `agua_fria` × `esgoto`: recusa "domínios incompatíveis" · direções iguais: recusa "ligações precisam apontar uma para a outra" |
| N9 | `orientarSegmento((0,0,0),(1,0,0))` | `inclinacao[0] = π/2`, `rotation = 0`, ponto local (0,0,L) → (1,0,0) |
| N10 | Fórmulas | `sin(30) = 0,5` · `atan2(1,1) = 45` · `pow(2,10) = 1024` · `busca(75, 50,60, 75,75, 100,110) = 75` · `PI` = 3,14159265358979 |
