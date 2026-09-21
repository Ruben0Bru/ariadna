"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  currentNode: string;
  currentNodeLabel: string;
  currentExercise?: string;
  groupId: number;
  studentId: string;
}

export default function ChatPanel({ currentNode, currentNodeLabel, currentExercise, groupId, studentId }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to the newest message automatically
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          currentNode,
          currentNodeLabel,
          currentExercise,
          groupId,
          studentId,
        }),
      });
      const data = await res.json();
      setMessages([...nextMessages, { role: "assistant", content: data.reply ?? "Sin respuesta." }]);
    } catch {
      setMessages([...nextMessages, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        id="chatToggleBtn"
        className="chat-fab"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Cerrar chat de dudas" : "Abrir chat de dudas"}
        title="Chat de dudas con Ariadna"
      >
        {open ? "✕" : "💬"}
        {!open && <span className="chat-fab-label">Dudas</span>}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Chat de dudas de Cálculo I">
          <div className="chat-panel-header">
            <div className="chat-panel-title">
              <span className="chat-panel-icon">🧵</span>
              <div>
                <div className="chat-panel-name">Ariadna · Dudas</div>
                <div className="chat-panel-node">{currentNodeLabel}</div>
              </div>
            </div>
            <button className="chat-panel-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>¡Hola! Soy Ariadna. Estás en el nodo <strong>{currentNodeLabel}</strong>.</p>
                <p>Pregúntame cualquier duda sobre este tema o sobre Cálculo I en general.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {m.content}
                </ReactMarkdown>
              </div>
            ))}
            {loading && (
              <div className="chat-bubble chat-bubble-assistant chat-typing">
                <span /><span /><span />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="chat-input-row">
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="Escribe tu duda aquí…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              maxLength={400}
            />
            <button
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              aria-label="Enviar pregunta"
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
