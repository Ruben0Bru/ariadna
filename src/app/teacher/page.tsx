"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getTeacherSession, clearTeacherSession } from "@/lib/session";
import { DAG, DAG_ORDER, EXERCISES } from "@/lib/dag";

interface StudentStat {
  student_id: string;
  code: string;
  group_id: number;
  attempts_count: number;
  mastered_count: number;
  mastered_nodes: string[];
}

type Tab = "dashboard" | "session" | "exercises";

export default function TeacherDashboard() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [teacherSession, setTeacherSession] = useState<{ code: string; name: string } | null>(null);
  const [stats, setStats] = useState<StudentStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbExercises, setDbExercises] = useState<any[]>([]);

  // Class session state
  const [selectedNode, setSelectedNode] = useState<string>(DAG_ORDER[0]);
  const [selectedExercises, setSelectedExercises] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"none" | "active" | "saving">("none");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const supabase = useMemo<SupabaseClient | null>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    const ts = getTeacherSession();
    if (!ts) { window.location.href = "/login"; return; }
    setTeacherSession(ts);
    fetchData();
    checkActiveSession();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/teacher/data");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const combined: StudentStat[] = (data.students || []).map((s: any) => ({
        student_id: s.id,
        code: s.code,
        group_id: s.group_id,
        mastered_nodes: s.mastered_nodes || [],
        mastered_count: (s.mastered_nodes || []).length,
        attempts_count: (data.attempts || []).filter((a: any) => a.student_id === s.id).length,
      }));

      combined.sort((a, b) => {
        if (a.group_id !== b.group_id) return a.group_id - b.group_id;
        return a.code.localeCompare(b.code);
      });

      setStats(combined);
      setDbExercises(data.exercises || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // Custom Exercise Form State
  const [newExNode, setNewExNode] = useState<string>(DAG_ORDER[0]);
  const [newExPrompt, setNewExPrompt] = useState("");
  const [newExExpr, setNewExExpr] = useState("");
  const [creatingEx, setCreatingEx] = useState(false);

  async function handleCreateExercise(e: React.FormEvent) {
    e.preventDefault();
    if (!newExPrompt.trim() || !newExExpr.trim()) {
      alert("Por favor ingresa todos los campos.");
      return;
    }
    setCreatingEx(true);
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: newExNode,
          prompt: newExPrompt,
          correct_expr: newExExpr,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setNewExPrompt("");
      setNewExExpr("");
      await fetchData(); // refresca la tabla
      alert("Ejercicio creado exitosamente.");
    } catch (err: any) {
      alert("Error creando ejercicio: " + err.message);
    } finally {
      setCreatingEx(false);
    }
  }




  async function checkActiveSession() {
    if (!supabase) return;
    const { data } = await supabase
      .from("class_sessions")
      .select("id, exercise_ids")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setActiveSessionId(data.id);
      setSessionStatus("active");
      setSelectedExercises(new Set(data.exercise_ids));
    }
  }

  async function handleActivateSession() {
    if (selectedExercises.size === 0) return;
    setSaving(true);
    setSessionStatus("saving");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate",
          exerciseIds: [...selectedExercises],
          teacherCode: teacherSession?.code
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setActiveSessionId(data.sessionId);
      setSessionStatus("active");
    } catch (e: any) {
      console.error(e);
      setSessionStatus("none");
      alert("Error al activar la sesión: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateSession() {
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate" })
      });
      setActiveSessionId(null);
      setSessionStatus("none");
      setSelectedExercises(new Set());
    } catch (e) {
      console.error(e);
    }
  }

  function toggleExercise(id: number) {
    setSelectedExercises(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadCSV(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function downloadAttemptsLog() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("attempts")
      .select("*, students(code, group_id)");
    if (error || !data?.length) { alert("Sin datos"); return; }
    const header = "id,student_code,group_id,exercise_id,node_id,is_correct,error_type,response_time_ms,created_at\n";
    const rows = data.map(d =>
      `${d.id},${d.students?.code},${d.students?.group_id},${d.exercise_id},${d.node_id},${d.is_correct},${d.error_type || ""},${d.response_time_ms || ""},${d.created_at}`
    ).join("\n");
    downloadCSV("ariadna_attempts_log.csv", header + rows);
  }

  async function downloadChatLogs() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("chat_logs")
      .select("*, students(code, group_id)");
    if (error || !data?.length) { alert("Sin datos"); return; }
    const s = (t: string) => `"${t.replace(/"/g, '""')}"`;
    const header = "id,student_code,group_id,node_context,user_prompt,ai_response,created_at\n";
    const rows = data.map(d =>
      `${d.id},${d.students?.code},${d.students?.group_id},${d.node_context},${s(d.user_prompt)},${s(d.ai_response)},${d.created_at}`
    ).join("\n");
    downloadCSV("ariadna_chat_logs.csv", header + rows);
  }

  function handleLogout() { clearTeacherSession(); window.location.href = "/login"; }

  const nodeExercises = dbExercises.filter(e => e.node_id === selectedNode);

  const tabStyle = (t: Tab): React.CSSProperties => ({
    background: tab === t ? "rgba(212,166,87,0.15)" : "transparent",
    border: `1px solid ${tab === t ? "var(--thread)" : "var(--line)"}`,
    color: tab === t ? "var(--thread)" : "var(--text-dim)",
    borderRadius: "8px",
    padding: "8px 20px",
    cursor: "pointer",
    fontWeight: tab === t ? 700 : 400,
    fontSize: "0.9rem",
    transition: "all 0.2s",
  });

  return (
    <div style={{ padding: "40px 24px", maxWidth: "1100px", margin: "0 auto", color: "var(--text)" }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--thread)", marginBottom: "6px", letterSpacing: "0.04em" }}>
            ARIADNA — PANEL DE DOCENTE
          </div>
          <h1 style={{ margin: 0, fontSize: "1.8rem", color: "var(--text)", fontFamily: "'Newsreader', serif", fontWeight: 500 }}>
            Bienvenid@, <em style={{ color: "var(--thread)", fontStyle: "italic" }}>{teacherSession?.name ?? "Docente"}</em>
          </h1>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={downloadAttemptsLog} style={{ padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--line)", borderRadius: "8px", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.85rem" }}>
            📥 CSV Intentos
          </button>
          <button onClick={downloadChatLogs} style={{ padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--line)", borderRadius: "8px", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.85rem" }}>
            📥 CSV Chat
          </button>
          <button onClick={fetchData} style={{ padding: "9px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid var(--line)", borderRadius: "8px", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.85rem" }}>
            🔄
          </button>
          <button onClick={handleLogout} style={{ padding: "9px 14px", background: "transparent", border: "1px solid var(--line)", borderRadius: "8px", color: "var(--text-dim)", cursor: "pointer", fontSize: "0.85rem" }}>
            {teacherSession?.code} ↩
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "28px" }}>
        <button style={tabStyle("dashboard")} onClick={() => setTab("dashboard")}>📊 Dashboard Estudiantil</button>
        <button style={tabStyle("session")} onClick={() => setTab("session")}>
          🏫 Sesión de Clase
          {sessionStatus === "active" && (
            <span style={{ marginLeft: "8px", background: "var(--ok)", color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "0.75rem" }}>ACTIVA</span>
          )}
        </button>
        <button style={tabStyle("exercises")} onClick={() => setTab("exercises")}>
          ⚙️ Gestor de Ejercicios
        </button>
      </div>

      {/* ── Tab: Dashboard ── */}
      {tab === "dashboard" && (
        <>
          {loading ? (
            <p style={{ color: "var(--text-dim)" }}>Cargando datos en tiempo real…</p>
          ) : (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)", borderRadius: "12px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid var(--line)" }}>
                    <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>Código</th>
                    <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>Grupo</th>
                    <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>Intentos</th>
                    <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>Dominio</th>
                    <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>Nodos dominados</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "var(--text-dim)" }}>
                        No hay estudiantes registrados aún.
                      </td>
                    </tr>
                  )}
                  {stats.map(s => (
                    <tr key={s.student_id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "14px 16px", fontWeight: "bold", color: "var(--text)" }}>{s.code}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          background: s.group_id === 1 ? "#5e3e3e" : s.group_id === 2 ? "#5e573e" : "#3e525e",
                          padding: "3px 8px", borderRadius: "10px", fontSize: "0.82rem", color: "var(--text)"
                        }}>
                          G{s.group_id}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text)" }}>{s.attempts_count}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ color: "var(--ok)", fontWeight: "bold" }}>{s.mastered_count}</span>
                        <span style={{ color: "var(--text-dim)" }}> / 7</span>
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: "0.82rem", color: "var(--text-dim)" }}>
                        {s.mastered_nodes.join(", ") || "Ninguno"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Tab: Sesión de Clase ── */}
      {tab === "session" && (
        <div>
          {sessionStatus === "active" && (
            <div style={{ background: "rgba(91,169,127,0.12)", border: "1px solid var(--ok)", borderRadius: "10px", padding: "16px 20px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ color: "var(--ok)", fontWeight: 700 }}>✓ Sesión de clase activa</span>
                <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: "0.85rem" }}>
                  Los estudiantes que inician sesión ahora verán solo los ejercicios seleccionados ({selectedExercises.size} ejercicio{selectedExercises.size !== 1 ? "s" : ""}).
                </p>
              </div>
              <button
                onClick={handleDeactivateSession}
                style={{ background: "transparent", border: "1px solid var(--warn)", color: "var(--warn)", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
              >
                ✕ Terminar sesión
              </button>
            </div>
          )}

          <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem", color: "var(--text)" }}>Asignar ejercicios para la clase</h2>
          <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginBottom: "20px" }}>
            Selecciona el tema y los ejercicios específicos que quieres que tus estudiantes resuelvan durante la sesión de clase.
          </p>

          {/* Node selector */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "24px" }}>
            {DAG_ORDER.map(key => (
              <button
                key={key}
                onClick={() => setSelectedNode(key)}
                style={{
                  padding: "7px 14px",
                  borderRadius: "16px",
                  border: `1px solid ${selectedNode === key ? "var(--thread)" : "var(--line)"}`,
                  background: selectedNode === key ? "rgba(212,166,87,0.12)" : "var(--panel)",
                  color: selectedNode === key ? "var(--thread)" : "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: "all 0.2s"
                }}
              >
                {DAG[key].label}
              </button>
            ))}
          </div>

          {/* Exercise selection list */}
          <div style={{ border: "1px solid var(--line)", borderRadius: "10px", overflow: "hidden", marginBottom: "20px" }}>
            {nodeExercises.length === 0 ? (
              <p style={{ padding: "20px", color: "var(--text-dim)", textAlign: "center" }}>No hay ejercicios para este nodo.</p>
            ) : (
              nodeExercises.map(ex => (
                <label
                  key={ex.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "14px",
                    padding: "14px 18px",
                    borderBottom: "1px solid var(--line)",
                    cursor: "pointer",
                    background: selectedExercises.has(ex.id) ? "rgba(212,166,87,0.06)" : "transparent",
                    transition: "background 0.15s"
                  }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedExercises.has(ex.id)}
                      onChange={() => toggleExercise(ex.id)}
                      style={{ marginTop: "3px", accentColor: "var(--thread)", width: "16px", height: "16px", cursor: "pointer" }}
                    />
                  <div>
                      <div style={{ color: "var(--text-main)", fontSize: "0.95rem", marginBottom: "4px" }}>
                         {ex.prompt}
                      </div>
                      <div style={{ color: "var(--text-dim)", fontSize: "0.78rem", fontFamily: "'JetBrains Mono', monospace" }}>
                        Respuesta: {ex.correct_expr} · ID #{ex.id}
                      </div>
                    </div>
                  </label>
              ))
            )}
          </div>

          {/* Action */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              onClick={handleActivateSession}
              disabled={saving || selectedExercises.size === 0}
              style={{
                padding: "12px 28px",
                background: selectedExercises.size > 0 ? "var(--thread)" : "var(--line)",
                color: selectedExercises.size > 0 ? "#111" : "var(--text-dim)",
                border: "none",
                borderRadius: "10px",
                cursor: selectedExercises.size > 0 ? "pointer" : "not-allowed",
                fontWeight: 700,
                fontSize: "1rem",
                transition: "all 0.2s"
              }}
            >
              {saving ? "Activando…" : `🏫 Activar sesión con ${selectedExercises.size} ejercicio${selectedExercises.size !== 1 ? "s" : ""}`}
            </button>
            {selectedExercises.size > 0 && (
              <button
                onClick={() => setSelectedExercises(new Set())}
                style={{ padding: "12px 16px", background: "transparent", border: "1px solid var(--line)", borderRadius: "10px", color: "var(--text-dim)", cursor: "pointer" }}
              >
                Limpiar selección
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Gestor de Ejercicios ── */}
      {tab === "exercises" && (
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem", color: "var(--text)" }}>Base de Datos de Ejercicios</h2>
          <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginBottom: "20px" }}>
            Administra los ejercicios pedagógicos. Si la tabla está vacía, usa el botón rojo abajo para cargar los iniciales.
          </p>
          <div style={{ border: "1px solid var(--line)", borderRadius: "10px", overflow: "hidden", marginBottom: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>ID</th>
                  <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>Nodo</th>
                  <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>CorrectExpr</th>
                  <th style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.85rem", fontWeight: 600 }}>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {dbExercises.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "var(--text-dim)" }}>
                    Base de datos VACÍA. No hay ejercicios configurados.
                  </td>
                </tr>
              ) : (
                dbExercises.map(ex => (
                  <tr key={ex.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "14px 16px", color: "var(--text-dim)" }}>#{ex.id}</td>
                    <td style={{ padding: "14px 16px", color: "var(--thread)" }}>{ex.node_id}</td>
                    <td style={{ padding: "14px 16px", color: "var(--text)", fontSize: "0.9rem" }}>
                      {ex.prompt}
                      <br/>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", color: "var(--text-dim)" }}>{ex.correct_expr}</span>
                    </td>
                    <td style={{ padding: "14px 16px", color: "var(--text-dim)", fontSize: "0.8rem" }}>{ex.exercise_type}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: "32px", padding: "24px", background: "rgba(0,0,0,0.1)", borderRadius: "12px", border: "1px solid var(--line)" }}>
          <h3 style={{ margin: "0 0 16px", color: "var(--text)" }}>Crear Ejercicio Personalizado</h3>
          <form onSubmit={handleCreateExercise} style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "600px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.9rem", color: "var(--text-dim)" }}>
              Tema (Nodo)
              <select 
                value={newExNode} 
                onChange={e => setNewExNode(e.target.value)}
                style={{ padding: "10px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              >
                {DAG_ORDER.map(n => (
                  <option key={n} value={n}>{DAG[n].label}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.9rem", color: "var(--text-dim)" }}>
              Enunciado (ej. "Deriva f(x) = x^2")
              <input 
                type="text"
                value={newExPrompt} 
                onChange={e => setNewExPrompt(e.target.value)}
                placeholder="Escribe el enunciado para el estudiante..."
                style={{ padding: "10px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.9rem", color: "var(--text-dim)" }}>
              Respuesta Matemática Correcta (ej. "2*x")
              <input 
                type="text"
                value={newExExpr} 
                onChange={e => setNewExExpr(e.target.value)}
                placeholder="Expresión que valida el nodo..."
                style={{ fontFamily: "'JetBrains Mono', monospace", padding: "10px", borderRadius: "8px", background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text)" }}
              />
            </label>
            <button 
              type="submit" 
              disabled={creatingEx}
              style={{ padding: "10px 16px", borderRadius: "8px", background: "var(--thread)", color: "#111", fontWeight: "bold", border: "none", cursor: "pointer", width: "fit-content" }}
            >
              {creatingEx ? "Guardando..." : "Guardar Ejercicio"}
            </button>
          </form>
        </div>
        </div>
      )}
    </div>
  );
}
