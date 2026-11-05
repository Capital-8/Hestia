//! ABI WebAssembly do renderizador offline do Hestia.
//!
//! Este arquivo é o **contrato** com o lado JavaScript (`apps/web/src/editor/render/wasmClient.ts`
//! na T8). O render em si fica em `render-core`; aqui só existe estado global, cópia de entrada e
//! tradução de códigos.
//!
//! ## Por que `static mut`
//!
//! O wasm é single-thread e o host chama uma função por vez, como no kernel geométrico
//! (`crates/geom-wasm/src/lib.rs`). A cena e o trabalho precisam sobreviver entre chamadas, então
//! ficam em `static mut`; nenhum `RefCell`/`thread_local` resolve o mesmo problema sem custo.
//!
//! ## Fluxo do lado JS
//!
//! ```text
//! // 1. cena
//! const p = alocar(cena.length);            // devolve ponteiro na memória linear
//! new Uint8Array(memory.buffer, p, cena.length).set(cena);
//! carregar_cena(p, cena.length);            // 0 = ok; 1 = cena inválida
//!
//! // 2. trabalho
//! const q = alocar(trabalho.length);        // a memória pode ter crescido: pegue o buffer de novo
//! new Uint8Array(memory.buffer, q, trabalho.length).set(trabalho);
//! preparar_trabalho(q, trabalho.length);    // 0 = ok; 2 = trabalho inválido
//!
//! // 3. blocos
//! renderizar_bloco(x, y, w, h, spp, seed);  // 0 = ok; 4 = cancelado
//! const pixels = new Uint8Array(memory.buffer, saida_ptr(), saida_len()).slice();
//! ```
//!
//! `alocar` realoca a arena de entrada; **tudo que o JS tinha como view da memória fica inválido**
//! depois de qualquer chamada que possa crescer a memória. Releia `memory.buffer` sempre.
//!
//! ## Códigos de retorno
//!
//! `0` ok · `1` cena inválida · `2` trabalho inválido · `3` erro interno · `4` cancelado.
//!
//! ## Formato da cena (`HSTR` versão 2 na escrita; versões 1 e 2 na leitura)
//!
//! Cabeçalho de 32 bytes, tudo little-endian:
//!
//! ```text
//!   0  "HSTR"             4 bytes
//!   4  versão             u32 = 2 (1 também é aceita; sem tipo/escala, valem 0 e 1.0)
//!   8  n_vertices         u32
//!   12 n_indices          u32 (múltiplo de 3)
//!   16 n_normais          u32 (0 ou n_vertices)
//!   20 n_materiais        u32
//!   24 n_batches          u32
//!   28 flags              u32 (bit 0 = normais, bit 1 = fundo)
//! ```
//!
//! Depois, na ordem do CONTRATO.md §4: posições (`3 f32` por vértice), índices (`u32`), normais
//! (`3 f32` por vértice, se houver), materiais (`11 f32`: cor base 3, rugosidade, metálico,
//! opacidade, transmissão, IOR, emissivo 3), lotes (`3 u32`: início, quantidade de índices,
//! material), sol (`3 f32`: azimute em graus, elevação em graus, intensidade), fundo (`3 f32`, se
//! houver) e câmera (`37 f32`: view 16, projeção 16, posição 3, perto, longe). Matrizes em coluna
//! maior, metros, Z para cima. Na versão 2 cada material ganha, no fim do seu bloco, `tipo` (`u32`,
//! 0..=7) e `escala` (`f32`, > 0): bloco de 52 bytes em vez de 44.
//!
//! ## Formato do trabalho (`HSWK` versão 1)
//!
//! ```text
//!   0  "HSWK"    4 bytes
//!   4  versão    u32 = 1
//!   8  largura   u32 (1..=16384)
//!   12 altura    u32 (1..=16384)
//!   16 exposição f32
//!   20 formato   u32 (0 = RGBA8 sRGB, alfa opaco)
//! ```
//!
//! ## Saída
//!
//! `renderizar_bloco` grava `w * h * 4` bytes **RGBA8 em sRGB**, linha a linha, com exposição e
//! tone mapping ACES já aplicados. O tamanho nunca é maior que `trabalho.largura` x
//! `trabalho.altura`; `saida_len()` é o tamanho do último bloco bem-sucedido (0 após erro ou
//! cancelamento). A saída vale até a próxima chamada que renderiza.
//!
//! ## Câmera e sol por quadro (vídeo)
//!
//! Para o `RustFrameSource` não recarregar a cena a cada frame:
//!
//! - `atualizar_camera(ptr, len)`: 37 `f32` no mesmo layout da câmera do `HSTR` (148 bytes);
//! - `atualizar_sol(ptr, len)`: 3 `f32` (azimute, elevação, intensidade; 12 bytes);
//! - `limpar_cancelamento()`: zera a flag antes de um novo job; `cancelar()` devolve 0.
//!
//! ## Só wasm32
//!
//! Os ponteiros são `u32` no alvo real (`wasm32-unknown-unknown`). No host eles são ponteiros de
//! 64 bits e continuam funcionando; o teste nativo da ABI usa esse caminho. Não compile esta
//! crate para `wasm32-wasip1`.

