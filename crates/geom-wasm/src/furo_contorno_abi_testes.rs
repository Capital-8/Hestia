//! Testes da ABI do furo por contorno: layout dos buffers, saídas, erros, limites e estado.
//! Os testes chamam o núcleo puro (`furar_planos`, `Estado`); o wrapper `extern "C"` só é tocado
//! num teste, porque o estado dele é global.

use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE, OK};
use crate::furo_contorno_abi::*;

/// Retângulo anti-horário, origem no meio da base (contrato do spike).
fn retangulo(w: f64, h: f64) -> Vec<[f64; 2]> {
    vec![[-w / 2.0, 0.0], [w / 2.0, 0.0], [w / 2.0, h], [-w / 2.0, h]]
}

/// Buffers planos como o JS os escreveria.
struct Buffers {
    pontos: Vec<f64>,
    vaos: Vec<u32>,
    x: Vec<f64>,
    soleira: Vec<f64>,
    espessuras: Vec<f64>,
}

impl Buffers {
    /// `vaos_def`: (contorno, x, soleira) de cada vão.
    fn montar(vaos_def: &[(Vec<[f64; 2]>, f64, f64)], espessuras: &[f64]) -> Buffers {
        let mut pontos = Vec::new();
        let mut vaos = vec![0u32];
        let (mut x, mut soleira) = (Vec::new(), Vec::new());
        for (contorno, vx, vz) in vaos_def {
            for p in contorno {
                pontos.push(p[0]);
                pontos.push(p[1]);
            }
            vaos.push((pontos.len() / 2) as u32);
            x.push(*vx);
            soleira.push(*vz);
        }
        Buffers { pontos, vaos, x, soleira, espessuras: espessuras.to_vec() }
    }

    fn entradas(&self, comprimento: f64, altura: f64) -> Entradas<'_> {
        Entradas {
            pontos: &self.pontos,
            vaos: &self.vaos,
            x: &self.x,
            soleira: &self.soleira,
            espessuras: &self.espessuras,
            comprimento,
            altura,
        }
    }
}

fn f64s(s: &Saida) -> &[f64] {
    match s {
        Saida::F64(v) => v,
        _ => panic!("esperava F64"),
    }
}

fn u32s(s: &Saida) -> &[u32] {
    match s {
        Saida::U32(v) => v,
        _ => panic!("esperava U32"),
    }
}

fn parede_com_um_vao() -> Buffers {
    Buffers::montar(&[(retangulo(0.9, 1.4), 2.0, 0.5)], &[0.1, 0.2])
}

#[test]
fn layout_das_cinco_saidas_e_tipos() {
    let b = parede_com_um_vao();
    let s = furar_planos(&b.entradas(4.0, 3.0)).expect("fura");
    assert_eq!(s.len(), 5);
    let tipos: Vec<u32> = s.iter().map(|x| x.tipo()).collect();
    assert_eq!(tipos, vec![3, 1, 3, 1, 3]); // f64, u32, f64, u32, f64
    assert_eq!(f64s(&s[0]).len(), 4 * 2); // meta: 4 por camada
    assert_eq!(u32s(&s[1]).len(), 2 * 2); // contagens: 2 por camada
    assert_eq!(f64s(&s[4]).len(), 2); // totais
    let nv: u32 = u32s(&s[1]).iter().step_by(2).sum();
    let ni: usize = u32s(&s[1]).iter().skip(1).step_by(2).map(|&n| n as usize).sum();
    assert_eq!(f64s(&s[2]).len(), 3 * nv as usize);
    assert_eq!(u32s(&s[3]).len(), ni);
}

