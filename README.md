# SiDaW Player

Музыкальный плеер в двух реализациях:

- **`sidaw-player/`** — рабочая веб/Electron-версия (HTML, CSS, JavaScript, локальный Node-сервер). Запуск: `cd sidaw-player && npm run web-server`, затем `http://localhost:8080`.
- **`rust/`** — нативный порт на Rust (egui + rodio), первый этап. Инструкция по сборке установщика для Windows: [rust/README.md](rust/README.md).

Исходники Rust-версии лежат прямо в репозитории; демо-аудио общее для обеих версий и хранится в `sidaw-player/assets/audio`.
