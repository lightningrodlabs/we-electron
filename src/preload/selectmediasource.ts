// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getMediaSources: () => ipcRenderer.invoke('get-media-sources'),
  sourceSelected: (id: string) => ipcRenderer.invoke('source-selected', id),
});
