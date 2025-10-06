import * as vscode from 'vscode';
import { MCPClient } from '../services/mcp-client';
import { GitHubService } from '../services/github-service';
import { Logger } from '../utils/logger';
import { 
    CodeReviewComment, 
    GitHubComment,
    ReviewSeverity,
    ReviewCategory 
} from '@codementor-ai/shared';

export class CommentTreeProvider implements vscode.TreeDataProvider<CommentTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CommentTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<CommentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CommentTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private logger: Logger;
    private comments: CodeReviewComment[] = [];
    private loading = false;

    constructor(
        private mcpClient: MCPClient,
        private githubService: GitHubService
    ) {
        this.logger = new Logger('comment-tree-provider');
    }

    /**
     * Refresh the tree view
     */
    async refresh(): Promise<void> {
        this.loading = true;
        this._onDidChangeTreeData.fire();

        try {
            await this.loadComments();
        } catch (error) {
            this.logger.error('Error refreshing comments', { error });
        } finally {
            this.loading = false;
            this._onDidChangeTreeData.fire();
        }
    }

    /**
     * Load comments from MCP server
     */
    private async loadComments(): Promise<void> {
        try {
            const repository = await this.githubService.getCurrentRepository();
            if (!repository) {
                this.comments = [];
                return;
            }

            const prNumber = await this.githubService.getCurrentPRNumber();
            if (!prNumber) {
                this.comments = [];
                return;
            }

            // Load comments from MCP server
            const githubComments = await this.mcpClient.getPRComments(
                repository.owner,
                repository.name,
                prNumber
            );

            // Transform and filter comments
            this.comments = githubComments
                .filter(comment => this.isCodeMentorComment(comment))
                .map(comment => this.transformGitHubComment(comment))
                .filter(comment => comment !== null) as CodeReviewComment[];

            this.logger.info('Loaded comments', { count: this.comments.length });

        } catch (error) {
            this.logger.error('Error loading comments', { error });
            this.comments = [];
        }
    }

    /**
     * Check if comment is from CodeMentor AI
     */
    private isCodeMentorComment(comment: GitHubComment): boolean {
        return comment.body.includes('CodeMentor AI') || 
               comment.body.includes('🤖') ||
               comment.body.includes('**Severity:**') ||
               comment.user.login.includes('codementor-ai');
    }

    /**
     * Transform GitHub comment to CodeReviewComment
     */
    private transformGitHubComment(comment: GitHubComment): CodeReviewComment | null {
        try {
            // Parse comment body to extract structured information
            const lines = comment.body.split('\n');
            let title = 'Code Review Comment';
            let description = comment.body;
            let severity: ReviewSeverity = 'info';
            let category: ReviewCategory = 'maintainability';
            let confidence = 0.8;
            let suggestedCode: string | undefined;

            // Extract title
            const titleMatch = comment.body.match(/\*\*(.+?)\*\*/);
            if (titleMatch) {
                title = titleMatch[1].replace(/🔴|🟡|🟠|🔵/g, '').trim();
            }

            // Extract severity
            if (comment.body.includes('🔴')) severity = 'critical';
            else if (comment.body.includes('🟡')) severity = 'error';
            else if (comment.body.includes('🟠')) severity = 'warning';

            // Extract suggested code
            const codeBlockMatch = comment.body.match(/```[\s\S]*?\n([\s\S]*?)\n```/);
            if (codeBlockMatch) {
                suggestedCode = codeBlockMatch[1];
            }

            return {
                id: `gh_${comment.id}`,
                filePath: comment.path || '',
                lineNumber: comment.line || 1,
                severity,
                category,
                title,
                description,
                confidence,
                suggestedCode,
                metadata: {
                    rule: `github-comment-${comment.id}`,
                    references: [`https://github.com/user/repo/pull/1#discussion_r${comment.id}`]
                }
            };

        } catch (error) {
            this.logger.error('Error transforming comment', { comment, error });
            return null;
        }
    }

    /**
     * Get tree item
     */
    getTreeItem(element: CommentTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for tree item
     */
    getChildren(element?: CommentTreeItem): Thenable<CommentTreeItem[]> {
        if (this.loading) {
            return Promise.resolve([new LoadingTreeItem()]);
        }

        if (!element) {
            // Root level - group by severity
            return Promise.resolve(this.getRootItems());
        }

        if (element instanceof SeverityGroupTreeItem) {
            // Severity group - show comments
            return Promise.resolve(
                this.comments
                    .filter(comment => comment.severity === element.severity)
                    .map(comment => new CommentItem(comment))
            );
        }

        return Promise.resolve([]);
    }

    /**
     * Get root items (grouped by severity)
     */
    private getRootItems(): CommentTreeItem[] {
        const severityGroups = this.groupCommentsBySeverity();
        
        if (this.comments.length === 0) {
            return [new NoCommentsTreeItem()];
        }

        return Object.entries(severityGroups)
            .filter(([, comments]) => comments.length > 0)
            .sort(([a], [b]) => this.getSeverityOrder(a) - this.getSeverityOrder(b))
            .map(([severity, comments]) => 
                new SeverityGroupTreeItem(severity as ReviewSeverity, comments.length)
            );
    }

    /**
     * Group comments by severity
     */
    private groupCommentsBySeverity(): Record<ReviewSeverity, CodeReviewComment[]> {
        const groups: Record<ReviewSeverity, CodeReviewComment[]> = {
            critical: [],
            error: [],
            warning: [],
            info: []
        };

        this.comments.forEach(comment => {
            groups[comment.severity].push(comment);
        });

        return groups;
    }

    /**
     * Get severity order for sorting
     */
    private getSeverityOrder(severity: string): number {
        const order = {
            'critical': 0,
            'error': 1,
            'warning': 2,
            'info': 3
        };
        return order[severity as ReviewSeverity] || 4;
    }
}

