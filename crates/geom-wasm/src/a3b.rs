//! Consulta `retornos_geom` (sub-etapa A3b da fatia A, decisão 0047 §7): retornos de acabamento nos vãos.
//!
//! Porta `insertMode`, `insertReturns`, `insertFrameFootprint`, `vaoPoint`, `rect`/`wallBand` (`wrap.ts`),
//! `openingCore`, `openingFramePlacement`, `openingFrameDims` e `jambSection` (`openingModelContext.ts`) e
//! `makeReturnClipper` (`clipReturn.ts`), com as mesmas contas na mesma ordem. O que o JS decide e envia pronto
//! (esquema v5): o fechamento do tipo, a existência de alizar, o estilo e o modo de profundidade do batente, e os
//! números do batente já com o padrão aplicado (`larg_batente`, `esp_folha`, `prof_pedida`).
//!
//! As booleanas são as de `ops.rs` (1 µm, a escala da ABI v1): `difference` (retorno menos batente),
//! `intersection` (retângulo do retorno em parede curva) e `differenceClipper` (recorte contra as paredes
//! vizinhas). O pintado que o recorte usa é o da A2 (`a2::pintar_nivel`), como `solveCluster` usa `plan`.
//! O memo do `makeReturnClipper` só guarda resultados e não é portado.

use crate::a2::{pintar_nivel, Codificador, NivelPintado, OpcoesDePlanta};
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::envolvimento::{camadas_envolventes, faixa_de_profundidade, lados_do_modo};
use crate::esquema::{ENTRADA, NIVEL_TODOS};
use crate::geo2d::{perp, v, V};
use crate::itens::{caixas_se_cruzam, Caixa4};
use crate::ops::{diferenca_com_escala, interseccao, ESCALA_FINA};
use crate::quadro::{ponto_em, tangente_em, Quadro};
use crate::secoes_a3::{Abertura, TipoAbertura, FECHAMENTO_HERDA};
use crate::{Anel, MultiPoligono};

/// `GAP` de `openingModelContext.ts` (folga padrão da esquadria, m).
const FOLGA: f64 = 0.004;
/// `OVERLAP` (largura do batedor/rebaixo, m).
const BATEDOR: f64 = 0.015;

/// Diferença a 1 nm (`ESCALA_FINA`), como o pintor da A2: o retorno e o recorte são peças finas (2 cm) e, a 1 µm, a
/// diferença simétrica contra o `polygon-clipping` exato do TS chegou a 1,02e-6 m² (limite 1e-6); a 1 nm o máximo medido
/// é 3,6e-7. É escolha de implementação; a tolerância da comparação não muda.
fn diferenca(args: &[MultiPoligono]) -> Result<MultiPoligono, u32> {
    diferenca_com_escala(args, ESCALA_FINA)
}

/// `ERRO_ENTRADA`/`ERRO_INTERNO` de `ops.rs` para o código do esquema.
fn traduz(c: u32) -> u32 {
    if c == crate::ERRO_ENTRADA {
        ENTRADA
    } else {
        crate::esquema::INTERNO
    }
}

/// `insertMode(wt, ot)` em códigos de `WrapMode` (0 none, 1 exterior, 2 interior, 3 both).
pub fn modo_de_insercao(wrap_inserts: u8, t: &TipoAbertura) -> u8 {
    // alizar e retorno são exclusivos: o alizar (do tipo ou da composição) zera o retorno, mesmo com closure explícito
    if t.tem_alizar {
        return 0;
    }
    if t.fechamento != FECHAMENTO_HERDA {
        return t.fechamento;
    }
    // `ot.leaves > 0 && openingFrameStyle(ot) !== 'block' ? 'none' : wt.wrapInserts`
    if t.folhas > 0 && t.estilo_batente != 3 {
        0
    } else {
        wrap_inserts
    }
}

