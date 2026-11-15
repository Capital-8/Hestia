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

## F2.4
- `wallTiltJoin.ts` (spike S1 promovido, `git mv`): `levelSet` reaplica a topologia da base (pair e tee) aos eixos deslocados por d(z); `wallTiltJoinLevel.ts`: `analyzeLevelTilt` (anéis por camada em z=0 e z=H, só reta×reta), `wallTiltJoinIssues`, `projetoTemParedeInclinada`. Tee: a ponta do ramo é o cruzamento do eixo dele com o eixo da hospedeira NO NÍVEL (senão `buttAgainst` pegava a face errada no topo).
- Integração: `junctionLevelTs` anexa `WallJunction.tilt` (só com parede inclinada; sem ela o caminho e a assinatura são os de antes); `wallLayerSolid`/`extrudeLayerTilted` mapeiam o vértice da faixa que coincide (5e-4 m) com o anel vertical `raw` para p0+(pH−p0)·z/H; os demais seguem o mapa geral (mesmos planos). Parede vertical ligada a inclinada (0°/30°) também ganha o topo deslocado. Altura = a resolvida (`rw.height`), não a nominal.
- Arco inclinado (própria parede ou parceira): plano B, sem junção, aviso `arcoInclinadoSemJuncao`. Cruzamento fora da parede, cone invertido, anel degenerado ou arco que não cabe na altura REAL (revalida a pendência da F2.1: altura anexada a piso/telhado): a componente inteira degrada para corte simples + `inclinacaoInviavelNaJuncao`. Textos em `egb_issue_tilt_*` (engine PT/EN e shard `packages-engine.ts` nos 7 idiomas); `avisosCalculo.ts` ganhou `wallTiltJoinIssues` (1 linha fora da lista, necessária para o aviso aparecer).
- Guarda E5: `fatiaEfetiva(ligada, temParedeInclinada)` em `fatias.ts`; `DespachoKernel` (resolver, junção, pisos, lajes, quantidades) cai no TS com parede inclinada (`kernelDespacho.ts` tocado só nessas 5 linhas).
- Testes permanentes: S1 sobre produção (`wallTiltJoin.test.ts`: tabela 15/15, 15/30, 0/30 a 1e-6, planos <1e-9, malha fechada, Simpson 1e-9, fuzz 500, <2 ms/par; arco exato segue `it.fails` = dívida D1), `wallTiltJoinLevel.test.ts` (topologia, avisos, terceira parede, guarda), `wallTiltJoinSolid.test.ts` (sólido real pair e tee), `fatias.guarda.test.ts`. Nenhum teste existente editado.
- Limites conhecidos: nó de 3+ paredes e paredes com bases em cotas diferentes ficam sem junção inclinada (corte vertical deslocado, como na F2.3); camadas casadas por vértice (faixa com vão usa o mapa geral nos vértices do vão); quantitativos/planta/corte seguem para F2.5 a F2.7; D1 (arco exato) e D2 (Rust) abertas.

