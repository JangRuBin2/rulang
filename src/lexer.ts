import { Token, TokenType, KEYWORDS } from './token';

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const token = this.scanToken();
      if (token) {
        tokens.push(token);
      }
    }

    tokens.push(this.makeToken(TokenType.EOF, ''));
    return tokens;
  }

  private scanToken(): Token | null {
    this.skipWhitespace();

    if (this.isAtEnd()) return null;

    const char = this.peek();

    // Numbers
    if (this.isDigit(char)) {
      return this.scanNumber();
    }

    // Identifiers and keywords
    if (this.isAlpha(char)) {
      return this.scanIdentifier();
    }

    // Strings
    if (char === '"' || char === "'") {
      return this.scanString(char);
    }

    // Operators and delimiters
    return this.scanOperator();
  }

  private scanNumber(): Token {
    const start = this.pos;
    const startCol = this.column;

    while (this.isDigit(this.peek())) {
      this.advance();
    }

    // Decimal
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.advance();
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const value = this.source.slice(start, this.pos);
    return { type: TokenType.NUMBER, value, line: this.line, column: startCol };
  }

  private scanIdentifier(): Token {
    const start = this.pos;
    const startCol = this.column;

    while (this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const value = this.source.slice(start, this.pos);
    const type = KEYWORDS[value] ?? TokenType.IDENTIFIER;
    return { type, value, line: this.line, column: startCol };
  }

  private scanString(quote: string): Token {
    const startCol = this.column;
    this.advance(); // opening quote

    let value = '';
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case 'r': value += '\r'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          case "'": value += "'"; break;
          default: value += escaped;
        }
      } else {
        if (this.peek() === '\n') {
          this.line++;
          this.column = 0;
        }
        value += this.advance();
      }
    }

    if (!this.isAtEnd()) {
      this.advance(); // closing quote
    }

    return { type: TokenType.STRING, value, line: this.line, column: startCol };
  }

  private scanOperator(): Token | null {
    const startCol = this.column;
    const char = this.advance();

    switch (char) {
      case '+': return this.makeToken(TokenType.PLUS, '+', startCol);
      case '-':
        if (this.match('>')) return this.makeToken(TokenType.ARROW, '->', startCol);
        return this.makeToken(TokenType.MINUS, '-', startCol);
      case '*': return this.makeToken(TokenType.STAR, '*', startCol);
      case '/':
        if (this.match('/')) {
          // Single line comment
          while (!this.isAtEnd() && this.peek() !== '\n') this.advance();
          return null;
        }
        return this.makeToken(TokenType.SLASH, '/', startCol);
      case '%': return this.makeToken(TokenType.PERCENT, '%', startCol);
      case '=':
        if (this.match('=')) return this.makeToken(TokenType.EQ, '==', startCol);
        return this.makeToken(TokenType.ASSIGN, '=', startCol);
      case '!':
        if (this.match('=')) return this.makeToken(TokenType.NEQ, '!=', startCol);
        throw this.error(`Unexpected character '!'`);
      case '<':
        if (this.match('=')) return this.makeToken(TokenType.LTE, '<=', startCol);
        return this.makeToken(TokenType.LT, '<', startCol);
      case '>':
        if (this.match('=')) return this.makeToken(TokenType.GTE, '>=', startCol);
        return this.makeToken(TokenType.GT, '>', startCol);
      case '(': return this.makeToken(TokenType.LPAREN, '(', startCol);
      case ')': return this.makeToken(TokenType.RPAREN, ')', startCol);
      case '{': return this.makeToken(TokenType.LBRACE, '{', startCol);
      case '}': return this.makeToken(TokenType.RBRACE, '}', startCol);
      case '[': return this.makeToken(TokenType.LBRACKET, '[', startCol);
      case ']': return this.makeToken(TokenType.RBRACKET, ']', startCol);
      case ',': return this.makeToken(TokenType.COMMA, ',', startCol);
      case ';': return this.makeToken(TokenType.SEMICOLON, ';', startCol);
      case '.': return this.makeToken(TokenType.DOT, '.', startCol);
      case ':': return this.makeToken(TokenType.COLON, ':', startCol);
      default:
        throw this.error(`Unexpected character '${char}'`);
    }
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        if (char === '\n') {
          this.line++;
          this.column = 0;
        }
        this.advance();
      } else {
        break;
      }
    }
  }

  private makeToken(type: TokenType, value: string, column?: number): Token {
    return { type, value, line: this.line, column: column ?? this.column };
  }

  private peek(): string {
    return this.source[this.pos] ?? '\0';
  }

  private peekNext(): string {
    return this.source[this.pos + 1] ?? '\0';
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.peek() !== expected) return false;
    this.advance();
    return true;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
           (char >= 'A' && char <= 'Z') ||
           char === '_';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private error(message: string): Error {
    return new Error(`[Lexer Error] Line ${this.line}, Column ${this.column}: ${message}`);
  }
}
