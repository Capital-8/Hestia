# Retorno em canto, soleira zero, vão fora do envelope, parede com perfil e parede curva

Data: 2026-11-18. Continua `22`, `25`, `26` e `27`. Marcas: [V] verificado nesta sessão (teste rodado, com o Rust real quando disser "wasm"); [I] inferência, a validar. Estado do branch `claude/lucid-bell-hwk4ln`, sem commit.

## 1. Área de face real pela `furo_quant_parede` (tarefa 1)

- Porta: `ClienteFuroContorno.quantificarParede?` (`furoContornoDespacho.ts`), com memo por conteúdo (`quantificarParedePorContorno`). O cliente real (`furoClienteReal.ts`) chama `quantificarParede` de `@hestia/geom` (a exportação `furo_quant_parede`) com os contornos dos vãos, o comprimento da parede e a altura das faixas. Falha leve (vão que a placa não comporta) devolve `null` sem alarde. [V]
- Conta (`quantities.ts`, camada com vão por contorno): `área de face = (volume das faixas inteiras - corte de piso/laje) ÷ espessura - área do contorno na face`, com a área do contorno vinda da MALHA da placa furada pelo Rust (`area_furo_na_face`). Sem a medição, cai em `(faixas - removido - corte) ÷ espessura` (o que o prisma removeu). Parede com perfil de topo ou de base usa sempre a segunda forma: o furo na face é recortado pelo perfil, não pela placa retangular. [V]
- O que mudou de número: a conta antiga (`volume líquido ÷ espessura`) somava `retorno ÷ espessura` à face da camada de acabamento (o retorno é reveal, não face). Agora o retorno não entra na face. O volume segue igual. [V: teste "com retorno a área de face é a MESMA e o volume cresce"]
- Vão retangular: `fc` é nulo, caminho inalterado; JSON de `quantifyLevel` idêntico com e sem cliente real. [V wasm]
- A área de face de uma camada com ponta em esquadria continua sendo `volume ÷ espessura` das faixas (a convenção de sempre) menos a área do contorno na face. [I: a área do contorno na face de uma camada cortada em esquadria é a do contorno inteiro; só difere se o contorno cruzar a linha da esquadria.]

## 2. Retorno de acabamento (tarefa 2)

### 2.1 Soleira = 0: regra descoberta e alinhamento [V]

O retorno do vão retangular (`a3b::retornos_do_vao` + `a3c`, doc 22 §2) é só de OMBREIRAS: nunca tem soleira nem verga. O modo `Contorno` (doc 22) revestia o contorno inteiro, inclusive a soleira de uma porta que toca o piso (o achado do doc 27 no arco abatido).

Decisão aplicada: vão cujo ponto mais baixo toca o piso (`peitoril + z_min <= 1e-6`) recebe o retorno SEM a faixa da base (ombreiras descem até o piso, verga ou arco seguem o contorno). Janela com peitoril > 0 mantém o contorno inteiro (verga, arco e soleira): para a forma, essa é a escolha do doc 22 §3 (decisão aberta do dono sobre dar verga e soleira ao retorno retangular continua aberta; o retângulo não mudou).

Rust (`furo_contorno_retorno_ext.rs`, novo): `retorno_do_vao_ext(vao, entrada, recuo, base_livre, recorte)`. A base livre prolonga a aresta da base do contorno para baixo (caixa de altura `recuo + 2t`) ANTES do offset, para o offset não levantar as ombreiras, e corta o anel pelo contorno. Com recuo, as ombreiras chegam ao piso (sem base livre o recuo levanta a base em `r`). Base em um ponto (círculo) não muda. ABI nova `furo_retorno_vao_ext` (modo 2 = contorno sem base) e `furo_retorno_ext_abi_versao`. `area_exposta` agora é a dos triângulos laterais sobre a borda do vão livre. [V cargo: `base_livre_*` (4 testes); V wasm: arco abatido com sill 0 sem vértice no miolo da base, volume <= (perímetro - base) x t x D]

### 2.2 Retorno em canto [V wasm; T e vizinha de alturas diferentes: I]

O retorno 3D é um anel extrudado em y; no canto a pegada dele invade a parede vizinha. Solução em duas partes:

