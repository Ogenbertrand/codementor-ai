import * as vscode from 'vscode';
import { MCPClient } from '../services/mcp-client';
import { GitHubService, PullRequest } from '../services/github-service';
import { ConfigurationManager } from '../utils/configuration';
import { Logger } from '../utils/logger';
import { 
    CodeReviewComment, 
    GitHubComment,
    AIFixSuggestion,
    generateId,
    hashContent 
} from '@codementor-ai/shared';
import { AIAgent } from '../services/ai-agent';

export class CodeMentorAIProvider {
    private logger: Logger;
    private refreshInterval: NodeJS.Timeout | null = null;
    private commentDecorations: vscode.TextEditorDecorationType;

    constructor(
        private context: vscode.ExtensionContext,
        private mcpClient: MCPClient,
        private githubService: GitHubService,
        private aiAgent: AIAgent,
        private configManager: ConfigurationManager
    ) {
        this.logger = new Logger('codementor-ai-provider');
        
        // Initialize comment decorations
        this.commentDecorations = vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.joinPath(context.extensionUri, 'resources', 'comment-icon.svg'),
            gutterIconSize: 'contain',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground')
        });

        this.setupEventListeners();
    }

    /**
     * Connect to MCP server
     */
    async connect(): Promise<void> {
        try {
            await this.mcpClient.connect();
            vscode.window.showInformationMessage('Connected to CodeMentor AI');
            vscode.commands.executeCommand('setContext', 'codementor-ai:connected', true);
            
            // Start auto-refresh if enabled
            this.startAutoRefresh();
            
        } catch (error) {
            this.logger.error('Connection failed', { error });
            
            const result = await vscode.window.showErrorMessage(
                'Failed to connect to CodeMentor AI. Check your settings.',
                'Open Settings',
                'Retry'
            );

            if (result === 'Open Settings') {
                vscode.commands.executeCommand('codementor-ai.openSettings');
            } else if (result === 'Retry') {
                await this.connect();
            }
        }
    }

    /**
     * Show a specific comment in the editor
     */
    async showComment(comment: CodeReviewComment | GitHubComment): Promise<void> {
        try {
            if ('filePath' in comment) {
                // CodeReviewComment
                await this.githubService.openFile(comment.filePath, comment.lineNumber);
                this.highlightComment(comment);
            } else if ('path' in comment && comment.path) {
                // GitHubComment with path
                await this.githubService.openFile(comment.path, comment.line || 1);
            }
        } catch (error) {
            this.logger.error('Error showing comment', { comment, error });
            vscode.window.showErrorMessage('Failed to open file for comment');
        }
    }

    /**
     * Apply AI-generated fix for a comment
     */
    async applyFix(comment: CodeReviewComment): Promise<void> {
        try {
            if (!comment.suggestedCode) {
                vscode.window.showInformationMessage('No suggested fix available for this comment');
                return;
            }

            const repository = await this.githubService.getCurrentRepository();
            if (!repository) {
                vscode.window.showErrorMessage('No repository found');
                return;
            }

            // Get current file content
            const currentBranch = await this.githubService.getCurrentBranch();
            if (!currentBranch) {
                vscode.window.showErrorMessage('Unable to determine current branch');
                return;
            }

            const originalContent = await this.mcpClient.getFileContent(
                repository.owner,
                repository.name,
                comment.filePath,
                currentBranch
            );

            // Show diff before applying
            await this.githubService.showDiff(
                originalContent,
                comment.suggestedCode,
                comment.filePath
            );

            // Ask for confirmation
            const result = await vscode.window.showInformationMessage(
                'Apply this fix to the file?',
                'Apply',
                'Cancel'
            );

            if (result === 'Apply') {
                // Apply the fix
                const workspaceEdit = new vscode.WorkspaceEdit();
                const uri = vscode.Uri.joinPath(
                    this.githubService.getWorkspaceFolder()!.uri,
                    comment.filePath
                );

                const fullRange = new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(originalContent.split('\n').length, 0)
                );

                workspaceEdit.replace(uri, fullRange, comment.suggestedCode);
                
                const success = await vscode.workspace.applyEdit(workspaceEdit);
                
                if (success) {
                    vscode.window.showInformationMessage('Fix applied successfully');
                    
                    // Optionally mark comment as resolved
                    const resolveResult = await vscode.window.showInformationMessage(
                        'Mark this comment as resolved?',
                        'Yes',
                        'No'
                    );
                    
                    if (resolveResult === 'Yes') {
                        await this.resolveComment(comment);
                    }
                } else {
                    vscode.window.showErrorMessage('Failed to apply fix');
                }
            }

        } catch (error) {
            this.logger.error('Error applying fix', { comment, error });
            vscode.window.showErrorMessage('Failed to apply fix');
        }
    }

    /**
     * Resolve a comment
     */
    async resolveComment(comment: CodeReviewComment | GitHubComment): Promise<void> {
        try {
            const repository = await this.githubService.getCurrentRepository();
            if (!repository) {
                vscode.window.showErrorMessage('No repository found');
                return;
            }

            const prNumber = await this.githubService.getCurrentPRNumber();
            if (!prNumber) {
                vscode.window.showErrorMessage('Not in a pull request branch');
                return;
            }

            // Post resolution comment
            const resolutionBody = `✅ **Resolved**\n\nThis issue has been addressed in the latest commit.`;
            
            const success = await this.mcpClient.postPRComment(
                repository.owner,
                repository.name,
                prNumber,
                resolutionBody,
                'filePath' in comment ? comment.filePath : comment.path,
                'filePath' in comment ? comment.lineNumber : comment.line,
                undefined
            );

            if (success) {
                vscode.window.showInformationMessage('Comment resolved');
            } else {
                vscode.window.showErrorMessage('Failed to resolve comment');
            }

        } catch (error) {
            this.logger.error('Error resolving comment', { comment, error });
            vscode.window.showErrorMessage('Failed to resolve comment');
        }
    }

    /**
     * Get comments for current pull request
     */
    async getCurrentPRComments(): Promise<CodeReviewComment[]> {
        try {
            const repository = await this.githubService.getCurrentRepository();
            if (!repository) {
                return [];
            }

            const prNumber = await this.githubService.getCurrentPRNumber();
            if (!prNumber) {
                return [];
            }

            // Get GitHub comments
            const githubComments = await this.mcpClient.getPRComments(
                repository.owner,
                repository.name,
                prNumber
            );

            // Transform GitHub comments to our format
            return githubComments.map(comment => ({
                id: `gh_${comment.id}`,
                filePath: comment.path || '',
                lineNumber: comment.line || 1,
                severity: 'info' as const,
                category: 'maintainability' as const,
                title: 'GitHub Comment',
                description: comment.body,
                confidence: 1.0,
                metadata: {
                    githubCommentId: comment.id,
                    author: comment.user.login,
                    createdAt: comment.created_at,
                    updatedAt: comment.updated_at
                }
            }));

        } catch (error) {
            this.logger.error('Error getting PR comments', { error });
            return [];
        }
    }

    /**
     * Highlight comment in editor
     */
    private highlightComment(comment: CodeReviewComment): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const range = new vscode.Range(
            new vscode.Position(comment.lineNumber - 1, 0),
            new vscode.Position(comment.lineNumber - 1, 0)
        );

        editor.setDecorations(this.commentDecorations, [range]);

        // Clear decoration after 3 seconds
        setTimeout(() => {
            editor.setDecorations(this.commentDecorations, []);
        }, 3000);
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners(): void {
        // Listen for document changes
        const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
            // Could implement real-time comment updates here
        });

        // Listen for active editor changes
        const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                // Could update decorations based on current file
            }
        });

        this.context.subscriptions.push(
            documentChangeListener,
            editorChangeListener
        );
    }

    /**
     * Start auto-refresh
     */
    private startAutoRefresh(): void {
        const refreshInterval = this.configManager.get('refreshInterval');
        
        if (refreshInterval > 0) {
            this.refreshInterval = setInterval(async () => {
                if (this.mcpClient.isConnectionActive()) {
                    // Trigger refresh of comments
                    vscode.commands.executeCommand('codementor-ai.refreshComments');
                }
            }, refreshInterval * 1000);
        }
    }

    /**
     * Stop auto-refresh
     */
    private stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopAutoRefresh();
        this.commentDecorations.dispose();
        this.mcpClient.disconnect();
    }
}