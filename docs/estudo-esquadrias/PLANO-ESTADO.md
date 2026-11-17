# Plano de implementação de esquadrias: estado

Base: `00-sintese.md`. Atualizado a cada entrega. Branch: `claude/lucid-bell-hwk4ln`. Retomar: ler esta tabela e seguir a primeira linha não concluída.

Regras: agentes não fazem commit (a coordenação faz); arquivos disjuntos por agente; gate = `npx tsc -p tsconfig.json --noEmit`, `npm run lint` e vitest da área; `max-lines` 420.

| Onda | Item | Modelo | Estado |
|---|---|---|---|
| 0 | 0a/0b IFC export: mapeamentos B1-B8 e psets B9-B11 | Haiku | concluído (460 testes io+ifcExport verdes, tsc limpo); pendentes B12 (IFC4.3), vidro (espessura, temperado) e confirmar SWING_FIXED_* na figura oficial |
| 0 | 0c IFC import: aviso de arco, desempenho e operação da janela | Haiku | concluído (92 testes io/ifcImport); portas (IfcDoorPanelProperties) e i18n do aviso ficam pendentes |
| 0 | 0d A-1, A-2, A-6 (offset, roughOversize, sobreposição por altura) | Sonnet | concluído |
| 0 | 0e docs desatualizados | Haiku | concluído (F-PROGRESSO, PENDENCIAS, ADR 0056); restam 3 linhas de IFC em F-PROGRESSO (19, 35, 40) |
| 0 | 0f validações por norma (avisos) | Haiku | concluído: packages/engine/src/openingNormIssues.ts (15 testes); falta ligar ao motor; valores de resumo público |
| 1 | 1a spike: furo da parede por contorno (meia-lua), só TS | Sonnet | concluído: viável com ressalvas (docs/estudo-esquadrias/09-spike-furo-por-contorno.md) |
| 1 | 1a-C spike caminho C (colunas inclinadas), só TS | Sonnet | concluído: viável com ressalvas (docs/estudo-esquadrias/12-spike-colunas-inclinadas.md); falta decisão A x C pelo dono |
| 1 | 1b modelo `OpeningShape`, `outline()`, validação | Haiku | concluído em packages/model/src/openingShape.ts (35 testes); falta exportar no index, campo no OpeningType e migração |
| 1 | 1c spike Rust do furo (`furo_contorno.rs`, manifold-rust =0.19.2) | Sonnet | concluído: 8 testes verdes (volume = área x espessura, malha fechada); .wasm cresce ~1,07 MB (+40%) quando usado; NOTICE e tempo real por medir (docs/estudo-esquadrias/19-spike-rust-furo.md) |
| 2 | peças, planta/corte/elevação, 3D, DXF, composição | Haiku/Sonnet | pendente |
| 3 | IFC com perfil, Rust (furo e retorno), esquema | Haiku/Sonnet | pendente |
| 4 | UI, alças, catálogo, quadro, interoperabilidade | Haiku/Sonnet | pendente |
| 5 | objetos compostos (opcional) | - | a decidir |