/// `openingCore(f)`: núcleo da parede em `s` local, sempre `(s0 < s1)`.
fn nucleo_local(f: &Quadro) -> (f64, f64) {
    let dir = {
        let d = f.s_int - f.s_ext;
        // `Math.sign(x) || 1`: o sinal de 0 e de NaN (falsy) vale 1
        if d > 0.0 {
            1.0
        } else if d < 0.0 {
            -1.0
        } else {
            1.0
        }
    };
    let a = f.s_ext + dir * f.tipo.nucleo_de - f.s_mid;
    let b = f.s_ext + dir * f.tipo.nucleo_ate - f.s_mid;
    (a.min(b), a.max(b))
}

/// Dimensões do batente em `s` e `t` locais (`FrameDims`).
struct Dims {
    j: f64,
    d: f64,
    cd: f64,
    l: f64,
}

/// `openingFrameDims(f, t)` com `openingFramePlacement` (e `openingFrameDepth`) por dentro.
fn dimensoes_do_batente(f: &Quadro, t: &TipoAbertura) -> Dims {
    let (s0, s1) = nucleo_local(f);
    let largura_nucleo = s1 - s0;
    // `openingFrameDepth(t, thickness, coreWidth)`: parede = max(0, espessura); núcleo = max(0, min(núcleo, parede))
    let parede = f.thickness.max(0.0);
    let nucleo = largura_nucleo.min(parede).max(0.0);
    let meio = (s0 + s1) / 2.0;
    let (d, cd) = if t.estilo_batente == 2 {
        // aduela: o núcleo inteiro
        (largura_nucleo, meio)
    } else {
        match t.modo_prof {
            1 => (nucleo, meio),
            2 => {
                let profundidade = t.prof_pedida.min(parede);
                let metade = profundidade / 2.0;
                let lo = -f.thickness / 2.0 + metade;
                let hi = f.thickness / 2.0 - metade;
                (profundidade, hi.min(lo.max(meio)))
            }
            _ => (parede, 0.0),
        }
    };
    let j = if t.estilo_batente == 2 { 0.03 } else { t.larg_batente };
    Dims { j, d, cd, l: t.esp_folha }
}

/// `jambSection(d, hw, side, j, offset)`: seção em L da ombreira `j` no plano (t, s).
fn secao_da_ombreira(d: &Dims, hw: f64, side: f64, j: f64, offset: f64) -> [(f64, f64); 6] {
    let r = d.l + FOLGA;
    let outer = hw;
    let inner = hw - d.j;
    let lip = hw - d.j + BATEDOR;
    [
        (offset + j * outer, d.cd - side * (d.d / 2.0)),
        (offset + j * outer, d.cd + side * (d.d / 2.0)),
        (offset + j * lip, d.cd + side * (d.d / 2.0)),
        (offset + j * lip, d.cd + side * (d.d / 2.0 - r)),
        (offset + j * inner, d.cd + side * (d.d / 2.0 - r)),
        (offset + j * inner, d.cd - side * (d.d / 2.0)),
    ]
}

/// `vaoPoint(f, offset)(t, s)`: parede reta, o próprio `pointAt`; parede curva, o sistema reto do vão.
fn ponto_do_vao(f: &Quadro, offset: f64, t: f64, s: f64) -> V {
    if f.arc.is_none() {
        return ponto_em(f, t, s);
    }
    let c = ponto_em(f, offset, f.s_mid);
    let u = tangente_em(f, offset);
    let n = perp(u);
    v(c.x + u.x * (t - offset) + n.x * (s - f.s_mid), c.y + u.y * (t - offset) + n.y * (s - f.s_mid))
}

fn anel_de(pts: &[V]) -> Anel {
    pts.iter().map(|p| [p.x, p.y]).collect()
}