## F2.10
- Campo "Inclinação" (graus, `quantity="angle"`, ±60°) nas Propriedades da parede (uma ou várias; `setWallTilt`, um desfazer) e no painel de colocação (opção `wallTilt`, que a barra de opções não repete); tudo passa por `inclinarParedes` (`editor/wallTiltActions.ts`), que devolve o motivo traduzido do modelo.
- Erros (limite, arco que se fecha, perfil de topo) vão para a barra de status nas Propriedades, para o próprio diálogo no "Inclinar" e para a barra de status no desenho, onde a forma ou o trecho inteiro é recusado (como a sobreposição, decisão 0044).
- Comando "Inclinar": ação `wallTilt` no painel "Modificar parede" da aba contextual das paredes (ícone `slope`, reaproveitado), diálogo `WallTiltDialog` (`dialog: 'wallTilt'`); desabilitado sem parede na seleção.
- Desenho: cadeia com inclinação vira um só desfazer (sessão da transação em `wallTool.ts`); cadeia reta segue com um desfazer por trecho, como antes (decisão: não mudar o padrão sem pedido).
- i18n: 6 chaves `prc_*` em `props-core.ts` nos 7 idiomas; faixa: "Inclinar", dica e "Selecione paredes primeiro." em `ribbon-i18n-4.json`; `check:ribbon-i18n` 0 faltando.
- Testes novos (4 arquivos, 17 casos): `packages/tools/src/wallTilt.test.ts`, `apps/web/src/editor/wallTiltActions.test.ts`, `apps/web/src/ui/WallTiltUi.test.ts`, `apps/web/src/ui/ribbon/wallTilt.test.ts`. Nenhum teste existente editado. Limite: o render estático não vê opções gravadas (zustand usa o estado inicial no SSR), por isso o valor do campo é coberto pelo conversor e pelo comando; `WallProps` não é exportado e fica sem render.
## F2.5/F2.6
- Planta: `engine/src/wallTiltPlan.ts` (`tiltPlanMap`, `joinedPlanMap`, `applyTiltToPlan`, `applyTiltToLevelPlan`), chamado no fim de `resolveLevelTs`; mapa idêntico ao do sólido da F2.3 (duplicado no engine, que não importa o render) e junção por nível da F2.4 (`analyzeLevelTilt`). Só roda com parede inclinada; sem ela o resultado é o mesmo objeto de antes (teste de igualdade).
- `layers[].cut`, `regions` e `silhouette` ficam no plano de corte (cota de corte − base, padrão 1,20): 15° desloca 0,3215 e a largura é 0,2071. `fragment`, `bands` e `raw` seguem verticais (base do 3D e do corte). Parede vertical ligada a inclinada também é mapeada (como no sólido).
- Novo campo `ResolvedWall.tiltPlan {z, base, top}` (types.ts, 1 campo): projeção da base (z=0) e do topo (z=H); a planta (`render/plan/tiltOps.ts`, reexportado por `view.ts` por causa do limite de 420 linhas) desenha base em linha clara e topo tracejado nas paredes cortadas.
- Corte/elevação: `engine/src/wallTiltSection.ts`. Corte = paralelogramo (reta: 2 cotas; arco: 8 degraus, poligonal); perpendicular ao eixo, 15°/H=3/t=0,2: base 0,2071 e topo deslocado 0,8038. Faixa com `slope` e parede vertical sem junção inclinada seguem o caminho antigo.
- Elevação: projeção (t, z) pelas faixas de t em cada cota, recortada em 0..L; `depth` = menor distância ao plano em z0 e z1; faixa entra se o polígono mapeado em z0 ou z1 toca a janela de profundidade. Se a topologia de interseção muda entre cotas, o corte cai para a meia altura (vertical).
- Membranas (linhas de espessura zero) continuam verticais na planta e no corte (limite conhecido, dívida D3); `tiltPlan.top` usa a altura da junção quando há junção.
- Testes: `wallTiltPlan.test.ts` (6), `wallTiltSection.test.ts` (7), `render/plan/tiltOps.test.ts` (3), valores literais a 1e-4 (reta, arco, +15°, −15°, 30°); nenhum teste existente editado. Edições de compactação em `resolve.ts` (`zr` numa linha) e `build.ts` por causa do `max-lines`.
## F2.8
- `Opening.plano?: 'vertical' | 'inclinado'` (ausente: janela inclinado, porta vertical; `openingPlaneOf` em `model/openingPlane.ts`); sem nova versão de esquema (opcional, ausente = comportamento atual; continua 27). Comando `setOpeningPlane {ids, plano|null}` (um desfazer, recusa valor inválido), rótulo de histórico e `md_cmd_plane_invalid` nos 7 idiomas. UI é a F2.9.
- `engine/openingTilt.ts` (novo; o spike S4 e seu teste ficam intactos): `openingTiltGeom` (janela inclinada 1,9659 / 0,3974 / 0,2400; porta vertical 0,7697 / 0,3913 / 0,2813, conferidos contra o spike) e `tiltCutZ`. Modo inclinado em arco só com w² ≤ 0,4·R; fora disso usa o vertical e `openingPlaneIssues` avisa (`egb_issue_opening_plane_arc`, 7 idiomas, ligado em `avisosCalculo.ts`).
- Sólido: `OpeningGeometry.tiltPlane` e `ResolvedWall.tiltCuts` (só com tilt e plano inclinado). O vão continua sendo o furo vertical por faixas; em `extrudeLayerTilted` os vértices do furo no peitoril/topo escorregam ao longo da face (z − e·senθ; topo − h(1−cosθ)), o que dá o prisma perpendicular às faces sem mexer nas faixas. Porta com peitoril 0 abre pelo piso (base não desce). Com θ=0 não há `tiltCuts`: sólido idêntico nos dois modos.
- Decisão do recuo vertical: caixilho ancorado na face para a qual a parede se afasta do prumo; recuo atrás dela 0 embaixo, h·|tanθ| em cima, (h/2)·|tanθ| nas laterais (≥ 0 por construção; inclinado: t/2). Um plano em prumo não cabe entre as duas faces quando h·tanθ > t/cosθ (porta 2,1 m: sai pela face oposta 0,356 m no topo); fica registrado em `overhang`, não é erro.
- Correção necessária ao sólido inclinado: com vão a malha da F2.3 não fechava (T-junctions e faces internas entre faixas fundidas). `extrudeLayerTilted` agora cancela faces internas opostas, insere vértices vizinhos nas bordas e emite tampas sem união quando não há face oposta; sem vão a saída é a mesma.
- Testes novos: `openingTilt.test.ts`, `openingPlaneIssues.test.ts`, `openingPlaneCommand.test.ts`, `wallTiltOpening.test.ts` (volume 0,2400 e 0,3913 na malha, fechada nos dois modos).
- Pendências: posicionar a esquadria 3D (`aberturas3d`) no referencial inclinado (`frame` do `openingTiltGeom`; hoje fica no plano da base); cancelamento de faces internas só para arestas exatamente coincidentes; normais das faces horizontais do vão inclinado ficam em ±z (geometria correta).