#![allow(static_mut_refs)]
// No host Windows, a crate `cdylib` faz o link.exe imprimir a criação do `.dll.lib`; isso vira um
// aviso de `linker_messages` nos testes nativos. Não afeta o alvo wasm e não é diagnóstico útil.
#![allow(linker_messages)]

use std::slice;
use std::sync::atomic::{AtomicBool, Ordering};

use render_core::camera::Camera;
use render_core::cena::Sol;
use render_core::trabalho::Trabalho;
use render_core::{renderizar_bloco as renderizar_bloco_core, Bloco, Cena, Erro};

/// Versão do ABI. O lado JS recusa um wasm cuja versão não bata.
pub const VERSAO_ABI: u32 = 1;

pub const OK: u32 = 0;
pub const ERRO_CENA: u32 = 1;
pub const ERRO_TRABALHO: u32 = 2;
pub const ERRO_INTERNO: u32 = 3;
pub const ERRO_CANCELADO: u32 = 4;

/// Teto de segurança para uma entrada vinda do JS (cena ou trabalho).
const MAX_ENTRADA: usize = 256 * 1024 * 1024;

static mut ENTRADA: Vec<u8> = Vec::new();
static mut ENTRADA_LEN: usize = 0;
static mut CENA: Option<Cena> = None;
static mut TRABALHO: Option<Trabalho> = None;
static mut SAIDA: Vec<u8> = Vec::new();
static CANCELADO: AtomicBool = AtomicBool::new(false);

/// Reserva a arena de entrada e devolve o ponteiro base (0 em caso de pedido absurdo).
///
/// O JS escreve depois desta chamada e antes de `carregar_cena`/`preparar_trabalho`.
#[no_mangle]
pub extern "C" fn alocar(bytes: usize) -> *mut u8 {
    if bytes == 0 || bytes > MAX_ENTRADA {
        return std::ptr::null_mut();
    }
    unsafe {
        ENTRADA.clear();
        ENTRADA.resize(bytes, 0);
        ENTRADA_LEN = bytes;
        ENTRADA.as_mut_ptr()
    }
}

#[no_mangle]
pub extern "C" fn versao_abi() -> u32 {
    VERSAO_ABI
}

/// Decodifica e guarda a cena. Devolve `0` ou `1` (cena inválida) / `3` (erro interno).
#[no_mangle]
pub extern "C" fn carregar_cena(ptr: *const u8, len: usize) -> u32 {
    let bytes = match entrada(ptr, len) {
        Some(bytes) => bytes,
        None => return ERRO_CENA,
    };
    match Cena::decodificar(bytes) {
        Ok(cena) => {
            unsafe {
                CENA = Some(cena);
                SAIDA.clear();
            }
            OK
        }
        Err(Erro::CenaInvalida) | Err(Erro::TrabalhoInvalido) | Err(Erro::Cancelado) => ERRO_CENA,
        Err(Erro::Interno) => ERRO_INTERNO,
    }
}

/// Decodifica e guarda o trabalho. Devolve `0` ou `2` (trabalho inválido).
#[no_mangle]
pub extern "C" fn preparar_trabalho(ptr: *const u8, len: usize) -> u32 {
    let bytes = match entrada(ptr, len) {
        Some(bytes) => bytes,
        None => return ERRO_TRABALHO,
    };
    match Trabalho::decodificar(bytes) {
        Ok(trabalho) => {
            unsafe {
                TRABALHO = Some(trabalho);
                SAIDA.clear();
            }
            OK
        }
        Err(_) => ERRO_TRABALHO,
    }
}

/// Renderiza um bloco do último trabalho e publica RGBA8 sRGB em `saida_ptr`/`saida_len`.
#[no_mangle]
pub extern "C" fn renderizar_bloco(x: u32, y: u32, w: u32, h: u32, spp: u32, seed: u32) -> u32 {
    if CANCELADO.load(Ordering::Relaxed) {
        unsafe { SAIDA.clear() };
        return ERRO_CANCELADO;
    }
    let cena = match unsafe { CENA.as_ref() } {
        Some(cena) => cena,
        None => return ERRO_CENA,
    };
    let trabalho = match unsafe { TRABALHO.as_ref() } {
        Some(trabalho) => trabalho,
        None => return ERRO_TRABALHO,
    };
    let bloco = Bloco {
        x,
        y,
        largura: w,
        altura: h,
        spp,
        seed,
    };
    match renderizar_bloco_core(cena, trabalho, &bloco, &CANCELADO) {
        Ok(bytes) => {
            unsafe { SAIDA = bytes };
            OK
        }
        Err(erro) => {
            unsafe { SAIDA.clear() };
            erro.codigo()
        }
    }
}

