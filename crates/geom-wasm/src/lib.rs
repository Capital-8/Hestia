//! ABI do kernel geométrico experimental do Hestia.
//!
//! Este arquivo é o CONTRATO com o lado JavaScript (`packages/geom/src/kernel/contrato.ts`).
//! A geometria em si fica em `ops.rs`, que é o único lugar que um implementador precisa mexer.
//!
//! ## Modelo de dados
//!
//! Espelha o TypeScript: `MultiPoligono = Poligono[]`, `Poligono = Anel[]`, `Anel = Ponto[]`,
//! com o primeiro anel de cada polígono sendo o externo e os demais furos. Coordenadas em METROS.
//! A quantização a 1 µm (escala 1e6, arredondamento igual ao `Math.round` do JS) é responsabilidade
//! de `ops.rs`, porque é detalhe de algoritmo — o ABI só transporta f64.
//!
//! ## Memória: entrada
//!
//! O JS chama `preparar_entrada(n_vertices, n_aneis, n_poligonos, n_args)`, que reserva uma arena
//! e devolve o ponteiro base. A partir de `base`, o layout é:
//!
//! ```text
//!   base + 0                          vertices: 2 * n_vertices * f64  (x,y intercalados)
//!   base + 16*n_vertices              aneis:    (n_aneis + 1) * u32   (índice do 1º vértice de cada anel; último = n_vertices)
//!   base + 16*n_vertices + 4*(n_aneis+1)             poligonos: (n_poligonos + 1) * u32 (índice do 1º anel de cada polígono)
//!   base + 16*n_vertices + 4*(n_aneis+1) + 4*(n_poligonos+1)  args: (n_args + 1) * u32 (índice do 1º polígono de cada argumento)
//! ```
//!
//! O JS escreve nessa região DEPOIS da chamada (a memória pode ter crescido durante ela, o que
//! invalidaria views antigas) e antes de `executar`. Nenhuma chamada ao wasm acontece no meio.
//!
//! ## Memória: saída
//!
//! `executar` grava o resultado na mesma codificação (sem a seção `args`). O JS lê com os pares
//! `saida_*_ptr` / `saida_*_len`. Os ponteiros valem até a próxima chamada a `executar`.
//!
//! ## Códigos de retorno de `executar`
//!
//! `0` ok · `1` operação desconhecida · `2` entrada inválida · `3` erro interno.
//! Qualquer código diferente de 0 faz o lado JS voltar para a implementação TypeScript.
//!
//! ## Só wasm32
//!
//! Os ponteiros desta ABI são `u32` porque o alvo é `wasm32-unknown-unknown`. Compilada para o host
//! (x86_64), `preparar_entrada` truncaria o ponteiro e qualquer escrita na arena causaria
//! access violation. Por isso os testes nativos cobrem só as funções puras.

#![allow(static_mut_refs)]

pub mod ops;

// ABI v2 (decisão 0046): cenas em colunas, consultas e índice espacial. A ABI v1 abaixo continua
// exportada e inalterada até a fatia A cobrir o mesmo uso.
pub mod a1;
pub mod a2;
pub mod a3;
pub mod a3b;
pub mod a3c;
pub mod a3d;
pub mod b1;
pub mod b2;
pub mod b3;
pub mod abi2;
pub mod camadas;
pub mod cena;
pub mod envolvimento;
pub mod consultas;
pub mod esquema;
pub mod geo2d;
pub mod grupos;
pub mod itens;
pub mod juncoes;
pub mod perfil_quant;
pub mod pintor;
pub mod quantidades;
pub mod indice;
pub mod memoria;
pub mod quadro;
pub mod secoes_a1;
pub mod secoes_a3;
pub mod secoes_b;
pub mod secoes_gc;
pub mod gc_tipos;
pub mod gc_distribuicao;
pub mod gc_montagem;
pub mod gc_planta;
pub mod gc_corte;
pub mod gc_quant;
pub mod gc_avisos;
pub mod gc_malha;
pub mod gc_varredura;
pub mod gc_caminho;
// Parede cortina (decisão 0056, fase 1).
pub mod cortina_avisos;
pub mod cortina_grade;
pub mod cortina_hosp;
pub mod cortina_juncao;
pub mod cortina_malha;
pub mod cortina_pecas;
pub mod cortina_planta;
pub mod cortina_porta;
pub mod cortina_quant;
pub mod cortina_remap;
pub mod cortina_tipos;
pub mod secoes_cortina;
pub mod volume_sobreposicao;
#[cfg(test)]
mod teste_util;

