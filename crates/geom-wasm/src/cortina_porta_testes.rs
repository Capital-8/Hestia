//! Testes de `cortina_porta` (arquivo à parte, incluído por `#[path]`). Os valores são conferidos à mão: grade de colunas de 1 m (L = 4 m, H = 3 m), montantes
//! retangulares de 50 mm (a borda fica embutida: face em 0,05 da ponta; o interior fica no centro da linha: face a 0,025), folga da folha de 4 mm.

use super::*;
use crate::cena::Cena;
use crate::cortina_pecas::resolver;
use crate::cortina_pecas::testes::*;
use crate::esquema::{AVISO_CORTINA_OVERRIDE_ORFAO_CELULA, ENTRADA, ID_AUSENTE};
use crate::secoes_cortina::{CelulaAberturaLinha, SegmentoRemovidoLinha};

const T_PORTA: u32 = 1;
const T_JANELA: u32 = 2;
const T_LARGA: u32 = 3;
const T_ESTREITA: u32 = 4;
const T_VAO_LIVRE: u32 = 5;

fn ta(largura: f64, altura: f64, janela: bool, folhas: u8, plano: u8) -> TipoAbertura {
    TipoAbertura {
        largura,
        altura,
        peitoril: if janela { 0.9 } else { 0.0 },
        folga_w: 0.0,
        folga_h: 0.0,
        folhas,
        plano,
        janela,
        fechamento: 0,
        tem_alizar: false,
        estilo_batente: 0,
        modo_prof: 0,
        prof_pedida: 0.0,
        larg_batente: 0.05,
        esp_folha: 0.04,
    }
}

fn igual(a: f64, b: f64) {
    assert!((a - b).abs() < 1e-9, "{a} != {b}");
}

/// Grade de `nu` colunas por `nv` fileiras (L = 4, H = 3); tipos de abertura de teste na seção 7.
fn cena(nu: u32, nv: u32) -> Cena {
    let e = Espec::novo(EixoEfetivo::numero(nu), EixoEfetivo::numero(nv));
    com_tipos(cena_simples(&e, 4.0, 3.0))
}

fn com_tipos(mut c: Cena) -> Cena {
    let t = &mut c.a3.tipos;
    t.insert(T_PORTA, ta(0.8, 2.1, false, 1, 0));
    t.insert(T_JANELA, ta(1.0, 1.0, true, 1, 6));
    t.insert(T_LARGA, ta(1.5, 2.1, false, 1, 0));
    t.insert(T_ESTREITA, ta(0.5, 2.1, false, 1, 0));
    t.insert(T_VAO_LIVRE, ta(0.9, 2.1, false, 0, 4));
    c
}

/// Esquadria na célula `(i, j)` da grade de `nu` x `nv` células (centro da célula como `s` e `z` normalizados).
#[allow(clippy::too_many_arguments)]
fn linha(c: &mut Cena, k: u32, i: u32, j: u32, nu: u32, nv: u32, tipo: u32, grade: bool, alinhamento: u8, soleira: f64) {
    let (s, z) = ((f64::from(i) + 0.5) / f64::from(nu), (f64::from(j) + 0.5) / f64::from(nv));
    c.cortina.aberturas_celula.insert(k, CelulaAberturaLinha { cortina: 1, i, j, s, z, nu, nv, tipo, flip_mao: false, flip_sentido: false, grade, alinhamento, soleira });
}

fn geom(c: &Cena) -> Geom {
    resolver(c, 0).expect("resolver").remove(0).g.expect("geometria")
}

fn base_removida(g: &Geom, k: u32) -> bool {
    g.segmentos.iter().find(|s| s.eixo == EIXO_V && s.linha == 0 && s.k == k).expect("segmento").removido
}

