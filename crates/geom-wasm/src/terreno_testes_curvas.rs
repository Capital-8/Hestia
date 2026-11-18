//! Testes de aceite da ficha R2 do terreno (PLANO do terreno A.10 e Parte D): curvas de nível (161), borda em planta (162), quantidades (165) e avisos (168).
//! Os do corte (164) estão em `terreno_testes_corte.rs`. Também ficam aqui os leitores das saídas, usados pelos outros testes da ficha.

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{
    CONSULTA_QUANT_TERRENO, CONSULTA_TERRENO_AVISOS, CONSULTA_TERRENO_CURVAS, CONSULTA_TERRENO_PLANTA, ENTRADA, ID_AUSENTE, LIMITE, NIVEL_TODOS,
};
use crate::terreno_fixture::{cena_com, t1, t2, t3, t4, t8, t9, TerrenoFx};
use crate::terreno_tipos::{AVISO_COTAS_DIFERENTES, AVISO_LINHA_CRUZA, AVISO_SEM_TRIANGULOS};

pub fn u32s(s: &Saida) -> Vec<u32> {
    match s {
        Saida::U32(v) => v.clone(),
        Saida::F64(_) => panic!("esperava u32"),
    }
}

pub fn f64s(s: &Saida) -> Vec<f64> {
    match s {
        Saida::F64(v) => v.clone(),
        Saida::U32(_) => panic!("esperava f64"),
    }
}

/// Uma linha das consultas 161, 162 e 164. `marca` é a segunda coluna (`mestra` nas curvas, `papel` na planta e no corte); `z` só existe nas curvas.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaLida {
    pub terreno: u32,
    pub marca: u32,
    pub fechada: bool,
    pub pontos: Vec<[f64; 2]>,
    pub z: f64,
}

impl LinhaLida {
    /// Comprimento (com o trecho de fecho, se fechada).
    pub fn comprimento(&self) -> f64 {
        let n = self.pontos.len();
        (0..if self.fechada { n } else { n - 1 }).map(|k| (self.pontos[k], self.pontos[(k + 1) % n])).map(|(a, b)| (b[0] - a[0]).hypot(b[1] - a[1])).sum()
    }

    /// Área assinada do polígono (positiva no sentido anti-horário).
    pub fn area(&self) -> f64 {
        let n = self.pontos.len();
        (0..n).map(|k| (self.pontos[k], self.pontos[(k + 1) % n])).map(|(a, b)| (a[0] * b[1] - a[1] * b[0]) / 2.0).sum()
    }
}

/// Monta as linhas a partir de `linhas [terreno, marca, fechada, n_pontos]`, `pontos` e, se houver, `cotas`. Confere que os tamanhos fecham.
pub fn ler_linhas(s: &[Saida]) -> Vec<LinhaLida> {
    let (l, p) = (u32s(&s[0]), f64s(&s[1]));
    let z = s.get(2).map(f64s);
    assert_eq!(l.len() % 4, 0);
    let mut out = Vec::new();
    let mut i = 0;
    for (k, c) in l.chunks_exact(4).enumerate() {
        assert!(c[2] <= 1, "fechada é 0 ou 1");
        let n = c[3] as usize;
        assert!(n >= 2, "linha com menos de 2 pontos");
        let pontos = p[2 * i..2 * (i + n)].chunks_exact(2).map(|q| [q[0], q[1]]).collect();
        i += n;
        out.push(LinhaLida { terreno: c[0], marca: c[1], fechada: c[2] == 1, pontos, z: z.as_ref().map_or(0.0, |z| z[k]) });
    }
    assert_eq!(p.len(), 2 * i, "todos os pontos pertencem a alguma linha");
    if let Some(z) = z {
        assert_eq!(z.len(), out.len(), "uma cota por linha");
    }
    out
}

/// Curvas EXATAS (tolerância 0, o padrão).
pub fn curvas(cena: &mut Cena, nivel: u32, superficie: u32) -> Vec<LinhaLida> {
    curvas_tol(cena, nivel, superficie, 0.0)
}

/// Curvas com a tolerância de suavização `tol` (m); 0 = exatas.
pub fn curvas_tol(cena: &mut Cena, nivel: u32, superficie: u32, tol: f64) -> Vec<LinhaLida> {
    let s = executar(cena, CONSULTA_TERRENO_CURVAS, &[f64::from(nivel), f64::from(superficie), tol]).expect("terreno_curvas");
    assert_eq!(s.len(), 3);
    ler_linhas(&s)
}

