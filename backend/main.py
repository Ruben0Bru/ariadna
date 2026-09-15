"""
Ariadna — Motor de verificación simbólica (RF-05, RF-06, RF-07, RF-08)

Reemplaza el juez numérico-aproximado del prototipo (math.js en cliente)
por un verificador simbólico real con SymPy, en un backend aislado.

Diseño deliberado:
- Este servicio NUNCA llama al LLM. Solo hace matemática.
- El resultado de este servicio es lo único que decide correcto/incorrecto.
  El módulo de Gemini (en Next.js) solo redacta texto a partir de lo que
  este servicio ya determinó — nunca al revés (RNF-05).
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr, standard_transformations, implicit_multiplication_application, convert_xor
)
import os

app = FastAPI(title="Ariadna - Motor Simbólico")

# CORS: permitir llamadas desde el frontend Next.js (dev y producción)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# convert_xor permite que los estudiantes escriban ^ como potencia (más natural
# que **), que es justo lo que el prototipo ya les pedía hacer.
TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application, convert_xor)


class VerifyRequest(BaseModel):
    student_answer: str = Field(..., description="Lo que el estudiante escribió, ej. '6*x - 5'")
    correct_expr: str = Field(..., description="f(x) SIN derivar, ej. '3*x**2 - 5*x + 2'")
    variable: str = Field(default="x")


class VerifyResponse(BaseModel):
    correct: bool
    error_type: str | None
    detail: str | None  # nota técnica interna, NO es el texto que ve el estudiante


def safe_parse(text: str, var: sp.Symbol):
    """Parsea de forma segura (sin eval de Python) usando el parser de SymPy."""
    try:
        expr = parse_expr(text, transformations=TRANSFORMATIONS, local_dict={"x": var})
        return expr
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Expresión inválida: {e}")


def expressions_equal(a: sp.Expr, b: sp.Expr, var: sp.Symbol) -> bool:
    """
    Equivalencia simbólica con respaldo numérico.
    simplify(a - b) == 0 cubre la mayoría de casos, pero SymPy a veces no
    simplifica del todo formas equivalentes con radicales/trig complejas.
    Como respaldo, evaluamos numéricamente en varios puntos.
    """
    diff = sp.simplify(a - b)
    if diff == 0:
        return True

    test_points = [1.3, -0.7, 2.9, -2.1, 0.05]
    try:
        for point in test_points:
            va = complex(a.subs(var, point).evalf())
            vb = complex(b.subs(var, point).evalf())
            if abs(va - vb) > 1e-6 * max(1, abs(va)):
                return False
        return True
    except Exception:
        return False


def classify_error(student_expr: sp.Expr, correct_derivative: sp.Expr,
                    original_expr: sp.Expr, var: sp.Symbol) -> str:
    """
    Heurística simple de clasificación de errores (RF-07).
    Esto es intencionalmente básico para el MVP — según el requisito RF-07
    (M1), se debe refinar con los datos reales de los primeros intentos.
    """
    # ¿No derivó — copió la función original?
    if sp.simplify(student_expr - original_expr) == 0:
        return "no_derivo"

    # ¿Error de signo — la respuesta es el negativo de la correcta?
    if sp.simplify(student_expr + correct_derivative) == 0:
        return "signo"

    # ¿Error de constante — copió la constante original sin derivarla a 0?
    try:
        original_const = original_expr.as_coeff_Add()[0]
        if original_const != 0 and sp.simplify(student_expr - correct_derivative - original_const) == 0:
            return "constante"
    except Exception:
        pass

    # ¿Error de exponente — mismos términos pero potencias distintas?
    # Heurística: mismo número de términos en la expansión, pero no coincide.
    try:
        student_terms = sp.Add.make_args(sp.expand(student_expr))
        correct_terms = sp.Add.make_args(sp.expand(correct_derivative))
        if len(student_terms) == len(correct_terms):
            return "exponente_o_coeficiente"
    except Exception:
        pass

    return "desconocido"


@app.post("/verify", response_model=VerifyResponse)
def verify(req: VerifyRequest):
    var = sp.Symbol(req.variable)

    original_expr = safe_parse(req.correct_expr, var)
    student_expr = safe_parse(req.student_answer, var)

    correct_derivative = sp.diff(original_expr, var)

    is_correct = expressions_equal(student_expr, correct_derivative, var)

    error_type = None
    if not is_correct:
        error_type = classify_error(student_expr, correct_derivative, original_expr, var)

    return VerifyResponse(
        correct=is_correct,
        error_type=error_type,
        detail=f"esperado={sp.simplify(correct_derivative)}" if not is_correct else None,
    )


@app.get("/health")
def health():
    return {"status": "ok"}
