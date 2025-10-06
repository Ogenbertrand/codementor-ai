import WebSocket from 'ws';
import axios from 'axios';
import { 
  MCPRequest, 
  MCPResponse, 
  WebSocketMessage,
  CodeReviewComment,
  GitHubComment,
  FileDiff 
} from '@codementor-ai/shared';
import { Logger } from '../utils/logger';
import { ConfigurationManager } from '../utils/configuration';

export class MCPClient {
    private ws: WebSocket | null = null;
    private logger: Logger;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 5000;
    private messageQueue: Array<{ resolve: (value: any) => void; reject: (reason: any) => void; message: any }> = [];
    private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (reason: any) => void }>();
    private isConnected = false;

    constructor(private configManager: ConfigurationManager) {
        this.logger = new Logger('mcp-client');
    }

    /**
     * Connect to MCP server
     */
    async connect(): Promise<void> {
        const serverUrl = this.configManager.get('serverUrl');
        const apiKey = this.configManager.get('apiKey');

        if (!serverUrl || !apiKey) {
            throw new Error('Server URL and API key must be configured');
        }

        const wsUrl = (serverUrl as string).replace(/^http/, 'ws') + '/mcp';
        
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(`${wsUrl}?token=${apiKey}`);
                
                this.ws.on('open', () => {
                    this.logger.info('Connected to MCP server');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.processMessageQueue();
                    resolve();
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data);
                });

                this.ws.on('close', (code) => {
                    this.logger.info('Disconnected from MCP server', { code });
                    this.isConnected = false;
                    this.attemptReconnect();
                });

                this.ws.on('error', (error) => {
                    this.logger.error('WebSocket error', { error });
                    this.isConnected = false;
                    reject(error);
                });

            } catch (error) {
                this.logger.error('Failed to create WebSocket connection', { error });
                reject(error);
            }
        });
    }

    /**
     * Disconnect from MCP server
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
            this.pendingRequests.clear();
            this.messageQueue = [];
        }
    }

    /**
     * Update configuration
     */
    async updateConfiguration(configManager: ConfigurationManager): Promise<void> {
        this.configManager = configManager;
        
        // If already connected, reconnect with new configuration
        if (this.isConnected) {
            this.disconnect();
            await this.connect();
        }
    }

    /**
     * Get PR comments via HTTP fallback
     */
    async getPRCommentsHttp(owner: string, repo: string, pullNumber: number): Promise<GitHubComment[]> {
        const serverUrl = this.configManager.get('serverUrl');
        const apiKey = this.configManager.get('apiKey');

        try {
            const response = await axios.post(
                `${serverUrl}/mcp/tools/get_pr_comments`,
                {
                    id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    method: 'get_pr_comments',
                    params: { owner, repo, pullNumber }
                },
                {
                    headers: {
                        'Authorization': apiKey as string,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            return response.data.result?.comments || [];
        } catch (error) {
            this.logger.error('HTTP request failed', { error });
            throw error;
        }
    }

    /**
     * Get PR comments via WebSocket
     */
    async getPRComments(owner: string, repo: string, pullNumber: number): Promise<GitHubComment[]> {
        const result = await this.sendRequest('get_pr_comments', { owner, repo, pullNumber });
        return result.comments || [];
    }

    /**
     * Get PR files
     */
    async getPRFiles(owner: string, repo: string, pullNumber: number): Promise<FileDiff[]> {
        const result = await this.sendRequest('get_pr_files', { owner, repo, pullNumber });
        return result.files || [];
    }

    /**
     * Get file content
     */
    async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
        const result = await this.sendRequest('get_file_content', { owner, repo, path, ref });
        return result.content || '';
    }

    /**
     * Post PR comment
     */
    async postPRComment(
        owner: string,
        repo: string,
        pullNumber: number,
        body: string,
        path?: string,
        line?: number,
        commitId?: string
    ): Promise<boolean> {
        const result = await this.sendRequest('post_pr_comment', {
            owner,
            repo,
            pullNumber,
            body,
            path,
            line,
            commitId
        });
        return result.success || false;
    }

    /**
     * Update PR comment
     */
    async updatePRComment(owner: string, repo: string, commentId: number, body: string): Promise<boolean> {
        const result = await this.sendRequest('update_pr_comment', {
            owner,
            repo,
            commentId,
            body
        });
        return result.success || false;
    }

    /**
     * List pull requests
     */
    async listPullRequests(
        owner: string,
        repo: string,
        state?: 'open' | 'closed' | 'all',
        sort?: string,
        perPage?: number,
        page?: number
    ): Promise<{ pullRequests: any[]; totalCount: number }> {
        const result = await this.sendRequest('list_pull_requests', {
            owner,
            repo,
            state,
            sort,
            perPage,
            page
        });
        return result;
    }

    /**
     * Send request via WebSocket
     */
    private async sendRequest(method: string, params: any): Promise<any> {
        if (!this.isConnected) {
            // Try HTTP fallback
            if (method === 'get_pr_comments') {
                return { comments: await this.getPRCommentsHttp(params.owner, params.repo, params.pullNumber) };
            }
            throw new Error('Not connected to MCP server');
        }

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const message: MCPRequest = {
            id: requestId,
            method,
            params,
            timestamp: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            // Store pending request
            this.pendingRequests.set(requestId, { resolve, reject });

            // Set timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('Request timeout'));
            }, 30000);

            // Send message
            const messageStr = JSON.stringify({
                type: 'request',
                ...message
            });

            try {
                this.ws!.send(messageStr);
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(requestId);
                reject(error);
            }

            // Store timeout for cleanup
            (this.pendingRequests.get(requestId) as any).timeout = timeout;
        });
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(data: WebSocket.Data): void {
        try {
            const message: WebSocketMessage = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'response':
                    this.handleResponse(message.payload);
                    break;
                    
                case 'error':
                    this.handleError(message.payload);
                    break;
                    
                case 'notification':
                    this.handleNotification(message.payload);
                    break;
                    
                default:
                    this.logger.warn('Unknown message type', { type: message.type });
            }
        } catch (error) {
            this.logger.error('Error handling message', { error });
        }
    }

    /**
     * Handle response message
     */
    private handleResponse(payload: any): void {
        const { id, result, error } = payload;
        const pending = this.pendingRequests.get(id);
        
        if (pending) {
            this.pendingRequests.delete(id);
            clearTimeout((pending as any).timeout);
            
            if (error) {
                pending.reject(new Error(error.message));
            } else {
                pending.resolve(result);
            }
        }
    }

    /**
     * Handle error message
     */
    private handleError(payload: any): void {
        const { id, error } = payload;
        const pending = this.pendingRequests.get(id);
        
        if (pending) {
            this.pendingRequests.delete(id);
            clearTimeout((pending as any).timeout);
            pending.reject(new Error(error.message));
        }
    }

    /**
     * Handle notification message
     */
    private handleNotification(payload: any): void {
        // Forward notifications to extension
        // This would be handled by the main extension class
        this.logger.info('Received notification', { payload });
    }

    /**
     * Attempt to reconnect
     */
    private async attemptReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.logger.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        this.logger.info('Attempting to reconnect', { attempt: this.reconnectAttempts });

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                this.logger.error('Reconnection failed', { error });
                this.attemptReconnect();
            }
        }, this.reconnectDelay);
    }

    /**
     * Process queued messages
     */
    private processMessageQueue(): void {
        while (this.messageQueue.length > 0) {
            const { message, resolve, reject } = this.messageQueue.shift()!;
            
            this.sendRequest(message.method, message.params)
                .then(resolve)
                .catch(reject);
        }
    }

    /**
     * Check if connected
     */
    isConnectionActive(): boolean {
        return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
    }
}