pub fn planta(cena: &mut Cena, nivel: u32, superficie: u32) -> Vec<LinhaLida> {
    let s = executar(cena, CONSULTA_TERRENO_PLANTA, &[f64::from(nivel), f64::from(superficie)]).expect("terreno_planta");
    assert_eq!(s.len(), 2);
    ler_linhas(&s)
}

/// Consulta 165: `(terreno_num, valores)` por terreno.
pub fn quant(cena: &mut Cena, nivel: u32) -> Vec<(u32, [f64; 8])> {
    let s = executar(cena, CONSULTA_QUANT_TERRENO, &[f64::from(nivel)]).expect("quant_terreno");
    let (l, v) = (u32s(&s[0]), f64s(&s[1]));
    assert_eq!(v.len(), 8 * l.len());
    l.iter().zip(v.chunks_exact(8)).map(|(&t, c)| (t, [c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])).collect()
}

/// Consulta 168: `([terreno, codigo, regiao, indice], [medido, limite, x, y, z])` por aviso.
pub fn avisos(cena: &mut Cena, nivel: u32) -> Vec<([u32; 4], [f64; 5])> {
    let s = executar(cena, CONSULTA_TERRENO_AVISOS, &[f64::from(nivel)]).expect("terreno_avisos");
    let (a, v) = (u32s(&s[0]), f64s(&s[1]));
    assert_eq!((a.len() % 4, v.len() / 5), (0, a.len() / 4));
    a.chunks_exact(4).zip(v.chunks_exact(5)).map(|(a, v)| ([a[0], a[1], a[2], a[3]], [v[0], v[1], v[2], v[3], v[4]])).collect()
}

#[test]
fn t1_plano_sem_curvas() {
    assert!(curvas(&mut cena_com(&[t1(1)]), 0, 0).is_empty(), "plano em z = 10: a cota 10 é a mínima e não gera curva");
}

#[test]
fn t2_curvas_retas() {
    let mut cena = cena_com(&[t2(1)]);
    let c = curvas(&mut cena, 0, 0);
    assert_eq!(c.iter().map(|l| l.z).collect::<Vec<_>>(), vec![10.5, 11.0, 11.5, 12.0], "4 curvas, em cota crescente");
    for (l, x) in c.iter().zip([2.5, 7.5, 12.5, 17.5]) {
        assert_eq!((l.terreno, l.marca, l.fechada), (1, 0, false));
        assert!(l.pontos.iter().all(|p| (p[0] - x).abs() < 1e-9), "reta em x = {x}: {:?}", l.pontos);
        assert!((l.comprimento() - 20.0).abs() < 1e-9, "20 m: {}", l.comprimento());
        let ys: Vec<f64> = l.pontos.iter().map(|p| p[1]).collect();
        assert!(ys.windows(2).all(|w| w[1] < w[0]), "com o lado alto (+x) à esquerda, a curva desce em y: {ys:?}");
    }
    assert_eq!(curvas(&mut cena, NIVEL_TODOS, 1), c, "a proposta é igual à existente até a R3");
    assert!(curvas(&mut cena, 7, 0).is_empty(), "outro nível");
}

