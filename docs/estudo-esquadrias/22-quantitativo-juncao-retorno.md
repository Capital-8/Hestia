# Quantitativo do furo por contorno, retorno que segue a forma e o impacto na junção de paredes

Data: 2026-11-17. Continua `19-spike-rust-furo.md` e `coleta/14-lapin-furo-ifc-quantitativo.md`. Marcas: [V] verificado (código lido com arquivo e linha, ou teste rodado nesta sessão); [I] inferência minha, a validar. A junção de paredes NÃO foi implementada: a seção 4 é só leitura e plano.

## 1. O que foi feito

Código novo (funções puras; sem consumidor no produto, sem exportação na ABI; `lib.rs` só ganhou as linhas `pub mod furo_contorno_quant;` e `#[cfg(test)] mod furo_contorno_quant_testes;`):

| Função | Faz |
|---|---|
| `quant_vao(contorno)` | área e perímetro do contorno REAL, mais largura/altura da caixa e `area_envelope = W x H` (o que o Lapin grava em `Area`) |
| `quantificar_parede(&ResultadoFuro, comprimento, altura)` | por camada, medido sobre a MALHA furada: volume líquido (divergência dos triângulos), volume bruto/removido, área de face líquida (triângulos em `y = y0` e em `y = y1`), área do furo na face. Confere malha contra kernel e área de face contra `volume / espessura`; discordância vira `ErroQuant::Inconsistente` |
| `retorno_do_vao(vao, EntradaRetorno)` | peça de retorno (malha fechada, volume, área do anel, área livre do vão, área exposta). Espessura efetiva = `min(pedida, espessura da camada de acabamento)`; `limitada` diz se o teto agiu |
| `ModoRetorno::Contorno` | faixa de largura `t` ao longo de todo o contorno: contorno menos o contorno recuado `t` (`ops::offset`). Segue a forma; é o que o Lapin zera quando há forma |
| `ModoRetorno::Ombreiras` | só as ombreiras (contorno menos a interseção do contorno deslocado `+t` e `-t` em x). Para o retângulo é `2 t H`, o que o cálculo atual soma |
| `volume_com_retorno`, `volume_removido_liquido` | camada com o retorno devolvido; o que o retorno não devolve |

Erros tipados: contorno inválido, espessura inválida, profundidade inválida, `RetornoNaoCabe` (o contorno recuado some, isto é, `2t >= largura` ou `t >= altura` no mínimo), falha das booleanas 2D, falha do kernel, inconsistência.

## 2. Como o quantitativo de parede é feito hoje (leitura)

- `quantidades.rs:238-290` (`quantidades_paredes`): para cada camada de cada parede, `bruto` = soma de `volume_faixa` sobre as faixas verticais da camada; `cortado` = volume de cada faixa dentro de piso e laje (`volume_cortado_pre`, par a par); `liquido = max(0, bruto - cortado)`; `area_de_face = liquido / espessura`. Parede x parede NÃO entra em `cortado`: os cortadores são só `c.pisos` e `c.lajes` [V].
- `perfil_quant.rs:110-149` (`volume_faixa`): `área da planta com furos x (z1 - z0)`; com inclinação, a altura é avaliada no centróide [V]. Quantitativo = prismas verticais, sem aproximação de curva.
- O vão entra na planta, não na malha: em `a3c.rs:195-215`, para cada faixa vertical, `furos = retângulo do vão` das aberturas cuja altura atravessa a faixa (`meio > peitoril && meio < peitoril + altura`), `poly = furos_de(fragmento, furos)` (`a3.rs:126`) e, em seguida, `poly.extend(retorno)` dos retornos daquela camada e daquele vão [V]. Os pontos de quebra vertical incluem peitoril e topo do vão (`a3c.rs:92-110`) [V].
- Retorno atual (`a3b.rs:196-224`, `envolvimento.rs:44-72, 84-94`): para cada camada envolvente (`envolve`, `espessura >= 1e-6`), dois retângulos laterais de largura `espessura`, a partir de `-W/2 + off` e `+W/2 - off`, na faixa de profundidade do lado (a parede toda num lado só; metade com os dois lados); descartado se `off + espessura >= W/2 - 1e-3`; menos a pegada do batente [V]. **Não há verga nem soleira**: o retorno é só de ombreiras, porque a conta é por faixa de planta [V pela construção; o efeito sobre a verga é [I]]. A espessura vem da camada (`w.espessura`), sem o teto fixo de 25 mm do Lapin [V].
- Consequência para o quantitativo atual com vão retangular: camada líquida = `L e Hparede - W Hv e` mais, na camada revestida, `2 t D Hv` [V, e a paridade numérica está testada, seção 3].