## F2.7/F2.11
- F2.7: `engine/src/wallTiltQuantities.ts` (novo) + `quantities.ts`: com `rw.tilt`, volume por camada = volume vertical das faixas × fator (reta 1/cosθ; arco com raio médio da camada tirado dos vértices do fragmento, mais correção da facetagem do polígono) e face bruta L·H/cosθ ou φ·(H/cosθ)·(R+s·H·tanθ/2). Vertical: caminho antigo, resultado igual (teste de igualdade). Comprimento do eixo inalterado.
- Vãos: plano vertical desconta w·h/cosθ (e volume w·h·t/cosθ); plano inclinado (com `tiltCuts`) desconta w·h e w·h·t. Valores conferidos: reta 15° 2,4847/12,4233; 30° 2,7713/13,8564; arco afastando 5,2708/26,354; aproximando 4,4865/22,4323 (1e-4). Limites: junção de ponta e camada fora do eixo usam as faixas verticais (erro de segunda ordem); membranas levam o fator de face.
- F2.11: só o Espelhar precisava mudar (`transformWall` em `commands.ts` inverte `tilt` junto com `sag`). Mover, Copiar, Girar, Matriz, Deslocar (com Cadeia), Aparar, Estender, Alinhar e Dividir já preservavam o tilt; Filete não existe para parede.
- Não há comando que troque a↔b numa parede existente (`flipped` só vira a pilha de camadas); a regra (inverter tilt com sag) fica como teste de propriedade e vale para quem criar a operação. Decisão: o tilt da opção de desenho de formas fica como o dono digitou em cada parede (F2.10), sem inverter quando `clockwise` reverte o percurso.
- `wallTool.ts`: toda cadeia (reta, arco, inclinada) usa a sessão de transação: um desfazer por cadeia; antes só a inclinada. Teste novo em `wallTiltModificar.test.ts`.
- Testes novos: `engine/src/wallTiltQuantities.test.ts` (5), `tools/src/wallTiltModificar.test.ts` (matriz 10 comandos × {reta, arco} × ±15°, aceite geométrico em z=0, 1,5, 3 a 1e-9; 50 casos).
- Teste existente alterado (1): `tools/src/wallTilt.test.ts` "cadeia reta segue um desfazer por trecho" virou "cadeia reta é um só desfazer" (pedido da ficha).

## Fase 2 (parede inclinada): estado em 2026-11-14
Mescladas: F2.1 a F2.8, F2.10, F2.11. Portões na árvore combinada: typecheck ok, lint 0 erros, check:ribbon-i18n 0 faltando, test:rapido 12236 ok (11 falhas só de timeout sob carga, 9 arquivos passam isolados: 88 testes). Pendentes: F2.9 (campo "plano" da abertura na interface), F2.12 (IFC/DXF), revisão da regra do semicírculo a 60° (wallTiltIssue), portão visual com capturas. Dívidas: D1 junção exata em arco inclinado; D2 porte do tilt para o Rust; nó de 3+ paredes inclinadas e bases em cotas diferentes sem junção inclinada; membranas verticais na planta/corte; não existe comando que troque a↔b (regra coberta por teste de propriedade).