use std::slice;

/// Alocador global contador (`memoria_usada()`); embrulha o alocador padrão.
#[global_allocator]
static ALOCADOR: memoria::Contador = memoria::Contador;

/// Versão do ABI. O lado JS recusa um wasm cuja versão não bata.
pub const VERSAO_ABI: u32 = 1;

/// `union(...)` e `unionClipper(...)`: união de todos os argumentos.
pub const OP_UNIAO: u32 = 0;
/// `difference(a, ...bs)` e `differenceClipper(a, ...bs)`: o primeiro menos os demais.
pub const OP_DIFERENCA: u32 = 1;
/// `intersection(a, b)`.
pub const OP_INTERSECAO: u32 = 2;
/// `offsetMulti(m, delta)`: `param` é o delta em metros.
pub const OP_OFFSET: u32 = 3;

pub const ERRO_OK: u32 = 0;
pub const ERRO_OP: u32 = 1;
pub const ERRO_ENTRADA: u32 = 2;
pub const ERRO_INTERNO: u32 = 3;
/// A operação existe no contrato mas ainda não foi implementada no kernel. O lado JS refaz **só
/// essa operação** em TypeScript e mantém o kernel ativo (não é falha, não aciona o disjuntor).
pub const ERRO_NAO_IMPLEMENTADO: u32 = 4;

pub type Ponto = [f64; 2];
pub type Anel = Vec<Ponto>;
pub type Poligono = Vec<Anel>;
pub type MultiPoligono = Vec<Poligono>;

struct Entrada {
    base: *mut u8,
    n_vertices: usize,
    n_aneis: usize,
    n_poligonos: usize,
    n_args: usize,
}

/// Estado global: o wasm é single-thread (sem `wasm threads` neste experimento), então `static mut`
/// é seguro por construção. `RefCell`/`thread_local` não servem porque o ponteiro precisa viver
/// entre duas chamadas do JS.
static mut ENTRADA: Entrada = Entrada {
    base: std::ptr::null_mut(),
    n_vertices: 0,
    n_aneis: 0,
    n_poligonos: 0,
    n_args: 0,
};
static mut ARENA: Vec<u64> = Vec::new();
static mut SAIDA_VERTICES: Vec<f64> = Vec::new();
static mut SAIDA_ANEIS: Vec<u32> = Vec::new();
static mut SAIDA_POLIGONOS: Vec<u32> = Vec::new();
static mut SAIDA_AREA: f64 = 0.0;

/// Alinhamento da arena: `Vec<u64>` garante 8 bytes, que é o exigido pelos `f64`.
const ALINHAMENTO: usize = 8;

fn bytes_da_entrada(n_vertices: usize, n_aneis: usize, n_poligonos: usize, n_args: usize) -> usize {
    let bytes = 16 * n_vertices + 4 * (n_aneis + 1) + 4 * (n_poligonos + 1) + 4 * (n_args + 1);
    (bytes + ALINHAMENTO - 1) / ALINHAMENTO * ALINHAMENTO
}

