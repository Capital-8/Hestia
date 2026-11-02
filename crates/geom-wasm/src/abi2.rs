//! ABI v2 do kernel (decisão 0046, seção 3). Dados descritos por `schema/cena-v3.json`.
//!
//! ## Modelo de memória
//!
//! - Alvo `wasm32-unknown-unknown`; ponteiros são `u32` (offsets na memória linear), little-endian.
//! - **Entrada** (JS -> wasm): o JS reserva com `abi2_alocar(bytes)` (alinhado a 8), escreve o layout
//!   de seção (colunas contíguas, column-major, cada uma preenchida a múltiplo de 8 bytes) ou os
//!   `u32[]`/`f64[]` de argumentos, chama a função e **libera ele mesmo** com `abi2_liberar(ptr, bytes)`.
//!   O wasm nunca guarda o ponteiro de entrada depois de retornar: copia o que precisa.
//!   Antes de escrever, o JS deve reconstruir as views a partir de `memory.buffer` (a memória pode ter
//!   crescido em qualquer chamada anterior).
//! - **Saída** (wasm -> JS): `cena_executar` produz `saida_n()` arrays tipados, pertencentes ao
//!   wasm. Ponteiro/tamanho vêm de `saida_ptr(i)` / `saida_len(i)` (nº de **elementos**) e o tipo de
//!   `saida_tipo(i)` (1=u32, 2=i32, 3=f64, 4=u8). Valem **até a próxima `cena_executar` ou
//!   `saida_liberar`**; o JS copia o que quiser guardar. O JS nunca libera saídas com `abi2_liberar`.
//! - **Cenas**: `cena_criar` devolve um handle (>= 1, com geração: um handle destruído devolve
//!   `HANDLE` mesmo que o slot seja reaproveitado). `cena_destruir` libera tudo da cena.
//! - **Erros**: toda função devolve um código (`0` OK, 1 VERSAO, 2 HANDLE, 3 ENTRADA, 4
//!   NAO_IMPLEMENTADO, 5 LIMITE, 6 INTERNO); `erro_ptr/erro_len` dão o texto UTF-8 do último erro
//!   (vazio depois de uma chamada bem-sucedida). Nenhuma entrada do JS provoca panic: ponteiros são
//!   checados (não nulo, alinhado, dentro da memória linear) e toda lógica fica em [`Nucleo`], que só
//!   recebe slices.
//!
//! ## Estado global e segurança
//!
//! O wasm é single-thread, então o único estado global (`NUCLEO`) é um `static mut` acessado só por
//! [`nucleo`], e as funções `extern "C"` nunca são reentrantes (o JS não chama o wasm de dentro do
//! wasm). Os únicos blocos `unsafe` deste arquivo são esse acesso e a criação de slices a partir de
//! ponteiros validados em [`fatia`].
//!
//! Só `wasm32` consegue rodar a travessia por ponteiros: em hosts de 64 bits os ponteiros `u32`
//! seriam truncados, então [`fatia`] recusa tudo (exceto vazio) e `abi2_alocar` devolve 0. Os
//! testes nativos exercitam [`Nucleo`] diretamente.

#![allow(static_mut_refs)]

use std::alloc::Layout;
use std::collections::BTreeMap;

use crate::cena::{Cena, Tabela};
use crate::consultas::{self, Saida};
use crate::esquema::{
    self, ENTRADA, HANDLE, LIMITE, LIMITE_BYTES_POR_CHAMADA, LIMITE_LINHAS_POR_SECAO, OK, VERSAO_ABI2,
    VERSAO_ESQUEMA,
};

fn texto_do_codigo(c: u32) -> &'static str {
    match c {
        esquema::OK => "",
        esquema::VERSAO => "versao incompativel",
        esquema::HANDLE => "handle de cena invalido",
        esquema::ENTRADA => "entrada invalida",
        esquema::NAO_IMPLEMENTADO => "nao implementado",
        esquema::LIMITE => "limite do esquema excedido",
        _ => "erro interno",
    }
}