## Etapa B
- Defeito 2 (tilt não atualizava o 3D): causa em `render/model3d/paredesInstanciadas3d.ts`. Parede reta isolada vira caixa instanciada (`caixasDaCamada`), que só lê as faixas verticais; o `tilt` era ignorado até uma junção recortar a faixa (daí "só atualizou ao criar outra parede"). Chave do nível, sólido, planta e corte já refletiam o tilt (teste node passa). Correção fica com a etapa D (pf/fd); aqui o arquivo não foi tocado (a correção desta etapa foi revertida para evitar conflito).
- Varredura dos caches de parede: chave do nível (JSON do elemento), `wallLayerKey`, `resolveMemo` (só forma, sem tilt na entrada), cache de junção (assinatura das peças + junções inclinadas) e `projetoTemParedeInclinada` (por identidade do projeto) estão corretos; nenhuma outra omissão.
- Teste: `render/model3d/wallTiltAtualiza.test.ts` (0 para 20 e volta a 0: topo deslocado H·tan20° no sólido e no corte, `tiltPlan`).
- Defeito 7 (desempenho): não reproduzi lentidão no node (30 paredes a 15°, grade de 3 camadas: corte ~20-60 ms, elevação ~25-55 ms, resolver frio ~200 ms, que é a base vertical). Ganhos feitos: `analyzeLevelTilt` com memo por nível (chave: identidade de parede/tipo, cotas, alturas, tolerância), chamado por resolver, junção e avisos; `junctionLevel` perde o JSON das junções na assinatura (identidade do Map) e o cache do cutter volta a valer com parede inclinada.
- Resultado por novo snapshot sem editar parede: junção ~50 ms para ~16 ms; resolver ~16 ms (aplicação do tilt à planta, não memoizada), corte ~35 ms.
- Teste permanente: `engine/wallTiltDesempenho.test.ts` (imprime tempos, limite 500 ms, identidade da junção entre snapshots e invalidação ao mudar o tilt).
- Provável fonte da lentidão no app: a guarda E5 manda o projeto inteiro ao TS quando há uma parede inclinada (perde o Rust em resolver/junção/pisos). Não mexi; porte do tilt ao Rust (D2) resolve.
- Pendências: `applyTiltToLevelPlan` recomputa uniões por parede a cada snapshot; `tiltBandBeyond` faz 2 interseções por polígono.
## Etapa D
- Causa do 5b: `buildLevelSolidsComCaixas` (paredesInstanciadas3d.ts, caminho padrão do app) transformava toda camada de faixas retangulares em caixas verticais instanciadas, ignorando `rw.tilt`/`tiltCuts`; o sólido inclinado e o corte inclinado da F2.8 só existiam no caminho de geometria. Correção: parede com `tilt`, `tiltCuts` ou faixa de junção inclinada nunca vira caixa (teste de projeto em render/model3d/wallTiltProject.test.ts).
- Campo "Plano da abertura" (Padrão do tipo | Vertical | Inclinado) em Properties.tsx (OpeningProps), visível quando algum hospedeiro é parede inclinada; grava por `setOpeningPlane` (um desfazer); 4 chaves `prc_*` nos 7 idiomas (props-core.ts).
- Padrão no TIPO de abertura: não feito (exigiria esquema); fica só na instância, SCHEMA_VERSION intacto.
- Inclinação ao criar: já existia no painel de Propriedades (PlacementProperties, `place-wall-tilt`, ao lado de Forma); agora também na barra de opções (`WallTiltField` em OptionsBar.tsx, `opt-wall-tilt`).
- Prévia da wallTool: linha tracejada projetada do topo (H·tanθ à esquerda de a→b) e ligações base-topo, em reta, corda do arco e retângulo; sem prévia quando o topo vem de pavimento ou nas formas por ponto (círculo, elipse, spline, polígono).
- Esquadrias (batente/folha) na parede inclinada continuam instanciadas na vertical: pendência (fora do escopo do corte do sólido).
- Corte/elevação: o vão usa o mesmo retângulo de planta do `openingRect`; não há teste novo de seção inclinada.
- Testes novos: wallTiltProject.test.ts (render), wallTilt.test.ts (+prévia), WallTiltField.test.ts (web). Nenhum teste existente alterado.
- Verificação no navegador (build própria, DOM, sem imagem): ao ativar Parede ficam visíveis `#place-wall-shape`, `#place-wall-tilt` (Propriedades) e `#opt-wall-tilt` (barra, 'Inclinação' em °). Teste de regressão: parede isolada com tilt 20 tem topo deslocado no sólido de `buildLevelSolidsComCaixas`. (A porta 4175 era de outra etapa; a minha usou 4176.)

