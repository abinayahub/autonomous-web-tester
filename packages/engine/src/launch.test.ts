import { describe, expect, it } from 'vitest';
import { cleanErrorMessage } from '@awt/db';
import { explainLaunchFailure } from './launch.js';

describe('browser start-up errors', () => {
  it('explains the Windows 0xC0000142 exit code seen when the worker lost its session', () => {
    expect(explainLaunchFailure(3221225794, '')).toMatch(/0xC0000142.*restart the worker/);
  });
  it('explains a missing browser install', () => {
    expect(explainLaunchFailure(undefined, "Executable doesn't exist at /ms-playwright/chromium/chrome.exe")).toMatch(/npx playwright install chromium/);
  });
  it('keeps Chromium command lines and call logs out of the stored run error', () => {
    const raw = 'browserType.launch: Target page, context or browser has been closed\nBrowser logs:\n\n<launching> C:\chrome.exe --disable-gpu --flag\n<launched> pid=1\nCall log:\n  - <launching> ...';
    expect(cleanErrorMessage(raw)).toBe('browserType.launch: Target page, context or browser has been closed');
  });
});
