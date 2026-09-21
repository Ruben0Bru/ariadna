"""
Ariadna — Motor de verificación simbólica (Vercel Python Serverless Function)
Ruta: /api/sympy_verify
"""

from http.server import BaseHTTPRequestHandler
import json


def _parse_and_verify(student_answer: str, correct_expr_str: str, variable_str: str = "x") -> dict:
    # Import SymPy aquí (no a nivel de módulo) para evitar errores en cold start
    import sympy as sp
    from sympy.parsing.sympy_parser import (
        parse_expr, standard_transformations,
        implicit_multiplication_application, convert_xor
    )

    T = standard_transformations + (implicit_multiplication_application, convert_xor)
    var = sp.Symbol(variable_str)
    local = {"x": var, "sqrt": sp.sqrt, "exp": sp.exp, "ln": sp.ln, "log": sp.log}

    def safe_parse(txt: str):
        return parse_expr(txt, transformations=T, local_dict=local)

    original = safe_parse(correct_expr_str)
    student = safe_parse(student_answer)
    expected_derivative = sp.diff(original, var)

    # Equivalencia simbólica: simplify(a - b) == 0
    is_correct = False
    try:
        is_correct = sp.simplify(student - expected_derivative) == 0
    except Exception:
        pass

    # Respaldo numérico si simplify no resuelve
    if not is_correct:
        try:
            pts = [1.3, -0.7, 2.9, -2.1, 0.05]
            is_correct = all(
                abs(complex(student.subs(var, p).evalf()) -
                    complex(expected_derivative.subs(var, p).evalf())) < 1e-6
                for p in pts
            )
        except Exception:
            pass

    error_type = None
    if not is_correct:
        # Heurísticas de clasificación de error (RF-07)
        try:
            if sp.simplify(student - original) == 0:
                error_type = "no_derivo"
            elif sp.simplify(student + expected_derivative) == 0:
                error_type = "signo"
            else:
                const = original.as_coeff_Add()[0]
                if const != 0 and sp.simplify(student - expected_derivative - const) == 0:
                    error_type = "constante"
                else:
                    error_type = "desconocido"
        except Exception:
            error_type = "desconocido"

    return {"correct": is_correct, "error_type": error_type}


class handler(BaseHTTPRequestHandler):

    def _send(self, status: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            self._send(400, {"detail": "Cuerpo JSON inválido"})
            return

        student_answer = (body.get("student_answer") or "").strip()
        correct_expr = (body.get("correct_expr") or "").strip()
        variable = (body.get("variable") or "x").strip() or "x"

        if not student_answer or not correct_expr:
            self._send(400, {"detail": "Faltan campos: student_answer y correct_expr"})
            return

        try:
            result = _parse_and_verify(student_answer, correct_expr, variable)
            self._send(200, result)
        except Exception as e:
            self._send(400, {"detail": f"Expresión inválida o no parseable: {e}"})

    def log_message(self, format, *args):
        pass  # silenciar logs de acceso
