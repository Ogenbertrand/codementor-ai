import * as vscode from 'vscode';
import { AIAgent } from '../services/ai-agent';
import { Logger } from '../utils/logger';
import { CodeReviewComment } from '@codementor-ai/shared';

export class CodeActionsProvider implements vscode.CodeActionProvider {
  private logger: Logger;
  private aiAgent: AIAgent;

  constructor(aiAgent: AIAgent) {
    this.logger = new Logger('code-actions-provider');
    this.aiAgent = aiAgent;
  }

  /**
   * Provide code actions for the given document and range
   */
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
    const actions: vscode.CodeAction[] = [];

    // Add AI-powered code actions
    actions.push(this.createExplainCodeAction(document, range));
    actions.push(this.createRefactorCodeAction(document, range));
    actions.push(this.createGenerateFixAction(document, range));
    actions.push(this.createCodeCompletionAction(document, range));

    return actions;
  }

  /**
   * Create "Explain Code" action
   */
  private createExplainCodeAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'CodeMentor: Explain Code',
      vscode.CodeActionKind.QuickFix
    );

    action.command = {
      command: 'codementor-ai.explainCode',
      title: 'Explain Code',
      arguments: [document, range]
    };

    action.isPreferred = false;
    return action;
  }

  /**
   * Create "Refactor Code" action
   */
  private createRefactorCodeAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'CodeMentor: Refactor Code',
      vscode.CodeActionKind.Refactor
    );

    action.command = {
      command: 'codementor-ai.refactorCode',
      title: 'Refactor Code',
      arguments: [document, range, 'readability']
    };

    action.isPreferred = false;
    return action;
  }

  /**
   * Create "Generate Fix" action
   */
  private createGenerateFixAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'CodeMentor: Generate Fix',
      vscode.CodeActionKind.QuickFix
    );

    action.command = {
      command: 'codementor-ai.generateFix',
      title: 'Generate Fix',
      arguments: [document, range]
    };

    action.isPreferred = true;
    return action;
  }

  /**
   * Create "Code Completion" action
   */
  private createCodeCompletionAction(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'CodeMentor: Complete Code',
      vscode.CodeActionKind.QuickFix
    );

    action.command = {
      command: 'codementor-ai.completeCode',
      title: 'Complete Code',
      arguments: [document, range]
    };

    action.isPreferred = false;
    return action;
  }
}

/**
 * Code lens provider for inline code actions
 */
export class CodeLensProvider implements vscode.CodeLensProvider {
  private logger: Logger;
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    this.logger = new Logger('code-lens-provider');
  }

  /**
   * Provide code lenses for the given document
   */
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const lenses: vscode.CodeLens[] = [];

    // Add code lenses for functions and classes
    const text = document.getText();
    const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|function))/g;
    let match;

    while ((match = functionRegex.exec(text)) !== null) {
      const position = document.positionAt(match.index);
      const range = new vscode.Range(position, position);
      const functionName = match[1] || match[2];

      // Add explain code lens
      lenses.push(new vscode.CodeLens(range, {
        command: 'codementor-ai.explainCode',
        title: '$(info) Explain',
        arguments: [document, range]
      }));

      // Add refactor code lens
      lenses.push(new vscode.CodeLens(range, {
        command: 'codementor-ai.refactorCode',
        title: '$(edit) Refactor',
        arguments: [document, range, 'maintainability']
      }));
    }

    return lenses;
  }

  /**
   * Refresh code lenses
   */
  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }
}