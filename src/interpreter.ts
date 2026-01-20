import * as AST from './ast';
import { CompiledState, CompilationResult } from './compiler';
import * as http from 'http';

// ============ Runtime Values ============

export type RuValue =
  | RuNumber
  | RuString
  | RuBoolean
  | RuNull
  | RuArray
  | RuObject
  | RuFunction
  | RuStateType
  | RuStateInstance
  | RuNativeFunction
  | RuRequest
  | RuResponse;

interface RuRequest {
  type: 'request';
  method: string;
  path: string;
  params: Map<string, string>;
  query: Map<string, string>;
  headers: Map<string, string>;
  body: RuValue;
}

interface RuResponse {
  type: 'response';
  statusCode: number;
  headers: Map<string, string>;
  body: RuValue | null;
  sent: boolean;
}

interface RuNumber { type: 'number'; value: number; }
interface RuString { type: 'string'; value: string; }
interface RuBoolean { type: 'boolean'; value: boolean; }
interface RuNull { type: 'null'; }
interface RuArray { type: 'array'; elements: RuValue[]; }
interface RuObject { type: 'object'; properties: Map<string, RuValue>; }
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

// ============ Next Exception ============

class NextCall {
  constructor() {}
}

// ============ Route Definition ============

interface RouteHandler {
  method: AST.HttpMethod;
  pathPattern: string;
  pathRegex: RegExp;
  paramNames: string[];
  middlewares: string[];
  body: AST.BlockStatement;
}

interface MiddlewareHandler {
  name: string;
  body: AST.BlockStatement;
}

// ============ Interpreter ============

export class Interpreter {
  private globalEnv: Environment;
  private compiled: CompilationResult;
  private output: string[] = [];
  private routes: RouteHandler[] = [];
  private middlewares: Map<string, MiddlewareHandler> = new Map();
  private globalMiddlewares: string[] = [];
  private serverPort: number = 3000;

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

    // Register built-in http object
    const httpProps = new Map<string, RuValue>();
    httpProps.set('get', {
      type: 'native',
      fn: (args) => this.httpGet(args),
    });
    httpProps.set('post', {
      type: 'native',
      fn: (args) => this.httpPost(args),
    });
    this.globalEnv.define('http', { type: 'object', properties: httpProps });

    // Register JSON helper
    const jsonProps = new Map<string, RuValue>();
    jsonProps.set('parse', {
      type: 'native',
      fn: (args) => this.jsonParse(args),
    });
    jsonProps.set('stringify', {
      type: 'native',
      fn: (args) => this.jsonStringify(args),
    });
    this.globalEnv.define('json', { type: 'object', properties: jsonProps });

    // Register next() for middleware
    this.globalEnv.define('next', {
      type: 'native',
      fn: () => {
        throw new NextCall();
      },
    });

