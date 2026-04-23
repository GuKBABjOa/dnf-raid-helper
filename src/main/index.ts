import 'dotenv/config';
import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { join } from 'path';
import Store from 'electron-store';
import { registerOverlayIpc } from './ipc/overlay.ipc';
import { registerCaptureIpc } from './ipc/capture.ipc';
import { terminateProviderWorkers } from '../ocr/providerRecognize';
import { destroyBrowserFetcher } from '../scraper/browserFetcher';
import { setInviteCode, setDevMode } from '../ocr/providers';
import { LookupCache } from '../scraper/cache';
import { DEFAULT_OVERLAY_STATE } from '../config/defaults';
import type { OverlayPersistedState } from '../types/overlay';
import type { OverlayMode } from '../types/overlay';
import type { ModeChangePayload } from '../types/ipc';

interface StoreSchema {
  overlay: OverlayPersistedState;
  inviteCode: string | null;
}

const store = new Store<StoreSchema>({
  defaults: { overlay: DEFAULT_OVERLAY_STATE, inviteCode: null },
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

  // Alt+Q: 앱 종료
  globalShortcut.register('Alt+Q', () => {
    app.quit();
  });

  // Alt+C: passive 모드에서 캡처 실행
  // edit 모드 중에는 무시 (위치 조정 중 오발 방지)
  globalShortcut.register('Alt+C', () => {
    if (!mainWindow || currentMode !== 'passive') return;
    mainWindow.webContents.send('capture:shortcut');
  });
}

function registerSettingsIpc(): void {
  ipcMain.handle('settings:getInviteCode', () => {
    // 패키지 앱이 아닐 때만 dev 모드 → SetupModal 생략
    if (!app.isPackaged && process.env['ANTHROPIC_API_KEY']) return '__dev__';
    return store.get('inviteCode') ?? null;
  });

  ipcMain.handle('settings:setInviteCode', (_event, code: string) => {
    store.set('inviteCode', code);
    setInviteCode(code);
    // 초대코드 저장 후 passive 모드로 전환
    if (mainWindow) {
      currentMode = 'passive';
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
      const payload: ModeChangePayload = { mode: 'passive' };
      mainWindow.webContents.send('overlay:modeChange', payload);
    }
  });
}

app.whenReady().then(() => {
  setDevMode(!app.isPackaged);

  // 저장된 초대코드가 있으면 OCR 프로바이더에 미리 주입
  const savedCode = store.get('inviteCode') ?? null;
  if (savedCode) setInviteCode(savedCode);

  registerOverlayIpc(store as Parameters<typeof registerOverlayIpc>[0]);
  registerCaptureIpc(lookupCache);
  registerSettingsIpc();
  createWindow();

  // 초대코드가 없으면 setup을 위해 창을 interactive하게 유지
  if (!savedCode && mainWindow) {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.focus();
  }

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