## Etapa A (portão de navegador) e Etapa C: decisões (2026-11-14)
Resultado real no navegador (build com a correção das caixas verticais): P2 PASS (inclinação de parede isolada agora aparece no 3D), P6 PASS (campo visível e parede nasce com tilt). FALHAM: P1/P3 (L 15°/30° e inclinada×vertical: o critério de `analyzeLevelTilt` rejeita casos viáveis, como L de 4 m com altura 2,8, e o corte simples de reserva gera saliência até 1,58 m ou fresta até 0,89 m), P5 (esquadria 3D da janela fica no plano da base, 0,93 m fora da parede inclinada), P7 (6 paredes a 15°: corte 7049 ms contra 122 ms vertical; 30 paredes não terminam em 9 s; linha de base 30 verticais já 155/100 ms no SwiftShader).
- **E8:** o critério de inviabilidade da junção inclinada passa a ser exato (aceita todo caso viável; recusa só o realmente inviável); o plano B nunca pode produzir saliência ou fresta maiores que a espessura: corte de cada ponta pelo plano da face vizinha, com aviso visível.
- **E9:** a meta de desempenho de corte/elevação vira RELATIVA e absoluta: parede inclinada ≤ 1,5× a mesma cena vertical, e a base vertical (155 ms/100 ms para 30 paredes) entra numa etapa própria de otimização (cache por nível e por parede).
- **E10:** continuação com inclinações diferentes (degrau de H·(tan a − tan b)): aviso próprio `inclinacoesDiferentesEmContinuacao` (hoje sai `inclinacaoInviavelNaJuncao`, código errado); correções por ação explícita: D acompanhar, B cunha, C transição por extremidade (ver sondagem).
- **E11:** esquadria (batente/folha) em parede inclinada segue o plano da abertura: inclinada = no plano da face; vertical = ancorada na face.

## C3 (esquadria 3D em parede inclinada)
- Causa do P5: `aberturas3d` montava o vão no plano da base (grupo/matriz só com rotação z e posição em z = peitoril); o eixo da parede a θ sai de y = z·tanθ, daí o desvio (0,937 m a 20° na janela, medido em node antes da correção).
- Correção: `render/model3d/referencialInclinado3d.ts` (`referencialDaEsquadria`) devolve a matriz do vão; usada nos dois caminhos (`montarAberturaDoModelo`, grupo com `matrix`; `caixasEPrismasDoModelo`, matriz do vão). Parede vertical: null, vértices idênticos (teste de igualdade).
- 'inclinado' (g.tiltPlane; reta e arco com w² ≤ 0,4·R): translação y = peitoril·tanθ e rotação −θ em x (altura medida na face, ocupação h·cosθ); batente, folha, vidro, ferragens e peças com perfil andam juntos. 'vertical': prumo, ponta mais saliente da peça (inclui deslocamento de correr) encostada na face de ancoragem em z = peitoril (recuo ≥ 0 nas 4 bordas, como `openingTiltGeom.reveal`).
- Planta: `simboloNaCotaDoCorte` (plan/tiltOps.ts) desloca o símbolo (arco da folha, projeção) por z_corte·tanθ ao longo de n, como a parede cortada; fora do corte usa a meia altura do vão.
- Fora: corte/elevação (`engine/section.ts`) ainda desenha o vão com altura h e sem deslocamento (diferença h·(1−cosθ), ≤ 6% a 20°); sem teste de seção; símbolo em arco inclinado usa a tangente do centro.
- Testes novos: `model3d/esquadriaInclinada3d.test.ts` (janela, porta, janela sem folha; ±15° e 20°; vertices a 1e-6; arco; geometria = caixas) e `plan/esquadriaInclinadaPlanta.test.ts`. Nenhum teste existente alterado.
- Navegador (build própria, porta 4178): P5 PASS; desvio máx do vértice ao eixo inclinado 0,0979 m (antes 0,93; limite do teste = meia espessura horizontal 0,106 m, o caixilho fica dentro da parede; 1e-6 ao plano da face provado em node). Portões: typecheck, lint, check-units ok; render+engine 411 arquivos/5568 testes ok.
## C1 (junção de paredes inclinadas)
- Causa real: `analyzeLevelTilt` exigia que os anéis de cada camada (raw vertical, p0, pH) tivessem a MESMA contagem de vértices. Em parede multicamada (wt_conc15) a inclinação escala as espessuras por 1/cosθ de cada parede: as camadas deixam de coincidir na linha de corte e ganham quebras (4 vs 6/10 vértices). Caso viável rejeitado; a sondagem (1 camada, 4 vértices) nunca viu.
- Correção: `alinhar()` casa raw com p0/pH pelo vértice mais próximo da base quando a contagem difere; só anel degenerado, invertido ou p0/pH incompatíveis reprova.
- Plano B: componente inviável degrada só o par problemático para encosto (ponta de uma parede cortada pela face da outra em toda a altura; fresta ≤ espessura) e avisa `inclinacaoInviavelNaJuncao`; só se ainda falhar volta ao corte simples da componente.
- Aviso novo `inclinacoesDiferentesEmContinuacao` (chave `egb_issue_tilt_continuation`, 7 idiomas, valor via `formatQuantity`) para paredes em linha / arcos tangentes com degrau H·|tan a − tan b| > 5 mm; mesma inclinação em linha: sem aviso. Arco tangente mantém também `arcoInclinadoSemJuncao`. Degrau não corrigido (outra etapa).
- Ajuste em teste antigo: `wallTiltJoinLevel.test.ts` (-45°/-45°, L=2, H=6) agora espera `joins.size` 2 (plano B), avisos iguais.
- Testes: `wallTiltJoinExato.test.ts` (engine) e `wallTiltJuncaoExata.test.ts` (render, cantos z=0/meio/topo a 1e-6 m com junção em esquadro).
- Navegador (build própria, porta 4187; a 4177 estava ocupada por outro executor): P1 e P3 PASS, sobra/fresta 0 em z=0,05/1,4/2,75, sem avisos.

