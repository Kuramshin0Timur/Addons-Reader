// Контент-скрипт для перехвата кликов на файлы
document.addEventListener('click', (event) => {
  const link = event.target.closest('a');
  if (link && link.href) {
    const href = link.href.toLowerCase();

    // Проверяем, ведет ли ссылка на поддерживаемый файл
    if (href.match(/\.(epub|fb2|docx|doc)$/)) {
      console.log('Найдена ссылка на книгу:', link.href);

      // Предлагаем открыть в читалке
      event.preventDefault();
      event.stopPropagation();

      const openInReader = confirm('Открыть этот файл в читалке?');
      if (openInReader) {
        // Отправляем сообщение фоновому скрипту
        chrome.runtime.sendMessage({
          action: 'openInReader',
          url: link.href,
          filename: link.textContent || 'Книга'
        });
      }

      return false;
    }
  }
}, true);