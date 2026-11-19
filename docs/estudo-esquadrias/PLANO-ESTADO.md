# Plano de implementação de esquadrias: estado final desta rodada

Data: 2026-11-19. Branch: `claude/lucid-bell-hwk4ln` (mesclada com `origin/main`, ver doc 35). Resumo para quem vai mesclar: `RESUMO-PARA-MESCLAGEM.md`. Lista do que não foi feito: `FALTA-PARA-PONTA-A-PONTA.md`. [V] = verificado por teste ou leitura; [I] = inferência.

| Frente | Entrega | Estado | Docs |
|---|---|---|---|
| Estudo | Auditoria, Lapin, Archicad/Revit, formas, normas, IFC, CreaBIM, síntese | concluído (normas só por resumo) | 00 a 08, 13 a 18, 20 |
| Decisão | Caminho A (booleana 3D em Rust, `manifold-rust`); C (colunas) descartado | concluído | 09 a 12, 19 |
| Modelo | `OpeningShape`: retângulo, meia-lua, abatido, ogival, círculo, empena, trapézio, ferradura, polígono; validação; `OpeningType.shape` opcional | concluído | 32 |
| Rust | Furo por contorno, do prisma pós-junção, parede curva (cortador radial em leque), quantificação e retorno; ABIs sem panic | concluído (89 testes) | 19, 21, 22, 25, 33 |
| Engine/3D | Troca atômica: 3D, planta, quantitativo, quadro; parede com topo em perfil; área de face real | concluído | 24, 26, 27, 33 |
| Peças | Batente, alizar, folha, vidro, bandeira, trilho, divisões decorativas, esquadria menor que o vão; folhas de correr recortadas na posição fechada | concluído | 28, 37 |
| Vistas | Corte, elevação e DXF (bulge) com o contorno | concluído (peças fora do corte) | 29 |
| IFC | Perfil do vão e das peças, Lining/Panel, Qto real, import da forma | concluído; sem validação em visualizador | 23, 30 |
| Quadro/param. | Quadro executivo opt-in, folga de assentamento, aviso de transpasse de verga | concluído (quadro executivo só em pt/en) | 31 |
| Avisos | Normas em portas (vão livre, soleira, vidro seguro), forma inválida, vão fora do envelope | concluído; valores de resumo público | 33 |
| Interface | Painel "Forma do vão", validação ao vivo, preview, editor de polígono, 8 tipos de catálogo (162 no total) | concluído; sem alças na planta/elevação | 34 |
| App real | Diagnóstico `__hestiaFuro`; correção do 3D (parede virava caixa); veneziana visível; verificação visual no Chromium | concluído | 36, 38 |
| Mescla | `origin/main` (800 commits) resolvida; wasm regenerado (4,1 MB, teto 5 MB) | concluído | 35 |

## Pendente (resumo; detalhes em `FALTA-PARA-PONTA-A-PONTA.md`)
Parede inclinada (segue retangular com aviso); alças de edição na planta e elevação; validação do IFC em visualizador; verga e soleira no retorno retangular (decisão do dono, muda números); quadro executivo em 5 idiomas; carga sob demanda do furo para reduzir o wasm; objetos compostos (bay, portões, cobogó); dimensões de catálogo com fonte primária; revisão das traduções por falante nativo.
