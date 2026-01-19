export enum TokenType {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  IDENTIFIER = 'IDENTIFIER',

  // Keywords
  STATE = 'STATE',
  TRANSITION = 'TRANSITION',
  WHEN = 'WHEN',
  LET = 'LET',
  FN = 'FN',
  IF = 'IF',
  ELSE = 'ELSE',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  RETURN = 'RETURN',
  PRINT = 'PRINT',

  // Operators
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',
  ARROW = 'ARROW',         // ->

  // Comparison
  EQ = 'EQ',               // ==
  NEQ = 'NEQ',             // !=
  LT = 'LT',
  GT = 'GT',
  LTE = 'LTE',
  GTE = 'GTE',

  // Assignment
  ASSIGN = 'ASSIGN',       // =

  // Delimiters
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  COMMA = 'COMMA',
  SEMICOLON = 'SEMICOLON',
  DOT = 'DOT',
  COLON = 'COLON',

  // Special
  EOF = 'EOF',
  NEWLINE = 'NEWLINE',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export const KEYWORDS: Record<string, TokenType> = {
  state: TokenType.STATE,
  transition: TokenType.TRANSITION,
  when: TokenType.WHEN,
  let: TokenType.LET,
  fn: TokenType.FN,
  if: TokenType.IF,
  else: TokenType.ELSE,
  true: TokenType.TRUE,
  false: TokenType.FALSE,
  return: TokenType.RETURN,
  print: TokenType.PRINT,
};
