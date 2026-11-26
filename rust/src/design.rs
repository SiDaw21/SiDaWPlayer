//! Неоновая «волна»: плавная смена акцента, мягкий фон и визуализатор.
//! Фон рисуется внутри центральной панели до виджетов, поэтому никогда их не перекрывает.
use eframe::egui::{self, Color32, Pos2, Rect, Shape, Stroke};
use std::time::Instant;

pub struct Design {
    time: f32,
    energy: f32,
    accent: Color32,
    last_frame: Instant,
}

impl Design {
    pub fn new() -> Self {
        Self { time: 0.0, energy: 0.0, accent: Color32::from_gray(40), last_frame: Instant::now() }
    }

    /// Обновляет анимационные параметры и возвращает сглаженный акцент.
    pub fn frame(&mut self, accent_rgb: [u8; 3], playing: bool) -> Color32 {
        let dt = self.last_frame.elapsed().as_secs_f32().min(0.1);
        self.last_frame = Instant::now();
        self.time += dt;

        let target_energy = if playing { 1.0 } else { 0.18 };
        self.energy += (target_energy - self.energy) * (dt * 3.5).min(1.0);

        let target = Color32::from_rgb(accent_rgb[0], accent_rgb[1], accent_rgb[2]);
        let k = (dt * 4.0).min(1.0);
        self.accent = Color32::from_rgb(
            lerp_u8(self.accent.r(), target.r(), k),
            lerp_u8(self.accent.g(), target.g(), k),
            lerp_u8(self.accent.b(), target.b(), k),
        );
        self.accent
    }

    pub fn accent(&self) -> Color32 {
        self.accent
    }

    pub fn time(&self) -> f32 {
        self.time
    }

    pub fn glow(&self, alpha: f32) -> Color32 {
        Color32::from_rgba_unmultiplied(
            self.accent.r(),
            self.accent.g(),
            self.accent.b(),
            alpha.clamp(0.0, 255.0) as u8,
        )
    }

    /// Рисует фон в уже отведённой области central panel — строго под виджетами.
    pub fn paint(&self, ui: &egui::Ui, light: bool) {
        let painter = ui.painter();
        let rect = ui.clip_rect();
        let base = if light { Color32::from_rgb(238, 240, 248) } else { Color32::from_rgb(12, 14, 24) };
        painter.rect_filled(rect, 0.0, base);

        // Очень мягкое свечение: 14 полупрозрачных кругов, суммарно ~20% непрозрачности.
        let cx = rect.min.x + rect.width() * 0.78;
        let cy = rect.min.y + rect.height() * 0.10;
        let drift = (self.time * 0.35).sin() * 14.0;
        for i in (0..14).rev() {
            let t = i as f32 / 14.0;
            let radius = 24.0 + t * 300.0 + drift;
            let alpha = ((1.0 - t) * (3.0 + self.energy * 3.0)) as u8;
            painter.circle_filled(Pos2::new(cx, cy), radius, self.glow(alpha as f32));
        }

        // Три бегущие синусоиды у нижней границы центральной панели.
        for lane in 0..3 {
            let mut points = Vec::with_capacity(72);
            for i in 0..=72 {
                let x = rect.min.x + rect.width() * i as f32 / 72.0;
                let phase = self.time * (0.55 + lane as f32 * 0.12) + i as f32 * 0.085;
                let y = rect.max.y - 22.0 - lane as f32 * 8.0
                    + phase.sin() * (8.0 + lane as f32 * 4.0) * (0.3 + self.energy * 0.7);
                points.push(Pos2::new(x, y));
            }
            let alpha = 45.0 + lane as f32 * 15.0 + self.energy * 25.0;
            painter.add(Shape::line(points, Stroke::new(1.1 + lane as f32 * 0.4, self.glow(alpha))));
        }
    }
}

fn lerp_u8(a: u8, b: u8, t: f32) -> u8 {
    (a as f32 + (b as f32 - a as f32) * t).round().clamp(0.0, 255.0) as u8
}

/// Анимированная полоска-визуализатор для нижней панели плеера.
pub fn wave(ui: &egui::Ui, rect: Rect, design: &Design) {
    let painter = ui.painter();
    painter.rect_filled(rect, 6.0, design.glow(18.0));
    let bars = 44;
    let gap = 2.0;
    let bar_width = ((rect.width() - gap * (bars - 1) as f32) / bars as f32).max(1.0);
    let accent = design.accent();
    for i in 0..bars {
        let phase = design.time * 2.6 + i as f32 * 0.42;
        let level = (phase.sin() * 0.5 + 0.5) * (phase.cos() * 0.25 + 0.75);
        let height = 3.0 + level * rect.height() * 0.78 * (0.25 + design.energy * 0.75);
        let x = rect.min.x + i as f32 * (bar_width + gap);
        let bar = Rect::from_min_size(Pos2::new(x, rect.max.y - height), egui::vec2(bar_width, height));
        let color = Color32::from_rgba_unmultiplied(accent.r(), accent.g(), accent.b(), (110.0 + level * 110.0) as u8);
        painter.rect_filled(bar, bar_width / 2.0, color);
    }
}
