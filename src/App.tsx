import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SplashScreen from './components/SplashScreen';
import { join } from '@tauri-apps/api/path';
import { BaseDirectory, writeTextFile, readTextFile, mkdir, exists, remove, readDir } from '@tauri-apps/plugin-fs';

function isTauri(): boolean {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  streaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  usageTokens?: number; // <-- Nueva propiedad opcional
}

async function loadSessions(): Promise<ChatSession[]> {
  if (!isTauri()) {
    return [];
  }
  try {
    const chatsDir = 'chats';
    const dirExists = await exists(chatsDir, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir(chatsDir, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    const entries = await readDir(chatsDir, { baseDir: BaseDirectory.AppData });
    const sessions: ChatSession[] = [];

    for (const entry of entries) {
      if (entry.name && entry.name.endsWith('.json')) {
        const filePath = await join(chatsDir, entry.name);
        const data = await readTextFile(filePath, { baseDir: BaseDirectory.AppData });
        const session = JSON.parse(data) as ChatSession;
        // usageTokens se conserva automáticamente si existe en el JSON
        sessions.push(session);
      }
    }

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  } catch (err) {
    console.error('Error cargando sesiones:', err);
    return [];
  }
}

async function saveSessions(sessions: ChatSession[]): Promise<void> {
  if (!isTauri()) {
    return;
  }
  try {
    const chatsDir = 'chats';
    const dirExists = await exists(chatsDir, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir(chatsDir, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    for (const session of sessions) {
      const filePath = await join(chatsDir, `${session.id}.json`);
      const data = JSON.stringify(session, null, 2); // usageTokens se incluirá si no es undefined
      await writeTextFile(filePath, data, { baseDir: BaseDirectory.AppData });
    }
  } catch (err) {
    console.error('Error guardando sesiones:', err);
  }
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const isFirstRender = useRef(true);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [backendIp, setBackendIp] = useState<string>(() => {
    return localStorage.getItem('veloxui_backend_ip') || 'localhost';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [maxTokens, setMaxTokens] = useState<number>(32768);

  const handleSaveSettings = (newIp: string) => {
    setBackendIp(newIp);
    localStorage.setItem('veloxui_backend_ip', newIp);
    setIsSettingsOpen(false);
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null;

  useEffect(() => {
    (async () => {
      const loaded = await loadSessions();
      setSessions(loaded);
      
      if (loaded.length > 0) {
        const sorted = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt);
        setCurrentSessionId(sorted[0].id);
      } else {
        const defaultSession: ChatSession = {
          id: crypto.randomUUID(),
          title: 'Nuevo Chat',
          messages: [{ role: 'assistant', content: '¡Hola! Soy VeloxUI. ¿En qué puedo ayudarte?' }],
          updatedAt: Date.now(),
        };
        setSessions([defaultSession]);
        setCurrentSessionId(defaultSession.id);
        saveSessions([defaultSession]);
      }
    })();
  }, []);

  useEffect(() => {
    const fetchActiveMaxTokens = async () => {
      try {
        const res = await fetch(`http://${backendIp}:8000/v1/models`);
        const data = await res.json();
        if (data.active_max_context_tokens) {
          setMaxTokens(data.active_max_context_tokens);
        }
      } catch (err) {
        console.error('Error al obtener active_max_context_tokens', err);
      }
    };
    fetchActiveMaxTokens();
  }, [backendIp]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const isAnyMessageStreaming = sessions.some((s) => 
      s.messages.some((m) => m.streaming)
    );

    if (sessions.length > 0 && !isAnyMessageStreaming) {
      saveSessions(sessions);
    }
  }, [sessions]);

  const handleNewChat = useCallback(() => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: 'Nuevo Chat',
      messages: [{ role: 'assistant', content: '¡Hola! Soy VeloxUI. ¿En qué puedo ayudarte?' }],
      updatedAt: Date.now(),
    };
    setSessions((prev) => [...prev, newSession]);
    setCurrentSessionId(newSession.id);
  }, []);

  const handleSelectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const handleFirstUserMessage = useCallback((userMessage: string) => {
    if (!currentSession) return;
    if (currentSession.title === 'Nuevo Chat') {
      const newTitle = userMessage.trim().slice(0, 30);
      setSessions((prevSessions) =>
        prevSessions.map((s) =>
          s.id === currentSession.id
            ? { ...s, title: newTitle, updatedAt: Date.now() }
            : s
        )
      );
    }
  }, [currentSession]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (isTauri()) {
      try {
        const filePath = await join('chats', `${sessionId}.json`);
        await remove(filePath, { baseDir: BaseDirectory.AppData });
      } catch (err) {
        console.error('Error eliminando archivo de sesión:', err);
      }
    }

    const updatedSessions = sessions.filter((s) => s.id !== sessionId);
    setSessions(updatedSessions);

    if (sessionId === currentSessionId) {
      if (updatedSessions.length > 0) {
        const sorted = [...updatedSessions].sort((a, b) => b.updatedAt - a.updatedAt);
        setCurrentSessionId(sorted[0].id);
      } else {
        const defaultSession: ChatSession = {
          id: crypto.randomUUID(),
          title: 'Nuevo Chat',
          messages: [{ role: 'assistant', content: '¡Hola! Soy VeloxUI. ¿En qué puedo ayudarte?' }],
          updatedAt: Date.now(),
        };
        setSessions([defaultSession]);
        setCurrentSessionId(defaultSession.id);
        saveSessions([defaultSession]);
      }
    }
  }, [sessions, currentSessionId]);

  const setMessagesForCurrentSession = useCallback(
    (value: Message[] | ((prev: Message[]) => Message[])) => {
      setSessions((prevSessions) => {
        const current = prevSessions.find((s) => s.id === currentSessionId);
        if (!current) return prevSessions;
        const newMessages = typeof value === 'function' ? value(current.messages) : value;
        return prevSessions.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: newMessages, updatedAt: Date.now() }
            : s
        );
      });
    },
    [currentSessionId]
  );

  // <-- Nuevo callback para persistir tokens de la sesión activa, llamando directamente a saveSessions
  const handleUpdateUsage = useCallback((tokens: number) => {
    setSessions((prevSessions) => {
      const newSessions = prevSessions.map((s) =>
        s.id === currentSessionId
          ? { ...s, usageTokens: tokens, updatedAt: Date.now() }
          : s
      );
      // Persistir inmediatamente
      saveSessions(newSessions);
      return newSessions;
    });
  }, [currentSessionId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-900 text-white flex relative">
      <div className={`${isSidebarOpen ? 'flex' : 'hidden'} md:flex absolute md:relative z-40 h-full w-64`}>
        <Sidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onNewChat={handleNewChat}
          onSelectSession={(id) => {
            handleSelectSession(id);
            setIsSidebarOpen(false);
          }}
          onDeleteSession={handleDeleteSession}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
        />
      )}

      <ChatArea
        messages={currentSession?.messages ?? []}
        setMessages={setMessagesForCurrentSession}
        onFirstUserMessage={handleFirstUserMessage}
        onDeleteCurrentSession={() => currentSessionId && handleDeleteSession(currentSessionId)}
        backendIp={backendIp}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        maxTokens={maxTokens}
        onUpdateUsage={handleUpdateUsage} // <-- Prop renombrada
      />

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
            <h3 className="font-mono text-sm font-medium text-neutral-200 mb-3">Configuración de Red</h3>
            <label className="block font-mono text-[11px] text-neutral-500 uppercase mb-1">
              IP del Servidor (PC)
            </label>
            <input
              type="text"
              defaultValue={backendIp}
              id="settings-ip-input"
              placeholder="Ej: 100.117.217.49"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-xs text-neutral-100 outline-none focus:border-neutral-700"
            />
            <div className="mt-4 flex justify-end gap-2 text-xs font-mono">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-md px-3 py-1.5 text-neutral-400 hover:bg-neutral-900"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const inputEl = document.getElementById('settings-ip-input') as HTMLInputElement;
                  if (inputEl) handleSaveSettings(inputEl.value.trim());
                }}
                className="rounded-md bg-emerald-500/10 px-3 py-1.5 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
