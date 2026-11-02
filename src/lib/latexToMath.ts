// src/lib/latexToMath.ts
// Traduce lo que escribe el estudiante (LaTeX, o notación con * y ^) a la sintaxis
// que entiende math.js. Es un analizador recursivo, no un conjunto de regex, para
// poder manejar llaves anidadas: \frac{\sin x}{1+\sqrt[3]{x^{2}}}.
//
// Convenciones que acepta:
//   \frac{a}{b}  \dfrac  \tfrac         \sqrt{x}  \sqrt[n]{x}
//   x^{2}  x^2  x^{-\frac{1}{2}}  x^(1/2)
//   \sin x  \sin(x)  \sin^2 x  \sin^{-1} x  \sec\theta\tan\theta
//   \ln x  \log x (natural)  \log_{a} x  e^{x}  \exp(x)
//   \left( ... \right)  \cdot  \times  \div  |x|  \left| x \right|
//   multiplicación implícita:  3x  2\sin x  x(x+1)  xy
//   también texto plano: sin(x), sqrt(x), 3*x^2, theta, pi, sen(x)
//   "y' = 6x - 5" o "f'(x) = ...": se usa lo que va después del último "=".
//
// Lanza LatexParseError si no puede interpretar la entrada.

export class LatexParseError extends Error {}

type TokType = "num" | "sym" | "word" | "cmd" | "op" | "eof";
interface Tok { t: TokType; v: string }

// Palabras de varias letras que se reconocen (más largas primero)
const WORDS = [
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "sqrt", "theta",
  "sen", "sin", "cos", "tan", "sec", "csc", "cot", "exp", "log", "phi", "ln", "pi",
];

const FUNC_MAP: Record<string, string> = {
  sin: "sin", sen: "sin", cos: "cos", tan: "tan", tg: "tan", sec: "sec", csc: "csc", cot: "cot",
  sinh: "sinh", cosh: "cosh", tanh: "tanh",
  arcsin: "asin", arccos: "acos", arctan: "atan",
  ln: "log", log: "log", exp: "exp",
};
const INVERSE: Record<string, string> = { sin: "asin", cos: "acos", tan: "atan" };

const GREEK = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu", "pi", "rho", "sigma", "phi", "omega",
]);

const SPACING = new Set([
  "quad", "qquad", "displaystyle", "textstyle", "big", "Big", "bigg", "Bigg",
  "bigl", "bigr", "Bigl", "Bigr", "biggl", "biggr", "limits",
]);

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch) || ch === "~") { i++; continue; }

    if (ch === "\\") {
      const m = /^\\([A-Za-z]+)/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        if (!SPACING.has(m[1])) toks.push({ t: "cmd", v: m[1] });
        continue;
      }
      const nxt = src[i + 1];
      i += 2;
      if (nxt === "," || nxt === ";" || nxt === ":" || nxt === "!" || nxt === " ") continue; // espacios
      if (nxt === "{") { toks.push({ t: "op", v: "(" }); continue; }
      if (nxt === "}") { toks.push({ t: "op", v: ")" }); continue; }
      if (nxt === "|") { toks.push({ t: "op", v: "|" }); continue; }
      throw new LatexParseError("Comando no reconocido");
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(\d+(\.\d+)?|\.\d+)/.exec(src.slice(i))!;
      toks.push({ t: "num", v: m[0] });
      i += m[0].length;
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      const m = /^[A-Za-z]+/.exec(src.slice(i))![0];
      let k = 0;
      while (k < m.length) {
        const rest = m.slice(k);
        const w = WORDS.find((word) => rest.startsWith(word));
        if (w) { toks.push({ t: "word", v: w }); k += w.length; }
        else { toks.push({ t: "sym", v: rest[0] }); k += 1; }
      }
      i += m.length;
      continue;
    }

    if ("+-*/^_=(){}[]|,".includes(ch)) {
      toks.push({ t: "op", v: ch });
      i++;
      continue;
    }

    throw new LatexParseError(`Carácter no válido: ${ch}`);
  }
  toks.push({ t: "eof", v: "" });
  return toks;
}

class Parser {
  toks: Tok[];
  pos = 0;
  absDepth = 0;

  constructor(toks: Tok[]) { this.toks = toks; }

  peek(o = 0): Tok { return this.toks[Math.min(this.pos + o, this.toks.length - 1)]; }
  next(): Tok { const t = this.toks[this.pos]; if (this.pos < this.toks.length - 1) this.pos++; return t; }
  isOp(v: string, o = 0): boolean { const t = this.peek(o); return t.t === "op" && t.v === v; }
  isCmd(v: string, o = 0): boolean { const t = this.peek(o); return t.t === "cmd" && t.v === v; }
  expectOp(v: string): void {
    if (!this.isOp(v)) throw new LatexParseError(`Se esperaba "${v}"`);
    this.next();
  }

