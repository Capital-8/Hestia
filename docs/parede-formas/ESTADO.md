# Parede com formas, inclinada e com perfil: estado

Branch `frente/parede-formas` (sobre `integracao/massa-suplementos`). Manual: [METODOLOGIA.md](METODOLOGIA.md). Modelos: só haiku 5.5 high ou sonnet 5.5 medium (nunca fable/opus sem aprovação do dono). O dono delegou as decisões ao fiscal: sempre a opção mais profissional, registrada aqui.

## Spikes
| Spike | Resultado | Decisão |
|---|---|---|
| S2 arcos tangentes | aprovado (13 testes); área com tol 5e-4 (discretização em cordas, medido 1,3e-4) | sem F1.5; junção `butt` e tipos diferentes ficam para os testes da F1.6 |
| S3 ajuste a arcos | aprovado 9/9; elipse 16 arcos, desvio 4,94 mm; spline de 8 pontos com r ≥ 1 m usa 32 arcos (a Catmull-Rom se afasta do círculo ~8,5 mm/m) | `fitArcs` promovido a definitivo (F1.1 feita). Círculo e elipse usam forma própria, spline é só "pelos pontos clicados" |
| S4 abertura inclinada | parcial: modo inclinado ok; vertical dá recuo negativo | decisão E1 abaixo |
| S1 junção inclinada | reta×reta aprovado (20 testes; volume exato 1,7e-15; 0,4 a 0,7 ms/par); arco reprovado (erro de volume até 6,7%; nenhum N ≤ 32 garante < 1 mm) | decisão E4 abaixo |

## Decisões (E = emenda)
- **E1 (S4):** modo "inclinado" em reta e em arco dentro de w² ≤ 0,4·R (fora: aviso e modo vertical); modo "vertical" com o caixilho ANCORADO NA FACE da parede (recuo ≥ 0 por construção); teste de recuo ≥ 0 nos dois modos. Padrão: janela inclinada, porta vertical.
- **E2:** junções existem em TS (`joins.ts`) e em Rust (`juncoes.rs`, porte); mudança de junção vale nas duas, com teste de paridade. O corte do vão é TS (`openingCut.ts`), o Rust só espelha.
- **E4 (S1):** junção inclinada exata em reta×reta (dois níveis + faces regradas). Arco inclinado: plano B, corte de topo simples com aviso `arcoInclinadoSemJuncao`; a junção exata cone×plano em arco vira ficha de dívida D1 depois da Fase 2. Validação obrigatória na F2.1/F2.4: tilt×altura×comprimento, porque 26% dos pares retos do fuzz têm o cruzamento dos eixos fora da parede (inviáveis); o comando recusa com mensagem traduzida em vez de gerar geometria inválida.
- **E3:** o dono não quer aceites intermediários; o fiscal segue as fases sem parar, relatando só marcos e problemas reais.

## Fichas
| Ficha | Estado |
|---|---|
| F1.1 `fitArcs` | feita (spike S3 mesclado) |
| F1.2 formas → paredes | feita |
| F1.3 modos no `wallTool` | feita |
| F1.4 barra de opções, faixa, i18n | feita |
| F1.6 matriz de modificar | |
| F1.7 portas, IFC, e2e | |

## F1.2/F1.3
- `wallShapes.ts` (puro): polígono (3 a 64 lados, inscrito/circunscrito), círculo (2 arcos, |sag|=r), elipse e spline via `fitArcs`; contornos fechados saem HORÁRIOS (face externa à esquerda de a→b, `flipped=false`), diferente do retângulo (anti-horário + `flipped`). Degenerado devolve `[]`.
- Modos `polygon|circle|ellipse|spline` em `wallShape`; opções novas opcionais `wallPolygonSides` (6), `wallPolygonCircumscribed` (false), `wallFitTol` (0,005); a F1.4 liga a barra a elas.
- Cada forma = UMA transação (um desfazer); qualquer lado curto (<1 cm) ou sobreposto recusa a forma inteira (decisão 0044). Esc cancela; elipse = centro, ponta do semieixo, ponto do outro semieixo; spline = cliques, Enter termina aberta, clique no 1º ponto fecha.
- Prévia de spline usa tol >= 2 cm e 16 arcos (o ajuste final custa ~1 s); mensagens novas em português literal, sem chaves i18n (F1.4).
- Fora do escopo: `packages/geom/src/index.ts` ganhou `export * from './curveFit.ts'` (fitArcs não era exportado).