#[test]
fn t3_curvas_quadradas() {
    // Modo EXATO (padrão): a polilinha da malha, 4 pontos por curva, perímetros e áreas exatos; fechada sem repetir o primeiro ponto.
    let c = curvas(&mut cena_com(&[t3(1)]), 0, 0);
    assert_eq!(c.iter().map(|l| l.z).collect::<Vec<_>>(), vec![1.0, 2.0, 3.0, 4.0], "nenhuma curva em z = 0 nem em z = 5");
    for (l, lado) in c.iter().zip([16.0, 12.0, 8.0, 4.0]) {
        assert!(l.fechada, "curva fechada");
        assert_eq!(l.pontos.len(), 4, "4 cantos, sem arredondar");
        assert!((l.comprimento() - 4.0 * lado).abs() < 1e-9, "perímetro {}", l.comprimento());
        assert!((l.area() - lado * lado).abs() < 1e-9, "área {}", l.area());
    }
    let m = crate::terreno_avalia::Malha::nova(vec![[0.0, 0.0, 0.0], [20.0, 0.0, 0.0], [20.0, 20.0, 0.0], [0.0, 20.0, 0.0], [10.0, 10.0, 5.0]], vec![0, 1, 2, 3, 4], vec![[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], Vec::new());
    let cru = crate::terreno_curvas::curvas_da_malha(&m, 1.0, 5).expect("curvas");
    assert!(cru.iter().all(|c| c.fechada && c.pontos.len() == 4));
    assert_eq!(cru.iter().map(|c| c.pontos.clone()).collect::<Vec<_>>(), c.iter().map(|l| l.pontos.clone()).collect::<Vec<_>>(), "exata = crua");
}

#[test]
fn t3_curvas_suavizadas_respeitam_a_tolerancia() {
    // Modo SUAVIZADO: Chaikin por vértice enquanto o desvio à curva crua fica <= tolerância.
    let m = crate::terreno_avalia::Malha::nova(vec![[0.0, 0.0, 0.0], [20.0, 0.0, 0.0], [20.0, 20.0, 0.0], [0.0, 20.0, 0.0], [10.0, 10.0, 5.0]], vec![0, 1, 2, 3, 4], vec![[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]], Vec::new());
    let cruas = crate::terreno_curvas::curvas_da_malha(&m, 1.0, 5).expect("curvas");
    for tol in [0.02, 0.5, 5.0] {
        let suaves = crate::terreno_curvas::curvas_suaves(&m, 1.0, 5, &[], tol).expect("curvas");
        assert_eq!(suaves.len(), cruas.len());
        for (s, c) in suaves.iter().zip(&cruas) {
            let n = c.pontos.len();
            let segs: Vec<_> = (0..n).map(|k| (c.pontos[k], c.pontos[(k + 1) % n])).collect();
            for p in &s.pontos {
                let d = segs.iter().map(|&(a, b)| dist_seg(*p, a, b)).fold(f64::INFINITY, f64::min);
                assert!(d <= tol + 1e-9, "tol {tol}: ponto {p:?} a {d} da curva crua (z = {})", s.z);
            }
            // Os cantos distantes mais que a tolerância ficam; com tolerância folgada a curva é suavizada.
            assert!(!crate::terreno_curvas::se_cruza(&s.pontos, true));
        }
        let de_novo = crate::terreno_curvas::curvas_suaves(&m, 1.0, 5, &[], tol).expect("curvas");
        assert_eq!(de_novo, suaves, "determinístico");
        if tol >= 5.0 {
            assert!(suaves.iter().any(|s| s.pontos.len() > 4), "tolerância folgada suaviza");
        }
        if tol <= 0.02 {
            assert!(suaves.iter().all(|s| s.pontos.len() == 4), "2 cm: cantos a 90 graus de um quadrado de 12+ m não se cortam");
        }
    }
}

#[test]
fn curva_mestra_a_cada_n() {
    let mestras = |fx: TerrenoFx| curvas(&mut cena_com(&[fx]), 0, 0).iter().map(|l| (l.z, l.marca)).collect::<Vec<_>>();
    assert_eq!(mestras(t2(1)), vec![(10.5, 0), (11.0, 0), (11.5, 0), (12.0, 0)], "k = 21 a 24, mestra a cada 5: nenhuma");
    assert_eq!(mestras(TerrenoFx { mestra_cada: 2, ..t2(1) }), vec![(10.5, 0), (11.0, 1), (11.5, 0), (12.0, 1)], "k par");
    assert_eq!(mestras(TerrenoFx { mestra_cada: 1, ..t3(1) }), vec![(1.0, 1), (2.0, 1), (3.0, 1), (4.0, 1)]);
    assert_eq!(mestras(TerrenoFx { mestra_cada: 3, ..t3(1) }), vec![(1.0, 0), (2.0, 0), (3.0, 1), (4.0, 0)]);
    assert_eq!(mestras(TerrenoFx { mestra_cada: 0, ..t3(1) }), vec![(1.0, 0), (2.0, 0), (3.0, 0), (4.0, 0)], "0 não divide: nenhuma mestra");
    // Cotas negativas: k = −6 a −3; com mestra a cada 3, k = −6 e k = −3.
    let mut negativo = TerrenoFx { mestra_cada: 3, ..t2(1) };
    negativo.pontos.iter_mut().for_each(|p| p[2] -= 13.5);
    assert_eq!(mestras(negativo), vec![(-3.0, 1), (-2.5, 0), (-2.0, 0), (-1.5, 1)]);
}

#[test]
fn limite_de_cotas() {
    // Rampa de z = 0 a z = 1200.
    let rampa = |intervalo: f64| {
        let mut fx = TerrenoFx { intervalo, ..t1(1) };
        fx.pontos.iter_mut().for_each(|p| p[2] = 60.0 * p[0]);
        cena_com(&[fx])
    };
    assert_eq!(executar(&mut rampa(0.5), CONSULTA_TERRENO_CURVAS, &[0.0, 0.0, 0.0]).err(), Some(LIMITE), "2401 cotas");
    assert_eq!(executar(&mut rampa(0.6), CONSULTA_TERRENO_CURVAS, &[0.0, 0.0, 0.0]).err(), Some(LIMITE), "2001 cotas");
    assert_eq!(curvas(&mut rampa(0.75), 0, 0).len(), 1600, "1601 cotas cabem (a de z = 0 é a mínima e não gera curva)");
    assert_eq!(executar(&mut rampa(0.0), CONSULTA_TERRENO_CURVAS, &[0.0, 0.0, 0.0]).err(), Some(ENTRADA), "intervalo nulo");
    let mut cena = rampa(0.5);
    assert!(executar(&mut cena, CONSULTA_TERRENO_PLANTA, &[0.0, 0.0]).is_ok(), "o limite é só das curvas");
    for args in [[0.0, 2.0, 0.0], [f64::NAN, 0.0, 0.0], [0.0, 0.5, 0.0], [-1.0, 0.0, 0.0]] {
        assert_eq!(executar(&mut cena, CONSULTA_TERRENO_CURVAS, &args).err(), Some(ENTRADA), "{args:?}");
        assert_eq!(executar(&mut cena, CONSULTA_TERRENO_PLANTA, &args[..2]).err(), Some(ENTRADA), "{args:?}");
    }
}

#[test]
fn planta_borda_t8() {
    let mut cena = cena_com(&[t8(1)]);
    let p = planta(&mut cena, 0, 0);
    assert_eq!(p.len(), 1, "um laço");
    assert_eq!((p[0].terreno, p[0].marca, p[0].fechada), (1, 0, true));
    assert!((p[0].area() - 100.0).abs() < 1e-9, "área {} (anti-horário)", p[0].area());
    assert_eq!(p[0].pontos.len(), 40, "a borda adensada de 1 em 1 m");
    assert!((p[0].comprimento() - 40.0).abs() < 1e-9);
    assert_eq!(planta(&mut cena, NIVEL_TODOS, 1), p);
    // Sem borda no modelo: a envoltória das fontes.
    let q = planta(&mut cena_com(&[t3(4), t1(9)]), 0, 0);
    assert_eq!(q.iter().map(|l| (l.terreno, l.fechada, l.pontos.len())).collect::<Vec<_>>(), vec![(4, true, 4), (9, true, 4)]);
    assert!(q.iter().all(|l| (l.area() - 400.0).abs() < 1e-9));
    assert!(planta(&mut cena_com(&[TerrenoFx::novo(1, vec![[0.0, 0.0, 1.0], [5.0, 0.0, 2.0]])]), 0, 0).is_empty(), "sem triângulos, sem borda");
}

#[test]
fn quant_t1_t2_t3_t4() {
    let mut cena = cena_com(&[t1(1), t2(2), t3(3), t4(4), t8(8)]);
    let q = quant(&mut cena, 0);
    assert_eq!(q.iter().map(|x| x.0).collect::<Vec<_>>(), vec![1, 2, 3, 4, 8]);
    // (área de superfície, tolerância, z_min, z_max, triângulos); área em planta 400 em todos menos T8.
    let esperado = [(400.0, 1e-9, 10.0, 10.0, 2.0), (400.0 * 1.01f64.sqrt(), 1e-6, 10.25, 12.25, 2.0), (447.21360, 1e-5, 0.0, 5.0, 4.0), (407.92156, 1e-5, 0.0, 2.0, 4.0)];
    for ((t, v), (sup, tol, z_min, z_max, n)) in q.iter().zip(esperado) {
        assert!((v[0] - 400.0).abs() < 1e-9, "T{t}: área em planta {}", v[0]);
        assert!((v[1] - sup).abs() < tol, "T{t}: área de superfície {}", v[1]);
        assert_eq!(v[2], v[1], "T{t}: proposta = existente até a R3");
        assert_eq!((v[3], v[4]), (z_min, z_max), "T{t}: z_min e z_max");
        assert_eq!((v[5], v[6]), (0.0, 0.0), "T{t}: volumes ainda 0");
        assert_eq!(v[7], n, "T{t}: triângulos");
    }
    let v = q[4].1;
    assert!((v[0] - 100.0).abs() < 1e-9, "T8: área em planta {}", v[0]);
    assert_eq!((v[3], v[4], v[7]), (2.5, 5.0, 40.0), "T8: a menor cota é a da borda");
    assert!(quant(&mut cena, 5).is_empty(), "outro nível");
    let vazio = quant(&mut cena_com(&[TerrenoFx::novo(6, Vec::new())]), NIVEL_TODOS);
    assert_eq!(vazio, vec![(6, [0.0; 8])], "terreno sem triângulos: linha em 0");
    assert_eq!(executar(&mut cena, CONSULTA_QUANT_TERRENO, &[f64::NAN]).err(), Some(ENTRADA));
}

#[test]
fn aviso_cotas_diferentes() {
    // Positivo: ponto a 0,2 mm do canto (0, 0), com cota 4 m acima.
    let mut fx = t1(3);
    fx.pontos.push([0.0002, 0.0, 14.0]);
    let a = avisos(&mut cena_com(&[fx]), 0);
    assert_eq!(a.len(), 1);
    assert_eq!(a[0].0, [3, AVISO_COTAS_DIFERENTES, ID_AUSENTE, 4], "terreno, código 1, sem região, id_num do vértice descartado");
    assert!((a[0].1[0] - 4.0).abs() < 1e-12, "medido = diferença de cota");
    assert_eq!(a[0].1[1..], [0.001, 0.0, 0.0, 10.0], "limite e o ponto que ficou");
    // Negativo: ponto coincidente com a cota dentro de 1 mm; e terreno sem pontos coincidentes.
    let mut fx = t1(3);
    fx.pontos.push([20.0004, 20.0003, 10.0005]);
    assert!(avisos(&mut cena_com(&[fx]), 0).is_empty());
    assert!(avisos(&mut cena_com(&[t3(1)]), 0).is_empty());
}

#[test]
fn aviso_linha_cruzada() {
    // Positivo: T9, duas quebras em X. Negativo: T4, uma quebra só.
    let mut cena = cena_com(&[t4(2), t9(5)]);
    let a = avisos(&mut cena, 0);
    assert_eq!(a.len(), 1, "aviso 2 uma vez, só em T9");
    assert_eq!(a[0].0, [5, AVISO_LINHA_CRUZA, ID_AUSENTE, 2], "id_num da linha pulada: a segunda quebra de T9 (a linha 0 é a quebra de T4)");
    assert_eq!(a[0].1[2..], [10.0, 10.0, 10.0], "no ponto médio do trecho pulado");
    assert!(avisos(&mut cena_com(&[t4(2)]), 0).is_empty());
    assert!(avisos(&mut cena, 3).is_empty(), "outro nível");
    // O aviso 5 (terreno sem triângulos) também sai pela consulta.
    let sem = avisos(&mut cena_com(&[TerrenoFx::novo(7, vec![[0.0, 0.0, 1.0], [5.0, 0.0, 2.0]])]), NIVEL_TODOS);
    assert_eq!(sem.iter().map(|x| x.0).collect::<Vec<_>>(), vec![[7, AVISO_SEM_TRIANGULOS, ID_AUSENTE, ID_AUSENTE]]);
    assert_eq!(executar(&mut cena, CONSULTA_TERRENO_AVISOS, &[0.5]).err(), Some(ENTRADA));
}

#[test]
fn cota_da_regiao_no_nivel_nao_vira_curva_no_perimetro() {
    // E = 10,25 + 0,1 x (intervalo 0,5); plataforma (5,5)–(15,15) exatamente na cota 11,0 (k · intervalo): nada de curva dentro dela nem laço colado ao perímetro.
    use crate::terreno_fixture::RegiaoFx;
    let fx = TerrenoFx { regioes: vec![RegiaoFx::quadrado(1, 1, 5.0, 5.0, 10.0, 11.0)], ..t2(1) };
    let c = curvas(&mut cena_com(&[fx]), 0, 1);
    for l in &c {
        assert!(l.pontos.iter().all(|p| !(p[0] > 5.001 && p[0] < 14.999 && p[1] > 5.001 && p[1] < 14.999)), "curva dentro da região plana: z = {}", l.z);
        assert!(!(l.fechada && l.comprimento() < 1.0), "laço colado à parede: z = {} comprimento {}", l.z, l.comprimento());
    }
}

#[test]
fn suavizacao_preserva_extremidades_fixos_e_nao_cruza() {
    use crate::terreno_curvas::suavizar;
    let zig = [[0.0, 0.0], [1.0, 1.0], [2.0, 0.0], [3.0, 1.0], [4.0, 0.0]];
    let aberta = suavizar(&zig, &[true, false, false, false, true], false, 2);
    assert_eq!(aberta.first(), Some(&[0.0, 0.0]));
    assert_eq!(aberta.last(), Some(&[4.0, 0.0]), "extremidades de curva aberta não se movem");
    assert!(aberta.len() > zig.len());
    let quadrado = [[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]];
    let fechada = suavizar(&quadrado, &[true, false, false, false], true, 2);
    assert!(fechada.contains(&[0.0, 0.0]), "ponto fixo (sobre a borda) fica exatamente onde estava");
    assert!(!fechada.contains(&[4.0, 4.0]), "os demais cantos são cortados");
    // Duas voltas muito próximas: a suavização nunca introduz autointerseção.
    let estreito = [[0.0, 0.0], [10.0, 0.0], [10.0, 0.1], [0.0, 0.1]];
    let s = suavizar(&estreito, &[false; 4], true, 2);
    assert!(!crate::terreno_curvas::se_cruza(&s, true));
}

/// Distância de `p` ao segmento `a`–`b`.
fn dist_seg(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let l2 = dx * dx + dy * dy;
    let t = if l2 > 0.0 { (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
    (p[0] - (a[0] + dx * t)).hypot(p[1] - (a[1] + dy * t))
}

/// Confere que cada ponto de uma curva SUAVIZADA fica perto da curva crua da mesma cota: no máximo `0,26` do maior trecho cru (o Chaikin move um ponto no
/// máximo um quarto do trecho vizinho). Substitui a antiga checagem "ponto exatamente na cota", que a suavização torna falsa de propósito.
pub fn conferir_perto_da_curva_crua(cena: &mut Cena, superficie: u32, intervalo: f64, linhas: &[LinhaLida], caso: usize) {
    let m = crate::terreno_proposta::superficie_do_terreno(cena, 1, superficie).expect("superfície");
    let cruas = crate::terreno_curvas::curvas_da_malha(&m, intervalo, 1).expect("curvas cruas");
    for l in linhas {
        let mesmas: Vec<_> = cruas.iter().filter(|c| (c.z - l.z).abs() < 1e-9).collect();
        let mut maior: f64 = 0.0;
        for c in &mesmas {
            let n = c.pontos.len();
            for k in 0..n {
                let (a, b) = (c.pontos[k], c.pontos[(k + 1) % n]);
                if c.fechada || k + 1 < n {
                    maior = maior.max((b[0] - a[0]).hypot(b[1] - a[1]));
                }
            }
        }
        let lim = 0.26 * maior + 1e-9;
        let segs: Vec<([f64; 2], [f64; 2])> = mesmas
            .iter()
            .flat_map(|c| (0..c.pontos.len()).filter(|&k| c.fechada || k + 1 < c.pontos.len()).map(move |k| (c.pontos[k], c.pontos[(k + 1) % c.pontos.len()])))
            .collect();
        for p in &l.pontos {
            let perto = segs.iter().any(|&(a, b)| {
                p[0] >= a[0].min(b[0]) - lim && p[0] <= a[0].max(b[0]) + lim && p[1] >= a[1].min(b[1]) - lim && p[1] <= a[1].max(b[1]) + lim && dist_seg(*p, a, b) <= lim
            });
            assert!(perto, "caso {caso}: ponto {p:?} da curva {} a mais de {lim} da curva crua (maior trecho {maior})", l.z);
        }
    }
}
