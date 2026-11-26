//! Аудиодвижок: rodio + Sink + EQ-обёртка над потоком сэмплов.
use crate::eq::{EqParams, EqSource};
use rodio::{Decoder, OutputStream, Sink, Source};
use std::{fs::File, io::{BufReader, Cursor}, path::Path, sync::{Arc, Mutex}, time::Duration};

pub struct AudioEngine {
    // Stream должен жить всё время, пока играет Sink.
    _stream: Option<OutputStream>,
    sink: Option<Sink>,
    pub params: Arc<Mutex<EqParams>>,
    volume: f32,
    has_track: bool,
    pub duration: Option<Duration>,
}

impl AudioEngine {
    pub fn new(params: Arc<Mutex<EqParams>>, volume: f32) -> Self {
        Self { _stream: None, sink: None, params, volume: volume.clamp(0.0, 1.0), has_track: false, duration: None }
    }

    fn ensure_sink(&mut self) -> Result<(), String> {
        if self.sink.is_some() {
            return Ok(());
        }
        let (stream, handle) = OutputStream::try_default().map_err(|e| format!("Нет доступного аудиоустройства: {e}"))?;
        let sink = Sink::try_new(&handle).map_err(|e| format!("Не удалось создать плеер: {e}"))?;
        sink.set_volume(self.volume);
        self._stream = Some(stream);
        self.sink = Some(sink);
        Ok(())
    }

    fn append_source<S>(&mut self, source: S, duration: Option<Duration>)
    where
        S: rodio::Source<Item = f32> + Send + 'static,
    {
        let sink = self.sink.as_ref().expect("sink initialized");
        sink.stop();
        sink.append(EqSource::new(source, Arc::clone(&self.params)));
        sink.play();
        self.duration = duration;
        self.has_track = true;
    }

    pub fn play(&mut self, path: &Path) -> Result<(), String> {
        self.has_track = false;
        self.ensure_sink()?;
        let file = File::open(path).map_err(|e| format!("Не удалось открыть файл: {e}"))?;
        let decoder = Decoder::new(BufReader::new(file)).map_err(|e| format!("Формат не поддерживается: {e}"))?;
        let duration = decoder.total_duration();
        self.append_source(decoder.convert_samples::<f32>(), duration);
        Ok(())
    }

    /// Воспроизведение трека из открытого каталога (байты уже скачаны).
    pub fn play_buffer(&mut self, bytes: Vec<u8>) -> Result<(), String> {
        self.has_track = false;
        self.ensure_sink()?;
        let decoder = Decoder::new(Cursor::new(bytes)).map_err(|e| format!("Формат не поддерживается: {e}"))?;
        let duration = decoder.total_duration();
        self.append_source(decoder.convert_samples::<f32>(), duration);
        Ok(())
    }

    pub fn toggle_play(&mut self) {
        if let Some(sink) = &self.sink {
            if !sink.empty() {
                if sink.is_paused() { sink.play(); } else { sink.pause(); }
            }
        }
    }

    pub fn pause(&mut self) {
        if let Some(sink) = &self.sink { sink.pause(); }
    }

    pub fn stop(&mut self) {
        if let Some(sink) = &self.sink { sink.stop(); }
        self.has_track = false;
        self.duration = None;
    }

    pub fn is_playing(&self) -> bool {
        self.sink.as_ref().map_or(false, |s| !s.is_paused() && !s.empty())
    }

    pub fn is_finished(&self) -> bool {
        self.has_track && self.sink.as_ref().map_or(false, |s| s.empty())
    }

    pub fn position(&self) -> Duration {
        self.sink.as_ref().map_or(Duration::ZERO, |s| s.get_pos())
    }

    pub fn seek(&self, pos: Duration) {
        if let Some(sink) = &self.sink { let _ = sink.try_seek(pos); }
    }

    pub fn volume(&self) -> f32 {
        self.volume
    }

    pub fn set_volume(&mut self, value: f32) {
        self.volume = value.clamp(0.0, 1.0);
        if let Some(sink) = &self.sink { sink.set_volume(self.volume); }
    }
}
