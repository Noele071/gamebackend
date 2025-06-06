// gamehub-api.js - Frontend API Client
// This file should be included in your HTML page

class GameHubAPI {
    constructor(baseURL = 'http://localhost:3000/api') {
        this.baseURL = baseURL;
        this.token = localStorage.getItem('gameHubToken');
    }
    
    // Helper method to handle fetch responses
    async handleResponse(response) {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'API request failed');
        }
        return data;
    }
    
    // Set authorization header
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': this.token ? `Bearer ${this.token}` : ''
        };
    }
    
    // Authentication methods
    async signUp(userData) {
        try {
            const response = await fetch(`${this.baseURL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Sign up error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async signIn(email, password) {
        try {
            const response = await fetch(`${this.baseURL}/auth/signin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const result = await this.handleResponse(response);
            
            if (result.success && result.sessionToken) {
                this.token = result.sessionToken;
                localStorage.setItem('gameHubToken', this.token);
            }
            
            return result;
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async signOut() {
        try {
            const response = await fetch(`${this.baseURL}/auth/signout`, {
                method: 'POST',
                headers: this.getHeaders()
            });
            
            const result = await this.handleResponse(response);
            
            if (result.success) {
                this.token = null;
                localStorage.removeItem('gameHubToken');
            }
            
            return result;
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Check if user is authenticated
    async verifyAuth() {
        if (!this.token) {
            return { success: false, error: 'No token' };
        }
        
        try {
            const response = await fetch(`${this.baseURL}/auth/verify`, {
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Auth verification error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Score methods
    async updateScore(gameType, score) {
        try {
            const response = await fetch(`${this.baseURL}/score/update`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ gameType, score })
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Update score error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getLeaderboard(gameType) {
        try {
            const response = await fetch(`${this.baseURL}/leaderboard/${gameType}`, {
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Get leaderboard error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getUserRank(gameType) {
        try {
            const response = await fetch(`${this.baseURL}/score/rank/${gameType}`, {
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Get user rank error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Checkpoint methods
    async saveCheckpoint(gameType, gameState, checkpointName = null) {
        try {
            const response = await fetch(`${this.baseURL}/checkpoint/save`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ gameType, gameState, checkpointName })
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Save checkpoint error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async loadCheckpoint(gameType, checkpointId = null) {
        try {
            const url = `${this.baseURL}/checkpoint/load/${gameType}${checkpointId ? `?checkpointId=${checkpointId}` : ''}`;
            const response = await fetch(url, {
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Load checkpoint error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async listCheckpoints(gameType) {
        try {
            const response = await fetch(`${this.baseURL}/checkpoint/list/${gameType}`, {
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('List checkpoints error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async deleteCheckpoint(checkpointId) {
        try {
            const response = await fetch(`${this.baseURL}/checkpoint/${checkpointId}`, {
                method: 'DELETE',
                headers: this.getHeaders()
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Delete checkpoint error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Initialize API client
const gameAPI = new GameHubAPI();

// Check authentication on page load
window.addEventListener('DOMContentLoaded', async () => {
    if (gameAPI.token) {
        const result = await gameAPI.verifyAuth();
        if (result.success) {
            currentUser = result.user;
            showMainContent();
        } else {
            // Token invalid, clear it
            gameAPI.token = null;
            localStorage.removeItem('gameHubToken');
        }
    }
});