import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SplashScreen from './components/SplashScreen';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '¡Hola! Soy VeloxUI. ¿En qué puedo ayudarte?' },
  ]);
  const [showSplash, setShowSplash] = useState(true);

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
      <Sidebar messages={messages} setMessages={setMessages} />
      <ChatArea messages={messages} setMessages={setMessages} />
    </div>
  );
}