## F1.8
- Custo estava em `distPoli` (128 segmentos por ponto de arco, ~66 pontos por candidato q, ~17 q por avaliação).
- Mudanças só em `curveFit.ts`: `distPoli` com distâncias ao quadrado e saída antecipada; `avaliarQ` aborta ao igualar o melhor erro; 2ª metade da bisseção dispensada se a 1ª já perde.
- Saída idêntica (mesmos 40 arcos/16 arcos, desvio igual até 1e-16); nenhum teste existente editado.
- Medido em Node, máquina livre: spline fechada de 12 pontos, tol 5 mm, ~1050 ms para ~47 ms; elipse 4x2 ~125 ms para ~6 ms.
- Testes de tempo em `curveFit.test.ts` com limite 5x a meta (500 ms e 250 ms).
## F1.4
- Faixa: "Desenhar" da Parede com os oito modos (reta, arco, retângulo, polígono inscrito e circunscrito, círculo, elipse, spline) em três pilhas. Ícones reaproveitados sem arte nova (aproximações): inscrito `roomsep`, circunscrito `filledRegion`, círculo `materialSphere`, elipse `eye`, spline `roofextrusion`.
- Números: lados 3 a 64 (polígono) e tolerância 1 a 50 mm, padrão 5 mm (elipse e spline), na barra de opções e nas Propriedades (mesmos campos; `wallModes.ts` é a fonte única do modo).
- i18n: 9 chaves novas de `wallTool` em `packages/tools/src/i18n.ts` (7 idiomas, sem literal); rótulos em `props-options.ts` (7 idiomas) e `ribbon-i18n-2.json` (5 linhas). Sem atalhos novos.
- Decisão: a barra da parede continua só indicando "Configurações em Propriedades" e ganhou só os campos de modo, para não duplicar a configuração. O bloco `tool === 'wall'` mais abaixo no `OptionsBar` é inalcançável (dívida: remover numa limpeza).
- Testes: 4 arquivos novos (`wallModes`, `ribbon/wallModes`, `WallShapeFields`, `wallShapesI18n`); nenhum teste existente editado.

## F1.9
- Matriz: `copiesOverlap`/`moveOverlap` (wallOverlapGuard.ts) agora comparam a geometria real do arco via `realOverlap` (corda + flecha, mesma corda e flecha a menos de 1 cm; sinal da flecha invertido se as cordas têm sentidos opostos); reta contra reta segue o critério C14. O círculo passa. Testes novos em `wallOverlapArcs.test.ts`.
- Deslocar: opção `offsetChain` (padrão ligada; só age quando há vizinha em junção pair com ponta coincidente) em `offsetChain.ts`/`offsetTool.ts`: desloca a cadeia pelo mesmo lado, cantos por interseção das curvas, junção tangente mantida, arcos concêntricos (flecha recalculada). Desligada, comportamento antigo idêntico. Cópia (`offsetCopy`) copia a cadeia inteira.
- UI: caixa "Cadeia" na barra de opções do Deslocar (`tool_chain`, 7 idiomas); `check:ribbon-i18n` sem mudança (não há rótulo de faixa).
- Dividir no ápice: não é defeito (grade de 0,1 m do comprimento de arco); testes aceitam o corte a até meia célula (0,05 m) e conferem que fica sobre a curva.
- Alinhar: não é defeito (só a parede clicada anda, vizinhas esticam); testes do hexágono e da elipse passam a conferir esse resultado literal, pontas coincidentes e `joinStatus` pair (sem tangência na elipse).
- Em `wallShapesModificar.test.ts` os 6 `it.fails` viraram testes normais; os de Deslocar do círculo e da elipse agora usam um clique (Cadeia). Nenhum teste fora dele alterado.