#[test]
fn modo_celula_ignora_o_tipo_menor_igual_ou_maior_que_a_celula() {
    // Célula (1, 0): s de 1 a 2; faces dos montantes em 1,025 e 1,975. Vão = faces menos 4 mm de cada lado: 1,029 a 1,971, e de z = 0 (soleira derivada) à
    // face do montante de cima (3 - 0,05 = 2,95).
    for tipo in [T_ESTREITA, T_PORTA, T_LARGA] {
        let mut c = cena(4, 1);
        linha(&mut c, 1, 1, 0, 4, 1, tipo, false, 0, f64::NAN);
        let g = geom(&c);
        assert_eq!(g.esquadrias.len(), 1);
        let e = &g.esquadrias[0];
        igual(e.s0, 1.029);
        igual(e.s1, 1.971);
        igual(e.z0, 0.0);
        igual(e.z1, 2.95);
        assert_eq!(e.lados, [true, true, false, true]);
        assert_eq!(e.flags & ESQ_LIMITADA, 0, "tipo {tipo}: o modo célula nunca limita");
        assert!(g.paineis.iter().all(|p| !(p.i == 1 && p.j == 0)), "a região da esquadria não tem painel");
    }
}

#[test]
fn modo_grade_com_tipo_menor_igual_e_maior_alinhado_no_centro_inicio_e_fim() {
    // Colunas de 2 m: a célula (1, 0) vai de s = 2 a 4; faces em 2,025 e 3,95 (a borda do fim é embutida: 4 - 0,05).
    let mut c = cena(2, 1);
    // Centro, porta de 0,8 x 2,1: sobra de 0,6 de cada lado (>= 0,15): vão de 2,6 a 3,4, de z = 0 a 2,1; linhas U em 2,6 e 3,4 e V em 2,1.
    linha(&mut c, 1, 1, 0, 2, 1, T_PORTA, true, 0, f64::NAN);
    let e = geom(&c).esquadrias.remove(0);
    igual(e.s0, 2.6);
    igual(e.s1, 3.4);
    igual(e.z0, 0.0);
    igual(e.z1, 2.1);
    assert_eq!(e.flags & ESQ_LIMITADA, 0);
    assert_eq!(e.linhas, vec![(EIXO_U, 2.6), (EIXO_U, 3.4), (EIXO_V, 2.1)]);
    // Início: de 2 a 2,8 recortado pela face + folga (2,029): vão de 2,029 a 2,8. Linhas: U em 2,8 (a de 2 já existe) e V em 2,1.
    linha(&mut c, 1, 1, 0, 2, 1, T_PORTA, true, 1, f64::NAN);
    let e = geom(&c).esquadrias.remove(0);
    igual(e.s0, 2.029);
    igual(e.s1, 2.8);
    assert_eq!(e.linhas, vec![(EIXO_U, 2.8), (EIXO_V, 2.1)]);
    // Fim: de 3,2 a 4 recortado pela face - folga (3,946): vão de 3,2 a 3,946. Linhas: U em 3,2 e V em 2,1.
    linha(&mut c, 1, 1, 0, 2, 1, T_PORTA, true, 2, f64::NAN);
    let e = geom(&c).esquadrias.remove(0);
    igual(e.s0, 3.2);
    igual(e.s1, 3.946);
    assert_eq!(e.linhas, vec![(EIXO_U, 3.2), (EIXO_V, 2.1)]);
    // Menor (0,5), centro: sobra de 0,75: de 2,75 a 3,25.
    linha(&mut c, 1, 1, 0, 2, 1, T_ESTREITA, true, 0, f64::NAN);
    let e = geom(&c).esquadrias.remove(0);
    igual(e.s0, 2.75);
    igual(e.s1, 3.25);
    // Maior (3,0) que a região (2,0): aviso 13, vão limitado às faces (2,029 a 3,946).
    c.a3.tipos.insert(T_LARGA, ta(3.0, 2.1, false, 1, 0));
    linha(&mut c, 1, 1, 0, 2, 1, T_LARGA, true, 0, f64::NAN);
    let r = resolver(&c, 0).expect("r").remove(0);
    let e = &r.g.as_ref().expect("g").esquadrias[0];
    assert_ne!(e.flags & ESQ_LIMITADA, 0);
    igual(e.s0, 2.029);
    igual(e.s1, 3.946);
    let a = r.avisos.iter().find(|a| a.codigo == AVISO_CORTINA_ESQUADRIA_MAIOR_QUE_CELULA).expect("aviso 13");
    assert_eq!((a.i, a.j), (1, 0));
    igual(a.medido, 3.0);
    igual(a.limite, 2.0);
}

