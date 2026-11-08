# Validação da geometria extraída pelo app com projetos reais

**Estado:** medido em 6 projetos reais em Node (cena 3D em CPU) e, para 4 deles, **dentro do app no navegador** (ver "Validação dentro do app"). Resultado resumido: a extração
cobre a geometria desenhada nos 6 projetos (comparação exata); **um snapshot grande não cabe no quadro de 64 MiB** do protocolo 1.x. Nada disto altera o contrato do protocolo.

## Método
`npx vite-node scripts/validar-geometria-plugin.mts <projeto.hestia.json>... [--json saida.json]`
1. `migrateProject`, `resolveLevel` de todos os níveis e `ModelScene.update` (como o app, estilo realista, arestas e sombras).
2. Extrai com `extractElementMeshes`/`buildSceneContent` (o código do plugin, `apps/web/src/plugins/sceneExport.ts`).
3. Compara com a verdade independente da própria cena: `ModelScene.exportarVetores()` (todos os triângulos de face visíveis, em
   coordenadas de mundo, **instâncias incluídas**). A comparação é **exata**: a extração roda sem o arredondamento de 1 µm (mesma
   aritmética da cena, logo mesmos bits em float32) e os triângulos (3 vértices, ordem irrelevante) são comparados como multiconjuntos.
4. Mede elementos sem malha, inventário de malhas, tamanho e tempo do snapshot (JSON do `scene.snapshot`) e de um delta.
Os projetos só são lidos (nunca copiados). Dados brutos: `reports/geom.json` e `reports/geom-orla.json`.

## Resultados
| Projeto | Níveis | Elementos | Triângulos | Sem malha | Divergência geométrica | Snapshot | Extrair + montar + serializar |
|---|---|---|---|---|---|---|---|
| Casa térrea 2 quartos | 2 | 21 | 6 884 | 0 | 0 | 0,35 MiB | 14 + 13 + 9 ms |
| Casa de alto padrão | 3 | 75 | 19 966 | 6 portas | 0 | 1,02 MiB | 18 + 16 + 16 ms |
| Projeto sem título | 2 | 22 | 4 912 | 0 | 0 | 0,34 MiB | 4 + 4 + 5 ms |
| Edifício Multifamiliar | 11 | 1 914 | 317 620 | 0 | 0 | 20,81 MiB | 387 + 350 + 315 ms |
| edificio-dwg v2 | 11 | 1 853 | 371 340 | 0 | 0 | 23,17 MiB | 437 + 401 + 511 ms |
| CAS_LOJA MASTER ORLA (arquivo de 165 MB) | 4 | 1 779 | 762 148 | 3 paredes (cobertas) | 0 | **71,1 MiB** | 1 181 + 1 138 + 1 216 ms |

(Divergência = triângulos que a cena tem e o plugin não, ou o contrário, em comparação exata de multiconjuntos.)
Tempos de montar a cena 3D (já existente no app, não do plugin): 0,1 a 0,3 s nas casas, 4 a 10 s nos prédios e 10,6 s no ORLA.

## O que foi confirmado
- **Cobertura por contagem:** triângulos extraídos = triângulos desenhados nos 6 projetos.
- **Cobertura geométrica independente:** os conjuntos de triângulos são **idênticos** (0 faltando, 0 sobrando) nos 6 projetos, inclusive o ORLA com 762 148 triângulos.
- **Todos os tipos presentes:** parede, porta, janela, laje, escada, piso, telhado e elemento genérico (importado).
- **Paredes e esquadrias instanciadas** (caixas) saem pela malha de seleção invisível (`caixasPick`), que tem a mesma geometria
  das instâncias (mesmo número de triângulos, centroides coincidentes). **Dependência frágil:** se o app mudar a malha de
  seleção, a extração perderia as instâncias sem erro. O script acima detecta isso (a verificação independente falharia).
- **Sem malhas órfãs:** nenhuma malha extraída aponta para elemento que não existe no projeto.

## Malhas ausentes
- **6 portas de "Vão livre"** na casa de alto padrão (`ot_vao180`, `ot_vao240`): são aberturas sem folha nem batente; **não têm
  geometria por definição**. O vão na parede já está na malha da parede. Comportamento correto.
- **3 paredes no ORLA** (`w_0e2McIPkX58goXklOuItZM`, `w_0gi2_O$i52JB28z50bVCqs`, `w_2ycysLSlf16Qur0$hTnm0v`): estão **totalmente cobertas por paredes
  maiores colineares** do mesmo nível (a primeira e a segunda por `w_0XNWTmNp`, de 28 m; a terceira por `w_39cCBE9o`), e a regra de
  parede sobre parede (decisão 0044) não gera sólido para a coberta. Comportamento esperado do motor, não perda do plugin. As esquadrias
  hospedadas nelas (3 e 6) saem normalmente.
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

