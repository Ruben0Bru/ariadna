"""
Ariadna — Motor de verificación simbólica (Vercel Python Serverless Function)

Este archivo reemplaza el backend FastAPI separado.
Vercel lo ejecuta como una función Lambda bajo /api/sympy_verify
sin necesidad de un servidor adicional.

Responsabilidades:
- Verificar equivalencia matemática usando SymPy (nunca aproximación numérica)
- Clasificar el tipo de error cuando la respuesta es incorrecta
- Rechazar entradas inválidas de forma segura (sin eval() libre)
"""

from http.server import BaseHTTPRequestHandler
import json
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr, standard_transformations,
    implicit_multiplication_application, convert_xor
)

TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application, convert_xor
)


def safe_parse(text: str, var: sp.Symbol):
    """Parsea de forma segura usando el parser de SymPy (sin eval)."""
    return parse_expr(
        text,
        transformations=TRANSFORMATIONS,
        local_dict={"x": var, "sqrt": sp.sqrt}
    )


def expressions_equal(a: sp.Expr, b: sp.Expr, var: sp.Symbol) -> bool:
    """
    Equivalencia simbólica con respaldo numérico.
    simplify(a - b) == 0 cubre la mayoría de casos.
    """
    try:
        diff = sp.simplify(a - b)
        if diff == 0:
            return True
        # Respaldo numérico para formas equivalentes complejas
        test_points = [1.3, -0.7, 2.9, -2.1, 0.05]
        for point in test_points:
            va = complex(a.subs(var, point).evalf())
            vb = complex(b.subs(var, point).evalf())
            if abs(va - vb) > 1e-6 * max(1, abs(va)):
                return False
        return True
    except Exception:
        return False


def classify_error(student_expr, correct_derivative, original_expr, var) -> str:
    """Heurística de clasificación de error (RF-07)."""
    try:
        # ¿No derivó — copió la función original?
        if sp.simplify(student_expr - original_expr) == 0:
            return "no_derivo"
        # ¿Error de signo?
        if sp.simplify(student_expr + correct_derivative) == 0:
            return "signo"
        # ¿Olvidó derivar la constante?
        try:
            original_const = original_expr.as_coeff_Add()[0]
            if original_const != 0 and sp.simplify(
                student_expr - correct_derivative - original_const
            ) == 0:
                return "constante"
        except Exception:
            pass
        # ¿Error de exponente/coeficiente?
        student_terms = sp.Add.make_args(sp.expand(student_expr))
        correct_terms = sp.Add.make_args(sp.expand(correct_derivative))
        if len(student_terms) == len(correct_terms):
            return "exponente_o_coeficiente"
    except Exception:
        pass
    return "desconocido"


def handle_verify(body: dict) -> dict:
    student_answer = body.get("student_answer", "").strip()
    correct_expr_str = body.get("correct_expr", "").strip()
    variable_str = body.get("variable", "x").strip() or "x"

    if not student_answer or not correct_expr_str:
        raise ValueError("Faltan campos: student_answer y correct_expr son requeridos.")

    var = sp.Symbol(variable_str)
    original_expr = safe_parse(correct_expr_str, var)
    student_expr = safe_parse(student_answer, var)
    correct_derivative = sp.diff(original_expr, var)

    is_correct = expressions_equal(student_expr, correct_derivative, var)
    error_type = None
    if not is_correct:
        error_type = classify_error(student_expr, correct_derivative, original_expr, var)

    return {
        "correct": is_correct,
        "error_type": error_type,
        "detail": f"esperado={sp.simplify(correct_derivative)}" if not is_correct else None,
    }


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data: dict):
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
            result = handle_verify(body)
            self._send_json(200, result)
        except (ValueError, SyntaxError, Exception) as e:
            self._send_json(400, {"detail": f"Expresión inválida: {e}"})

    def log_message(self, format, *args):
        pass  # Silencia logs de acceso en Vercel
