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
  open: boolean;
  onToggle: () => void;
}

export default function ChatPanel({ currentNode, currentNodeLabel, currentExercise, groupId, studentId, open, onToggle }: ChatPanelProps) {
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
      <button className={`chat-fab ${open ? "hiding" : ""}`} onClick={onToggle} title="Chat de dudas con Ariadna">
        <span className="icon">💬</span>
        <span className="label">¿Dudas?</span>
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <div>
              <strong>Ariadna</strong> · Dudas
              <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: 1, opacity: 0.8 }}>
                {currentNodeLabel}
              </div>
            </div>
            <button className="chat-close" onClick={onToggle}>✕</button>
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
