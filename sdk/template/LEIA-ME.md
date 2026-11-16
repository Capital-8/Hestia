# __NOME__

Descreva aqui, em linguagem simples, o que o suplemento faz e por que pede cada permissão. Este texto aparece na tela de
instalação do Hestia, antes de o usuário conceder qualquer coisa.

## Permissões

- `model.read`: lê o projeto para contar os elementos.
- `ui.commands` e `ui.ribbon`: o comando aparece na busca de comandos e como botão na aba Suplementos.

## Campos do `manifest.json`

| Campo | Para que serve |
|---|---|
| `manifestVersion` | Sempre `2`. |
| `id` | Identificador único, reverso-DNS em minúsculas (`com.empresa.nome`). Não muda entre versões. |
| `version` | `x.y.z`. Aumente a cada publicação; o Hestia mantém as permissões já concedidas ao atualizar. |
| `hestiaApi` | Versão da API do Hestia que você usa (`"1.0"`). |
| `runtime` | `script` (JavaScript em Worker), `declarative` (só JSON) ou `external` (processo separado). |
| `entry` | Só `script`: o arquivo do código. |
| `capabilities` | Permissões que o suplemento PEDE; o usuário decide o que CONCEDE. Peça o mínimo. |
| `limits` | Tempo por chamada (ms), memória (MiB) e comandos por lote. O Hestia nunca passa do teto. |
| `dataSchema` | Versão do formato dos dados que você guarda no projeto. Aumente quando mudar o formato. |
| `contributes` | O que o suplemento acrescenta: comandos, botões, painéis, diálogos, ferramentas, importadores, exportadores, famílias, materiais, quantitativos e verificações. |

Passo a passo completo: `docs/plugins/09-guia-do-autor.md`.