## F2.12 (IFC/DXF de parede inclinada e regra do semicírculo)
- IFC: `IfcWallGeo.tilt?` {mapa de planta, reta}; o app preenche com `tiltPlanMap` (mesmo mapa do sólido 3D e da planta, agora exportado do engine). Reta: `IFCEXTRUDEDAREASOLID` com perfil da base mapeada e direção oblíqua (profundidade H/cosθ). Arco: `IFCFACETEDBREP` (base e topo mapeados vértice a vértice, laterais em triângulos), `Brep`.
- Volumes lidos do STEP no teste: 2,4847 (15°), 2,7713 (30°), arco 5,2708, a 1e-3. Vertical: saída idêntica (tilt 0 = ausente; sem Brep).
- Reimportação: o `HestiaJSON` já carrega o elemento inteiro, então o `tilt` volta sem código novo; IFC sem pset Hestia: vertical, sem erro (testado).
- Limite: junção inclinada nas pontas não entra no IFC (ponta cisalhada pelo mapa da parede); fica para D1.
- DXF: a planta já usa o contorno mapeado no plano de corte (F2.5); teste de não lançar, de diferença e de igualdade do vertical. Sem aviso novo, sem texto novo.
- Semicírculo (Tarefa 2): regra correta, só testes (`model/src/wallTiltSemicirculo.test.ts`). Afastando (s=+1) a 60° é válido; aproximando é recusado; limite R=2, H=3, t=0,2 em 30° válido e 32° recusado; recusa traduzida nos 7 idiomas.
- A regra usa o lado do centro com o semicírculo como caso degenerado (centro na corda): tratado como centro à direita de sag, coerente com `arcFromSagitta`.
- Escopo tocado fora de io: `engine/src/index.ts` (1 linha de export).
## Etapa P (desempenho do corte e da elevação, pf/fp)
- Reproduzido em node o cenário exato do P7 (zigue-zague de wt_conc15, 3 camadas, 3,6 m): `engine/fixtureZigueZague.ts`; teste permanente `engine/wallTiltMulticamada.test.ts` (imprime tempos, limite 5x) e `geom/clipperGrande.test.ts`.
- Causa 1 (geral, vertical e inclinada): o Clipper-lib só usa aritmética `Number` até 47,45e6 inteiros (`loRange`); a 1 µm isso é 47 m. A linha do corte/elevação do P7 tem 94 m, então toda união/diferença/fecha-frestas caía em Int128/BigInteger (`SlopesEqual4` → `Int128Mul`, ~60% do tempo). Correção em `geom/boolean.ts`: translação inteira dos caminhos (`centrarCaminhos`) só quando alguma coordenada passa do limite; resultado volta somando o deslocamento. Vertical idêntico (diferença 0 em corte, elevação e planta); inclinada idêntica no corte/elevação.
- Causa 2 (só inclinada): `applyTiltToPlan` (uniões por parede e por aglomerado) rodava a cada `resolveLevel`, ou seja, em resolver, junção, corte e elevação (3 a 4 vezes por vista). Agora há memo por parede e por aglomerado (chave: identidade de `cut`/`bands` por camada e da junção, mais assinatura de tilt/eixo/cota); a pegada `foot` (só usada em `.length`) deixou de ser uma união.
- Node, 30 paredes, antes → depois (ms, mínimo de 6): inclinada 15° frio: junção 91→22, corte 133→58, elevação 54→16; em novo snapshot: resolver 34→2, junção 34→2, corte 108→46, elevação 53→16. Vertical: corte 51→42, elevação 18→16 (frio); novo snapshot corte 50→37, elevação 18→14. Razão inclinada/vertical ≈1,2 a 1,4.
- Navegador (build própria, SwiftShader, máquina com carga 6 a 9; P7, mediana de 3, piso do harness ~80-100 ms por 3 rAF): 30 inclinadas corte 196-429 (1ª rodada 556-840, JIT frio do TS no worker, sem Rust por E5), elevação 81-122; 30 verticais corte 117-131, elevação 95-110; 6 inclinadas corte 132, elevação 115; 6 verticais 109/85. Antes desta etapa: 6 inclinadas corte 395, 30 inclinadas corte 223/elevação 152.
- Pendência: a 1ª abertura de corte com parede inclinada no worker é fria (TS sem Rust); só o porte do tilt ao Rust (D2) ou aquecimento do worker elimina.
## Etapa W (aquecimento do corte e vão inclinado na seção, pf/fw)
- Aquecimento: `editor/aquecimentoCorte.ts` monta um projeto sintético (zigue-zague de 20 paredes a 15°, janela inclinada, porta vertical, 1 corte e 1 elevação de ~60 m) e o worker de cálculo (`sectionClient`) o resolve em `requestIdleCallback`, seção e elevação em turnos separados, com ids de vista próprios (não tocam o cache). Disparo: `controller.load` e a 1ª parede inclinada que surgir (`aquecerCorteSeInclinada`, uma vez por sessão); ao terminar, se há corte aberto, `sectionOf` o calcula em segundo plano.
- Navegador (build própria, SwiftShader, máquina carregada; 30 paredes wt_conc15 a 15°, tempo do pedido ao resultado, sem o piso de rAF): 1ª abertura do corte 365 ms antes e 140-170 ms depois; seguintes 73-100 antes e 66-92 depois. No harness P7 (inclui 2 rAF e desenho): ainda 370-650/130-210 ms, dominado pelo desenho; o P7 ganhou `SEM_AQUEC=1` (usa só o aquecimento do app).
- Resíduo da 1ª abertura (~150 ms): clone do projeto ao worker e memo por parede ainda frio; só o porte do tilt ao Rust (D2) elimina.
- Vão na seção/elevação (`section.ts`, via `openingTiltGeom`): parede inclinada, modo 'inclinado': z1 = peitoril + h·cosθ (janela 1,2×1,0, peitoril 1,0, 15°: topo 1,9659; deslocamento do caixilho 0,3974 deslocando também a profundidade); modo 'vertical': a prumo, z1 = peitoril + h (porta 0,9×2,1: profundidade horizontal 0,7697). Parede vertical: resultado idêntico (teste).
- Testes novos: `engine/sectionVaoInclinado.test.ts`, `web/editor/aquecimentoCorte.test.ts`. Nenhum teste existente alterado; `tests/e2e/parede-inclinada.mjs` ganhou só o toggle SEM_AQUEC.
- Limite: o desenho das peças do modelo (OpeningModel) na vista ainda usa a altura h; só o retângulo/oclusão do vão segue h·cosθ.

