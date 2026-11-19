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

## 4. Parede curva (tarefa 4): decisão e plano (IMPLEMENTADO na seção 7; este texto é o plano original)

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

- Parede inclinada (3.2) continua retangular com aviso. A parede curva foi implementada (seção 7).
- Retorno sob topo inclinado sem recorte pelo plano do topo; retorno em T e com vizinha de altura diferente sem teste.
- Desempenho no navegador e custo da booleana com topo inclinado (não medido); o app real (worker + `urlWasm`) não foi exercitado.
- Dar verga e soleira ao retorno do vão retangular (decisão do dono, números mudariam).
- Vista de corte, elevação, IFC e DXF do contorno (doc 26 §3).
- Área de face de camada em esquadria com o contorno cruzando a linha da esquadria [I].

## 7. Fechamento: parede curva por contorno (implementado)

Marcas: [V] verificado nesta sessão (teste rodado, com o Rust real quando disser "wasm"); [I] inferência.

### 7.1 Regra do cortador: leque radial, não a normal central

O plano da seção 4 propunha um referencial por vão (centro, tangente, normal) e um cortador paralelo à normal do centro. Medi o erro e escolhi outra regra, mais correta e mais simples na ABI: **cortador radial em leque, um só referencial por parede**.

- Erro da normal central [V, conta própria]: parede de raio 3 m com camada de 0,30 m e vão de 1,20 m no eixo. O cortador paralelo remove 0,3625 m² de planta contra 0,3600 m² do leque (0,7 %). A diferença de volume é pequena; a de POSIÇÃO não: a face lateral do cortador paralelo (plano a 0,60 m da normal) se afasta da radial em `rho sin(w/2R) - w/2`, isto é, -3,4 cm na face interna e +2,6 cm na externa para 1,20 m; para vão de 2,40 m a mesma conta dá -9,0 cm e +2,7 cm. As ombreiras do furo ficariam desencontradas com o retorno e com o recorte existente.
- O furo retangular de sempre na parede curva (`openingHole` / `openingBandRing`) JÁ É um setor radial (faces em arco, arestas radiais). O leque é a mesma regra com contorno livre. Esse é o argumento decisivo: planta (hachura), furo 3D e quantitativo concordam entre si e com o caminho retangular.
- Por isso não é preciso ângulo por vão na ABI. Uma parede tem um só arco; o referencial local dela (origem em `a`, `u` = tangente em `a`, `s` = normal à esquerda: o de `paraPlanta`/`malhaParaMundo`) já serve a todos os vãos. O centro do arco nesse referencial é `(0, -raio)` com `raio = k R` assinado (`k = +1` com `sag > 0`). Cada vão entra pelo comprimento de eixo `x` (o `offset` do vão); o ponto `(t, s)` vai a `centro + rho (cos th, sin th)`, `th = k pi/2 - t/raio`, `rho = R + k s`. [V: teste `mapa_curvo_confere_com_a_formula_independente_e_o_inverso`]
- Construção: o contorno `[x, z]` é extrudado reto em `s` (de `rho_lo` a `rho_hi`) e levado ao referencial local por `Manifold::warp` com esse mapa (jacobiano `rho / R > 0`, preserva a orientação). As faces laterais de cada ponto do contorno ficam radiais. O tampo externo é plano entre vértices, então `rho_hi = rho_max_camada / cos(meio ângulo do vão) + 5 cm`: a corda não entra na camada. O tampo interno cai para dentro do vão livre. Limite de abertura: 2,4 rad por vão (acima: ENTRADA), raio mínimo 5 cm.
- Efeito no volume: removido por camada = `A_contorno x e x rho_medio / R` (a camada que não é a do eixo remove mais ou menos que `A x e`). [V]

### 7.2 O que foi ligado (troca atômica)