- Engine (`resolveContorno.ts`, `resolve.ts`): para cada retorno de contorno, a pegada em planta (retângulo do x do contorno por a faixa de s) é recortada contra o pintado das paredes vizinhas com o MESMO `clipReturn` do retorno retangular, em cada faixa de altura em que o vão existe, acumulando por interseção. O resultado vira `FuroContornoDaParede.retornos[].recorte` (mundo), só quando a vizinha de fato corta (pegada inteira = sem `recorte`, nada muda). `[]` = a vizinha cobre tudo, sem retorno. [V]
- Rust: o anel extrudado é interseccionado com o prisma de planta `recorte` ([u, s]) em qualquer z. `area_anel` e `area_livre` são do anel no plano x-z, sem o recorte; `volume` e `area_exposta` são da peça recortada. [V cargo: recorte a 1 cm da ombreira = -0,01 x H x D, 50% em s = metade, diagonal a 45 graus contra integral independente, recorte que cobre tudo, recorte fora da peça = 0, malha fechada]
- Teste wasm (L de duas paredes, porta em arco no canto): algum retorno é recortado, é menor que o inteiro, nenhum vértice do retorno cai dentro do pintado da vizinha; longe do canto nada é recortado. [V]
- Limite [I]: a interseção entre faixas é conservadora (a vizinha mais alta vence); não testei T nem vizinha mais baixa que o vão.

### 2.3 Vão que sai só em parte do envelope [V]

Escolhi RECORTAR E AVISAR (as duas partes pedidas):

- Rust: `furar_prisma_gen(camadas, topos, vaos, ForaDoEnvelope)`; com `Recortar` não há `VaoForaDaParede` por sair do envelope (o cortador que passa do prisma não leva nada além dele; o contorno continua validado). `furar_prisma` (política `Recusar`) é o de antes. ABI nova `furo_prisma_furar_ext` (+ `furo_prisma_ext_abi_versao`).
- Cliente real: com a ABI estendida usa `recortar: true`; sem ela a ABI antiga recusa e a camada recua para retângulo, como antes. [V: removido = área do contorno recortada pela parede x espessura, por camada, para vão que passa do topo e vão que passa da ponta]
- Aviso `vao-fora-do-envelope` (`openingShapeEnvelope.ts` novo + `openingShapeIssues.ts`): forma que sai do retângulo `[0, comprimento] x [0, altura]` de parede reta, vertical e sem perfil; texto `egb_issue_opening_shape_envelope` com o excesso em metros, nos 7 idiomas (pt/en em `i18nMessages.ts`, os 7 em `apps/web/src/editor/i18n/areas/packages-engine.ts`). Nota: o comando `addOpening` já prende o vão dentro da parede; o caso aparece em projeto importado/editado ou vão alto demais para a parede. [V: pt e en testados; os outros 5 pelo teste de paridade de `i18n.test.ts`]

## 3. Parede com perfil de topo/base e inclinada (tarefa 3)

### 3.1 Topo com perfil: ESTENDIDO [V]

Investigação: a banda com `slope` vem de `clipBandsToProfile` e é um plano que só depende da posição ao longo da parede, `z = h0 + (h1-h0)(u-t0)/(t1-t0)`, com `o = a` e `d = u` do quadro da parede, e `h` dentro de `[z0, z1]` por construção (a faixa é cortada onde o perfil cruza z0/z1). Isso é exatamente um semiespaço no referencial (u, s, z) do prisma, então dá para aparar o prisma por esse plano com `trim_by_plane` antes da booleana, sem aproximar nada.

- Rust (`furo_contorno_prisma.rs`): `TopoInclinado { t0, t1, h0, h1 }`; o prisma vai de `z0` até `z1` (a maior altura) e é aparado pelo plano; `volume_sem_furo` passa a ser o volume do prisma aparado (kernel). Validação sem panic: finito, `t1 > t0`, alturas em `[z0, z1]`, topo > z0; senão ENTRADA. ABI: `furo_prisma_furar_ext` (buffer `[t0, t1, h0, h1]` por camada; `t1 <= t0` = sem topo). [V cargo: volume bruto = área x altura média; removido = integral independente da corda do contorno clipada pelo topo, 1e-6; vértices nunca acima do plano; arco que passa do topo; topo plano = prisma sem topo; 5 topos inválidos; tamanhos incoerentes]
- Engine: `topoDaFaixa` (`furoContornoParede.ts`) confere que o plano é o do quadro da parede (senão a camada recua para retângulo); `rotaDoVao` só libera `perfil` se o cliente declara `topoInclinado` (o real declara quando o módulo tem a ABI estendida; o falso não, então os testes antigos seguem). [V]
- Wasm: parede de 6 m com empena (2,4 / 3,6 / 2,4 m) e janela meia-lua: vão vai por contorno e `removido` = integral por camada (1e-5); porta em arco: volume = sem vão - área x espessura e malha 3D do bloco = sem vão - área x 0,14 (1e-6); sem a capacidade no cliente a camada recua para retângulo. [V]
- Base em perfil (piso cobre parte da parede, base a 0,05 m): as faixas são planas (z0 por trecho); o vão agora vai por contorno e o corte pelo piso entra (removido = área do contorno acima de 0,05 m x espessura). [V wasm]
- Limites [I]: (a) o retorno do vão sob topo inclinado NÃO é recortado pelo plano do topo (contorno que passa do topo deixa retorno "flutuando" acima dele); (b) o aviso `forma-vao-ignorada-na-parede` não cobre perfil (nunca cobriu); (c) a área de face usa a malha removida, não a placa, na parede com perfil; (d) junção entre paredes com perfil e cluster inclinado seguem retangulares (`cluster-inclinado`).

