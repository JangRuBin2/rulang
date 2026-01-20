#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { Compiler } from './compiler';
import { Interpreter } from './interpreter';

function runCode(source: string, startServer: boolean = false): void {
  try {
    // Lexer
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    // Parser
    const parser = new Parser(tokens);
    const ast = parser.parse();

    // Compiler
    const compiler = new Compiler();
    const compiled = compiler.compile(ast);

    // Interpreter
    const interpreter = new Interpreter(compiled);
    interpreter.run();

    // Start server if endpoints are registered
    if (startServer && interpreter.hasEndpoints()) {
      interpreter.startServer();
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
  }
}

function runFile(filePath: string, startServer: boolean = true): void {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(resolvedPath, 'utf-8');
  runCode(source, startServer);
}

function runRepl(): void {
  console.log('Rulang v0.1 - State-Flow Native Language');
  console.log('Type "exit" to quit\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let buffer = '';
  let inBlock = 0;

  const prompt = () => {
    const indicator = inBlock > 0 ? '... ' : '>>> ';
    rl.question(indicator, (line) => {
      if (line === 'exit') {
        rl.close();
        return;
      }

      buffer += line + '\n';

      // Track braces for multiline input
      for (const char of line) {
        if (char === '{') inBlock++;
        if (char === '}') inBlock--;
      }

      if (inBlock <= 0) {
        inBlock = 0;
        runCode(buffer);
        buffer = '';
      }

      prompt();
    });
  };

  prompt();
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  runRepl();
} else if (args.length === 1) {
  runFile(args[0]);
} else {
  console.log('Usage: rulang [script.ru]');
  process.exit(1);
}
