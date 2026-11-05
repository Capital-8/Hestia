// Evita a janela de console extra no Windows em versões de release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hestia_desktop_lib::run()
}
