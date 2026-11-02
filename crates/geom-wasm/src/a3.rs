//! Consulta `aberturas_geom` (sub-etapa A3a da fatia A, decisão 0047 §7): a geometria dos vãos de um nível.
//!
//! Porta `openingGeometry` (`resolve.ts`), `openingHeight`/`openingSill` (`queries.ts`), `openingRough`
//! (`openingExtras.ts`), `cutHalfOf` e `openingRect` (`openingCut.ts`) com as mesmas contas na mesma ordem; o
//! quadro da parede é o da A1 (`quadro.rs`). O que o JS ainda decide e envia pronto: o tipo já normalizado para o
//! vão (`openingType` = `spanTypeOf`: nominalRef leaf e composição), e a existência dos overrides da instância.
//!
//! `furos_de` é o `furosDe` de `resolveMemo.ts` sem o cache (o cache só guarda resultados): fragmento menos os vãos.
//! Ainda não tem consulta própria; a A3c o usa por dentro. Escala: a de `ops::diferenca` (1 µm), a da ABI v1; o pintor
//! da A2 é a única exceção aprovada (0048).

use std::collections::{BTreeMap, BTreeSet};

use crate::a1::quadros_do_nivel;
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::geo2d::V;
use crate::ops::diferenca;
use crate::quadro::{normal_em, ponto_em, tangente_em, Quadro};
use crate::secoes_a3::{Abertura, TipoAbertura};
use crate::{Anel, MultiPoligono};

/// Folga do furo além das faces (m): `CUT_MARGIN` de `openingCut.ts`.
const FOLGA_DO_FURO: f64 = 0.02;

/// O que `openingGeometry` devolve (sem identidade: `openingId`, `hostId`, `kind`, `leaves`, `plan` e os flips
/// são os da entrada e a consulta os repassa).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GeomAbertura {
    pub centro: V,
    pub u: V,
    pub n: V,
    pub largura: f64,
    pub altura: f64,
    pub vao_largura: f64,
    pub vao_altura: f64,
    pub peitoril: f64,
    pub espessura: f64,
    pub s_hi: f64,
    pub s_lo: f64,
    pub deslocamento: f64,
    /// `cutHalf`: só em parede curva (`None` onde o TS deixa o campo ausente).
    pub meia_prof: Option<f64>,
}

/// `cutHalfOf`: meia profundidade do furo numa parede curva (`half` = meia largura do furo).
pub fn meia_profundidade_curva(f: &Quadro, half: f64) -> Option<f64> {
    let arc = f.arc.as_ref()?;
    let r = arc.radius;
    let drift = r - (r * r - half * half).max(0.0).sqrt();
    Some(f.thickness / 2.0 + FOLGA_DO_FURO + drift)
}

/// `Math.max(0, v)` de `nonNeg` (os valores já são finitos: a entrada recusa o resto).
fn nao_negativo(x: f64) -> f64 {
    x.max(0.0)
}

/// `openingGeometry(p, o, f)`.
pub fn geometria_da_abertura(f: &Quadro, t: &TipoAbertura, o: &Abertura) -> GeomAbertura {
    // `openingHeight`: override da instância só se positivo; senão a do tipo.
    let altura = match o.altura {
        Some(h) if h > 0.0 => h,
        _ => t.altura,
    };
    // `openingRough({ ...t, height })`: a folga cresce o furo, não a esquadria.
    let vao_largura = t.largura + nao_negativo(t.folga_w);
    let vao_altura = altura + nao_negativo(t.folga_h);
    GeomAbertura {
        centro: ponto_em(f, o.deslocamento, f.s_mid),
        u: tangente_em(f, o.deslocamento),
        n: normal_em(f, o.deslocamento),
        largura: t.largura,
        altura,
        vao_largura,
        vao_altura,
        // `openingSill`: `sillOverride ?? t.sill`.
        peitoril: o.peitoril.unwrap_or(t.peitoril),
        espessura: f.thickness,
        s_hi: f.s_hi,
        s_lo: f.s_lo,
        deslocamento: o.deslocamento,
        meia_prof: meia_profundidade_curva(f, vao_largura / 2.0),
    }
}

/// `orientedRect(cx, cy, ux, uy, halfAlong, halfAcross)`, os 4 vértices na ordem do TS.
fn retangulo_orientado(c: V, u: V, along: f64, across: f64) -> Anel {
    let vx = -u.y;
    let vy = u.x;
    vec![
        [c.x - u.x * along - vx * across, c.y - u.y * along - vy * across],
        [c.x + u.x * along - vx * across, c.y + u.y * along - vy * across],
        [c.x + u.x * along + vx * across, c.y + u.y * along + vy * across],
        [c.x - u.x * along + vx * across, c.y - u.y * along + vy * across],
    ]
}

