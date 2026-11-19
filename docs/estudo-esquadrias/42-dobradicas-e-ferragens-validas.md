# Dobradiças e ferragens em posição válida (contrato, colocação e testes)

Data: 2026-11-19. Continua `37` (portas com forma, `acomodaAoContorno`), `39` (caixilho contínuo e compatibilidade) e `41` (cortes e elevações). Marcas: [V] verificado nesta sessão (código lido, teste rodado ou captura vista); [G] derivado por geometria; [I] inferência ou decisão a validar. Branch `claude/lucid-bell-hwk4ln`.

## 1. O relato e a causa

Relato: "colocar teste também nas posições de dobradiças para nunca ficarem em posição errada, precisa ficar em posição válida, por exemplo ogival (muito triangular) dependendo ela sai da posição e se separa da porta".

Causa [V]: a correção do `37` (`acomodaAoContorno`) deslocava a dobradiça "o mínimo em z" até os quatro cantos caberem no contorno. Isso só garante estar DENTRO do contorno, não estar PRESA: num ogival agudo, numa empena triangular ou num círculo a aresta da folha do lado do eixo deixa de ser vertical (ou deixa de existir naquela altura), e a dobradiça, que mantinha o t original, ficava no ar fora da folha, ou metade fora dela. Achado de brinde [V]: o agrupamento da maçaneta exigia `!p.profile`, e todas as peças da maçaneta (roseta, haste, alavanca, bola, placa) trazem `profile`; então a maçaneta NUNCA era deslocada. Nas capturas, em ogival e em empena triangular a roseta, a alavanca e a placa da fechadura ficavam penduradas fora da folha, sobre a parede (`ANTES`, §6).

## 2. Contrato de posição válida [V: implementado em `openingFerragemContrato.ts`, testado em §5]

Tolerância de contato e de contorno: 1 mm. "Folha" = peças `role 'leaf'` da mesma folha (as quatro barras de uma porta de vidro contam; vidro e almofada não). "Batente" = peças de material `frame` e papel `jamb`, `head`, `mullion` ou `transom` que estão dentro do contorno (um batente que o recuo recusou, ver §7, fica retangular fora dele e não conta).

Dobradiça (`hinge-<folha>-<k>`):

| | Regra |
|---|---|
| (a) contorno | os quatro cantos da caixa dentro do contorno da esquadria (1 mm) |
| (b) folha | folga 3D entre a caixa e a folha <= 1 mm (a folga em `s` entra: dobradiça atrás da folha não encosta) |
| (c) batente | folga 3D ao batente <= 1 mm (quando o modelo tem batente ou divisor) |
| (d) aresta | em toda a altura da dobradiça mais 2 cm em cada ponta a folha existe com largura >= 6 cm (a aresta de articulação existe ali) |
| (e) distribuição | espaçamento entre dobradiças >= 2 x altura da dobradiça (0,20 m), distribuição regular (passos iguais a 1 mm), quantidade igual à do vão retangular ou reduzida COM aviso (`ferragemAvisos` e `openingShapeIssues`) |
| (f) lado | do mesmo lado do eixo que no vão retangular (`flipHand`) e sobre a aresta da folha DESSE lado (extremo da fatia da folha na altura da dobradiça a <= 5 cm) |

Maçaneta (roseta, haste, alavanca, bola, placa da fechadura, puxador): (a) todos os pontos dos perfis dentro do contorno; (b) todos os pontos sobre a folha (folha, vidro e almofada do mesmo `leaf`), e as peças que encostam na face da folha (roseta, placa, base do puxador) sobre a MADEIRA da folha, não sobre o vidro; (c) uma peça do conjunto encostada na folha (folga 3D <= 1 mm); ou a maçaneta sai com aviso (`colocado: 0`). A altura é a do tipo (~1,00 m), limitada ao trecho da folha naquela posição lateral.