## Etapa R: continuação com inclinações diferentes (ações D e B)
- Padrão mantido: aceitar e avisar; correção só por ação explícita, nunca automática. Aviso corrigido: o degrau usa as inclinações no mesmo referencial (parede b→a troca o sinal), sem falso positivo.
- Ação D: comando `alignTiltOfChain {items:[{id,tilt}]}` (atômico, valida `wallTiltIssue`, um desfazer). A cadeia e o sinal por sentido a→b vêm do motor (`cadeiaContinua`, mesmo critério `emContinuacao` do aviso); a referência é a primeira parede selecionada.
- Ação B: `JoinConfig.transicao?: 'degrau'|'cunha'` (ausente = degrau; SCHEMA_VERSION intacto). Cunha = prisma triangular (0,0),(offA,H),(offB,H) no plano perpendicular, extrudado por t centrado no nó; volume exato t·H·|offA−offB|/2 (−20°/−15°, H=3, t=0,2: 0,0864189 m³). Soma em quantitativos (camada de maior área da parede dona) e no 3D (`cunhaSolid.ts`).
- Só reta×reta. D1 (dívida): arcos tangentes seguem só com aviso; a cunha ocupa t em torno do nó e sobrepõe uma faixa fina junto à base dentro dos corpos das paredes (o volume somado é o do prisma inteiro); refinar recortando o prisma pelos corpos.
- Interface reaproveitada: o painel de avisos não tem infraestrutura de ação, então "Acompanhar inclinação" e "Cunha" estão no painel 'modificar-parede' da aba das paredes; o campo "Transição de inclinação" fica nas linhas de junção da paleta de propriedades (parede inclinada).
- Gancho para a ação C (transição por extremidade, superfície regrada): ainda não existe; `transicao` é string-union extensível (ex.: 'regrada').
- Testes: wallTiltTransicao.test.ts (motor), cunhaTransicao.test.ts (render: 8 triângulos, volume assinado), wallTiltCadeia.test.ts (web).