/**
 * Base tree item class
 */
abstract class CommentTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

/**
 * Severity group tree item
 */
class SeverityGroupTreeItem extends CommentTreeItem {
    constructor(
        public readonly severity: ReviewSeverity,
        public readonly count: number
    ) {
        super(
            `${getSeverityIcon(severity)} ${getSeverityLabel(severity)} (${count})`,
            vscode.TreeItemCollapsibleState.Expanded
        );

        this.contextValue = 'severity-group';
        this.iconPath = getSeverityIconPath(severity);
    }
}

/**
 * Comment tree item
 */
export class CommentItem extends CommentTreeItem {
    constructor(
        public readonly comment: CodeReviewComment
    ) {
        super(
            comment.title,
            vscode.TreeItemCollapsibleState.None
        );

        this.description = `${comment.filePath}:${comment.lineNumber}`;
        this.tooltip = this.createTooltip();
        this.contextValue = 'comment';
        this.iconPath = getSeverityIconPath(comment.severity);
        this.command = {
            command: 'codementor-ai.showComment',
            title: 'Show Comment',
            arguments: [comment]
        };
    }

    private createTooltip(): string {
        const lines = [
            `**${this.comment.title}**`,
            ``,
            `File: ${this.comment.filePath}:${this.comment.lineNumber}`,
            `Severity: ${this.comment.severity}`,
            `Category: ${this.comment.category}`,
            `Confidence: ${Math.round(this.comment.confidence * 100)}%`
        ];

        if (this.comment.description) {
            lines.push('', this.comment.description.substring(0, 200) + (this.comment.description.length > 200 ? '...' : ''));
        }

        return lines.join('\n');
    }
}

/**
 * Loading tree item
 */
class LoadingTreeItem extends CommentTreeItem {
    constructor() {
        super('Loading comments...', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('loading~spin');
    }
}

/**
 * No comments tree item
 */
class NoCommentsTreeItem extends CommentTreeItem {
    constructor() {
        super('No comments found', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('info');
        this.description = 'Check back later or refresh';
    }
}

/**
 * Helper functions
 */
function getSeverityIcon(severity: ReviewSeverity): string {
    const icons = {
        critical: '🔴',
        error: '🟡',
        warning: '🟠',
        info: '🔵'
    };
    return icons[severity];
}

function getSeverityLabel(severity: ReviewSeverity): string {
    const labels = {
        critical: 'Critical Issues',
        error: 'High Priority',
        warning: 'Medium Priority',
        info: 'Info & Suggestions'
    };
    return labels[severity];
}

function getSeverityIconPath(severity: ReviewSeverity): vscode.ThemeIcon {
    const icons = {
        critical: new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground')),
        error: new vscode.ThemeIcon('warning', new vscode.ThemeColor('warningForeground')),
        warning: new vscode.ThemeIcon('info', new vscode.ThemeColor('infoForeground')),
        info: new vscode.ThemeIcon('comment', new vscode.ThemeColor('foreground'))
    };
    return icons[severity];
}