#[test]
fn meta_e_totais_batem_com_as_camadas() {
    let b = parede_com_um_vao();
    let s = furar_planos(&b.entradas(4.0, 3.0)).expect("fura");
    let meta = f64s(&s[0]);
    // camadas empilhadas a partir de y = 0
    assert!((meta[0] - 0.0).abs() < 1e-12 && (meta[1] - 0.1).abs() < 1e-12);
    assert!((meta[4] - 0.1).abs() < 1e-12 && (meta[5] - 0.3).abs() < 1e-12);
    // volume sem furo de cada camada = comprimento * espessura * altura
    assert!((meta[3] - 4.0 * 0.1 * 3.0).abs() < 1e-12);
    assert!((meta[7] - 4.0 * 0.2 * 3.0).abs() < 1e-12);
    // removido = área x espessura total (0,9 x 1,4 x 0,3)
    let removido_esperado = 0.9 * 1.4 * 0.3;
    let totais = f64s(&s[4]);
    let removido = totais[1];
    assert!((removido - removido_esperado).abs() < 1e-8, "removido {removido}");
    // a soma dos volumes por camada fecha com o total
    let soma: f64 = meta[2] + meta[6];
    assert!((soma - totais[0]).abs() < 1e-9);
    assert!((meta[2] + meta[6] + removido - (meta[3] + meta[7])).abs() < 1e-8);
}

#[test]
fn indices_sao_locais_e_validos() {
    let b = parede_com_um_vao();
    let s = furar_planos(&b.entradas(4.0, 3.0)).expect("fura");
    let cont = u32s(&s[1]);
    let idx = u32s(&s[3]);
    let mut ofs_idx = 0usize;
    for c in 0..2 {
        let nv = cont[2 * c] as u32;
        let ni = cont[2 * c + 1] as usize;
        assert_eq!(ni % 3, 0, "indices de uma camada vem em triangulos");
        assert!(idx[ofs_idx..ofs_idx + ni].iter().all(|&i| i < nv), "indice local fora dos vertices da camada");
        ofs_idx += ni;
    }
    assert_eq!(ofs_idx, idx.len());
}

#[test]
fn sem_vao_devolve_a_placa() {
    let b = Buffers::montar(&[], &[0.1, 0.2]);
    let s = furar_planos(&b.entradas(4.0, 3.0)).expect("fura sem vao");
    let totais = f64s(&s[4]);
    assert!(totais[1].abs() < 1e-12, "sem vao nada e removido");
    assert!((totais[0] - 4.0 * 0.3 * 3.0).abs() < 1e-9);
    // cubo: 8 vertices e 12 triangulos (36 indices) por camada
    assert_eq!(u32s(&s[1]), &[8, 36, 8, 36]);
}

#[test]
fn dois_vaos_iguais_nao_furam_duas_vezes() {
    let um = Buffers::montar(&[(retangulo(0.9, 1.4), 2.0, 0.5)], &[0.1, 0.2]);
    let dois = Buffers::montar(
        &[(retangulo(0.9, 1.4), 2.0, 0.5), (retangulo(0.9, 1.4), 2.0, 0.5)],
        &[0.1, 0.2],
    );
    let r1 = f64s(&furar_planos(&um.entradas(4.0, 3.0)).unwrap()[4])[1];
    let r2 = f64s(&furar_planos(&dois.entradas(4.0, 3.0)).unwrap()[4])[1];
    assert!((r1 - r2).abs() < 1e-8, "union nao conta o mesmo furo duas vezes: {r1} vs {r2}");
}

#[test]
fn determinismo() {
    let b = parede_com_um_vao();
    let a = furar_planos(&b.entradas(4.0, 3.0)).unwrap();
    let c = furar_planos(&b.entradas(4.0, 3.0)).unwrap();
    assert_eq!(a, c);
}

