import 'dotenv/config';
import { app, BrowserWindow, globalShortcut, screen } from 'electron';
import { join } from 'path';
import Store from 'electron-store';
import { registerOverlayIpc } from './ipc/overlay.ipc';
import { registerCaptureIpc } from './ipc/capture.ipc';
import { terminateProviderWorkers } from '../ocr/providerRecognize';
import { destroyBrowserFetcher } from '../scraper/browserFetcher';
import { LookupCache } from '../scraper/cache';
import { DEFAULT_OVERLAY_STATE } from '../config/defaults';
import type { OverlayPersistedState } from '../types/overlay';
import type { OverlayMode } from '../types/overlay';
import type { ModeChangePayload } from '../types/ipc';

interface StoreSchema {
  overlay: OverlayPersistedState;
}

const store = new Store<StoreSchema>({
  defaults: { overlay: DEFAULT_OVERLAY_STATE },
});

// 세션 동안 유지되는 LookupResult 캐시 (LRU 200, ADR-017)
const lookupCache = new LookupCache();

let mainWindow: BrowserWindow | null = null;
let currentMode: OverlayMode = 'passive';

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // alwaysOnTop level: 'screen-saver'는 전체화면 게임 위에도 표시됨
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // passive mode 기본값: 게임 클릭 투과
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function registerShortcuts(): void {
  const shortcutKey = store.get('overlay.shortcutKey') as string;

  // Alt+Z (또는 사용자 설정 키): passive ↔ edit 모드 토글
  globalShortcut.register(shortcutKey, () => {
    if (!mainWindow) return;

    currentMode = currentMode === 'passive' ? 'edit' : 'passive';

    if (currentMode === 'edit') {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.focus();
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }

    const payload: ModeChangePayload = { mode: currentMode };
    mainWindow.webContents.send('overlay:modeChange', payload);
  });

  // Alt+C: passive 모드에서 캡처 실행
  // edit 모드 중에는 무시 (위치 조정 중 오발 방지)
  globalShortcut.register('Alt+C', () => {
    if (!mainWindow || currentMode !== 'passive') return;
    mainWindow.webContents.send('capture:shortcut');
  });
}

app.whenReady().then(() => {
  registerOverlayIpc(store);
  registerCaptureIpc(lookupCache);
  createWindow();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  terminateProviderWorkers().catch(() => {});
  destroyBrowserFetcher();
});
