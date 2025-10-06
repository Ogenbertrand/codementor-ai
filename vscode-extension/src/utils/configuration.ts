import * as vscode from 'vscode';

export class ConfigurationManager {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('codementor-ai');
    }

    /**
     * Get configuration value
     */
    get<T>(key: string): T | undefined {
        return this.config.get<T>(key);
    }

    /**
     * Get configuration value with default
     */
    getWithDefault<T>(key: string, defaultValue: T): T {
        return this.config.get<T>(key) ?? defaultValue;
    }

    /**
     * Update configuration value
     */
    async update(key: string, value: any, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
        await this.config.update(key, value, target);
        await this.reload();
    }

    /**
     * Reload configuration
     */
    async reload(): Promise<void> {
        this.config = vscode.workspace.getConfiguration('codementor-ai');
    }

    /**
     * Listen for configuration changes
     */
    onDidChangeConfiguration(listener: (event: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(listener);
    }

    /**
     * Check if a key has been configured
     */
    isConfigured(key: string): boolean {
        const value = this.get(key);
        return value !== undefined && value !== '' && value !== null;
    }

    /**
     * Get all configuration
     */
    getAll(): any {
        return {
            serverUrl: this.get('serverUrl'),
            apiKey: this.get('apiKey'),
            gitHubToken: this.get('gitHubToken'),
            autoRefresh: this.get('autoRefresh'),
            refreshInterval: this.get('refreshInterval'),
            showNotifications: this.get('showNotifications')
        };
    }

    /**
     * Validate configuration
     */
    validate(): { valid: boolean; missing: string[] } {
        const required = ['serverUrl', 'apiKey'];
        const missing: string[] = [];

        for (const key of required) {
            if (!this.isConfigured(key)) {
                missing.push(key);
            }
        }

        return {
            valid: missing.length === 0,
            missing
        };
    }

    /**
     * Show configuration prompt
     */
    async promptForMissingConfiguration(missing: string[]): Promise<boolean> {
        const message = `Missing required configuration: ${missing.join(', ')}`;
        const result = await vscode.window.showWarningMessage(
            message,
            'Open Settings',
            'Cancel'
        );

        if (result === 'Open Settings') {
            vscode.commands.executeCommand('codementor-ai.openSettings');
            return true;
        }

        return false;
    }
}