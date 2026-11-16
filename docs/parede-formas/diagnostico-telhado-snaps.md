# Diagnóstico: telhado alinhado ao topo das paredes (sem captura de FACE SUPERIOR)

Somente leitura; nada de código alterado. Base: `frente/parede-formas`. Script de medição fora do repositório (scratchpad `diag-telhado/d.mts`).

## 1. O que existe hoje (tudo em planta, na cota da BASE)
| Feição | Onde | Cota/plano |
|---|---|---|
| Snap `face` (cantos/pontas do contorno), `midpoint`, `nearest`, `perpendicular` | `infer.ts:391-421` (`addSegs` sobre `wf.outline`) | planta, cota de base |
| Snap `core` (faces do núcleo) | `infer.ts:420`; `SnapKind` em `types.ts:13` | idem |
| Parede em arco: pontas, meio e pé radial das faces | `infer.ts:424-440` | idem |
| Interseções de eixos/faces | `infer.ts:181` (`wallCrossings`), `addSectionCrossings` 248 | idem |
| Origem da geometria | `faces.ts:27-41` `wallFaces` (de `levelFrames`: sem `tilt`, sem altura) | z=0 do nível |
| Alinhar: `faceParede`, `eixoParede`, `nucleoParede`, `extremidadeParede` | `alignFeatures.ts:43-60` (tipos), 158-165 (retas), 191-205 (pontas) | reta da base |
| Escolher face do telhado/piso (pick-face): `face` ext/int e `axis` | `sketchPickFace.ts:32-98`, `sketchPickFaceGeom.ts`; `by perimeter` em `sketchByPerimeter.ts` | `wallFacesCached` = base |
| Corte | `sectionSnapIndex.ts` (cantos/trilhas do desenho do corte; vãos) | só o que o corte desenha; sem rótulo "topo" |
| 3D | não há captura 3D de parede (nada em `render/model3d` chama `infer`) | n/a |

Por que NÃO há "face superior": (a) nenhum tipo (`SnapKind`, `AlignKind`, `SketchPick.kind`) é de topo; (b) todas as fontes (`wallFaces`, `levelFrames`) são planas e ignoram `Wall.tilt` (model `types.ts:379`), `topLevelId/topOffset` (337-340), `attachTopToRoof` (349) e `topProfile` (373); (c) o contorno do topo existe só em `ResolvedWall.tiltPlan.top` (`engine/types.ts:65`, `wallTiltPlan.ts`), usado apenas para desenhar; a captura nunca o lê; (d) a cota z do topo (H = nível de topo + offset - base, ou perfil, ou piso do telhado) não é exposta como função única.

## 2. O que o dono precisa
- Parede vertical: contorno do topo = contorno da base (mesmos XY), mas a captura deve se chamar e se comportar como "Face superior" (cota z = topo; hoje o telhado fica em `heightOffset` solto).
- Parede inclinada: topo deslocado d(H)=H·tanθ para o lado do `tilt` (+ = esquerda de a→b); a face externa vira linha diferente em planta. Ex.: H=3, 15°: 3·tan15° = 0,8038 m.
- Topo anexado (`attachTopToRoof`/piso) ou com `topProfile`: z varia ao longo da parede; a aresta superior deixa de ser horizontal (3D) e a planta é a projeção.
- Camadas: face externa/interna/núcleo mudam com o tipo; as três precisam do seu "topo".

## 3. Medido nos projetos (carregador de produção `migrateProject` + `resolveLevel`)
- (3), (4), (5) (migram 23 para 27): 6 paredes retas verticais (tilt 0), H=2,8, sem topo anexado; 1 telhado `edges` com `footprint` e beiral 0,5, `heightOffset` 2,8. Distância de cada vértice do `footprint` ao contorno BASE das paredes: min 0,0000, max 0,0000 m. Como não há inclinação, contorno do topo = base (diferença 0,0000 m): o telhado já nasceu alinhado por "escolher face" (caixa 0,8777..5,3914 x 2,3875..6,6736). O problema aqui é conceitual/UX: não há captura rotulada de topo nem cota z; no corte/3D o telhado é só `heightOffset` e não segue a parede se o topo mudar.
- `Projeto sem título` (27): 13 paredes, 5 em arco, tilt +15 (11) e -10 (2); sem telhado. Deslocamento máximo do topo vs base (tiltPlan): 0,79 m (15°), 0,49 m (-10°), até 2,02 m em paredes mais altas. Um telhado por face nessas paredes erraria o beiral por até ~2 m na planta, e `faceCandidates` jamais ofereceria o contorno certo.