/// Ponteiro da saída do último bloco (0 quando o vetor está vazio).
#[no_mangle]
pub extern "C" fn saida_ptr() -> *const u8 {
    unsafe {
        if SAIDA.is_empty() {
            std::ptr::null()
        } else {
            SAIDA.as_ptr()
        }
    }
}

#[no_mangle]
pub extern "C" fn saida_len() -> usize {
    unsafe { SAIDA.len() }
}

/// Liga o cancelamento. O render confere a flag a cada linha e devolve `4`.
#[no_mangle]
pub extern "C" fn cancelar() -> u32 {
    CANCELADO.store(true, Ordering::Relaxed);
    OK
}

/// Zera a flag de cancelamento para começar um novo job.
#[no_mangle]
pub extern "C" fn limpar_cancelamento() -> u32 {
    CANCELADO.store(false, Ordering::Relaxed);
    OK
}

/// Atualiza só a câmera (37 `f32` little-endian), sem reconstruir BVH. Para vídeo.
#[no_mangle]
pub extern "C" fn atualizar_camera(ptr: *const u8, len: usize) -> u32 {
    let bytes = match entrada(ptr, len) {
        Some(bytes) => bytes,
        None => return ERRO_TRABALHO,
    };
    let camera = match Camera::de_quadro(bytes) {
        Ok(camera) => camera,
        Err(_) => return ERRO_TRABALHO,
    };
    match unsafe { CENA.as_mut() } {
        Some(cena) => match cena.atualizar_camera(camera) {
            Ok(()) => OK,
            Err(_) => ERRO_CENA,
        },
        None => ERRO_CENA,
    }
}

/// Atualiza só o sol (3 `f32`: azimute, elevação, intensidade), sem reconstruir BVH.
#[no_mangle]
pub extern "C" fn atualizar_sol(ptr: *const u8, len: usize) -> u32 {
    let bytes = match entrada(ptr, len) {
        Some(bytes) => bytes,
        None => return ERRO_TRABALHO,
    };
    let sol = match Sol::de_tripla(bytes) {
        Ok(sol) => sol,
        Err(_) => return ERRO_TRABALHO,
    };
    match unsafe { CENA.as_mut() } {
        Some(cena) => match cena.atualizar_sol(sol) {
            Ok(()) => OK,
            Err(_) => ERRO_CENA,
        },
        None => ERRO_CENA,
    }
}

