//! ABI do furo por contorno (spike `furo_contorno`, docs/estudo-esquadrias/19; layout em
//! docs/estudo-esquadrias/21-abi-furo-contorno.md). Exporta `furo_contorno_furar`.
//!
//! ## Modelo de memória (o mesmo da ABI v2, `abi2.rs`)
//!
//! - Ponteiros são `u32` (offsets na memória linear), little-endian, alvo `wasm32-unknown-unknown`.
//! - **Entrada**: o JS reserva cada buffer com `abi2_alocar(bytes)` (alinhado a 8), escreve, chama
//!   `furo_contorno_furar` e libera com `abi2_liberar(ptr, bytes)`. O wasm não guarda ponteiro de entrada.
//! - **Saída**: `furo_saida_n()` arrays tipados pertencentes ao wasm (1=u32, 3=f64), com `furo_saida_ptr(i)`,
//!   `furo_saida_len(i)` (nº de elementos) e `furo_saida_tipo(i)`. Valem até a próxima chamada a
//!   `furo_contorno_furar` ou `furo_saida_liberar`. O JS nunca libera saídas com `abi2_liberar`.
//! - **Erros**: `furo_contorno_furar` devolve `0` (OK), `3` (ENTRADA), `5` (LIMITE) ou `6` (INTERNO);
//!   `furo_erro_ptr/len` dão o texto UTF-8 do último erro (vazio depois de sucesso). Nenhuma entrada do JS
//!   provoca panic: ponteiros são checados, contornos não simples são recusados (`ENTRADA`) antes da
//!   booleana, e toda a lógica fica em [`furar_planos`], que só recebe slices.
//!
//! ## Estado separado da ABI v2
//!
//! Esta ABI tem estado próprio (`ESTADO`), com os accessors `furo_saida_*` e `furo_erro_*`. Ela não usa
//! `saida_*`/`erro_*` da v2 porque o `Nucleo` de `abi2.rs` é privado e não deve ser alterado aqui.
//!
//! ## Só wasm32
//!
//! [`fatia`] recusa tudo (exceto vazio) fora de wasm32, como em `abi2.rs`; os testes exercitam
//! [`furar_planos`] e [`Estado`] diretamente.

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, INTERNO, LIMITE, OK};
use crate::furo_contorno::{furar_parede, ErroFuro, Vao};

/// Versão desta ABI (layout dos buffers e das saídas). O JS recusa uma versão diferente.
pub const VERSAO_ABI_FURO: u32 = 1;
/// Nº máximo de vãos numa chamada.
pub const LIMITE_VAOS: u32 = 1024;
/// Nº máximo de pontos somados de todos os contornos.
pub const LIMITE_PONTOS: u32 = 65_536;
/// Nº máximo de camadas da parede.
pub const LIMITE_CAMADAS: u32 = 32;
/// Nº máximo de pontos de um único contorno. A checagem de auto-interseção é O(n^2) por contorno; sem este
/// limite, um contorno de 65 536 pontos levaria ~2e9 comparações dentro do wasm.
pub const LIMITE_PONTOS_POR_VAO: u32 = 4096;

/// Entradas já decodificadas (slices sobre os buffers planos).
pub struct Entradas<'a> {
    /// x, z intercalados de todos os contornos (2 * n_pontos f64), concatenados por vão.
    pub pontos: &'a [f64],
    /// Índice do primeiro ponto de cada vão; `n_vaos + 1` u32, o último é `n_pontos`.
    pub vaos: &'a [u32],
    /// Posição (x) da origem de cada vão (`n_vaos` f64).
    pub x: &'a [f64],
    /// Cota (z) da origem de cada vão (`n_vaos` f64).
    pub soleira: &'a [f64],
    /// Espessura de cada camada, em ordem de y crescente (a camada 0 ocupa `[0, e0]`; `n_camadas` f64).
    pub espessuras: &'a [f64],
    pub comprimento: f64,
    pub altura: f64,
}

fn verificar_limites(n_vaos: usize, n_pontos: usize, n_camadas: usize) -> Result<(), (u32, String)> {
    if n_vaos > LIMITE_VAOS as usize {
        return Err((LIMITE, format!("vaos demais ({n_vaos} > {LIMITE_VAOS})")));
    }
    if n_pontos > LIMITE_PONTOS as usize {
        return Err((LIMITE, format!("pontos demais ({n_pontos} > {LIMITE_PONTOS})")));
    }
    if n_camadas > LIMITE_CAMADAS as usize {
        return Err((LIMITE, format!("camadas demais ({n_camadas} > {LIMITE_CAMADAS})")));
    }
    Ok(())
}