## 4. Proposta: feições "Face superior"
Núcleo único no engine: `wallTopFaces(p, levelId)` (novo `engine/src/wallTopFaces.ts`) devolve, por parede e camada (ext/int/núcleo), polilinha 3D {x,y,z} do contorno superior: z(s) = topo resolvido (nível+offset, `attachTopToRoof`, `topProfile`); XY = `tiltPlanMap(.., H)`; com arco, mesma conta de `wallTiltPlan`. Cache por `Project` como `wallFacesCached`.
Consumidores:
1. Snap: novo `SnapKind 'topFace'` (rótulo i18n "Face superior", símbolo = quadrado vazado com traço superior), prioridade logo abaixo de `endpoint` e acima de `face`; cantos, meio e pé sobre a aresta superior; só se `sn.faces` e opção nova `sn.topFaces` (padrão ligada). Candidato leva `z`; planta usa XY projetado; em corte usa o traço do topo.
2. Alinhar: `AlignKind 'faceSuperior'`, `'nucleoSuperior'`; reta = aresta superior projetada; política `transladar` (parede) ou `nenhum` (referência de telhado); preferir topo quando o elemento movido é telhado/forro.
3. Escolher face (telhado/piso/forro): `SketchPick.kind` ganha `'topFace'` com `which: 'ext'|'int'|'core'`; `sketchByPerimeter` monta o contorno com `edgeOverhangs` a partir do topo e grava `heightOffset` = z do topo (não mais valor solto).
4. 3D: sem infra de snap 3D; entrega só o plano (z incluído nos candidatos para o futuro).

### Fichas (Sonnet, em horas; 2 podem rodar em paralelo: A||B; C depois de A)
| Ficha | Arquivos permitidos | h | Referência de teste |
|---|---|---|---|
| A. `wallTopFaces` + z do topo | `engine/src/wallTopFaces.ts` (+test), `index.ts` | 5 | parede 4 m, t=0,2, H=3, tilt 15°: topo da face externa deslocado 0,8038 m; vertical: igual à base; topo anexado: z do piso superior |
| B. Tipos e i18n | `tools/src/types.ts`, `i18n.ts`, ribbon/props (opção `topFaces`) | 2 | 7 idiomas, `check:ribbon-i18n` |
| C. Snap `topFace` | `infer.ts`, `snapAccel.ts`, símbolo em `render/overlay` | 5 | cursor no canto superior inclinado captura (x,y,z) a 1e-6 |
| D. Alinhar `faceSuperior` | `alignFeatures.ts`, `alignSolve.ts`, `alignTool.ts` | 5 | alinhar beiral a aresta superior: resíduo < 1e-6 |
| E. Escolher face superior no telhado | `sketchPickFace.ts`, `sketchPickFaceGeom.ts`, `sketchByPerimeter.ts`, `roofTool.ts` | 6 | projetos (3)-(5): 0,0000 m; tilt 15°: 0,8038 m |
| F. Corte/elevação | `sectionSnapIndex.ts` | 3 | aresta superior com rótulo no corte |
Total ~26 h.

## 5. Riscos e limites
- Topo anexado ao telhado é circular (telhado depende do topo e o topo da cobertura): resolver só para telhado existente, sem realimentar; exigir ordem determinística.
- Arco inclinado: sem junção exata (dívida D1, `arcoInclinadoSemJuncao`); o topo vale só como aproximação poligonal (8 degraus).
- Junções inclinadas mudam o canto superior (`wallTiltJoin`); usar o anel de `analyzeLevelTilt`, não o deslocamento puro.
- Performance: `wallTopFaces` roda `resolveLevel` (~16 ms/nível); precisa cache por snapshot.
- NÃO é possível sem mudar o modelo: telhado que SEGUE a parede (vínculo vivo) exigiria campo novo (ex.: `Roof.boundTo: {wallId, layer}`); sem ele a captura é só instantânea. Snap 3D real exige infra de pick 3D inexistente.
