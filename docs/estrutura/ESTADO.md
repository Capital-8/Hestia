# Estrutura: estado

Passo 0 concluído (2026-11-13). Portão do clippy: total ≤ 39 e arquivo novo sem aviso. Retome da primeira ficha não mesclada.

Linha de base (`main` em 236aa298, esquema 25, kernel v18): ver tabela abaixo (preenchida pelo fiscal).

| Comando | Resultado |
|---|---|
| typecheck | passou |
| lint | passou (avisos antigos de base, "não tem mais ocorrências") |
| cargo test geom-wasm | 468 + 6 passam (1 ignorado) |
| cargo clippy geom-wasm | 39 avisos (componente clippy instalado com rustup) |
| test:rapido | 969 arquivos / 11316 testes (1 todo), 452 s |

Modo de execução: subagentes. Trabalho mecânico (i18n, registros, conferências, limpeza): **Haiku 5.5, esforço médio**. Fichas de lógica: modelo padrão. K2, K4 e V1: o mais forte disponível.

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
|---|---|---|---|---|
| M1 | mesclada | merge de estr/M1 | 0 | typecheck ✔, lint ✔, test:rapido 976 arq / 11392 testes; escopo e atalhos conferidos pelo fiscal; SCHEMA_VERSION 26. Pendências: espelhar pilar/fundação não reflete perfis assimétricos (L, personalizado) — decidir em T1/K4; COLETORES entram com `entra:false` (R1 troca para true); pesos de linha das categorias são palpite; camadas DXF HESTIA-* ficam para I1. |
| K1 | pendente | | 0 | |
| K2 | pendente | | 0 | |
| K3 | pendente | | 0 | |
| K4 | pendente | | 0 | |
| U1 | pendente | | 0 | |
| R1 | pendente | | 0 | |
| T1 | pendente | | 0 | |
| I1 | pendente | | 0 | |
| I18 | pendente | | 0 | Haiku 5.5 médio |
| V1 | pendente | | 0 | |

## Decisões do dono (data, pergunta, resposta)
- 2026-11-13: dois tipos de pilar (arquitetônico e estrutural), cada um no seu lugar (Arquitetura e Estrutura); todos os perfis desde o início; geometria sempre no kernel Rust; escopo Pilar, Viga e Fundação; executar sem parar até a conclusão; trabalho mecânico só com Haiku 5.5 em esforço médio.

## Sincronizações com a main (data, commit da main, conflitos, o que foi renumerado)
- 2026-11-13: base `main` 236aa298 (esquema 25, kernel v18). Terreno e massa usam esquema 26 e kernel v19 em outras branches: esta frente usa 26 provisório e renumera na sincronização (PLANO B.7).

## Pendências conhecidas
- Treliça (frente seguinte): a Viga já grava `extremidadeA/B`.

## Lições de processo
- Autodesk e Graphisoft bloqueados pela rede: referência vem do repositório.
