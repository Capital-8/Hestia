# API de plugins (versão 1.0)

Código: `packages/plugin-api/src`. `API_VERSION = 1.0`; `major` quebra compatibilidade, `minor` só acrescenta.

## Manifesto (`PluginManifest`)
Enviado em `hello`; validado por `validateManifest` antes de qualquer outra coisa.

| Campo | Regra |
|---|---|
| `id` | reverso-DNS minúsculo, ex.: `dev.hestia.renderizador` |
| `name`, `version` | texto (mostrados ao usuário) |
| `hestiaApi` | `major.minor` da API alvo; mesmo `major` e `minor` menor ou igual ao do host, senão **incompatível** |
| `kind` | `renderer`, `exporter` ou `analysis` |
| `capabilities` | subconjunto das [capacidades](03-permissoes-e-fluxo.md); desconhecida recusa o manifesto |

O manifesto é só dado: sem caminho de executável, sem URL de código, sem `eval`.

## Contrato de cena (`scene.ts`)
Unidades: **metro e radiano**. Eixos: destro, **X leste, Y norte, Z para cima**. Matrizes 4×4 em ordem de colunas.

- `SceneSnapshot`: `projectId` (estável, salvo no arquivo), `revision`, `units`, `axes`, `entities`, `materials`,
  `textures`, `camera`, `overrides` (as do plugin, por id do material de origem).
- `SceneEntity`: `id` (id do elemento no Hestia), `kind`, `levelId?`, `materialIds?`, `transform`, `mesh` ou `null`, `visible`.
- `SceneMesh`: `positions`, `indices`, `groups` (`start`, `count`, `materialId` ou `null`), `hash` de conteúdo.
- `SceneMaterial`: `id`, `name`, `color`, `gloss`, `opacity`, `textures?` (por id).
- `SceneTexture`: `id`, `mime`, `hash`, `uri` (nunca `data:` de imagem). O Hestia ainda não tem texturas: lista vazia.
- `SceneDelta` (`baseRevision`, `revision`, `ops`) com `entity`, `material` e `texture` em `add`, `update`, `remove`.
- `SceneCamera`: projeção, `target`, `position`, `up`, `fovY`, `orthoHeight`, `near`, `far`.
- `ViewMaterialOverride`: `color?`, `opacity?`, `gloss?`, `params?` (escalares do renderizador).

Auxiliares para plugins em TypeScript: `diffScene`, `applyDelta`.

## Portas do host (`hostPorts.ts`)
`ScenePort`, `CameraPort`, `OverridesPort`: a única superfície por onde uma sessão toca o editor. Implementação real em
`apps/web/src/plugins/appPorts.ts` (cena = projeto + malhas da cena 3D; câmera = órbita 3D; substituições = comandos
`setPluginViewOverride` e `clearPluginViewOverride`, com desfazer).

## Gerenciamento
`PluginHost` (`pluginHost.ts`): `list`, `get`, `subscribe`, `enable`, `disable`, `connect`, `disconnect`, `setGrants`,
`setCameraMode`, `add`, `remove` (endereço loopback) e `start` (reconecta o que estava habilitado). Estado persistido no
`localStorage` (`hestia.plugins.v1`): habilitação, concessões e último manifesto.