## T-A / T-B (face superior da parede, pf/ft)
- T-A: `engine/src/wallTopFaces.ts` (`wallTopFaces`, `wallTopFacesCached`, exportados no index). Por parede: arestas superiores `exterior`, `interior`, `coreExterior`, `coreInterior`, `axis`, `corners` e `outline`, em {x,y,z} com z ABSOLUTO.
- Cota: `wallZRange` (nível+offset/height, topo anexado a piso/laje/telhado) e, para `topProfile`, o próprio perfil: um ponto por quebra (degrau = dois pontos no mesmo x,y). Arco: 8 a 64 amostras (~0,2 m).
- Planta: `tiltPlanMap` na altura h de cada ponto (d = h·tanθ pela normal esquerda, espessura horizontal t/cosθ). Nas pontas com junção inclinada, o canto que casa com o anel `raw` de `analyzeLevelTilt` usa p0 + (pH − p0)·h/H; senão o mapa puro. Sem inclinação o topo coincide com a base em planta.
- Decisão: a face externa/interna desloca H·tanθ ± (t/2)(1/cosθ − 1); o eixo desloca exatamente H·tanθ (0,8038 m para H=3, 15°). Literais: L=4, t=0,2, H=3, 15°: ext y=0,9073752, int 0,7003200; −15°: −0,7003200 / −0,9073752; canto L 15°/15° (−0,7003; −0,7003).
- T-B: só tipos e rótulos, sem comportamento: `SnapKind 'topFace'` (peso 0,1 em `WEIGHT`), `AlignKind 'faceSuperior' | 'nucleoSuperior'`, `SketchPick.kind 'topFace'` (ordem 3), chaves `tl_snap_top_face/_edge_ext/_edge_int/_edge_core/_corner` nos 7 idiomas (`tools/i18n.ts`). `SketchWhich` e `which` por camada ficam para T-C a T-E.
- Testes novos: `wallTopFaces.test.ts`, `tools/topFaceI18n.test.ts`. Nenhum teste existente alterado.
## J1 (núcleo da junção exata de arcos inclinados, pf/fj)
- `levelFrame`/`levelSet` já davam o círculo de mesmo centro e raio R+k·z·tanθ; faltavam o cruzamento correto e os níveis. `levelSet` ganhou o 4º parâmetro opcional `base` (o canto de cada nível escolhe a raiz mais perto do nó da base, z=0) e trata círculos coincidentes (arcos tangentes de mesmo R e tilt: nó = projeção radial do nó da base; concêntricos de raios diferentes: `sem-cruzamento`). Reta×reta e todos os testes existentes: sem alteração (o `it.fails` D1 continua falhando de propósito: exige zero falhas, e cone invertido/nó fora da parede são limites geométricos).
- Novas funções em `wallTiltJoin.ts`: `levelSetAdaptive(walls, rels, H, tol=0,5 mm)` devolve `{zs, sets}`; bisseção do intervalo até o ponto médio dos cantos (nós e pontas de cada fronteira de camada) ficar a < 0,5 mm da corda; sempre inclui 0, H/2 e H (reta×reta = exatamente [0, H/2, H]); teto de 65 níveis; qualquer nível inviável devolve `{fail}` (cone-invertido, sem-cruzamento, no-fora-da-parede, corte-nulo). `levelRings(ls, id)` (anéis por camada, igual ao `ringsOf` de wallTiltJoinLevel.ts) e `levelLayers(walls, rels, H)` devolvem `{zs, walls: id -> [{layerIndex, rings[i] em zs[i]}]}`: é a entrada das fichas J2/J3.
- Atenção J2/J3: em arco a contagem de vértices dos anéis PODE mudar entre níveis (grade de `layerQuad` depende do raio e do alcance em t); o alinhamento por nível (como `alinhar`) é do consumidor. Em arco a esquadria do `joinPair` é sempre 'butt' (dominante atravessa, a outra para no eixo/plano); só o nó está nos dois eixos, e as pontas de cada parede estão nas próprias faces.
- Testes (`wallTiltJoinArco.test.ts`, valores à mão, 1e-6): (a) concêntricos tangentes R=5, tilt −10°: canto (0, 5+z·tan10°) e faces ρ=R_f; (b) centros (0,0) e (6,0): y=4,000 / 4,460046 / 4,905656 em z=0 / 1,4 / 2,8, corda < 0,5 mm; (c) arco×reta: x=4 em z=0 e 4,259530 em z=2 (tilts −15°/15°); (d) cone invertido recusado; fuzz de 300 pares arco×arco e arco×reta (semente 20261115): sem NaN, volume ≥ 0, nós nos dois eixos e pontas nas faces (<1e-6); viáveis 164, falhas tipadas: cone 32, sem cruzamento 100 (círculos que se separam com tilts de até 30°, H até 6), fora da parede 4; ~1 ms/par nos níveis, ~2,7 ms/par com os anéis (arco domina).