/// Valida que `ptr..ptr+len` está dentro da última arena reservada por `alocar`.
fn entrada(ptr: *const u8, len: usize) -> Option<&'static [u8]> {
    if ptr.is_null() || len == 0 {
        return None;
    }
    unsafe {
        if len > ENTRADA_LEN || len > ENTRADA.len() {
            return None;
        }
        let base = ENTRADA.as_ptr() as usize;
        let inicio = ptr as usize;
        if inicio < base || inicio - base > ENTRADA.len() - len {
            return None;
        }
        Some(slice::from_raw_parts(ptr, len))
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use render_core::camera::Camera;
    use render_core::cena::{Lote, Material, PartesCena, Sol};
    use render_core::vetor::Vec3;
    use render_core::Trabalho;

    fn cena_bytes() -> Vec<u8> {
        let posicoes = vec![
            -5.0, -5.0, 0.0, 5.0, -5.0, 0.0, 5.0, 5.0, 0.0, -5.0, 5.0, 0.0,
        ];
        let indices = vec![0, 1, 2, 0, 2, 3];
        let materiais = vec![Material {
            cor_base: [0.65, 0.5, 0.35],
            rugosidade: 0.8,
            metalico: 0.0,
            opacidade: 1.0,
            transmissao: 0.0,
            ior: 1.5,
            emissivo: [0.0, 0.0, 0.0],
            tipo: 0,
            escala: 1.0,
            texturas: [None; 4],
        }];
        let lotes = vec![Lote {
            inicio_indices: 0,
            quantidade_indices: 6,
            material: 0,
        }];
        let camera = Camera::olhando_para(
            Vec3::novo(0.0, -6.0, 4.0),
            Vec3::novo(0.0, 0.0, 0.0),
            Vec3::novo(0.0, 0.0, 1.0),
            0.9,
            16.0 / 9.0,
            0.1,
            100.0,
        )
        .expect("câmera");
        Cena::nova(PartesCena {
            posicoes,
            indices,
            normais: Vec::new(),
            materiais,
            texturas: Vec::new(),
            lotes,
            sol: Sol::padrao(),
            fundo: None,
            camera,
        })
        .expect("cena")
        .codificar()
    }

    #[test]
    fn abi_completa_no_host() {
        let cena = cena_bytes();
        let ptr = alocar(cena.len());
        assert!(!ptr.is_null());
        unsafe { std::ptr::copy_nonoverlapping(cena.as_ptr(), ptr, cena.len()) };
        assert_eq!(carregar_cena(ptr, cena.len()), OK);

        let trabalho = Trabalho::novo(32, 18, 1.0).expect("trabalho");
        let bytes_trabalho = trabalho.codificar();
        let ptr_trabalho = alocar(bytes_trabalho.len());
        assert!(!ptr_trabalho.is_null());
        unsafe {
            std::ptr::copy_nonoverlapping(
                bytes_trabalho.as_ptr(),
                ptr_trabalho,
                bytes_trabalho.len(),
            )
        };
        assert_eq!(preparar_trabalho(ptr_trabalho, bytes_trabalho.len()), OK);

        assert_eq!(limpar_cancelamento(), OK);
        assert_eq!(renderizar_bloco(0, 0, 32, 18, 2, 9), OK);
        let tamanho = saida_len();
        assert_eq!(tamanho, 32 * 18 * 4);
        let ptr_saida = saida_ptr();
        assert!(!ptr_saida.is_null());
        let pixels = unsafe { slice::from_raw_parts(ptr_saida, tamanho) };
        assert!(pixels.iter().any(|&v| v != 0));
        assert!(pixels.chunks_exact(4).all(|p| p[3] == 255));
        let primeira: Vec<u8> = pixels.to_vec();

        // Mesma seed no mesmo bloco = bytes idênticos.
        assert_eq!(renderizar_bloco(0, 0, 32, 18, 2, 9), OK);
        let segunda = unsafe { slice::from_raw_parts(saida_ptr(), saida_len()) };
        assert_eq!(primeira, segunda);

        // Bloco fora da imagem não toca a saída e devolve 2.
        assert_eq!(renderizar_bloco(30, 10, 10, 10, 1, 9), ERRO_TRABALHO);
        assert_eq!(saida_len(), 0);

        // Cancelamento.
        assert_eq!(cancelar(), OK);
        assert_eq!(renderizar_bloco(0, 0, 8, 8, 1, 9), ERRO_CANCELADO);
        assert_eq!(saida_len(), 0);
        assert_eq!(limpar_cancelamento(), OK);
        assert_eq!(renderizar_bloco(0, 0, 8, 8, 1, 9), OK);

        // Câmera e sol por quadro.
        let camera = Camera::olhando_para(
            Vec3::novo(0.0, -6.0, 3.0),
            Vec3::novo(0.0, 0.0, 0.0),
            Vec3::novo(0.0, 0.0, 1.0),
            0.9,
            16.0 / 9.0,
            0.1,
            100.0,
        )
        .expect("câmera");
        let mut payload = Vec::new();
        for v in camera.view {
            payload.extend_from_slice(&(v as f32).to_le_bytes());
        }
        for v in camera.projecao {
            payload.extend_from_slice(&(v as f32).to_le_bytes());
        }
        for v in camera.posicao.para_array() {
            payload.extend_from_slice(&(v as f32).to_le_bytes());
        }
        payload.extend_from_slice(&(camera.perto as f32).to_le_bytes());
        payload.extend_from_slice(&(camera.longe as f32).to_le_bytes());
        let p_camera = alocar(payload.len());
        unsafe { std::ptr::copy_nonoverlapping(payload.as_ptr(), p_camera, payload.len()) };
        assert_eq!(atualizar_camera(p_camera, payload.len()), OK);
        assert_eq!(renderizar_bloco(0, 0, 8, 8, 1, 9), OK);

        let mut sol = Vec::new();
        for v in [30.0f32, 60.0, 2.5] {
            sol.extend_from_slice(&v.to_le_bytes());
        }
        let p_sol = alocar(sol.len());
        unsafe { std::ptr::copy_nonoverlapping(sol.as_ptr(), p_sol, sol.len()) };
        assert_eq!(atualizar_sol(p_sol, sol.len()), OK);

        // Entrada inválida não derruba nada.
        assert_eq!(carregar_cena(std::ptr::null(), 0), ERRO_CENA);
        assert_eq!(preparar_trabalho(std::ptr::null(), 0), ERRO_TRABALHO);
        assert_eq!(renderizar_bloco(0, 0, 0, 0, 1, 0), ERRO_TRABALHO);
    }
}
