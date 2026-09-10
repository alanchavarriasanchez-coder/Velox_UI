import React from 'react';
import { Plus, MessageSquare, Settings, Cpu, Trash2 } from 'lucide-react';
import { ChatSession } from '../App';

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void; // <-- Nueva prop
}

const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings, // <-- la usamos abajo
}) => {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-800/60 bg-neutral-950">
      {/* Brand */}
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-400">
          <Cpu className="size-3.5" />
        </div>
        <span className="font-mono text-sm font-medium tracking-tight text-neutral-100">
          VeloxUI
        </span>
      </div>

      {/* New chat */}
      <div className="px-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-800/80"
        >
          <Plus className="size-4 text-neutral-400" />
          Nuevo Chat
        </button>
      </div>

      {/* History */}
      <div className="mt-4 px-3">
        <div className="px-1 pb-2 font-mono text-[11px] uppercase tracking-wider text-neutral-600">
          Historial
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        <ul className="flex flex-col gap-0.5">
          {sessions.map((session) => (
            <li key={session.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                  session.id === currentSessionId
                    ? 'bg-neutral-800 text-neutral-200'
                    : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                }`}
              >
                <MessageSquare className="size-3.5 shrink-0 text-neutral-600" />
                <span className="truncate font-mono text-xs">{session.title}</span>
              </button>
              {/* Botón de borrado mejorado en el Sidebar */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('¿Eliminar conversación?')) {
                    onDeleteSession(session.id);
                  }
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-red-950/40 text-neutral-500 hover:text-red-400"
                aria-label="Eliminar conversación"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="px-2.5 py-6 text-center font-mono text-xs text-neutral-700">
              Sin conversaciones
            </li>
          )}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-neutral-800/60 p-3">
        <button
          type="button"
          onClick={onOpenSettings} // <-- Ahora abre el modal
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
        >
          <Settings className="size-4 text-neutral-500" />
          <span className="text-xs">Configuración</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