    // Register db helper (mock in-memory database)
    this.globalEnv.define('db', this.createDbObject());
  }

  private createDbObject(): RuObject {
    const store = new Map<string, RuValue[]>();  // collection -> documents

    const props = new Map<string, RuValue>();

    // db.find(collection, query)
    props.set('find', {
      type: 'native',
      fn: (args) => {
        if (args.length < 1 || args[0].type !== 'string') {
          throw new Error('[Runtime Error] db.find() requires collection name');
        }
        const collection = args[0].value;
        const docs = store.get(collection) || [];
        return { type: 'array', elements: [...docs] };
      },
    });

    // db.findOne(collection, query)
    props.set('findOne', {
      type: 'native',
      fn: (args) => {
        if (args.length < 2 || args[0].type !== 'string' || args[1].type !== 'object') {
          throw new Error('[Runtime Error] db.findOne() requires collection name and query object');
        }
        const collection = args[0].value;
        const query = args[1];
        const docs = store.get(collection) || [];

        for (const doc of docs) {
          if (doc.type === 'object' && this.matchesQuery(doc, query)) {
            return doc;
          }
        }
        return { type: 'null' };
      },
    });

    // db.insert(collection, doc)
    props.set('insert', {
      type: 'native',
      fn: (args) => {
        if (args.length < 2 || args[0].type !== 'string') {
          throw new Error('[Runtime Error] db.insert() requires collection name and document');
        }
        const collection = args[0].value;
        const doc = args[1];

        if (!store.has(collection)) {
          store.set(collection, []);
        }

        // Add auto-generated id
        if (doc.type === 'object' && !doc.properties.has('id')) {
          doc.properties.set('id', { type: 'number', value: Date.now() });
        }

        store.get(collection)!.push(doc);
        return doc;
      },
    });

    // db.update(collection, query, update)
    props.set('update', {
      type: 'native',
      fn: (args) => {
        if (args.length < 3 || args[0].type !== 'string' || args[1].type !== 'object' || args[2].type !== 'object') {
          throw new Error('[Runtime Error] db.update() requires collection, query, and update objects');
        }
        const collection = args[0].value;
        const query = args[1];
        const update = args[2];
        const docs = store.get(collection) || [];

        let count = 0;
        for (const doc of docs) {
          if (doc.type === 'object' && this.matchesQuery(doc, query)) {
            update.properties.forEach((v, k) => {
              doc.properties.set(k, v);
            });
            count++;
          }
        }

        return { type: 'number', value: count };
      },
    });

    // db.delete(collection, query)
    props.set('delete', {
      type: 'native',
      fn: (args) => {
        if (args.length < 2 || args[0].type !== 'string' || args[1].type !== 'object') {
          throw new Error('[Runtime Error] db.delete() requires collection name and query object');
        }
        const collection = args[0].value;
        const query = args[1];
        const docs = store.get(collection) || [];

        const newDocs = docs.filter(doc => {
          return doc.type !== 'object' || !this.matchesQuery(doc, query);
        });

        const deleted = docs.length - newDocs.length;
        store.set(collection, newDocs);

        return { type: 'number', value: deleted };
      },
    });

    return { type: 'object', properties: props };
  }

  private matchesQuery(doc: RuObject, query: RuObject): boolean {
    for (const [key, expectedValue] of query.properties) {
      const actualValue = doc.properties.get(key);
      if (!actualValue || !this.isEqual(actualValue, expectedValue)) {
        return false;
      }
    }
    return true;
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

      case 'EndpointDeclaration':
        return this.executeEndpointDeclaration(stmt);

      case 'MiddlewareDeclaration':
        return this.executeMiddlewareDeclaration(stmt);

      case 'UseStatement':
        return this.executeUseStatement(stmt);

      case 'ValidateStatement':
        return this.executeValidateStatement(stmt, env);

      case 'ServerDeclaration':
        return this.executeServerDeclaration(stmt, env);

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

      case 'NullLiteral':
        return { type: 'null' };

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

      case 'ObjectExpression': {
        const properties = new Map<string, RuValue>();
        for (const prop of expr.properties) {
          properties.set(prop.key, this.evaluate(prop.value, env));
        }
        return { type: 'object', properties };
      }

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

    // Short-circuit evaluation for and/or
    if (expr.operator === 'and') {
      const left = this.evaluate(expr.left, env);
      if (!this.isTruthy(left)) return { type: 'boolean', value: false };
      return { type: 'boolean', value: this.isTruthy(this.evaluate(expr.right, env)) };
    }

    if (expr.operator === 'or') {
      const left = this.evaluate(expr.left, env);
      if (this.isTruthy(left)) return { type: 'boolean', value: true };
      return { type: 'boolean', value: this.isTruthy(this.evaluate(expr.right, env)) };
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

    // Object property access
    if (object.type === 'object') {
      const value = object.properties.get(property);
      if (value === undefined) {
        return { type: 'null' };
      }
      return value;
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
      case 'object': {
        const pairs: string[] = [];
        for (const [k, v] of value.properties) {
          pairs.push(`${k}: ${this.stringify(v)}`);
        }
        return '{' + pairs.join(', ') + '}';
      }
      default: return '<unknown>';
    }
  }

  // ============ Built-in HTTP Functions (Mock) ============

  private mockData: Record<string, unknown> = {
    '/api/order/123': {
      id: 123,
      status: 'pending',
      items: [
        { productId: 1, quantity: 2, price: 10000 },
        { productId: 2, quantity: 1, price: 25000 },
      ],
      total: 45000,
    },
    '/api/stock/1': { productId: 1, available: 100 },
    '/api/stock/2': { productId: 2, available: 0 },
    '/api/payment': { success: true, transactionId: 'TXN-001' },
  };

  private httpGet(args: RuValue[]): RuValue {
    if (args.length !== 1 || args[0].type !== 'string') {
      throw new Error('[Runtime Error] http.get() requires a URL string');
    }

    const url = args[0].value;
    const data = this.mockData[url];

    if (data === undefined) {
      return this.jsToRuValue({ error: 'Not Found', status: 404 });
    }

    return this.jsToRuValue(data);
  }

  private httpPost(args: RuValue[]): RuValue {
    if (args.length < 1 || args[0].type !== 'string') {
      throw new Error('[Runtime Error] http.post() requires a URL string');
    }

    const url = args[0].value;
    const data = this.mockData[url];

    if (data === undefined) {
      return this.jsToRuValue({ error: 'Not Found', status: 404 });
    }

    return this.jsToRuValue(data);
  }

  private jsonParse(args: RuValue[]): RuValue {
    if (args.length !== 1 || args[0].type !== 'string') {
      throw new Error('[Runtime Error] json.parse() requires a string');
    }

    try {
      const parsed = JSON.parse(args[0].value);
      return this.jsToRuValue(parsed);
    } catch {
      throw new Error('[Runtime Error] Invalid JSON string');
    }
  }

  private jsonStringify(args: RuValue[]): RuValue {
    if (args.length !== 1) {
      throw new Error('[Runtime Error] json.stringify() requires one argument');
    }

    return { type: 'string', value: this.stringify(args[0]) };
  }

  private jsToRuValue(value: unknown): RuValue {
    if (value === null || value === undefined) {
      return { type: 'null' };
    }
    if (typeof value === 'number') {
      return { type: 'number', value };
    }
    if (typeof value === 'string') {
      return { type: 'string', value };
    }
    if (typeof value === 'boolean') {
      return { type: 'boolean', value };
    }
    if (Array.isArray(value)) {
      return { type: 'array', elements: value.map(v => this.jsToRuValue(v)) };
    }
    if (typeof value === 'object') {
      const properties = new Map<string, RuValue>();
      for (const [k, v] of Object.entries(value)) {
        properties.set(k, this.jsToRuValue(v));
      }
      return { type: 'object', properties };
    }
    return { type: 'null' };
  }

  // ============ API Execution Methods ============

  private executeEndpointDeclaration(stmt: AST.EndpointDeclaration): RuValue {
    const { paramNames, regex } = this.parsePathPattern(stmt.path);

    this.routes.push({
      method: stmt.method,
      pathPattern: stmt.path,
      pathRegex: regex,
      paramNames,
      middlewares: stmt.middlewares,
      body: stmt.body,
    });

    console.log(`[Rulang] Registered endpoint: ${stmt.method} ${stmt.path}`);
    return { type: 'null' };
  }

  private parsePathPattern(path: string): { paramNames: string[]; regex: RegExp } {
    const paramNames: string[] = [];
    const regexStr = path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    return { paramNames, regex: new RegExp(`^${regexStr}$`) };
  }

  private executeMiddlewareDeclaration(stmt: AST.MiddlewareDeclaration): RuValue {
    this.middlewares.set(stmt.name, {
      name: stmt.name,
      body: stmt.body,
    });

    console.log(`[Rulang] Registered middleware: ${stmt.name}`);
    return { type: 'null' };
  }

  private executeUseStatement(stmt: AST.UseStatement): RuValue {
    for (const mw of stmt.middlewares) {
      this.globalMiddlewares.push(mw);
      console.log(`[Rulang] Using global middleware: ${mw}`);
    }
    return { type: 'null' };
  }

  private executeValidateStatement(stmt: AST.ValidateStatement, env: Environment): RuValue {
    const target = this.evaluate(stmt.target, env);
    this.validateValue(target, stmt.fields, 'root');
    return { type: 'null' };
  }

  private validateValue(value: RuValue, fields: AST.ValidationField[], path: string): void {
    if (value.type !== 'object') {
      throw new Error(`[Validation Error] Expected object at '${path}', got ${value.type}`);
    }

    for (const field of fields) {
      const fieldValue = value.properties.get(field.name);
      const fieldPath = path === 'root' ? field.name : `${path}.${field.name}`;

      if (fieldValue === undefined || fieldValue.type === 'null') {
        if (!field.optional) {
          throw new Error(`[Validation Error] Missing required field '${fieldPath}'`);
        }
        continue;
      }

      // Type check
      const actualType = fieldValue.type;
      const expectedType = field.fieldType;

      if (expectedType === 'string' && actualType !== 'string') {
        throw new Error(`[Validation Error] Field '${fieldPath}' expected string, got ${actualType}`);
      }
      if (expectedType === 'number' && actualType !== 'number') {
        throw new Error(`[Validation Error] Field '${fieldPath}' expected number, got ${actualType}`);
      }
      if (expectedType === 'boolean' && actualType !== 'boolean') {
        throw new Error(`[Validation Error] Field '${fieldPath}' expected boolean, got ${actualType}`);
      }
      if (expectedType === 'array' && actualType !== 'array') {
        throw new Error(`[Validation Error] Field '${fieldPath}' expected array, got ${actualType}`);
      }
      if (expectedType === 'object' && actualType !== 'object') {
        throw new Error(`[Validation Error] Field '${fieldPath}' expected object, got ${actualType}`);
      }

      // Nested validation
      if (expectedType === 'object' && field.nested && actualType === 'object') {
        this.validateValue(fieldValue, field.nested, fieldPath);
      }
    }
  }

  private executeServerDeclaration(stmt: AST.ServerDeclaration, env: Environment): RuValue {
    const portValue = this.evaluate(stmt.port, env);
    if (portValue.type !== 'number') {
      throw new Error('[Runtime Error] Server port must be a number');
    }
    this.serverPort = portValue.value;
    return { type: 'null' };
  }

  // ============ HTTP Server ============

  startServer(): void {
    if (this.routes.length === 0) {
      console.log('[Rulang] No endpoints registered. Server not started.');
      return;
    }

    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(this.serverPort, () => {
      console.log(`[Rulang] Server running at http://localhost:${this.serverPort}`);
      console.log(`[Rulang] ${this.routes.length} endpoint(s) registered`);
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const method = req.method as AST.HttpMethod;
    const urlObj = new URL(req.url || '/', `http://localhost:${this.serverPort}`);
    const path = urlObj.pathname;

    // Find matching route
    let matchedRoute: RouteHandler | null = null;
    let params: Map<string, string> = new Map();

    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = path.match(route.pathRegex);
      if (match) {
        matchedRoute = route;
        route.paramNames.forEach((name, i) => {
          params.set(name, match[i + 1]);
        });
        break;
      }
    }

    if (!matchedRoute) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    // Parse query params
    const query = new Map<string, string>();
    urlObj.searchParams.forEach((value, key) => {
      query.set(key, value);
    });

    // Parse headers
    const headers = new Map<string, string>();
    for (const [key, value] of Object.entries(req.headers)) {
      headers.set(key.toLowerCase(), Array.isArray(value) ? value.join(', ') : value || '');
    }

    // Collect body
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let parsedBody: RuValue = { type: 'null' };
      if (body) {
        try {
          parsedBody = this.jsToRuValue(JSON.parse(body));
        } catch {
          parsedBody = { type: 'string', value: body };
        }
      }

      // Create request object
      const ruReq: RuRequest = {
        type: 'request',
        method,
        path,
        params,
        query,
        headers,
        body: parsedBody,
      };

      // Create response object
      const ruRes: RuResponse = {
        type: 'response',
        statusCode: 200,
        headers: new Map([['Content-Type', 'application/json']]),
        body: null,
        sent: false,
      };

      this.executeRoute(matchedRoute!, ruReq, ruRes, res);
    });
  }

  private executeRoute(
    route: RouteHandler,
    ruReq: RuRequest,
    ruRes: RuResponse,
    httpRes: http.ServerResponse
  ): void {
    const env = new Environment(this.globalEnv);

    // Setup req/res objects
    env.define('req', this.createRequestObject(ruReq));
    env.define('res', this.createResponseObject(ruRes, httpRes));

    // Collect middlewares to run
    const middlewaresToRun = [...this.globalMiddlewares, ...route.middlewares];

    try {
      // Run middlewares
      for (const mwName of middlewaresToRun) {
        const middleware = this.middlewares.get(mwName);
        if (!middleware) {
          throw new Error(`[Runtime Error] Unknown middleware '${mwName}'`);
        }

        try {
          this.executeBlock(middleware.body.body, new Environment(env));
        } catch (e) {
          if (e instanceof NextCall) {
            continue;
          }
          if (e instanceof ReturnValue) {
            // Middleware returned early, stop chain
            break;
          }
          throw e;
        }

        if (ruRes.sent) return;
      }

      // Run endpoint handler
      this.executeBlock(route.body.body, new Environment(env));

      // If response not sent, send default
      if (!ruRes.sent) {
        this.sendResponse(ruRes, httpRes);
      }
    } catch (e) {
      if (e instanceof ReturnValue) {
        if (!ruRes.sent) {
          this.sendResponse(ruRes, httpRes);
        }
        return;
      }

      console.error('[Rulang Error]', e);
      if (!ruRes.sent) {
        httpRes.writeHead(500, { 'Content-Type': 'application/json' });
        httpRes.end(JSON.stringify({
          error: 'Internal Server Error',
          message: e instanceof Error ? e.message : String(e),
        }));
      }
    }
  }

  private createRequestObject(ruReq: RuRequest): RuObject {
    const props = new Map<string, RuValue>();

    props.set('method', { type: 'string', value: ruReq.method });
    props.set('path', { type: 'string', value: ruReq.path });
    props.set('body', ruReq.body);

    // params object
    const paramsProps = new Map<string, RuValue>();
    ruReq.params.forEach((v, k) => paramsProps.set(k, { type: 'string', value: v }));
    props.set('params', { type: 'object', properties: paramsProps });

    // query object
    const queryProps = new Map<string, RuValue>();
    ruReq.query.forEach((v, k) => queryProps.set(k, { type: 'string', value: v }));
    props.set('query', { type: 'object', properties: queryProps });

    // headers object
    const headersProps = new Map<string, RuValue>();
    ruReq.headers.forEach((v, k) => headersProps.set(k, { type: 'string', value: v }));
    props.set('headers', { type: 'object', properties: headersProps });

    return { type: 'object', properties: props };
  }

  private createResponseObject(ruRes: RuResponse, httpRes: http.ServerResponse): RuObject {
    const props = new Map<string, RuValue>();

    // res.json(data)
    props.set('json', {
      type: 'native',
      fn: (args) => {
        if (args.length > 0) {
          ruRes.body = args[0];
        }
        ruRes.headers.set('Content-Type', 'application/json');
        this.sendResponse(ruRes, httpRes);
        return { type: 'null' };
      },
    });

    // res.text(str)
    props.set('text', {
      type: 'native',
      fn: (args) => {
        if (args.length > 0 && args[0].type === 'string') {
          ruRes.body = args[0];
        }
        ruRes.headers.set('Content-Type', 'text/plain');
        this.sendResponse(ruRes, httpRes);
        return { type: 'null' };
      },
    });

    // res.status(code) - chainable
    props.set('status', {
      type: 'native',
      fn: (args) => {
        if (args.length > 0 && args[0].type === 'number') {
          ruRes.statusCode = args[0].value;
        }
        return { type: 'object', properties: props };
      },
    });

    // res.header(key, value)
    props.set('header', {
      type: 'native',
      fn: (args) => {
        if (args.length >= 2 && args[0].type === 'string' && args[1].type === 'string') {
          ruRes.headers.set(args[0].value, args[1].value);
        }
        return { type: 'object', properties: props };
      },
    });

    // res.redirect(url)
    props.set('redirect', {
      type: 'native',
      fn: (args) => {
        if (args.length > 0 && args[0].type === 'string') {
          ruRes.statusCode = 302;
          ruRes.headers.set('Location', args[0].value);
          ruRes.body = { type: 'null' };
          this.sendResponse(ruRes, httpRes);
        }
        return { type: 'null' };
      },
    });

    return { type: 'object', properties: props };
  }

  private sendResponse(ruRes: RuResponse, httpRes: http.ServerResponse): void {
    if (ruRes.sent) return;
    ruRes.sent = true;

    const headers: Record<string, string> = {};
    ruRes.headers.forEach((v, k) => { headers[k] = v; });

    httpRes.writeHead(ruRes.statusCode, headers);

    if (ruRes.body === null || ruRes.body.type === 'null') {
      httpRes.end();
    } else if (ruRes.body.type === 'string') {
      httpRes.end(ruRes.body.value);
    } else {
      httpRes.end(JSON.stringify(this.ruValueToJs(ruRes.body)));
    }
  }

  private ruValueToJs(value: RuValue): unknown {
    switch (value.type) {
      case 'null': return null;
      case 'number': return value.value;
      case 'string': return value.value;
      case 'boolean': return value.value;
      case 'array': return value.elements.map(e => this.ruValueToJs(e));
      case 'object': {
        const obj: Record<string, unknown> = {};
        value.properties.forEach((v, k) => { obj[k] = this.ruValueToJs(v); });
        return obj;
      }
      default: return null;
    }
  }

  hasEndpoints(): boolean {
    return this.routes.length > 0;
  }
}