fn erro_do_furo(e: ErroFuro) -> (u32, String) {
    match e {
        ErroFuro::ParedeInvalida => (ENTRADA, "parede invalida (comprimento e altura positivos e finitos)".into()),
        ErroFuro::EspessuraInvalida(i) => (ENTRADA, format!("espessura invalida na camada {i}")),
        ErroFuro::ContornoInvalido(i) => (ENTRADA, format!("contorno invalido no vao {i}")),
        ErroFuro::PontoRepetido(i) => (ENTRADA, format!("contorno com pontos repetidos consecutivos no vao {i}")),
        ErroFuro::AutoInterseccao(i) => (ENTRADA, format!("contorno auto-intersectado no vao {i}")),
        ErroFuro::VaoForaDaParede(i) => (ENTRADA, format!("vao {i} sai da parede")),
        ErroFuro::Manifold(s) => (INTERNO, format!("kernel: {s}")),
    }
}

/// Toda a lógica do furo, sem ponteiros: testável nativamente.
///
/// Saída (sempre 5 arrays, nesta ordem; `C` = nº de camadas, `V_i`/`T_i` = vértices/índices da camada i):
/// 0. F64 `[y0, y1, volume, volume_sem_furo]` por camada (len `4C`).
/// 1. U32 `[n_vertices, n_indices]` por camada (len `2C`; `n_indices = 3 * triângulos`).
/// 2. F64 x, y, z intercalados de todas as camadas, em ordem (len `3 * sum(V_i)`).
/// 3. U32 índices de todas as camadas, em ordem, locais à camada, 0-based (len `sum(T_i)`).
/// 4. F64 `[volume_total, volume_removido]` (len 2).
pub fn furar_planos(e: &Entradas) -> Result<Vec<Saida>, (u32, String)> {
    let n_vaos = e.x.len();
    let n_camadas = e.espessuras.len();
    if e.soleira.len() != n_vaos || e.vaos.len() != n_vaos + 1 || e.pontos.len() % 2 != 0 {
        return Err((ENTRADA, "tamanhos dos buffers incoerentes".into()));
    }
    verificar_limites(n_vaos, e.pontos.len() / 2, n_camadas)?;
    if n_camadas == 0 {
        return Err((ENTRADA, "a parede precisa de pelo menos uma camada".into()));
    }
    let n_pontos = e.pontos.len() / 2;
    if e.vaos[0] != 0 || e.vaos[n_vaos] as usize != n_pontos || e.vaos.windows(2).any(|w| w[1] < w[0]) {
        return Err((ENTRADA, "offsets de contorno invalidos".into()));
    }
    if e.vaos.windows(2).any(|w| w[1] - w[0] > LIMITE_PONTOS_POR_VAO) {
        return Err((LIMITE, format!("pontos por vao demais (> {LIMITE_PONTOS_POR_VAO})")));
    }
    let vaos: Vec<Vao> = (0..n_vaos)
        .map(|i| {
            let (de, ate) = (e.vaos[i] as usize, e.vaos[i + 1] as usize);
            Vao {
                contorno: e.pontos[2 * de..2 * ate].chunks_exact(2).map(|p| [p[0], p[1]]).collect(),
                x: e.x[i],
                soleira: e.soleira[i],
            }
        })
        .collect();

    let res = furar_parede(&vaos, e.espessuras, e.comprimento, e.altura).map_err(erro_do_furo)?;

    let mut meta = Vec::with_capacity(4 * n_camadas);
    let mut contagens = Vec::with_capacity(2 * n_camadas);
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    for c in &res.camadas {
        meta.extend_from_slice(&[c.y0, c.y1, c.volume, c.volume_sem_furo]);
        contagens.extend_from_slice(&[(c.vertices.len() / 3) as u32, c.indices.len() as u32]);
        vertices.extend_from_slice(&c.vertices);
        indices.extend_from_slice(&c.indices);
    }
    Ok(vec![
        Saida::F64(meta),
        Saida::U32(contagens),
        Saida::F64(vertices),
        Saida::U32(indices),
        Saida::F64(vec![res.volume, res.volume_removido]),
    ])
}

fn texto_do_codigo(c: u32) -> &'static str {
    match c {
        OK => "",
        ENTRADA => "entrada invalida",
        LIMITE => "limite do esquema excedido",
        _ => "erro interno",
    }
}

/// Estado da ABI: última saída e último erro.
#[derive(Default)]
pub struct Estado {
    saidas: Vec<Saida>,
    erro: String,
}

impl Estado {
    pub fn novo() -> Estado {
        Estado::default()
    }

    /// Executa o furo. As saídas anteriores são sempre descartadas primeiro.
    pub fn furar(&mut self, e: &Entradas) -> u32 {
        self.saidas = Vec::new();
        match furar_planos(e) {
            Ok(s) => {
                self.saidas = s;
                self.erro = String::new();
                OK
            }
            Err((c, detalhe)) => self.falha(c, &detalhe),
        }
    }

    pub fn falha(&mut self, c: u32, detalhe: &str) -> u32 {
        self.erro = format!("{}: {}", texto_do_codigo(c), detalhe);
        c
    }