/// `openingRect`: o furo da abertura na parede, um polígono de um anel.
pub fn retangulo_do_vao(g: &GeomAbertura) -> MultiPoligono {
    let across = g.meia_prof.unwrap_or(g.espessura / 2.0 + FOLGA_DO_FURO);
    vec![vec![retangulo_orientado(g.centro, g.u, g.vao_largura / 2.0, across)]]
}

/// `furosDe(frag, holes)`: o fragmento menos os vãos (`difference(frag, ...holes)`).
pub fn furos_de(frag: &MultiPoligono, vaos: &[MultiPoligono]) -> Result<MultiPoligono, u32> {
    let mut args: Vec<MultiPoligono> = Vec::with_capacity(vaos.len() + 1);
    args.push(frag.clone());
    args.extend(vaos.iter().cloned());
    diferenca(&args)
}

/// Aberturas de um nível, na ordem da consulta: paredes na ordem dos quadros e, em cada parede, por `id_num`.
/// `ENTRADA` se uma abertura referencia um tipo que não existe.
pub fn aberturas_do_nivel(cena: &Cena, nivel: u32) -> Result<Vec<(u32, Abertura, TipoAbertura, GeomAbertura)>, u32> {
    let frames = quadros_do_nivel(cena, nivel)?;
    let hospedeiras: BTreeSet<u32> = frames.iter().map(|f| f.id).collect();
    let mut por_parede: BTreeMap<u32, Vec<(u32, Abertura)>> = BTreeMap::new();
    for (&id, a) in &cena.a3.aberturas {
        if hospedeiras.contains(&a.parede) {
            por_parede.entry(a.parede).or_default().push((id, *a));
        }
    }
    let mut saida = Vec::new();
    for f in &frames {
        for (id, a) in por_parede.get(&f.id).map(|v| v.as_slice()).unwrap_or(&[]) {
            let t = *cena.a3.tipos.get(&a.tipo).ok_or(ENTRADA)?;
            saida.push((*id, *a, t, geometria_da_abertura(f, &t, a)));
        }
    }
    Ok(saida)
}

