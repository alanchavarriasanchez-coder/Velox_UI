import React from 'react';
import { Message } from '../App';

interface SidebarProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const Sidebar: React.FC<SidebarProps> = ({ messages, setMessages }) => {
  const chatHistory = [
    "Optimización de VRAM",
    "Fix en server.py",
    "Shader de RayTracing",
  ];

  const handleNewChat = () => {
    setMessages([{ role: 'assistant', content: '¡Hola! Soy VeloxUI. ¿En qué puedo ayudarte?' }]);
  };

  return (
    <aside className="w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col h-full">
      {/* Botón Nuevo Chat */}
      <div className="p-4">
        <button
          onClick={handleNewChat}
          className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
        >
          + Nuevo Chat
        </button>
      </div>

      {/* Historial de chats */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {chatHistory.map((chat, index) => (
          <div
            key={index}
            className="text-neutral-400 text-sm py-1 px-2 rounded hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            {chat}
          </div>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;