## 3. Invariantes testados (`cargo test --lib furo_contorno_quant`: 12 passam, 0,08 s em debug) [V]

| Teste | Invariante |
|---|---|
| retângulo 0,9 x 2,1 | área 1,89, perímetro 6,0, igual a `W x H` |
| meia-lua 96 cordas | área e perímetro contra a analítica (erro < 0,1%); área real menor que `W x H` por mais de 0,05 m2 |
| 5 camadas, meia-lua | por camada: removido = área do contorno x espessura; área de face líquida = `L H - A`; as duas faces têm a mesma área; líquido total = volume do kernel |
| janela com peitoril + meia-lua | o furo na face soma as áreas dos dois contornos |
| retorno: teto | pedida 25 mm com acabamento de 15 mm dá 15 mm e `limitada = true`; pedida abaixo do teto vale a pedida |
| retorno segue o contorno | malha fechada; volume por divergência = kernel; volume = área do anel x profundidade; anel + vão livre = contorno; todo vértice do retorno dentro do contorno; faixa com a espessura pedida em toda a volta (área do anel entre 90% e 100% de perímetro x t) |
| retorno + furo | removido líquido = área livre x espessura; camada com retorno = `(L H - área livre) e`; interseção do retorno com a camada furada tem volume zero; a união dá a camada com o vão livre |
| paridade, volume líquido | 3 vãos retangulares x 5 camadas: volume líquido da malha furada = volume do caminho atual remontado com as funções reais (`furos_de` + `volume_faixa` nas três faixas verticais), erro < 1e-9 m3 |
| paridade, retorno | retângulo 0,9 x 2,1, retorno pedido 25 mm sobre acabamento de 15 mm: volume do retorno = `2 t D H` e camada + retorno = caminho atual com `poly.extend` das duas ombreiras, erro < 1e-9; área exposta = `2 H D` |
| modo Contorno do retângulo | anel = ombreiras + `2 t (W - 2t)` (verga + soleira); vão livre = `(W - 2t)(H - 2t)`; área exposta = perímetro recuado x profundidade |
| erros | contorno inválido, espessura 0, profundidade nula, retorno que não cabe |

Limites do que foi verificado:
- A paridade usa as funções reais (`furos_de`, `volume_faixa`), mas NÃO passa pela cena inteira (`quantidades_paredes` com `Cena`, junções, perfis): remonta as três faixas à mão. Cobre a conta de volume do vão; não cobre o resto do pipeline [V do que foi feito; limite explícito].
- Tolerância das booleanas 2D: `ops` quantiza a 1 µm. O anel do retorno herda esse erro de borda; a interseção retorno x camada deu 5e-9 m3 e o teste usa 1e-7 m3 (da ordem de perímetro x 0,5 µm x espessura). Já área do anel, volume e paridade fecham em 1e-9 [V].
- `Ombreiras` por translação de contorno só é a erosão horizontal exata se cada corte horizontal do contorno for um único intervalo [I]; no arco, a faixa afina até zero no fecho (por isso o modo certo para forma é `Contorno`).
- Fora do modo `Contorno`, vão que toca o piso (porta) recebe também uma faixa de "soleira" no piso. O Lapin trata esse caso (anel ou "U" quando o vão está no piso, `BareOpenings.cs:42-67` [V pela coleta 14]); aqui ainda não [I].
- A profundidade do retorno (`y0`, `y1`) é dada por quem chama; a regra de lado (parede toda num lado, metade com os dois) está em `envolvimento.rs:84-94` e não foi reaproveitada.