#[test]
fn modo_grade_com_a_regiao_do_tamanho_do_tipo_nao_limita_nem_pede_linhas() {
    // Colunas de 1 m e uma porta de 1,0 x 3,0: igual à região. A sobra é zero (< limiar): o alinhamento vai ao início e o vão é recortado pelas faces.
    let mut c = cena(4, 1);
    c.a3.tipos.insert(T_PORTA, ta(1.0, 3.0, false, 1, 0));
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, true, 0, f64::NAN);
    let e = geom(&c).esquadrias.remove(0);
    igual(e.s0, 1.029);
    igual(e.s1, 1.971);
    assert_eq!(e.flags & ESQ_LIMITADA, 0);
    assert!(e.linhas.is_empty(), "a grade já está ajustada: {:?}", e.linhas);
}

#[test]
fn soleira_derivada_some_sob_a_porta_e_volta_ao_trocar_ou_remover() {
    let mut c = cena(4, 1);
    let sem = geom(&c);
    assert!(!base_removida(&sem, 1));
    let horizontais = |g: &Geom| g.pecas.iter().filter(|p| p.eixo == EIXO_V && p.linha == 0).count();
    assert_eq!(horizontais(&sem), 4);
    // Porta sem peitoril: o segmento da base sob a célula (1, 0) some; os outros ficam.
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    let g = geom(&c);
    assert!(base_removida(&g, 1) && !base_removida(&g, 0) && !base_removida(&g, 2) && !base_removida(&g, 3));
    assert_eq!(horizontais(&g), 3);
    assert_ne!(g.esquadrias[0].flags & ESQ_SOLEIRA_DERIVADA, 0);
    // Porta com peitoril positivo: nada some.
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, 0.1);
    let g = geom(&c);
    assert!(!base_removida(&g, 1));
    igual(g.esquadrias[0].z0, 0.05 + 0.1);
    // Trocada por janela: a base volta, e o peitoril é o da instância (0,9 acima da face de baixo, em 0,05).
    linha(&mut c, 1, 1, 0, 4, 1, T_JANELA, false, 0, 0.9);
    let g = geom(&c);
    assert!(!base_removida(&g, 1));
    igual(g.esquadrias[0].z0, 0.95);
    assert_eq!(g.esquadrias[0].flags & ESQ_SOLEIRA_DERIVADA, 0);
    // Janela sem soleira por instância: a base da região.
    linha(&mut c, 1, 1, 0, 4, 1, T_JANELA, false, 0, f64::NAN);
    igual(geom(&c).esquadrias[0].z0, 0.05);
    // Removida a esquadria: o painel e o montante da base voltam (nada foi gravado).
    c.cortina.aberturas_celula.clear();
    let g = geom(&c);
    assert!(g.esquadrias.is_empty() && !base_removida(&g, 1));
    assert_eq!(g.paineis.len(), 4);
    assert_eq!(horizontais(&g), 4);
}

#[test]
fn porta_funde_com_a_vizinha_por_segmento_removido_e_ocupa_a_regiao_inteira() {
    let mut c = cena(4, 1);
    // Segmento da linha 2 (s = 2) removido: as células (1,0) e (2,0) viram uma região de 1 a 3.
    c.cortina.segmentos_removidos.insert(1, SegmentoRemovidoLinha { cortina: 1, eixo: EIXO_U, extra: false, linha: 2, pos_norm: 0.5, n: 4, k: 0, nk: 1, mid: 0.5 });
    linha(&mut c, 1, 1, 0, 4, 1, T_LARGA, false, 0, f64::NAN);
    let g = geom(&c);
    let e = &g.esquadrias[0];
    // Faces em 1,025 e (3 - 0,025 = 2,975): vão de 1,029 a 2,971.
    igual(e.s0, 1.029);
    igual(e.s1, 2.971);
    assert_ne!(e.flags & ESQ_REGIAO_MULTIPLA, 0);
    // A soleira some sob as duas colunas da região.
    assert!(base_removida(&g, 1) && base_removida(&g, 2) && !base_removida(&g, 0) && !base_removida(&g, 3));
    assert_eq!(g.celulas.iter().filter(|x| x.flags & CELULA_ESQUADRIA != 0).count(), 2);
    assert_eq!(g.paineis.len(), 2, "só as colunas 0 e 3 têm painel");
}