/// `insertFrameFootprint(f, offset, ot, side)`: contorno do batente na planta, ou `None` (sem folha ou estilo bloco).
fn pegada_do_batente(f: &Quadro, offset: f64, largura: f64, t: &TipoAbertura, side: f64) -> Option<MultiPoligono> {
    if t.folhas == 0 || t.estilo_batente == 3 {
        return None;
    }
    let d = dimensoes_do_batente(f, t);
    let hw = largura / 2.0;
    let para_o_mundo = |tt: f64, s: f64| ponto_do_vao(f, offset, tt, f.s_mid + s);
    let mut out: MultiPoligono = Vec::new();
    if !t.janela && (t.estilo_batente == 0 || t.estilo_batente == 2) {
        for j in [-1.0, 1.0] {
            let pts: Vec<V> = secao_da_ombreira(&d, hw, side, j, offset).iter().map(|&(a, b)| para_o_mundo(a, b)).collect();
            out.push(vec![anel_de(&pts)]);
        }
        return Some(out);
    }
    // caixilho simples (janelas e batente simple): duas caixas J x D nas ombreiras
    for j in [-1.0, 1.0] {
        let pts = [
            para_o_mundo(offset + j * (hw - d.j), d.cd - d.d / 2.0),
            para_o_mundo(offset + j * hw, d.cd - d.d / 2.0),
            para_o_mundo(offset + j * hw, d.cd + d.d / 2.0),
            para_o_mundo(offset + j * (hw - d.j), d.cd + d.d / 2.0),
        ];
        out.push(vec![anel_de(&pts)]);
    }
    Some(out)
}

/// `wallBand`: faixa da parede curva entre as curvas de profundidade `s0` e `s1`, ao longo de [t0, t1].
fn faixa_da_parede(f: &Quadro, t0: f64, t1: f64, s0: f64, s1: f64) -> MultiPoligono {
    const N: usize = 16;
    let ts: Vec<f64> = (0..=N).map(|i| t0 + ((t1 - t0) * i as f64) / N as f64).collect();
    let mut anel: Vec<V> = ts.iter().map(|&t| ponto_em(f, t, s1)).collect();
    anel.extend(ts.iter().rev().map(|&t| ponto_em(f, t, s0)));
    vec![vec![anel_de(&anel)]]
}

/// `rect(f, offset, t0, t1, s0, s1)`: retângulo do retorno no sistema do vão.
fn retangulo_do_retorno(f: &Quadro, offset: f64, t0: f64, t1: f64, s0: f64, s1: f64) -> Result<MultiPoligono, u32> {
    let at = |t: f64, s: f64| ponto_do_vao(f, offset, t, s);
    if f.arc.is_none() {
        return Ok(vec![vec![anel_de(&[at(t0, s0), at(t1, s0), at(t1, s1), at(t0, s1)])]]);
    }
    let big = f.thickness + 0.5;
    let alto: MultiPoligono = vec![vec![anel_de(&[at(t0, f.s_mid - big), at(t1, f.s_mid - big), at(t1, f.s_mid + big), at(t0, f.s_mid + big)])]];
    let faixa = faixa_da_parede(f, t0.min(t1) - 0.2, t0.max(t1) + 0.2, s0, s1);
    interseccao(&alto, &faixa).map_err(traduz)
}

/// Camadas do tipo da parede que o retorno lê (`wrappingLayers` usa função, espessura e `wraps`).
pub struct CamadasDoTipo<'a> {
    pub funcoes: &'a [u8],
    pub espessuras: &'a [f64],
    pub envolve: &'a [bool],
}

/// Retorno de uma camada num vão.
pub struct RetornoDeVao {
    pub camada: usize,
    pub poly: MultiPoligono,
}