Outras ferragens: o motor só tem dobradiça e maçaneta (`PartRole` não tem fecho, trinco nem ferrolho) [V: grep]. O trilho (`track`) tem tratamento próprio (`openingModelContornoCorrer.ts`) e não é ferragem de folha.

## 3. Regra de colocação [V: `openingModelFerragem.ts`, `openingModelFerragemMacaneta.ts`]

Substitui o deslocamento "o mínimo em z" do `37` (removido de `acomodaAoContorno`, que agora só trata as barras com perfil). Roda no fim de `contornoDoModelo`, depois do recorte das peças: a folha que ela vê é a final (prisma `tz` recortado pelo contorno).

Dobradiça, por folha:
1. Trecho válido, em duas fases, amostrado de 5 em 5 mm.
   - Fase 1, eixo vertical: o eixo é o da posição original (o pivô da folha). Vale a altura `z` em que a aresta da folha do lado do eixo cai dentro da largura da dobradiça (+-6 mm) em toda a janela de +-meia altura da dobradiça. É o caso das ombreiras retas (arcos abaixo do arranque, empena abaixo do arranque).
   - Fase 2, acompanha a aresta: onde a aresta é inclinada ou curva (ogival agudo, círculo, trapézio, polígono, empena triangular), a dobradiça fica centrada na aresta da folha NA ALTURA dela (o ponto da folha mais próximo do eixo), desde que a aresta varie até 4 cm na janela da caixa. O pivô do giro da folha não muda; a dobradiça da fase 2 é uma ferragem de aresta inclinada [I: a leitura do `39` §3.1 para trapézio e polígono, "o eixo toca um ponto da aresta, abertura limitada"].
   - Nas duas fases: a folha tem >= 10 cm de largura na altura; a caixa cabe no contorno; encosta na folha (<= 1 mm) e a <= 3 cm do batente. Sem batente (porta de vidro) a borda da folha pode estar sobre o contorno, e o centro entra para a folha até 3 cm para a caixa caber.
   - O trecho é a maior corrida de alturas válidas, menos 3 cm em cada ponta (folga das pontas).
2. Alturas. Se as alturas originais do tipo cabem no trecho da fase 1, ficam como estão. Senão distribuem-se com passos iguais entre a de baixo (a original, quando cabe) e a de cima (a mais alta que cabe), com espaçamento >= 0,20 m. Capacidade = `floor(comprimento / 0,20) + 1`; vale a fase com mais capacidade (a fase 1 se empata). Se o trecho não comporta o número pedido, `hinges` cai para a capacidade e entra o aviso; sem trecho nenhum, nenhuma dobradiça e `colocado: 0`.
3. Fechamento de contato, só nesta etapa (o vão retangular não muda): se a caixa fica a mais de 1 mm da folha em `s` (a dobradiça de porta de vidro nasce na face da parede, 64 mm atrás da folha: achado §7), ela desliza em `s` até sobrepor 2 mm a face da folha; se fica a mais de 1 mm do batente em `t` (vai-e-vem: 18 mm de folga no retangular) ou em curva (arco acima do arranque), a caixa estica em `t` até o batente, como uma cinta, sobre a linha de altura em que o batente chega mais perto.

Maçaneta: o conjunto anda INTEIRO (todas as peças com o mesmo deslocamento, inclusive o perfil `tz`, `sz` e `ts`). Procura de menor deslocamento: (1) onde está; (2) só a altura, no trecho da folha naquela posição lateral; (3) o `t` (de preferência para o centro da folha, mas também para o montante, quando é nele que a madeira está) e a altura, em passos de 1 cm e refino de 2,5 mm. Sem posição, a maçaneta sai e o aviso fica.

Aviso: `OpeningModel.ferragemAvisos` (`{ tipo, folha, pedido, colocado }`, só com forma e só quando algo foi reduzido) alimenta `openingShapeIssues` (`openingFerragemIssues.ts`): códigos `ferragem-dobradicas-reduzidas` e `ferragem-macaneta-removida`, severidade `warning`, chaves `egb_issue_opening_hinges` e `egb_issue_opening_handle` em pt, en, es, de, fr, it e pl (`i18nMessages.ts` e `apps/web/.../areas/packages-engine.ts`).

