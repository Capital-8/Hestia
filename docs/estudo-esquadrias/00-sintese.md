# Estudo de esquadrias do Hestia: síntese, lacunas e roteiro

Data: 2026-11-17. Consolida as oito frentes (`01` a `08` nesta pasta). Cada frente traz suas fontes e marcas de confiança; esta síntese só aponta o que decide prioridade. Leia as frentes para o detalhe.

## 0. Limites da evidência (leia primeiro)

- **Nenhuma norma ABNT foi lida na íntegra.** Só resumos. Páginas oficiais da Graphisoft, Autodesk, buildingSMART e de órgãos brasileiros estavam bloqueadas pela rede da sessão.
- **Projetos reais brasileiros: nenhum.** A evidência quantitativa vem de IFCs públicos estrangeiros (7 modelos, 804 portas e 761 janelas, frente 07). Não representa o mercado brasileiro.
- **Nada foi executado no Lapin nem no CreaBIM.** Leitura estática. A auditoria do Hestia também foi por leitura, sem rodar o app.
- **Esforços em dias** (frente 02) são estimativas do agente, não medições.
- Itens marcados "inferido" nas frentes continuam inferidos aqui.

## 1. Onde o Hestia está

Forte (frentes 01, 03, 08): composição por células, perfis de batente, `reveal`, `nominalRef`, basculante com eixo, catálogo de 154 tipos (94 portas, 60 janelas, 19 famílias), catálogo brasileiro, quadro de esquadrias, cotas por referência, parede inclinada e cortina. Mais rico que o CreaBIM em modelo e interface.

Fraco:
1. **Vão sempre retangular.** Não existe campo de forma. O retângulo é assumido em cerca de 20 pontos (R1 a R20 na frente 01): furo da parede (prisma por faixa de altura), retorno do acabamento, peças em caixa, composição em grade, planta, corte, 3D, Rust (`a3.rs`), IFC e DXF. Precedente aproveitável: `PartProfile` (seção poligonal), hoje só no batente em L e nas maçanetas.
2. **IFC pobre** (frente 06).
3. **Possíveis defeitos de consistência** (por leitura, não reproduzidos): A-1 a A-6 da frente 01.

## 2. Comparação

| Tema | Hestia | Lapin (MIT) | CreaBIM (GPL, só ideias) | ArchiCAD/Revit |
|---|---|---|---|---|
| Formas do vão | só retângulo | 8 formas + contorno livre, tudo derivado de um contorno | só retângulo | ArchiCAD: WALLHOLE, Opening poligonal; Revit: void |
| Composição | células, perfis, alizar | grade, bandeira em arco, muntins | 4 números de batente | rica |
| Catálogo | 154 tipos, BR | predefinições | 6 tipos | bibliotecas |
| IFC export | 1 sólido por peça num só `IFCDOOR/WINDOW`, sem Lining/Panel, mapeamentos errados | forma só volta por JSON próprio | vão + preenchimento, mão no enum | export nativo |
| IFC import | caixa envolvente, arcos achatados sem aviso | tolerante | tolerante com motivo registrado | n/a |
| Bay, garagem, persianas | ausentes | presentes | ausentes | presentes |

Lição de arquitetura do Lapin: **uma única fonte de geometria (o contorno)** e planta/corte/3D derivam dela sem código por forma. É o desenho a copiar.

## 3. O que a evidência diz sobre prioridade

- Na amostra de IFC, **só 0,43% dos vãos são não retangulares** (4 de 922) e nenhum é arco. Poucos tamanhos dominam (910×2130, 1000×2100, 910×2100). Dimensões e operação frequentemente ausentes (até 74% das janelas sem `OverallWidth`; operação `NOTDEFINED` em 85% das portas de um modelo).
- Isso sustenta: **robustez de import e catálogo com poucos tamanhos bem feitos pesam mais, em volume, do que arcos.**
- Contra-argumento: a amostra é estrangeira e de edifícios modernos. Formas especiais pesam em casas clássicas, reformas e restauro, um diferencial do Hestia. A decisão de priorizar arcos é de produto, não da amostra.

