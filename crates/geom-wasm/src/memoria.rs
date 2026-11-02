//! Contabilidade de memória: um alocador global que embrulha o do sistema e soma os bytes vivos.
//!
//! O contador é **por thread** (`thread_local` com `Cell`, sem alocação nem destrutor). No wasm só
//! existe uma thread, então ele conta tudo; nos testes nativos (que rodam em threads paralelas) cada
//! teste mede só o que ele mesmo alocou, sem ruído dos vizinhos.

use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

thread_local! {
    static VIVOS: Cell<isize> = const { Cell::new(0) };
}

#[inline]
fn somar(delta: isize) {
    // `try_with`: durante o encerramento da thread o acesso pode falhar; nesse caso, ignora.
    let _ = VIVOS.try_with(|c| c.set(c.get().wrapping_add(delta)));
}

/// Saldo bruto da thread atual (pode ser negativo se a thread liberou memória alocada por outra;
/// os testes comparam diferenças deste valor, que não sofre o truncamento em 0).
pub fn saldo_bruto() -> isize {
    VIVOS.try_with(|c| c.get()).unwrap_or(0)
}

/// Bytes vivos alocados pela thread atual (nunca negativo).
pub fn bytes_vivos() -> usize {
    VIVOS.try_with(|c| c.get().max(0) as usize).unwrap_or(0)
}

pub struct Contador;

// SAFETY: delega tudo ao alocador do sistema e só soma/subtrai um contador local.
unsafe impl GlobalAlloc for Contador {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let p = System.alloc(layout);
        if !p.is_null() {
            somar(layout.size() as isize);
        }
        p
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let p = System.alloc_zeroed(layout);
        if !p.is_null() {
            somar(layout.size() as isize);
        }
        p
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        System.dealloc(ptr, layout);
        somar(-(layout.size() as isize));
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, novo: usize) -> *mut u8 {
        let p = System.realloc(ptr, layout, novo);
        if !p.is_null() {
            somar(novo as isize - layout.size() as isize);
        }
        p
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn conta_alocacao_e_liberacao() {
        let antes = saldo_bruto();
        let v: Vec<u8> = std::hint::black_box(vec![7; 1000]);
        assert!(saldo_bruto() >= antes + 1000);
        drop(v);
        assert_eq!(saldo_bruto(), antes);
    }

    #[test]
    fn conta_realloc() {
        let antes = saldo_bruto();
        let mut v: Vec<u64> = Vec::new();
        for i in 0..5000 {
            v.push(i);
        }
        let v = std::hint::black_box(v);
        assert!(saldo_bruto() >= antes + 5000 * 8);
        drop(v);
        assert_eq!(saldo_bruto(), antes);
    }
}