## 4. Resultados da varredura [V: rodado]

Varredura (`openingFerragemContrato.test.ts`): 162 tipos do catálogo, os 63 com dobradiça e os que têm só maçaneta, x 14 formas (os 9 tipos, com parâmetros extremos: abatido de flecha 5 cm e de w/2; ogival 0,87 w, 1,5 w, 2 w e 3 w (limitada à altura menos 12 cm); círculo; ferradura de pescoço 0,5 w; empena em casinha e em triângulo (cumeeira = altura); trapézio de topo 60 % e 8 %; polígono pontudo) x os dois lados do eixo x (nas formas mais agudas) as duas faces. Operação incompatível (`shapeCompat`, `39`) sai fixa e a varredura confere que não sobra ferragem. Mais as proporções extremas (50 cm, 70 x 240, 140, 90 x 170, 90 x 300, 120 x 120) em 6 tipos x 14 formas, e a divisão decorativa em leque nos três estilos de maçaneta (`lever`, `knob`, `pull`). Resultado: 0 violação do contrato; nenhum modelo lança; o vão retangular segue idêntico ao sem forma (JSON) nos tipos com ferragem.

Quantas dobradiças cabem (6 tipos x 6 proporções, 3 pedidas ou 6 nas portas duplas): em arco pleno, abatido, ogival até 2 w, círculo, empena (casinha e triângulo) e trapézio de topo 60 % TODAS as pedidas se prendem, em geral; as reduções com aviso concentram-se no trapézio de topo mínimo (8 %, onde a folha vira quase um triângulo estreito) e, em 1 caso de cada, no ogival 3 w e no polígono pontudo. Isso é a regra "nunca solta" funcionando: a alternativa seria deixar a dobradiça no ar.

Medido antes da regra (hinge com o deslocamento só em z) [V, contagem rápida na varredura inicial]: lado do eixo trocado ou solta da folha/batente em dezenas de casos; maçaneta solta em 60 (ogival e empena agudos; porta de vidro pivotante com o puxador sobre o vidro).

Casos de regressão nomeados (`openingFerragemRegressao.test.ts`): ogival muito triangular (flecha 2 w e 3 w, dois lados do eixo: 3 dobradiças, presas à folha e ao batente, distribuição regular e >= 0,20 m); porta estreita de 50 cm em ogival 3 w; empena triangular (as dobradiças acompanham a aresta inclinada e a folha tem >= 10 cm de largura em cada uma); círculo; trapézio de topo mínimo; ferradura (porta de giro sai fixa sem ferragem; pivotante com maçaneta presa); aviso em 7 idiomas (porta de vidro em trapézio de topo mínimo: 2 de 3 dobradiças e maçaneta removida); e a geometria de contato (`distRetAnel`, `fatiaEm`, folga em `s`).

## 5. Arquivos

- Novos (engine): `openingFerragemGeom.ts` (distância retângulo x anel, fatias, contorno), `openingModelFerragem.ts` (dobradiça), `openingModelFerragemMacaneta.ts` (maçaneta), `openingFerragemContrato.ts` (verificador do contrato), `openingFerragemIssues.ts` (aviso), `openingFerragemCenas.ts` (cena e formas dos testes), `openingFerragemContrato.test.ts` (varredura), `openingFerragemRegressao.test.ts`.
- Alterados: `openingModelContorno.ts` (chama a colocação), `openingModelContornoAjuste.ts` (sem ferragem), `openingModelTypes.ts` (`FerragemAviso`, `ferragemAvisos`), `openingShapeIssues.ts`, `i18nMessages.ts`, `apps/web/src/editor/i18n/areas/packages-engine.ts`, `openingModelContorno.test.ts` (a comparação de corte a 1 m não inclui as dobradiças, que se redistribuem sob o arco).

