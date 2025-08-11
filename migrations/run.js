const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function runMigrations() {
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/vessels.db');
    
    console.log('Running database migrations...');
    console.log('Database path:', dbPath);
    
    // Check if database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        console.log('Database directory does not exist, creating:', dbDir);
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
        console.log('Database file does not exist, will be created');
    } else {
        console.log('Database file exists, size:', fs.statSync(dbPath).size, 'bytes');
    }
    
    let db;
    try {
        db = new Database(dbPath);
        console.log('Database connection established for migrations');
    } catch (error) {
        console.error('Failed to connect to database for migrations:', error);
        console.error('Database path:', dbPath);
        throw error;
    }
    
    // Create migrations table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Get list of executed migrations
    const executedMigrations = db.prepare('SELECT filename FROM migrations').all()
        .map(row => row.filename);
    
    // Get all migration files
    const migrationsDir = __dirname;
    const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
    
    let executed = 0;
    
    for (const file of migrationFiles) {
        if (!executedMigrations.includes(file)) {
            console.log(`Executing migration: ${file}`);
            
            const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            
            try {
                db.exec(sqlContent);
                db.prepare('INSERT INTO migrations (filename) VALUES (?)').run(file);
                executed++;
                console.log(`✓ Migration ${file} completed`);
            } catch (error) {
                console.error(`✗ Migration ${file} failed:`, error.message);
                process.exit(1);
            }
        }
    }
    
    if (executed === 0) {
        console.log('No new migrations to execute');
    } else {
        console.log(`Executed ${executed} migration(s)`);
    }
    
    db.close();
}

if (require.main === module) {
    runMigrations();
}

module.exports = { runMigrations };