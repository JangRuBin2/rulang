import { Token, TokenType } from './token';
import * as AST from './ast';

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): AST.Program {
    const body: AST.Statement[] = [];

    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) {
        body.push(stmt);
      }
    }

    return { type: 'Program', body };
  }

  private parseStatement(): AST.Statement | null {
    const token = this.peek();

    switch (token.type) {
      case TokenType.STATE:
        return this.parseStateDeclaration();
      case TokenType.TRANSITION:
        return this.parseTransitionDeclaration();
      case TokenType.LET:
        return this.parseLetStatement();
      case TokenType.FN:
        return this.parseFunctionDeclaration();
      case TokenType.IF:
        return this.parseIfStatement();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      case TokenType.PRINT:
        return this.parsePrintStatement();
      case TokenType.LBRACE:
        return this.parseBlockStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  // state Order { CREATED PAID READY SHIPPED DONE }
  private parseStateDeclaration(): AST.StateDeclaration {
    const line = this.peek().line;
    this.consume(TokenType.STATE, "Expected 'state'");
    const name = this.consume(TokenType.IDENTIFIER, "Expected state name").value;
    this.consume(TokenType.LBRACE, "Expected '{'");

    const states: string[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stateName = this.consume(TokenType.IDENTIFIER, "Expected state value").value;
      states.push(stateName);
      // Optional comma between states
      this.match(TokenType.COMMA);
    }

    this.consume(TokenType.RBRACE, "Expected '}'");

    return { type: 'StateDeclaration', name, states, line };
  }

  // transition Order { CREATED -> PAID when payment.success }
  private parseTransitionDeclaration(): AST.TransitionDeclaration {
    const line = this.peek().line;
    this.consume(TokenType.TRANSITION, "Expected 'transition'");
    const stateName = this.consume(TokenType.IDENTIFIER, "Expected state name").value;
    this.consume(TokenType.LBRACE, "Expected '{'");

    const rules: AST.TransitionRule[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const from = this.consume(TokenType.IDENTIFIER, "Expected 'from' state").value;
      this.consume(TokenType.ARROW, "Expected '->'");
      const to = this.consume(TokenType.IDENTIFIER, "Expected 'to' state").value;
      this.consume(TokenType.WHEN, "Expected 'when'");

      // Parse event like "payment.success"
      const event = this.parseEventName();

      rules.push({ from, to, event });
    }

    this.consume(TokenType.RBRACE, "Expected '}'");

    return { type: 'TransitionDeclaration', stateName, rules, line };
  }

  private parseEventName(): string {
    let name = this.consume(TokenType.IDENTIFIER, "Expected event name").value;
    while (this.match(TokenType.DOT)) {
      name += '.' + this.consume(TokenType.IDENTIFIER, "Expected identifier after '.'").value;
    }
    return name;
  }

  // let x = expr
  private parseLetStatement(): AST.LetStatement {
    const line = this.peek().line;
    this.consume(TokenType.LET, "Expected 'let'");
    const name = this.consume(TokenType.IDENTIFIER, "Expected variable name").value;
    this.consume(TokenType.ASSIGN, "Expected '='");
    const value = this.parseExpression();

    return { type: 'LetStatement', name, value, line };
  }

  // fn name(params) { body }
  private parseFunctionDeclaration(): AST.FunctionDeclaration {
    const line = this.peek().line;
    this.consume(TokenType.FN, "Expected 'fn'");
    const name = this.consume(TokenType.IDENTIFIER, "Expected function name").value;
    this.consume(TokenType.LPAREN, "Expected '('");

    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        params.push(this.consume(TokenType.IDENTIFIER, "Expected parameter name").value);
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, "Expected ')'");
    const body = this.parseBlockStatement();

    return { type: 'FunctionDeclaration', name, params, body, line };
  }

  // if (condition) { ... } else { ... }
  private parseIfStatement(): AST.IfStatement {
    const line = this.peek().line;
    this.consume(TokenType.IF, "Expected 'if'");
    this.consume(TokenType.LPAREN, "Expected '('");
    const condition = this.parseExpression();
    this.consume(TokenType.RPAREN, "Expected ')'");

    const consequent = this.parseBlockStatement();

    let alternate: AST.BlockStatement | AST.IfStatement | null = null;
    if (this.match(TokenType.ELSE)) {
      if (this.check(TokenType.IF)) {
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlockStatement();
      }
    }

    return { type: 'IfStatement', condition, consequent, alternate, line };
  }

  // return expr
  private parseReturnStatement(): AST.ReturnStatement {
    const line = this.peek().line;
    this.consume(TokenType.RETURN, "Expected 'return'");

    let argument: AST.Expression | null = null;
    if (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      argument = this.parseExpression();
    }

    return { type: 'ReturnStatement', argument, line };
  }

  // print(expr)
  private parsePrintStatement(): AST.PrintStatement {
    const line = this.peek().line;
    this.consume(TokenType.PRINT, "Expected 'print'");
    this.consume(TokenType.LPAREN, "Expected '('");
    const argument = this.parseExpression();
    this.consume(TokenType.RPAREN, "Expected ')'");

    return { type: 'PrintStatement', argument, line };
  }

  // { statements }
  private parseBlockStatement(): AST.BlockStatement {
    const line = this.peek().line;
    this.consume(TokenType.LBRACE, "Expected '{'");

    const body: AST.Statement[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }

    this.consume(TokenType.RBRACE, "Expected '}'");

    return { type: 'BlockStatement', body, line };
  }

  // expression statement
  private parseExpressionStatement(): AST.ExpressionStatement {
    const line = this.peek().line;
    const expression = this.parseExpression();
    return { type: 'ExpressionStatement', expression, line };
  }

  // ============ Expression Parsing (Pratt Parser) ============

  private parseExpression(): AST.Expression {
    return this.parseAssignment();
  }

  private parseAssignment(): AST.Expression {
    const expr = this.parseEquality();

    if (this.match(TokenType.ASSIGN)) {
      const line = this.previous().line;
      const value = this.parseAssignment();

      if (expr.type === 'Identifier') {
        // For now, treat assignment as a binary expression
        return {
          type: 'BinaryExpression',
          operator: '=',
          left: expr,
          right: value,
          line,
        };
      }
      throw this.error("Invalid assignment target");
    }

    return expr;
  }

  private parseEquality(): AST.Expression {
    let left = this.parseComparison();

    while (this.match(TokenType.EQ, TokenType.NEQ)) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.parseComparison();
      left = { type: 'BinaryExpression', operator, left, right, line };
    }

    return left;
  }

  private parseComparison(): AST.Expression {
    let left = this.parseTerm();

    while (this.match(TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE)) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.parseTerm();
      left = { type: 'BinaryExpression', operator, left, right, line };
    }

    return left;
  }

  private parseTerm(): AST.Expression {
    let left = this.parseFactor();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.parseFactor();
      left = { type: 'BinaryExpression', operator, left, right, line };
    }

    return left;
  }

  private parseFactor(): AST.Expression {
    let left = this.parseUnary();

    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const right = this.parseUnary();
      left = { type: 'BinaryExpression', operator, left, right, line };
    }

    return left;
  }

  private parseUnary(): AST.Expression {
    if (this.match(TokenType.MINUS)) {
      const operator = this.previous().value;
      const line = this.previous().line;
      const argument = this.parseUnary();
      return { type: 'UnaryExpression', operator, argument, line };
    }

    return this.parseCall();
  }

  private parseCall(): AST.Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.LPAREN)) {
        expr = this.finishCall(expr);
      } else if (this.match(TokenType.DOT)) {
        // Allow keywords as property names (e.g., order.state)
        const token = this.peek();
        if (token.type === TokenType.IDENTIFIER || this.isKeyword(token.type)) {
          this.advance();
          expr = {
            type: 'MemberExpression',
            object: expr,
            property: token.value,
            line: this.previous().line,
          };
        } else {
          throw this.error("Expected property name after '.'");
        }
      } else {
        break;
      }
    }

    return expr;
  }

  private finishCall(callee: AST.Expression): AST.CallExpression {
    const args: AST.Expression[] = [];
    const line = this.previous().line;

    if (!this.check(TokenType.RPAREN)) {
      do {
        args.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, "Expected ')' after arguments");

    return { type: 'CallExpression', callee, arguments: args, line };
  }

  private parsePrimary(): AST.Expression {
    const token = this.peek();

    if (this.match(TokenType.NUMBER)) {
      return {
        type: 'NumberLiteral',
        value: parseFloat(this.previous().value),
        line: this.previous().line,
      };
    }

    if (this.match(TokenType.STRING)) {
      return {
        type: 'StringLiteral',
        value: this.previous().value,
        line: this.previous().line,
      };
    }

    if (this.match(TokenType.TRUE)) {
      return { type: 'BooleanLiteral', value: true, line: this.previous().line };
    }

    if (this.match(TokenType.FALSE)) {
      return { type: 'BooleanLiteral', value: false, line: this.previous().line };
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return {
        type: 'Identifier',
        name: this.previous().value,
        line: this.previous().line,
      };
    }

    if (this.match(TokenType.LBRACKET)) {
      return this.parseArrayExpression();
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.consume(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    if (this.match(TokenType.FN)) {
      return this.parseFunctionExpression();
    }

    throw this.error(`Unexpected token: ${token.type}`);
  }

  private parseArrayExpression(): AST.ArrayExpression {
    const line = this.previous().line;
    const elements: AST.Expression[] = [];

    if (!this.check(TokenType.RBRACKET)) {
      do {
        elements.push(this.parseExpression());
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RBRACKET, "Expected ']'");

    return { type: 'ArrayExpression', elements, line };
  }

  private parseFunctionExpression(): AST.FunctionExpression {
    const line = this.previous().line;
    this.consume(TokenType.LPAREN, "Expected '('");

    const params: string[] = [];
    if (!this.check(TokenType.RPAREN)) {
      do {
        params.push(this.consume(TokenType.IDENTIFIER, "Expected parameter name").value);
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RPAREN, "Expected ')'");
    const body = this.parseBlockStatement();

    return { type: 'FunctionExpression', params, body, line };
  }

  // ============ Helper Methods ============

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private previous(): Token {
    return this.tokens[this.pos - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(message);
  }

  private error(message: string): Error {
    const token = this.peek();
    return new Error(`[Parser Error] Line ${token.line}: ${message} (got '${token.value}')`);
  }

  private isKeyword(type: TokenType): boolean {
    return [
      TokenType.STATE,
      TokenType.TRANSITION,
      TokenType.WHEN,
      TokenType.LET,
      TokenType.FN,
      TokenType.IF,
      TokenType.ELSE,
      TokenType.TRUE,
      TokenType.FALSE,
      TokenType.RETURN,
      TokenType.PRINT,
    ].includes(type);
  }
}
