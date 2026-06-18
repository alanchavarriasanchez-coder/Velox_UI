import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SplashScreen from './components/SplashScreen';
import { appDataDir, join } from '@tauri-apps/plugin-path';
import { BaseDirectory, writeTextFile, readTextFile, mkdir, exists, remove, readDir } from '@tauri-apps/plugin-fs';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

async function loadSessions(): Promise<ChatSession[]> {
  try {
    // Ensure chats folder exists
    const chatsDir = 'chats';
    const dirExists = await exists(chatsDir, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir(chatsDir, { baseDir: BaseDirectory.AppData });
    }

    // Read directory contents
    const entries = await readDir(chatsDir, { baseDir: BaseDirectory.AppData });
    const sessions: ChatSession[] = [];

    for (const entry of entries) {
      if (entry.name && entry.name.endsWith('.json')) {
        const filePath = await join(chatsDir, entry.name);
        const data = await readTextFile(filePath, { baseDir: BaseDirectory.AppData });
        const session = JSON.parse(data) as ChatSession;
        sessions.push(session);
      }
    }

    // Sort by updatedAt descending
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  } catch {
    return [];
  }
}

async function saveSessions(sessions: ChatSession[]): Promise<void> {
  const chatsDir = 'chats';
  // Ensure directory exists
  const dirExists = await exists(chatsDir, { baseDir: BaseDirectory.AppData });
  if (!dirExists) {
    await mkdir(chatsDir, { baseDir: BaseDirectory.AppData });
  }

  // Write each session as its own file
  for (const session of sessions) {
    const filePath = await join(chatsDir, `${session.id}.json`);
    const data = JSON.stringify(session, null, 2);
    await writeTextFile(filePath, data, { baseDir: BaseDirectory.AppData });
  }

  // Optionally remove files for sessions that no longer exist
  // (not implemented for now)
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const isFirstRender = useRef(true);

  // Cargar sesiones al montar
  useEffect(() => {
    (async () => {
      const loaded = await loadSessions();
      setSessions(loaded);
      // Si hay sesiones, seleccionar la más reciente
      if (loaded.length > 0) {
        const sorted = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt);
        setCurrentSessionId(sorted[0].id);
      } else {
        // Crear sesión por defecto
        const defaultSession: ChatSession = {
          id: crypto.randomUUID(),
          title: 'Nuevo Chat',
          messages: [{ role: 'assistant', content: '¡Hola! Soy VeloxUI. ¿En qué puedo ayudarte?' }],
          updatedAt: Date.now(),
        };
        setSessions([defaultSession]);
        setCurrentSessionId(defaultSession.id);
      }
    })();
  }, []);

  // Persistir cada vez que cambien las sesiones (excepto la primera carga)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (sessions.length > 0) {
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
    const updated = [...sessions, newSession];
    setSessions(updated);
    setCurrentSessionId(newSession.id);
  }, [sessions]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null;

  const setMessagesForCurrentSession = useCallback(
    (value: Message[] | ((prev: Message[]) => Message[])) => {
      if (!currentSession) return;
      const newMessages = typeof value === 'function' ? value(currentSession.messages) : value;
      const updatedSessions = sessions.map((s) =>
        s.id === currentSession.id
          ? { ...s, messages: newMessages, updatedAt: Date.now() }
          : s
      );
      setSessions(updatedSessions);
    },
    [sessions, currentSession]
  );

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
    <div className="h-screen w-screen overflow-hidden bg-neutral-900 text-white flex">
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
      />
      <ChatArea
        messages={currentSession?.messages ?? []}
        setMessages={setMessagesForCurrentSession}
      />
    </div>
  );
}
