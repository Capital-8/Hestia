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
| 2 | ABI WASM do furo (`furo_contorno_furar`), 10 testes (doc 21) | Haiku | concluído; sem cliente TS e sem build:wasm; auto-interseção do contorno pode causar panic (validar antes) |
| 2 | quantitativo e retorno do vão com contorno (Rust, 12 testes, doc 22) | Sonnet | concluído; junção de paredes só em plano (doc 22 §4.3); verga/soleira no retorno é decisão do dono |
| 2 | vistas do contorno: elevação, corte horizontal/vertical, símbolo em planta (`openingShapeViews.ts`, 29 testes) | Haiku | concluído; não ligado à planta |
| 2 | IFC: perfil do vão em contorno livre (`ifcOpeningProfile.ts`, 18 testes, doc 23) | Haiku | concluído; não ligado ao export; sem validação em visualizador |
| 2 | ligar o furo: forma em `OpeningType`, despacho, 3D, planta, quantitativo e quadro (docs 24, 26, 27) | Sonnet | concluído e verificado com o Rust real (18 testes e2e wasm); vão retangular idêntico; falta rodar no navegador e medir tempo |
| 2 | ainda retangulares com forma: vista de corte, elevação, DXF, IFC (módulo pronto, não ligado ao export), retorno em canto, `furo_quant_parede` não chamada | Haiku/Sonnet | pendente |
| 3 | build:wasm (3,70 MB, teto 4 MB), NOTICE, cliente TS da ABI e instalação em `kernelDespacho.ts` | Sonnet | concluído |
| 3 | goldens visuais, esquema da cena v20, interface (alças, catálogo com arcos), carga sob demanda do furo para reduzir o wasm | Haiku/Sonnet | pendente |
| 4 | UI, alças, catálogo, quadro, interoperabilidade | Haiku/Sonnet | pendente |
| 5 | objetos compostos (opcional) | - | a decidir |
