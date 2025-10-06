import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration';

export interface GitHubRepository {
    owner: string;
    name: string;
    fullName: string;
    url: string;
    defaultBranch: string;
}

export interface PullRequest {
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed';
    head: {
        ref: string;
        sha: string;
        repo: GitHubRepository;
    };
    base: {
        ref: string;
        sha: string;
        repo: GitHubRepository;
    };
    user: {
        login: string;
    };
    createdAt: string;
    updatedAt: string;
}

export class GitHubService {
    private logger: Logger;
    private token: string = '';

    constructor(private configManager: ConfigurationManager) {
        this.logger = new Logger('github-service');
        this.updateToken();
    }

    /**
     * Update GitHub token from configuration
     */
    updateToken(): void {
        this.token = this.configManager.get('gitHubToken') || '';
    }

    /**
     * Check if GitHub token is configured
     */
    hasToken(): boolean {
        return !!this.token;
    }

    /**
     * Prompt user to enter GitHub token
     */
    async promptForToken(): Promise<string | undefined> {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your GitHub Personal Access Token',
            password: true,
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Token is required';
                }
                return null;
            }
        });

        if (token) {
            await this.configManager.update('gitHubToken', token);
            this.token = token;
        }

        return token;
    }

    /**
     * Get current repository information
     */
    async getCurrentRepository(): Promise<GitHubRepository | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                throw new Error('Git extension not available');
            }

            await gitExtension.activate();
            const git = gitExtension.exports.getAPI(1);
            const repository = git.repositories[0];

            if (!repository) {
                throw new Error('No Git repository found');
            }

            const remotes = repository.state.remotes;
            const origin = remotes.find((r: any) => r.name === 'origin');
            
            if (!origin) {
                throw new Error('No origin remote found');
            }

            // Parse GitHub URL
            const match = origin.fetchUrl?.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!match) {
                throw new Error('Not a GitHub repository');
            }

            const [, owner, name] = match;
            const cleanName = name.replace(/\.git$/, '');

            return {
                owner,
                name: cleanName,
                fullName: `${owner}/${cleanName}`,
                url: `https://github.com/${owner}/${cleanName}`,
                defaultBranch: repository.state.HEAD?.name || 'main'
            };
        } catch (error) {
            this.logger.error('Error getting current repository', { error });
            return null;
        }
    }

    /**
     * Get current branch
     */
    async getCurrentBranch(): Promise<string | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                return null;
            }

            await gitExtension.activate();
            const git = gitExtension.exports.getAPI(1);
            const repository = git.repositories[0];

            if (!repository) {
                return null;
            }

            return repository.state.HEAD?.name || null;
        } catch (error) {
            this.logger.error('Error getting current branch', { error });
            return null;
        }
    }

    /**
     * Check if current branch is a pull request
     */
    async isPullRequestBranch(): Promise<boolean> {
        const branch = await this.getCurrentBranch();
        if (!branch) {
            return false;
        }

        // Check if branch name follows PR pattern (e.g., feature/123-some-feature)
        return /^(feature|bugfix|hotfix)\/\d+/.test(branch) || 
               /^pr-\d+/.test(branch) ||
               /^(pull|merge)\/\d+/.test(branch);
    }

    /**
     * Extract PR number from branch name
     */
    extractPRNumberFromBranch(branch: string): number | null {
        const match = branch.match(/\d+/);
        return match ? parseInt(match[0], 10) : null;
    }

    /**
     * Get pull request number for current branch
     */
    async getCurrentPRNumber(): Promise<number | null> {
        const branch = await this.getCurrentBranch();
        if (!branch) {
            return null;
        }

        return this.extractPRNumberFromBranch(branch);
    }

    /**
     * Show PR selection quick pick
     */
    async selectPullRequest(pullRequests: PullRequest[]): Promise<PullRequest | undefined> {
        if (pullRequests.length === 0) {
            vscode.window.showInformationMessage('No pull requests found');
            return undefined;
        }

        const items = pullRequests.map(pr => ({
            label: `#${pr.number} ${pr.title}`,
            description: `by ${pr.user.login} • ${pr.state}`,
            detail: pr.body?.substring(0, 100) || 'No description',
            pr
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a pull request to review',
            matchOnDescription: true,
            matchOnDetail: true
        });

        return selected?.pr;
    }

    /**
     * Show error message with retry option
     */
    async showErrorWithRetry(message: string, error: any): Promise<boolean> {
        const result = await vscode.window.showErrorMessage(
            `${message}: ${error.message || error}`,
            'Retry',
            'Open Settings'
        );

        if (result === 'Retry') {
            return true;
        } else if (result === 'Open Settings') {
            vscode.commands.executeCommand('codementor-ai.openSettings');
        }

        return false;
    }

    /**
     * Show success message
     */
    showSuccessMessage(message: string): void {
        vscode.window.showInformationMessage(message);
    }

    /**
     * Get workspace folder
     */
    getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.workspaceFolders?.[0];
    }

    /**
     * Open file in editor
     */
    async openFile(filePath: string, lineNumber?: number): Promise<void> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            return;
        }

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
        
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);
            
            if (lineNumber) {
                const position = new vscode.Position(lineNumber - 1, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(new vscode.Range(position, position));
            }
        } catch (error) {
            this.logger.error('Error opening file', { filePath, error });
            throw error;
        }
    }

    /**
     * Apply text edit to file
     */
    async applyTextEdit(filePath: string, edit: vscode.TextEdit): Promise<void> {
        const workspaceFolder = this.getWorkspaceFolder();
        if (!workspaceFolder) {
            return;
        }

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.set(uri, [edit]);
        
        await vscode.workspace.applyEdit(workspaceEdit);
    }

    /**
     * Show diff between original and modified content
     */
    async showDiff(originalContent: string, modifiedContent: string, fileName: string): Promise<void> {
        const uriOriginal = vscode.Uri.parse(`codementor-ai://diff/original-${fileName}`);
        const uriModified = vscode.Uri.parse(`codementor-ai://diff/modified-${fileName}`);

        // Register content providers for diff
        const originalProvider = new (class implements vscode.TextDocumentContentProvider {
            provideTextDocumentContent(): string {
                return originalContent;
            }
        })();

        const modifiedProvider = new (class implements vscode.TextDocumentContentProvider {
            provideTextDocumentContent(): string {
                return modifiedContent;
            }
        })();

        const disposable1 = vscode.workspace.registerTextDocumentContentProvider(
            'codementor-ai',
            originalProvider
        );

        const disposable2 = vscode.workspace.registerTextDocumentContentProvider(
            'codementor-ai',
            modifiedProvider
        );

        try {
            await vscode.commands.executeCommand(
                'vscode.diff',
                uriOriginal,
                uriModified,
                `CodeMentor AI: ${fileName} - Suggested Changes`
            );
        } finally {
            disposable1.dispose();
            disposable2.dispose();
        }
    }
}