## 6. Verificação visual [V: capturas lidas]

Build do app antes (`HEAD` sem a mudança) e depois, servidos em portas separadas, Chromium via Playwright, vista 3D, parede de 6 m com uma porta ogival de flecha 1,98 m (largura 0,90 m, altura 2,10 m, 3 dobradiças) e uma empena triangular (flecha = altura), pela face das dobradiças. Capturas em `<scratchpad>/shots/`: `y0-*` (antes) e `y1-*` (depois): `ogival-costas`, `ogival-dobradicas`, `ogival-topo`, `empena-costas`, `empena-dobradicas`, `empena-topo`.

- Ogival muito triangular, antes: a dobradiça de cima fica na aresta curva da folha, atravessando-a (metade fora); a roseta, a alavanca e a placa da fechadura saem da folha pela esquerda. Depois: a dobradiça de cima está inteira sobre a folha, mais alto na aresta (onde a folha ainda tem >= 10 cm), a do meio mais para dentro do arco, a maçaneta inteira sobre a folha.
- Empena triangular, antes: a maçaneta inteira (roseta, alavanca e placa) fica FLUTUANDO fora da porta, sobre a parede; as dobradiças encostam na aresta inclinada por acaso. Depois: a maçaneta está sobre a folha, e as três dobradiças acompanham a aresta inclinada, presas à folha.

## 7. Limites e pendências

- [V] Achados no vão retangular, NÃO alterados (a prova "retangular idêntico" fixa o modelo): a dobradiça da porta de vidro (`ot_pvid*`, `ot_pgiro_*_vid`, `ot_pgiro2_*_vid`) nasce na face da parede, a 64 mm (em `s`) da folha, sem tocá-la; a do vai-e-vem (`ot_pvv90`, `ot_pvai*`) fica a 18 mm da ombreira; a maçaneta da pivotante de vidro (`ot_ppiv_*_vid`) tem o puxador sobre o vidro, 15 mm acima dele. Com forma, a colocação fecha esses contatos (§3 item 3). Decisão pendente do coordenador: corrigir também na origem (`addHinges`, `buildDoubleAction`, `addHandle`).
- [V] Trapézio de topo mínimo (8 % da largura) e polígonos em que a faixa do batente colapsa: `poligonal` deixa o batente como era (ombreiras retangulares fora do contorno, regra de `32`). A dobradiça não se prende a esse batente (não conta como batente), só à folha; o contrato (c) fica vazio nesses casos. Não corrigido aqui.
- [I] Fase 2: a dobradiça numa aresta curva ou inclinada é uma caixa vertical de 12 x 100 mm centrada na aresta; o pivô do giro continua no eixo original, então uma dobradiça fora do eixo é só visual. Se for preciso construtivamente, a leitura real é a do `39` §3.1: porta com aresta inclinada tem abertura limitada.
- [I] "Vão com roseta" foi lido como (i) a roseta da maçaneta (peça `rosette`) e (ii) a divisão decorativa do vidro (leque). Se o pedido era outro desenho (óculo com roseta), indicar.
- [I] As dobradiças se redistribuem sempre que a de cima não cabe (a do meio sai da altura do catálogo); no arco pleno de uma porta de 2,10 m, as três ficam em 0,26 / ~0,9 / ~1,55 m em vez de 0,26 / 1,03 / 1,81 m.
- [I] A porta dupla com ogival agudo: a folha de cada lado estreita no topo e a dobradiça de cima fica na aresta curva, onde a folha tem >= 10 cm; confirmado só por geometria e pelas capturas de folha simples.
- [I] Janelas: não têm dobradiça no motor (`hinges` só em porta de giro, dupla e vai-e-vem); a maçaneta de janela, quando existe, passa pelo mesmo contrato.
- O desempenho da varredura completa é de ~140 s (31 testes) [V].