### 3.2 Parede inclinada (`tilt`): CONTINUA RETANGULAR, motivo exato [I]

O prisma do Rust é vertical (extrusão em z da planta). A parede inclinada tem camadas cisalhadas (`extrudeLayerTilted`, `tiltJoinLayerVolume` com junção exata de arco inclinado), o vão fica num plano inclinado (`openingTiltPlane`) e o cortador teria de ser perpendicular a esse plano, não vertical em s; além disso o cluster inteiro refaz as faixas (`semRegioes`), então não há "prisma pós-junção" para furar. Exigiria um cortador oblíquo na ABI (ângulo por vão), a malha inclinada como alvo e o quantitativo `tf`/`ex` revisitado. Aviso `forma-vao-ignorada-na-parede` mantido.

## 4. Parede curva (tarefa 4): decisão e plano, NÃO implementado

Viável, com risco médio. A ideia que cabe no que já existe:

1. A planta de cada camada curva já é um multipolígono (cordas); `furar_prisma` aceita polígono arbitrário. Basta um referencial local ao vão: origem no centro do vão (`center` de `OpeningGeometry`), `t` = tangente e `n` = normal nesse ponto (já existem em `openingGeometry`). Mapear a planta da camada para `(u', s') = ((q-c)·t, (q-c)·n)` e usar `x = 0`, que reproduz o corte paralelo à normal do centro que o furo retangular atual faz (`cutHalfOf`, "acompanha o arco"). A malha volta ao mundo por `c + t u' + n s'`.
2. Com mais de um vão por camada, cada um tem direção diferente: a ABI precisaria de um ângulo por vão (cortador girado em z), com o mesmo ângulo no anel do retorno; ou furar vão a vão sobre a malha (a ABI recebe polígonos de planta, não malha).
3. Falta ainda: hachura de planta e símbolo do vão em parede curva (`openingBandRing` com `curve`), `quantities.ts` (a área de face de camada curva não é `L x H`; valeria `volume ÷ espessura` menos o contorno), junção de arco com parede reta (`tiltJoin` quando inclinada) e a chave de cache do 3D.

Motivo de não entrar agora: o ponto 2 muda a ABI (ângulo por vão) e o ponto 3 toca planta e 3D da parede curva, que não tenho como validar sem o app; sem teste e2e eu manteria o aviso. Mantido `forma-vao-ignorada-na-parede` (`rotaDoVao` devolve `parede-curva`).

## 5. Wasm e testes

- `.wasm`: 3719,7 kB (era 3695,9 kB; +23,8 kB), teto de 4 MB NÃO mexido; `npm run build:wasm` e `npm run wasm:check` ok (blob 3f6f0174a571, ABI 1). [V]
- Exportações novas: `furo_prisma_furar_ext`, `furo_prisma_ext_abi_versao`, `furo_retorno_vao_ext`, `furo_retorno_ext_abi_versao`. As antigas não mudaram de assinatura. Cliente TS em `furoPrisma.ts` (`furarPrismas(..., { recortar })`, `topo`, `furoPrismaExtCarregado`) e `furoQuant.ts` (`modo: 'contorno-sem-base'`, `recorte`, `furoRetornoExtCarregado`).
- `cargo test --lib furo_contorno`: 81 verdes (16 novos em `furo_contorno_ext_testes.rs`). [V]
- Wasm (`KERNEL_WASM_PATH=$PWD/packages/geom/assets/geom_wasm.wasm npx vitest run --config vitest.wasm.config.ts tests/furo-contorno`): `furo-contorno-ext.wasm.test.ts` (22 testes novos) e `furo-contorno-real.wasm.test.ts` (1 teste ajustado: o retorno do arco abatido deixou de ter soleira). [V]
- Engine sem wasm: `furoContornoExt.test.ts` (4: rota com perfil, aviso, porta da medição). [V]

## 6. O que ficou de fora

- Parede curva (seção 4) e parede inclinada (3.2): continuam retangulares com aviso.
- Retorno sob topo inclinado sem recorte pelo plano do topo; retorno em T e com vizinha de altura diferente sem teste.
- Desempenho no navegador e custo da booleana com topo inclinado (não medido); o app real (worker + `urlWasm`) não foi exercitado.
- Dar verga e soleira ao retorno do vão retangular (decisão do dono, números mudariam).
- Vista de corte, elevação, IFC e DXF do contorno (doc 26 §3).
- Área de face de camada em esquadria com o contorno cruzando a linha da esquadria [I].
