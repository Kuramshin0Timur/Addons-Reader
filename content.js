// Контент-скрипт для перехвата кликов
(function () {
  console.log('Content script loaded');

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (link && link.href) {
      const href = link.href.toLowerCase();
      if (href.match(/\.(epub|fb2|docx|doc)$/)) {
        console.log('Найдена ссылка на книгу:', link.href);
        event.preventDefault();
        event.stopPropagation();

        const filename = link.textContent || link.href.split('/').pop() || 'Книга';
        const openInReader = confirm(`Открыть "${filename}" в читалке?`);

        if (openInReader) {
          chrome.runtime.sendMessage({
            action: 'openInReader',
            url: link.href,
            filename: filename
          });
        }
        return false;
      }
    }
  }, true);
})();