    pub fn saida(&self, i: u32) -> Option<&Saida> {
        self.saidas.get(i as usize)
    }
    pub fn saida_n(&self) -> u32 {
        self.saidas.len() as u32
    }
    pub fn saida_tipo(&self, i: u32) -> u32 {
        self.saidas.get(i as usize).map_or(0, |s| s.tipo())
    }
    pub fn saida_len(&self, i: u32) -> u32 {
        self.saidas.get(i as usize).map_or(0, |s| s.len() as u32)
    }
    pub fn saida_ptr(&self, i: u32) -> u32 {
        self.saidas.get(i as usize).map_or(0, |s| s.ptr() as u32)
    }
    pub fn saida_liberar(&mut self) {
        self.saidas = Vec::new();
    }
    pub fn erro(&self) -> &str {
        &self.erro
    }
}

// ---------------------------------------------------------------------------------------------
// Estado global e leitura de ponteiros (únicos pontos `unsafe`)
// ---------------------------------------------------------------------------------------------

static mut ESTADO: Option<Estado> = None;

/// Acesso ao estado global. SAFETY: wasm single-thread e funções `extern "C"` não reentrantes;
/// ninguém guarda a referência entre chamadas.
fn estado() -> &'static mut Estado {
    // SAFETY: ver acima.
    unsafe { ESTADO.get_or_insert_with(Estado::novo) }
}

#[cfg(target_arch = "wasm32")]
fn memoria_linear_bytes() -> u64 {
    (core::arch::wasm32::memory_size(0) as u64) * 65536
}

/// Lê `n` elementos de tipo `T` a partir de `ptr`. Recusa ponteiro nulo (com `n > 0`), desalinhado ou
/// fora da memória linear. `n == 0` -> vazio. Mesma regra de `abi2::fatia`.
fn fatia<'a, T>(ptr: u32, n: usize) -> Option<&'a [T]> {
    if n == 0 {
        return Some(&[]);
    }
    #[cfg(target_arch = "wasm32")]
    {
        let tam = core::mem::size_of::<T>() as u64;
        let fim = (ptr as u64).checked_add((n as u64).checked_mul(tam)?)?;
        if ptr == 0 || (ptr as usize) % core::mem::align_of::<T>() != 0 || fim > memoria_linear_bytes() {
            return None;
        }
        // SAFETY: ponteiro não nulo, alinhado e inteiramente dentro da memória linear; o JS não
        // escreve enquanto o wasm executa; T (u32/f64) aceita qualquer padrão de bits.
        Some(unsafe { core::slice::from_raw_parts(ptr as usize as *const T, n) })
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = ptr;
        None
    }
}

// ---------------------------------------------------------------------------------------------
// Exportações
// ---------------------------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn furo_abi_versao() -> u32 {
    VERSAO_ABI_FURO
}

/// Fura uma parede em camadas com os vãos dados. Layout dos buffers: docs/estudo-esquadrias/21.
/// Código de retorno: 0 OK, 3 ENTRADA, 5 LIMITE, 6 INTERNO.
#[no_mangle]
pub extern "C" fn furo_contorno_furar(
    n_vaos: u32,
    n_pontos: u32,
    ptr_pontos: u32,
    ptr_vaos: u32,
    ptr_x: u32,
    ptr_soleira: u32,
    n_camadas: u32,
    ptr_espessuras: u32,
    comprimento: f64,
    altura: f64,
) -> u32 {
    let st = estado();
    st.saida_liberar();
    if let Err((c, d)) = verificar_limites(n_vaos as usize, n_pontos as usize, n_camadas as usize) {
        return st.falha(c, &d);
    }
    let nv = n_vaos as usize;
    let (Some(pontos), Some(vaos), Some(x), Some(soleira), Some(espessuras)) = (
        fatia::<f64>(ptr_pontos, 2 * n_pontos as usize),
        fatia::<u32>(ptr_vaos, nv + 1),
        fatia::<f64>(ptr_x, nv),
        fatia::<f64>(ptr_soleira, nv),
        fatia::<f64>(ptr_espessuras, n_camadas as usize),
    ) else {
        return st.falha(ENTRADA, "ponteiro invalido");
    };
    st.furar(&Entradas { pontos, vaos, x, soleira, espessuras, comprimento, altura })
}

#[no_mangle]
pub extern "C" fn furo_saida_n() -> u32 {
    estado().saida_n()
}

#[no_mangle]
pub extern "C" fn furo_saida_tipo(i: u32) -> u32 {
    estado().saida_tipo(i)
}

#[no_mangle]
pub extern "C" fn furo_saida_ptr(i: u32) -> u32 {
    estado().saida_ptr(i)
}

#[no_mangle]
pub extern "C" fn furo_saida_len(i: u32) -> u32 {
    estado().saida_len(i)
}

#[no_mangle]
pub extern "C" fn furo_saida_liberar() {
    estado().saida_liberar();
}

#[no_mangle]
pub extern "C" fn furo_erro_ptr() -> u32 {
    estado().erro().as_ptr() as usize as u32
}

#[no_mangle]
pub extern "C" fn furo_erro_len() -> u32 {
    estado().erro().len() as u32
}