/// Reserva a arena de entrada e devolve o ponteiro base (0 em caso de estouro).
#[no_mangle]
pub extern "C" fn preparar_entrada(n_vertices: u32, n_aneis: u32, n_poligonos: u32, n_args: u32) -> u32 {
    let nv = n_vertices as usize;
    let na = n_aneis as usize;
    let np = n_poligonos as usize;
    let nargs = n_args as usize;
    let bytes = bytes_da_entrada(nv, na, np, nargs);
    let palavras = bytes / ALINHAMENTO;
    unsafe {
        ARENA.clear();
        ARENA.resize(palavras, 0);
        let base = ARENA.as_mut_ptr() as *mut u8;
        ENTRADA = Entrada { base, n_vertices: nv, n_aneis: na, n_poligonos: np, n_args: nargs };
        base as u32
    }
}

#[no_mangle]
pub extern "C" fn versao_abi() -> u32 {
    VERSAO_ABI
}

/// Executa uma operação. Ver o cabeçalho do módulo para o significado de `op` e dos códigos.
#[no_mangle]
pub extern "C" fn executar(op: u32, n_args: u32, param: f64) -> u32 {
    let entrada = unsafe { &ENTRADA };
    if entrada.base.is_null() {
        return ERRO_ENTRADA;
    }
    if n_args as usize != entrada.n_args {
        return ERRO_ENTRADA;
    }
    let args = match ler_entrada(entrada) {
        Some(a) => a,
        None => return ERRO_ENTRADA,
    };
    let resultado = executar_op(op, &args, param);
    match resultado {
        Ok(m) => {
            let area = area_total(&m);
            publicar(&m, area);
            ERRO_OK
        }
        Err(codigo) => codigo,
    }
}

/// A operação em si, sem a arena: o que `executar` faz depois de decodificar a entrada. Pura, então os testes a chamam direto.
///
/// `param` em `OP_DIFERENCA`: `0` é a diferença de sempre (1 µm, todos os subtraendos); `1` descarta antes os subtraendos que só encostam no
/// minuendo (ver [`ops::diferenca_relevante`]). Em `OP_OFFSET` é o `delta`; nas demais é ignorado.
pub(crate) fn executar_op(op: u32, args: &[MultiPoligono], param: f64) -> Result<MultiPoligono, u32> {
    match op {
        OP_UNIAO => ops::uniao(args),
        OP_DIFERENCA if param == 1.0 => ops::diferenca_relevante(args),
        OP_DIFERENCA => ops::diferenca(args),
        OP_INTERSECAO => {
            if args.len() != 2 {
                return Err(ERRO_ENTRADA);
            }
            ops::interseccao(&args[0], &args[1])
        }
        OP_OFFSET => {
            if args.len() != 1 {
                return Err(ERRO_ENTRADA);
            }
            ops::offset(&args[0], param)
        }
        _ => Err(ERRO_OP),
    }
}

/// Lê a entrada da arena e decodifica. Devolve `None` se os índices não fizerem sentido.
fn ler_entrada(entrada: &Entrada) -> Option<Vec<MultiPoligono>> {
    let base = entrada.base;
    let nv = entrada.n_vertices;
    let na = entrada.n_aneis;
    let np = entrada.n_poligonos;
    let nargs = entrada.n_args;
    if nargs == 0 || na == 0 || np == 0 {
        return None;
    }
    unsafe {
        let vertices = slice::from_raw_parts(base as *const f64, 2 * nv);
        let ini_aneis = base.add(16 * nv) as *const u32;
        let aneis = slice::from_raw_parts(ini_aneis, na + 1);
        let ini_poli = base.add(16 * nv + 4 * (na + 1)) as *const u32;
        let poligonos = slice::from_raw_parts(ini_poli, np + 1);
        let ini_args = base.add(16 * nv + 4 * (na + 1) + 4 * (np + 1)) as *const u32;
        let args = slice::from_raw_parts(ini_args, nargs + 1);
        decodificar(vertices, aneis, poligonos, args, nv, na, np, nargs)
    }
}

