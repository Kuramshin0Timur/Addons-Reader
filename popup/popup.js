class PopupManager {
    constructor() {
        this.settings = {
            fontSize: 16,
            fontFamily: 'Georgia',
            theme: 'light'
        };
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.updateUI();
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getSettings' }, (response) => {
                if (response && Object.keys(response).length > 0) {
                    this.settings = { ...this.settings, ...response };
                }
                resolve();
            });
        });
    }

    async saveSettings() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'saveSettings',
                settings: this.settings
            }, (response) => {
                resolve(response);
            });
        });
    }

    setupEventListeners() {
        // Открытие локального файла
        document.getElementById('open-local').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        // Обработчик выбора файла
        document.getElementById('file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.openLocalFile(file);
            }
        });

        // Открытие по URL
        document.getElementById('open-url').addEventListener('click', () => {
            this.openFromUrl();
        });

        // Настройки
        document.getElementById('font-size').addEventListener('change', (e) => {
            this.settings.fontSize = parseInt(e.target.value);
            this.saveSettings();
        });

        document.getElementById('font-family').addEventListener('change', (e) => {
            this.settings.fontFamily = e.target.value;
            this.saveSettings();
        });

        document.getElementById('theme').addEventListener('change', (e) => {
            this.settings.theme = e.target.value;
            this.saveSettings();
        });

        // Сброс настроек
        document.getElementById('reset-settings').addEventListener('click', () => {
            this.resetSettings();
        });
    }

    updateUI() {
        document.getElementById('font-size').value = this.settings.fontSize;
        document.getElementById('font-family').value = this.settings.fontFamily;
        document.getElementById('theme').value = this.settings.theme;
    }

    openLocalFile(file) {
        // Для локальных файлов создаем Object URL
        const url = URL.createObjectURL(file);
        this.openInReader(url, file.name);
    }

    openFromUrl() {
        const url = prompt('Введите URL файла (EPUB, FB2, DOCX):', 'http://localhost:8000/test.fb2');
        if (url) {
            this.openInReader(url);
        }
    }

    openInReader(fileUrl, filename = '') {
        // Отправляем сообщение в background script для открытия файла
        chrome.runtime.sendMessage({
            action: 'openInReader',
            url: fileUrl,
            filename: filename
        });
    }

    async resetSettings() {
        if (confirm('Вы уверены, что хотите сбросить все настройки?')) {
            this.settings = {
                fontSize: 16,
                fontFamily: 'Georgia',
                theme: 'light'
            };
            await this.saveSettings();
            this.updateUI();
        }
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});