## F1.10
- Galeria extraída para `ui/perimeter/ShapeGallery.tsx` (`ShapeGallery`, `ShapeDef`, `SHAPE_KEY`, `Ic`); o perímetro a usa sem mudança de comportamento ou aparência.
- Parede: `drawPanel` e os 8 botões de modo removidos de `ribbon/context.ts`; a aba "Modificar | Colocar Parede" ganha `WallDrawPanel` (Ribbon.tsx) com 10 formas: linha, retângulo, polígono inscrito/circunscrito, círculo, arco 3 pontos, arco centro-extremidades, arco tangente, elipse e spline (nova, ponto azul, ícone próprio, chave `pro_pm_shape_spline`).
- `wallModes.ts` virou só o mapeamento id da galeria -> `wallShape` (`wallGalleryPatch/Of`); `wallShape` ganhou `arc-center` e `arc-tangent` (também na lista da paleta Propriedades).
- `wallTool`: arco centro-extremidades (centro, início, fim; sentido pelo lado do cursor, até 180° por clique) e arco tangente (início, ponto da tangente, fim), via `arcCenterEnds`/`arcTangent` sem alterá-los; arcos exatos `{a,b,sag}`, prévia, Esc cancela, 1 desfazer; mensagens `tl_msg_arc_*` e `tl_undo_wall_arc_*` nos 7 idiomas.
- Dívida: filete de parede não existe (a galeria da Parede não o oferece); face/perímetro/ambiente não se aplicam à parede.
- Painel Modificar: a Parede usa o mesmo `P_MODIFY` do perímetro, então nada falta em relação a ele; Escala, Fixar e Desafixar continuam "em breve" nos dois.
- Testes: `ribbon/wallModes.test.ts` reescrito (cada forma -> `wallShape` certo, painel renderiza 10 botões); 2 testes novos dos arcos em `wallShapesTool.test.ts`.
- Opção do sentido do arco centro-extremidades (>180°) e Cadeia do arco ficam como pendência.

## Fase 1: concluída (2026-11-14)
Portões: typecheck, lint (0 erros), check-units, check:ribbon-i18n 0 faltando, test:rapido 12153 ok; 6 a 8 arquivos falham por timeout sob carga (a máquina é compartilhada com outra sessão) e passam isolados. Interface conferida por captura de tela (Chrome do sistema): aba "Modificar | Colocar Parede" com a galeria Desenhar compartilhada com o perímetro. Dívidas: filete de parede; arco centro-extremidades só até 180° por clique; capturas automáticas por script ficam para o portão final da frente. Branch `frente/parede-formas` vive no worktree isolado `~/hestia-wt/frente`.

## Fase 2: decisões após o P0 (E5 a E7)
- **E5:** sólido, planta, corte, quantitativos e junção de produção são TS; o Rust só espelha atrás de `kernelFatiaLigada` (padrão TS, `packages/geom/src/kernel/v2/fatias.ts:79`). Logo `tilt` NÃO sobe o contrato do kernel (versão 19 intacta; o contrato é colunar `schema/cena-v11.json` e ignora campo opcional). Projeto com parede inclinada força o caminho TS das junções mesmo com a flag ligada; porte Rust do tilt fica como dívida D2 (só se a flag virar padrão).
- **E6:** `SCHEMA_VERSION` 26 → 27 na F2.1 (migração 26→27 só sobe o número). A chave de cache do sólido (`solids.ts:349`) passa a incluir `tilt` (F2.3).
- **E7:** ferramentas de modificar usam `transform`/`updateElements`/`splitWall` com spread: `tilt` é preservado de graça; Espelhar (`commands.ts:237`) e troca a↔b precisam inverter o sinal (F2.11).

## F2.2: funções puras de parede inclinada
- `packages/engine/src/wallTilt.ts` (sem store/ids) e `wallTilt.test.ts` (11 testes, valores literais da tabela 4.2 a 1e-4).
- Convenção: `tilt` em graus, + = topo à esquerda de a→b; `d(z)=z·tan(tilt)` assinado; volume/área/comprimento usam |tilt|; `arcTiltSide(sag,tilt)` dá s (centro do lado do `sag`: sag>0 e tilt>0 aproxima, s=-1).
- Arco no nível z: centro e φ constantes, R_z = R − sign(sag)·d(z), extremos escalados radialmente, `sag_z = sign(sag)·R_z·(1−cos(φ/2))`; reta desloca a e b pela normal esquerda.
- `tiltValid({tiltDeg,H,t,R?})`: finito, |tilt| ≤ 60 e, com R, R − H·tan|θ| > t/(2cosθ) + 0,01 (aplicado nos dois sentidos, conservador); R omitido = reta.
- Volume/área do arco recebem `s` explícito (o chamador usa `arcTiltSide`); `axisLengthAtLevel` tem sobrecarga reta (L,z,tilt) e arco (R,φ,z,tilt,s).

