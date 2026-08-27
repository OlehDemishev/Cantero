/**
 * A minimal safe arithmetic expression evaluator for RateCatalogItem.formula — deliberately not
 * `eval`/`Function()`, since a formula string is company-entered data flowing through the API
 * from the browser and must never reach a JS interpreter server-side. Supports +, -, *, /,
 * unary minus, parentheses, decimal numbers, and named variables (bound to formulaParams).
 */

export class FormulaError extends Error {}

type Token = { type: "number"; value: number } | { type: "identifier"; value: string } | { type: "op"; value: string };

const OPERATORS = new Set(["+", "-", "*", "/", "(", ")"]);

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const raw = expr.slice(i, j);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new FormulaError(`Invalid number "${raw}"`);
      tokens.push({ type: "number", value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
      tokens.push({ type: "identifier", value: expr.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

/** Recursive-descent parser/evaluator, one pass — grammar: expr := term (('+'|'-') term)*,
 * term := factor (('*'|'/') factor)*, factor := number | identifier | '-' factor | '(' expr ')'. */
class Evaluator {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly variables: Record<string, number>,
  ) {}

  evaluate(): number {
    const result = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new FormulaError(`Unexpected token near position ${this.pos}`);
    }
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private parseExpr(): number {
    let value = this.parseTerm();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "+" || tok.value === "-")) {
        this.pos++;
        const rhs = this.parseTerm();
        value = tok.value === "+" ? value + rhs : value - rhs;
      } else break;
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "*" || tok.value === "/")) {
        this.pos++;
        const rhs = this.parseFactor();
        if (tok.value === "/") {
          if (rhs === 0) throw new FormulaError("Division by zero");
          value = value / rhs;
        } else {
          value = value * rhs;
        }
      } else break;
    }
    return value;
  }

  private parseFactor(): number {
    const tok = this.peek();
    if (!tok) throw new FormulaError("Unexpected end of expression");

    if (tok.type === "op" && tok.value === "-") {
      this.pos++;
      return -this.parseFactor();
    }
    if (tok.type === "op" && tok.value === "(") {
      this.pos++;
      const value = this.parseExpr();
      const close = this.peek();
      if (!close || close.type !== "op" || close.value !== ")") throw new FormulaError("Missing closing parenthesis");
      this.pos++;
      return value;
    }
    if (tok.type === "number") {
      this.pos++;
      return tok.value;
    }
    if (tok.type === "identifier") {
      this.pos++;
      if (!(tok.value in this.variables)) throw new FormulaError(`Unknown variable "${tok.value}"`);
      return this.variables[tok.value];
    }
    throw new FormulaError(`Unexpected token "${tok.value}"`);
  }
}

/** Evaluates `formula` against `variables`. Throws FormulaError on any syntax error, unknown
 * variable, or division by zero — callers should surface that as a 400, not a 500. */
export function evaluateFormula(formula: string, variables: Record<string, number>): number {
  const tokens = tokenize(formula);
  if (tokens.length === 0) throw new FormulaError("Empty formula");
  return new Evaluator(tokens, variables).evaluate();
}

/** Parses "a, b, c" (as stored on RateCatalogItem.formulaParams, one name per array entry) into
 * a validated list of identifier names — rejects anything that isn't a valid variable name so a
 * bad formulaParams entry fails fast at creation time rather than at evaluation time. */
export function assertValidParamName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new FormulaError(`Invalid parameter name "${name}"`);
  }
}
