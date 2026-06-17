import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const dnaFrames = [
  `    ╔═══╗
    ║ A ║
    ╚═╤═╝
      │
    ╔═╧═╗
    ║ T ║
    ╚═══╝`,
  `    ╔═══╗
    ║ G ║
    ╚═╤═╝
      │
    ╔═╧═╗
    ║ C ║
    ╚═══╝`,
  `    ╔═══╗
    ║ T ║
    ╚═╤═╝
      │
    ╔═╧═╗
    ║ A ║
    ╚═══╝`,
  `    ╔═══╗
    ║ C ║
    ╚═╤═╝
      │
    ╔═╧═╗
    ║ G ║
    ╚═══╝`,
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Hola! Soy VeloxUI. ¿En qué puedo ayudarte?' },
  ]);
  const [showSplash, setShowSplash] = useState(true);
  const [dnaFrameIndex, setDnaFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showSplash) return;
    const interval = setInterval(() => {
      setDnaFrameIndex((prev) => (prev + 1) % dnaFrames.length);
    }, 200);
    return () => clearInterval(interval);
  }, [showSplash]);

  if (showSplash) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-neutral-900 text-white flex flex-col items-center justify-center">
        <pre className="text-green-400 text-sm leading-tight whitespace-pre font-mono">
          {dnaFrames[dnaFrameIndex]}
        </pre>
        <p className="mt-6 text-neutral-400 text-sm animate-pulse">Cargando VeloxUI...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-neutral-900 text-white flex">
      <Sidebar messages={messages} setMessages={setMessages} />
      <ChatArea messages={messages} setMessages={setMessages} />
    </div>
  );
}
