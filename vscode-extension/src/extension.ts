import * as vscode from 'vscode';
import { CodeMentorAIProvider } from './providers/codementor-ai-provider';
import { MCPClient } from './services/mcp-client';
import { GitHubService } from './services/github-service';
import { AIAgent } from './services/ai-agent';
import { ConfigurationManager } from './utils/configuration';
import { Logger } from './utils/logger';
import { CommentTreeProvider } from './views/comment-tree-provider';
import { 
  CodeActionsProvider, 
  CodeLensProvider 
} from './providers/code-actions-provider';

const logger = new Logger('extension');

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    logger.info('CodeMentor AI extension activating...');

    // Initialize configuration manager
    const configManager = new ConfigurationManager();
    
    // Initialize services
    const mcpClient = new MCPClient(configManager);
    const githubService = new GitHubService(configManager);
    
    // Initialize AI Agent
    const aiAgent = new AIAgent(mcpClient, configManager);
    
    // Initialize main provider
    const provider = new CodeMentorAIProvider(
        context,
        mcpClient,
        githubService,
        aiAgent,
        configManager
    );

    // Initialize comment tree provider
    const commentTreeProvider = new CommentTreeProvider(mcpClient, githubService);
    
    // Register tree view
    const treeView = vscode.window.createTreeView('codementor-ai', {
        treeDataProvider: commentTreeProvider,
        showCollapseAll: true
    });

    // Register code actions provider
    const codeActionsProvider = new CodeActionsProvider(aiAgent);
    const codeActionsDisposable = vscode.languages.registerCodeActionsProvider(
        '*',
        codeActionsProvider
    );

    // Register code lens provider
    const codeLensProvider = new CodeLensProvider();
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        '*',
        codeLensProvider
    );

    // Register commands
    const commands = [
        vscode.commands.registerCommand('codementor-ai.connect', async () => {
            await provider.connect();
        }),

        vscode.commands.registerCommand('codementor-ai.refreshComments', async () => {
            await commentTreeProvider.refresh();
            vscode.window.showInformationMessage('Comments refreshed');
        }),

        vscode.commands.registerCommand('codementor-ai.showComment', async (comment: any) => {
            await provider.showComment(comment);
        }),

        vscode.commands.registerCommand('codementor-ai.applyFix', async (comment: any) => {
            await provider.applyFix(comment);
        }),

        vscode.commands.registerCommand('codementor-ai.resolveComment', async (comment: any) => {
            await provider.resolveComment(comment);
        }),

        vscode.commands.registerCommand('codementor-ai.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'codementor-ai');
        }),

        // AI Agent commands
        vscode.commands.registerCommand('codementor-ai.explainCode', async (document: vscode.TextDocument, range: vscode.Range) => {
            const code = document.getText(range);
            const explanation = await aiAgent.explainCode(code, document.languageId);
            if (explanation) {
                vscode.window.showInformationMessage(explanation);
            }
        }),

        vscode.commands.registerCommand('codementor-ai.refactorCode', async (document: vscode.TextDocument, range: vscode.Range, type: string) => {
            const code = document.getText(range);
            const refactored = await aiAgent.refactorCode(code, document.languageId, type as any);
            if (refactored) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, range, refactored);
                await vscode.workspace.applyEdit(edit);
            }
        }),

        vscode.commands.registerCommand('codementor-ai.generateFix', async (document: vscode.TextDocument, range: vscode.Range) => {
            // Generate fix for the selected code
            vscode.window.showInformationMessage('Fix generation feature coming soon!');
        }),

        vscode.commands.registerCommand('codementor-ai.completeCode', async (document: vscode.TextDocument, range: vscode.Range) => {
            const line = document.lineAt(range.start.line).text;
            const completion = await aiAgent.generateCodeCompletion(document.fileName, line, '');
            if (completion) {
                const edit = new vscode.WorkspaceEdit();
                const position = new vscode.Position(range.start.line, line.length);
                edit.insert(document.uri, position, completion);
                await vscode.workspace.applyEdit(edit);
            }
        })
    ];

    // Register status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(comment-discussion) CodeMentor AI';
    statusBarItem.tooltip = 'CodeMentor AI - Click to connect';
    statusBarItem.command = 'codementor-ai.connect';
    statusBarItem.show();

    // Register configuration change listener
    const configListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('codementor-ai')) {
            await configManager.reload();
            await mcpClient.updateConfiguration(configManager);
            
            if (configManager.get('autoRefresh')) {
                await commentTreeProvider.refresh();
            }
        }
    });

    // Add all disposables to context
    context.subscriptions.push(
        ...commands,
        treeView,
        statusBarItem,
        configListener,
        provider,
        codeActionsDisposable,
        codeLensDisposable
    );

    // Auto-connect if configured
    if (configManager.get('serverUrl') && configManager.get('apiKey')) {
        try {
            await provider.connect();
            vscode.commands.executeCommand('setContext', 'codementor-ai:connected', true);
        } catch (error) {
            logger.error('Auto-connect failed', { error });
            vscode.window.showWarningMessage(
                'CodeMentor AI: Auto-connect failed. Please check your settings.',
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('codementor-ai.openSettings');
                }
            });
        }
    }

    logger.info('CodeMentor AI extension activated successfully');
}

export function deactivate(): void {
    logger.info('CodeMentor AI extension deactivating...');
}