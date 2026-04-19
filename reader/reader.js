class EbookReader {
    constructor() {
        this.settings = {
            fontSize: 16,
            fontFamily: 'Georgia',
            lineHeight: 1.6,
            theme: 'light'
        };
        
        this.currentBook = null;
        this.currentPage = 1;
        this.totalPages = 1;
        this.bookContent = '';
        this.isLoading = false;
        this.rendition = null;
        this.currentFileUrl = '';
        this.currentFilename = '';
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.applySettings();
        
        this.checkLibraries();
        await this.loadBookFromUrl();
    }

    checkLibraries() {
        console.log('Проверка библиотек:');
        console.log('JSZip:', typeof JSZip !== 'undefined' ? '✓' : '✗');
        console.log('ePub:', typeof ePub !== 'undefined' ? '✓' : '✗');
        console.log('mammoth:', typeof mammoth !== 'undefined' ? '✓' : '✗');
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
        document.getElementById('btn-back').addEventListener('click', () => {
            if (window.history.length > 1) {
                history.back();
            } else {
                window.close();
            }
        });

        document.getElementById('btn-prev').addEventListener('click', () => {
            this.prevPage();
        });

        document.getElementById('btn-next').addEventListener('click', () => {
            this.nextPage();
        });

        document.getElementById('btn-settings').addEventListener('click', () => {
            this.toggleSettings();
        });

        document.getElementById('btn-toc').addEventListener('click', () => {
            this.toggleToc();
        });

        document.getElementById('btn-fullscreen').addEventListener('click', () => {
            this.toggleFullscreen();
        });

        document.getElementById('toc-close').addEventListener('click', () => {
            this.toggleToc();
        });

        document.getElementById('font-decrease').addEventListener('click', () => {
            this.changeFontSize(-1);
        });

        document.getElementById('font-increase').addEventListener('click', () => {
            this.changeFontSize(1);
        });

        document.getElementById('font-select').addEventListener('change', (e) => {
            this.settings.fontFamily = e.target.value;
            this.applySettings();
            this.saveSettings();
        });

        document.getElementById('line-height-select').addEventListener('change', (e) => {
            this.settings.lineHeight = parseFloat(e.target.value);
            this.applySettings();
            this.saveSettings();
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setTheme(e.target.dataset.theme);
            });
        });

        document.getElementById('retry-btn').addEventListener('click', () => {
            this.loadBookFromUrl();
        });

        document.getElementById('demo-btn').addEventListener('click', () => {
            this.showDemoBook();
        });

        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e);
        });

        document.getElementById('book-content').addEventListener('scroll', () => {
            if (!this.rendition) {
                this.updateProgress();
                this.updatePageInfo();
            }
        });
    }

    async loadBookFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.currentFileUrl = urlParams.get('file');
        this.currentFilename = urlParams.get('filename') || 'Книга';

        console.log('Загрузка файла:', this.currentFileUrl, this.currentFilename);

        if (!this.currentFileUrl) {
            this.showError('URL файла не указан');
            return;
        }

        this.showLoading();
        document.getElementById('book-title').textContent = this.currentFilename;

        try {
            await this.tryLoadFile();
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            this.showError(`Не удалось загрузить файл: ${error.message}`);
        }
    }

    async tryLoadFile() {
        try {
            await this.loadViaFetch(this.currentFileUrl);
            return;
        } catch (fetchError) {
            console.log('Fetch не удался:', fetchError);
            throw new Error(`Не удалось загрузить файл: ${fetchError.message}`);
        }
    }

    async loadViaFetch(fileUrl) {
        console.log('Загружаем через fetch...');
        
        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        console.log('Файл загружен, размер:', blob.size, 'тип:', blob.type);
        
        await this.processBookBlob(blob, fileUrl);
    }

    async processBookBlob(blob, originalUrl) {
        const fileType = this.detectFileType(originalUrl, blob);
        console.log('Определен тип файла:', fileType);

        switch (fileType) {
            case 'epub':
                await this.loadEpub(blob);
                break;
            case 'fb2':
                await this.loadFb2(blob);
                break;
            case 'docx':
                await this.loadDocx(blob);
                break;
            default:
                await this.loadFb2(blob);
        }
    }

    detectFileType(url, blob) {
        const urlLower = url.toLowerCase();
        
        if (urlLower.endsWith('.epub')) return 'epub';
        if (urlLower.endsWith('.fb2')) return 'fb2';
        if (urlLower.endsWith('.docx') || urlLower.endsWith('.doc')) return 'docx';
        
        if (blob.type.includes('epub') || blob.type === 'application/epub+zip') return 'epub';
        if (blob.type.includes('xml') || blob.type === 'text/xml') return 'fb2';
        if (blob.type.includes('word') || blob.type.includes('document') || blob.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
        
        return 'unknown';
    }

    async loadEpub(blob) {
        try {
            console.log('Загружаем EPUB...');
            
            if (typeof ePub === 'undefined') {
                throw new Error('Библиотека EPUB.js не загружена');
            }
            
            // Создаем ArrayBuffer из Blob
            const arrayBuffer = await blob.arrayBuffer();
            
            // Инициализируем EPUB из ArrayBuffer
            this.currentBook = new ePub(arrayBuffer);
            
            // Ждем готовности книги
            await this.currentBook.ready;
            console.log('EPUB книга готова');
            
            // Получаем метаданные
            const metadata = this.currentBook.packaging.metadata;
            const title = metadata.title || this.currentFilename;
            const author = metadata.creator || metadata.author || '';
            
            document.getElementById('book-title').textContent = title;
            
            // Настраиваем контейнер для EPUB
            const contentElement = document.getElementById('book-content');
            contentElement.innerHTML = '<div id="epub-viewer" style="height: 100%; width: 100%;"></div>';
            contentElement.style.padding = '0';
            contentElement.style.margin = '0';
            contentElement.style.maxWidth = 'none';
            contentElement.style.overflow = 'hidden';
            
            // Создаем rendition для отображения
            this.rendition = this.currentBook.renderTo("epub-viewer", {
                width: "100%",
                height: "calc(100vh - 120px)",
                spread: "none",
                flow: "scrolled"
            });
            
            // Настраиваем базовые стили
            this.rendition.themes.default({
                '*': {
                    'box-sizing': 'border-box !important'
                },
                'html, body': {
                    'margin': '0 !important',
                    'padding': '0 !important',
                    'background': 'var(--bg-color) !important',
                    'color': 'var(--text-color) !important',
                    'font-family': `${this.settings.fontFamily} !important`,
                    'font-size': `${this.settings.fontSize}px !important`,
                    'line-height': `${this.settings.lineHeight} !important`
                },
                'body': {
                    'padding': '20px !important',
                    'max-width': '800px !important',
                    'margin': '0 auto !important'
                },
                'p': {
                    'margin-bottom': '1em !important',
                    'line-height': 'inherit !important'
                },
                'h1, h2, h3, h4, h5, h6': {
                    'color': 'inherit !important',
                    'margin-top': '1.5em !important',
                    'margin-bottom': '0.5em !important'
                }
            });
            
            // Применяем текущую тему
            this.applyEpubTheme();
            
            // Отображаем первую страницу
            await this.rendition.display();
            
            // Генерируем оглавление
            await this.generateEpubToc();
            
            this.hideLoading();
            this.showContent();
            
            // Настраиваем обработчики
            this.rendition.on("relocated", (location) => {
                this.updateEpubProgress(location);
            });
            
            // Обработчик изменений размера
            this.rendition.on("resized", () => {
                console.log('Размер изменен');
            });
            
            console.log('EPUB успешно загружен и отображен');
            
        } catch (error) {
            console.error('Ошибка загрузки EPUB:', error);
            this.showEpubError(error);
        }
    }

    applyEpubTheme() {
        if (!this.rendition) return;
        
        const themeStyles = {
            'light': {
                'body': {
                    'background': '#ffffff !important',
                    'color': '#333333 !important'
                }
            },
            'dark': {
                'body': {
                    'background': '#1a1a1a !important',
                    'color': '#e0e0e0 !important'
                }
            },
            'sepia': {
                'body': {
                    'background': '#fbf0d9 !important',
                    'color': '#5f4b32 !important'
                }
            }
        };
        
        const theme = themeStyles[this.settings.theme] || themeStyles.light;
        this.rendition.themes.override('body', theme.body);
    }

    showEpubError(error) {
        this.bookContent = `
            <div class="book-meta">
                <h1>Ошибка загрузки EPUB</h1>
                <p><strong>Файл:</strong> ${this.currentFilename}</p>
                <p><strong>Ошибка:</strong> ${error.message}</p>
                <p><strong>Детали:</strong> ${error.toString()}</p>
                <p>Попробуйте:</p>
                <ul>
                    <li>Другой EPUB файл</li>
                    <li>Формат FB2 или DOCX</li>
                    <li>Перезагрузить расширение</li>
                </ul>
            </div>
            ${this.generateDemoContent()}
        `;
        this.renderBook();
    }

    async loadFb2(blob) {
        try {
            console.log('Загружаем FB2...');
            const text = await blob.text();
            
            let xmlDoc;
            try {
                xmlDoc = new DOMParser().parseFromString(text, "text/xml");
            } catch (e) {
                this.bookContent = this.createSimpleFb2Content(text);
                this.renderBook();
                return;
            }

            const parserError = xmlDoc.getElementsByTagName("parsererror")[0];
            if (parserError) {
                this.bookContent = this.createSimpleFb2Content(text);
                this.renderBook();
                return;
            }

            const titleInfo = xmlDoc.getElementsByTagName('title-info')[0];
            const title = titleInfo?.getElementsByTagName('book-title')[0]?.textContent || this.currentFilename;
            
            let author = 'Неизвестный автор';
            const authorElement = titleInfo?.getElementsByTagName('author')[0];
            if (authorElement) {
                const firstName = authorElement.getElementsByTagName('first-name')[0]?.textContent || '';
                const lastName = authorElement.getElementsByTagName('last-name')[0]?.textContent || '';
                author = `${firstName} ${lastName}`.trim() || author;
            }

            document.getElementById('book-title').textContent = title;

            const body = xmlDoc.getElementsByTagName('body')[0];
            let content = '';

            if (body) {
                content = this.parseFb2Body(body);
            }

            this.bookContent = `
                <div class="book-meta">
                    <h1>${this.escapeHtml(title)}</h1>
                    <p class="author">${this.escapeHtml(author)}</p>
                    <hr>
                </div>
                <div class="fb2-content">
                    ${content || this.generateDemoContent()}
                </div>
            `;
            
            this.renderBook();
            console.log('FB2 успешно загружен');

        } catch (error) {
            console.error('Ошибка парсинга FB2:', error);
            this.showError(`Ошибка чтения FB2: ${error.message}`);
        }
    }

    createSimpleFb2Content(text) {
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 10)
            .slice(0, 50);
            
        const content = lines.map(line => `<p>${this.escapeHtml(line)}</p>`).join('');
        
        return `
            <div class="book-meta">
                <h1>${this.currentFilename}</h1>
                <p class="author">Текст извлечен в упрощенном режиме</p>
                <hr>
            </div>
            <div class="fb2-content">
                ${content || this.generateDemoContent()}
            </div>
        `;
    }

    parseFb2Body(body) {
        let html = '';
        const sections = body.getElementsByTagName('section');
        
        if (sections.length > 0) {
            for (let section of sections) {
                html += this.parseFb2Section(section);
            }
        } else {
            html = this.extractAllText(body);
        }
        
        return html || this.generateDemoContent();
    }

    parseFb2Section(section, level = 1) {
        let sectionHtml = '';
        const title = section.getElementsByTagName('title')[0];
        
        if (title) {
            const headingLevel = Math.min(level + 1, 6);
            sectionHtml += `<h${headingLevel}>${this.escapeHtml(title.textContent)}</h${headingLevel}>`;
        }
        
        const paragraphs = section.getElementsByTagName('p');
        for (let p of paragraphs) {
            if (p.textContent && p.textContent.trim()) {
                sectionHtml += `<p>${this.escapeHtml(p.textContent)}</p>`;
            }
        }
        
        const subSections = section.getElementsByTagName('section');
        for (let subSection of subSections) {
            sectionHtml += this.parseFb2Section(subSection, level + 1);
        }
        
        return sectionHtml;
    }

    extractAllText(element) {
        let text = '';
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let node;
        while (node = walker.nextNode()) {
            const content = node.textContent.trim();
            if (content && content.length > 1) {
                text += `<p>${this.escapeHtml(content)}</p>`;
            }
        }
        
        return text;
    }

    async loadDocx(blob) {
        try {
            console.log('Загружаем DOCX...');
            
            if (typeof mammoth === 'undefined') {
                throw new Error('Библиотека Mammoth не загружена');
            }
            
            const arrayBuffer = await blob.arrayBuffer();
            const result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
            
            document.getElementById('book-title').textContent = this.currentFilename;
            
            this.bookContent = `
                <div class="book-meta">
                    <h1>${this.currentFilename}</h1>
                    <p>Размер: ${this.formatFileSize(blob.size)}</p>
                    <hr>
                </div>
                <div class="docx-content">
                    ${result.value || '<p>Не удалось преобразовать документ</p>'}
                </div>
            `;
            
            this.renderBook();
            console.log('DOCX успешно загружен');
            
        } catch (error) {
            console.error('Ошибка конвертации DOCX:', error);
            this.showError(`Ошибка чтения DOCX: ${error.message}`);
        }
    }

    generateDemoContent() {
        return `
            <h2>Демонстрационная книга</h2>
            <p>Это тестовый контент для проверки работы читалки.</p>
            
            <h3>Поддерживаемые форматы</h3>
            <ul>
                <li><strong>FB2</strong> - полная поддержка</li>
                <li><strong>EPUB</strong> - через EPUB.js</li>
                <li><strong>DOCX/DOC</strong> - через Mammoth.js</li>
            </ul>
            
            <h3>Как тестировать</h3>
            <p>1. Убедитесь, что файл доступен по корректному URL</p>
            <p>2. Для локальных файлов используйте HTTP-сервер: <code>python -m http.server 8000</code></p>
            <p>3. Откройте в браузере: <code>http://localhost:8000/ваш-файл.fb2</code></p>
        `;
    }

    showDemoBook() {
        this.bookContent = `
            <div class="book-meta">
                <h1>Демонстрационная книга</h1>
                <p class="author">Тестовая читалка</p>
                <hr>
            </div>
            ${this.generateDemoContent()}
        `;
        this.renderBook();
    }

    renderBook() {
        const contentElement = document.getElementById('book-content');
        contentElement.innerHTML = this.bookContent;
        
        this.hideLoading();
        this.showContent();
        
        if (!this.rendition) {
            setTimeout(() => {
                this.updatePageInfo();
                this.generateToc();
                this.updateProgress();
            }, 100);
        }
    }

    async generateEpubToc() {
        if (!this.currentBook) return;
        
        try {
            const tocList = document.getElementById('toc-list');
            const navigation = await this.currentBook.loaded.navigation;
            
            if (!navigation || navigation.length === 0) {
                tocList.innerHTML = '<p class="empty">Оглавление недоступно</p>';
                return;
            }
            
            let tocHtml = '';
            navigation.forEach((item, index) => {
                tocHtml += `
                    <div class="toc-item" data-href="${item.href}" data-index="${index}">
                        ${item.label || `Раздел ${index + 1}`}
                    </div>
                `;
            });
            
            tocList.innerHTML = tocHtml;
            
            tocList.querySelectorAll('.toc-item').forEach((item) => {
                item.addEventListener('click', () => {
                    const href = item.getAttribute('data-href');
                    if (this.rendition && href) {
                        this.rendition.display(href);
                    }
                    this.toggleToc();
                });
            });
            
        } catch (error) {
            console.error('Ошибка генерации оглавления EPUB:', error);
            document.getElementById('toc-list').innerHTML = '<p class="empty">Оглавление недоступно</p>';
        }
    }

    updateEpubProgress(location) {
        if (!location) return;
        
        const progressFill = document.getElementById('progress-fill');
        if (progressFill && location.start) {
            const percentage = location.start.percentage || 0;
            progressFill.style.width = `${percentage * 100}%`;
        }
        
        const pageInfo = document.getElementById('page-info');
        if (pageInfo && location.start) {
            const current = location.start.displayed?.current || 1;
            const total = location.start.displayed?.total || 1;
            pageInfo.textContent = `${current} / ${total}`;
        }
    }

    showLoading() {
        this.isLoading = true;
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('book-content').classList.add('hidden');
        document.getElementById('error-message').classList.add('hidden');
    }

    hideLoading() {
        this.isLoading = false;
        document.getElementById('loading').classList.add('hidden');
    }

    showContent() {
        document.getElementById('book-content').classList.remove('hidden');
    }

    showError(message) {
        this.hideLoading();
        document.getElementById('error-text').textContent = message;
        document.getElementById('error-message').classList.remove('hidden');
        document.getElementById('book-content').classList.add('hidden');
    }

    updatePageInfo() {
        if (this.rendition) return;
        
        const content = document.getElementById('book-content');
        const pageInfo = document.getElementById('page-info');
        
        if (content && pageInfo) {
            const visibleHeight = content.clientHeight;
            const totalHeight = content.scrollHeight;
            const scrollTop = content.scrollTop;
            
            if (totalHeight > 0 && visibleHeight > 0) {
                this.totalPages = Math.max(1, Math.ceil(totalHeight / visibleHeight));
                this.currentPage = Math.min(this.totalPages, Math.max(1, 
                    Math.floor(scrollTop / visibleHeight) + 1
                ));
                
                pageInfo.textContent = `${this.currentPage} / ${this.totalPages}`;
            }
        }
    }

    updateProgress() {
        if (this.rendition) return;
        
        const content = document.getElementById('book-content');
        const progressFill = document.getElementById('progress-fill');
        
        if (content && progressFill && content.scrollHeight > content.clientHeight) {
            const progress = (content.scrollTop / (content.scrollHeight - content.clientHeight)) * 100;
            progressFill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        } else if (progressFill) {
            progressFill.style.width = '0%';
        }
    }

    prevPage() {
        if (this.rendition) {
            this.rendition.prev();
        } else {
            const content = document.getElementById('book-content');
            if (content) {
                const pageHeight = content.clientHeight;
                content.scrollBy({ top: -pageHeight, behavior: 'smooth' });
            }
        }
    }

    nextPage() {
        if (this.rendition) {
            this.rendition.next();
        } else {
            const content = document.getElementById('book-content');
            if (content) {
                const pageHeight = content.clientHeight;
                content.scrollBy({ top: pageHeight, behavior: 'smooth' });
            }
        }
    }

    toggleSettings() {
        const panel = document.getElementById('settings-panel');
        panel.classList.toggle('hidden');
    }

    toggleToc() {
        const panel = document.getElementById('toc-panel');
        panel.classList.toggle('hidden');
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log('Ошибка полноэкранного режима:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    changeFontSize(delta) {
        this.settings.fontSize = Math.max(12, Math.min(24, this.settings.fontSize + delta));
        this.applySettings();
        this.saveSettings();
        this.updateFontSizeDisplay();
    }

    updateFontSizeDisplay() {
        document.getElementById('font-size-value').textContent = `${this.settings.fontSize}px`;
    }

    setTheme(theme) {
        this.settings.theme = theme;
        this.applySettings();
        this.saveSettings();
        
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }

    applySettings() {
        const content = document.getElementById('book-content');
        if (content) {
            content.style.fontSize = `${this.settings.fontSize}px`;
            content.style.fontFamily = this.settings.fontFamily;
            content.style.lineHeight = this.settings.lineHeight;
        }
        
        document.documentElement.setAttribute('data-theme', this.settings.theme);
        
        this.updateFontSizeDisplay();
        document.getElementById('font-select').value = this.settings.fontFamily;
        document.getElementById('line-height-select').value = this.settings.lineHeight.toString();
        
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === this.settings.theme);
        });
        
        if (this.rendition) {
            this.rendition.themes.default({
                'body': {
                    'font-size': `${this.settings.fontSize}px !important`,
                    'font-family': `${this.settings.fontFamily} !important`,
                    'line-height': `${this.settings.lineHeight} !important`
                }
            });
            this.applyEpubTheme();
        }
    }

    generateToc() {
        if (this.rendition) return;
        
        const tocList = document.getElementById('toc-list');
        const headings = document.querySelectorAll('#book-content h1, #book-content h2, #book-content h3');
        
        if (headings.length === 0) {
            tocList.innerHTML = '<p class="empty">Оглавление недоступно</p>';
            return;
        }
        
        let tocHtml = '';
        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1));
            const indent = (level - 1) * 20;
            tocHtml += `
                <div class="toc-item" data-index="${index}" style="padding-left: ${indent}px">
                    ${heading.textContent}
                </div>
            `;
        });
        
        tocList.innerHTML = tocHtml;
        
        tocList.querySelectorAll('.toc-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                headings[index].scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
                this.toggleToc();
            });
        });
    }

    handleKeyPress(event) {
        if (event.target.tagName === 'SELECT' || event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT') {
            return;
        }
        
        switch (event.key) {
            case 'ArrowLeft':
            case 'PageUp':
                event.preventDefault();
                this.prevPage();
                break;
                
            case 'ArrowRight':
            case 'PageDown':
            case ' ':
                event.preventDefault();
                this.nextPage();
                break;
                
            case 'Escape':
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
                this.toggleSettings();
                this.toggleToc();
                break;
                
            case 'Home':
                event.preventDefault();
                document.getElementById('book-content').scrollTo({ top: 0, behavior: 'smooth' });
                break;
                
            case 'End':
                event.preventDefault();
                const content = document.getElementById('book-content');
                content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
                break;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Инициализация читалки...');
    window.reader = new EbookReader();
});

document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btn-fullscreen');
    if (!btn) return;
    
    if (document.fullscreenElement) {
        btn.textContent = '⛶';
        btn.title = 'Выйти из полноэкранного режима';
    } else {
        btn.textContent = '⛶';
        btn.title = 'Полный экран';
    }
});