/// Decodifica seções já recortadas da arena. **Puro**: não toca no estado global, então é o que os
/// testes usam. Valida todos os índices antes de usá-los — o lado JS nunca pode causar panic aqui.
pub(crate) fn decodificar(
    vertices: &[f64],
    aneis: &[u32],
    poligonos: &[u32],
    args: &[u32],
    n_vertices: usize,
    n_aneis: usize,
    n_poligonos: usize,
    n_args: usize,
) -> Option<Vec<MultiPoligono>> {
    if n_args == 0 || n_aneis == 0 || n_poligonos == 0 {
        return None;
    }
    if vertices.len() < 2 * n_vertices
        || aneis.len() < n_aneis + 1
        || poligonos.len() < n_poligonos + 1
        || args.len() < n_args + 1
    {
        return None;
    }
    if aneis[n_aneis] as usize != n_vertices
        || poligonos[n_poligonos] as usize != n_aneis
        || args[n_args] as usize != n_poligonos
    {
        return None;
    }
    for &v in &aneis[..=n_aneis] {
        if v as usize > n_vertices {
            return None;
        }
    }
    for &v in &poligonos[..=n_poligonos] {
        if v as usize > n_aneis {
            return None;
        }
    }
    for &v in &args[..=n_args] {
        if v as usize > n_poligonos {
            return None;
        }
    }
    let mut saida: Vec<MultiPoligono> = Vec::with_capacity(n_args);
    for a in 0..n_args {
        let mut multi: MultiPoligono = Vec::new();
        for p in args[a] as usize..args[a + 1] as usize {
            let mut poli: Poligono = Vec::new();
            for r in poligonos[p] as usize..poligonos[p + 1] as usize {
                let de = aneis[r] as usize;
                let ate = aneis[r + 1] as usize;
                if ate < de || ate > n_vertices {
                    return None;
                }
                let mut anel: Anel = Vec::with_capacity(ate - de);
                for i in de..ate {
                    anel.push([vertices[2 * i], vertices[2 * i + 1]]);
                }
                poli.push(anel);
            }
            multi.push(poli);
        }
        saida.push(multi);
    }
    Some(saida)
}

/// Grava o resultado nas arenas de saída.
fn publicar(m: &MultiPoligono, area: f64) {
    let mut vertices: Vec<f64> = Vec::new();
    let mut aneis: Vec<u32> = vec![0];
    let mut poligonos: Vec<u32> = vec![0];
    let mut n_vertices: u32 = 0;
    for poli in m {
        for anel in poli {
            aneis.push(n_vertices + anel.len() as u32);
            n_vertices += anel.len() as u32;
            for p in anel {
                vertices.push(p[0]);
                vertices.push(p[1]);
            }
        }
        poligonos.push(aneis.len() as u32 - 1);
    }
    unsafe {
        SAIDA_VERTICES = vertices;
        SAIDA_ANEIS = aneis;
        SAIDA_POLIGONOS = poligonos;
        SAIDA_AREA = area;
    }
}

/// Área líquida (externo menos furos), igual a `multiArea` do TypeScript.
fn area_total(m: &MultiPoligono) -> f64 {
    let mut total = 0.0;
    for poli in m {
        for (i, anel) in poli.iter().enumerate() {
            let mut s = 0.0;
            for k in 0..anel.len() {
                let a = anel[k];
                let b = anel[(k + 1) % anel.len()];
                s += a[0] * b[1] - b[0] * a[1];
            }
            let a = (s / 2.0).abs();
            total += if i == 0 { a } else { -a };
        }
    }
    total
}

#[no_mangle]
pub extern "C" fn saida_vertices_ptr() -> u32 {
    unsafe { SAIDA_VERTICES.as_ptr() as u32 }
}

#[no_mangle]
pub extern "C" fn saida_vertices_len() -> u32 {
    unsafe { SAIDA_VERTICES.len() as u32 }
}

#[no_mangle]
pub extern "C" fn saida_aneis_ptr() -> u32 {
    unsafe { SAIDA_ANEIS.as_ptr() as u32 }
}

