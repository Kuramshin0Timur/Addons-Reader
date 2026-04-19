// Используем chrome API (работает везде)
class PopupManager {
    constructor() {
        this.settings = {
            fontSize: 16,
            fontFamily: 'Georgia',
            theme: 'light'
        };
        this.blobUrls = [];
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.updateUI();

        window.addEventListener('beforeunload', () => {
            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
        });
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
        document.getElementById('open-local').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.openLocalFile(file);
            }
            e.target.value = '';
        });

        document.getElementById('open-url').addEventListener('click', () => {
            this.openFromUrl();
        });

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
        console.log('Открытие локального файла:', file.name);

        const blobUrl = URL.createObjectURL(file);
        this.blobUrls.push(blobUrl);

        console.log('Создан blob URL:', blobUrl);

        chrome.runtime.sendMessage({
            action: 'openBlobInReader',
            url: blobUrl,
            filename: file.name
        });

        setTimeout(() => window.close(), 100);
    }

    openFromUrl() {
        const url = prompt('Введите URL файла (EPUB, FB2, DOCX):');
        if (url && url.trim()) {
            chrome.runtime.sendMessage({
                action: 'openInReader',
                url: url.trim(),
                filename: url.split('/').pop() || 'Книга'
            });
            window.close();
        }
    }

    async resetSettings() {
        if (confirm('Сбросить настройки?')) {
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

document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});