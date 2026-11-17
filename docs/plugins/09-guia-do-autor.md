# Guia do autor de suplementos

Para quem quer escrever um suplemento do Hestia. Decisão: [0057](../decisoes/0057-suplementos-geral.md). Especificação: [08](08-suplementos-v2.md). Referência completa das portas, comandos e códigos de erro: [10](10-referencia-da-api.md).
Unidades em todo o guia: comprimento em **metro (m)**, área em **metro quadrado (m2)**, volume em **metro cúbico (m3)**, ângulo em **radiano (rad)**, tempo em **milissegundos (ms)**, memória em **mebibytes (MiB)**.

## 1. O que é um suplemento

Um suplemento é uma pasta (ou um arquivo `.hestiapkg`, que é um zip) com um `manifest.json` na raiz e, conforme o tipo, um arquivo de código. O manifesto **pede** o que o suplemento quer fazer; o usuário **concede**, permissão por permissão, na tela **Suplementos > Gerenciar suplementos**. Instalar nunca executa nada e nunca concede nada.

### Escolha o runtime

| Runtime | Use quando | Código | Onde roda |
|---|---|---|---|
| `declarative` | tabelas de norma, materiais, famílias, verificações e quantitativos que se descrevem em JSON | nenhum | dentro do Hestia (o mais seguro) |
| `script` | precisa de lógica: ferramentas de desenho, importar e exportar formatos, regras complexas | JavaScript (módulo ES, `entry`) | Worker isolado: sem DOM, sem rede, sem armazenamento, com limite de tempo e de memória |
| `external` | integra um programa que já roda no computador (renderizador, IA) | no programa externo | processo separado, WebSocket em `127.0.0.1`; exige token de pareamento ([07](07-pareamento-por-token.md)) |

Este guia trata de `declarative` e `script`. O `external` é o plugin de integração do [0047](../decisoes/0047-plugins-de-integracao.md) e aparece na mesma tela de gestão.

## 2. Passo a passo

### 2.1 Criar

```
npm run suplementos:novo -- com.minhaempresa.contador --nome "Contador"
```

Cria `suplementos-autor/contador/` com `manifest.json`, `main.js` (ambos comentados), `README.md` e `hestia-plugin.d.ts` (tipos para o editor completar `ctx`; esse arquivo não entra no pacote). O `id` é reverso-DNS em minúsculas e **nunca muda** entre versões: é por ele que o Hestia reconhece uma atualização.

Para abrir com tipos no editor, deixe `// @ts-check` no começo do `main.js` e use `/** @param {import('./hestia-plugin').HestiaContext} ctx */` nos handlers.

### 2.2 Escrever

Edite `manifest.json` (o que pede e o que contribui) e `main.js` (cada função **exportada** é um handler que o manifesto pode citar). Regras do script:

1. Toda porta de `ctx` é **assíncrona**: use `await`.
2. `ctx.model` e `ctx.data` só existem se a permissão foi concedida. Teste antes de usar.
3. Para alterar o projeto você devolve **comandos** a `ctx.model.apply(rotulo, comandos)`. O Hestia valida, aplica o lote inteiro (ou nada) e registra **um único** passo de Desfazer.
4. O que o handler devolve é mostrado numa caixa de resultado: texto, `{ title, message }` (textos `{ pt, en }`) ou JSON.
5. Falhou? A exceção vira linha do log do suplemento e aviso na barra de estado; o Hestia segue. Três falhas em 60000 ms desativam o suplemento (estado "falhou"; o usuário vê o motivo e usa **Reativar**).

### 2.3 Testar sem abrir o app

O testkit carrega o manifesto com o **mesmo validador do app**, simula o `ctx` com as portas reais (lista branca de comandos, atomicidade, espaço de dados, portão de permissões) sobre um projeto em memória e roda seu script no mesmo runtime de Worker de produção. Exemplo com vitest:

```ts
import { carregarPasta, criarTeste } from '../../sdk/testkit.ts';

it('conta elementos', async () => {
  const t = await criarTeste(carregarPasta('suplementos-autor/contador'), { grants: ['model.read', 'ui.commands'] });
  expect(await t.call('ola')).toMatchObject({ title: { pt: 'Contagem' } });
  expect(t.temPermissao('model.write')).toBe(false);
  t.fechar();
});
```

O que o `Teste` oferece: `call(handler, ...args)`, `store` (o projeto em memória, para conferir o efeito), `lotes` (cada `model.apply` com o resultado do host), `logs`, `dados()` e `dadosSomenteLeitura()`, `registry` (o que o app mostraria com estas permissões; contribuição sem permissão fica escondida), `temPermissao(cap)` e `fechar()`. `grants` simula a concessão parcial: só vale o que o manifesto pede. Exemplos de uso estão em `tests/sdk.test.ts`.

### 2.4 Empacotar

```
npm run suplementos:empacotar -- suplementos-autor/contador
```

Antes de gerar o `.hestiapkg`, o comando **valida** a pasta com o validador do app e imprime erros legíveis, por exemplo:

