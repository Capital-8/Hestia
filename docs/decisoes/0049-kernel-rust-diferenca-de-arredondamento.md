# 0049 — Diferença de arredondamento entre bibliotecas (kernel Rust)

Data: 2026-11-02. Decisão do dono. Generaliza a 0048 (pintor da A2) e fecha a parada do A3c (regiões e silhueta).

## Contexto

O TypeScript usa `polygon-clipping` e Clipper; o Rust usa `i_overlay`. Quando duas bibliotecas diferentes quantizam em inteiros
(1 µm, ou 1 nm no pintor), os vértices de interseção caem em pontos ligeiramente diferentes. Em uma operação isolada o desvio é
menor que 1 µm por vértice; ao somar dezenas de peças (união dos cortes em regiões por material e silhueta) a área final difere em
1e-4 a 3e-4 m² em regiões de 5 a 20 m². Perseguir igualdade abaixo disso exigiria portar a biblioteca do TS (e junto o seu defeito).

## Regra

Uma diferença entre o Rust e a referência TS **não é divergência** quando valem as quatro condições:

1. **Causa só de arredondamento.** Cada lado fica a menos de 1 µm por vértice do resultado exato, ou a diferença encolhe ao usar
   escala mais fina. Registra-se como a causa foi verificada.
2. **Topologia igual nos componentes significativos.** Mesma identidade e ordem de itens; mesmo número de peças e furos entre os
   componentes com área acima do limiar de fiapo (`1e-4 m²` por padrão; ajustável só com medição registrada). Componentes menores
   (fiapos de arredondamento, frestas que o fechamento preenche de um lado e não do outro) são contados à parte, e sua área já
   entra no limite do item 3. Se algum componente acima do limiar não tiver par, é divergência.
3. **Dentro de um limite medido e documentado.** O erro de arredondamento cresce com o comprimento do contorno (cada aresta desloca
   até ~1 grade), não com a área: o limite é `1e-5 + K × perímetro × 1e-6` m², com `K` medido (maior razão observada no estresse,
   fora das exceções nomeadas, com folga de 1,5×) e registrado. O limite não é escolhido para fazer o teste passar.
4. **Guarda de erro grosseiro.** Qualquer valor muito acima do limite reprova (garante que um defeito real não passe por
   "arredondamento").

Fora dessas condições a tolerância geral continua: 1 µm de coordenada e 1e-6 m² / m³. Cada nova aplicação desta regra registra a
medição no ADR da sub-etapa; não há exceção implícita.

## Aplicação ao A3c

- Regiões por material e silhueta (`cluster_resolvido`, `resolver_nivel`): limite `1e-5 + K × perímetro × 1e-6` (K medido; a medição do A3d
  mostrou que o limite por área falha em regiões pequenas de contorno longo, como a do fixture da casa de 2 quartos, 0,083 m²,
  simétrica 6,7e-5 contra limite 5,2e-5, com diferença de área de 2,2e-7), topologia nos componentes acima do fiapo, guarda de erro
  grosseiro de `1e-2 m²`.
- O caso da semente 1, nível 0, material 2 (o `unionClipper` do TS infla a região em 3,5e-3 m² e preenche um entalhe de 3 × 12 cm
  junto a uma parede curva) é defeito do TS: o Rust (2,382905) está a 2e-6 m² da união exata (2,382907). Segue a pendência de
  correção do TS, separada, e o caso fica numa lista de exceções nomeadas do harness (não no limite geral).
- Faixas, `fragment`, `cut` e `raw` não usam esta regra (continuam sob 0048 e as tolerâncias gerais).

## Exceções nomeadas (defeitos do TS, não arredondamento)

Cada exceção é um caso identificado no harness, reproduzível, e só vale se o Rust concordar com a geometria exata (a área do Rust
bate com a união ou interseção exata a 1e-6 m²). Lista inicial:

1. Semente 1, nível 0, material 2 (`unionClipper` infla a região em 3,5e-3 m² e preenche um entalhe de 3 × 12 cm junto a parede
   curva): a exceção cobre a região **e a silhueta do mesmo grupo**, que é derivada da mesma união.
2. Estresse retas, semente 101, parede 18, camada 4 (`polygon-clipping` em `intersection`, no recorte pelo perfil: devolve fatias que
   somam 0,0570 m² num polígono de 0,0494; o Rust soma 0,0494). É o mesmo tipo de defeito da 0048, com ganho de área em vez de perda.