#[test]
fn folha_minima_porta_fora_do_piso_e_vao_livre() {
    // 20 colunas de 0,2 m: a célula (5, 0) tem 0,15 entre as faces e 0,142 entre as folgas (< 0,60 da porta de giro).
    let mut c = cena(20, 1);
    linha(&mut c, 1, 5, 0, 20, 1, T_PORTA, false, 0, f64::NAN);
    let r = resolver(&c, 0).expect("r").remove(0);
    let a = r.avisos.iter().find(|a| a.codigo == AVISO_CORTINA_PORTA_FOLHA_MINIMA).expect("aviso 11");
    assert_eq!((a.i, a.j), (5, 0));
    igual(a.medido, 0.142);
    igual(a.limite, 0.6);
    assert_ne!(r.g.as_ref().expect("g").esquadrias[0].flags & ESQ_FOLHA_MINIMA, 0);
    // A janela tem folha mínima de 0,30: também avisa; o vão livre (sem folha) não.
    linha(&mut c, 1, 5, 0, 20, 1, T_JANELA, false, 0, f64::NAN);
    assert!(resolver(&c, 0).expect("r")[0].avisos.iter().any(|a| a.codigo == AVISO_CORTINA_PORTA_FOLHA_MINIMA));
    linha(&mut c, 1, 5, 0, 20, 1, T_VAO_LIVRE, false, 0, f64::NAN);
    assert!(resolver(&c, 0).expect("r")[0].avisos.iter().all(|a| a.codigo != AVISO_CORTINA_PORTA_FOLHA_MINIMA));
    // Célula larga o bastante: sem aviso.
    let mut c = cena(4, 1);
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    assert!(resolver(&c, 0).expect("r")[0].avisos.iter().all(|a| a.codigo != AVISO_CORTINA_PORTA_FOLHA_MINIMA && a.codigo != AVISO_CORTINA_PORTA_FORA_DO_PISO));
    // Porta na fileira de cima de uma grade 4 x 2 (base da região em z = 1,5): fora do piso, e o segmento da linha interior também some.
    let mut c = cena(4, 2);
    linha(&mut c, 1, 1, 1, 4, 2, T_PORTA, false, 0, f64::NAN);
    let r = resolver(&c, 0).expect("r").remove(0);
    let a = r.avisos.iter().find(|a| a.codigo == AVISO_CORTINA_PORTA_FORA_DO_PISO).expect("aviso 12");
    igual(a.medido, 1.5);
    let g = r.g.expect("g");
    assert!(g.segmentos.iter().find(|s| s.eixo == EIXO_V && s.linha == 1 && s.k == 1).expect("seg").removido);
}

#[test]
fn batente_so_onde_nao_ha_montante() {
    // Sem a borda do início, a esquadria da célula (0, 0) ganha a jamba esquerda de 50 mm (de 4 mm a 54 mm); nos outros lados há montante.
    let mut e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(1));
    e.mont[2] = ID_AUSENTE;
    let mut c = com_tipos(cena_simples(&e, 4.0, 3.0));
    linha(&mut c, 1, 0, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    let g = geom(&c);
    let q = &g.esquadrias[0];
    assert_eq!(q.lados, [false, true, false, true]);
    let cs = caixas(q, g.d);
    let jamba: Vec<&Caixa> = cs.iter().filter(|x| !x.vidro && (x.y1 - x.y0 - 0.12).abs() < 1e-9).collect();
    assert_eq!(jamba.len(), 1, "uma jamba, por toda a profundidade do sistema");
    igual(jamba[0].t0, 0.004);
    igual(jamba[0].t1, 0.054);
    // Com os quatro lados com montante (célula (1, 0)), não há caixa de profundidade total.
    let mut c = cena(4, 1);
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    let g = geom(&c);
    assert!(caixas(&g.esquadrias[0], g.d).iter().all(|x| (x.y1 - x.y0 - 0.12).abs() > 1e-9));
}

