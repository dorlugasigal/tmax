import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTerminalStore } from '../state/terminal-store';

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 240;

const FileExplorer: React.FC = () => {
  const show = useTerminalStore((s) => s.showFileExplorer);
  const focusedId = useTerminalStore((s) => s.focusedTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);
  const focused = focusedId ? terminals.get(focusedId) : null;
  const cwd = focused?.cwd || '';

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [children, setChildren] = useState<Record<string, FileEntry[]>>({});
  const [filter, setFilter] = useState('');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const filterRef = useRef<HTMLInputElement>(null);

  // Load root directory when CWD changes
  useEffect(() => {
    if (!show || !cwd) return;
    setExpanded({});
    setChildren({});
    setFilter('');
    (window.terminalAPI as any).fileList(cwd).then((entries: FileEntry[]) => {
      setFiles(entries.filter((e: FileEntry) => !e.name.startsWith('.')));
    });
  }, [cwd, show]);

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [dirPath]: !prev[dirPath] };
      if (next[dirPath] && !children[dirPath]) {
        (window.terminalAPI as any).fileList(dirPath).then((entries: FileEntry[]) => {
          setChildren((c) => ({ ...c, [dirPath]: entries.filter((e: FileEntry) => !e.name.startsWith('.')) }));
        });
      }
      return next;
    });
  }, [children]);

  const handleFileClick = useCallback((filePath: string) => {
    (window.terminalAPI as any).openPath(filePath);
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setResizing(true);
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + (moveEvent.clientX - startX)));
      setWidth(newWidth);
    };
    const handleMouseUp = () => {
      setResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  if (!show) return null;

  const q = filter.toLowerCase();

  const renderEntry = (entry: FileEntry, depth: number): React.ReactNode => {
    if (q && !entry.name.toLowerCase().includes(q)) {
      // If directory, check if any children match
      if (entry.isDirectory && children[entry.path]) {
        const hasMatch = children[entry.path].some((c) => c.name.toLowerCase().includes(q));
        if (!hasMatch) return null;
      } else if (!entry.isDirectory) {
        return null;
      }
    }

    return (
      <div key={entry.path}>
        <div
          className={`file-entry${entry.isDirectory ? ' dir' : ' file'}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => {
            if (entry.isDirectory) {
              toggleDir(entry.path);
            } else {
              handleFileClick(entry.path);
            }
          }}
        >
          <span className="file-icon">{entry.isDirectory ? (expanded[entry.path] ? '\u25BC' : '\u25B6') : '\u00B7'}</span>
          <span className="file-name">{entry.name}</span>
        </div>
        {entry.isDirectory && expanded[entry.path] && children[entry.path] && (
          <div className="file-children">
            {children[entry.path].map((child) => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const shortCwd = cwd.split(/[/\\]/).pop() || cwd;

  return (
    <div className={`file-explorer-panel${resizing ? ' resizing' : ''}`} style={{ width, minWidth: width }}>
      <div className="file-explorer-resize" onMouseDown={handleResizeStart} />
      <div className="file-explorer-header">
        <span title={cwd}>{shortCwd}</span>
        <button className="dir-panel-close" onClick={() => useTerminalStore.getState().toggleFileExplorer()}>&#10005;</button>
      </div>
      <input
        ref={filterRef}
        className="dir-panel-search"
        type="text"
        placeholder="Filter files..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); e.stopPropagation(); } }}
      />
      <div className="file-explorer-list">
        {files.map((entry) => renderEntry(entry, 0))}
        {files.length === 0 && <div className="dir-panel-empty">No files</div>}
      </div>
    </div>
  );
};

export default FileExplorer;