## F2.1
- `Wall.tilt?` (graus, positivo = topo à esquerda de a→b, em torno da linha de base); `SCHEMA_VERSION` 27, migração 26→27 só sobe o número.
- Validação central em `packages/model/src/wallTilt.ts` (`wallTiltIssue`): finito, |tilt| ≤ 60, sem `topProfile` (recusa, nunca apaga), arco inclinado para o centro com R − H·tan|θ| > t/(2cosθ) + 0,01.
- H = nível de topo + topOffset − base se resolvível no modelo; senão `height` nominal. Topo anexado a piso/telhado depende do motor: não resolvido aqui (a F2.4 deve revalidar com a altura real).
- Sem o tipo da parede no projeto a regra do arco é pulada; `makeWall` apenas aceita o campo, a validação roda em `addWall`, `updateElements` (tilt/topProfile/sag) e `setWallTilt`.
- `setWallTilt {ids, tilt}`: um passo de desfazer, atômico (valida todas antes de gravar); tilt 0 remove o campo. Chaves `md_cmd_tilt_*` nos 7 idiomas; rótulo "Inclinar parede(s)".
- Testes de versão 26→27 ajustados em 10 arquivos de `packages/model/src`; plugins: `setWallTilt` não foi liberado para plugin (fora de `PLUGIN_ALLOWED_COMMANDS`).

## F2.3
- Sólido de parede inclinada em `solids.ts` (`extrudeLayerTilted`, `tiltMap`); `tilt=0`/ausente segue `extrudeLayer` sem mudança (testado: mesmos vértices e índices). Faixa com topo em perfil (`slope`) também cai no caminho vertical (tilt e `topProfile` não coexistem).
- Mapa de planta por cota z: reta desloca pela normal esquerda `e·(1/cosθ − 1) + z·tanθ`; arco: raio `R + k·z·tanθ + (ρ−R)/cosθ` no mesmo centro (k de `arcFromSagitta`). Faces laterais = quadriláteros em 2 triângulos; topo/base planos triangulados DEPOIS do deslocamento (triangular antes inverte triângulos no arco).
- `ResolvedWall` ganhou `tilt?` e `sag?` (só quando tilt ≠ 0; `types.ts` tocado só para o tipo); chave de cache ganha `|tilt=..|sag` apenas com tilt. Junções e vãos seguem o corte vertical na base (F2.4/F2.8).
- Achado F2.2: `axisAtLevel` e `arcTiltSide` (wallTilt.ts) põem o centro do arco do lado do `sag`, mas `arcFromSagitta` e `wallTiltIssue` o põem do lado oposto (sag>0: centro à direita); o sinal de s fica invertido em arco. A F2.3 usa `arcFromSagitta`; corrigir o F2.2 antes de F2.4/F2.7 usarem `s`.
- Testes `wallTiltSolid.test.ts`: reta 2,4847 e 2,7713 (1e-4; fórmula 1e-6), arco 5,2708 e 4,4865 (1e-3), 2 camadas, malha fechada, cache.

- **Correção do fiscal (pós-F2.3):** `arcTiltSide`/`axisAtLevel` (engine/wallTilt.ts) tinham o sinal do arco invertido (centro posto do lado da flecha). Convenção correta, igual a `arcFromSagitta`: sag>0 abaula à ESQUERDA e o centro fica à DIREITA; tilt>0 leva o topo à esquerda, logo sag>0 e tilt>0 AFASTAM do centro (s=+1). Testes de eixo reescritos com essa convenção; o sólido da F2.3 (usa `arc.k`) já estava certo.
