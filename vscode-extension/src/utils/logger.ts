import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor(private context: string) {
        this.outputChannel = vscode.window.createOutputChannel('CodeMentor AI');
    }

    /**
     * Log error message
     */
    error(message: string, meta?: any): void {
        this.log('ERROR', message, meta);
    }

    /**
     * Log warning message
     */
    warn(message: string, meta?: any): void {
        this.log('WARN', message, meta);
    }

    /**
     * Log info message
     */
    info(message: string, meta?: any): void {
        this.log('INFO', message, meta);
    }

    /**
     * Log debug message
     */
    debug(message: string, meta?: any): void {
        this.log('DEBUG', message, meta);
    }

    /**
     * Internal log method
     */
    private log(level: string, message: string, meta?: any): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${this.context}] ${level}: ${message}`;
        
        this.outputChannel.appendLine(logMessage);
        
        if (meta) {
            const metaStr = JSON.stringify(meta, null, 2);
            this.outputChannel.appendLine(`Metadata: ${metaStr}`);
        }

        // Show output channel for errors
        if (level === 'ERROR') {
            this.outputChannel.show();
        }
    }

    /**
     * Show output channel
     */
    show(): void {
        this.outputChannel.show();
    }

    /**
     * Clear output channel
     */
    clear(): void {
        this.outputChannel.clear();
    }

    /**
     * Dispose logger
     */
    dispose(): void {
        this.outputChannel.dispose();
    }
}