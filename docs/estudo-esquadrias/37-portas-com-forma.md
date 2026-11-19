# Portas (e janelas) com forma: nenhuma peça some, só o contorno acompanha

Data: 2026-11-19. Continua `28` (peças em vão com forma), `32` (formas novas) e `34` (interface das formas). Marcas: [V] verificado nesta sessão (código lido ou teste rodado); [I] inferência ou decisão a validar.

## 1. Relato

"As portas são apenas simples, não existe mais aqueles formatos diferentes; ao mudar o formato elas ficam todas com chapa única e as configurações não parecem funcionar." Lido como: ao dar uma forma (arco etc.) ao tipo, a folha vira chapa lisa e os controles do diálogo (estilo da folha, vidro, ferragens, bandeira, abrir/correr) parecem sem efeito.

## 2. Reprodução (162 tipos x arco pleno, abatido, ogival, círculo) [V]

Medido com o catálogo `DEFAULT_OPENING_TYPES` (162 tipos), cada tipo montado sem forma e com cada forma (`buildOpeningModel`, parede de 4 m, vão a 2 m).

### 2.1 O que NÃO é a causa [V]

- O diálogo não mexe em nenhum outro campo ao escolher a forma. `withShapeKind` só escreve ou apaga `shape`; `withShapeNumber`, `withPolygon*` idem. Teste nos 162 tipos: `semForma(withShapeKind(t, k)) == semForma(t)` para as 4 formas, e voltar a "Retangular" devolve o tipo original (`openingTypeShapePreserva.test.ts`).
- O catálogo de estilos de folha continua na aba "Folha" com e sem forma: os mesmos rótulos e as 5+ opções (`flush`, `panel`, `glass`, `louver`, `grille`). Só as miniaturas mudam, de propósito, porque desenham a forma. Comparado com `origin/main`: os painéis de folha e `openingSupport`/`openingStyle` não foram alterados pelas etapas de forma (o diff do diretório do diálogo contra `main` só traz o painel da forma, o bloqueio do salvar e os campos de assentamento).
- O motor não troca a folha por chapa: `contornoDoModelo` é um pós-processo do modelo completo e mantém folha, almofadas (`leafPanel`), vidros, divisões, baguetes, ferragens e batedor. Em `ot_pgiro90` (almofadada) com arco pleno: `leaf`, 4 `leafPanel`, 8 `handle` e 3 `hinge` iguais aos do retangular; as almofadas que o arco cruza viram prismas `tz` recortados, as outras ficam como eram. Estilo da folha, maçaneta, número de dobradiças, número de folhas, bandeira e abrir/correr continuam alterando o modelo com forma (teste "cada controle do diálogo").

### 2.2 O que se perdia de fato [V]

Antes da correção, contando por tipo e forma (162 x 4):

| Perda | Onde | Causa |
|---|---|---|
| Folha inteira some | porta de embutir (`ot_pembutir80/90`, arco/abatido/ogival) e portão de correr 3 m (`ot_pg300`: 5 folhas e 5 almofadas) | `clipDeslizante` intersecta a região com ela mesma deslocada pelo curso inteiro; a folha larga não cabe sob o arco nas duas pontas, a interseção dá `[]` e a peça sai |
| Travessa superior/inferior da folha de janela some | janelas de correr e de abrir (`ot_j120`, `ot_j150`, `ot_j200`, `ot_j240`, `ot_jg90`, `ot_jc4_*`) | o recuo do arco (`H - topo da folha`) consome a faixa fina e `recortada` devolve `[]`; no círculo o mesmo acontece com as travessas de baixo e o trilho do piso |
| Divisor (`mullion`) e travessa (`transom`) com perfil em T | `ot_plat*`, `ot_pband*`, `ot_ppainel_90`, `ot_jabr_fa*`, `ot_jband_*`, `ot_pcorrer_band*` | peça com `profile` (não `tz`) saía do recorte intacta: ficava para fora do arco, ou do círculo |
| Dobradiça fora do contorno | 66 casos nos arcos (a de cima de uma porta de 2,10 m com arco de 0,45 de raio fica a ~0,2 m fora do arco) e quase todas no círculo | ferragens "ficam fora do contorno" (comentário de `openingModelContorno.ts`) e nada as trazia para dentro |

Nada disso afeta o vão retangular (peças idênticas, ver §4).

## 3. Correção [V]

Regra: a esquadria com forma mantém TODAS as peças do retangular; só o contorno externo muda. Uma peça só sai se a caixa dela cai inteira fora do contorno bruto (área da interseção < 20 cm2, ex.: trilho do piso e travessa de baixo de um círculo).

1. `recortada` (`openingModelContorno.ts`), valendo para os arcos, o círculo e as formas retas (mesma função): escada de recursos em vez de apagar. (a) região recuada, na posição fechada (peça que desliza: arco sem prateleira, região convexa); (b) o contorno com recuo só lateral (e 1 mm de margem de arco, por dentro das cordas); (c) o contorno bruto. `[]` apenas quando nem (c) deixa área. Revisado em 2026-11-19 (ver §5): o curso deixou de entrar no recorte.
2. `openingModelContornoAjuste.ts` (novo), `acomodaAoContorno`, aplicado no fim de `contornoDoModelo` para qualquer forma:
   - barras com perfil de seção (`mullion`, `transom`, `muntin`, `bead`, `track` com `profile` `ts` ou `sz`): a caixa é encurtada, por ponta, até os cantos caberem na região recuada do batente; o perfil e o `plane` ficam como são (a geometria 3D extruda a seção entre `box.z0..z1` ou `box.t0..t1`);
   - dobradiça e maçaneta: andam o mínimo em z (e em t, para o centro, só se preciso: círculo) até os quatro cantos caberem no contorno bruto; a maçaneta anda inteira (roseta, haste, alavanca, fechadura, as duas faces com o mesmo deslocamento). O pivô da folha (eixo vertical) não muda.
