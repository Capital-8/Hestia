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
- Defeito 2 (tilt não atualizava o 3D): causa em `render/model3d/paredesInstanciadas3d.ts`. Parede reta isolada vira caixa instanciada (`caixasDaCamada`), que só lê as faixas verticais; o `tilt` era ignorado até uma junção recortar a faixa (daí "só atualizou ao criar outra parede"). Chave do nível, sólido, planta e corte já refletiam o tilt (teste node passa). Correção: camada de parede com `tilt` ou junção inclinada não usa caixas.
- Varredura dos caches de parede: chave do nível (JSON do elemento), `wallLayerKey`, `resolveMemo` (só forma, sem tilt na entrada), cache de junção (assinatura das peças + junções inclinadas) e `projetoTemParedeInclinada` (por identidade do projeto) estão corretos; nenhuma outra omissão.
- Teste: `render/model3d/wallTiltAtualiza.test.ts` (0 para 20 e volta a 0: topo deslocado H·tan20° no sólido e no corte, `tiltPlan`; caixas vs. extrusão inclinada, falha antes da correção).
- Defeito 7 (desempenho): não reproduzi lentidão no node (30 paredes a 15°, grade de 3 camadas: corte ~20-60 ms, elevação ~25-55 ms, resolver frio ~200 ms, que é a base vertical). Ganhos feitos: `analyzeLevelTilt` com memo por nível (chave: identidade de parede/tipo, cotas, alturas, tolerância), chamado por resolver, junção e avisos; `junctionLevel` perde o JSON das junções na assinatura (identidade do Map) e o cache do cutter volta a valer com parede inclinada.
- Resultado por novo snapshot sem editar parede: junção ~50 ms para ~16 ms; resolver ~16 ms (aplicação do tilt à planta, não memoizada), corte ~35 ms.
- Teste permanente: `engine/wallTiltDesempenho.test.ts` (imprime tempos, limite 500 ms, identidade da junção entre snapshots e invalidação ao mudar o tilt).
- Provável fonte da lentidão no app: a guarda E5 manda o projeto inteiro ao TS quando há uma parede inclinada (perde o Rust em resolver/junção/pisos). Não mexi; porte do tilt ao Rust (D2) resolve.
- Pendências: `applyTiltToLevelPlan` recomputa uniões por parede a cada snapshot; `tiltBandBeyond` faz 2 interseções por polígono.