## 4. Lacunas priorizadas

Esforço: P ≤ 1 dia, M 2 a 4 dias, G > 4 dias (estimativas das frentes).

**Fase 0, correções (sem forma nova)**

| # | Item | Fonte | Esforço |
|---|---|---|---|
| 0.1 | Mapeamentos de operação e partição no IFC (B1 a B8: pivotante virando `REVOLVING`, folhas de porta ignoradas, 4+ folhas virando `TRIPLE_PANEL_VERTICAL` etc.) | 06 | P |
| 0.2 | Psets (B9 a B11): `SolarHeatGainTransmittance` no pset errado, tipos de medida, `Reference` | 06 | P/M |
| 0.3 | Import: arcos (`IfcArcIndex`) hoje achatados **sem aviso**; ao menos avisar | 06 | P |
| 0.4 | Import: repovoar `fireRating`, `uValue`, `acousticRw` e operação da janela | 06 | M |
| 0.5 | Reproduzir e corrigir A-1 (`offset` com duas leituras, aviso `abertura-fora-da-parede`), A-2 (`roughOversize` no IFC), A-6 (`opening-overlap` ignora altura) | 01 | P a M |
| 0.6 | Atualizar docs: 130 vs 154 tipos, pendência de IFC "caixa única", ADR 0056, `keepOpeningFrame` | 01 | P |
| 0.7 | Regras de validação: vidro de segurança em porta (NBR 7199:2025 via resumo), vão livre 0,80×2,10 m, soleira ≤ 5 mm (NBR 9050) | 05 | M |

**Fase 1, IFC e dados** (independe de forma)

| # | Item | Fonte | Esforço |
|---|---|---|---|
| 1.1 | Exportar `Ifc*LiningProperties` e `Ifc*PanelProperties` (um painel por folha) | 06 | M |
| 1.2 | `Qto_Door/WindowBaseQuantities`, classificação (NBR 15965 / bSDD, a confirmar) | 06 | P/M |
| 1.3 | Parâmetros editáveis: folga de assentamento por sistema, transpasse de verga com aviso de que o estrutural prevalece | 05 | M |
| 1.4 | Quadro de esquadrias: colunas do executivo, espelhar linhas por tipo | 05, 02 | M |
| 1.5 | Suíte de interoperabilidade com IFCs públicos e `ifcopenshell.validate`/IDS | 06, 07 | M |

**Fase 2, forma do vão (o núcleo)**

Modelo proposto, convergente entre as frentes 04, 06 e 02: `OpeningShape` que **sempre produz um contorno fechado** (polilinha com bulge), com geradores paramétricos e `polygon`/`custom` como escape:

```ts
type OpeningShape =
  | { kind: 'rect' }
  | { kind: 'arch'; rise: number }          // arco pleno quando rise = largura/2
  | { kind: 'segmental'; rise: number }     // abatido
  | { kind: 'pointed'; rise?: number }      // ogival
  | { kind: 'round' }                       // óculo, diâmetro = largura
  | { kind: 'ellipse' }
  | { kind: 'gable' }                       // empena
  | { kind: 'trapezoid'; topWidth: number }
  | { kind: 'polygon'; points: Array<{ u: number; v: number }> } // 0..largura, 0..altura
```

Formas candidatas, em ordem de impacto estimado (frente 04, inferido): arco pleno, abatido, peraltado, circular, triângulo/empena, trapézio; depois ogival, ferradura, elipse, polígono. Fórmula do arco abatido: R = (c²/4 + f²)/(2f); ogival equilátero R = c, f ≈ 0,866·c.

