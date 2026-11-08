# Validação da geometria extraída pelo app com projetos reais

**Estado:** medido em 6 projetos reais, em Node (cena 3D em CPU, sem GPU e sem navegador). Resultado resumido: a extração
cobre a geometria desenhada em 5 dos 6 projetos; **um snapshot grande não cabe no quadro de 64 MiB** do protocolo 1.x; há
divergências residuais que ainda não foram explicadas. Nada disto altera o contrato do protocolo.

## Método
`npx vite-node scripts/validar-geometria-plugin.mts <projeto.hestia.json>... [--json saida.json]`
1. `migrateProject`, `resolveLevel` de todos os níveis e `ModelScene.update` (como o app, estilo realista, arestas e sombras).
2. Extrai com `extractElementMeshes`/`buildSceneContent` (o código do plugin, `apps/web/src/plugins/sceneExport.ts`).
3. Compara com a verdade independente da própria cena: `ModelScene.exportarVetores()` (todos os triângulos de face visíveis,
   em coordenadas de mundo, **instâncias incluídas**). Casamento por centroide (1 mm) e área (0,1 % + 1e-5 m²): coincidentes se anulam.
4. Mede elementos sem malha, inventário de malhas, tamanho e tempo do snapshot (JSON do `scene.snapshot`) e de um delta.
Os projetos só são lidos (nunca copiados). Dados brutos: `reports/geom.json` e `reports/geom-orla.json`.

## Resultados
| Projeto | Níveis | Elementos | Triângulos | Sem malha | Divergência geométrica | Snapshot | Extrair + montar + serializar |
|---|---|---|---|---|---|---|---|
| Casa térrea 2 quartos | 2 | 21 | 6 884 | 0 | 0 | 0,35 MiB | 14 + 13 + 9 ms |
| Casa de alto padrão | 3 | 75 | 19 966 | 6 portas | 0 | 1,02 MiB | 18 + 16 + 16 ms |
| Projeto sem título | 2 | 22 | 4 912 | 0 | 0 | 0,34 MiB | 4 + 4 + 5 ms |
| Edifício Multifamiliar | 11 | 1 914 | 317 620 | 0 | 0 | 20,81 MiB | 387 + 350 + 315 ms |
| edificio-dwg v2 | 11 | 1 853 | 371 340 | 0 | **4 (0,001 %)** | 23,17 MiB | 437 + 401 + 511 ms |
| CAS_LOJA MASTER ORLA (arquivo de 165 MB) | 4 | 1 779 | 762 148 | **3 paredes** | **23 218 (3,0 %)** | **71,1 MiB** | 1 181 + 1 138 + 1 216 ms |

(Com tolerância de área absoluta de 1e-7 m² havia 38 triângulos divergentes no edificio-dwg v2; com 1e-5 m² restam 4. Ver "Divergências".)
Tempos de montar a cena 3D (já existente no app, não do plugin): 0,1 a 0,3 s nas casas, 4 a 10 s nos prédios e 10,6 s no ORLA.

## O que foi confirmado
- **Cobertura por contagem:** triângulos extraídos = triângulos desenhados nos 6 projetos.
- **Cobertura geométrica independente:** coincide por centroide e área em 4 projetos (0 divergências) e em ≥ 99,99 % no edificio-dwg v2.
- **Todos os tipos presentes:** parede, porta, janela, laje, escada, piso, telhado e elemento genérico (importado).
- **Paredes e esquadrias instanciadas** (caixas) saem pela malha de seleção invisível (`caixasPick`), que tem a mesma geometria
  das instâncias (mesmo número de triângulos, centroides coincidentes). **Dependência frágil:** se o app mudar a malha de
  seleção, a extração perderia as instâncias sem erro. O script acima detecta isso (a verificação independente falharia).
- **Sem malhas órfãs:** nenhuma malha extraída aponta para elemento que não existe no projeto.

## Malhas ausentes
- **6 portas de "Vão livre"** na casa de alto padrão (`ot_vao180`, `ot_vao240`): são aberturas sem folha nem batente; **não têm
  geometria por definição**. O vão na parede já está na malha da parede. Comportamento correto.
- **3 paredes no ORLA** (`w_0e2McIPkX58goXklOuItZM` e duas mais): sem malha na cena; causa **não investigada** (parede degenerada ou
  fora de nível montado?). Pendente.
- **Ambientes (`room`)** não entram como entidade: são anotação, sem sólido (decisão do `buildSceneContent`).

## Tamanho e tempo do snapshot
- A posição saía como `0.10000000149011612` (float32 expandido em JSON). Arredondar a 1 µm na extração (`sceneExport.ts`) reduziu o
  snapshot do edificio-dwg v2 de **49,6 MiB para 23,2 MiB** (de ~140 para ~65 bytes por triângulo) sem perda visível.
- **Quadro máximo = 64 MiB** (`MAX_FRAME_CHARS` no TypeScript e `max_message_size` no Rust). O **ORLA (762 k triângulos) gera 71,1 MiB e
  não passaria**: a conexão seria encerrada com `bad_frame` fatal. O limite prático fica em ~0,65 a 1 M triângulos.
- Delta de edição de uma parede: 2 a 150 KB e 1 a 8 operações (inclui as aberturas hospedadas). Os milissegundos do script incluem
  re-resolver e remontar a cena inteira em CPU; **não** representam a edição incremental do app. No ORLA a edição caiu numa das
  paredes sem malha (0 operações): não é um bom caso de delta.
- **Proposta (não implementada, exige mudar o protocolo, em PR separada):** snapshot em partes (`scene.snapshot.begin`, `scene.chunk`,
  `scene.snapshot.end`) e/ou posições como `Float32Array` em base64 ou quadro binário. Estimativa: base64 de float32 + índices uint32
  reduz o ORLA a ~20 MiB; chunking elimina o teto.

## Divergências residuais
- **edificio-dwg v2: 4 triângulos** (de 371 340) depois de afrouxar a área. Eram 4 triângulos por laje (13 lajes de pavimento), na
  casa de 1 mm². Hipótese: fatias finas com erro de float32 em coordenadas de ~30 m. **Não provado.**
- **ORLA: 23 218 triângulos (3,0 %)**, todos em elementos genéricos importados (332 elementos), perto de z = 0,004 m e com
  triângulos minúsculos. Pode ser a mesma causa (ruído de float32 em triângulos pequenos) ou uma diferença real; **não foi
  explicado**. Antes de confiar na geometria de genéricos importados, comparar por vértice (e não por centroide/área).

## Limitações desta validação
- Cena 3D em **CPU no Node**; o app no navegador monta os níveis progressivamente e pode ter malhas ainda não montadas.
  `prepararCena3D()` monta tudo antes da leitura, mas **isto não foi exercitado no navegador** nem com GPU.
- Visibilidade por vista (ocultar, isolar, revelar) e níveis ocultos não foram testados.
- Tipos que não aparecem nestes projetos (forro, rampa, desenho CAD) **não** estão validados.
- A geometria passou só pela verificação em Node. A etapa seguinte deve ser o mesmo exame **dentro do app** e entregue ao
  renderizador Rust real.

## Próximos passos
1. Investigar as 3 paredes sem malha e as divergências dos genéricos do ORLA (comparação por vértice).
2. Protocolo: snapshot em partes e/ou posições compactas (proposta separada, compatível com 1.1).
3. Rodar o mesmo script dentro do app (navegador) e conferir contra `prepararCena3D()`.
4. Só então ligar o desenho no renderizador Rust.
