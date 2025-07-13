#!/usr/bin/env node
/**
 * Step 2: Create Analytics Table
 * 
 * Creates the optimized analytics table with proper indexes for fast querying.
 */

require('dotenv').config();
const { Pool } = require('pg');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS analytics (
    id BIGSERIAL PRIMARY KEY,
    
    -- Core Event Information
    event_name VARCHAR(255) NOT NULL,     -- "Workout Started", "Purchase Completed", "Error"
    event_category VARCHAR(100),          -- "fitness", "ecommerce", "navigation", "error"
    event_detail TEXT,                    -- Key human-readable context
    
    -- User Identification
    distinct_id VARCHAR(255) NOT NULL,    -- Mixpanel tracking ID
    user_id VARCHAR(255),                 -- Your app's user ID (nullable)
    session_id VARCHAR(255),              -- Session tracking
    
    -- Context & Platform
    platform VARCHAR(20),                -- "web", "mobile", "server"
    country_code CHAR(2),                 -- "US", "AU", "CA"
    timestamp TIMESTAMPTZ NOT NULL,       -- Event timestamp
    
    -- Flexible Storage
    properties JSONB                      -- All other event properties
);
`;

const CREATE_INDEXES_SQL = [
    'CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics (timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics (event_name);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_distinct_id ON analytics (distinct_id);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics (user_id) WHERE user_id IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_analytics_platform_time ON analytics (platform, timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_country_time ON analytics (country_code, timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_user_session ON analytics (user_id, session_id) WHERE user_id IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_analytics_properties_gin ON analytics USING GIN (properties);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_event_detail ON analytics USING GIN (to_tsvector(\'english\', event_detail)) WHERE event_detail IS NOT NULL;'
];

async function createAnalyticsTable() {
    console.log('📊 Creating Analytics Table...\n');
    
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false
    });
    
    try {
        const client = await pool.connect();
        
        // Check if table already exists
        const tableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'analytics'
            )
        `);
        
        if (tableExists.rows[0].exists) {
            console.log('⚠️  Analytics table already exists');
            
            // Get current row count
            const countResult = await client.query('SELECT COUNT(*) FROM analytics');
            console.log(`   Current rows: ${parseInt(countResult.rows[0].count).toLocaleString()}`);
            
            console.log('\n🔄 Adding any missing indexes...');
        } else {
            console.log('✅ Creating new analytics table...');
            
            // Create the table
            await client.query(CREATE_TABLE_SQL);
            console.log('✅ Analytics table created successfully');
        }
        
        // Create indexes (will skip if they already exist)
        console.log('🔗 Creating optimized indexes...');
        for (let i = 0; i < CREATE_INDEXES_SQL.length; i++) {
            const indexSql = CREATE_INDEXES_SQL[i];
            const indexName = indexSql.match(/idx_analytics_[a-z_]+/)?.[0] || `index ${i + 1}`;
            
            try {
                await client.query(indexSql);
                console.log(`   ✓ ${indexName}`);
            } catch (error) {
                console.log(`   ⚠️  ${indexName} (${error.message})`);
            }
        }
        
        // Verify table structure
        const columnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'analytics'
            ORDER BY ordinal_position
        `);
        
        console.log(`\n📋 Table structure (${columnsResult.rows.length} columns):`);
        columnsResult.rows.forEach(row => {
            const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(required)';
            console.log(`   ${row.column_name}: ${row.data_type} ${nullable}`);
        });
        
        // Get index information
        const indexesResult = await client.query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'analytics'
            AND schemaname = 'public'
            ORDER BY indexname
        `);
        
        console.log(`\n🔗 Indexes created (${indexesResult.rows.length} total):`);
        indexesResult.rows.forEach(row => {
            console.log(`   ✓ ${row.indexname}`);
        });
        
        client.release();
        
    } catch (error) {
        console.error('❌ Failed to create analytics table:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
    
    console.log('\n🎉 Analytics table setup completed successfully!');
    console.log('Next step: node 3-download-mixpanel.js (optional, for migration)');
    console.log('Or start the API: npm run dev');
}

if (require.main === module) {
    createAnalyticsTable().catch(console.error);
}

module.exports = { createAnalyticsTable };