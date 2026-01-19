import * as AST from './ast';

export interface StateDefinition {
  name: string;
  states: Map<string, number>;      // state name -> state ID
  stateNames: string[];             // state ID -> state name
  initialState: number;
}

export interface TransitionTable {
  // Map<fromStateId, Map<eventName, toStateId>>
  transitions: Map<number, Map<string, number>>;
}

export interface CompiledState {
  definition: StateDefinition;
  transitionTable: TransitionTable;
}

export interface CompilationResult {
  states: Map<string, CompiledState>;
  program: AST.Program;
}

export class Compiler {
  private states: Map<string, CompiledState> = new Map();

  compile(program: AST.Program): CompilationResult {
    // First pass: collect state definitions
    for (const stmt of program.body) {
      if (stmt.type === 'StateDeclaration') {
        this.compileStateDeclaration(stmt);
      }
    }

    // Second pass: compile transitions
    for (const stmt of program.body) {
      if (stmt.type === 'TransitionDeclaration') {
        this.compileTransitionDeclaration(stmt);
      }
    }

    return {
      states: this.states,
      program,
    };
  }

  private compileStateDeclaration(decl: AST.StateDeclaration): void {
    const states = new Map<string, number>();
    const stateNames: string[] = [];

    decl.states.forEach((name, index) => {
      states.set(name, index);
      stateNames.push(name);
    });

    const definition: StateDefinition = {
      name: decl.name,
      states,
      stateNames,
      initialState: 0,  // First state is initial
    };

    const transitionTable: TransitionTable = {
      transitions: new Map(),
    };

    this.states.set(decl.name, { definition, transitionTable });
  }

  private compileTransitionDeclaration(decl: AST.TransitionDeclaration): void {
    const compiledState = this.states.get(decl.stateName);
    if (!compiledState) {
      throw new Error(`[Compiler Error] Line ${decl.line}: Unknown state type '${decl.stateName}'`);
    }

    const { definition, transitionTable } = compiledState;

    for (const rule of decl.rules) {
      const fromId = definition.states.get(rule.from);
      const toId = definition.states.get(rule.to);

      if (fromId === undefined) {
        throw new Error(`[Compiler Error] Line ${decl.line}: Unknown state '${rule.from}' in '${decl.stateName}'`);
      }
      if (toId === undefined) {
        throw new Error(`[Compiler Error] Line ${decl.line}: Unknown state '${rule.to}' in '${decl.stateName}'`);
      }

      if (!transitionTable.transitions.has(fromId)) {
        transitionTable.transitions.set(fromId, new Map());
      }

      transitionTable.transitions.get(fromId)!.set(rule.event, toId);
    }
  }

  // Debug: print transition table
  static printTransitionTable(compiled: CompiledState): string {
    const { definition, transitionTable } = compiled;
    const lines: string[] = [];

    lines.push(`State: ${definition.name}`);
    lines.push(`States: ${definition.stateNames.join(', ')}`);
    lines.push('Transitions:');

    for (const [fromId, events] of transitionTable.transitions) {
      const fromName = definition.stateNames[fromId];
      for (const [event, toId] of events) {
        const toName = definition.stateNames[toId];
        lines.push(`  ${fromName} --[${event}]--> ${toName}`);
      }
    }

    return lines.join('\n');
  }
}