```
contador: ERRO
  erro : Permissão desconhecida: "voar" [unknown_capability].
  erro : A permissão "model.write" exige também "model.read"; acrescente-a em "capabilities" [missing_dependency].
  erro : O manifesto cita o handler "calcula", mas "main.js" não exporta essa função [handler_missing].
```

Pasta com erro não gera pacote e o comando termina com código 1 (serve para CI). `--validar` só valida. A saída vai para `<pasta>/dist/<nome>.hestiapkg`. Ficam fora do pacote: `*.d.ts`, `*.test.*`, a pasta `testes/`, `node_modules`, `dist` e arquivos ocultos. Tipos aceitos dentro do pacote: `json`, `js`, `mjs`, `svg`, `png`, `md`, `txt`; `.wasm` e executáveis são recusados. Limites: até 200 arquivos, 8 MiB por arquivo, 16 MiB no total.

### 2.5 Instalar e atualizar

No Hestia: aba **Suplementos > Gerenciar suplementos** (ou **Alt+Shift+P**, ou a busca de comandos) > **Instalar suplemento (.hestiapkg)** ou, em desenvolvimento, **Instalar de uma pasta**. O Hestia mostra o `README.md`, o aviso de **pacote sem assinatura** (aceito com aviso) e as permissões pedidas; nada vem marcado. Depois de **Conceder e ativar**, os botões aparecem na aba Suplementos e os comandos na busca.

Para **atualizar**, aumente `version` (semver `x.y.z`) e use **Atualizar…** no cartão do suplemento. O pacote precisa ter o **mesmo `id`**. As permissões já concedidas continuam; só as **novas** pedem decisão. Se a nova versão aumentar `dataSchema`, projetos salvos com ela ficam **somente leitura** para versões antigas (o gerenciador avisa).

## 3. Permissões

Peça o **mínimo**. O manifesto pode pedir, e o usuário concede ou não:

| Permissão | Dá acesso a | Exige |
|---|---|---|
| `model.read` | `ctx.model.read()`: cópia do projeto | |
| `model.write` | `ctx.model.apply` e `newId`: lotes de comandos validados | `model.read` |
| `plugindata.rw` | `ctx.data`: espaço de dados próprio no projeto (1 MiB) | |
| `ui.commands` | comandos na busca de comandos | |
| `ui.ribbon` | botões na aba Suplementos | `ui.commands` |
| `ui.panels` | painéis laterais declarativos | |
| `ui.dialogs` | diálogos declarativos | |
| `ui.tools` | ferramentas de desenho interativas | `model.write` |
| `io.import` | importadores | `model.write` |
| `io.export` | exportadores | `model.read` |
| `checks.run` | verificações no painel de problemas | `model.read` |
| `content.families` | famílias e tipos | |
| `content.materials` | materiais | |
| `content.schedules` | quantitativos | `model.read` |

`net.fetch` é reservada: manifesto que a pede é recusado (script não acessa a rede). `declarative` não pode pedir `model.write`, `ui.tools` nem `io.import`. As permissões de renderizador (`scene.read`, `camera.*`, `events.subscribe`, `overrides.write`) são só do runtime `external`. A concessão pode ser **parcial**: o suplemento ativa só o concedido e as contribuições sem permissão ficam escondidas; seu código deve tratar a falta de `ctx.model`/`ctx.data`. Revogar ou conceder depois reinicia o suplemento.

## 4. Pontos de contribuição (`contributes`) com exemplos

Cada exemplo abaixo existe em `plugins-exemplo/` e passa no teste que valida e empacota todos eles.

| Ponto | Para que serve | Exemplo |
|---|---|---|
| `commands` + `ribbon` | comando na busca e botão na aba Suplementos | `contador-portas/` (script, só lê o modelo) |
| `dialogs` | diálogo com campos `number`, `text`, `choice`, `bool`, `length`, `angle` | `grade-de-paredes/` |
| `tools` | ferramenta interativa (cliques com snap, prévia, comandos) | `grade-de-paredes/` |
| `panels` | painel lateral declarativo (`text`, `value`, `row`, `table`, `button`, `input`) formato em [10](10-referencia-da-api.md) §6 (os campos de diálogo de `grade-de-paredes/` usam as mesmas unidades) |
| `importers` e `exporters` | importar/exportar arquivos | `csv-paredes/` |
| `checks` | verificação no painel de problemas | `verificacoes-quantitativos/` (declarativo, por regra) |
| `schedules` | quantitativo em tabela, com totais e CSV | `verificacoes-quantitativos/` |
| `materials` | materiais carregáveis no projeto | `materiais-exemplo/` (declarativo) |
| `families` | tipos de parede, abertura etc. carregáveis | `familias-exemplo/` (declarativo) |

Notas por ponto:

