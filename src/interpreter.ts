import * as AST from './ast';
import { CompiledState, CompilationResult } from './compiler';

// ============ Runtime Values ============

export type RuValue =
  | RuNumber
  | RuString
  | RuBoolean
  | RuNull
  | RuArray
  | RuFunction
  | RuStateType
  | RuStateInstance
  | RuNativeFunction;

interface RuNumber { type: 'number'; value: number; }
interface RuString { type: 'string'; value: string; }
interface RuBoolean { type: 'boolean'; value: boolean; }
interface RuNull { type: 'null'; }
interface RuArray { type: 'array'; elements: RuValue[]; }
interface RuFunction {
  type: 'function';
  params: string[];
  body: AST.BlockStatement;
  closure: Environment;
}
interface RuNativeFunction {
  type: 'native';
  fn: (args: RuValue[]) => RuValue;
}
interface RuStateType {
  type: 'state-type';
  compiled: CompiledState;
}
interface RuStateInstance {
  type: 'state-instance';
  compiled: CompiledState;
  currentState: number;
  history: number[];
}

// ============ Environment (Scope) ============

class Environment {
  private values: Map<string, RuValue> = new Map();
  private parent: Environment | null;

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  define(name: string, value: RuValue): void {
    this.values.set(name, value);
  }

  get(name: string): RuValue {
    if (this.values.has(name)) {
      return this.values.get(name)!;
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new Error(`[Runtime Error] Undefined variable '${name}'`);
  }

  set(name: string, value: RuValue): void {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.set(name, value);
      return;
    }
    throw new Error(`[Runtime Error] Undefined variable '${name}'`);
  }

  has(name: string): boolean {
    if (this.values.has(name)) return true;
    if (this.parent) return this.parent.has(name);
    return false;
  }
}

// ============ Return Exception ============

class ReturnValue {
  constructor(public value: RuValue) {}
}

// ============ Interpreter ============

export class Interpreter {
  private globalEnv: Environment;
  private compiled: CompilationResult;
  private output: string[] = [];

  constructor(compiled: CompilationResult) {
    this.compiled = compiled;
    this.globalEnv = new Environment();
    this.setupGlobals();
  }

  private setupGlobals(): void {
    // Register state types
    for (const [name, compiledState] of this.compiled.states) {
      this.globalEnv.define(name, {
        type: 'state-type',
        compiled: compiledState,
      });
    }
  }

  run(): string[] {
    this.output = [];
    this.executeBlock(this.compiled.program.body, this.globalEnv);
    return this.output;
  }

  private executeBlock(statements: AST.Statement[], env: Environment): RuValue {
    let result: RuValue = { type: 'null' };

    for (const stmt of statements) {
      result = this.executeStatement(stmt, env);
    }

    return result;
  }

  private executeStatement(stmt: AST.Statement, env: Environment): RuValue {
    switch (stmt.type) {
      case 'StateDeclaration':
      case 'TransitionDeclaration':
        // Already handled in compilation
        return { type: 'null' };

      case 'LetStatement':
        return this.executeLetStatement(stmt, env);

      case 'FunctionDeclaration':
        return this.executeFunctionDeclaration(stmt, env);

      case 'ExpressionStatement':
        return this.evaluate(stmt.expression, env);

      case 'PrintStatement':
        return this.executePrintStatement(stmt, env);

      case 'IfStatement':
        return this.executeIfStatement(stmt, env);

      case 'ReturnStatement':
        const value = stmt.argument ? this.evaluate(stmt.argument, env) : { type: 'null' as const };
        throw new ReturnValue(value);

      case 'BlockStatement':
        return this.executeBlock(stmt.body, new Environment(env));

      default:
        throw new Error(`Unknown statement type: ${(stmt as AST.Statement).type}`);
    }
  }

  private executeLetStatement(stmt: AST.LetStatement, env: Environment): RuValue {
    const value = this.evaluate(stmt.value, env);
    env.define(stmt.name, value);
    return value;
  }

  private executeFunctionDeclaration(stmt: AST.FunctionDeclaration, env: Environment): RuValue {
    const fn: RuFunction = {
      type: 'function',
      params: stmt.params,
      body: stmt.body,
      closure: env,
    };
    env.define(stmt.name, fn);
    return fn;
  }

  private executePrintStatement(stmt: AST.PrintStatement, env: Environment): RuValue {
    const value = this.evaluate(stmt.argument, env);
    const str = this.stringify(value);
    this.output.push(str);
    console.log(str);
    return { type: 'null' };
  }