/// `insertReturns(f, offset, width, mode, { ot, side })`.
pub fn retornos_do_vao(f: &Quadro, camadas: &CamadasDoTipo, offset: f64, largura: f64, modo: u8, t: &TipoAbertura, flip_frente: bool) -> Result<Vec<RetornoDeVao>, u32> {
    let lados = lados_do_modo(modo);
    let mut out = Vec::new();
    let pegada = if lados.is_empty() { None } else { pegada_do_batente(f, offset, largura, t, if flip_frente { -1.0 } else { 1.0 }) };
    for &lado in &lados {
        let (s0, s1) = faixa_de_profundidade(f, lado, lados.len() == 2);
        for w in camadas_envolventes(camadas.funcoes, camadas.espessuras, camadas.envolve, lado) {
            if w.off + w.espessura >= largura / 2.0 - 1e-3 {
                continue; // não cabe no vão
            }
            let a0 = offset - largura / 2.0 + w.off;
            let b1 = offset + largura / 2.0 - w.off;
            let mut cru = retangulo_do_retorno(f, offset, a0, a0 + w.espessura, s0, s1)?;
            cru.extend(retangulo_do_retorno(f, offset, b1 - w.espessura, b1, s0, s1)?);
            let poly = match &pegada {
                Some(p) => diferenca(&[cru, p.clone()]).map_err(traduz)?,
                None => cru,
            };
            if !poly.is_empty() {
                out.push(RetornoDeVao { camada: w.indice, poly });
            }
        }
    }
    Ok(out)
}

/// `boxOf(multiPoints(poly))`: caixa de todos os pontos de todos os anéis (vazia = infinitos).
fn caixa_de_todos(m: &MultiPoligono) -> Caixa4 {
    let mut b = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    for p in m {
        for a in p {
            for q in a {
                b[0] = b[0].min(q[0]);
                b[1] = b[1].min(q[1]);
                b[2] = b[2].max(q[0]);
                b[3] = b[3].max(q[1]);
            }
        }
    }
    b
}

/// `makeReturnClipper(items)(r, wallId, painted)`: o retorno menos o pintado das paredes vizinhas cuja caixa o toca.
/// `vizinhos`: `(parede, caixa, pintado)` de cada item do grupo, com `pintado` só para os itens em planta.
pub fn recortar_retorno(poly: &MultiPoligono, parede: u32, vizinhos: &[(u32, Caixa4, Option<&MultiPoligono>)]) -> Result<MultiPoligono, u32> {
    if poly.is_empty() {
        return Ok(Vec::new());
    }
    let caixa = caixa_de_todos(poly);
    let mut args: Vec<MultiPoligono> = vec![poly.clone()];
    for (p, cx, f) in vizinhos {
        if *p == parede || !caixas_se_cruzam(cx, &caixa) {
            continue;
        }
        if let Some(f) = f {
            if !f.is_empty() {
                args.push((*f).clone());
            }
        }
    }
    if args.len() == 1 {
        return Ok(poly.clone());
    }
    diferenca(&args).map_err(traduz)
}

/// Um retorno de `insertReturns` de um nível, com a parede, a abertura e o grupo a que pertence.
pub struct RetornoDoNivel {
    pub parede: u32,
    pub abertura: u32,
    /// `layerIndex` da camada envolvente.
    pub camada: usize,
    pub grupo: u32,
    /// `insertMode` efetivo.
    pub modo: u8,
    pub poly: MultiPoligono,
}

/// Os retornos de todos os grupos de um nível, na ordem de `resolveLevel`: grupos de `clusterWalls`, paredes na ordem do
/// grupo, aberturas por id crescente (a ordem de `openingsOfWall`) e, em cada uma, a ordem de `insertReturns`.
pub fn retornos_do_nivel(cena: &Cena, pintado: &NivelPintado) -> Result<Vec<RetornoDoNivel>, u32> {
    // Aberturas por parede, por id crescente (a ordem de `openingsOfWall`).
    let mut por_parede: std::collections::BTreeMap<u32, Vec<(u32, Abertura)>> = std::collections::BTreeMap::new();
    for (&id, a) in &cena.a3.aberturas {
        por_parede.entry(a.parede).or_default().push((id, *a));
    }
    let mut saida = Vec::new();
    for (gi, g) in pintado.grupos.iter().enumerate() {
        for &i in &g.membros {
            let f = &pintado.quadros[i];
            let tn = cena.a1.quadros.get(&f.id).ok_or(ENTRADA)?.tipo;
            let camadas = cena.a1.camadas_do_tipo(tn)?;
            let funcoes: Vec<u8> = camadas.iter().map(|c| c.funcao).collect();
            let espessuras: Vec<f64> = camadas.iter().map(|c| c.espessura).collect();
            let envolve: Vec<bool> = camadas.iter().map(|c| c.envolve).collect();
            let wrap_inserts = cena.a1.tipos.get(&tn).ok_or(ENTRADA)?.wrap_inserts;
            for (id, a) in por_parede.get(&f.id).map(|v| v.as_slice()).unwrap_or(&[]) {
                let t = cena.a3.tipos.get(&a.tipo).ok_or(ENTRADA)?;
                let modo = modo_de_insercao(wrap_inserts, t);
                let cam = CamadasDoTipo { funcoes: &funcoes, espessuras: &espessuras, envolve: &envolve };
                for r in retornos_do_vao(f, &cam, a.deslocamento, t.largura, modo, t, a.flip_frente)? {
                    saida.push(RetornoDoNivel { parede: f.id, abertura: *id, camada: r.camada, grupo: gi as u32, modo, poly: r.poly });
                }
            }
        }
    }
    Ok(saida)
}