- **Textos visíveis** aceitam `"texto"`, `{ "pt": "...", "en": "..." }` ou `"%chave"` (tabela `i18n` do manifesto, com `pt` e `en` obrigatórios). Título até 80 caracteres.
- **Ação** (`run`): `{ "type": "handler" | "dialog" | "tool" | "exporter" | "importer" | "check" | "schedule", "ref": "<id ou função>" }`.
- **Verificações**: `rule` é uma expressão JSONLogic restrita que descreve o que é **correto**; **regra falsa gera um item** com código `plugin:<id>:<check>`. Alternativa de script: `handler` devolvendo `[{ elementId?, message? }]`. Veja campos consultáveis e operadores em [10](10-referencia-da-api.md).
- **Diálogos e painéis**: campos `length` e `angle` são exibidos e digitados **nas unidades do projeto**; seu handler recebe **metro e radiano**. Valores passam por validação (tipo, `min`/`max`, opção válida) antes de chegar a você.
- **Ferramentas**: o Hestia captura os pontos (com Orto, Polar e snaps do app) e chama seu handler `onCommit` com eventos; você responde com `draft` (prévia), `commit` (lote de comandos) e `done`. Esc cancela.
- **Importadores**: o resultado é um lote de comandos; o usuário vê uma **prévia** e confirma; um passo de Desfazer.
- **Famílias e materiais**: ficam no pacote; só entram no projeto quando o usuário clica em **Carregar conteúdo**, sob o prefixo `<id do suplemento>:`; nada do projeto é substituído.

## 5. Limites

| Limite | Valor |
|---|---|
| Tempo de uma chamada ao script | 2000 ms por padrão; teto 30000 ms (`limits.timeoutMs`) |
| Memória do Worker | 64 MiB por padrão; teto 256 MiB (`limits.memoryMiB`) |
| Comandos por lote | 5000 por padrão; teto 50000 no manifesto, mas o host aplica no máximo 5000 por `model.apply`; 8 MiB de JSON por lote |
| Falhas até "falhou" | 3 em 60000 ms |
| Dados no projeto | 1 MiB por suplemento, 4 MiB no total; JSON puro, profundidade 16, chaves até 64 caracteres |
| Manifesto | 256 KiB; `contributes` com até 200 entradas por ponto; expressão até 500 caracteres e profundidade 12 |
| Resultado de handler | texto até 4000 caracteres |
| Importar/exportar | arquivo até 64 MiB |
| Verificação | até 200 itens por verificação; mensagem até 300 caracteres |
| Quantitativo | até 5000 linhas |
| Log | 500 entradas por suplemento, 500 caracteres cada |
| Pacote | 200 arquivos, 8 MiB por arquivo, 16 MiB no total |

O manifesto só **pede** limites; o Hestia nunca passa do teto.

## 6. Boas práticas de segurança

1. **Peça o mínimo.** Quem lê o modelo não precisa de `model.write`. Explique no `README.md` por que cada permissão é necessária: o texto aparece antes da concessão.
2. **Trate a falta de permissão.** O usuário pode conceder só parte; devolva uma mensagem clara em vez de lançar exceção.
3. **Nunca confie em dados do projeto.** Nomes e textos vêm de arquivos de terceiros; não os use para montar código nem comandos sem conferir.
4. **Não registre dados do modelo no log.** O log só aparece no gerenciador, mas o usuário pode copiá-lo e enviá-lo.
5. **Comandos só pela porta.** Use `model.newId` para ids de elementos novos (ids inventados são recusados) e os tipos de comando da lista branca. Lote inválido recusa tudo; confira o `{ ok, index, error }` devolvido.
6. **Idempotência.** Handlers podem ser chamados de novo; evite estado global que sobreviva a reinícios (o Worker é recriado quando as permissões mudam ou após falha). O que precisa durar vai em `ctx.data`.
7. **Versione os dados.** Ao mudar o formato guardado em `ctx.data`, aumente `dataSchema` e leia dados antigos com tolerância.
8. **Sem rede, sem execução dinâmica.** O Worker não tem `fetch`, `WebSocket` nem armazenamento; não use `eval` nem `new Function`.
9. **Pacote sem assinatura é aceito com aviso.** Distribua por um canal que o usuário confie e publique o `id` e a versão.
10. **Desinstalar não remove o que já entrou no projeto** (conteúdo carregado e dados). Não dependa de limpeza automática.

## 7. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| `[unknown_capability]` ao empacotar | nome de permissão errado (veja a tabela da §3) |
| `[missing_dependency]` | falta pedir a permissão exigida (`model.write` exige `model.read`) |
| `[handler_missing]` | o manifesto cita uma função que `main.js` não exporta |
| `[api_incompatible]` | `hestiaApi` maior que a do Hestia (hoje `"1.0"`) |
| Estado "Aguardando permissões" | nada foi concedido; abra **Permissões** no cartão |
| Estado "Falhou" | veja o motivo no cartão e o **Registro**; **Reativar** tenta de novo |
| O botão não aparece | falta `ui.ribbon` (e `ui.commands`) concedido, ou o `command` do botão não existe |