/// Executa `aberturas_geom(nivel_num)`.
pub fn aberturas_geom(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    let lista = aberturas_do_nivel(cena, nivel)?;
    let mut ids = Vec::with_capacity(lista.len());
    let mut dados = Vec::with_capacity(lista.len() * 7);
    let mut medidas = Vec::with_capacity(lista.len() * 16);
    let mut retangulo = Vec::with_capacity(lista.len() * 8);
    for (id, a, t, g) in &lista {
        ids.push(*id);
        dados.extend([a.parede, a.tipo, a.janela as u32, t.folhas as u32, t.plano as u32, a.flip_mao as u32, a.flip_frente as u32]);
        medidas.extend([
            g.centro.x,
            g.centro.y,
            g.u.x,
            g.u.y,
            g.n.x,
            g.n.y,
            g.largura,
            g.altura,
            g.vao_largura,
            g.vao_altura,
            g.peitoril,
            g.espessura,
            g.s_hi,
            g.s_lo,
            g.deslocamento,
            g.meia_prof.unwrap_or(f64::NAN),
        ]);
        if let Some(anel) = retangulo_do_vao(g).first().and_then(|p| p.first()) {
            for q in anel {
                retangulo.extend(*q);
            }
        }
    }
    Ok(vec![Saida::U32(ids), Saida::U32(dados), Saida::F64(medidas), Saida::F64(retangulo)])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::a1::testes_util::{c32, c64, c8, cena_com, f64s, tipo_simples, u32s, Par};
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_ABERTURAS_GEOM as Q, SECAO_ABERTURAS, SECAO_TIPOS_ABERTURA};
    use crate::pintor::area_da_forma;

    /// `(id, largura, altura, peitoril, folga_w, folga_h, folhas, plano)`.
    type TipoA = (u32, f64, f64, f64, f64, f64, u8, u8);
    /// `(id, tipo, parede, janela, deslocamento, flip_mao, flip_frente, peitoril, altura)`.
    type AbA = (u32, u32, u32, bool, f64, bool, bool, Option<f64>, Option<f64>);

    fn bytes_tipos(ts: &[TipoA]) -> Vec<u8> {
        [
            c32(&ts.iter().map(|t| t.0).collect::<Vec<_>>()),
            c64(&ts.iter().map(|t| t.1).collect::<Vec<_>>()),
            c64(&ts.iter().map(|t| t.2).collect::<Vec<_>>()),
            c64(&ts.iter().map(|t| t.3).collect::<Vec<_>>()),
            c64(&ts.iter().map(|t| t.4).collect::<Vec<_>>()),
            c64(&ts.iter().map(|t| t.5).collect::<Vec<_>>()),
            c8(&ts.iter().map(|t| t.6).collect::<Vec<_>>()),
            c8(&ts.iter().map(|t| t.7).collect::<Vec<_>>()),
        ]
        .concat()
    }

    fn bytes_aberturas(a: &[AbA]) -> Vec<u8> {
        [
            c32(&a.iter().map(|x| x.0).collect::<Vec<_>>()),
            c32(&a.iter().map(|x| x.1).collect::<Vec<_>>()),
            c32(&a.iter().map(|x| x.2).collect::<Vec<_>>()),
            c8(&a.iter().map(|x| x.3 as u8).collect::<Vec<_>>()),
            c64(&a.iter().map(|x| x.4).collect::<Vec<_>>()),
            c8(&a.iter().map(|x| x.5 as u8).collect::<Vec<_>>()),
            c8(&a.iter().map(|x| x.6 as u8).collect::<Vec<_>>()),
            c8(&a.iter().map(|x| x.7.is_some() as u8).collect::<Vec<_>>()),
            c64(&a.iter().map(|x| x.7.unwrap_or(0.0)).collect::<Vec<_>>()),
            c8(&a.iter().map(|x| x.8.is_some() as u8).collect::<Vec<_>>()),
            c64(&a.iter().map(|x| x.8.unwrap_or(0.0)).collect::<Vec<_>>()),
        ]
        .concat()
    }

    fn com_aberturas(ps: &[Par], ts: &[TipoA], ab: &[AbA]) -> Cena {
        let mut c = cena_com(ps, &[tipo_simples()]);
        c.definir_secao(SECAO_TIPOS_ABERTURA, ts.len() as u32, &bytes_tipos(ts)).expect("tipos_abertura");
        c.definir_secao(SECAO_ABERTURAS, ab.len() as u32, &bytes_aberturas(ab)).expect("aberturas");
        c
    }

    const PORTA: TipoA = (1, 0.8, 2.1, 0.0, 0.0, 0.0, 1, 0);

    #[test]
    fn parede_reta_numeros_exatos() {
        // parede de 6 m em +x, espessura 0,2 (tipo simples), porta com folga de 2 cm x 1 cm
        let ts = [(1, 0.8, 2.1, 0.0, 0.02, 0.01, 1, 0)];
        let c = com_aberturas(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &ts, &[(7, 1, 1, false, 2.5, true, false, None, None)]);
        let mut c = c;
        let s = executar(&mut c, Q, &[0.0]).expect("consulta");
        assert_eq!(u32s(&s[0]), &[7]);
        assert_eq!(u32s(&s[1]), &[1, 1, 0, 1, 0, 1, 0]);
        let m = f64s(&s[2]);
        assert_eq!(m.len(), 16);
        // centro no eixo (s_mid = 0 para parede centrada), u = +x, n = +y
        assert!((m[0] - 2.5).abs() < 1e-12 && m[1].abs() < 1e-12, "centro {} {}", m[0], m[1]);
        assert_eq!((m[2], m[3]), (1.0, 0.0));
        assert_eq!((m[4], m[5]), (0.0, 1.0));
        assert_eq!((m[6], m[7]), (0.8, 2.1));
        assert!((m[8] - 0.82).abs() < 1e-12 && (m[9] - 2.11).abs() < 1e-12);
        assert_eq!(m[10], 0.0);
        assert!((m[11] - 0.2).abs() < 1e-12);
        assert_eq!(m[14], 2.5);
        assert!(m[15].is_nan(), "parede reta não tem meia_prof");
        let r = f64s(&s[3]);
        // retângulo: meia largura 0,41 ao longo, meia profundidade 0,1 + 0,02 através
        assert!((r[0] - (2.5 - 0.41)).abs() < 1e-12 && (r[1] - (0.0 - 0.12)).abs() < 1e-12);
        assert!((r[4] - (2.5 + 0.41)).abs() < 1e-12 && (r[5] - 0.12).abs() < 1e-12);
    }

    #[test]
    fn override_de_altura_e_peitoril_e_folga_negativa() {
        let ts = [(1, 1.2, 1.0, 0.9, -0.5, 0.0, 2, 4)];
        let ab = [
            (1, 1, 1, true, 1.0, false, false, None, None),
            (2, 1, 1, true, 3.0, false, false, Some(0.1), Some(1.5)),
            // override de altura não positivo: vale a do tipo
            (3, 1, 1, true, 5.0, false, false, None, Some(0.0)),
            (4, 1, 1, true, 5.5, false, false, None, Some(-2.0)),
        ];
        let mut c = com_aberturas(&[Par::nova(1, (0.0, 0.0), (8.0, 0.0))], &ts, &ab);
        let s = executar(&mut c, Q, &[0.0]).expect("consulta");
        let m = f64s(&s[2]);
        let at = |i: usize, k: usize| m[16 * i + k];
        assert_eq!((at(0, 7), at(0, 10)), (1.0, 0.9));
        assert_eq!((at(1, 7), at(1, 10)), (1.5, 0.1));
        assert_eq!(at(2, 7), 1.0);
        assert_eq!(at(3, 7), 1.0);
        // folga de largura negativa vale 0: o vão bruto é a largura do tipo
        assert_eq!(at(0, 8), 1.2);
        assert_eq!(u32s(&s[1])[3], 2);
        assert_eq!(u32s(&s[1])[4], 4);
    }

    #[test]
    fn parede_curva_meia_profundidade_cresce_com_o_desvio() {
        let mut p = Par::nova(1, (0.0, 0.0), (6.0, 0.0));
        p.sag = 1.0;
        let ts = [PORTA];
        let mut c = com_aberturas(&[p], &ts, &[(1, 1, 1, false, 3.0, false, false, None, None)]);
        let s = executar(&mut c, Q, &[0.0]).expect("consulta");
        let m = f64s(&s[2]);
        // R = (chord²/4)/(2h) + h/2 = 9/2 + 0,5 = 5; half = 0,4; drift = 5 - sqrt(25 - 0,16)
        let drift = 5.0 - (25.0f64 - 0.16).sqrt();
        assert!((m[15] - (0.1 + 0.02 + drift)).abs() < 1e-12, "meia_prof {}", m[15]);
        // u e n são a tangente e a normal NO deslocamento, não as do início
        let u = (m[2], m[3]);
        assert!((u.0 * u.0 + u.1 * u.1 - 1.0).abs() < 1e-12);
        assert!((m[4] + u.1).abs() < 1e-12 && (m[5] - u.0).abs() < 1e-12);
        // o retângulo usa a meia profundidade de arco
        let r = f64s(&s[3]);
        let dx = r[2] - r[0];
        let dy = r[3] - r[1];
        assert!(((dx * dx + dy * dy).sqrt() - 0.8).abs() < 1e-12);
        let ex = r[4] - r[2];
        let ey = r[5] - r[3];
        assert!(((ex * ex + ey * ey).sqrt() - 2.0 * m[15]).abs() < 1e-12);
    }

    #[test]
    fn so_o_nivel_pedido_e_so_paredes_com_quadro() {
        let mut outra = Par::nova(2, (0.0, 1.0), (4.0, 1.0));
        outra.nivel = 1;
        // parede de corda < 1e-4 m: sem quadro, a abertura dela não sai
        let curta = Par::nova(3, (0.0, 5.0), (0.00005, 5.0));
        let ps = [Par::nova(1, (0.0, 0.0), (6.0, 0.0)), outra, curta];
        let ab = [
            (3, 1, 3, false, 0.0, false, false, None, None),
            (2, 1, 2, false, 1.0, false, false, None, None),
            (1, 1, 1, false, 1.0, false, false, None, None),
            // hospedeira inexistente: ignorada
            (9, 1, 99, false, 1.0, false, false, None, None),
        ];
        let mut c = com_aberturas(&ps, &[PORTA], &ab);
        let s0 = executar(&mut c, Q, &[0.0]).expect("nível 0");
        assert_eq!(u32s(&s0[0]), &[1]);
        let s1 = executar(&mut c, Q, &[1.0]).expect("nível 1");
        assert_eq!(u32s(&s1[0]), &[2]);
        // ordem: por parede (ordem do quadro), depois por id
        let ab2 = [(5, 1, 1, false, 1.0, false, false, None, None), (4, 1, 1, false, 2.0, false, false, None, None)];
        let mut c2 = com_aberturas(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[PORTA], &ab2);
        assert_eq!(u32s(&executar(&mut c2, Q, &[0.0]).expect("ordem")[0]), &[4, 5]);
    }

    #[test]
    fn entradas_invalidas_sao_leves() {
        let ab = [(1, 1, 1, false, 1.0, false, false, None, None)];
        let mut c = com_aberturas(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[PORTA], &ab);
        assert_eq!(executar(&mut c, Q, &[f64::from(0xffff_ffffu32)]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 1.0]).err(), Some(ENTRADA));
        // tipo inexistente
        c.definir_secao(SECAO_ABERTURAS, 1, &bytes_aberturas(&[(1, 77, 1, false, 1.0, false, false, None, None)])).expect("aberturas");
        assert_eq!(executar(&mut c, Q, &[0.0]).err(), Some(ENTRADA));
        // enums fora do domínio e não finitos na seção
        let mut c2 = Cena::novo();
        assert_eq!(c2.definir_secao(SECAO_TIPOS_ABERTURA, 1, &bytes_tipos(&[(1, 0.8, 2.1, 0.0, 0.0, 0.0, 5, 0)])), Err(ENTRADA));
        assert_eq!(c2.definir_secao(SECAO_TIPOS_ABERTURA, 1, &bytes_tipos(&[(1, 0.8, 2.1, 0.0, 0.0, 0.0, 1, 16)])), Err(ENTRADA));
        assert_eq!(c2.definir_secao(SECAO_TIPOS_ABERTURA, 1, &bytes_tipos(&[(1, f64::NAN, 2.1, 0.0, 0.0, 0.0, 1, 0)])), Err(ENTRADA));
        assert_eq!(c2.definir_secao(SECAO_ABERTURAS, 1, &bytes_aberturas(&[(1, 1, 1, false, f64::INFINITY, false, false, None, None)])), Err(ENTRADA));
        let mut raw = bytes_aberturas(&[(1, 1, 1, false, 1.0, false, false, None, None)]);
        raw[8 + 8 + 8] = 2; // kind = 2
        assert_eq!(c2.definir_secao(SECAO_ABERTURAS, 1, &raw), Err(ENTRADA));
        // chave duplicada
        assert_eq!(
            c2.definir_secao(SECAO_ABERTURAS, 2, &bytes_aberturas(&[(1, 1, 1, false, 1.0, false, false, None, None), (1, 1, 1, false, 2.0, false, false, None, None)])),
            Err(ENTRADA)
        );
        // upsert e remoção
        c2.definir_secao(SECAO_ABERTURAS, 1, &bytes_aberturas(&[(1, 1, 1, false, 1.0, false, false, None, None)])).expect("ok");
        c2.upsert(SECAO_ABERTURAS, 1, &bytes_aberturas(&[(1, 1, 1, true, 2.0, false, false, None, None)])).expect("upsert");
        assert_eq!(c2.a3.aberturas.len(), 1);
        assert_eq!(c2.a3.aberturas[&1].deslocamento, 2.0);
        c2.remover(SECAO_ABERTURAS, &[1, 42]).expect("remover");
        assert!(c2.a3.aberturas.is_empty());
    }

    #[test]
    fn furos_de_subtrai_os_vaos_do_fragmento() {
        // parede de 6 x 0,2 com dois vãos de 0,8 (furo 0,24 de profundidade): perde 2 x 0,8 x 0,2 (o furo é mais fundo que a parede)
        let frag: MultiPoligono = vec![vec![vec![[0.0, -0.1], [6.0, -0.1], [6.0, 0.1], [0.0, 0.1]]]];
        let ab = [(1, 1, 1, false, 1.5, false, false, None, None), (2, 1, 1, false, 4.0, false, false, None, None)];
        let c = com_aberturas(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[PORTA], &ab);
        let vaos: Vec<MultiPoligono> = aberturas_do_nivel(&c, 0).expect("lista").iter().map(|(_, _, _, g)| retangulo_do_vao(g)).collect();
        let r = furos_de(&frag, &vaos).expect("difference");
        assert!((area_da_forma(&r) - (6.0 * 0.2 - 2.0 * 0.8 * 0.2)).abs() < 1e-9);
        assert_eq!(r.len(), 3);
        // sem vãos: devolve o fragmento
        assert_eq!(furos_de(&frag, &[]).expect("sem vãos"), frag);
        // fragmento vazio
        assert!(furos_de(&Vec::new(), &vaos).expect("vazio").is_empty());
    }
}
