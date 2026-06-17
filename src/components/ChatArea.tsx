import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../App';

interface ChatAreaProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

// Función auxiliar para extraer el contenido de pensamiento y el texto final
function parseMessageContent(content: string): { thinkingText: string; finalText: string } {
  const thinkOpen = '<think>';
  const thinkClose = '</think>';

  const openIdx = content.indexOf(thinkOpen);
  if (openIdx === -1) {
    return { thinkingText: '', finalText: content };
  }

  const closeIdx = content.indexOf(thinkClose, openIdx + thinkOpen.length);
  if (closeIdx === -1) {
    return {
      thinkingText: content.slice(openIdx + thinkOpen.length),
      finalText: content.slice(0, openIdx)
    };
  }

  return {
    thinkingText: content.slice(openIdx + thinkOpen.length, closeIdx),
    finalText: content.slice(0, openIdx) + content.slice(closeIdx + thinkClose.length)
  };
}

const ChatArea: React.FC<ChatAreaProps> = ({ messages, setMessages }) => {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const assistantIndexRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    const assistantPlaceholder: Message = { role: 'assistant', content: '' };

    setMessages(prev => {
      const newMessages = [...prev, userMessage, assistantPlaceholder];
      assistantIndexRef.current = newMessages.length - 1;
      return newMessages;
    });

    setInput('');
    setIsGenerating(true);

    try {
      const response = await fetch('http://localhost:8000/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openvino-genai',
          messages: [...messages, userMessage],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            if (!data) continue; // ignore empty data lines

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                setMessages(prev => {
                  const updated = [...prev];
                  const idx = assistantIndexRef.current;
                  if (idx !== null && idx < updated.length) {
                    updated[idx] = {
                      ...updated[idx],
                      content: updated[idx].content + delta,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      // Process any remaining data in the buffer (e.g., last line without newline)
      if (buffer.trim()) {
        const remainingLines = buffer.split('\n');
        for (const line of remainingLines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                setMessages(prev => {
                  const updated = [...prev];
                  const idx = assistantIndexRef.current;
                  if (idx !== null && idx < updated.length) {
                    updated[idx] = {
                      ...updated[idx],
                      content: updated[idx].content + delta,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching chat completion:', error);
      setMessages(prev => {
        const updated = [...prev];
        const idx = assistantIndexRef.current;
        if (idx !== null && idx < updated.length) {
          updated[idx] = {
            ...updated[idx],
            content: 'Error al conectar con el servidor.',
          };
        }
        return updated;
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 bg-neutral-900 flex flex-col">
      {/* Zona de mensajes */}
      <div className="overflow-y-auto p-6 space-y-4 flex-1">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          const { thinkingText, finalText } = isUser
            ? { thinkingText: '', finalText: msg.content }
            : parseMessageContent(msg.content);

          return (
            <div
              key={idx}
              className={
                isUser
                  ? 'bg-neutral-800 text-white self-end rounded-2xl p-3 max-w-[70%] ml-auto'
                  : 'bg-neutral-950 text-neutral-200 self-start rounded-2xl p-3 max-w-[70%] border border-neutral-800'
              }
            >
              {thinkingText && (
                <details
                  className="mb-2 group"
                  open={idx === messages.length - 1 && isGenerating ? true : undefined}
                >
                  <summary className={`cursor-pointer list-none flex items-center gap-1 text-xs text-neutral-500 italic hover:text-neutral-400 transition-colors ${idx === messages.length - 1 && isGenerating ? 'animate-pulse' : ''}`}>
                    <span className="text-neutral-600 group-open:rotate-90 transition-transform">▶</span>
                    <span>🧠 Pensamiento de DeepSeek...</span>
                  </summary>
                  <div className="mt-1 p-2 border-l-2 border-neutral-700 bg-neutral-950/50 rounded-r-lg">
                    <p className="whitespace-pre-wrap text-xs text-neutral-500 italic">{thinkingText}</p>
                  </div>
                </details>
              )}
              {finalText && (
                <p className="whitespace-pre-wrap">{finalText}</p>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Caja de entrada inferior */}
      <div className="p-4 border-t border-neutral-800">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <textarea
            className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-neutral-700 resize-none w-full"
            rows={2}
            placeholder="Escribe un mensaje..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isGenerating || !input.trim()}
            className={`rounded-xl px-4 py-2 transition-colors ${
              isGenerating || !input.trim()
                ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                : 'bg-neutral-800 hover:bg-neutral-700 text-white'
            }`}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
