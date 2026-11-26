// В release-сборке под Windows не показываем консольное окно.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod audio;
mod catalog;
mod eq;
mod library;

use eframe::egui;

fn main() -> eframe::Result {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1120.0, 720.0])
            .with_min_inner_size([880.0, 600.0]),
        ..Default::default()
    };
    eframe::run_native("SiDaW Player", options, Box::new(|_cc| Ok(Box::new(app::SiDawApp::new()))))
}
