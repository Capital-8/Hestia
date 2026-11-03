# Decisão 0034 · Esquadrias v2 (modelo único, editor e representação)

Decidido em 2026-10-26 com o dono, a partir de [D](../aberturas/D-editor-esquadrias-revit-archicad.md) e do protótipo.
Especificação técnica: [E](../aberturas/E-spec-modelo-unico.md).

1. **Modelo único.** Planta, corte, elevação, 3D, DXF e a prévia do diálogo desenham as peças de `buildOpeningModel`.
2. **Linha de abertura (V).** O vértice fica no lado **oposto** ao da dobradiça (lado do trinco); a posição da dobradiça é
   configurável (instância `flipHand`, padrão no tipo). A convenção é configurável no projeto
   (`ProjectSettings.openingLine`): `apex: 'latch' | 'hinge'` e `dashed: 'toward' | 'away'`. Substitui a convenção de 0024 §2.
3. **Bandeiras e vidros fixos** não levam linha de abertura.
4. **Colocação (estilo Revit).** O lado do cursor define o sentido; Espaço inverte a dobradiça; Tab inverte o sentido.
5. **Diálogo do tipo (estilo ArchiCAD).** Seções recolhíveis, biblioteca, 5 prévias, nível de detalhe 2D/3D.
6. **Schema fechado** (0017 §9) mantido; todo campo novo é opcional com padrão por leitura (`SCHEMA_VERSION` não muda).
7. **Famílias novas** (embutir, vai-e-vem, dobrável, sanfonada, seccionada, janela de abrir, guilhotina, pivotante,
   veneziana) entram na onda 2.

## Estado de implementação (2026-10-26)

Implementado por agentes opencode (modelo flash) em worktrees isoladas e integrado por revisão; os relatórios de cada
tarefa estão em relatorios-v2 (removidos; ver histórico do git).

- **Modelo único** `buildOpeningModel` (`packages/engine/src/openingModel*.ts`) para as 19 famílias; planta
  (`openingPlan.ts`), linhas de abertura (`openingLines.ts`), corte e elevação (`render/section`), 3D (`openingParts.ts`),
  DXF e IFC desenham as mesmas peças.
- **Convenção do V**: vértice no lado do trinco, tracejado ao abrir para o observador; configurável em
  `ProjectSettings.openingLine`. Bandeira e vidro fixo não levam linha.
- **Planta**: folha com espessura, batente com rebaixo/batedor no núcleo da parede, folha aberta e arco. Nível de detalhe
  por tipo (`detail2d`) ou por zoom: baixo até 20 px/m, médio até 100 px/m, alto acima. Os pesos de traço do símbolo foram
  agrupados em 3 classes e o orçamento de draw calls do prédio de 10 pavimentos a 60 px/m passou de 80 para 100
  (`gpuPlan.test.ts`), custo conhecido do símbolo mais rico.
- **Colocação**: prévia com símbolo, sentido pelo cursor com histerese, âncora, captura (centro do trecho, folga da quina,
  eixo alinhado), cotas temporárias, alças ⇅ ⇄, cotas editáveis e etiquetas (`showOpeningTags`).
- **Diálogo do tipo**: três colunas, sete seções, biblioteca com miniaturas, 5 prévias reais (planta, elevação, corte em três
  quadros, 3D linhas e sombreado, com a parede em um único sólido), verificações (`openingChecks`).
- **Famílias novas**: vai-e-vem, embutir, dobrável, sanfonada, seccionada, janela de abrir, guilhotina, pivotante e
  veneziana, com 9 tipos pré-cadastrados novos (23 no total) e o template "Mostruário de esquadrias".
- **Pendências conhecidas**: baselines visuais (`tests/e2e/baseline*`) que incluem esquadrias precisam ser regravadas no
  ambiente de referência (`UPDATE_BASELINE=1 npm run test:visual`); V de abertura no corte transversal não é desenhado
  (só na vista de face); portão seccionado sobe sem recolher para o teto.
