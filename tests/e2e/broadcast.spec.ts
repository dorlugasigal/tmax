import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function readDiagLog(userDataDir: string): string {
  const path = join(userDataDir, 'tmax-diag.log');
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function ptyWritesSince(log: string, marker: string): Array<{ id: string; bytes: number }> {
  const idx = log.lastIndexOf(marker);
  const tail = idx >= 0 ? log.slice(idx) : log;
  const results: Array<{ id: string; bytes: number }> = [];
  for (const line of tail.split(/\r?\n/)) {
    if (!line.includes(' pty:write ')) continue;
    const m = line.match(/"id":"([^"]+)","bytes":(\d+)/);
    if (m) results.push({ id: m[1], bytes: parseInt(m[2], 10) });
  }
  return results;
}

async function logMarker(window: Page, marker: string): Promise<void> {
  await window.evaluate((m: string) => (window as any).terminalAPI.diagLog(m), marker);
}

test('broadcast mode sends typed bytes to all tiled terminals', async () => {
  const { window, userDataDir, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    // Create 3 terminals total
    await window.keyboard.press('Control+Shift+n');
    await window.waitForTimeout(300);
    await window.keyboard.press('Control+Shift+n');
    await window.waitForTimeout(300);
    await window.waitForFunction(
      () => document.querySelectorAll('.terminal-panel').length >= 3,
      null, { timeout: 10_000 },
    );

    // Click the first terminal's xterm screen to focus the textarea.
    // Click twice: once to focus the pane, then on the textarea area.
    const screens = await window.$$('.terminal-panel .xterm-screen');
    await screens[0].click();
    await window.waitForTimeout(200);
    await screens[0].click();
    await window.waitForTimeout(400);

    // Sanity: without broadcast, typing goes to focused only
    const marker1 = `e2e:no-bc:${Date.now()}`;
    await logMarker(window, marker1);
    await window.waitForTimeout(150);
    await window.keyboard.type('X');
    await window.waitForTimeout(500);
    const writes1 = ptyWritesSince(readDiagLog(userDataDir), marker1);
    console.log('writes1:', writes1);
    // One 1-byte write (the X) to exactly one PTY
    const oneByteWrites1 = writes1.filter((w) => w.bytes === 1);
    expect(oneByteWrites1.length).toBe(1);

    // Enable broadcast via Ctrl+Shift+A
    await window.keyboard.press('Control+Shift+a');
    await window.waitForTimeout(300);
    const broadcast = await window.evaluate(() => (window as any).__terminalStore.getState().broadcastMode);
    expect(broadcast).toBe(true);

    // Type a character - should fan out to all 3 terminals
    const marker2 = `e2e:bc:${Date.now()}`;
    await logMarker(window, marker2);
    await window.waitForTimeout(100);
    await window.keyboard.type('Y');
    await window.waitForTimeout(500);
    const writes2 = ptyWritesSince(readDiagLog(userDataDir), marker2);
    // Typing one char should produce one 1-byte write per tiled terminal (3 total)
    const oneByteWrites2 = writes2.filter((w) => w.bytes === 1);
    console.log('broadcast 1-byte writes:', oneByteWrites2);
    expect(oneByteWrites2.length).toBe(3);

    // Distinct PTY ids (verify it really fanned out, not just duplicated)
    const distinctIds = new Set(oneByteWrites2.map((w) => w.id));
    expect(distinctIds.size).toBe(3);

    // Disable broadcast via the same shortcut and confirm state flips back.
    await window.keyboard.press('Control+Shift+a');
    await window.waitForTimeout(300);
    const broadcastOff = await window.evaluate(() => (window as any).__terminalStore.getState().broadcastMode);
    expect(broadcastOff).toBe(false);
  } finally {
    await close();
  }
});
