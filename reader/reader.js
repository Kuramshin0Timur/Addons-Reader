class ReaderManager {
    constructor() {
        this.currentBook = null;
        this.currentRendition = null;
        this.currentFileUrl = null;
        this.currentFilename = '';
        this.currentLocation = null;
        this.currentBookType = null;
        this.settings = this.loadSettings();
        this.init();
    }

    loadSettings() {
        const saved = localStorage.getItem('reader_settings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) { }
        }
        return { fontSize: 16, fontFamily: 'Georgia', lineHeight: 1.6, theme: 'light' };
    }

    saveSettings() {
        localStorage.setItem('reader_settings', JSON.stringify(this.settings));
        this.applySettings();
    }

    applySettings() {
        const content = document.getElementById('book-content');
        if (content) {
            content.style.fontSize = `${this.settings.fontSize}px`;
            content.style.fontFamily = this.settings.fontFamily;
            content.style.lineHeight = this.settings.lineHeight;
        }
        document.documentElement.setAttribute('data-theme', this.settings.theme);
        document.getElementById('font-size-value').textContent = `${this.settings.fontSize}px`;
        document.getElementById('font-select').value = this.settings.fontFamily;
    }

    init() {
        this.setupEventListeners();
        this.loadBookFromUrl();
    }

    setupEventListeners() {
        document.getElementById('btn-prev').addEventListener('click', () => this.prevPage());
        document.getElementById('btn-next').addEventListener('click', () => this.nextPage());
        document.getElementById('btn-back').addEventListener('click', () => window.close());
        document.getElementById('btn-settings').addEventListener('click', () => this.toggleSettings());
        document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());

        document.getElementById('font-decrease').addEventListener('click', () => this.changeFontSize(-2));
        document.getElementById('font-increase').addEventListener('click', () => this.changeFontSize(2));
        document.getElementById('font-select').addEventListener('change', (e) => {
            this.settings.fontFamily = e.target.value;
            this.saveSettings();
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.settings.theme = btn.dataset.theme;
                this.saveSettings();
                this.updateActiveTheme();
            });
        });

        document.getElementById('retry-btn').addEventListener('click', () => this.loadBookFromUrl());
        document.getElementById('demo-btn').addEventListener('click', () => this.loadDemoBook());
    }

    updateActiveTheme() {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.dataset.theme === this.settings.theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    changeFontSize(delta) {
        const newSize = Math.max(12, Math.min(32, this.settings.fontSize + delta));
        this.settings.fontSize = newSize;
        this.saveSettings();
    }

    toggleSettings() {
        document.getElementById('settings-panel').classList.toggle('hidden');
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('book-content').classList.add('hidden');
        document.getElementById('error-message').classList.add('hidden');
    }

    showContent() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('book-content').classList.remove('hidden');
        document.getElementById('error-message').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('book-content').classList.add('hidden');
        document.getElementById('error-message').classList.remove('hidden');
        document.getElementById('error-text').textContent = message;
        console.error('Error:', message);
    }

    async loadBookFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.currentFileUrl = urlParams.get('file');
        this.currentFilename = urlParams.get('filename') || 'Книга';

        console.log('Загрузка файла:', this.currentFileUrl);

        if (!this.currentFileUrl) {
            this.showError('URL файла не указан');
            return;
        }

        this.showLoading();
        document.getElementById('book-title').textContent = this.currentFilename;

        try {
            if (this.currentFileUrl.startsWith('blob:')) {
                await this.loadBlobViaXHR(this.currentFileUrl);
            } else {
                await this.loadViaFetch(this.currentFileUrl);
            }
        } catch (error) {
            console.error('Ошибка:', error);
            this.showError(`Не удалось загрузить: ${error.message}`);
        }
    }

    loadBlobViaXHR(blobUrl) {
        console.log('Загрузка blob через XHR:', blobUrl);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', blobUrl, true);
            xhr.responseType = 'blob';

            xhr.onload = () => {
                if (xhr.status === 200) {
                    const blob = xhr.response;
                    console.log('Blob загружен, размер:', blob.size);
                    this.processBookBlob(blob).then(resolve).catch(reject);
                } else {
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                reject(new Error('XHR network error'));
            };

            xhr.send();
        });
    }

    async loadViaFetch(fileUrl) {
        console.log('Загрузка через Fetch');
        const response = await fetch(fileUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        await this.processBookBlob(blob);
    }

    async processBookBlob(blob) {
        const extension = this.currentFilename.split('.').pop().toLowerCase();
        console.log('Тип файла:', extension, 'Размер:', blob.size);

        if (extension === 'epub') {
            await this.loadEpub(blob);
        } else if (extension === 'docx' || extension === 'doc') {
            await this.loadDocx(blob);
        } else if (extension === 'fb2') {
            await this.loadFb2(blob);
        } else {
            throw new Error(`Неподдерживаемый формат: ${extension}`);
        }

        this.showContent();
        this.applySettings();
    }

    async loadEpub(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    this.currentBook = ePub(arrayBuffer);
                    await this.currentBook.ready;

                    const contentDiv = document.getElementById('book-content');
                    contentDiv.innerHTML = '<div id="epub-viewer" style="width:100%;height:100%;"></div>';

                    this.currentRendition = this.currentBook.renderTo('epub-viewer', {
                        width: contentDiv.clientWidth,
                        height: contentDiv.clientHeight - 40,
                        flow: 'paginated'
                    });

                    this.currentRendition.display();
                    this.currentRendition.on('relocated', (loc) => {
                        this.currentLocation = loc;
                        this.updateProgress();
                        if (loc.start && loc.start.displayed) {
                            document.getElementById('page-info').textContent =
                                `${loc.start.displayed.page} / ${loc.start.displayed.total}`;
                        }
                    });

                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Ошибка чтения EPUB'));
            reader.readAsArrayBuffer(blob);
        });
    }

    async loadDocx(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    document.getElementById('book-content').innerHTML = result.value;
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Ошибка чтения DOCX'));
            reader.readAsArrayBuffer(blob);
        });
    }

    async loadFb2(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const xmlText = e.target.result;
                    const html = this.fb2ToHtml(xmlText);
                    document.getElementById('book-content').innerHTML = html;
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error('Ошибка чтения FB2'));
            reader.readAsText(blob, 'utf-8');
        });
    }

    fb2ToHtml(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        if (xmlDoc.querySelector('parsererror')) {
            throw new Error('Ошибка парсинга FB2');
        }

        let html = '';
        const title = xmlDoc.querySelector('title-info book-title');
        if (title) html += `<h1>${this.escapeHtml(title.textContent)}</h1>`;

        const body = xmlDoc.querySelector('body');
        if (body) {
            for (const child of body.childNodes) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.tagName === 'section') {
                        for (const sectionChild of child.childNodes) {
                            if (sectionChild.tagName === 'title') {
                                html += `<h2>${this.escapeHtml(sectionChild.textContent)}</h2>`;
                            } else if (sectionChild.tagName === 'p') {
                                html += `<p>${this.escapeHtml(sectionChild.textContent)}</p>`;
                            }
                        }
                    }
                }
            }
        }
        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    prevPage() {
        if (this.currentRendition) {
            this.currentRendition.prev();
        } else {
            const content = document.getElementById('book-content');
            content.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
        }
    }

    nextPage() {
        if (this.currentRendition) {
            this.currentRendition.next();
        } else {
            const content = document.getElementById('book-content');
            content.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        }
    }

    updateProgress() {
        if (this.currentLocation && this.currentLocation.start && this.currentLocation.start.percentage) {
            document.getElementById('progress-fill').style.width =
                `${this.currentLocation.start.percentage * 100}%`;
        }
    }

    loadDemoBook() {
        const demoHtml = `
            <h1>📚 Демо-книга</h1>
            <p>Расширение работает в Firefox с Manifest V3!</p>
            <h2>Поддерживаемые форматы</h2>
            <ul>
                <li><strong>EPUB</strong> - электронные книги</li>
                <li><strong>FB2</strong> - FictionBook</li>
                <li><strong>DOCX/DOC</strong> - документы Word</li>
            </ul>
            <h2>Как пользоваться</h2>
            <p>1. Нажмите на иконку расширения</p>
            <p>2. Выберите "Открыть локальный файл"</p>
            <p>3. Выберите книгу на компьютере</p>
            <p>4. Наслаждайтесь чтением!</p>
        `;
        document.getElementById('book-content').innerHTML = demoHtml;
        this.currentBookType = 'demo';
        this.showContent();
        this.applySettings();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.reader = new ReaderManager();
});