import { test, expect, Page } from '@playwright/test';
import { launchTmax } from './fixtures/launch';

async function getZoomInfo(window: Page): Promise<{ fontSize: number; baseline: number; ratio: number }> {
  return window.evaluate(() => {
    const s = (window as any).__terminalStore.getState();
    const fontSize = s.fontSize;
    const baseline = s.config?.terminal?.fontSize ?? 14;
    return { fontSize, baseline, ratio: Math.round((fontSize / baseline) * 100) };
  });
}

test('Ctrl+= zooms in without writing to the config baseline', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const before = await getZoomInfo(window);
    console.log('before:', before);
    expect(before.ratio).toBe(100); // Must start at 100%

    // Trigger zoomIn twice
    await window.evaluate(() => (window as any).__terminalStore.getState().zoomIn());
    await window.evaluate(() => (window as any).__terminalStore.getState().zoomIn());
    await window.waitForTimeout(200);

    const after = await getZoomInfo(window);
    console.log('after:', after);

    // fontSize should have increased, baseline should NOT have increased
    expect(after.fontSize).toBe(before.fontSize + 2);
    expect(after.baseline).toBe(before.baseline); // THIS IS THE FIX
    expect(after.ratio).toBeGreaterThan(100);
  } finally {
    await close();
  }
});

test('Ctrl+Shift+= (pressing + physically) triggers zoomIn', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const before = await getZoomInfo(window);
    // Control+Shift+Equal is what Playwright synthesizes as pressing the + key
    // (event.key='+', shiftKey=true) - matches what a real user sees when pressing Ctrl++
    await window.keyboard.press('Control+Shift+Equal');
    await window.waitForTimeout(200);

    const after = await getZoomInfo(window);
    expect(after.fontSize).toBe(before.fontSize + 1);
  } finally {
    await close();
  }
});

test('Ctrl+= (no Shift) still triggers zoomIn', async () => {
  const { window, close } = await launchTmax();
  try {
    await window.waitForSelector('.terminal-panel', { timeout: 15_000 });
    await window.waitForTimeout(500);

    const before = await getZoomInfo(window);
    await window.keyboard.press('Control+=');
    await window.waitForTimeout(200);

    const after = await getZoomInfo(window);
    expect(after.fontSize).toBe(before.fontSize + 1);
  } finally {
    await close();
  }
});