  parseAll(): string {
    const e = this.parseExpr();
    if (this.peek().t !== "eof") throw new LatexParseError("Sobra texto al final");
    return e;
  }

  // expr := term (("+"|"-") term)*
  parseExpr(): string {
    let left = this.parseTerm();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.next().v;
      const right = this.parseTerm();
      left = `${left} ${op} ${right}`;
    }
    return left;
  }

  // term := unary (("*"|\cdot|\times|"/"|\div|factor-implícito) unary)*
  parseTerm(): string {
    let left = this.parseUnary();
    for (;;) {
      if (this.isOp("*") || this.isCmd("cdot") || this.isCmd("times")) {
        this.next();
        left = `${left}*${this.parseUnary()}`;
      } else if (this.isOp("/") || this.isCmd("div")) {
        this.next();
        left = `${left}/${this.parseUnary()}`;
      } else if (this.startsFactor()) {
        left = `${left}*${this.parsePower()}`;
      } else break;
    }
    return left;
  }

  parseUnary(): string {
    if (this.isOp("-")) { this.next(); return `-${this.parseUnary()}`; }
    if (this.isOp("+")) { this.next(); return this.parseUnary(); }
    return this.parsePower();
  }

  parsePower(): string {
    const base = this.parseAtom();
    if (this.isOp("^")) {
      this.next();
      return `${base}^(${this.parseExponent()})`;
    }
    return base;
  }

  parseExponent(): string {
    if (this.isOp("{")) {
      this.next();
      const e = this.parseExpr();
      this.expectOp("}");
      return e;
    }
    if (this.isOp("-")) { this.next(); return `-${this.parseExponent()}`; }
    if (this.isOp("+")) { this.next(); return this.parseExponent(); }
    return this.parseAtom();
  }

  startsFactor(): boolean {
    const t = this.peek();
    if (t.t === "num" || t.t === "sym" || t.t === "word") return true;
    if (t.t === "cmd") {
      return !["right", "rvert", "cdot", "times", "div"].includes(t.v);
    }
    if (t.t === "op") {
      if (t.v === "(" || t.v === "[" || t.v === "{") return true;
      if (t.v === "|") return this.absDepth === 0;
    }
    return false;
  }

  // Factor "simple" que puede seguir a una función sin paréntesis: \sin 2x, \sec\theta
  startsSimpleFactor(): boolean {
    const t = this.peek();
    if (t.t === "num" || t.t === "sym") return true;
    if (t.t === "word") return t.v === "theta" || t.v === "phi" || t.v === "pi";
    if (t.t === "cmd") return GREEK.has(t.v);
    return false;
  }

  parseGroupArg(): string {
    // argumento de \frac / \sqrt: {..} o un solo símbolo
    if (this.isOp("{")) {
      this.next();
      const e = this.parseExpr();
      this.expectOp("}");
      return e;
    }
    const t = this.peek();
    if (t.t === "num" && t.v.length > 1 && !t.v.includes(".")) {
      // \frac12 → 1 y 2
      this.toks.splice(this.pos, 1, { t: "num", v: t.v[0] }, { t: "num", v: t.v.slice(1) });
      return this.next().v;
    }
    if (t.t === "num" || t.t === "sym") return this.next().v;
    if (t.t === "word" && (t.v === "theta" || t.v === "pi" || t.v === "phi")) return this.next().v;
    if (t.t === "cmd" && GREEK.has(t.v)) return this.next().v;
    throw new LatexParseError("Falta un argumento");
  }

  parseAtom(): string {
    const t = this.peek();

    if (t.t === "num") { this.next(); return t.v; }
    if (t.t === "sym") { this.next(); return t.v; }

    if (t.t === "word") {
      this.next();
      if (t.v === "theta" || t.v === "phi" || t.v === "pi") return t.v;
      if (t.v === "sqrt") return this.parseSqrt();
      return this.parseFunction(t.v);
    }

    if (t.t === "cmd") {
      this.next();
      const c = t.v;
      if (c === "frac" || c === "dfrac" || c === "tfrac") {
        const a = this.parseGroupArg();
        const b = this.parseGroupArg();
        return `((${a})/(${b}))`;
      }
      if (c === "sqrt") return this.parseSqrt();
      if (GREEK.has(c)) return c;
      if (c === "e") return "e";
      if (c === "left") return this.parseLeftRight();
      if (c === "lvert") return this.parseAbs("rvert");
      if (c === "operatorname" || c === "mathrm" || c === "text" || c === "textrm" || c === "mathit") {
        return this.parseNamedFunction();
      }
      if (FUNC_MAP[c]) return this.parseFunction(c);
      throw new LatexParseError(`Comando no reconocido: \\${c}`);
    }

    if (t.t === "op") {
      if (t.v === "(") {
        this.next();
        const e = this.parseExpr();
        this.expectOp(")");
        return `(${e})`;
      }
      if (t.v === "[") {
        this.next();
        const e = this.parseExpr();
        this.expectOp("]");
        return `(${e})`;
      }
      if (t.v === "{") {
        this.next();
        const e = this.parseExpr();
        this.expectOp("}");
        return `(${e})`;
      }
      if (t.v === "|") {
        this.next();
        this.absDepth++;
        const e = this.parseExpr();
        this.absDepth--;
        this.expectOp("|");
        return `abs(${e})`;
      }
    }
    throw new LatexParseError("Expresión incompleta");
  }

  parseLeftRight(): string {
    const d = this.next();
    const delim = d.t === "op" ? d.v : "";
    if (delim === "(" || delim === "[") {
      const e = this.parseExpr();
      if (!this.isCmd("right")) throw new LatexParseError("Falta \\right");
      this.next();
      const close = this.next();
      if (close.t !== "op" || (close.v !== ")" && close.v !== "]")) throw new LatexParseError("Delimitador inválido");
      return `(${e})`;
    }
    if (delim === "|") return this.parseAbs("right");
    throw new LatexParseError("Delimitador inválido");
  }

  parseAbs(closeCmd: string): string {
    this.absDepth++;
    const e = this.parseExpr();
    this.absDepth--;
    if (!this.isCmd(closeCmd)) throw new LatexParseError("Falta cerrar el valor absoluto");
    this.next();
    if (closeCmd === "right") {
      const close = this.next();
      if (close.t !== "op" || close.v !== "|") throw new LatexParseError("Delimitador inválido");
    }
    return `abs(${e})`;
  }

  parseSqrt(): string {
    let index: string | null = null;
    if (this.isOp("[")) {
      this.next();
      index = this.parseExpr();
      this.expectOp("]");
    }
    let arg: string;
    if (this.isOp("(") ) {
      this.next();
      arg = this.parseExpr();
      this.expectOp(")");
    } else {
      arg = this.parseGroupArg();
    }
    return index === null ? `sqrt(${arg})` : `nthRoot(${arg}, ${index})`;
  }

  parseNamedFunction(): string {
    // \operatorname{sen}  \mathrm{sen}  \mathrm{e}
    this.expectOp("{");
    let name = "";
    while (!this.isOp("}")) {
      const t = this.next();
      if (t.t === "eof") throw new LatexParseError("Falta }");
      name += t.v;
    }
    this.next();
    if (name === "e") return "e";
    if (FUNC_MAP[name]) return this.parseFunction(name);
    throw new LatexParseError(`Función no reconocida: ${name}`);
  }

  parseFunction(name: string): string {
    let fname = FUNC_MAP[name];
    if (!fname) throw new LatexParseError(`Función no reconocida: ${name}`);

    let sup: string | null = null;
    if (this.isOp("^")) {
      this.next();
      sup = this.parseExponent();
    }
    let base: string | null = null;
    if (fname === "log" && this.isOp("_")) {
      this.next();
      base = this.parseGroupArg();
    }
    if (sup === "-1" && INVERSE[fname]) { fname = INVERSE[fname]; sup = null; }

    let argInner: string;
    if (this.isOp("(")) {
      this.next();
      argInner = this.parseExpr();
      this.expectOp(")");
    } else {
      if (!this.startsFactor()) throw new LatexParseError("Falta el argumento de la función");
      argInner = this.parsePower();
      while (this.startsSimpleFactor()) argInner += `*${this.parsePower()}`;
    }

    let call = base !== null ? `${fname}(${argInner}, ${base})` : `${fname}(${argInner})`;
    if (sup !== null) call = `(${call})^(${sup})`;
    return call;
  }
}

/** Normaliza texto antes de analizarlo. */
function preprocess(input: string): string {
  let s = input.trim();
  s = s.replace(/[−–—]/g, "-").replace(/[·⋅×]/g, "*").replace(/÷/g, "/")
       .replace(/²/g, "^2").replace(/³/g, "^3").replace(/[θϑ]/g, "theta").replace(/π/g, "pi");
  s = s.replace(/\*\*/g, "^");
  // $...$ o \( ... \)
  s = s.replace(/^\$+|\$+$/g, "").replace(/^\\\(|\\\)$/g, "").trim();
  // "y' = ..." / "f'(x) = ..." → lo que va después del último "="
  if (s.includes("=")) s = s.slice(s.lastIndexOf("=") + 1).trim();
  return s;
}

/** Convierte a sintaxis math.js. Lanza LatexParseError si no se puede. */
export function latexToMathjs(input: string): string {
  const s = preprocess(input);
  if (!s) throw new LatexParseError("Vacío");
  if (s.length > 400) throw new LatexParseError("Demasiado largo");
  return new Parser(tokenize(s)).parseAll();
}
