// Verificación: Pasos 1-6 implementados (streaming, delta, estado progresivo, parseo de <think> en tiempo real)
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Square, Sparkles, User, Brain, ChevronRight, Loader2, Trash2, Menu, Paperclip, X } from 'lucide-react';
import { Message } from '../App';

interface ChatAreaProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onFirstUserMessage?: (userMessage: string) => void;
  onDeleteCurrentSession?: () => void;
  backendIp: string;
  onToggleSidebar?: () => void;
  maxTokens?: number;
  onUpdateUsage?: (tokens: number) => void; // <-- Renombrada
  initialSessionTokens?: number | null; // <-- Nueva prop
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

// Función de estimación de tokens
function estimateTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    let text: string;
    if (Array.isArray(msg.content)) {
      text = msg.content.join('');
    } else if (typeof msg.content === 'string') {
      text = msg.content;
    } else {
      text = String(msg.content);
    }
    total += text.length / 4;
  }
  return Math.round(total);
}

// Componente memorizado para cada mensaje
const MessageItem = React.memo(({
  msg,
  isLast,
  isGenerating
}: {
  msg: Message;
  idx: number;
  isLast: boolean;
  isGenerating: boolean;
}) => {
  const isUser = msg.role === 'user';
  const { thinkingText, finalText } = isUser
    ? { thinkingText: '', finalText: msg.content }
    : parseMessageContent(msg.content);

  return (
    <div className="flex gap-4 px-4 py-5">
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
            <div className="flex w-full items-center gap-2 px-3 py-2 text-left">
              {isLast && isGenerating ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-400" />
              ) : (
                <Brain className="size-3.5 shrink-0 text-neutral-500" />
              )}
              <span className={`font-mono text-xs ${isLast && isGenerating ? 'animate-pulse text-neutral-400' : 'text-neutral-500'}`}>
                {isLast && isGenerating ? 'Razonando…' : 'Cadena de pensamiento'}
              </span>
            </div>
            {(isLast && isGenerating) || !isGenerating ? (
              <div className="border-t border-neutral-800/60 px-3 py-2.5">
                <p className="whitespace-pre-wrap text-xs italic leading-relaxed text-neutral-500">
                  {thinkingText}
                  {isLast && isGenerating && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <div className="text-sm leading-relaxed text-neutral-200">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({ children }) => (
                <ul className="list-disc pl-5 my-2">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-5 my-2">{children}</ol>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-emerald-400 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-neutral-100">
                  {children}
                </strong>
              ),
              pre: ({ children }) => children,
              code: ({ className, children }) => {
                const match = /language-(\w+)/.exec(className || '');
                const contentString = String(children);
                const isInline = !match && !contentString.includes('\n');

                if (isInline) {
                  return (
                    <code className="bg-neutral-800 px-1 rounded font-mono text-emerald-300 text-xs">
                      {children}
                    </code>
                  );
                }

                const language = match ? match[1] : '';

                return (
                  <div className="my-2 rounded-lg bg-neutral-950 border border-neutral-800 overflow-hidden w-full">
                    {language && (
                      <div className="px-3 py-1 bg-neutral-900 text-neutral-400 text-xs font-mono border-b border-neutral-800">
                        {language}
                      </div>
                    )}
                    <pre className="p-4 overflow-x-auto text-emerald-400 font-mono text-sm">
                      <code>{children}</code>
                    </pre>
                  </div>
                );
              },
            }}
          >
            {finalText}
          </ReactMarkdown>
          {isLast && isGenerating && finalText && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
        </div>
      </div>
    </div>
  );
});
MessageItem.displayName = 'MessageItem';

const ChatArea: React.FC<ChatAreaProps> = ({ messages, setMessages, onFirstUserMessage, onDeleteCurrentSession, backendIp, onToggleSidebar, maxTokens, onUpdateUsage, initialSessionTokens }) => {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [tps, setTps] = useState<number | null>(null);
  const [sessionUsedTokens, setSessionUsedTokens] = useState<number | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; size_mb: number }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef(false);
  const latestTokensRef = useRef(0); // <-- Nuevo ref para capturar sincrónicamente el último total_tokens

  // --- Estados para feedback visual de ajuste de contexto ---
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [contextWarning, setContextWarning] = useState<string | null>(null);
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [summarizingText, setSummarizingText] = useState('Contexto lleno, haciendo ajuste...');
  const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSources, setWebSources] = useState<Array<{ title: string; url: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Efecto para animar el spinner mientras isSummarizing
  useEffect(() => {
    if (!isSummarizing) return;
    const interval = setInterval(() => {
      setSpinnerIndex(prev => (prev + 1) % frames.length);
    }, 100);
    return () => clearInterval(interval);
  }, [isSummarizing, frames.length]);

  // --- Estados para el archivo adjunto ---
  interface AttachedFile {
    name: string;
    mime_type: string;
    data_base64: string;
    preview_text: string;
  }
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Estado para indicar si se recortaron mensajes por tokens ---
  const [isTrimmed, setIsTrimmed] = useState(false);

  // Ref para recordar el último valor de sessionUsedTokens reportado, evitando bucles
  const lastReportedTokens = useRef<number | null>(null);

  // --- Inicializar sessionUsedTokens desde la prop (cuando se carga una sesión) ---
  useEffect(() => {
    if (initialSessionTokens !== undefined && initialSessionTokens !== null) {
      setSessionUsedTokens(initialSessionTokens);
    }
  }, [initialSessionTokens]);

  // Notificar al padre cada vez que sessionUsedTokens cambie (solo si no es null y es diferente)
  useEffect(() => {
    if (sessionUsedTokens !== null && sessionUsedTokens !== lastReportedTokens.current) {
      lastReportedTokens.current = sessionUsedTokens;
      onUpdateUsage?.(sessionUsedTokens);
    }
  }, [sessionUsedTokens, onUpdateUsage]);

  // Función auxiliar para convertir ArrayBuffer a base64
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Función para leer el archivo seleccionado por el usuario
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const mimeType = file.type || 'application/octet-stream';
      const dataBase64 = arrayBufferToBase64(buffer);

      let previewText = '';

      if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          const mammoth = (await import('mammoth')).default;
          const result = await mammoth.extractRawText({ arrayBuffer: buffer });
          previewText = result.value;
        } catch (docxError) {
          console.error('Error extrayendo texto de .docx:', docxError);
          previewText = '[Error al extraer texto del documento Word]';
        }
      } else if (mimeType === 'application/pdf') {
        try {
          const pdfjsLib = await import('pdfjs-dist');
          if (pdfjsLib.GlobalWorkerOptions && !(window as any).__pdfjsWorkerConfigured) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            (window as any).__pdfjsWorkerConfigured = true;
          }
          const pdfDoc = await pdfjsLib.getDocument({ data: buffer }).promise;
          let fullText = '';
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n';
          }
          previewText = fullText.trim();
        } catch (pdfError) {
          console.error('Error extrayendo texto de PDF:', pdfError);
          previewText = '[Error al extraer texto del PDF]';
        }
      } else {
        try {
          const decoder = new TextDecoder('utf-8');
          previewText = decoder.decode(buffer);
        } catch (decodeError) {
          console.error('Error decodificando archivo como texto:', decodeError);
          previewText = '[Error al decodificar el archivo como texto]';
        }
      }

      setAttachedFile({
        name: file.name,
        mime_type: mimeType,
        data_base64: dataBase64,
        preview_text: previewText,
      });
      setPreviewExpanded(false);
      setFileError(null);
    } catch (err) {
      console.error('Error reading file:', err);
      setAttachedFile(null);
      setFileError('No se pudo leer el archivo. Asegúrate de que sea un formato soportado (.txt, .docx, .pdf, etc.).');
      setTimeout(() => setFileError(null), 5000);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const usedTokens = sessionUsedTokens ?? 0;
  const porcentaje = maxTokens
    ? Math.min(Math.round((usedTokens / maxTokens) * 100), 100)
    : 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch(`http://${backendIp}:8000/v1/models`, {
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Name': 'VeloxUI',
          },
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        let json: any;
        if (res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let done = false;
          while (!done) {
            const { done: chunkDone, value } = await reader.read();
            done = chunkDone;
            buffer += decoder.decode(value, { stream: !done });
          }
          const lines = buffer.split('\n');
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              dataLine = data;
            }
          }
          const jsonStr = dataLine || buffer;
          json = JSON.parse(jsonStr);
        } else {
          json = await res.json();
        }
        const models: { id: string; size_mb: number }[] = json.data ?? [];
        const active: string = json.active_model ?? '';
        setAvailableModels(models);
        if (active) {
          setSelectedModel(active);
        } else if (models.length > 0) {
          setSelectedModel(models[0].id);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      }
    };
    fetchModels();
  }, [backendIp]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !attachedFile) || isGenerating || isGeneratingRef.current) return;

    // Reiniciar indicador de historial recortado al enviar un nuevo mensaje
    setIsTrimmed(false);

    // Resetear el ref de tokens para esta generación
    latestTokensRef.current = 0;

    const currentAttachment = attachedFile;

    const finalMessageContent = trimmed;

    if (onFirstUserMessage) {
      onFirstUserMessage(trimmed || `Análisis: ${currentAttachment?.name}`);
    }

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: finalMessageContent,
    } as Message;

    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      reasoning: '',
      streaming: true,
    } as Message;

    // --- Inicio: recorte por tokens antes de enviar ---
    const messagesToSend = [...messages, userMsg];
    const maxSafeTokens = maxTokens ? maxTokens * 0.8 : 32768 * 0.8;
    let trimmedMessages: Message[] = messagesToSend;
    let trimmedSome = false;

    if (estimateTokens(messagesToSend) > maxSafeTokens) {
      const firstUserIdx = messagesToSend.findIndex(m => m.role === 'user');
      const result: Message[] = [];
      if (firstUserIdx !== -1) {
        result.push(messagesToSend[firstUserIdx]);
      }
      let usedTokens = estimateTokens(result);
      const additional: Message[] = [];
      for (let i = messagesToSend.length - 1; i >= 0; i--) {
        if (i === firstUserIdx) continue;
        const testTokens = estimateTokens([messagesToSend[i]]);
        if (usedTokens + testTokens <= maxSafeTokens) {
          additional.unshift(messagesToSend[i]);
          usedTokens += testTokens;
        } else {
          // Dejar de agregar mensajes (son más antiguos y no caben)
          break;
        }
      }
      if (firstUserIdx !== -1) {
        trimmedMessages = result.concat(additional);
      } else {
        trimmedMessages = additional;
      }

      // Si aun así se excede (por ejemplo, primer usuario muy grande), no recortar
      if (estimateTokens(trimmedMessages) > maxSafeTokens) {
        trimmedMessages = messagesToSend;
        trimmedSome = false;
      } else {
        trimmedSome = trimmedMessages.length < messagesToSend.length;
      }
    }

    setIsTrimmed(trimmedSome);
    // --- Fin: recorte por tokens ---

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setAttachedFile(null);
    setPreviewExpanded(false);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsGenerating(true);
    isGeneratingRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`http://${backendIp}:8000/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Name': 'VeloxUI',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: trimmedMessages,  // <-- se usa la lista recortada (o completa)
          stream: true,
          web_search: webSearchEnabled,
          attachments: currentAttachment
            ? [
                {
                  name: currentAttachment.name,
                  mime_type: currentAttachment.mime_type,
                  data: currentAttachment.data_base64,
                },
              ]
            : [],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) throw new Error('No readable stream');
      const reader = response.body.getReader();

      const decoder = new TextDecoder();
      let buffer = '';

      let tokenCount = 0;
      let startTime = 0;
      setTps(null);
      let lastParsed: any = null; // <-- guarda el último JSON parseado

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              // captura web_sources si el último mensaje los contenía
              if (lastParsed && lastParsed.web_sources) {
                setWebSources(lastParsed.web_sources);
              }
              break;
            }
            try {
              const parsed = JSON.parse(data);
              lastParsed = parsed; // actualiza el último JSON válido

              // Feedback visual: notificación de ajuste de contexto
              if (parsed.note === 'truncating') {
                setIsSummarizing(true);
                setSummarizingText('Contexto lleno, haciendo ajuste...');
              }
              if (parsed.note === 'summarizing') {
                setIsSummarizing(true);
                setSummarizingText('Contexto lleno, resumiendo conversación...');
              }
              if (parsed.note === 'searching') {
                setIsSearching(true);
              }

              // Si llegamos a contenido delta, el ajuste terminó (el modelo ya produce texto)
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                if (isSummarizing) {
                  setIsSummarizing(false);
                  setSummarizingText('Contexto lleno, haciendo ajuste...');
                }
                if (tokenCount === 0) {
                  startTime = performance.now();
                }
                tokenCount++;

                const elapsedTime = (performance.now() - startTime) / 1000;
                if (elapsedTime > 0) {
                  setTps(parseFloat((tokenCount / elapsedTime).toFixed(1)));
                }

                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: last.content + delta };
                  }
                  return updated;
                });
              }

              if (parsed.usage) {
                const { total_tokens } = parsed.usage;
                if (total_tokens !== undefined) {
                  setSessionUsedTokens(total_tokens);
                  // Notificar al padre inmediatamente (punto 1 del requerimiento)
                  onUpdateUsage?.(total_tokens);
                  // Guardar sincrónicamente el valor para usarlo al finalizar
                  latestTokensRef.current = total_tokens;
                }

                // Aviso de contexto ajustado automáticamente
                if (parsed.context_truncated === true) {
                  setContextWarning('Contexto ajustado automáticamente');
                  setTimeout(() => setContextWarning(null), 4000);
                }
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      }
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMsgId) {
          return { ...msg, streaming: false };
        }
        return msg;
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // User stopped generation, do nothing
      } else {
        console.error('Error fetching chat completion:', error);
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].role === 'assistant' && updated[updated.length - 1].content === '') {
            updated.pop();
          }
          return updated;
        });
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error al conectar con el servidor.' }]);
      }
    } finally {
      setIsGenerating(false);
      isGeneratingRef.current = false;
      abortControllerRef.current = null;

      // Asegurar que cualquier indicador de resumen se desactive al finalizar
      setIsSummarizing(false);
      setSummarizingText('Contexto lleno, haciendo ajuste...');

      // Al finalizar la generación (éxito o error), persistir el último valor conocido de tokens (punto 2 del requerimiento)
      const finalTokens = latestTokensRef.current > 0 ? latestTokensRef.current : (sessionUsedTokens ?? 0);
      onUpdateUsage?.(finalTokens);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && (input.trim() || attachedFile !== null)) handleSend();
    }
  };

  const canSend = (input.trim().length > 0 || attachedFile !== null) && !isGenerating;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-neutral-950 relative">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800/60 bg-neutral-950/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex size-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 md:hidden hover:text-neutral-200"
              aria-label="Abrir menú"
            >
              <Menu className="size-4" />
            </button>
          )}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-800 bg-neutral-900 py-1.5 pl-3 pr-9 text-sm text-neutral-100 outline-none transition-colors hover:border-neutral-700 focus:border-neutral-600"
              aria-label="Seleccionar modelo"
            >
              {availableModels.length === 0 && (
                <option value="" className="bg-neutral-900">Cargando modelos…</option>
              )}
              {availableModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-neutral-900">
                  {m.id} · {m.size_mb} MB
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-neutral-500" />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-3 py-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full animate-ping bg-emerald-400/60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-xs text-neutral-400">
              <span className="hidden sm:inline">Dispositivo: </span>
              <span className="text-neutral-200">GPU Intel Arc</span>
            </span>
            {tps !== null && (
              <span className="ml-2 border-l border-neutral-800 pl-2 font-mono text-xs text-emerald-400 animate-pulse">
                {tps} tok/s
              </span>
            )}
            {maxTokens && (
              <span className="ml-2 border-l border-neutral-800 pl-2 font-mono text-xs text-neutral-400">
                {maxTokens} tok
              </span>
            )}
            {sessionUsedTokens !== null && (
              <span className="ml-2 border-l border-neutral-800 pl-2 font-mono text-xs text-amber-400">
                {sessionUsedTokens} used
              </span>
            )}
          </div>

          {/* Botón toggle de búsqueda web */}
          <button
            type="button"
            onClick={() => setWebSearchEnabled(prev => !prev)}
            className={`rounded-lg border px-2 py-1 text-xs font-mono transition-colors ${
              webSearchEnabled
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-neutral-800 bg-neutral-900 text-neutral-500 hover:border-neutral-700'
            }`}
            title="Búsqueda en internet"
          >
            🌐 Web {webSearchEnabled ? 'ON' : 'OFF'}
          </button>

          {onDeleteCurrentSession && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('¿Estás seguro de que deseas eliminar esta conversación de tu disco local?')) {
                  onDeleteCurrentSession();
                }
              }}
              className="flex size-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400 transition-colors hover:border-red-900/50 hover:bg-red-950/20 hover:text-red-400"
              title="Eliminar conversación"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </header>

      {/* Toast de aviso de contexto ajustado */}
      {contextWarning && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-amber-500/20 border border-amber-500/30 rounded-lg px-4 py-2 text-amber-300 text-sm font-mono shadow-lg z-40">
          {contextWarning}
        </div>
      )}

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
            {messages.map((msg, idx) => (
              <MessageItem
                key={idx}
                msg={msg}
                idx={idx}
                isLast={idx === messages.length - 1}
                isGenerating={isGenerating}
              />
            ))}
          </div>
        )}

        {/* Sección de fuentes web */}
        {webSources.length > 0 && (
          <div className="px-4 py-2">
            <details className="text-xs text-neutral-400">
              <summary className="cursor-pointer font-mono text-neutral-500 hover:text-neutral-300">
                📎 Fuentes ({webSources.length})
              </summary>
              <ul className="mt-1 space-y-1 list-disc pl-4">
                {webSources.map((src, i) => (
                  <li key={i}>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline"
                    >
                      {src.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

        {isGenerating && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="flex gap-4 px-4 py-5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-neutral-700/60 bg-neutral-900 text-emerald-400">
              <Sparkles className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="mb-1.5 font-mono text-xs text-neutral-500">VeloxUI</div>
              <div className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Caja de entrada inferior */}
      <div className="shrink-0 px-4 pb-5 pt-2">
        <div className="mx-auto max-w-3xl">
          {attachedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-neutral-900 border border-neutral-800/80 px-2.5 py-1.5 text-xs text-neutral-300 w-fit animate-fade-in font-mono shadow-md">
              <Paperclip className="size-3.5 text-emerald-400 shrink-0" />
              <span className="truncate max-w-[240px] text-neutral-200">{attachedFile.name}</span>
              <button
                type="button"
                onClick={() => {
                  setAttachedFile(null);
                  setFileError(null);
                  setPreviewExpanded(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="ml-1 p-0.5 rounded-full hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
                title="Remover archivo"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          {attachedFile && attachedFile.preview_text && (
            <div className="mb-1">
              <button
                type="button"
                onClick={() => setPreviewExpanded(prev => !prev)}
                className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
              >
                {previewExpanded ? 'Ocultar vista previa' : 'Ver vista previa'}
              </button>
              {previewExpanded && (
                <div className="mt-1 rounded bg-neutral-900 border border-neutral-800 p-2 text-xs text-neutral-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {attachedFile.preview_text.slice(0, 500)}
                  {attachedFile.preview_text.length > 500 && (
                    <span className="text-neutral-600 font-mono">... ({attachedFile.preview_text.length - 500} caracteres más)</span>
                  )}
                </div>
              )}
            </div>
          )}
          {fileError && (
            <div className="mb-2 text-xs text-red-400 font-mono px-1">
              {fileError}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 p-2 shadow-lg shadow-black/20 transition-colors focus-within:border-neutral-700">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
              title="Adjuntar archivo de texto"
            >
              <Paperclip className="size-4" />
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".txt,.js,.ts,.tsx,.json,.py,.md,.xml,.bat,.cfg,.toml,.docx,.pdf,.doc,.rtf,.csv,.log"
            />

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
              placeholder={isGenerating ? 'Generando respuesta…' : 'Envía un mensaje o adjunta un archivo…'}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 disabled:opacity-60"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={() => {
                  if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                  }
                  setIsGenerating(false);
                }}
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

          {maxTokens && (
            <div className="w-full px-0 py-1 font-mono text-[10px] text-neutral-500">
              <div className="flex justify-between mb-1">
                <span>Contexto del Modelo</span>
                <span>{usedTokens.toLocaleString()} / {maxTokens.toLocaleString()} tokens ({porcentaje}%)</span>
              </div>
              <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    porcentaje > 85 ? 'bg-red-500' : porcentaje > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              {isTrimmed && (
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-400 font-mono">
                    Historial recortado
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Overlay de resumen de contexto */}
      {isSummarizing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 text-center shadow-2xl">
            <p className="text-emerald-400 font-mono text-lg mb-3">{summarizingText}</p>
            <span className="text-2xl font-mono text-neutral-300">{frames[spinnerIndex]}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatArea;