#[test]
fn quantitativo_separa_o_vidro_da_porta_do_vidro_de_fachada() {
    use crate::cortina_quant::quant_cortina;
    let mut c = cena(4, 1);
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    let q = quant_cortina(&resolver(&c, 0).expect("r"));
    let acha = |papel: u32| q.iter().find(|x| x.papel == papel);
    // Três painéis de fachada (a célula da porta não tem painel); o vidro da porta é outro papel.
    assert_eq!(acha(PAPEL_PAINEL_VIDRO).expect("fachada").n, 3);
    // Vão 0,942 x 2,95: folha com perfil de 50 mm, vidro de 0,842 x 2,85 e 8 mm. Folha: duas verticais de 0,05 x 0,04 x 2,95 e duas travessas de
    // 0,842 x 0,04 x 0,05.
    let e = acha(PAPEL_ESQUADRIA).expect("esquadria");
    assert_eq!(e.n, 1);
    assert!((e.area - 0.942 * 2.95).abs() < 1e-6);
    let v = acha(PAPEL_ESQUADRIA_VIDRO).expect("vidro da porta");
    assert!((v.area - 0.842 * 2.85).abs() < 1e-6, "{}", v.area);
    assert!((v.volume - 0.842 * 2.85 * 0.008).abs() < 1e-6);
    let f = acha(PAPEL_ESQUADRIA_FOLHA).expect("folha");
    assert!((f.volume - (2.0 * 0.05 * 0.04 * 2.95 + 2.0 * 0.842 * 0.04 * 0.05)).abs() < 1e-6, "{}", f.volume);
    // O vidro de fachada é o de antes menos o painel da célula da porta.
    let antes = quant_cortina(&resolver(&cena(4, 1), 0).expect("r"));
    let area_antes = antes.iter().find(|x| x.papel == PAPEL_PAINEL_VIDRO).expect("a").area;
    let painel_da_celula = geom(&cena(4, 1)).paineis.iter().find(|p| p.i == 1 && p.j == 0).expect("p").area_bruta();
    assert!((area_antes - painel_da_celula - acha(PAPEL_PAINEL_VIDRO).expect("f").area).abs() < 1e-6);
}

#[test]
fn simbolo_de_planta_gira_com_as_inversoes_e_fica_no_mesmo_lado_com_a_cortina_invertida() {
    for invertida in [false, true] {
        for (mao, sentido) in [(false, false), (true, false), (false, true), (true, true)] {
            let mut c = cena(4, 1);
            c.cortina.cortinas.get_mut(&1).expect("c").invertida = invertida;
            linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
            let k = c.cortina.aberturas_celula.get_mut(&1).expect("k");
            (k.flip_mao, k.flip_sentido) = (mao, sentido);
            let g = geom(&c);
            let s = simbolo_planta(&g, &g.esquadrias[0]);
            // [contorno, folha (2 pontos), arco (19 pontos)].
            assert_eq!(s.len(), 3);
            let folha = &s[1].2;
            // A dobradiça fica no início (1,029) ou no fim (1,971, com `flip_mao`); a folha aberta sobe ou desce em y por 0,942 a partir da face de y = ±0,06.
            igual(folha[0][0], if mao { 1.971 } else { 1.029 });
            let sinal = if sentido { -1.0 } else { 1.0 };
            igual(folha[0][1], 0.06 * sinal);
            igual(folha[1][1], 0.06 * sinal + 0.942 * sinal);
            assert_eq!(s[2].2.len(), 19);
            assert!(!s[2].0 && s[2].1, "o arco é aberto e é de giro");
        }
    }
}

