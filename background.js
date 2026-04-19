// Фоновый скрипт для Firefox
console.log('Читалка EPUB/FB2/DOCX - фоновая страница запущена');

// Обработчик сообщений от popup и content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Получено сообщение:', request.action);

  switch (request.action) {
    case 'openInReader':
      openFileInReader(request.url, request.filename);
      sendResponse({ success: true });
      break;

    case 'getSettings':
      chrome.storage.local.get(['readerSettings'], (result) => {
        sendResponse(result.readerSettings || {});
      });
      return true;

    case 'saveSettings':
      chrome.storage.local.set({ readerSettings: request.settings }, () => {
        sendResponse({ success: true });
      });
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// Функция открытия файла в читалке
function openFileInReader(fileUrl, filename = '') {
  const readerUrl = chrome.runtime.getURL('reader/reader.html') +
    '?file=' + encodeURIComponent(fileUrl) +
    '&filename=' + encodeURIComponent(filename);

  chrome.tabs.create({ url: readerUrl, active: true });
}

// Проверяем доступность webRequest API
if (typeof chrome.webRequest !== 'undefined') {
  // Перехватываем запросы к файлам
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.url.startsWith('http://') || details.url.startsWith('https://')) {
        const url = details.url.toLowerCase();

        if (url.match(/\.(epub|fb2|docx|doc)$/)) {
          console.log('Перехвачен файл:', details.url);
          openFileInReader(details.url);
          return { cancel: true };
        }
      }
      return { cancel: false };
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );
  console.log('WebRequest перехват включен');
} else {
  console.log('WebRequest API недоступен');
}

// Обработчик клика по иконке расширения (Firefox использует browserAction)
if (typeof chrome.browserAction !== 'undefined') {
  chrome.browserAction.onClicked.addListener((tab) => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/popup.html')
    });
  });
} else if (typeof chrome.action !== 'undefined') {
  chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/popup.html')
    });
  });
}

console.log('Фоновая страница инициализирована');