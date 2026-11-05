//! CLI headless do renderizador GPU nativo do Hestia.
//!
//! Uso: `render-native <scene.hstr> <saida.png> [largura] [altura]`
//! Padrão de resolução: 1280x720.

use std::ffi::OsString;
use std::path::PathBuf;
use std::process::ExitCode;

use render_core::Cena;
use render_native::{png_saida, renderizar, ErroRender};

const USO: &str = "uso: render-native <scene.hstr> <saida.png> [largura] [altura]";
const LARGURA_PADRAO: u32 = 1280;
const ALTURA_PADRAO: u32 = 720;

fn dimensao(valor: Option<OsString>, padrao: u32, nome: &str) -> Result<u32, ErroRender> {
    let Some(valor) = valor else {
        return Ok(padrao);
    };
    let texto = valor
        .to_str()
        .ok_or_else(|| ErroRender::Argumentos(format!("{nome} precisa ser ASCII")))?;
    let numero = texto
        .parse::<u32>()
        .map_err(|_| ErroRender::Argumentos(format!("{nome} '{texto}' não é um inteiro")))?;
    if !(1..=16_384).contains(&numero) {
        return Err(ErroRender::Argumentos(format!(
            "{nome} {numero} fora da faixa 1..=16384"
        )));
    }
    Ok(numero)
}

fn executar() -> Result<(), ErroRender> {
    let mut argumentos = std::env::args_os().skip(1);
    let entrada = argumentos
        .next()
        .map(PathBuf::from)
        .ok_or_else(|| ErroRender::Argumentos(USO.into()))?;
    let saida = argumentos
        .next()
        .map(PathBuf::from)
        .ok_or_else(|| ErroRender::Argumentos(USO.into()))?;
    let largura = dimensao(argumentos.next(), LARGURA_PADRAO, "largura")?;
    let altura = dimensao(argumentos.next(), ALTURA_PADRAO, "altura")?;
    if argumentos.next().is_some() {
        return Err(ErroRender::Argumentos(USO.into()));
    }

    let bytes = std::fs::read(&entrada).map_err(|fonte| ErroRender::Entrada {
        caminho: entrada.clone(),
        fonte,
    })?;
    let cena = Cena::decodificar(&bytes)
        .map_err(|erro| ErroRender::Cena(format!("{} ({erro})", entrada.display())))?;

    println!(
        "render-native: cena '{}' com {} triângulos e {} materiais",
        entrada.display(),
        cena.quantidade_triangulos(),
        cena.materiais.len()
    );

    let imagem = renderizar(&cena, largura, altura)?;
    png_saida::gravar(&saida, &imagem.rgba, imagem.largura, imagem.altura)?;
    let tamanho = std::fs::metadata(&saida).map(|m| m.len()).unwrap_or(0);

    println!(
        "render-native: backend={} adaptador=\"{}\" tipo={}",
        imagem.backend, imagem.adaptador, imagem.tipo_adaptador
    );
    println!(
        "render-native: {}x{} em {} ms ({} vértices, mapa de sombra 2048)",
        imagem.largura, imagem.altura, imagem.duracao_ms, imagem.vertices
    );
    println!(
        "render-native: PNG salvo em '{}' ({} bytes)",
        saida.display(),
        tamanho
    );
    Ok(())
}

fn main() -> ExitCode {
    match executar() {
        Ok(()) => ExitCode::SUCCESS,
        Err(erro) => {
            eprintln!("render-native: {erro}");
            if matches!(erro, ErroRender::Argumentos(_)) {
                eprintln!("{USO}");
            }
            ExitCode::FAILURE
        }
    }
}
