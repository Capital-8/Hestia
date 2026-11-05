# Contrato do `render-engine` (fase 1)

Escrito pelo orquestrador (Claude). Todo subagente segue este contrato. Se algo aqui parecer errado, pare e reporte; não mude o contrato sozinho.

## Objetivo

Um só núcleo de renderização em Rust/wgpu, que roda no serviço nativo (`render-service`) e, depois, no navegador (WebGPU, wasm). Nesta fase só o lado nativo.

## Crates

- `crates/render-engine` (novo, lib): pipelines, shaders WGSL, buffers, tiles, leitura de pixels. **Não** faz HTTP, não lê arquivo e não conhece o serviço.
- `crates/render-native` (existente): vira fino. Mantém o CLI `render-native <cena.hstr> <saida.png> [l] [a]` e reexporta a API antiga (`renderizar`, `renderizar_com_camera`, `renderizar_com_exposicao`, `ImagemRenderizada`) para não quebrar quem já usa.
- `crates/render-service` (existente): passa a usar `render-engine` diretamente.
- `crates/render-core`: **não muda** nesta fase. O HSTR v1 continua igual.

## Dispositivo injetado

```rust
pub struct Motor { /* device, queue, backend, adaptador, pipelines */ }

impl Motor {
    /// Cria o dispositivo wgpu nativo (DX12/Vulkan/Metal). Sem fallback de CPU.
    pub fn nativo() -> Result<Motor, ErroRender>;
    /// Usa um device já existente (para o navegador/WebGPU, fase posterior).
    pub fn com_device(device: wgpu::Device, queue: wgpu::Queue, info: InfoAdaptador) -> Motor;
}
```

O `Motor` é criado **uma vez** por processo. Nunca chame `gpu::iniciar()` por passe, como hoje.

## Cena carregada

```rust
pub struct CenaGpu { /* vértices, índices, uniformes fixos, mapa de sombra */ }

impl Motor {
    pub fn carregar_cena(&self, cena: &render_core::Cena) -> Result<CenaGpu, ErroRender>;
}
```

Regra: a cena é carregada **uma vez** e reusada por todos os tiles e frames. O serviço guarda o `CenaGpu` ligado ao id da cena.

## Retângulo e região

```rust
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Retangulo { pub x: u32, pub y: u32, pub w: u32, pub h: u32 }
```

Coordenadas em pixels da imagem final (origem no canto superior esquerdo).

## Renderizar uma região

```rust
impl Motor {
    /// Renderiza só o retângulo `regiao` de uma imagem `largura x altura`.
    /// Devolve RGBA8 sRGB com `regiao.w * regiao.h * 4` bytes, sem padding.
    pub fn renderizar_regiao(
        &self,
        cena: &CenaGpu,
        camera: &render_core::camera::Camera,
        largura: u32,
        altura: u32,
        regiao: Retangulo,
        exposicao: f64,
    ) -> Result<Vec<u8>, ErroRender>;
}
```

- A projeção usa a imagem inteira (`largura x altura`); a região só recorta o que é desenhado. Assim, a borda entre tiles não tem costura.
- Resultado igual, pixel a pixel, ao da imagem inteira no mesmo retângulo (teste obrigatório, ver abaixo).

## Tiles

```rust
/// Tiles de `lado` x `lado` (bordas menores), ordenados do centro para fora.
/// Empate: menor y, depois menor x. Erro se algum argumento for zero.
pub fn ordenar_tiles_espiral(largura: u32, altura: u32, lado: u32) -> Result<Vec<Retangulo>, ErroRender>;
```

- Os tiles cobrem a imagem exatamente, sem sobreposição.
- Lado padrão do render final: **256**.
- Prévia: **uma** passada de imagem inteira em 320 px de largura (proporção preservada), antes dos tiles.

## Eventos de progresso (serviço)

O serviço expõe progresso por **consulta** (polling). SSE fica para depois.

`GET /jobs/{id}` passa a devolver, além dos campos atuais (`fase`, `fracao`, `pronto`, `cancelado`, `erro`):

```json
{
  "fase": "tiles",
  "fracao": 0.42,
  "tiles": {
    "total": 30,
    "concluidos": [ { "i": 0, "x": 512, "y": 256, "w": 256, "h": 256 } ]
  }
}
```

- `concluidos` cresce em ordem de conclusão; `i` é o índice na ordem espiral.
- `fracao` = `concluidos.length / total` durante os tiles. **Nunca** um número inventado.
- `GET /jobs/{id}/tile/{i}` devolve o PNG do tile `i` (já concluído), para a UI pintar sobre a imagem.
- Rotas antigas (`/preview`, `/result`, `POST /render`, `POST /scenes/{id}/frame`) continuam funcionando.

## Invariantes (não quebrar)

1. `Uniformes` continua com 240 bytes (teste `layout_tem_multiplos_de_dezesseis_bytes`).
2. O `shader.wgsl` não muda nesta fase. Mudanças de shader são da etapa 6.
3. O HSTR v1 e o `render-core` não mudam.
4. Nenhum fallback silencioso para CPU. Sem adaptador GPU, erro explícito.
5. Nenhum progresso fictício.

## Testes obrigatórios

- `cargo test -p render-engine` e `cargo test -p render-native` verdes.
- `cargo clippy --all-targets -- -D warnings` sem avisos nos crates tocados.
- Regressão: o PNG do CLI (`render-native`) antes e depois da extração é igual dentro de tolerância por canal (máximo de 2 níveis de 255). Script em `scripts/regressao-render.mjs` (lote H3).
- Tiles: teste puro de cobertura, sobreposição e ordem (já existe a versão TS de referência em `scratchpad\piloto`).

## Fora desta fase

WebGPU/wasm, IBL, CSM, MSAA, vidro, texturas, HSTR v2. Cada um tem o seu contrato, escrito antes da etapa 6.