/// Toda a lógica da ABI v2, sem ponteiros: testável nativamente.
#[derive(Default)]
pub struct Nucleo {
    cenas: Tabela<Cena>,
    saidas: Vec<Saida>,
    erro: String,
    /// Alocações entregues ao JS por `abi2_alocar`: endereço -> tamanho (evita liberar o que não é nosso).
    alocacoes: BTreeMap<usize, usize>,
}

impl Nucleo {
    pub fn novo() -> Nucleo {
        Nucleo::default()
    }

    /// Registra o resultado de uma operação: devolve o código e atualiza o texto do último erro.
    fn fechar(&mut self, r: Result<(), u32>) -> u32 {
        let c = match r {
            Ok(()) => OK,
            Err(c) => c,
        };
        self.falha(c)
    }

    fn falha(&mut self, c: u32) -> u32 {
        self.erro = String::from(texto_do_codigo(c));
        c
    }

    fn falha_com(&mut self, c: u32, detalhe: &str) -> u32 {
        self.erro = format!("{}: {}", texto_do_codigo(c), detalhe);
        c
    }

    pub fn criar(&mut self) -> u32 {
        match self.cenas.inserir(Cena::novo()) {
            Some(h) => {
                self.erro = String::new();
                h
            }
            None => {
                self.falha_com(LIMITE, "muitas cenas vivas");
                0
            }
        }
    }

    pub fn destruir(&mut self, h: u32) -> u32 {
        let r = self.cenas.remover(h).map(|_| ()).ok_or(HANDLE);
        self.fechar(r)
    }

    pub fn tem_cena(&self, h: u32) -> bool {
        self.cenas.contem(h)
    }

    /// Bytes que o JS precisa ter escrito para `n_linhas` da seção (valida handle, seção e limites).
    pub fn bytes_da_secao(&mut self, h: u32, secao: u32, n_linhas: u32) -> Result<usize, u32> {
        if !self.cenas.contem(h) {
            return Err(self.falha(HANDLE));
        }
        esquema::bytes_secao(secao, n_linhas).map_err(|c| self.falha(c))
    }

    pub fn definir_secao(&mut self, h: u32, secao: u32, n_linhas: u32, bytes: &[u8]) -> u32 {
        let r = match self.cenas.obter_mut(h) {
            Some(c) => c.definir_secao(secao, n_linhas, bytes),
            None => Err(HANDLE),
        };
        self.fechar(r)
    }

    pub fn upsert(&mut self, h: u32, secao: u32, n_linhas: u32, bytes: &[u8]) -> u32 {
        let r = match self.cenas.obter_mut(h) {
            Some(c) => c.upsert(secao, n_linhas, bytes),
            None => Err(HANDLE),
        };
        self.fechar(r)
    }

    pub fn remover(&mut self, h: u32, secao: u32, ids: &[u32]) -> u32 {
        let r = match self.cenas.obter_mut(h) {
            Some(c) => c.remover(secao, ids),
            None => Err(HANDLE),
        };
        self.fechar(r)
    }