| Peça | Onde | Estado |
|---|---|---|
| Furo do prisma | Rust `furar_prisma_cur` + ABI `furo_prisma_furar_curvo` (15 args da `furo_prisma_furar` + `raio` f64) e `furo_prisma_curvo_abi_versao`; cliente `furarPrismas(..., { raio })` | [V cargo + wasm] vão que sai do prisma é recortado (sempre `Recortar`: `x` é comprimento de eixo, não u); sem topo inclinado |
| Retorno | Rust `retorno_do_vao_curvo` + ABI `furo_retorno_vao_curvo` (+ `raio`), `furo_retorno_curvo_abi_versao`; anel densificado a 5 cm, extrudado reto e `warp` pelo mesmo mapa; recorte em planta no referencial local | [V cargo + wasm] `area_anel`/`area_livre` são do anel desenvolvido (plano x-z); `volume` e `area_exposta` são da peça no mundo |
| Rota | `rotaDoVao`: curva exige `cliente.curva`; perfil de topo/base em curva = motivo novo `parede-curva-com-perfil`; o motivo `parede-curva` só sobra para cliente sem `curva` | [V] o cliente real declara `curva` quando o módulo tem as duas ABIs curvas |
| Camada furada | `camadaFurada` passa `raio` (`raioDaParede`) ao prisma e ao retorno; faixa com `slope` em curva recua para retângulo | [V wasm] |
| Hachura de planta | `furoDePlanta` já usa `openingBandRing`, que é setor em parede curva, com `cutHalfWidth` ao longo do arco | [V wasm: arco abatido a 1,2 m e a 2,3 m, setor da corda do contorno, 0,6 %] |
| Quantitativo | volume = faixas inteiras - removido + retornos; área de face = `(bruto - removido) / e`; `areaFuroNaFace` fica `null` em curva (a medição `furo_quant_parede` é de placa reta) | [V wasm] queda da área de face = `removido / e` por camada; `openingsArea` = área real do contorno |
| Retorno no engine | pegada do retorno (para o recorte em canto) vira setor (`arcSample`) em parede curva | [V cargo/wasm; canto com parede curva sem teste, [I]] |
| 3D | `wallLayerSolid` já usa `camadaFurada` + `malhaParaMundo`; sem mudança | [V wasm: volume da malha do bloco = sem vão - removido, 1e-6] |
| Peças da esquadria | inalteradas: já são colocadas no referencial central da parede curva | [I] a esquadria reta no centro e o furo radial coincidem no centro; nas ombreiras de vão largo o furo se afasta alguns cm (a mesma diferença do furo retangular de sempre) |
| Aviso | `forma-vao-ignorada-na-parede` só em parede inclinada, ou curva sem cliente com `curva` (ou com topo/base anexado) | [V] |
| Vistas (corte/elevação) | `faixasNaVista`: vão curvo que a linha não atende por contorno (oblíqua ao eixo no centro, o caso comum) sai com o furo retangular de sempre; linha exatamente perpendicular ou paralela usa o perfil do contorno | [V wasm: corte oblíquo não fica maciço]; elevação de parede curva usa a projeção pela tangente central [I] |

### 7.3 Testes

- `cargo test --lib furo_contorno`: 89 verdes (8 novos em `furo_contorno_curvo_testes.rs`): mapa e inverso; meia-lua nos dois sentidos de curvatura = integral independente em planta (raio a raio sobre as cordas, 2e-4) e = `A e rho/R` (4e-3, as cordas); dois vãos largos e vão que sai do início da parede (3e-4); raio enorme tende a `A x e` (1e-3); validação sem panic (raio 0, NaN, infinito, 1 cm, vão de 8 m, topo inclinado, contorno horário); ABI; retorno curvo (volume 1,5e-3, área exposta 3e-3, malha fechada, vértices entre as faces, entradas inválidas). [V]
- wasm: `tests/furo-contorno-curvo.wasm.test.ts` (13): parede de corda 6 m, flecha +1 e -1, meia-lua + arco abatido: removido por camada = integral independente (5e-4) e = fórmula fechada (5e-3, cordas), quantitativo, hachura, 3D, retorno (peça entre as faces, dentro do teto `perímetro x e x D x rho/R`), rota e aviso com e sem `curva`, corte oblíquo. Os 5 arquivos wasm de furo (79 testes) seguem verdes. [V]
- vitest engine (`furoContornoTroca`: cliente falso com `curva`, raio assinado nos pedidos, recuo sem `curva`) e áreas (resolve, quantities, section, openingShape, render model3d e plan, geom furo): verdes, exceto `openingParts.test.ts` (contagem do catálogo de tipos, de outra frente de trabalho, não relacionada). tsc, eslint e `check-boundaries` limpos nos arquivos desta tarefa (tsc ainda acusa `ShapePreview.tsx`, de outra frente). [V]
- `.wasm`: 3728,8 kB (era 3719,7 kB; +9,1 kB), teto de 4 MB não mexido; `build:wasm` e `wasm:check` ok (blob 5ff62ca39d77, ABI 1). Exportações novas: `furo_prisma_furar_curvo`, `furo_prisma_curvo_abi_versao`, `furo_retorno_vao_curvo`, `furo_retorno_curvo_abi_versao`. As antigas não mudaram. [V]

### 7.4 O que continua retangular ou em aberto

- **Parede curva com perfil de topo/base** (telhado, piso, laje anexados): fica retangular, motivo `parede-curva-com-perfil`, com aviso. O plano do topo do prisma é função de u, e na curva o perfil depende de `t`. [I]
- **Parede inclinada** (inclusive curva inclinada): retangular, como em 3.2.
- Retorno de vão curvo em canto com outra parede e retorno sob topo: sem teste. [I]
- `areaFuroNaFace` (medição na placa) não vale em curva; a área de face usa `removido / espessura`, que é exata para o leque. [V]
- Elevação e DXF de parede curva: contorno projetado pela tangente do centro do vão (erro `x - rho sin(x/rho)`: 0,7 % em 1,2 m a R = 5 m, 4 % em 3 m a R = 3 m) [I]; planta e símbolo seguem o referencial central.
- Desempenho do `warp` + booleana no navegador não medido; o app real (worker) não foi exercitado.