/// Executa `retornos_geom(nivel_num, tol_juncao, opcoes)`.
pub fn retornos_geom(cena: &Cena, nivel: u32, tol: f64, opcoes: &OpcoesDePlanta) -> Result<Vec<Saida>, u32> {
    if nivel == NIVEL_TODOS {
        return Err(ENTRADA);
    }
    let pintado = pintar_nivel(cena, nivel, tol, opcoes)?;
    let mut cod = Codificador::default();
    let mut retornos: Vec<u32> = Vec::new();
    // `(parede, caixa, pintado em planta)` dos itens de cada grupo, para o recorte (o `plan` de `solveCluster`).
    let vizinhos_por_grupo: Vec<Vec<(u32, Caixa4, Option<&MultiPoligono>)>> = pintado
        .grupos
        .iter()
        .map(|g| g.itens.iter().enumerate().map(|(k, it)| (it.parede, it.caixa, if it.em_planta { Some(&g.fragmentos[k]) } else { None })).collect())
        .collect();
    for r in retornos_do_nivel(cena, &pintado)? {
        let recorte = recortar_retorno(&r.poly, r.parede, &vizinhos_por_grupo[r.grupo as usize])?;
        retornos.extend([r.parede, r.abertura, r.camada as u32, r.grupo, r.modo as u32]);
        let (bi, bn) = cod.forma(&r.poly);
        let (ri, rn) = cod.forma(&recorte);
        cod.formas_cab.extend([bi, bn, ri, rn]);
    }
    Ok(vec![Saida::U32(retornos), Saida::U32(cod.formas_cab), Saida::U32(cod.poligonos), Saida::U32(cod.aneis), Saida::F64(cod.pontos)])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::a1::testes_util::{c32, c64, c8, cena_com, f64s, tipo_simples, u32s, Par};
    use crate::consultas::executar;
    use crate::esquema::{CONSULTA_RETORNOS_GEOM as Q, SECAO_ABERTURAS, SECAO_CAMADAS, SECAO_PAREDES_Z, SECAO_TIPOS_ABERTURA, SECAO_TIPOS_PAREDE};
    use crate::pintor::area_da_forma;

    /// Campos de um tipo de abertura de teste (o resto vai com o padrão do JS).
    #[derive(Clone, Copy)]
    struct Ta {
        largura: f64,
        folhas: u8,
        janela: bool,
        fechamento: u8,
        alizar: bool,
        estilo: u8,
        modo_prof: u8,
    }

    const SEM_FOLHA: Ta = Ta { largura: 0.9, folhas: 0, janela: false, fechamento: 3, alizar: false, estilo: 0, modo_prof: 0 };

    fn bytes_tipos_abertura(ts: &[Ta]) -> Vec<u8> {
        let n = ts.len();
        [
            c32(&(1..=n as u32).collect::<Vec<_>>()),
            c64(&ts.iter().map(|t| t.largura).collect::<Vec<_>>()),
            c64(&vec![2.1; n]),
            c64(&vec![0.0; n]),
            c64(&vec![0.0; n]),
            c64(&vec![0.0; n]),
            c8(&ts.iter().map(|t| t.folhas).collect::<Vec<_>>()),
            c8(&vec![0u8; n]),
            c8(&ts.iter().map(|t| t.janela as u8).collect::<Vec<_>>()),
            c8(&ts.iter().map(|t| t.fechamento).collect::<Vec<_>>()),
            c8(&ts.iter().map(|t| t.alizar as u8).collect::<Vec<_>>()),
            c8(&ts.iter().map(|t| t.estilo).collect::<Vec<_>>()),
            c8(&ts.iter().map(|t| t.modo_prof).collect::<Vec<_>>()),
            c64(&vec![0.09; n]),
            c64(&vec![0.04; n]),
            c64(&vec![0.035; n]),
        ]
        .concat()
    }

    /// `(id, tipo, parede, deslocamento, flip_frente)`.
    type Ab = (u32, u32, u32, f64, bool);

    fn bytes_aberturas(a: &[Ab]) -> Vec<u8> {
        let n = a.len();
        [
            c32(&a.iter().map(|x| x.0).collect::<Vec<_>>()),
            c32(&a.iter().map(|x| x.1).collect::<Vec<_>>()),
            c32(&a.iter().map(|x| x.2).collect::<Vec<_>>()),
            c8(&vec![0u8; n]),
            c64(&a.iter().map(|x| x.3).collect::<Vec<_>>()),
            c8(&vec![0u8; n]),
            c8(&a.iter().map(|x| x.4 as u8).collect::<Vec<_>>()),
            c8(&vec![0u8; n]),
            c64(&vec![0.0; n]),
            c8(&vec![0u8; n]),
            c64(&vec![0.0; n]),
        ]
        .concat()
    }

    /// Tipo de parede 1: acabamento 2 cm (envolve), estrutura 15 cm, acabamento 2 cm (envolve); `wrap_inserts` à escolha.
    fn cena(ps: &[Par], tipos: &[Ta], aberturas: &[Ab], wrap_inserts: u8) -> Cena {
        let mut c = cena_com(ps, &[tipo_simples()]);
        let tp = [c32(&[1]), c32(&[3]), c8(&[0]), c32(&[0]), c8(&[wrap_inserts])].concat();
        c.definir_secao(SECAO_TIPOS_PAREDE, 1, &tp).expect("tipos_parede");
        let cam = [
            c32(&[1, 2, 3]),
            c32(&[1, 1, 1]),
            c32(&[0, 1, 2]),
            c64(&[0.02, 0.15, 0.02]),
            c8(&[4, 0, 4]),
            c8(&[0, 0, 0]),
            c64(&[0.0, 0.0, 0.0]),
            c32(&[1, 2, 3]),
            c8(&[1, 0, 1]),
        ]
        .concat();
        c.definir_secao(SECAO_CAMADAS, 3, &cam).expect("camadas");
        let n = ps.len();
        let ids: Vec<u32> = ps.iter().map(|p| p.id).collect();
        let bz = [c32(&ids), c64(&vec![0.0; n]), c64(&vec![2.8; n])].concat();
        c.definir_secao(SECAO_PAREDES_Z, n as u32, &bz).expect("paredes_z");
        c.definir_secao(SECAO_TIPOS_ABERTURA, tipos.len() as u32, &bytes_tipos_abertura(tipos)).expect("tipos_abertura");
        c.definir_secao(SECAO_ABERTURAS, aberturas.len() as u32, &bytes_aberturas(aberturas)).expect("aberturas");
        c
    }

    fn forma_de(s: &[Saida], ini: u32, n: u32) -> MultiPoligono {
        let pol = u32s(&s[2]);
        let an = u32s(&s[3]);
        let pt = f64s(&s[4]);
        (ini..ini + n)
            .map(|k| {
                let (ia, na) = (pol[2 * k as usize], pol[2 * k as usize + 1]);
                (ia..ia + na)
                    .map(|a| {
                        let (ip, np) = (an[2 * a as usize], an[2 * a as usize + 1]);
                        (ip..ip + np).map(|q| [pt[2 * q as usize], pt[2 * q as usize + 1]]).collect()
                    })
                    .collect()
            })
            .collect()
    }

    fn consulta(c: &mut Cena) -> Vec<Saida> {
        executar(c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0]).expect("consulta")
    }

    #[test]
    fn vao_livre_nos_dois_lados_gera_um_retorno_por_camada_com_a_area_esperada() {
        // parede de 6 m, espessura 0,19; vão livre de 0,9 m no meio; modo both: camadas 0 e 2 (2 cm cada)
        let mut c = cena(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[SEM_FOLHA], &[(7, 1, 1, 3.0, false)], 0);
        let s = consulta(&mut c);
        let r = u32s(&s[0]);
        assert_eq!(r.len(), 2 * 5, "uma camada por lado");
        assert_eq!(&r[0..5], &[1, 7, 0, 0, 3]);
        assert_eq!(&r[5..10], &[1, 7, 2, 0, 3]);
        let cab = u32s(&s[1]);
        for k in 0..2 {
            let bruto = forma_de(&s, cab[4 * k], cab[4 * k + 1]);
            // dois retângulos de 0,02 x (meia espessura 0,095)
            assert!((area_da_forma(&bruto) - 2.0 * 0.02 * 0.095).abs() < 1e-9, "área {}", area_da_forma(&bruto));
            let recorte = forma_de(&s, cab[4 * k + 2], cab[4 * k + 3]);
            assert!((area_da_forma(&recorte) - area_da_forma(&bruto)).abs() < 1e-9, "sem vizinhas o recorte é o próprio retorno");
        }
    }

    #[test]
    fn modos_de_insercao_e_exclusoes() {
        let t = |fecha: u8, folhas: u8, estilo: u8, alizar: bool| Ta { largura: 0.9, folhas, janela: false, fechamento: fecha, alizar, estilo, modo_prof: 0 };
        let m = |wi: u8, ta: Ta| {
            let c = cena(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[ta], &[], wi);
            modo_de_insercao(wi, c.a3.tipos.get(&1).expect("tipo"))
        };
        // closure explícito vale (alizar zera)
        assert_eq!(m(0, t(1, 1, 0, false)), 1);
        assert_eq!(m(0, t(2, 0, 0, false)), 2);
        assert_eq!(m(0, t(3, 1, 0, false)), 3);
        assert_eq!(m(3, t(0, 1, 0, false)), 0);
        assert_eq!(m(3, t(3, 1, 0, true)), 0, "alizar e retorno são exclusivos");
        // inherit: com folha e batente, none; vão livre ou estilo bloco, o da parede
        assert_eq!(m(3, t(4, 1, 0, false)), 0);
        assert_eq!(m(3, t(4, 1, 1, false)), 0);
        assert_eq!(m(3, t(4, 1, 2, false)), 0);
        assert_eq!(m(3, t(4, 1, 3, false)), 3, "bloco usa wrapInserts");
        assert_eq!(m(1, t(4, 0, 0, false)), 1, "vão livre usa wrapInserts");
        assert_eq!(m(2, t(4, 0, 0, false)), 2);
        assert_eq!(m(0, t(4, 0, 0, false)), 0);
    }

    #[test]
    fn batente_recorta_o_retorno_e_a_camada_que_nao_cabe_no_vao_sai() {
        // batente no núcleo (150 mm de 190): sobra a faixa das camadas de acabamento fora dele
        let porta = Ta { largura: 0.9, folhas: 1, janela: false, fechamento: 3, alizar: false, estilo: 0, modo_prof: 1 };
        let mut c = cena(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[porta, SEM_FOLHA], &[(7, 1, 1, 3.0, false), (8, 2, 1, 1.0, false)], 0);
        let s = consulta(&mut c);
        let r = u32s(&s[0]);
        assert_eq!(r.len() / 5, 4, "dois vãos x duas camadas");
        let cab = u32s(&s[1]);
        let area = |k: usize| area_da_forma(&forma_de(&s, cab[4 * k], cab[4 * k + 1]));
        // a ordem é por abertura (id crescente): vão 7 (porta com batente) vem antes do 8 (vão livre)
        assert_eq!((r[1], r[6], r[11], r[16]), (7, 7, 8, 8));
        assert!(area(0) < area(2) - 1e-6, "a pegada do batente recorta: {} x {}", area(0), area(2));
        assert!(area(0) > 0.0);
        // vão de 0,04 m: a camada de 2 cm não cabe (0,02 >= 0,02 - 1e-3)
        let mut c2 = cena(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[Ta { largura: 0.04, ..SEM_FOLHA }], &[(7, 1, 1, 3.0, false)], 0);
        assert_eq!(u32s(&consulta(&mut c2)[0]).len(), 0);
    }

    #[test]
    fn retorno_nao_invade_a_parede_vizinha() {
        // A sai do eixo de B (um T): o vão de A perto de B tem o retorno da esquerda (x de 0,95 a 0,97) dentro de B
        let a = Par::nova(1, (1.0, 0.0), (6.0, 0.0));
        let b = Par::nova(2, (1.0, -3.0), (1.0, 3.0));
        let mut c = cena(&[a, b], &[SEM_FOLHA], &[(7, 1, 1, 0.4, false)], 0);
        let s = consulta(&mut c);
        assert!(!u32s(&s[0]).is_empty());
        let cab = u32s(&s[1]);
        let bruto = forma_de(&s, cab[0], cab[1]);
        let recorte = forma_de(&s, cab[2], cab[3]);
        // o retângulo da esquerda cai inteiro dentro de B e sai; o da direita fica
        assert!((area_da_forma(&recorte) - area_da_forma(&bruto) / 2.0).abs() < 1e-6, "{} x {}", area_da_forma(&recorte), area_da_forma(&bruto));
        for p in &recorte {
            for a in p {
                for q in a {
                    assert!(q[0] > 1.0749, "ponto {q:?} dentro de B");
                }
            }
        }
    }

    #[test]
    fn parede_curva_usa_o_retangulo_pela_faixa_da_parede() {
        let mut curva = Par::nova(1, (0.0, 0.0), (6.0, 0.0));
        curva.sag = 1.0;
        let mut c = cena(&[curva], &[SEM_FOLHA], &[(7, 1, 1, 3.0, false)], 0);
        let s = consulta(&mut c);
        assert_eq!(u32s(&s[0]).len(), 2 * 5);
        let cab = u32s(&s[1]);
        let a = area_da_forma(&forma_de(&s, cab[0], cab[1]));
        assert!(a > 0.0015 && a < 0.0045, "área {a}");
    }

    #[test]
    fn entradas_invalidas() {
        let mut c = cena(&[Par::nova(1, (0.0, 0.0), (6.0, 0.0))], &[SEM_FOLHA], &[(7, 1, 1, 3.0, false)], 0);
        assert_eq!(executar(&mut c, Q, &[f64::from(0xFFFF_FFFFu32), 0.02, 0.0, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, -1.0, 0.0, 0.0, 0.0]).err(), Some(ENTRADA));
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0]).err(), Some(ENTRADA));
        // enums fora do domínio nas colunas novas
        let mut c2 = Cena::novo();
        for ruim in [Ta { fechamento: 5, ..SEM_FOLHA }, Ta { estilo: 4, ..SEM_FOLHA }, Ta { modo_prof: 3, ..SEM_FOLHA }] {
            assert_eq!(c2.definir_secao(SECAO_TIPOS_ABERTURA, 1, &bytes_tipos_abertura(&[ruim])), Err(ENTRADA));
        }
        // tipo de abertura inexistente
        c.definir_secao(SECAO_TIPOS_ABERTURA, 0, &bytes_tipos_abertura(&[])).expect("vazio");
        assert_eq!(executar(&mut c, Q, &[0.0, 0.02, 0.0, 0.0, 0.0]).err(), Some(ENTRADA));
    }
}