    /// Executa uma consulta. As saídas anteriores são sempre descartadas primeiro.
    pub fn executar(&mut self, h: u32, consulta: u32, args: &[f64]) -> u32 {
        self.saidas = Vec::new();
        let r = match self.cenas.obter_mut(h) {
            Some(c) => consultas::executar(c, consulta, args),
            None => Err(HANDLE),
        };
        match r {
            Ok(s) => {
                self.saidas = s;
                self.fechar(Ok(()))
            }
            Err(c) => self.fechar(Err(c)),
        }
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
    pub fn saida(&self, i: u32) -> Option<&Saida> {
        self.saidas.get(i as usize)
    }
    pub fn saida_liberar(&mut self) {
        self.saidas = Vec::new();
    }

    pub fn erro(&self) -> &str {
        &self.erro
    }

    /// Reserva `bytes` (mínimo 8) alinhados a 8. `None` em falha. O endereço fica registrado.
    pub fn alocar(&mut self, bytes: usize) -> Option<usize> {
        let tam = bytes.max(8).checked_add(7)? & !7;
        let layout = Layout::from_size_align(tam, 8).ok()?;
        // SAFETY: `layout` tem tamanho > 0 e alinhamento válido.
        let p = unsafe { std::alloc::alloc_zeroed(layout) };
        if p.is_null() {
            return None;
        }
        self.alocacoes.insert(p as usize, tam);
        Some(p as usize)
    }

    /// Libera uma alocação de [`Nucleo::alocar`]; endereços desconhecidos são ignorados.
    pub fn liberar(&mut self, ptr: usize, bytes: usize) {
        let Some(tam) = self.alocacoes.remove(&ptr) else {
            self.falha_com(ENTRADA, "abi2_liberar com ponteiro que nao veio de abi2_alocar");
            return;
        };
        if bytes.max(8).saturating_add(7) & !7 != tam {
            self.falha_com(ENTRADA, "abi2_liberar com tamanho diferente do alocado");
        }
        if bytes.max(8).saturating_add(7) & !7 == tam {
            self.erro = String::new();
        }
        if let Ok(layout) = Layout::from_size_align(tam, 8) {
            // SAFETY: `ptr` veio de `alloc_zeroed` com exatamente este layout (registrado no mapa).
            unsafe { std::alloc::dealloc(ptr as *mut u8, layout) };
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Estado global e leitura de ponteiros (únicos pontos `unsafe`)
// ---------------------------------------------------------------------------------------------

static mut NUCLEO: Option<Nucleo> = None;

/// Acesso ao estado global. SAFETY: wasm single-thread e funções `extern "C"` não reentrantes;
/// ninguém guarda a referência entre chamadas.
fn nucleo() -> &'static mut Nucleo {
    // SAFETY: ver acima.
    unsafe { NUCLEO.get_or_insert_with(Nucleo::novo) }
}

#[cfg(target_arch = "wasm32")]
fn memoria_linear_bytes() -> u64 {
    (core::arch::wasm32::memory_size(0) as u64) * 65536
}

/// Lê `n` elementos de tipo `T` (u8/u32/f64: qualquer padrão de bits é válido) a partir de `ptr`.
/// Recusa ponteiro nulo (com `n > 0`), desalinhado ou fora da memória linear. `n == 0` -> vazio.
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
        // escreve enquanto o wasm executa; T aceita qualquer padrão de bits.
        Some(unsafe { core::slice::from_raw_parts(ptr as usize as *const T, n) })
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = ptr;
        None
    }
}

// ---------------------------------------------------------------------------------------------
// Exportações (3.1 do 0046)
// ---------------------------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn abi2_versao() -> u32 {
    VERSAO_ABI2
}

#[no_mangle]
pub extern "C" fn abi2_esquema_versao() -> u32 {
    VERSAO_ESQUEMA
}

/// Ponteiro alinhado a 8 bytes, ou 0 em falha. A memória vem zerada.
#[no_mangle]
pub extern "C" fn abi2_alocar(bytes: u32) -> u32 {
    if usize::BITS != 32 || bytes as u64 > LIMITE_BYTES_POR_CHAMADA {
        return 0;
    }
    nucleo().alocar(bytes as usize).map_or(0, |p| p as u32)
}

#[no_mangle]
pub extern "C" fn abi2_liberar(ptr: u32, bytes: u32) {
    nucleo().liberar(ptr as usize, bytes as usize);
}

/// Handle >= 1, ou 0 em falha.
#[no_mangle]
pub extern "C" fn cena_criar() -> u32 {
    nucleo().criar()
}

#[no_mangle]
pub extern "C" fn cena_destruir(h: u32) -> u32 {
    nucleo().destruir(h)
}