#[test]
fn entradas_invalidas_viram_entrada() {
    let casos: Vec<(&str, Buffers, f64, f64)> = vec![
        ("sem camadas", Buffers { espessuras: vec![], ..parede_com_um_vao() }, 4.0, 3.0),
        ("espessura zero", Buffers { espessuras: vec![0.1, 0.0], ..parede_com_um_vao() }, 4.0, 3.0),
        ("comprimento zero", parede_com_um_vao(), 0.0, 3.0),
        ("contorno com 2 pontos", Buffers::montar(&[(vec![[0.0, 0.0], [1.0, 0.0]], 2.0, 0.5)], &[0.1]), 4.0, 3.0),
        ("vao fora da parede", Buffers::montar(&[(retangulo(0.9, 1.4), 3.9, 0.5)], &[0.1]), 4.0, 3.0),
        ("offset inicial diferente de zero", Buffers { vaos: vec![1, 4], ..parede_com_um_vao() }, 4.0, 3.0),
        ("offsets decrescentes", Buffers { vaos: vec![0, 4, 2], x: vec![2.0, 2.0], soleira: vec![0.5, 0.5], ..parede_com_um_vao() }, 4.0, 3.0),
        ("ultimo offset nao fecha", Buffers { vaos: vec![0, 3], ..parede_com_um_vao() }, 4.0, 3.0),
        ("x com tamanho errado", Buffers { x: vec![], ..parede_com_um_vao() }, 4.0, 3.0),
        ("pontos em numero impar", Buffers { pontos: vec![0.0; 3], vaos: vec![0, 3], ..parede_com_um_vao() }, 4.0, 3.0),
    ];
    for (nome, b, comp, alt) in casos {
        match furar_planos(&b.entradas(comp, alt)) {
            Err((c, _)) => assert_eq!(c, ENTRADA, "caso: {nome}"),
            Ok(_) => panic!("caso deveria falhar: {nome}"),
        }
    }
}

#[test]
fn limites_viram_limite() {
    let muitos_vaos = Buffers { x: vec![0.0; 1025], soleira: vec![0.0; 1025], vaos: vec![0; 1026], ..parede_com_um_vao() };
    let (c, msg) = furar_planos(&muitos_vaos.entradas(4.0, 3.0)).unwrap_err();
    assert_eq!(c, LIMITE);
    assert!(msg.contains("vaos"));

    let muitas_camadas = Buffers { espessuras: vec![0.01; 33], ..parede_com_um_vao() };
    let (c, _) = furar_planos(&muitas_camadas.entradas(4.0, 3.0)).unwrap_err();
    assert_eq!(c, LIMITE);
}

#[test]
fn estado_guarda_saidas_e_limpa_no_erro() {
    let mut e = Estado::novo();
    let b = parede_com_um_vao();
    assert_eq!(e.furar(&b.entradas(4.0, 3.0)), OK);
    assert_eq!(e.saida_n(), 5);
    assert_eq!((e.saida_tipo(0), e.saida_len(0)), (3, 8));
    assert_eq!((e.saida_tipo(1), e.saida_len(1)), (1, 4));
    assert!(e.saida_ptr(2) != 0 || e.saida_len(2) == 0);
    assert_eq!(e.erro(), "");
    // falha: descarta as saídas anteriores e grava o texto do erro
    let ruim = Buffers { espessuras: vec![0.1, -1.0], ..parede_com_um_vao() };
    assert_eq!(e.furar(&ruim.entradas(4.0, 3.0)), ENTRADA);
    assert_eq!(e.saida_n(), 0);
    assert!(e.erro().starts_with("entrada invalida"));
    assert!(e.erro().contains("camada 1"));
    // sucesso de novo limpa o erro
    assert_eq!(e.furar(&b.entradas(4.0, 3.0)), OK);
    assert_eq!(e.erro(), "");
    e.saida_liberar();
    assert_eq!(e.saida_n(), 0);
}

#[test]
fn wrappers_no_host_recusam_ponteiros() {
    // Único teste que toca o estado global ESTADO: os demais usam o núcleo puro.
    assert_eq!(furo_abi_versao(), 1);
    assert_eq!(furo_contorno_furar(LIMITE_VAOS + 1, 0, 0, 0, 0, 0, 1, 0, 1.0, 1.0), LIMITE);
    // ponteiro de vaos com 0 fora do wasm: recusado como ENTRADA
    assert_eq!(furo_contorno_furar(0, 0, 0, 0, 0, 0, 1, 0, 4.0, 3.0), ENTRADA);
    assert_eq!(furo_saida_n(), 0);
    assert!(furo_erro_len() > 0);
    furo_saida_liberar();
}
