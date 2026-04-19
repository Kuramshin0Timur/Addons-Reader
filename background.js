// Фоновый скрипт для Firefox (Manifest V2)
console.log('Читалка - фоновая страница запущена');

// Обработчик сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Получено сообщение:', request.action);

  switch (request.action) {
    case 'openInReader':
      openFileInReader(request.url, request.filename);
      sendResponse({ success: true });
      break;

    case 'openBlobInReader':
      openBlobInReader(request.url, request.filename);
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
  return false;
});

function openFileInReader(fileUrl, filename = '') {
  const readerUrl = chrome.runtime.getURL('reader/reader.html') +
    '?file=' + encodeURIComponent(fileUrl) +
    '&filename=' + encodeURIComponent(filename);

  chrome.tabs.create({ url: readerUrl, active: true });
}

function openBlobInReader(blobUrl, filename = '') {
  console.log('Открытие blob URL в Firefox:', blobUrl);

  const readerUrl = chrome.runtime.getURL('reader/reader.html') +
    '?file=' + encodeURIComponent(blobUrl) +
    '&filename=' + encodeURIComponent(filename);

  chrome.tabs.create({ url: readerUrl, active: true });

  // Очистка blob URL через 10 секунд
  setTimeout(() => {
    try {
      URL.revokeObjectURL(blobUrl);
      console.log('Blob URL очищен:', blobUrl);
    } catch (e) {
      console.warn('Не удалось очистить blob URL:', e);
    }
  }, 10000);
}

// Обработчик клика по иконке
if (chrome.browserAction) {
  chrome.browserAction.onClicked.addListener(() => {
    const url = chrome.runtime.getURL('popup/popup.html');
    chrome.tabs.create({ url: url });
  });
}

console.log('Фоновая страница инициализирована');