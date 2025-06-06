-- GameHub Database Setup Script
-- Run this script to create all necessary tables for GameHub

-- Create database (run this separately if needed)
-- CREATE DATABASE gamehub;

-- Connect to the gamehub database before running the rest
-- \c gamehub

-- Drop existing tables if they exist (careful in production!)
DROP TABLE IF EXISTS game_checkpoints CASCADE;
DROP TABLE IF EXISTS leaderboard CASCADE;
DROP TABLE IF EXISTS game_stats CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table for authentication
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    evm_address VARCHAR(42) NOT NULL,
    total_points INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Game statistics table
CREATE TABLE game_stats (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL,
    best_score INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    total_time_played INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, game_type)
);

-- Leaderboard entries
CREATE TABLE leaderboard (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL,
    score INTEGER NOT NULL,
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster leaderboard queries
CREATE INDEX idx_game_score ON leaderboard(game_type, score DESC);

-- Game checkpoints/saves
CREATE TABLE game_checkpoints (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL,
    checkpoint_name VARCHAR(100),
    game_state JSON NOT NULL,
    score INTEGER,
    level INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for checkpoint queries
CREATE INDEX idx_user_game ON game_checkpoints(user_id, game_type);

-- Session management
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for session lookups
CREATE INDEX idx_token ON user_sessions(session_token);

-- Create some demo data (optional)
-- Uncomment below to add demo users and scores

/*
-- Demo users
INSERT INTO users (user_id, name, email, password_hash, evm_address, total_points) VALUES
('demo_user_1', 'Alice Gamer', 'alice@example.com', '$2b$10$YourHashedPasswordHere', '0x1234567890abcdef1234567890abcdef12345678', 5000),
('demo_user_2', 'Bob Player', 'bob@example.com', '$2b$10$YourHashedPasswordHere', '0xabcdef1234567890abcdef1234567890abcdef12', 3500),
('demo_user_3', 'Charlie Pro', 'charlie@example.com', '$2b$10$YourHashedPasswordHere', '0x9876543210fedcba9876543210fedcba98765432', 7500);

-- Demo game stats
INSERT INTO game_stats (user_id, game_type, best_score, games_played) VALUES
('demo_user_1', '2048', 2048, 15),
('demo_user_1', 'tetris', 3000, 20),
('demo_user_2', '2048', 1024, 10),
('demo_user_2', 'tetris', 2500, 18),
('demo_user_3', '2048', 4096, 25),
('demo_user_3', 'tetris', 5000, 30);

-- Demo leaderboard entries
INSERT INTO leaderboard (user_id, game_type, score) VALUES
('demo_user_1', '2048', 2048),
('demo_user_1', 'tetris', 3000),
('demo_user_2', '2048', 1024),
('demo_user_2', 'tetris', 2500),
('demo_user_3', '2048', 4096),
('demo_user_3', 'tetris', 5000);
*/

-- Verify tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;