## Divergências
Nenhuma na comparação exata. Registro: comparadores por centroide e área, e por vértice com tolerância e casamento guloso, mostraram
"divergências" de 38 triângulos (edificio-dwg v2) e 23 218 (ORLA); eram **artefatos do comparador** (ruído de float32 em triângulos
pequenos e casamento guloso), e sumiram na comparação exata. A quantização de 1 µm da exportação desloca cada vértice em ≤ 0,5 µm
(abaixo da resolução do float32 a 44 m, ~4 µm).

## Validação dentro do app (navegador)
`tests/e2e/plugin-geometria.mjs` abre o projeto no editor real (Chromium com WebGL por software, servidor de desenvolvimento do Vite, kernel Rust/wasm ativo como em
produção), lê a cena **viva** (`lerCena3D()`/`prepararCena3D()`, o mesmo caminho do plugin) e compara com `exportarVetores()` da cena do navegador. Dados: `reports/geom-app.json`.

| Projeto | Triângulos da cena | Faltando / sobrando | Sem malha | Snapshot | Extrair exato + montar + serializar (navegador) |
|---|---|---|---|---|---|
| Casa térrea 2 quartos | 6 884 | 0 / 0 | 0 | 0,35 MiB | 22 + 17 + 7 ms |
| Casa de alto padrão | 19 984 | 0 / 0 | 6 portas (vão livre) | 1,02 MiB | 55 + 43 + 19 ms |
| edificio-dwg v2 | 371 544 | 0 / 0 | 0 | 23,2 MiB | 1 058 + 851 + 379 ms |
| Edifício Multifamiliar | 318 172 | 0 / 0 | 0 | 20,9 MiB | 851 + 734 + 346 ms |

- **Igual ao Node:** os conjuntos de triângulos do plugin e da cena viva são idênticos nos 4. A cena do navegador tem de 18 a 204 triângulos a mais que a do
  Node nos mesmos projetos (19 984 contra 19 966; 371 544 contra 371 340), diferença do caminho do kernel Rust/wasm do app; o plugin acompanha a cena viva.
- **Cena disponível antes de abrir a vista 3D:** com o projeto aberto e a planta ativa, `prepararCena3D()` devolveu a cena e todas as entidades já tinham malha
  (nenhum "nível não montado"). Um plugin lendo da planta recebe a geometria completa.
- **Tempo:** o navegador (WebGL por software, máquina de desenvolvimento) leva cerca de 2 vezes o tempo do Node. Para ~370 mil triângulos: ~2,3 s para extrair, montar
  e serializar o snapshot.
- Sem erros de página nesses 4 projetos.
- **Defeito separado, fora do plugin:** abrir `Projeto sem título` (`Documents\pasta`) no app lança `ErroDespachoKernel: kernel Rust (fatia B, nível lv_0): kernel v2 (ENTRADA):
  entrada invalida` em `resolveFloors` (via `faixaDaParedeNoTelhado`), **sem nenhum código de plugin em execução**. Como o Rust é o único caminho de produção, o projeto
  não abre limpo. Não corrigido aqui; precisa de investigação própria (fatia B, piso do nível `lv_0`). Esse projeto só foi validado em Node.
- **Não exercitado:** o ORLA (165 MB) no navegador, GPU real (só WebGL por software), `prepararCena3D()` durante montagem progressiva por fases
  (`abrirPorFases`), e visibilidade por vista.

Como rodar: `cd apps/web && npx vite --port 5199`; depois, na raiz,
`HESTIA_URL=http://localhost:5199 CHROME_PATH=<chrome> node tests/e2e/plugin-geometria.mjs <projeto.hestia.json>...`. No sandbox do agente o esbuild precisa de `TEMP`/`TMP` dentro
da área permitida (o `vite build` falhou por "Acesso negado" ao apagar o diretório temporário; o servidor de desenvolvimento funciona).

## Limitações desta validação
- A primeira parte (6 projetos) roda em **CPU no Node**; a validação no navegador cobre 4 projetos (seção anterior), com WebGL por software.
- Visibilidade por vista (ocultar, isolar, revelar) e níveis ocultos não foram testados.
- Tipos que não aparecem nestes projetos (forro, rampa, desenho CAD) **não** estão validados.
- A geometria passou só pela verificação em Node. A etapa seguinte deve ser o mesmo exame **dentro do app** e entregue ao
  renderizador Rust real.

## Próximos passos
1. Protocolo: snapshot em partes (protocolo 1.2) está na PR #25; posições compactas continuam opcionais.
2. Investigar o erro do kernel Rust (fatia B) ao abrir `Projeto sem título`.
3. Repetir no navegador com GPU real, com o ORLA e na abertura progressiva por fases.
4. Só então ligar o desenho no renderizador Rust.
