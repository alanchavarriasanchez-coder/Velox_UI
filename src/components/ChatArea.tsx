import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Square, Sparkles, User, Brain, ChevronRight, Loader2 } from 'lucide-react';
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
  const closeIdx = content.indexOf(thinkClose);

  // Caso 1: El modelo omitió <think> pero SÍ cerró con </think>
  if (openIdx === -1 && closeIdx !== -1) {
    return {
      thinkingText: content.slice(0, closeIdx).trim(),
      finalText: content.slice(closeIdx + thinkClose.length).trim()
    };
  }

  // Caso 2: No hay ni apertura ni cierre (texto normal)
  if (openIdx === -1) {
    return { thinkingText: '', finalText: content };
  }

  // Caso 3: Streaming activo (abrió <think> pero aún no hay </think>)
  if (closeIdx === -1 || closeIdx < openIdx) {
    return {
      thinkingText: content.slice(openIdx + thinkOpen.length).trim(),
      finalText: content.slice(0, openIdx).trim()
    };
  }

  // Caso 4: Comportamiento ideal (tiene ambos tags)
  return {
    thinkingText: content.slice(openIdx + thinkOpen.length, closeIdx).trim(),
    finalText: (content.slice(0, openIdx) + content.slice(closeIdx + thinkClose.length)).trim()
  };
}

const ChatArea: React.FC<ChatAreaProps> = ({ messages, setMessages }) => {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const assistantIndexRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

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
      if (!isGenerating && input.trim()) handleSend();
    }
  };

  const canSend = input.trim().length > 0 && !isGenerating;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-neutral-950">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800/60 bg-neutral-950/80 px-4 backdrop-blur">
        {/* Model selector */}
        <div className="relative">
          <select
            value="deepseek-r1-14b"
            onChange={() => {}}
            className="cursor-pointer appearance-none rounded-lg border border-neutral-800 bg-neutral-900 py-1.5 pl-3 pr-9 text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-700 focus:border-neutral-600"
            aria-label="Seleccionar modelo"
          >
            <option value="deepseek-r1-14b" className="bg-neutral-900">DeepSeek-R1 · 14B</option>
            <option value="qwen2.5-coder-7b" className="bg-neutral-900">Qwen 2.5 Coder · 7B</option>
            <option value="llama3.1-8b" className="bg-neutral-900">Llama 3.1 · 8B</option>
          </select>
          <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-neutral-500" />
        </div>

        {/* Hardware status */}
        <div className="flex items-center gap-2 rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-3 py-1.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full animate-ping bg-emerald-400/60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-xs text-neutral-400">
            Dispositivo: <span className="text-neutral-200">GPU Intel Arc</span>
          </span>
        </div>
      </header>

      {/* Zona de mensajes */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-emerald-400">
              <Sparkles className="size-5" />
            </div>
            <h2 className="text-balance text-lg font-medium text-neutral-200">
              ¿En qué estás trabajando?
            </h2>
            <p className="mt-1.5 max-w-sm text-pretty text-sm text-neutral-500">
              Inicia una conversación con tu modelo local. Todo se ejecuta en tu
              hardware, sin salir de tu máquina.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl divide-y divide-neutral-800/40">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const { thinkingText, finalText } = isUser
                ? { thinkingText: '', finalText: msg.content }
                : parseMessageContent(msg.content);

              return (
                <div key={idx} className="flex gap-4 px-4 py-5">
                  {/* Avatar */}
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${
                      isUser
                        ? 'border-neutral-700 bg-neutral-800 text-neutral-300'
                        : 'border-neutral-700/60 bg-neutral-900 text-emerald-400'
                    }`}
                  >
                    {isUser ? <User className="size-3.5" /> : <Sparkles className="size-3.5" />}
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="mb-1.5 font-mono text-xs text-neutral-500">
                      {isUser ? 'Tú' : 'VeloxUI'}
                    </div>

                    {thinkingText && (
                      <div className="mb-2 overflow-hidden rounded-md border-l-2 border-neutral-700 bg-neutral-900/40">
                        <button
                          type="button"
                          onClick={() => {}}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-800/40 ${
                            idx === messages.length - 1 && isGenerating ? 'open' : ''
                          }`}
                          aria-expanded={idx === messages.length - 1 && isGenerating ? true : false}
                        >
                          {idx === messages.length - 1 && isGenerating ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-400" />
                          ) : (
                            <Brain className="size-3.5 shrink-0 text-neutral-500" />
                          )}
                          <span
                            className={`font-mono text-xs ${
                              idx === messages.length - 1 && isGenerating
                                ? 'animate-pulse text-neutral-400'
                                : 'text-neutral-500'
                            }`}
                          >
                            {idx === messages.length - 1 && isGenerating
                              ? 'Razonando…'
                              : 'Cadena de pensamiento'}
                          </span>
                          <ChevronRight
                            className={`ml-auto size-3.5 text-neutral-600 transition-transform ${
                              idx === messages.length - 1 && isGenerating ? 'rotate-90' : ''
                            }`}
                          />
                        </button>

                        {(idx === messages.length - 1 && isGenerating) || !isGenerating ? (
                          <div className="border-t border-neutral-800/60 px-3 py-2.5">
                            <p className="whitespace-pre-wrap text-xs italic leading-relaxed text-neutral-500">
                              {thinkingText}
                              {idx === messages.length - 1 && isGenerating && (
                                <span className="ml-0.5 inline-block animate-pulse">▍</span>
                              )}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="text-sm leading-relaxed text-neutral-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {finalText}
                      </ReactMarkdown>
                      {idx === messages.length - 1 && isGenerating && finalText && (
                        <span className="ml-0.5 inline-block animate-pulse">▍</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Caja de entrada inferior */}
      <div className="shrink-0 px-4 pb-5 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2 shadow-lg shadow-black/20 transition-colors focus-within:border-neutral-700">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              placeholder={isGenerating ? 'Generando respuesta…' : 'Envía un mensaje a VeloxUI…'}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 disabled:opacity-60"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={() => setIsGenerating(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-200 transition-colors hover:bg-neutral-700"
                aria-label="Detener generación"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600"
                aria-label="Enviar mensaje"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center font-mono text-[11px] text-neutral-700">
            VeloxUI ejecuta modelos localmente vía Intel OpenVINO
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
