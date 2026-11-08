# Decisão 0054 — Término por camada da parede (piso e laje) e faixa real da parede com topo anexado

Data: 2026-11-07. Aprovada pelo dono. Continua as decisões 0023 §2, 0025 e 0027. (Os números 0051 a 0053 já estão tomados por planos do kernel em outras branches; no código e nos comentários a regra aparece como "decisão 0054".)

**1. O que é.** Uma camada de piso ou de laje ganha o término `{ camada: { funcao, lado, face, cm } }`: ela para numa camada da parede, escolhida pela função
(`structure`, `substrate`, `thermal`, `membrane`, `finish1`, `finish2` ou `eixo`), pelo `lado` da parede em relação à laje (`proximo` = o mesmo lado da laje,
`distante` = o oposto), pela `face` dessa camada (`proxima` = a voltada para a laje, `meio`, `distante`) e por um deslocamento `cm` (positivo avança para dentro
da parede, negativo recua). Vale para toda parede que a camada toca, as internas e as do perímetro externo, sem marcar parede por parede, e igual para laje
vinculada e não vinculada. As variantes antigas (`auto`, `face`, `nucleo`, `passa`, `{ ate }`, `{ cm }`) seguem como estavam; projeto antigo abre igual, exceto pelo
efeito do item 4.

**2. Semântica.**
- Tudo se mede em profundidade `d` a partir da face externa da parede (`layerSpans`). A laje fica do lado externo (`d` pequeno) ou do interno da parede, e a mesma
  parede pode ter laje dos dois lados. O lado é achado pela geometria: compara-se, nos dois lados da parede, a fração da faixa de 5 cm colada à face que o contorno de partida
  cobre. O lado de MAIOR fração é o lado da laje; faixa inteira coberta dos dois lados (diferença booleana vazia, laje contínua sobre a parede) ou frações
  exatamente iguais contam como laje dos dois lados. Não há área mínima nem tolerância: um excesso sub-micrométrico da laje para o outro lado (laje estática
  que passa 3e-7 m da face) não conta como presença, porque o outro lado cobre mais. Só o trecho do eixo em que a laje está colada recebe a regra.
- Lado: a parede é dividida ao meio da espessura total. `proximo` é a metade do lado da laje, `distante` a oposta. A camada pedida é a primeira daquela metade, a
  partir da face dela. A camada que cruza o meio conta nas duas metades (tolerância 1e-9 m).
- `eixo` é a linha de centro da espessura total da parede (não a linha de localização); `face` é ignorada nele, o `cm` vale.
- A borda da camada da laje fica na face pedida, somada ao `cm`. A camada da laje ocupa da face da parede do lado dela até a borda (avança sobre a parede); o que
  fica além da borda, no trecho de presença, sai da camada (laje estática ou de perímetro que cobria a parede). Recuo além da face tira da camada a faixa que sobra
  antes da parede. A faixa de avanço passa das pontas da presença pelo próprio avanço, para o canto em esquadria não ficar com entalhe, mas só na ponta que cai a menos de duas espessuras do fim da zona da parede (o canto); a ponta que termina no meio da parede (laje que acaba na junção em T) não ganha extensão, senão nasce uma ponta de cerca de 10 cm dentro da parede externa.
- Vão de porta que chega ao topo da camada continua como na 0025: a parede não é cortada ali.
- Na região que a camada atravessa, a camada da laje vence: a junção recorta as camadas da parede nessa faixa de cota (`venceParede` em `winsOver`), e o volume
  conta para a laje, sem duplicar nas quantidades. As camadas da parede que a laje não alcança ficam inteiras.
- Sem a função pedida na metade pedida: a busca segue em direção ao lado oposto pela parede toda, e a borda vai para a primeira camada com a função; sem a função em
  parte alguma, vale a primeira camada da metade pedida. Nos dois casos há AVISO (`termino-camada-sem-funcao`, com o id do elemento e o da parede), nada silencioso.
  O aviso usa o contorno resolvido do elemento como partida (só depende do tipo da parede e do lado).

**3. Onde mora.** Modelo: `LayerTermino`, `TerminoCamada`, `FuncaoRefParede` (`packages/model/src/types.ts`), validação em `termino.ts`. Referência TS:
`terminoCamada.ts` (`regionCamada`, `bordaDaCamada`), `layerOutline.ts`, `junctionPlanar.ts` (`venceParede`), `terminoCamadaAvisos.ts`. Rust (`crates/geom-wasm`):
`b2.rs` (`regiao_camada`, `borda_da_camada`), `b1.rs` (`Termino::Camada`), `b3.rs` (`vence_parede`). Esquema 13: a coluna `termino_ref` de `camadas_piso` e
`camadas_laje` (`funcao + 7 * (lado + 2 * face)`, só com `termino` = 6, que leva os cm em `termino_valor`); a coluna `explicita` das saídas vale 0, 1 ou 2 (2 =
explícita e vence a parede). `VERSAO_MOTOR_GEOMETRIA` passa a 5 (a geometria de pisos, lajes e paredes muda de resultado nos projetos com topo anexado, item 4).

**4. Correção: a parede com topo anexado usa a faixa REAL.** `wallTouchesZone` (e `ParedeDoNivel::toca` no Rust) usava a faixa NOMINAL (`nominalZ0` a `nominalZ1`)
para a parede anexada a telhado ou a laje, pensando na camada que o término esvazia. O efeito era bloquear camadas de piso e de laje acima do topo real da parede,
onde ela não existe. Agora vale a cota real (`baseZ` até `baseZ + height`, com 1 mm de folga) e, com perfil de topo ou de base (parede reta, `profileTop`,
`topProfile` do modelo, `profileBottom`), o perfil por trecho do eixo (`trechosReais`): a zona da parede entra só nos trechos em que ela alcança a camada. O
mesmo vale em `regionMinusWalls`, `regionPlusWalls` e no término por camada. Por quê: a parede só pode bloquear a camada onde existe de fato; a faixa nominal só
fazia sentido enquanto a cota anexada dependia das próprias camadas (ciclo que a variante `flatAttach` já evita). `nominalZ0` e `nominalZ1` continuam em
`ResolvedWall` (a comparação do kernel e a UI os leem), mas o término não os usa mais.

**5. Fora de escopo e em aberto.** Parede curva entra pela faixa amostrada do arco (mesmo passo de `passoDoArco`); perfil só em parede reta. Os textos do aviso estão
embutidos em português e inglês em `terminoCamadaAvisos.ts`; migrar para as chaves de i18n é com a interface.
