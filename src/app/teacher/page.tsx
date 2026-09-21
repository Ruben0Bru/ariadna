"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// MVP Teacher Dashboard (Client-Side data fetching for simplicity)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

interface StudentStat {
  student_id: string;
  code: string;
  group_id: number;
  attempts_count: number;
  mastered_count: number;
  mastered_nodes: string[];
}

export default function TeacherDashboard() {
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState(false);
  
  const [stats, setStats] = useState<StudentStat[]>([]);
  const [loading, setLoading] = useState(false);

  // Authenticate simple password
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === "profe2026") {
      setAuth(true);
      fetchData();
    } else {
      alert("Contraseña incorrecta");
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      // 1. Get all students
      const { data: students, error: sErr } = await supabase
        .from("students")
        .select("id, code, group_id, mastered_nodes");
      
      if (sErr) throw sErr;

      // 2. Get attempt counts per student
      // In a real app we'd do a group by, but for MVP we fetch all minimal attempt info
      const { data: attempts, error: aErr } = await supabase
        .from("attempts")
        .select("student_id");
        
      if (aErr) throw aErr;

      // Calculate counts
      const counts: Record<string, number> = {};
      attempts?.forEach(a => {
        counts[a.student_id] = (counts[a.student_id] || 0) + 1;
      });

      // Combine
      const combined: StudentStat[] = (students || []).map(s => ({
        student_id: s.id,
        code: s.code,
        group_id: s.group_id,
        mastered_nodes: s.mastered_nodes || [],
        mastered_count: (s.mastered_nodes || []).length,
        attempts_count: counts[s.id] || 0
      }));

      // Sort by group and then by code
      combined.sort((a, b) => {
        if (a.group_id !== b.group_id) return a.group_id - b.group_id;
        return a.code.localeCompare(b.code);
      });

      setStats(combined);
    } catch (e) {
      console.error(e);
      alert("Error cargando los datos de los estudiantes.");
    } finally {
      setLoading(false);
    }
  }

  // Helper to trigger CSV download
  function downloadCSV(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Download full raw attempts log
  async function downloadAttemptsLog() {
    try {
      const { data, error } = await supabase
        .from("attempts")
        .select("*, students(code, group_id)");
      
      if (error) throw error;
      if (!data || data.length === 0) return alert("Sin datos");

      const header = "id,student_code,group_id,exercise_id,node_id,is_correct,error_type,response_time_ms,created_at\n";
      const rows = data.map(d => {
        return `${d.id},${d.students?.code},${d.students?.group_id},${d.exercise_id},${d.node_id},${d.is_correct},${d.error_type || ""},${d.response_time_ms || ""},${d.created_at}`;
      }).join("\n");

      downloadCSV("ariadna_attempts_log.csv", header + rows);
    } catch (e) {
      console.error(e);
      alert("No se pudo descargar el CSV");
    }
  }

  // Download chat logs
  async function downloadChatLogs() {
    try {
      const { data, error } = await supabase
        .from("chat_logs")
        .select("*, students(code, group_id)");
      
      if (error) throw error;
      if (!data || data.length === 0) return alert("Sin datos");

      // Replace commas and newlines in text fields to avoid CSV breakage
      const sanitize = (text: string) => `"${text.replace(/"/g, '""')}"`;

      const header = "id,student_code,group_id,node_context,user_prompt,ai_response,created_at\n";
      const rows = data.map(d => {
        return `${d.id},${d.students?.code},${d.students?.group_id},${d.node_context},${sanitize(d.user_prompt)},${sanitize(d.ai_response)},${d.created_at}`;
      }).join("\n");

      downloadCSV("ariadna_chat_logs.csv", header + rows);
    } catch (e) {
      console.error(e);
      alert("No se pudo descargar el CSV");
    }
  }

  if (!auth) {
    return (
      <div className="login-container">
        <main className="login-card">
          <h1>Panel de Profesor</h1>
          <p>Solo personal autorizado. Ingresa la clave de investigador.</p>
          <form onSubmit={handleLogin} style={{ marginTop: 24 }}>
            <div className="input-group">
              <label>Contraseña</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="******" 
                required 
              />
            </div>
            <button type="submit" className="login-btn">Acceder al Dashboard</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto", color: "var(--text)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "2rem", color: "var(--thread)" }}>👩🏽‍🏫 Ariadna — Panel de Investigador</h1>
          <p style={{ margin: "8px 0 0", color: "var(--text-dim)" }}>Tablero de control y exportación de datos crudos para análisis.</p>
        </div>
        
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={downloadAttemptsLog} className="login-btn" style={{ padding: "10px 16px", background: "#333", color: "white" }}>
            📥 CSV Intentos
          </button>
          <button onClick={downloadChatLogs} className="login-btn" style={{ padding: "10px 16px", background: "#333", color: "white" }}>
            📥 CSV Chat
          </button>
          <button onClick={fetchData} className="login-btn" style={{ padding: "10px 16px" }}>
            🔄 Actualizar
          </button>
        </div>
      </header>

      {loading ? (
        <p>Cargando datos en tiempo real de Supabase...</p>
      ) : (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--line)", borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.05)", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "16px" }}>Código</th>
                <th style={{ padding: "16px" }}>Grupo</th>
                <th style={{ padding: "16px" }}>Total Intentos</th>
                <th style={{ padding: "16px" }}>Nodos Dominados</th>
                <th style={{ padding: "16px" }}>Lista de Dominio</th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "20px", textAlign: "center", color: "var(--text-dim)" }}>
                    No hay estudiantes registrados aún.
                  </td>
                </tr>
              )}
              {stats.map(s => (
                <tr key={s.student_id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "16px", fontWeight: "bold" }}>{s.code}</td>
                  <td style={{ padding: "16px" }}>
                    <span style={{ 
                      background: s.group_id === 1 ? "#5e3e3e" : s.group_id === 2 ? "#5e573e" : "#3e525e",
                      padding: "4px 8px", borderRadius: "12px", fontSize: "0.85rem"
                    }}>
                      Grupo {s.group_id}
                    </span>
                  </td>
                  <td style={{ padding: "16px" }}>{s.attempts_count}</td>
                  <td style={{ padding: "16px" }}>
                    <span style={{ color: "var(--thread)", fontWeight: "bold" }}>{s.mastered_count}</span>
                    <span style={{ color: "var(--text-dim)" }}> / 7</span>
                  </td>
                  <td style={{ padding: "16px", fontSize: "0.85rem", color: "var(--text-dim)" }}>
                    {s.mastered_nodes.join(", ") || "Ninguno"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
