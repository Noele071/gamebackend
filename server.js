// server.js - GameHub Backend Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
    origin: [
        'http://localhost:8080',
        'http://127.0.0.1:5500',
        'https://hypegame.netlify.app/', 
        'http://localhost:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware - MUST come after CORS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add request logging middleware to debug
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);
    next();
});

// Test endpoint to verify body parsing
app.post('/api/test', (req, res) => {
    console.log('Test endpoint - Body received:', req.body);
    res.json({ 
        success: true, 
        receivedBody: req.body 
    });
});


// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'gamehub',
    user: process.env.DB_USER || 'postgres',
    password: '1111',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Create connection pool
const pool = new Pool(dbConfig);

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to database:', err.stack);
    } else {
        console.log('Successfully connected to PostgreSQL database');
        release();
    }
});

// =========================
// MIDDLEWARE
// =========================

// Authentication middleware
async function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const result = await pool.query(
            `SELECT u.*, 
                    COALESCE(
                        (SELECT json_object_agg(game_type, json_build_object('bestScore', best_score, 'gamesPlayed', games_played))
                         FROM game_stats WHERE user_id = u.user_id), 
                        '{}'::json
                    ) as games
             FROM user_sessions s
             JOIN users u ON s.user_id = u.user_id
             WHERE s.session_token = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
            [token]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid or expired session' });
        }
        
        const user = result.rows[0];
        delete user.password_hash;
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Server error' });
    }
}

// =========================
// AUTHENTICATION ROUTES
// =========================

// Sign up
app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password, evmAddress } = req.body;
    
    try {
        // Validate input
        if (!name || !email || !password || !evmAddress) {
            return res.status(400).json({ 
                success: false, 
                error: 'All fields are required' 
            });
        }
        
        // Check if email already exists
        const emailCheck = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email already exists' 
            });
        }
        
        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        // Generate unique user ID
        const userId = 'user_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
        
        // Insert new user
        const result = await pool.query(
            `INSERT INTO users (user_id, name, email, password_hash, evm_address) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING user_id, name, email, evm_address, total_points`,
            [userId, name, email, passwordHash, evmAddress]
        );
        
        // Initialize game stats for both games
        await pool.query(
            `INSERT INTO game_stats (user_id, game_type) 
             VALUES ($1, '2048'), ($1, 'tetris')`,
            [userId]
        );
        
        res.json({ 
            success: true, 
            user: result.rows[0] 
        });
        
    } catch (error) {
        console.error('Sign up error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Sign in
app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Get user by email
        const result = await pool.query(
            `SELECT u.*, 
                    COALESCE(
                        (SELECT json_object_agg(game_type, json_build_object('bestScore', best_score, 'gamesPlayed', games_played))
                         FROM game_stats WHERE user_id = u.user_id), 
                        '{}'::json
                    ) as games
             FROM users u 
             WHERE email = $1`,
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }
        
        const user = result.rows[0];
        
        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!passwordMatch) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid email or password' 
            });
        }
        
        // Update last login
        await pool.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
            [user.user_id]
        );
        
        // Generate session token
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        await pool.query(
            'INSERT INTO user_sessions (session_token, user_id, expires_at) VALUES ($1, $2, $3)',
            [sessionToken, user.user_id, expiresAt]
        );
        
        // Remove password hash from response
        delete user.password_hash;
        
        res.json({ 
            success: true, 
            user: user,
            sessionToken: sessionToken
        });
        
    } catch (error) {
        console.error('Sign in error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Verify session
app.get('/api/auth/verify', authMiddleware, (req, res) => {
    res.json({ 
        success: true, 
        user: req.user 
    });
});

// Sign out
app.post('/api/auth/signout', authMiddleware, async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    try {
        await pool.query(
            'DELETE FROM user_sessions WHERE session_token = $1',
            [token]
        );
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Sign out error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// =========================
// GAME SCORE ROUTES
// =========================

// Update score
app.post('/api/score/update', authMiddleware, async (req, res) => {
    const { gameType, score } = req.body;
    const userId = req.user.user_id;
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get current best score
        const currentStats = await client.query(
            'SELECT best_score FROM game_stats WHERE user_id = $1 AND game_type = $2',
            [userId, gameType]
        );
        
        const currentBest = currentStats.rows[0]?.best_score || 0;
        const isNewBest = score > currentBest;
        
        // Update game stats
        await client.query(
            `UPDATE game_stats 
             SET games_played = games_played + 1,
                 best_score = GREATEST(best_score, $3),
                 updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND game_type = $2`,
            [userId, gameType, score]
        );
        
        // Add to leaderboard history
        await client.query(
            'INSERT INTO leaderboard (user_id, game_type, score) VALUES ($1, $2, $3)',
            [userId, gameType, score]
        );
        
        // Update total points (sum of best scores)
        await client.query(
            `UPDATE users 
             SET total_points = (
                 SELECT COALESCE(SUM(best_score), 0) 
                 FROM game_stats 
                 WHERE user_id = $1
             )
             WHERE user_id = $1`,
            [userId]
        );
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            isNewBest: isNewBest,
            previousBest: currentBest,
            newScore: score
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update score error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    } finally {
        client.release();
    }
});

// Get leaderboard
app.get('/api/leaderboard/:gameType', async (req, res) => {
    const { gameType } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    try {
        const result = await pool.query(
            `SELECT DISTINCT ON (u.user_id) 
                    u.user_id, u.name, u.evm_address, 
                    l.score, l.achieved_at
             FROM leaderboard l
             JOIN users u ON l.user_id = u.user_id
             WHERE l.game_type = $1
             ORDER BY u.user_id, l.score DESC, l.achieved_at DESC`,
            [gameType]
        );
        
        // Sort by score after getting distinct users
        const leaderboard = result.rows
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
        
        res.json({ 
            success: true, 
            leaderboard: leaderboard 
        });
        
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Get user rank
app.get('/api/score/rank/:gameType', authMiddleware, async (req, res) => {
    const { gameType } = req.params;
    const userId = req.user.user_id;
    
    try {
        const result = await pool.query(
            `WITH user_scores AS (
                SELECT DISTINCT ON (user_id) 
                       user_id, score
                FROM leaderboard
                WHERE game_type = $1
                ORDER BY user_id, score DESC
            ),
            ranked_scores AS (
                SELECT user_id, score,
                       RANK() OVER (ORDER BY score DESC) as rank
                FROM user_scores
            )
            SELECT rank, score
            FROM ranked_scores
            WHERE user_id = $2`,
            [gameType, userId]
        );
        
        if (result.rows.length === 0) {
            return res.json({ 
                success: true, 
                rank: null, 
                score: 0 
            });
        }
        
        res.json({ 
            success: true, 
            rank: parseInt(result.rows[0].rank),
            score: result.rows[0].score
        });
        
    } catch (error) {
        console.error('Get user rank error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// =========================
// CHECKPOINT ROUTES
// =========================

// Save checkpoint
app.post('/api/checkpoint/save', authMiddleware, async (req, res) => {
    const { gameType, gameState, checkpointName } = req.body;
    const userId = req.user.user_id;
    
    try {
        const result = await pool.query(
            `INSERT INTO game_checkpoints 
             (user_id, game_type, checkpoint_name, game_state, score, level)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, created_at`,
            [
                userId, 
                gameType, 
                checkpointName || `Autosave ${new Date().toLocaleString()}`,
                JSON.stringify(gameState),
                gameState.score || 0,
                gameState.level || 1
            ]
        );
        
        res.json({ 
            success: true, 
            checkpointId: result.rows[0].id,
            createdAt: result.rows[0].created_at
        });
        
    } catch (error) {
        console.error('Save checkpoint error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Load checkpoint
app.get('/api/checkpoint/load/:gameType', authMiddleware, async (req, res) => {
    const { gameType } = req.params;
    const { checkpointId } = req.query;
    const userId = req.user.user_id;
    
    try {
        let query, params;
        
        if (checkpointId) {
            // Load specific checkpoint
            query = `SELECT * FROM game_checkpoints 
                    WHERE user_id = $1 AND game_type = $2 AND id = $3`;
            params = [userId, gameType, checkpointId];
        } else {
            // Load most recent checkpoint
            query = `SELECT * FROM game_checkpoints 
                    WHERE user_id = $1 AND game_type = $2 
                    ORDER BY created_at DESC 
                    LIMIT 1`;
            params = [userId, gameType];
        }
        
        const result = await pool.query(query, params);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'No checkpoint found' 
            });
        }
        
        const checkpoint = result.rows[0];
        
        res.json({ 
            success: true, 
            checkpoint: {
                id: checkpoint.id,
                name: checkpoint.checkpoint_name,
                gameState: checkpoint.game_state,
                score: checkpoint.score,
                level: checkpoint.level,
                createdAt: checkpoint.created_at
            }
        });
        
    } catch (error) {
        console.error('Load checkpoint error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// List checkpoints
app.get('/api/checkpoint/list/:gameType', authMiddleware, async (req, res) => {
    const { gameType } = req.params;
    const userId = req.user.user_id;
    const limit = parseInt(req.query.limit) || 10;
    
    try {
        const result = await pool.query(
            `SELECT id, checkpoint_name, score, level, created_at
             FROM game_checkpoints
             WHERE user_id = $1 AND game_type = $2
             ORDER BY created_at DESC
             LIMIT $3`,
            [userId, gameType, limit]
        );
        
        res.json({ 
            success: true, 
            checkpoints: result.rows 
        });
        
    } catch (error) {
        console.error('List checkpoints error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// Delete checkpoint
app.delete('/api/checkpoint/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.user_id;
    
    try {
        const result = await pool.query(
            'DELETE FROM game_checkpoints WHERE user_id = $1 AND id = $2 RETURNING id',
            [userId, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Checkpoint not found' 
            });
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Delete checkpoint error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error' 
        });
    }
});

// =========================
// SERVER STARTUP
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`GameHub server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    await pool.end();
    process.exit(0);
});