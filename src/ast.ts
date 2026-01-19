export type ASTNode =
  | Program
  | Statement
  | Expression;

export interface Program {
  type: 'Program';
  body: Statement[];
}

// ============ Statements ============

export type Statement =
  | StateDeclaration
  | TransitionDeclaration
  | LetStatement
  | FunctionDeclaration
  | ExpressionStatement
  | PrintStatement
  | IfStatement
  | ReturnStatement
  | BlockStatement;

export interface StateDeclaration {
  type: 'StateDeclaration';
  name: string;
  states: string[];
  line: number;
}

export interface TransitionRule {
  from: string;
  to: string;
  event: string;  // e.g., "payment.success"
}

export interface TransitionDeclaration {
  type: 'TransitionDeclaration';
  stateName: string;
  rules: TransitionRule[];
  line: number;
}

export interface LetStatement {
  type: 'LetStatement';
  name: string;
  value: Expression;
  line: number;
}

export interface FunctionDeclaration {
  type: 'FunctionDeclaration';
  name: string;
  params: string[];
  body: BlockStatement;
  line: number;
}

export interface ExpressionStatement {
  type: 'ExpressionStatement';
  expression: Expression;
  line: number;
}

export interface PrintStatement {
  type: 'PrintStatement';
  argument: Expression;
  line: number;
}

export interface IfStatement {
  type: 'IfStatement';
  condition: Expression;
  consequent: BlockStatement;
  alternate: BlockStatement | IfStatement | null;
  line: number;
}

export interface ReturnStatement {
  type: 'ReturnStatement';
  argument: Expression | null;
  line: number;
}

export interface BlockStatement {
  type: 'BlockStatement';
  body: Statement[];
  line: number;
}

// ============ Expressions ============

export type Expression =
  | Identifier
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | MemberExpression
  | ArrayExpression
  | FunctionExpression;

export interface Identifier {
  type: 'Identifier';
  name: string;
  line: number;
}

export interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
  line: number;
}

export interface StringLiteral {
  type: 'StringLiteral';
  value: string;
  line: number;
}

export interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
  line: number;
}

export interface BinaryExpression {
  type: 'BinaryExpression';
  operator: string;
  left: Expression;
  right: Expression;
  line: number;
}

export interface UnaryExpression {
  type: 'UnaryExpression';
  operator: string;
  argument: Expression;
  line: number;
}

export interface CallExpression {
  type: 'CallExpression';
  callee: Expression;
  arguments: Expression[];
  line: number;
}

export interface MemberExpression {
  type: 'MemberExpression';
  object: Expression;
  property: string;
  line: number;
}

export interface ArrayExpression {
  type: 'ArrayExpression';
  elements: Expression[];
  line: number;
}

export interface FunctionExpression {
  type: 'FunctionExpression';
  params: string[];
  body: BlockStatement;
  line: number;
}