#[test]
fn janela_na_planta_e_um_traco_so() {
    let mut c = cena(4, 1);
    linha(&mut c, 1, 1, 0, 4, 1, T_JANELA, false, 0, 0.9);
    let g = geom(&c);
    let s = simbolo_planta(&g, &g.esquadrias[0]);
    assert_eq!(s.len(), 2);
    assert_eq!(s[1].2.len(), 2);
}

#[test]
fn malha_leva_a_folha_e_o_vidro_da_esquadria_em_grupos_a_parte() {
    use crate::cortina_malha::{montar, testes::fechada_e_orientada};
    let mut c = cena(4, 1);
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    let m = montar(&resolver(&c, 0).expect("r"), 1).expect("malha");
    let papeis: Vec<(u32, u32)> = m.grupos.iter().map(|g| (g.papel, g.transparente)).collect();
    assert_eq!(papeis, vec![(MALHA_ESQUADRIA, 0), (MALHA_VIDRO_ESQUADRIA, 1)]);
    for g in &m.grupos {
        assert!(!g.triangulos.is_empty());
        assert!(g.vertices.iter().all(|v| v[2] >= -1e-9 && v[2] <= 2.95 + 1e-9), "dentro da altura do vão");
    }
    let v = m.grupos.iter().find(|g| g.papel == MALHA_VIDRO_ESQUADRIA).expect("vidro");
    assert!(fechada_e_orientada(&v.vertices, &v.triangulos));
    // O vidro de fachada continua só nas instâncias dos 3 painéis.
    assert_eq!(m.instancias.iter().filter(|i| i.papel == MALHA_VIDRO).count(), 3);
}

