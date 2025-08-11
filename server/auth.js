const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('./config');
const db = require('./database');

class AuthManager {
    generateTokens(user) {
        const payload = { 
            id: user.id, 
            email: user.email, 
            name: user.name 
        };
        
        const token = jwt.sign(payload, config.jwt.secret, { 
            expiresIn: config.jwt.expiresIn 
        });
        
        const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, { 
            expiresIn: config.jwt.refreshExpiresIn 
        });
        
        return { token, refreshToken };
    }
    
    async hashPassword(password) {
        return await bcrypt.hash(password, 12);
    }
    
    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }
    
    verifyToken(token) {
        try {
            return jwt.verify(token, config.jwt.secret);
        } catch (error) {
            throw new Error('Invalid token');
        }
    }
    
    verifyRefreshToken(refreshToken) {
        try {
            return jwt.verify(refreshToken, config.jwt.refreshSecret);
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }
    
    middleware() {
        return (req, res, next) => {
            const authHeader = req.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'No token provided' });
            }
            
            const token = authHeader.substring(7);
            
            try {
                const decoded = this.verifyToken(token);
                req.user = decoded;
                next();
            } catch (error) {
                return res.status(401).json({ error: 'Invalid token' });
            }
        };
    }
    
    async register(email, phone, name, password, notificationPreference = 'SMS', notificationInterval = 6) {
        // Check if user already exists
        const existingUser = db.statements.getUserByEmail.get(email);
        if (existingUser) {
            throw new Error('User already exists');
        }
        
        // Validate input
        if (!email || !name || !password) {
            throw new Error('Email, name, and password are required');
        }
        
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }
        
        const passwordHash = await this.hashPassword(password);
        
        try {
            const result = db.statements.createUser.run(
                email, phone, name, passwordHash, notificationPreference, notificationInterval
            );
            
            const user = db.statements.getUserById.get(result.lastInsertRowid);
            const { token, refreshToken } = this.generateTokens(user);
            
            // Don't return password hash
            delete user.password_hash;
            
            return { user, token, refreshToken };
        } catch (error) {
            throw new Error('Failed to create user: ' + error.message);
        }
    }
    
    async login(email, password) {
        const user = db.statements.getUserByEmail.get(email);
        
        if (!user) {
            throw new Error('Invalid credentials');
        }
        
        const isValidPassword = await this.verifyPassword(password, user.password_hash);
        
        if (!isValidPassword) {
            throw new Error('Invalid credentials');
        }
        
        const { token, refreshToken } = this.generateTokens(user);
        
        // Don't return password hash
        delete user.password_hash;
        
        return { user, token, refreshToken };
    }
    
    async refreshToken(refreshToken) {
        try {
            const decoded = this.verifyRefreshToken(refreshToken);
            const user = db.statements.getUserById.get(decoded.id);
            
            if (!user) {
                throw new Error('User not found');
            }
            
            const { token, refreshToken: newRefreshToken } = this.generateTokens(user);
            
            delete user.password_hash;
            
            return { user, token, refreshToken: newRefreshToken };
        } catch (error) {
            throw new Error('Invalid refresh token');
        }
    }
}

module.exports = new AuthManager();