#[no_mangle]
pub extern "C" fn cena_definir_secao(h: u32, secao: u32, n_linhas: u32, ptr: u32) -> u32 {
    let n = nucleo();
    let len = match n.bytes_da_secao(h, secao, n_linhas) {
        Ok(l) => l,
        Err(c) => return c,
    };
    match fatia::<u8>(ptr, len) {
        Some(b) => n.definir_secao(h, secao, n_linhas, b),
        None => n.falha_com(ENTRADA, "ponteiro invalido"),
    }
}

#[no_mangle]
pub extern "C" fn cena_upsert_linhas(h: u32, secao: u32, n_linhas: u32, ptr: u32) -> u32 {
    let n = nucleo();
    let len = match n.bytes_da_secao(h, secao, n_linhas) {
        Ok(l) => l,
        Err(c) => return c,
    };
    match fatia::<u8>(ptr, len) {
        Some(b) => n.upsert(h, secao, n_linhas, b),
        None => n.falha_com(ENTRADA, "ponteiro invalido"),
    }
}

#[no_mangle]
pub extern "C" fn cena_remover_linhas(h: u32, secao: u32, n_ids: u32, ptr_ids: u32) -> u32 {
    let n = nucleo();
    if !n.tem_cena(h) {
        return n.falha(HANDLE);
    }
    if esquema::secao(secao).is_none() {
        return n.falha_com(ENTRADA, "secao desconhecida");
    }
    if n_ids > LIMITE_LINHAS_POR_SECAO {
        return n.falha(LIMITE);
    }
    match fatia::<u32>(ptr_ids, n_ids as usize) {
        Some(ids) => n.remover(h, secao, ids),
        None => n.falha_com(ENTRADA, "ponteiro invalido"),
    }
}

#[no_mangle]
pub extern "C" fn cena_executar(h: u32, consulta: u32, n_args: u32, ptr_args: u32) -> u32 {
    let n = nucleo();
    n.saida_liberar();
    if !n.tem_cena(h) {
        return n.falha(HANDLE);
    }
    if n_args > 1024 {
        return n.falha_com(LIMITE, "argumentos demais");
    }
    match fatia::<f64>(ptr_args, n_args as usize) {
        Some(a) => n.executar(h, consulta, a),
        None => n.falha_com(ENTRADA, "ponteiro invalido"),
    }
}

#[no_mangle]
pub extern "C" fn saida_n() -> u32 {
    nucleo().saida_n()
}

#[no_mangle]
pub extern "C" fn saida_tipo(i: u32) -> u32 {
    nucleo().saida_tipo(i)
}

#[no_mangle]
pub extern "C" fn saida_ptr(i: u32) -> u32 {
    nucleo().saida_ptr(i)
}

#[no_mangle]
pub extern "C" fn saida_len(i: u32) -> u32 {
    nucleo().saida_len(i)
}

#[no_mangle]
pub extern "C" fn saida_liberar() {
    nucleo().saida_liberar();
}

#[no_mangle]
pub extern "C" fn erro_ptr() -> u32 {
    nucleo().erro().as_ptr() as usize as u32
}

#[no_mangle]
pub extern "C" fn erro_len() -> u32 {
    nucleo().erro().len() as u32
}

