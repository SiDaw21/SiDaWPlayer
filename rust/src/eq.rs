//! 10-полосный эквалайзер: фильтры RBJ peaking + общий предусилитель.
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use std::sync::{Arc, Mutex};

pub const BANDS_HZ: [f32; 10] = [31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0];
const Q: f64 = 1.1;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct EqParams {
    pub enabled: bool,
    pub bands: [f32; 10],
    pub preamp: f32, // дБ
}

impl Default for EqParams {
    fn default() -> Self {
        Self { enabled: false, bands: [0.0; 10], preamp: 0.0 }
    }
}

pub const PRESETS: &[(&str, [f32; 10])] = &[
    ("Плоский", [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
    ("Поп", [3.0, 2.0, 0.0, -1.0, -1.0, 1.0, 2.0, 3.0, 3.0, 2.0]),
    ("Рок", [5.0, 4.0, 2.0, -1.0, -2.0, 1.0, 3.0, 4.0, 4.0, 3.0]),
    ("Джаз", [3.0, 2.0, 1.0, 2.0, -1.0, -2.0, 0.0, 1.0, 3.0, 4.0]),
    ("Классика", [4.0, 3.0, 2.0, 0.0, -2.0, -2.0, 0.0, 2.0, 4.0, 4.0]),
    ("Электроника", [6.0, 5.0, 3.0, 0.0, -2.0, 1.0, 3.0, 5.0, 6.0, 5.0]),
    ("Вокал", [0.0, 0.0, -1.0, -2.0, 2.0, 4.0, 4.0, 2.0, 0.0, 0.0]),
    ("Бас+", [8.0, 7.0, 5.0, 2.0, 0.0, -1.0, -2.0, -2.0, -1.0, 0.0]),
    ("Ночной", [4.0, 3.0, 1.0, 0.0, -1.0, -2.0, -3.0, -3.0, -2.0, -1.0]),
];

struct PeakingFilter {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl PeakingFilter {
    fn new(sample_rate: u32, freq: f32, gain_db: f32) -> Self {
        let sr = sample_rate.max(8000) as f64;
        let f = (freq as f64).clamp(20.0, sr * 0.45);
        let w0 = 2.0 * PI * f / sr;
        let alpha = w0.sin() / (2.0 * Q);
        let a = 10f64.powf(gain_db as f64 / 40.0);
        let cos = w0.cos();
        let a0 = 1.0 + alpha / a;
        Self {
            b0: (1.0 + alpha * a) / a0,
            b1: (-2.0 * cos) / a0,
            b2: (1.0 - alpha * a) / a0,
            a1: (-2.0 * cos) / a0,
            a2: (1.0 - alpha / a) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    fn process(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

pub struct Equalizer {
    sample_rate: u32,
    channels: usize,
    filters: Vec<Vec<PeakingFilter>>,
    cached: EqParams,
}

impl Equalizer {
    pub fn new(sample_rate: u32, channels: u16, params: EqParams) -> Self {
        let channels = channels.max(1) as usize;
        let mut eq = Self { sample_rate, channels, filters: Vec::new(), cached: EqParams { enabled: !params.enabled, ..params } };
        eq.apply(&params);
        eq
    }

    pub fn channels(&self) -> usize {
        self.channels
    }

    /// Пересобирает коэффициенты только при изменении параметров из UI.
    pub fn apply(&mut self, params: &EqParams) {
        if self.cached == *params {
            return;
        }
        self.cached = *params;
        self.filters = (0..self.channels)
            .map(|_| {
                BANDS_HZ
                    .iter()
                    .enumerate()
                    .map(|(i, freq)| {
                        let gain = if params.enabled { params.bands[i] } else { 0.0 };
                        PeakingFilter::new(self.sample_rate, *freq, gain)
                    })
                    .collect()
            })
            .collect();
    }

    pub fn process(&mut self, sample: &mut f32, channel: usize) {
        let ch = channel.min(self.channels - 1);
        let preamp = if self.cached.enabled { 10f32.powf(self.cached.preamp / 20.0) } else { 1.0 };
        let mut value = (*sample * preamp) as f64;
        for filter in &mut self.filters[ch] {
            value = filter.process(value);
        }
        *sample = (value as f32).clamp(-4.0, 4.0); // мягкая защита от самовозбуждения на предельных настройках
    }
}

/// rodio::Source-обёртка: применяет эквалайзер к потоку сэмплов на лету.
pub struct EqSource<S> {
    source: S,
    eq: Equalizer,
    params: Arc<Mutex<EqParams>>,
    channel: usize,
}

impl<S> EqSource<S>
where
    S: rodio::Source<Item = f32>,
{
    pub fn new(source: S, params: Arc<Mutex<EqParams>>) -> Self {
        let sample_rate = source.sample_rate();
        let channels = source.channels();
        let snapshot = *params.lock().expect("params mutex poisoned");
        Self { source, eq: Equalizer::new(sample_rate, channels, snapshot), params, channel: 0 }
    }
}

impl<S> Iterator for EqSource<S>
where
    S: Iterator<Item = f32>,
{
    type Item = f32;

    fn next(&mut self) -> Option<f32> {
        let mut sample = self.source.next()?;
        let snapshot = *self.params.lock().expect("params mutex poisoned");
        self.eq.apply(&snapshot);
        self.eq.process(&mut sample, self.channel);
        self.channel = (self.channel + 1) % self.eq.channels();
        Some(sample)
    }
}

impl<S> rodio::Source for EqSource<S>
where
    S: rodio::Source<Item = f32> + Send + 'static,
{
    fn current_frame_len(&self) -> Option<usize> {
        self.source.current_frame_len()
    }

    fn channels(&self) -> u16 {
        self.source.channels()
    }

    fn sample_rate(&self) -> u32 {
        self.source.sample_rate()
    }

    fn total_duration(&self) -> Option<std::time::Duration> {
        self.source.total_duration()
    }

    fn try_seek(&mut self, pos: std::time::Duration) -> Result<(), rodio::source::SeekError> {
        self.source.try_seek(pos)
    }
}