## 4. Impacto na junção de paredes (`juncoes.rs`): só leitura e plano

### 4.1 O que a leitura mostra

- `juncoes.rs` é puramente planar: calcula, por extremidade, o corte de cada camada (`Pontas { fim: [Corte; 2], cordas }`, esquadria, encosto, degraus), sobre `Quadro`s. Não há menção a vão, abertura ou retorno no arquivo (busca por `vao|vão|abertura|opening|retorno`: sem ocorrência) [V].
- Ordem do pipeline [V pela leitura de `a3c.rs`, `b3.rs`, `quantidades.rs`]: junção (`juncoes.rs`) -> fragmento pintado da camada em planta (`pintor`) -> `a3c::resolver_nivel`: sobre o fragmento, fura com os retângulos dos vãos e soma os retornos, faixa vertical por faixa -> `quantidades_paredes` mede `volume_faixa` dessas faixas. `b3` (`junction_nivel`) parte das mesmas faixas já furadas (`resolver_nivel`, `b3.rs:457-465`) [V]. Portanto o vão é aplicado DEPOIS do corte de ponta de cada parede, sobre o polígono já esquadrejado.
- O retorno do vão é recortado contra o pintado das paredes vizinhas cuja caixa o toca (`a3b.rs:recortar_retorno`, ~linhas 247-266), para o retorno não invadir a parede vizinha num canto [V]. Retorno de ponta (parede livre) vem de outro lugar (`envolvimento::retornos_de_ponta`, usado em `itens.rs:143`) [V].
- A tese do spike 19 (`furar_parede`) é uma laje retangular `L x e x H` por camada. A camada real, depois da junção, tem as pontas esquadrejadas (trapézio em planta) e a altura vem do perfil/z da parede.

### 4.2 Onde o contorno livre bate nisso

1. **Furo perto de uma ponta com esquadria**: o volume removido deixa de ser `A x e`. Para o prisma de planta `P` da camada, removido = integral de `A(x, z) x espessura local de P em x`. Só vale `A x e` se o contorno estiver todo dentro da faixa reta da camada. `furar_parede` hoje valida o contorno contra `[0, comprimento] x [0, altura]` (`VaoForaDaParede`), que é a caixa da parede, não o polígono esquadrejado [V `furo_contorno.rs:87-96`]. A camada que o cálculo atual usa já é o fragmento pós-junção; o furo por contorno hoje não. [I] É o ponto mais provável de divergência entre o volume novo e o atual em vão encostado em canto.
2. **Modelo de faixas verticais**: o cálculo atual é por prismas verticais e é exato porque o vão é um retângulo (quebras só em peitoril e topo, `a3c.rs:92-110`). Um contorno em arco não é um prisma vertical. Só há duas saídas: (a) booleana 3D por camada (o caminho do spike 19, exato para o polígono do contorno), ou (b) discretizar o arco em faixas finas, o que seria aproximação e fere o princípio do cabeçalho de `quantidades.rs` ("não há aproximação") [V cabeçalho; a escolha é [I]]. Não é possível reaproveitar `volume_faixa` com contorno livre sem uma dessas duas.
3. **Topo inclinado ou com perfil**: a altura da faixa vem de plano afim ou perfil (`volume_faixa` com `Inclinacao`; `perfis_por_parede`). `furar_parede` assume altura constante e recusa vão fora de `[0, altura]`. Arco que cruza o topo inclinado precisa do contorno recortado pelo perfil [I].
4. **Retorno em canto**: o recorte atual subtrai o pintado dos vizinhos (2D, na planta). Um retorno que segue o contorno é 3D (anel extrudado em y); no canto, a parte do anel que cai dentro da parede vizinha precisa sair, e o critério (pintado do vizinho na faixa de z em que o contorno passa por ali) é 3D. A região de cada camada vizinha é conhecida em planta e por faixa de z (`faixa_da_peca`, `b3.rs:415`), então é viável, mas não está feito [I].
5. **Prioridade entre paredes**: `b3` recorta camada contra camada pela prioridade (`resolveJunction`) sobre faixas. Com contorno livre, a "faixa" deixa de ser prisma; o recorte por prioridade teria de operar em 3D também [I].
6. **Cobertura do TS**: a partição de faixas, quando a seção `faixas_juncao` está definida, vem do TypeScript e o Rust só executa recortes (`b3.rs`, cabeçalho) [V]. Qualquer mudança de modelo de faixa precisa ser acordada com o TS; não li o lado TS nesta sessão [não verificado].
7. **Vão que atravessa várias paredes colineares**: o Lapin faz um `IfcOpeningElement` por parede (`coleta/14` §1.3) [V pela coleta]. No Hestia o vão pertence a uma parede (`Abertura.parede`) [V]; o contorno atravessando duas paredes é fora de escopo, como no spike 19.

