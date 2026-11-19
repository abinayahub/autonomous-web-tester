/**
 * Chromium launch with real diagnostics.
 *
 * Playwright reports a crashed browser start as "Target page, context or browser has been closed" followed by the
 * whole command line. We capture Playwright's own browser log (which contains the process exit code), translate the
 * known Windows/Linux failure codes into a sentence a user can act on, and keep the full log for the server logs.
 * Every run gets a fresh browser with a temporary profile (never the user's Chrome profile).
 */
import os from 'node:os';
import { chromium, type Browser, type LaunchOptions } from 'playwright';

export class BrowserLaunchError extends Error {
  constructor(
    /** One readable sentence for the UI (no command lines). */
    message: string,
    /** Full Playwright/Chromium log for server logs and run events. */
    readonly details: string,
    readonly exitCode?: number,
  ) {
    super(message);
    this.name = 'BrowserLaunchError';
  }
}

const KNOWN: Record<number, string> = {
  0xc0000142: 'Windows could not initialise it (error 0xC0000142, DLL initialisation failed). This happens when the worker process has lost its Windows session or console — restart the worker (npm run dev).',
  0xc0000005: 'it crashed on start-up (error 0xC0000005, access violation). Security software or a damaged browser install can cause this — reinstall it with: npx playwright install chromium.',
  0xc0000409: 'it crashed on start-up (error 0xC0000409). Reinstall it with: npx playwright install chromium.',
  0xc0000022: 'Windows denied it access (error 0xC0000022). Check antivirus / folder permissions for the ms-playwright folder.',
  0xc0000135: 'a required system library is missing (error 0xC0000135). Reinstall it with: npx playwright install chromium.',
  0xc000012d: 'the computer ran out of memory while starting it (error 0xC000012D). Close other programs and try again.',
  0xc0000017: 'the computer ran out of memory while starting it (error 0xC0000017). Close other programs and try again.',
};

/** Readable reason for a failed browser start (exported for tests). */
export function explainLaunchFailure(exitCode: number | undefined, log: string): string {
  if (exitCode !== undefined && KNOWN[exitCode >>> 0]) return KNOWN[exitCode >>> 0]!;
  if (/Executable doesn't exist|ENOENT/i.test(log)) return 'the Chromium browser is not installed. Install it with: npx playwright install chromium.';
  if (/Timeout .* exceeded/i.test(log)) return 'it did not start within the time limit. The computer may be overloaded — close other programs and try again.';
  if (exitCode !== undefined) return `it exited immediately (exit code ${exitCode >>> 0 > 0xffff ? `0x${(exitCode >>> 0).toString(16).toUpperCase()}` : exitCode}).`;
  return 'it closed immediately after starting.';
}

/** Launches Chromium; on failure throws BrowserLaunchError with a readable reason and the full diagnostic log. */
export async function launchChromium(opts: LaunchOptions = {}): Promise<Browser> {
  const log: string[] = [];
  const logger = { isEnabled: (name: string) => name === 'browser', log: (_n: string, _s: string, msg: string | Error) => void log.push(String(msg)) };
  const attempt = (channel?: string) =>
    chromium.launch({ timeout: 60_000, ...opts, ...(channel ? { channel } : {}), logger });
  try {
    return await attempt();
  } catch (first) {
    // Second try with the full Chromium build instead of the headless shell (different executable).
    try {
      return await attempt('chromium');
    } catch (second) {
      const text = [log.join('\n'), (first as Error).message, (second as Error).message].join('\n');
      const codes = [...text.matchAll(/exitCode=(-?\d+)/g)].map((m) => Number(m[1]));
      const exitCode = codes.at(-1);
      const free = Math.round(os.freemem() / 1024 / 1024);
      const reason = explainLaunchFailure(exitCode, text);
      throw new BrowserLaunchError(
        `The test browser (Chromium) could not start: ${reason}`,
        `${text}\n[diagnostics] free memory ${free} MB of ${Math.round(os.totalmem() / 1024 / 1024)} MB; platform ${process.platform} ${os.release()}; node ${process.version}`,
        exitCode,
      );
    }
  }
}
