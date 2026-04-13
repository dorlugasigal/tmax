/**
 * PipelineWatcher — watches ~/.tmax/pipeline/ for status JSON files written
 * by the tmax-pipeline-monitor background script. Sends IPC updates to the
 * renderer so the PipelineFooter widget can display live progress.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '../shared/ipc-channels';
import type { PipelineStatus } from '../shared/pipeline-types';
import { diagLog } from './diag-logger';

export class PipelineWatcher {
  private dir: string;
  private watcher: fs.FSWatcher | null = null;
  private lastStatus = new Map<string, string>();

  constructor(private getWindow: () => BrowserWindow | null) {
    this.dir = path.join(app.getPath('home'), '.tmax', 'pipeline');
  }

  /** Ensure the pipeline status directory exists and start watching */
  start(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    this.cleanStaleFiles();
    this.registerIpc();

    try {
      this.watcher = fs.watch(this.dir, { persistent: false }, (eventType, filename) => {
        if (!filename || !filename.endsWith('.json')) return;
        this.handleFileChange(filename);
      });
      diagLog('pipeline:watcher-started', { dir: this.dir });
    } catch (err) {
      diagLog('pipeline:watcher-error', { error: String(err) });
    }

    // Read any existing files on startup
    this.scanExisting();
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private registerIpc(): void {
    ipcMain.on(IPC.PIPELINE_DISMISS, (_event, paneId: string) => {
      // Remove the status file so the monitor knows to stop
      const filePath = path.join(this.dir, `${paneId}.json`);
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Already gone
      }
      this.lastStatus.delete(paneId);
      this.sendToRenderer(paneId, null);
    });
  }

  private scanExisting(): void {
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        this.handleFileChange(file);
      }
    } catch {
      // Dir doesn't exist or read error
    }
  }

  private handleFileChange(filename: string): void {
    const paneId = filename.replace('.json', '');
    const filePath = path.join(this.dir, filename);

    try {
      if (!fs.existsSync(filePath)) {
        // File was deleted — pipeline tracking ended
        this.lastStatus.delete(paneId);
        this.sendToRenderer(paneId, null);
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      // Debounce: skip if content hasn't changed
      if (this.lastStatus.get(paneId) === raw) return;
      this.lastStatus.set(paneId, raw);

      const status: PipelineStatus = JSON.parse(raw);
      this.sendToRenderer(paneId, status);
    } catch {
      // Partial write or invalid JSON — wait for next event
    }
  }

  private sendToRenderer(paneId: string, status: PipelineStatus | null): void {
    const win = this.getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.PIPELINE_STATUS_UPDATE, paneId, status);
    }
  }

  /** Remove status files older than 24 hours */
  private cleanStaleFiles(): void {
    try {
      const files = fs.readdirSync(this.dir);
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(this.dir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          diagLog('pipeline:cleaned-stale', { file });
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
