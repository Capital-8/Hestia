# Etapa A: portão de navegador da parede inclinada

Script: `tests/e2e/parede-inclinada.mjs` (`APP_URL=...`; `SO=P1,P6` roda só alguns; `NP=6` muda o nº de paredes do P7). Capturas em
`evidencias/etapaA/` (build nova, pf/fd) e `evidencias/etapaA/antiga/` (build antiga, sem a correção das caixas). Medido por dados da cena 3D (fatias z=0,05/1,4/2,75 da malha), do resolvedor, do corte e do tempo.
Build antiga servida em 4175 (cópia do dist de frente/parede-formas; a 4174 caiu); nova (merge pf/fd) em 4176. Saída 1 nas duas (há FAIL).

| Ponto | Antiga | Nova (pf/fd) | Valores |
|---|---|---|---|
| P1 L 15°+30° (e -15/-30, 15/-30) | FAIL | FAIL | antiga: malha vertical (deslocamento medido 0, esperado 0,72 e 1,56). Nova: inclina, mas canto com saliência até 1,58 m (dentro) e fresta até 0,89 m (fora) |
| P2 tilt 20° numa parede isolada | FAIL | PASS | antiga: topo y=0 antes e depois. Nova: topo y=1,08 (esperado 1,02 +/- 0,1). Planta no corte (0,4368) e corte vertical (1,0191) corretos nas duas |
| P3 20° + vertical (4 variantes) | FAIL | FAIL | antiga: vertical. Nova: saliência 1,01 m (+20 dentro), fresta 0,17 m (-20 fora) |
| P5 janela 20° + porta | FAIL | FAIL | plano: janela inclinado, porta vertical, 1 tiltCuts (ok nas duas). Esquadria 3D da janela desvia 0,93 m do eixo inclinado nas duas |
| P6 Inclinação visível e criação | PASS | PASS | campo visível sem rolar (ratio 1, y=324); parede desenhada por cliques nasce com tilt 15 |
| P7 30 paredes 15° | FAIL | FAIL | corte e elevação não terminam em ~9 s (marcado 99999). Linha de base 30 verticais: corte 155 / 164 ms, elevação 106 / 100 ms (mediana de 3; também > 100 ms nesta máquina com SwiftShader). Com 6 paredes 15°: corte 7049 ms (vertical 122), elevação 128 |

Uso da interface: P2 usa o campo Inclinação das Propriedades; P6 usa ferramenta, painel e cliques; paredes, aberturas e vistas de corte/elevação por coordenada usam `editor.applyCommand` (hook `?debug=1`).

## Hipóteses de causa (sem corrigir)
- P1/P3 antiga e P2: `buildLevelSolidsComCaixas` (`paredesInstanciadas3d.ts`) transformava parede reta com faixas retangulares em caixas verticais ignorando `tilt`; corrigido em pf/fd (`rw.tilt || tiltCuts || tiltJoinOf` => geometria).
- P1/P3 nova: aviso "a inclinação não cabe na junção com a altura real"; `analyzeLevelTilt` (`wallTiltJoinLevel.ts`) degrada a componente inteira para corte simples (vertical no plano da base) quando o cruzamento em z=H cai fora/cone invertido. Em L de 4 m com altura 2,8 o critério rejeita casos viáveis; o corte simples gera a saliência (lean para dentro) ou fresta (para fora).
- P5: pendência F2.8 do ESTADO: esquadria 3D (`aberturas3d`) fica no plano da base, não no referencial inclinado (`frame` de `openingTiltGeom`).
- P7: custo do corte com parede inclinada cresce de forma explosiva (6 paredes: 7 s): provável recálculo de `analyzeLevelTilt`/`tiltSectionMap` (junção por cota) por parede e por camada em `wallTiltSection.ts`, sem cache por nível.