#[no_mangle]
pub extern "C" fn saida_aneis_len() -> u32 {
    unsafe { SAIDA_ANEIS.len() as u32 }
}

#[no_mangle]
pub extern "C" fn saida_poligonos_ptr() -> u32 {
    unsafe { SAIDA_POLIGONOS.as_ptr() as u32 }
}

#[no_mangle]
pub extern "C" fn saida_poligonos_len() -> u32 {
    unsafe { SAIDA_POLIGONOS.len() as u32 }
}

/// Área do último resultado, para quem só quer a área (evita redecodificar a saída).
#[no_mangle]
pub extern "C" fn saida_area() -> f64 {
    unsafe { SAIDA_AREA }
}

#[cfg(test)]
mod testes {
    use super::*;

    /// O caminho de arena/ponteiros é **wasm32-only**: `preparar_entrada` devolve `u32`, o que
    /// truncaria um ponteiro de 64 bits no host. Por isso os testes daqui exercitam só as funções
    /// puras; o caminho real (JS escreve na memória linear, wasm lê) é coberto pelo teste do lado
    /// TypeScript (`packages/geom/src/kernel/glue.test.ts`).
    #[test]
    fn decodifica_dois_argumentos() {
        let quadrado: Anel = vec![[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]];
        let triangulo: Anel = vec![[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]];
        let mut vertices: Vec<f64> = Vec::new();
        for pt in quadrado.iter().chain(triangulo.iter()) {
            vertices.push(pt[0]);
            vertices.push(pt[1]);
        }
        let aneis = vec![0u32, 4, 7];
        let poligonos = vec![0u32, 1, 2];
        let args = vec![0u32, 1, 2];
        let lidos = decodificar(&vertices, &aneis, &poligonos, &args, 7, 2, 2, 2).expect("decodifica");
        assert_eq!(lidos.len(), 2);
        assert_eq!(lidos[0].len(), 1);
        assert_eq!(lidos[0][0][0], quadrado);
        assert_eq!(lidos[1][0][0], triangulo);
    }

    #[test]
    fn indices_inconsistentes_sao_recusados() {
        let vertices = vec![0.0f64; 4];
        // Diz que o primeiro anel termina no vértice 3, mas só existem 2.
        let aneis = vec![0u32, 3];
        let poligonos = vec![0u32, 1];
        let args = vec![0u32, 1];
        assert!(decodificar(&vertices, &aneis, &poligonos, &args, 2, 1, 1, 1).is_none());
        // Terminador do último anel não fecha com o total de vértices.
        let aneis2 = vec![0u32, 2];
        assert!(decodificar(&vertices, &aneis2, &poligonos, &args, 3, 1, 1, 1).is_none());
    }

    #[test]
    fn sem_argumentos_e_recusado() {
        let vertices = vec![0.0f64; 2];
        let aneis = vec![0u32, 1];
        let poligonos = vec![0u32, 1];
        let args = vec![0u32];
        assert!(decodificar(&vertices, &aneis, &poligonos, &args, 1, 1, 1, 0).is_none());
    }

    #[test]
    fn area_liquida_conta_furo_negativo() {
        let externo: Anel = vec![[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]];
        let furo: Anel = vec![[1.0, 1.0], [1.0, 3.0], [3.0, 3.0], [3.0, 1.0]];
        let m: MultiPoligono = vec![vec![externo, furo]];
        assert!((area_total(&m) - 12.0).abs() < 1e-12);
    }

    #[test]
    fn area_de_multi_poligonos_soma() {
        let a: Anel = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        let b: Anel = vec![[5.0, 5.0], [7.0, 5.0], [7.0, 7.0], [5.0, 7.0]];
        let m: MultiPoligono = vec![vec![a], vec![b]];
        assert!((area_total(&m) - 5.0).abs() < 1e-12);
    }
}