/// Bytes vivos no alocador (diagnóstico e teste de vazamento).
#[no_mangle]
pub extern "C" fn memoria_usada() -> u32 {
    crate::memoria::bytes_vivos().min(u32::MAX as usize) as u32
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cena::testes_util::*;
    use crate::esquema::{INTERNO, NAO_IMPLEMENTADO, NIVEL_TODOS, SECAO_PAREDES};
    use crate::teste_util::Xorshift;

    fn bytes_de(linhas: &[(u32, u32, f64, f64, f64, f64, f64)]) -> (u32, Vec<u8>) {
        (linhas.len() as u32, codificar_paredes(&lote(linhas)))
    }

    #[test]
    fn versoes() {
        assert_eq!(abi2_versao(), 2);
        assert_eq!(abi2_esquema_versao(), 3);
    }

    #[test]
    fn handles_sao_seguros() {
        let mut n = Nucleo::novo();
        let h1 = n.criar();
        assert!(h1 >= 1);
        assert_eq!(n.destruir(h1), OK);
        assert_eq!(n.destruir(h1), HANDLE);
        assert!(n.erro().contains("handle"));
        let h2 = n.criar();
        assert_ne!(h1, h2); // slot reaproveitado, geração nova
        let (nl, b) = bytes_de(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1)]);
        assert_eq!(n.definir_secao(h1, SECAO_PAREDES, nl, &b), HANDLE);
        assert_eq!(n.upsert(h1, SECAO_PAREDES, nl, &b), HANDLE);
        assert_eq!(n.remover(h1, SECAO_PAREDES, &[1]), HANDLE);
        assert_eq!(n.executar(h1, 1, &[0.0]), HANDLE);
        assert_eq!(n.destruir(0), HANDLE);
        assert_eq!(n.destruir(u32::MAX), HANDLE);
        assert_eq!(n.definir_secao(h2, SECAO_PAREDES, nl, &b), OK);
        assert_eq!(n.erro(), "");
    }

    #[test]
    fn limite_de_cenas_vivas() {
        let mut n = Nucleo::novo();
        let mut hs = Vec::new();
        loop {
            let h = n.criar();
            if h == 0 {
                break;
            }
            hs.push(h);
            assert!(hs.len() < 10_000);
        }
        assert!(hs.len() > 100);
        assert!(n.erro().contains("limite"));
        assert_eq!(n.destruir(hs[0]), OK);
        assert!(n.criar() >= 1);
    }

    #[test]
    fn fluxo_completo_com_saidas() {
        let mut n = Nucleo::novo();
        let h = n.criar();
        let (nl, b) = bytes_de(&[(3, 0, 0.0, 0.0, 3.0, 4.0, 0.2), (1, 0, 0.0, 0.1, 3.0, 4.1, 0.2), (2, 1, 9.0, 9.0, 9.0, 10.0, 0.2)]);
        assert_eq!(n.definir_secao(h, SECAO_PAREDES, nl, &b), OK);
        assert_eq!(n.executar(h, 1, &[0.0]), OK);
        assert_eq!(n.saida_n(), 3);
        assert_eq!((n.saida_tipo(0), n.saida_len(0)), (1, 1));
        assert_eq!((n.saida_tipo(1), n.saida_len(1)), (3, 4));
        assert_eq!((n.saida_tipo(2), n.saida_len(2)), (3, 1));
        assert_eq!(n.saida(0), Some(&Saida::U32(vec![2])));
        assert_eq!(n.saida(2), Some(&Saida::F64(vec![10.0])));
        assert_eq!(n.saida_tipo(9), 0);
        assert_eq!(n.saida_ptr(9), 0);
        assert_eq!(n.saida_len(9), 0);
        // próxima consulta descarta as saídas anteriores
        assert_eq!(n.executar(h, 3, &[0.0, 0.0]), OK);
        assert_eq!(n.saida_n(), 1);
        assert_eq!(n.saida(0), Some(&Saida::U32(vec![1, 3])));
        // erro limpa as saídas
        assert_eq!(n.executar(h, 77, &[]), NAO_IMPLEMENTADO);
        assert_eq!(n.saida_n(), 0);
        assert_eq!(n.executar(h, 1, &[]), ENTRADA);
        assert!(n.erro().contains("invalida"));
        // saida_liberar
        assert_eq!(n.executar(h, 1, &[NIVEL_TODOS as f64]), OK);
        n.saida_liberar();
        assert_eq!(n.saida_n(), 0);
    }

    #[test]
    fn tamanhos_incoerentes_e_limites_viram_codigo() {
        let mut n = Nucleo::novo();
        let h = n.criar();
        let (nl, b) = bytes_de(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1)]);
        assert_eq!(n.definir_secao(h, SECAO_PAREDES, nl + 1, &b), ENTRADA);
        assert_eq!(n.definir_secao(h, 9, nl, &b), ENTRADA);
        assert_eq!(n.bytes_da_secao(h, SECAO_PAREDES, LIMITE_LINHAS_POR_SECAO + 1), Err(LIMITE));
        assert_eq!(n.bytes_da_secao(h, 9, 1), Err(ENTRADA));
        assert_eq!(n.bytes_da_secao(12345, SECAO_PAREDES, 1), Err(HANDLE));
        assert_eq!(n.bytes_da_secao(h, SECAO_PAREDES, 2), Ok(8 + 8 + 5 * 16));
        assert_eq!(n.upsert(h, 9, nl, &b), ENTRADA);
        assert_eq!(n.remover(h, 9, &[1]), ENTRADA);
        assert_eq!(INTERNO, 6);
    }

    #[test]
    fn upsert_remover_pelo_nucleo() {
        let mut n = Nucleo::novo();
        let h = n.criar();
        let (nl, b) = bytes_de(&[(1, 0, 0.0, 0.0, 1.0, 0.0, 0.1), (2, 0, 0.0, 5.0, 1.0, 5.0, 0.1)]);
        assert_eq!(n.definir_secao(h, SECAO_PAREDES, nl, &b), OK);
        let (nl2, b2) = bytes_de(&[(2, 0, 0.0, 0.0, 1.0, 0.0, 0.1), (3, 0, 7.0, 7.0, 8.0, 7.0, 0.1)]);
        assert_eq!(n.upsert(h, SECAO_PAREDES, nl2, &b2), OK);
        assert_eq!(n.executar(h, 1, &[0.0]), OK);
        assert_eq!(n.saida(0), Some(&Saida::U32(vec![3])));
        assert_eq!(n.remover(h, SECAO_PAREDES, &[1, 3]), OK);
        assert_eq!(n.executar(h, 1, &[0.0]), OK);
        assert_eq!(n.saida(0), Some(&Saida::U32(vec![1])));
        assert_eq!(n.erro(), "");
    }

    #[test]
    fn alocar_e_liberar() {
        let mut n = Nucleo::novo();
        let antes = crate::memoria::saldo_bruto();
        let p = n.alocar(100).expect("aloca");
        assert_eq!(p % 8, 0);
        n.liberar(p + 8, 100); // não é nosso: ignorado
        assert!(n.erro().contains("nao veio"));
        n.liberar(p, 100);
        assert_eq!(n.erro(), "");
        n.liberar(p, 100); // duplo free ignorado
        assert!(!n.erro().is_empty());
        assert!(n.alocar(0).is_some());
        let _ = antes;
    }

    #[test]
    fn extern_sem_ponteiros_no_host() {
        // No host 64 bits os ponteiros u32 não funcionam: tudo que depende deles recusa em vez de arriscar.
        assert_eq!(abi2_alocar(16), 0);
        assert_eq!(cena_destruir(0), HANDLE);
        assert_eq!(cena_definir_secao(0, 1, 0, 0), HANDLE);
        assert_eq!(cena_executar(0, 1, 0, 0), HANDLE);
        assert_eq!(saida_n(), 0);
        assert!(erro_len() > 0);
        let h = cena_criar();
        assert!(h >= 1);
        assert_eq!(cena_definir_secao(h, 1, 0, 0), OK); // 0 linhas: vazio
        assert_eq!(cena_definir_secao(h, 1, 1, 0), ENTRADA); // 1 linha com ponteiro 0 / host
        assert_eq!(cena_remover_linhas(h, 1, 0, 0), OK);
        assert_eq!(cena_remover_linhas(h, 1, 1, 0), ENTRADA);
        assert_eq!(cena_remover_linhas(h, 1, LIMITE_LINHAS_POR_SECAO + 1, 0), LIMITE);
        assert_eq!(cena_executar(h, 99, 0, 0), NAO_IMPLEMENTADO);
        assert_eq!(cena_executar(h, 1, 1, 0), ENTRADA);
        assert_eq!(cena_executar(h, 1, 5000, 0), LIMITE);
        assert_eq!(cena_destruir(h), OK);
        assert_eq!(cena_destruir(h), HANDLE);
    }

    /// Sem vazamento: depois de criar, carregar 10 000 paredes, consultar e destruir, o alocador
    /// volta ao valor anterior.
    #[test]
    fn sem_vazamento_de_memoria() {
        let mut r = Xorshift::novo(31337);
        let mut linhas = Vec::new();
        for i in 0..10_000u32 {
            let (x, y) = (r.intervalo(0.0, 500.0), r.intervalo(0.0, 500.0));
            linhas.push((i + 1, i % 4, x, y, x + r.intervalo(-4.0, 4.0), y + r.intervalo(-4.0, 4.0), 0.15));
        }
        let (nl, bytes) = bytes_de(&linhas);
        let mut n = Nucleo::novo();
        let ciclo = |n: &mut Nucleo| {
            let h = n.criar();
            assert!(h >= 1);
            assert_eq!(n.definir_secao(h, SECAO_PAREDES, nl, &bytes), OK);
            for nivel in [0.0, 1.0, NIVEL_TODOS as f64] {
                assert_eq!(n.executar(h, 1, &[nivel]), OK);
                assert_eq!(n.executar(h, 2, &[nivel, 10.0, 10.0, 200.0, 200.0]), OK);
                assert_eq!(n.executar(h, 3, &[nivel, 0.1]), OK);
            }
            let (nl2, b2) = bytes_de(&linhas[..50]);
            assert_eq!(n.upsert(h, SECAO_PAREDES, nl2, &b2), OK);
            assert_eq!(n.remover(h, SECAO_PAREDES, &[1, 2, 3]), OK);
            assert_eq!(n.executar(h, 3, &[NIVEL_TODOS as f64, 0.1]), OK);
            // algumas falhas também não podem vazar
            assert_eq!(n.executar(h, 1, &[]), ENTRADA);
            n.saida_liberar();
            assert_eq!(n.destruir(h), OK);
        };
        // aquecimento: as estruturas fixas do núcleo (capacidade da tabela, texto de erro) se formam aqui
        ciclo(&mut n);
        n.erro = String::new();
        let antes = crate::memoria::saldo_bruto();
        ciclo(&mut n);
        n.erro = String::new();
        let depois = crate::memoria::saldo_bruto();
        assert_eq!(depois, antes, "vazou {} bytes", depois - antes);
        // a leitura exportada nunca passa do saldo bruto (e é o saldo quando positivo)
        assert_eq!(memoria_usada() as isize, depois.max(0));
        // a cena carregada realmente ocupa memória (o teste mede algo)
        let h = n.criar();
        n.definir_secao(h, SECAO_PAREDES, nl, &bytes);
        assert!(crate::memoria::saldo_bruto() > antes + 10_000 * 56);
        n.destruir(h);
    }

    #[test]
    fn determinismo_do_nucleo() {
        let mut r = Xorshift::novo(8);
        let mut linhas = Vec::new();
        for i in 0..500u32 {
            let (x, y) = (r.intervalo(0.0, 80.0), r.intervalo(0.0, 80.0));
            linhas.push((i * 2 + 1, i % 3, x, y, x + r.intervalo(-5.0, 5.0), y + r.intervalo(-5.0, 5.0), 0.2));
        }
        let (nl, bytes) = bytes_de(&linhas);
        let rodar = || {
            let mut n = Nucleo::novo();
            let h = n.criar();
            n.definir_secao(h, SECAO_PAREDES, nl, &bytes);
            n.executar(h, 3, &[NIVEL_TODOS as f64, 0.5]);
            n.saida(0).cloned()
        };
        assert_eq!(rodar(), rodar());
        assert!(rodar().is_some_and(|s| !s.is_empty()));
    }
}
