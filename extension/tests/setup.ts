/* ============================================================
   LinkedApply Pro — Test Setup
   Mocks for chrome.* APIs used in unit tests
   ============================================================ */

// Mock chrome.storage
const storageData: Record<string, any> = {};

const chromeMock = {
  storage: {
    local: {
      get: jest.fn((keys: string | string[]) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        const result: Record<string, any> = {};
        keyList.forEach((k) => {
          if (storageData[k] !== undefined) result[k] = storageData[k];
        });
        return Promise.resolve(result);
      }),
      set: jest.fn((items: Record<string, any>) => {
        Object.assign(storageData, items);
        return Promise.resolve();
      }),
      remove: jest.fn((keys: string | string[]) => {
        const keyList = typeof keys === 'string' ? [keys] : keys;
        keyList.forEach((k) => delete storageData[k]);
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    getManifest: jest.fn(() => ({ version: '1.0.0' })),
    sendMessage: jest.fn(() => Promise.resolve()),
    onMessage: { addListener: jest.fn() },
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
    onInstalled: { addListener: jest.fn() },
  },
  alarms: {
    create: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve(true)),
    onAlarm: { addListener: jest.fn() },
  },
  notifications: {
    create: jest.fn(() => Promise.resolve('test-notification')),
    clear: jest.fn(() => Promise.resolve(true)),
    onButtonClicked: { addListener: jest.fn() },
  },
  tabs: {
    query: jest.fn(() => Promise.resolve([])),
    create: jest.fn(() => Promise.resolve({ id: 1 })),
    sendMessage: jest.fn(() => Promise.resolve()),
  },
  sidePanel: {
    setPanelBehavior: jest.fn(() => Promise.resolve()),
    open: jest.fn(() => Promise.resolve()),
  },
};

// @ts-ignore
global.chrome = chromeMock;

// Mock import.meta.env
// @ts-ignore
global.import = { meta: { env: { VITE_BACKEND_URL: 'http://localhost:3000' } } };

// Clear storage between tests
beforeEach(() => {
  Object.keys(storageData).forEach((k) => delete storageData[k]);
  jest.clearAllMocks();
});

export { storageData, chromeMock };