### 4.3 Plano sugerido (nada disto foi implementado)

1. **Região da camada em vez de retângulo**: fazer `furar_parede` aceitar, por camada, o prisma em planta pós-junção (fragmento pintado extrudado em z, na faixa da parede) em vez do cubo `L x e x H`. Invariante a testar: vão retangular dá o mesmo volume líquido que `quantidades_paredes` numa cena com canto esquadrejado (a paridade deste doc, mas passando pela `Cena` e com junção) [I].
2. **Validar o contorno contra o perfil**: trocar `VaoForaDaParede` por teste contra altura/topo reais (perfil/inclinação) [I].
3. **Retorno em canto**: recortar o anel do retorno contra o pintado dos vizinhos por faixa de z, como `recortar_retorno` faz em 2D [I]; testar o retorno + furo consistentes (interseção com a camada vizinha = 0).
4. **Escolher o ponto de integração**: manter `quantidades_paredes` por faixas para vãos retangulares e usar o caminho 3D só nos vãos com forma, para não mexer no que já tem paridade com o TS [I]. Medir antes o custo em WASM (o spike 19 não mediu desempenho do furo; doc 11 dá 5 a 45 ms por parede com 1 a 4 vãos) [V do que o doc 19 diz].
5. **Decisão aberta do dono**: o retorno atual não tem verga nem soleira. Passar a ter (modo `Contorno`) muda quantitativo de vãos retangulares existentes (soma `2 t (W - 2t)` por vão). Isso é regressão de números, não só feature nova [I].

## 5. IFC e quadro (pontos que esta peça alimenta, não implementados)

- `quant_vao` fornece `Area` real e `Perimeter` do contorno; o Lapin grava só `Width`, `Height`, `Area = W x H` e nenhum `Perimeter` [V `coleta/14` §3.2].
- `Retorno.area_exposta` é o equivalente de `RevealArea*` do Lapin para forma (que no Lapin é zero quando há forma [V `Openings.cs:668-669`, coleta 14 §2.1]).

## 6. Não verificado

- Desempenho de `quantificar_parede` e `retorno_do_vao` (testes só em debug nativo).
- Nenhum teste passa pela `Cena` completa nem por junção de verdade.
- Retorno de vão que toca o piso (soleira falsa) e vão com contorno côncavo ou com auto-interseção.
- Lado TypeScript (partição de faixas, `junctionNet.ts`).
- `build:wasm` não foi rodado, e o tamanho do `.wasm` com estas funções alcançáveis não foi medido.
