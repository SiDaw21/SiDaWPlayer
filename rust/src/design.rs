//! Неоновая «волна»: анимированный фон, плавная смена акцента и визуализатор.
use eframe::egui::{self, Color32, Id, LayerId, Order, Pos2, Rect, Shape, Stroke};
use std::time::Instant;

pub struct Design {
    time: f32,
    energy: f32,
    accent: Color32,
    last_frame: Instant,
}

impl Design {
    pub fn new() -> Self {
        // Стартуем с тёмного акцента — цвета плавно «проявляются» при запуске.
        Self {
            time: 0.0,
            energy: 0.0,
            accent: Color32::from_gray(40),
            last_frame: Instant::now(),
        }
    }

    /// Вызывается раз в кадр до настройки визуалов. Возвращает сглаженный акцент.
    pub fn frame(&mut self, ctx: &egui::Context, accent_rgb: [u8; 3], light: bool, playing: bool) -> Color32 {
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

        self.paint_background(ctx, light);
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
            (alpha.clamp(0.0, 255.0)) as u8,
        )
    }

    fn paint_background(&self, ctx: &egui::Context, light: bool) {
        let painter = ctx.layer_painter(LayerId::new(Order::Background, Id::new("sidaw-neon-wave")));
        let rect = ctx.screen_rect();
        let base = if light { Color32::from_rgb(238, 240, 248) } else { Color32::from_rgb(8, 10, 18) };
        painter.rect_filled(rect, 0.0, base);

        // Мягкое «сияние» в правом верхнем углу: concentric circles с нарастающей прозрачностью.
        let cx = rect.max.x * 0.78;
        let cy = rect.min.y + rect.height() * 0.08;
        let drift = (self.time * 0.35).sin() * 18.0;
        for i in (0..26).rev() {
            let t = i as f32 / 26.0;
            let radius = 30.0 + t * 430.0 + drift;
            let a = ((1.0 - t) * (16.0 + self.energy * 22.0)) as u8;
            let color = self.glow(a as f32);
            painter.circle_filled(Pos2::new(cx, cy), radius, color);
        }

        // Три бегущие синусоиды у нижней границы — «волна» во всё окно.
        for lane in 0..3 {
            let mut points = Vec::with_capacity(72);
            for i in 0..=72 {
                let x = rect.min.x + rect.width() * i as f32 / 72.0;
                let phase = self.time * (0.55 + lane as f32 * 0.12) + i as f32 * 0.085;
                let y = rect.max.y - 26.0 - lane as f32 * 9.0
                    + phase.sin() * (10.0 + lane as f32 * 5.0) * (0.3 + self.energy * 0.7);
                points.push(Pos2::new(x, y));
            }
            let alpha = 40.0 + lane as f32 * 18.0 + self.energy * 40.0;
            painter.add(Shape::line(points, Stroke::new(1.2 + lane as f32 * 0.5, self.glow(alpha))));
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
