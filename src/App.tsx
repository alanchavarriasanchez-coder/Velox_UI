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
  id?: string; // ID opcional para identificar mensajes específicos
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
}

// Carga las sesiones desde el directorio local de la App
async function loadSessions(): Promise<ChatSession[]> {
  if (!isTauri()) {
    return [];
  }
  try {
    const chatsDir = 'chats';
    const dirExists = await exists(chatsDir, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      // CORRECCIÓN: Se agrega recursive: true para evitar fallos si la carpeta principal no existe
      await mkdir(chatsDir, { baseDir: BaseDirectory.AppData, recursive: true });
    }

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

    // Ordenar por última modificación (más reciente primero)
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  } catch (err) {
    console.error('Error cargando sesiones:', err);
    return [];
  }
}

// Guarda las sesiones de forma individual en formato JSON
async function saveSessions(sessions: ChatSession[]): Promise<void> {
  if (!isTauri()) {
    return;
  }
  try {
    const chatsDir = 'chats';
    const dirExists = await exists(chatsDir, { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      // CORRECCIÓN: Se agrega recursive: true aquí también
      await mkdir(chatsDir, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    for (const session of sessions) {
      const filePath = await join(chatsDir, `${session.id}.json`);
      const data = JSON.stringify(session, null, 2);
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

  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null;

  // Cargar sesiones al montar la aplicación
  useEffect(() => {
    (async () => {
      const loaded = await loadSessions();
      setSessions(loaded);
      
      if (loaded.length > 0) {
        // Seleccionar el chat más reciente por defecto
        const sorted = [...loaded].sort((a, b) => b.updatedAt - a.updatedAt);
        setCurrentSessionId(sorted[0].id);
      } else {
        // Crear sesión por defecto si el historial está vacío
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

  // Persistir cambios en el disco duro (Evitando saturación por streaming)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // CORRECCIÓN: Bloqueamos la escritura en I/O si hay tokens transmitiéndose activamente
    const isAnyMessageStreaming = sessions.some((s) => 
      s.messages.some((m) => m.streaming)
    );

    if (sessions.length > 0 && !isAnyMessageStreaming) {
      saveSessions(sessions);
    }
  }, [sessions]);

  // Manejador para crear un nuevo chat limpio
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

  // Seleccionar una conversación del historial
  const handleSelectSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
  }, []);

  // Cambiar dinámicamente el título del chat basado en el primer mensaje del usuario
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

  // Eliminar conversación del estado y borrar archivo físico del disco
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

    // Si borramos el chat en vista activa, redirigimos la interfaz
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

  // Mutador de mensajes seguro para sincronizar el streaming desde ChatArea
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

  // Temporizador para desmontar la pantalla de carga inicial (Splash Screen)
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
        onDeleteSession={handleDeleteSession}
      />
      <ChatArea
        messages={currentSession?.messages ?? []}
        setMessages={setMessagesForCurrentSession}
        onFirstUserMessage={handleFirstUserMessage}
        // CORRECCIÓN: Inyección del callback para disparar el borrado del chat actual desde el Header
        onDeleteCurrentSession={() => currentSessionId && handleDeleteSession(currentSessionId)}
      />
    </div>
  );
}