Etapas sugeridas (a ordem importa: motor antes da interface):
1. **Contorno como fonte única** (função `outline(shape, w, h, inset)` com regra de cordas por erro de 1 mm, como no Lapin) e testes de invariantes (área, tudo dentro do vão, topo ≤ altura; o Lapin tem um caso suspeito com arco pleno quando `H − 0,15 < w/2`).
2. **Furo da parede** pelo contorno (hoje prisma retangular por faixa; maior risco técnico, inclui contrato TS/Rust). **Spike de 1 a 2 dias antes de comprometer o restante.**
3. **Peças**: batente em arco via perfil varrido ou `PartProfile`, vidro, folha, alizar acompanhando o contorno.
4. **Planta, corte, elevação, 3D, DXF** derivados do contorno.
5. **Composição**: bandeira em arco com barras (leque, montantes, cruz) e muntins (colonial, prairie, losango); `Transom=false` para folha que segue o arco.
6. **IFC**: exportar perfil do vão (`IfcArbitraryClosedProfileDef`/`IfcIndexedPolyCurve` com `IfcArcIndex`, círculo por `IfcCircleProfileDef`) e importar de volta; `OverallWidth/Height` = caixa envolvente.
7. **UI**: seletor de forma e preview. Corrigir o desvio da interface do Lapin (fórmulas diferentes do motor) como lição: uma só função para ambos.

Esforço da fase 2: Lapin estima 35 a 55 dias para o núcleo ponta a ponta. Tratar como ordem de grandeza.

**Fase 3, objetos compostos**: janela de canto, bay/bow, dormer, claraboia, portões de garagem, pele de vidro, cobogó/venezianas, persianas externas (frente 04 §9, frente 02). Cada um exige decisão de modelo própria. Lapin estima 25 a 37 dias para bay, garagem e acessórios.

## 5. Decisões que são suas

1. **Prioridade de produto**: formas especiais já (fase 2) ou primeiro IFC e correções (fases 0 e 1)? A evidência disponível favorece 0 e 1; o diferencial de mercado pode favorecer 2.
2. **Dados brasileiros reais**: quadros de esquadrias e IFCs de projetos seus mudariam a priorização com a evidência que falta.
3. **Reutilização do Lapin**: é MIT. Recomendo reimplementar a partir das fórmulas e citar no `NOTICE`. CreaBIM é GPL: não copiar código.
4. **Acesso a fontes**: se a rede liberar `cbic.org.br`, `caixa.gov.br`, `standards.buildingsmart.org` e hosts de fabricantes, as frentes 03, 05 e 06 podem fechar os itens inferidos.

## 6. Pesquisa ainda por fazer

NBR 9050, 10821, 6492, 14718, 7199:2025 e Guia de Esquadrias CBIC 2017 (texto completo ou resumo oficial); IT 11 e IT 08 do CBPMESP; tabelas técnicas de fabricantes brasileiros; quadros de esquadrias executivos reais; valores de `PartitioningType` para arco; o que o Revit grava em Lining/Panel Properties; tratados clássicos de proporção de vãos.

## 7. Mapa dos documentos

| Arquivo | Conteúdo |
|---|---|
| `01-auditoria-hestia.md` | estado do Hestia, 20 pontos de retângulo, catálogo, achados A-1 a A-6 |
| `02-lapin.md` | Lapin: formas, contorno, bandeira, muntins, matriz de transferência |
| `03-archicad-revit.md` | parametrização ArchiCAD e Revit |
| `04-formas-e-tipologias.md` | tipologias reais, fórmulas, modelo `OpeningShape` |
| `05-normas-e-mercado-brasil.md` | NBR (por resumo), dimensões, quadro, programas públicos |
| `06-ifc-interoperabilidade.md` | enums, psets, matriz Hestia↔IFC, bugs B1 a B17, recomendações |
| `07-evidencia-projetos-reais.md` | estatística em 7 IFCs públicos |
| `08-creabim.md` | CreaBIM (GPL, só ideias) |