  private executeIfStatement(stmt: AST.IfStatement, env: Environment): RuValue {
    const condition = this.evaluate(stmt.condition, env);

    if (this.isTruthy(condition)) {
      return this.executeBlock(stmt.consequent.body, new Environment(env));
    } else if (stmt.alternate) {
      if (stmt.alternate.type === 'BlockStatement') {
        return this.executeBlock(stmt.alternate.body, new Environment(env));
      } else {
        return this.executeIfStatement(stmt.alternate, env);
      }
    }

    return { type: 'null' };
  }

  // ============ Expression Evaluation ============

  private evaluate(expr: AST.Expression, env: Environment): RuValue {
    switch (expr.type) {
      case 'NumberLiteral':
        return { type: 'number', value: expr.value };

      case 'StringLiteral':
        return { type: 'string', value: expr.value };

      case 'BooleanLiteral':
        return { type: 'boolean', value: expr.value };

      case 'Identifier':
        return env.get(expr.name);

      case 'BinaryExpression':
        return this.evaluateBinaryExpression(expr, env);

      case 'UnaryExpression':
        return this.evaluateUnaryExpression(expr, env);

      case 'CallExpression':
        return this.evaluateCallExpression(expr, env);

      case 'MemberExpression':
        return this.evaluateMemberExpression(expr, env);

      case 'ArrayExpression':
        return {
          type: 'array',
          elements: expr.elements.map(e => this.evaluate(e, env)),
        };

      case 'FunctionExpression':
        return {
          type: 'function',
          params: expr.params,
          body: expr.body,
          closure: env,
        };

      default:
        throw new Error(`Unknown expression type: ${(expr as AST.Expression).type}`);
    }
  }

  private evaluateBinaryExpression(expr: AST.BinaryExpression, env: Environment): RuValue {
    // Handle assignment
    if (expr.operator === '=') {
      if (expr.left.type !== 'Identifier') {
        throw new Error('[Runtime Error] Invalid assignment target');
      }
      const value = this.evaluate(expr.right, env);
      env.set(expr.left.name, value);
      return value;
    }

    const left = this.evaluate(expr.left, env);
    const right = this.evaluate(expr.right, env);

    // Arithmetic
    if (left.type === 'number' && right.type === 'number') {
      switch (expr.operator) {
        case '+': return { type: 'number', value: left.value + right.value };
        case '-': return { type: 'number', value: left.value - right.value };
        case '*': return { type: 'number', value: left.value * right.value };
        case '/': return { type: 'number', value: left.value / right.value };
        case '%': return { type: 'number', value: left.value % right.value };
        case '<': return { type: 'boolean', value: left.value < right.value };
        case '>': return { type: 'boolean', value: left.value > right.value };
        case '<=': return { type: 'boolean', value: left.value <= right.value };
        case '>=': return { type: 'boolean', value: left.value >= right.value };
        case '==': return { type: 'boolean', value: left.value === right.value };
        case '!=': return { type: 'boolean', value: left.value !== right.value };
      }
    }

    // String concatenation
    if (expr.operator === '+' && (left.type === 'string' || right.type === 'string')) {
      return { type: 'string', value: this.stringify(left) + this.stringify(right) };
    }

    // Equality for other types
    if (expr.operator === '==' || expr.operator === '!=') {
      const equal = this.isEqual(left, right);
      return { type: 'boolean', value: expr.operator === '==' ? equal : !equal };
    }

    throw new Error(`[Runtime Error] Invalid operation: ${left.type} ${expr.operator} ${right.type}`);
  }

  private evaluateUnaryExpression(expr: AST.UnaryExpression, env: Environment): RuValue {
    const arg = this.evaluate(expr.argument, env);

    if (expr.operator === '-' && arg.type === 'number') {
      return { type: 'number', value: -arg.value };
    }

    throw new Error(`[Runtime Error] Invalid unary operation: ${expr.operator}${arg.type}`);
  }

  private evaluateCallExpression(expr: AST.CallExpression, env: Environment): RuValue {
    const callee = this.evaluate(expr.callee, env);
    const args = expr.arguments.map(arg => this.evaluate(arg, env));

    if (callee.type === 'function') {
      return this.callFunction(callee, args);
    }

    if (callee.type === 'native') {
      return callee.fn(args);
    }

    throw new Error(`[Runtime Error] Cannot call non-function value`);
  }

