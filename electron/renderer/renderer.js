const SEARCH_URL = 'https://duckduckgo.com/?q=';

const dom = {
  backButton: document.getElementById('back-button'),
  forwardButton: document.getElementById('forward-button'),
  reloadButton: document.getElementById('reload-button'),
  dashboardButton: document.getElementById('dashboard-button'),
  settingsButton: document.getElementById('settings-button'),
  popupButton: document.getElementById('popup-button'),
  newWindowButton: document.getElementById('new-window-button'),
  helpButton: document.getElementById('help-button'),
  locationForm: document.getElementById('location-form'),
  locationInput: document.getElementById('location-input'),
  browserView: document.getElementById('browser-view'),
  extensionPill: document.getElementById('extension-pill'),
  statusBanner: document.getElementById('status-banner'),
};

let bootstrap = null;

function normalizeInput(rawInput) {
  const value = `${rawInput || ''}`.trim();
  if (!value) return 'https://violentmonkey.github.io/';
  if (/^(https?|file|chrome-extension):/i.test(value)) {
    return value;
  }
  if (value.includes(' ') || !value.includes('.')) {
    return `${SEARCH_URL}${encodeURIComponent(value)}`;
  }
  return `https://${value}`;
}

function navigateTo(value) {
  const url = normalizeInput(value);
  dom.locationInput.value = url;
  dom.browserView.loadURL(url);
}

function updateNavButtons() {
  dom.backButton.disabled = !dom.browserView.canGoBack();
  dom.forwardButton.disabled = !dom.browserView.canGoForward();
}

function updateTitle() {
  const pageTitle = dom.browserView.getTitle();
  window.vmShell.updateTitle(pageTitle);
}

function showStatus(message) {
  dom.statusBanner.hidden = !message;
  dom.statusBanner.textContent = message || '';
}

function setExtensionLoaded(loaded) {
  dom.extensionPill.textContent = loaded
    ? `Extension loaded: ${bootstrap.extensionId}`
    : 'Extension not available';
  dom.extensionPill.classList.toggle('is-error', !loaded);
}

function bindWebviewEvents() {
  dom.browserView.addEventListener('did-start-loading', () => {
    dom.reloadButton.textContent = '...';
  });

  dom.browserView.addEventListener('did-stop-loading', () => {
    dom.reloadButton.textContent = '\u21bb';
    dom.locationInput.value = dom.browserView.getURL();
    updateNavButtons();
    updateTitle();
  });

  dom.browserView.addEventListener('did-navigate', event => {
    dom.locationInput.value = event.url;
    showStatus('');
    updateNavButtons();
    updateTitle();
  });

  dom.browserView.addEventListener('did-navigate-in-page', event => {
    dom.locationInput.value = event.url;
    updateNavButtons();
    updateTitle();
  });

  dom.browserView.addEventListener('page-title-updated', () => {
    updateTitle();
  });

  dom.browserView.addEventListener('did-fail-load', event => {
    if (event.errorCode === -3) return;
    showStatus(`Unable to load ${event.validatedURL || dom.locationInput.value}: ${event.errorDescription}`);
  });

  dom.browserView.addEventListener('new-window', event => {
    window.vmShell.openBrowserWindow(event.url);
  });
}

function bindUi() {
  dom.backButton.addEventListener('click', () => {
    if (dom.browserView.canGoBack()) dom.browserView.goBack();
  });
  dom.forwardButton.addEventListener('click', () => {
    if (dom.browserView.canGoForward()) dom.browserView.goForward();
  });
  dom.reloadButton.addEventListener('click', () => {
    dom.browserView.reload();
  });
  dom.dashboardButton.addEventListener('click', () => {
    window.vmShell.openExtensionPage('dashboard');
  });
  dom.settingsButton.addEventListener('click', () => {
    window.vmShell.openExtensionPage('settings');
  });
  dom.popupButton.addEventListener('click', () => {
    window.vmShell.openExtensionPage('popup');
  });
  dom.newWindowButton.addEventListener('click', () => {
    window.vmShell.openBrowserWindow(dom.browserView.getURL() || bootstrap.initialUrl);
  });
  dom.helpButton.addEventListener('click', () => {
    window.vmShell.openExternal('https://violentmonkey.github.io/');
  });

  dom.locationForm.addEventListener('submit', event => {
    event.preventDefault();
    navigateTo(dom.locationInput.value);
  });

  window.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') {
      dom.locationInput.focus();
      dom.locationInput.select();
      event.preventDefault();
    }
  });

  window.vmShell.onCommand(({ command }) => {
    if (command === 'back' && dom.browserView.canGoBack()) {
      dom.browserView.goBack();
    } else if (command === 'forward' && dom.browserView.canGoForward()) {
      dom.browserView.goForward();
    } else if (command === 'reload') {
      dom.browserView.reload();
    } else if (command === 'focus-location') {
      dom.locationInput.focus();
      dom.locationInput.select();
    }
  });
}

async function bootstrapShell() {
  bootstrap = await window.vmShell.getBootstrap();
  setExtensionLoaded(Boolean(bootstrap.extensionId));
  bindUi();
  bindWebviewEvents();
  navigateTo(bootstrap.initialUrl);
}

bootstrapShell().catch(error => {
  setExtensionLoaded(false);
  showStatus(`${error}`);
});