3. Nada mudou no diálogo: ele já preservava os campos (§2.1). O teste de regressão fixa isso.

## 4. Testes [V]

Atualização 2026-11-19: `openingModelContornoLacunas.test.ts` verifica "dentro do contorno" na posição FECHADA (não mais em todo o curso) e ganhou o bloco "porta de correr em arco": cobertura das folhas fechadas sem lacuna (< 20 cm2) em `ot_pcorrer160`/`180` com arco pleno, abatido e círculo, nenhuma folha ou vidro sumindo, e o curso aberto passando do arco (decisão fixada em teste).

- `packages/engine/src/openingModelContornoPreserva.test.ts` (162 tipos x arco pleno, abatido, ogival e círculo):
  - nenhuma peça some, por id, salvo as que ficam inteiras fora do contorno e, no círculo, as molduras (`jamb`, `head`, `sillFrame`, alizar) que viram as metades do anel `frame-ring` (exigido: pelo menos 2);
  - todas as peças `glass`, `leaf`, `leafPanel`, `muntin`, `bead`, `mullion`, `transom`, `handle` e `hinge` com os cantos (ou o prisma `tz`) dentro do contorno da esquadria, com tolerância de 2 mm (flecha da corda do contorno amostrado);
  - o vão retangular (forma ausente ou `rect`) idêntico byte a byte ao sem forma, nos 162 tipos;
  - volume total coerente (nunca acima de 1,35x o do retangular, e acima de 0,35x nos arcos);
  - casos de referência (almofadada, embutir, portão de correr, dobradiça) e "cada controle do diálogo altera o modelo com forma": estilo da folha (5 estilos geram 5 conjuntos de peças diferentes nas 4 formas), maçaneta, dobradiças, número de folhas, bandeira, giro/correr.
- `apps/web/src/ui/dialogs/openingType/openingTypeShapePreserva.test.ts`: o diálogo só escreve `shape` (162 tipos x 4 formas, ida e volta a Retangular) e a aba Folha lista os mesmos estilos com e sem forma.
- Os testes existentes de contorno (`openingModelContorno*.test.ts`, `openingShape*`) seguem passando.

## 5. Decisões e pendências

- [I] "Nada some" tem uma exceção legítima: a peça cuja caixa cai fora do contorno (a travessa de baixo de uma janela circular encosta num ponto da elipse). Conservá-la seria deixar uma peça flutuando fora do vão.
- [V] Folhas de correr (e o vidro, as travessas e os montantes que correm com elas): recortadas pelo contorno NA POSIÇÃO FECHADA, igual à folha fixa. Decisão do coordenador, que substitui a regra anterior ("dentro do contorno em todo o curso", interseção do contorno com ele mesmo deslocado pelo curso, `clipDeslizante`, removida). Motivo: essa interseção cortava o canto da folha junto ao eixo e deixava um vazado visível entre as duas folhas da porta de correr fechada (`38` §5). Consequência aceita: com a folha aberta, a parte dela que passa do arco corre por trás/à frente da parede (a esquadria de correr corre, aberta, além do contorno do arco (a posição aberta não é recortada; a relação com o plano do vão não foi verificada [I]); no 3D a folha aberta pode sair do contorno). O trilho continua acompanhando o contorno. Nenhuma peça some (a travessa fina de cima também fica, agora recortada só na posição fechada).
- [V] Medida (`ot_pcorrer160`/`ot_pcorrer180`, as duas folhas fechadas; "ideal" = caixa da folha retangular interseção o contorno recuado como a folha se recua; amostragem 400x400):

  | forma | ideal | vazio antes | vazio depois |
  |---|---|---|---|
  | arco pleno 160 | 3,029 m2 | 0,074 m2 (2,4%; x 0,03..0,37, z 1,62..2,09) | 0,000 m2 (100% coberto) |
  | abatido 160 | 3,207 m2 | 0,025 m2 (0,8%) | 0,000 m2 |
  | círculo 160 | 2,519 m2 | 0,192 m2 (7,6%) | 0,000 m2 |
  | arco pleno 180 | 3,372 m2 | 0,098 m2 (2,9%) | 0,000 m2 |
  | abatido 180 | 3,607 m2 | 0,030 m2 (0,8%) | 0,000 m2 |
  | círculo 180 | 2,839 m2 | 0,226 m2 (8,0%) | 0,000 m2 |

  O vazio de antes ficava sempre na folha da direita, entre o eixo (x = 0,03) e x = 0,37-0,43; depois, as duas folhas fechadas cobrem o contorno recuado sem lacuna (a sobreposição normal entre folhas é de 6 cm, x -0,03..0,03). A área da folha cresce na proporção (`ot_pcorrer160`, arco pleno: folha + vidro de 3,053 para 3,163 m2).
- [I] A dobradiça deslocada deixa de coincidir exatamente com a posição do catálogo (`hinges` ainda controla quantas são); a posição relativa entre elas muda no arco, como ocorre numa porta real que tem a dobradiça de cima mais baixa sob o arco.
- [I] A causa do relato "chapa única" não foi reproduzida como descrito no `HEAD` (1def72ae): o que existe é a perda de peças da §2.2. Se o aplicativo testado vinha de outra revisão (a mescla em andamento no diretório principal), vale rever o relato depois dela.