#[test]
fn consulta_107_devolve_o_vao_os_lados_e_as_linhas() {
    let mut c = cena(2, 1);
    linha(&mut c, 1, 1, 0, 2, 1, T_PORTA, true, 0, f64::NAN);
    let s = consulta_cortina_celula_porta(&c, 0).expect("107");
    let (Saida::U32(portas), Saida::F64(vaos), Saida::U32(linhas), Saida::F64(pos)) = (&s[0], &s[1], &s[2], &s[3]) else { panic!() };
    // [cortina, i, j, tipo, ajuste, flip_mao, flip_sentido, janela, lados (esq 1 + dir 2 + topo 8), flags (soleira derivada)].
    assert_eq!(portas, &vec![1, 1, 0, T_PORTA, 1, 0, 0, 0, 1 + 2 + 8, ESQ_SOLEIRA_DERIVADA]);
    assert_eq!(vaos.len(), 10);
    assert_eq!(&vaos[0..4], &[2.6, 3.4, 0.0, 2.1]);
    assert_eq!(vaos[4], 0.12);
    assert_eq!(linhas, &vec![1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
    assert_eq!(pos, &vec![2.6, 3.4, 2.1]);
}

#[test]
fn esquadria_orfa_sai_no_aviso_7_e_o_tipo_inexistente_e_entrada() {
    let mut c = cena(4, 1);
    linha(&mut c, 1, 1, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    // Duas esquadrias na mesma região fundida: a de menor id vale, a outra é órfã.
    c.cortina.segmentos_removidos.insert(1, SegmentoRemovidoLinha { cortina: 1, eixo: EIXO_U, extra: false, linha: 2, pos_norm: 0.5, n: 4, k: 0, nk: 1, mid: 0.5 });
    linha(&mut c, 2, 2, 0, 4, 1, T_PORTA, false, 0, f64::NAN);
    let r = resolver(&c, 0).expect("r").remove(0);
    assert_eq!(r.g.as_ref().expect("g").esquadrias.len(), 1);
    assert!(r.avisos.iter().any(|a| a.codigo == AVISO_CORTINA_OVERRIDE_ORFAO_CELULA));
    linha(&mut c, 1, 1, 0, 4, 1, 99, false, 0, f64::NAN);
    assert_eq!(resolver(&c, 0).err(), Some(ENTRADA));
}

#[test]
fn linhas_do_ajuste_absorve_a_sobra_pequena_e_nao_repete_linha_existente() {
    let t = ta(0.8, 2.1, false, 1, 0);
    // Região de 1 m x 3 m: centro com sobra de 0,1 (< 0,15) vira início: linha em 1,8; topo em 2,1.
    let l = linhas_do_ajuste((1.0, 2.0, 0.0, 3.0), &t, 0.0, 0, 0.15, &[1.0, 2.0, 3.0], &[], 4.0, 3.0);
    assert_eq!(l, vec![(EIXO_U, 1.8), (EIXO_V, 2.1)]);
    // Fim com a linha já existente em 1,2: só o topo.
    let l = linhas_do_ajuste((1.0, 2.0, 0.0, 3.0), &t, 0.0, 2, 0.15, &[1.2], &[], 4.0, 3.0);
    assert_eq!(l, vec![(EIXO_V, 2.1)]);
    // Altura que chega quase ao topo da região (sobra de 0,05 < 0,15): sem linha horizontal.
    let l = linhas_do_ajuste((1.0, 2.0, 0.0, 2.15), &t, 0.0, 1, 0.15, &[], &[], 4.0, 2.15);
    assert_eq!(l, vec![(EIXO_U, 1.8)]);
}

#[test]
fn casos_do_fixture_conferidos_a_mao() {
    use serde_json::Value;
    let j: Value = serde_json::from_str(include_str!("../tests/fixtures/cortina_porta_f5.json")).expect("json");
    let casos = j["casos"].as_array().expect("casos");
    assert!(casos.len() >= 9);
    for caso in casos {
        let id = caso["id"].as_str().expect("id");
        let n = |v: &Value| v.as_f64().expect("número");
        let (nu, nv) = (n(&caso["nu"]) as u32, n(&caso["nv"]) as u32);
        let t = &caso["tipo"];
        let mut c = cena(nu, nv);
        c.a3.tipos.insert(T_PORTA, ta(n(&t["largura"]), n(&t["altura"]), t["janela"].as_bool().expect("janela"), n(&t["folhas"]) as u8, n(&t["plano"]) as u8));
        let a = &caso["abertura"];
        let soleira = a["soleira"].as_f64().unwrap_or(f64::NAN);
        linha(&mut c, 1, n(&a["i"]) as u32, n(&a["j"]) as u32, nu, nv, T_PORTA, n(&a["ajuste"]) == 1.0, n(&a["alinhamento"]) as u8, soleira);
        let r = resolver(&c, 0).expect("resolver").remove(0);
        let e = &r.g.as_ref().expect("g").esquadrias[0];
        let esperado = &caso["esperado"];
        let vao: Vec<f64> = esperado["vao"].as_array().expect("vao").iter().map(n).collect();
        for (k, (obtido, certo)) in [e.s0, e.s1, e.z0, e.z1].iter().zip(&vao).enumerate() {
            assert!((obtido - certo).abs() < 1e-9, "{id}: vão[{k}] {obtido} != {certo}");
        }
        let lados = e.lados.iter().enumerate().fold(0u32, |acc, (k, &b)| acc | (u32::from(b) << k));
        assert_eq!(f64::from(lados), n(&esperado["lados"]), "{id}: lados");
        assert_eq!(f64::from(e.flags), n(&esperado["flags"]), "{id}: flags");
        let linhas: Vec<(u8, f64)> = esperado["linhas"].as_array().expect("linhas").iter().map(|l| (n(&l[0]) as u8, n(&l[1]))).collect();
        assert_eq!(e.linhas.len(), linhas.len(), "{id}: linhas {:?}", e.linhas);
        for (obtida, certa) in e.linhas.iter().zip(&linhas) {
            assert!(obtida.0 == certa.0 && (obtida.1 - certa.1).abs() < 1e-9, "{id}: linha {obtida:?} != {certa:?}");
        }
        let mut avisos: Vec<u32> = r.avisos.iter().map(|a| a.codigo).filter(|&k| (11..=13).contains(&k)).collect();
        avisos.sort_unstable();
        let certos: Vec<u32> = esperado["avisos"].as_array().expect("avisos").iter().map(|v| n(v) as u32).collect();
        assert_eq!(avisos, certos, "{id}: avisos");
    }
}
