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
| K1 | mesclada | merge de estr/K1 | 0 | contrato versão 19 (seções 200–206, consultas 200–207, CONGELADO); cargo test 477+6; clippy 39 (= base), nenhum aviso em secoes_estr.rs; binário WASM reproduzível; test:wasm 1334; test:rapido 976 arq / 11392. Emenda de escopo aceita: abi2.rs e 2 fixtures de paridade (só 18→19; mudam juntas na renumeração). Colunas no `$comentario` v19 do cena-v11.json. Pendências: `Cena::invalidar_caches` não conhece as seções 200–206 (K2 acrescenta `SecoesEstr::e_minha` ao retorno antecipado); peso = volume × densidade calculado no TS; camadas do pilar arq. viajam só como soma de espessuras. |
| K2 | mesclada | merge de estr/K2 | 0 | cargo test 495+6; clippy 39 (= base), nenhum aviso em estr_*; binário WASM reproduzível; test:wasm 1336 / 55 arq; test:rapido 976 / 11392; escopo e atalhos conferidos. API para K3: `estr_prisma::{triangular, Quadro3, extrudar, volume, area_triangulada}`, `estr_malha::{PerfilMalha, MalhaEstr::adicionar, cota_do_nivel}`, constantes CATEGORIA_FUNDACAO/PARTE_BASE/PARTE_PESCOCO. LOD só muda os lados do círculo (24/48/96). Pilar com topo ≤ base+1 mm ou elemento ruim derruba a consulta 200 inteira com ENTRADA (decisão do agente: manter). |
| K3 | pendente | | 0 | |
| K4 | pendente | | 0 | |
| U1 | mesclada | merge de estr/U1 | 0 | typecheck ✔, lint ✔, test:rapido 981 arq / 11461 testes; escopo e atalhos conferidos pelo fiscal. Pontos de ligação para o R1: `definirPerfilContorno(fn)` (consulta 205) e `definirLeituraEstr(fn)` (consulta 203). Pendências: navegador de projeto não lista os novos tipos (T1); es/de/fr/it/pl com texto em inglês até a I18; PerfilEditor/PerfilPreview em ui/dialogs/. |
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