  private evaluateMemberExpression(expr: AST.MemberExpression, env: Environment): RuValue {
    const object = this.evaluate(expr.object, env);
    const property = expr.property;

    // StateType.new()
    if (object.type === 'state-type') {
      if (property === 'new') {
        return {
          type: 'native',
          fn: () => this.createStateInstance(object.compiled),
        };
      }
      throw new Error(`[Runtime Error] Unknown property '${property}' on state type`);
    }

    // StateInstance.state, .history, .apply(), .rollback()
    if (object.type === 'state-instance') {
      switch (property) {
        case 'state':
          return {
            type: 'string',
            value: object.compiled.definition.stateNames[object.currentState],
          };

        case 'history':
          return {
            type: 'array',
            elements: object.history.map(id => ({
              type: 'string' as const,
              value: object.compiled.definition.stateNames[id],
            })),
          };

        case 'apply':
          return {
            type: 'native',
            fn: (args) => this.applyEvent(object, args),
          };

        case 'rollback':
          return {
            type: 'native',
            fn: () => this.rollback(object),
          };

        default:
          throw new Error(`[Runtime Error] Unknown property '${property}' on state instance`);
      }
    }

    // Array.length
    if (object.type === 'array' && property === 'length') {
      return { type: 'number', value: object.elements.length };
    }

    throw new Error(`[Runtime Error] Cannot access property '${property}' on ${object.type}`);
  }

  // ============ State Machine Operations ============

  private createStateInstance(compiled: CompiledState): RuStateInstance {
    return {
      type: 'state-instance',
      compiled,
      currentState: compiled.definition.initialState,
      history: [compiled.definition.initialState],
    };
  }

  private applyEvent(instance: RuStateInstance, args: RuValue[]): RuValue {
    if (args.length !== 1 || args[0].type !== 'string') {
      throw new Error('[Runtime Error] apply() requires a string event argument');
    }

    const event = args[0].value;
    const { transitions } = instance.compiled.transitionTable;
    const fromState = instance.currentState;

    const eventMap = transitions.get(fromState);
    if (!eventMap || !eventMap.has(event)) {
      const currentStateName = instance.compiled.definition.stateNames[fromState];
      throw new Error(
        `[Runtime Error] Invalid transition: Cannot apply '${event}' in state '${currentStateName}'`
      );
    }

    const toState = eventMap.get(event)!;
    instance.currentState = toState;
    instance.history.push(toState);

    return { type: 'null' };
  }

  private rollback(instance: RuStateInstance): RuValue {
    if (instance.history.length <= 1) {
      throw new Error('[Runtime Error] Cannot rollback: no previous state');
    }

    instance.history.pop();
    instance.currentState = instance.history[instance.history.length - 1];

    return {
      type: 'string',
      value: instance.compiled.definition.stateNames[instance.currentState],
    };
  }

  // ============ Helpers ============

  private callFunction(fn: RuFunction, args: RuValue[]): RuValue {
    const fnEnv = new Environment(fn.closure);

    for (let i = 0; i < fn.params.length; i++) {
      fnEnv.define(fn.params[i], args[i] ?? { type: 'null' });
    }

    try {
      this.executeBlock(fn.body.body, fnEnv);
      return { type: 'null' };
    } catch (e) {
      if (e instanceof ReturnValue) {
        return e.value;
      }
      throw e;
    }
  }

  private isTruthy(value: RuValue): boolean {
    if (value.type === 'null') return false;
    if (value.type === 'boolean') return value.value;
    if (value.type === 'number') return value.value !== 0;
    if (value.type === 'string') return value.value.length > 0;
    return true;
  }

  private isEqual(a: RuValue, b: RuValue): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'null') return true;
    if (a.type === 'number' && b.type === 'number') return a.value === b.value;
    if (a.type === 'string' && b.type === 'string') return a.value === b.value;
    if (a.type === 'boolean' && b.type === 'boolean') return a.value === b.value;
    return false;
  }

  private stringify(value: RuValue): string {
    switch (value.type) {
      case 'null': return 'null';
      case 'number': return String(value.value);
      case 'string': return value.value;
      case 'boolean': return String(value.value);
      case 'array': return '[' + value.elements.map(e => this.stringify(e)).join(', ') + ']';
      case 'function': return '<function>';
      case 'native': return '<native function>';
      case 'state-type': return `<state-type ${value.compiled.definition.name}>`;
      case 'state-instance': {
        const name = value.compiled.definition.name;
        const state = value.compiled.definition.stateNames[value.currentState];
        return `<${name}: ${state}>`;
      }
      default: return '<unknown>';
    }
  }
}