Ambos seguem como pendência separada de correção no TS (subir `VERSAO_MOTOR_GEOMETRIA`).

## Contenção de partes após arredondamento à grade

Data: 2026-11-05. Aplica-se ao teste de contenção de `tests/kernel-b3.wasm.test.ts` ("partes sem sobreposição e volume conservado"),
sementes 31 a 33. A tolerância base de 1e-6 m² não muda.

- Origem: as alturas de corte da junção B3 são arredondadas à grade EPS_Z = 1e-6 m. Cada coordenada pode então deslocar-se até
  EPS_Z / 2 (meio micrômetro), e a borda de uma parte pode sair da borda da original nessa medida.
- Critério: excesso de área fora da original ≤ 1e-6 + perímetro_da_peça × EPS_Z / 2, com o perímetro e a área calculados pelas
  mesmas primitivas do teste (`perimetroDaForma`, `areaDaForma`).
- Fica igual: o volume conservado (com seu limite próprio por K), as cotas em ordem e as demais asserções.

## Topologia equivalente por região (2026-11-05)

Aplica-se à comparação de regiões (B1 em `kernelComparaB.ts`, regra com `k0049`; e as regiões/silhuetas de A3c em `kernelComparaA3c.ts`,
`regiao0049`). A tolerância base de 1e-6 m² e o limite por perímetro não mudam.

- Origem: na semente 43 o TypeScript devolve um anel único que toca a si mesmo (representação inválida, com a fenda do furo no contorno), e o
  Rust devolve o contorno externo com o furo (válido). A região é a mesma: a área líquida bate a 5e-7 m² ou menos. A regra "sem par, furo
  acima do fiapo" falhava por causa da representação, não da região.
- Regra: quando a topologia (nº de peças e de furos significativos) diferir entre o Rust e o TypeScript, a comparação passa a ser pela
  REGIÃO. A diferença simétrica da região já precisa estar dentro do limite da 0049 (`1e-5 + K x perímetro x 1e-6`, com K = 6, o mesmo que o
  comparador aplica); se estiver, a diferença de topologia é aceita como REPRESENTAÇÃO. Se não estiver, a falha permanece.
- Condição: a regra só vale se o resultado do Rust for VÁLIDO (`resultadoRustValido`): cada anel é simples (sem vértice repetido fora de sequência no
  mesmo anel, sem aresta tocando outra não adjacente do mesmo anel, nem cruzamento próprio entre anéis do mesmo polígono; vértices
  repetidos seguidos são aresta de comprimento zero e não contam), e cada furo está dentro do
  anel externo (teste de ponto num ponto interior do furo). Se o Rust for inválido, a falha permanece e a mensagem diz "resultado do Rust
  inválido".
- Não se aplica: quando as topologias são iguais (a regra geral e a equivalência por componente continuam como estavam), nem quando a
  diferença simétrica passa do limite. Nenhuma tolerância é relaxada.

## Altura de faixa medida só com peças de área real (2026-11-05)

Aplica-se à medida de altura (cota z) das faixas de parede no comparador: `diffCelula` do diagnóstico (`tmp-equiv-junc/comum.ts`) e
as cotas de `compararB3` em `kernelComparaB3.ts`. O limite de 1e-6 m² e as demais tolerâncias não mudam.

- Regra: a altura de uma faixa é o mínimo de z0 e o máximo de z1 SOMENTE entre as peças com área maior que 1e-6 m² (`areaDaForma`). No comparador de faixas (`compararB3`), as cotas que definem as amostras verticais só entram quando a peça tem área real. Se não houver peça acima de 1e-6 m², a faixa não tem altura medida e não compara.
- Motivo: resíduos de arredondamento de área menor que 1e-6 m² não são material. Uma peça de área zero (ou de 1e-7 m²) com cota diferente da peça real (por exemplo 3,00 x 2,88) fazia a medida usar uma cota que não existe na região; foi a origem dos 24 casos de "0,12 m" nos projetos sem-titulo-8, -9 e -10.
- Não muda: a comparação de REGIÃO e de VOLUME continua com todas as peças, inclusive as de área menor. Só a medida de altura muda.
