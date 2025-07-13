#!/usr/bin/env node
/**
 * Step 2: Create Analytics Table
 * 
 * Creates the optimized analytics table with proper indexes for fast querying.
 */

require('dotenv').config();
const { Pool } = require('pg');

const CREATE_ANALYTICS_TABLE_SQL = `
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

const CREATE_USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS analytics_users (
    id BIGSERIAL PRIMARY KEY,
    
    -- Core Identity
    distinct_id VARCHAR(255) UNIQUE NOT NULL,    -- Current distinct_id
    user_id VARCHAR(255),                        -- App's user ID
    anonymous_id VARCHAR(255),                   -- Original anonymous distinct_id
    
    -- Profile Data
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    properties JSONB,                            -- Additional profile properties
    
    -- User Journey Tracking
    user_state VARCHAR(20) DEFAULT 'anonymous', -- 'anonymous', 'identified', 'merged'
    device_ids JSONB,                           -- Track all associated devices
    
    -- Tracking
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    identified_at TIMESTAMPTZ,                   -- When identify() was called
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const CREATE_IDENTITY_MAPPINGS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS identity_mappings (
    id BIGSERIAL PRIMARY KEY,
    
    -- Identity Relationship
    canonical_user_id VARCHAR(255) NOT NULL,    -- The "main" user ID
    mapped_id VARCHAR(255) NOT NULL,            -- Device ID or alternate user ID  
    mapping_type VARCHAR(50) NOT NULL,          -- 'device_id', 'user_id', 'email'
    
    -- Confidence and Context
    confidence_score DECIMAL(3,2) DEFAULT 1.0,  -- 0.0 to 1.0 confidence level
    source VARCHAR(50) DEFAULT 'identify_call', -- How this mapping was created
    
    -- Tracking
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    events_stitched INTEGER DEFAULT 0,          -- Number of events retroactively updated
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(canonical_user_id, mapped_id, mapping_type)
);
`;

const CREATE_INDEXES_SQL = [
    // Analytics table indexes
    'CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics (timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics (event_name);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_distinct_id ON analytics (distinct_id);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics (user_id) WHERE user_id IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_analytics_platform_time ON analytics (platform, timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_country_time ON analytics (country_code, timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_user_session ON analytics (user_id, session_id) WHERE user_id IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_analytics_properties_gin ON analytics USING GIN (properties);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_event_detail ON analytics USING GIN (to_tsvector(\'english\', event_detail)) WHERE event_detail IS NOT NULL;',
    
    // Analytics users table indexes
    'CREATE INDEX IF NOT EXISTS idx_analytics_users_user_id ON analytics_users (user_id) WHERE user_id IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_analytics_users_email ON analytics_users (email) WHERE email IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_analytics_users_anonymous_id ON analytics_users (anonymous_id) WHERE anonymous_id IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_analytics_users_last_seen ON analytics_users (last_seen);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_users_user_state ON analytics_users (user_state);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_users_properties_gin ON analytics_users USING GIN (properties);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_users_device_ids_gin ON analytics_users USING GIN (device_ids);',
    
    // Identity mappings table indexes
    'CREATE INDEX IF NOT EXISTS idx_identity_mappings_canonical_user ON identity_mappings (canonical_user_id);',
    'CREATE INDEX IF NOT EXISTS idx_identity_mappings_mapped_id ON identity_mappings (mapped_id);',
    'CREATE INDEX IF NOT EXISTS idx_identity_mappings_type ON identity_mappings (mapping_type);',
    'CREATE INDEX IF NOT EXISTS idx_identity_mappings_lookup ON identity_mappings (mapped_id, mapping_type);',
    'CREATE INDEX IF NOT EXISTS idx_identity_mappings_confidence ON identity_mappings (confidence_score);'
];

async function createAnalyticsTable() {
    console.log('📊 Creating Analytics Tables...\n');
    
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
        
        // Check if analytics table already exists
        const analyticsTableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'analytics'
            )
        `);
        
        // Check if analytics_users table already exists
        const usersTableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'analytics_users'
            )
        `);
        
        // Check if identity_mappings table already exists
        const identityTableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'identity_mappings'
            )
        `);
        
        // Create analytics table if needed
        if (analyticsTableExists.rows[0].exists) {
            console.log('⚠️  Analytics table already exists');
            
            // Get current row count
            const countResult = await client.query('SELECT COUNT(*) FROM analytics');
            console.log(`   Current rows: ${parseInt(countResult.rows[0].count).toLocaleString()}`);
        } else {
            console.log('✅ Creating new analytics table...');
            await client.query(CREATE_ANALYTICS_TABLE_SQL);
            console.log('✅ Analytics table created successfully');
        }
        
        // Create analytics_users table if needed
        if (usersTableExists.rows[0].exists) {
            console.log('⚠️  Analytics users table already exists');
            
            // Get current row count
            const userCountResult = await client.query('SELECT COUNT(*) FROM analytics_users');
            console.log(`   Current analytics users: ${parseInt(userCountResult.rows[0].count).toLocaleString()}`);
        } else {
            console.log('✅ Creating new analytics users table...');
            await client.query(CREATE_USERS_TABLE_SQL);
            console.log('✅ Analytics users table created successfully');
        }
        
        // Create identity_mappings table if needed
        if (identityTableExists.rows[0].exists) {
            console.log('⚠️  Identity mappings table already exists');
            
            // Get current row count
            const mappingCountResult = await client.query('SELECT COUNT(*) FROM identity_mappings');
            console.log(`   Current identity mappings: ${parseInt(mappingCountResult.rows[0].count).toLocaleString()}`);
        } else {
            console.log('✅ Creating new identity mappings table...');
            await client.query(CREATE_IDENTITY_MAPPINGS_TABLE_SQL);
            console.log('✅ Identity mappings table created successfully');
        }
        
        console.log('\n🔄 Adding any missing indexes...');
        
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
        
        // Verify analytics table structure
        const analyticsColumnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'analytics'
            ORDER BY ordinal_position
        `);
        
        console.log(`\n📋 Analytics table structure (${analyticsColumnsResult.rows.length} columns):`);
        analyticsColumnsResult.rows.forEach(row => {
            const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(required)';
            console.log(`   ${row.column_name}: ${row.data_type} ${nullable}`);
        });
        
        // Verify analytics_users table structure
        const usersColumnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'analytics_users'
            ORDER BY ordinal_position
        `);
        
        console.log(`\n📋 Analytics users table structure (${usersColumnsResult.rows.length} columns):`);
        usersColumnsResult.rows.forEach(row => {
            const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(required)';
            console.log(`   ${row.column_name}: ${row.data_type} ${nullable}`);
        });
        
        // Verify identity_mappings table structure
        const identityColumnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'identity_mappings'
            ORDER BY ordinal_position
        `);
        
        console.log(`\n📋 Identity mappings table structure (${identityColumnsResult.rows.length} columns):`);
        identityColumnsResult.rows.forEach(row => {
            const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(required)';
            console.log(`   ${row.column_name}: ${row.data_type} ${nullable}`);
        });
        
        // Get index information for all tables
        const indexesResult = await client.query(`
            SELECT indexname, tablename, indexdef
            FROM pg_indexes
            WHERE (tablename = 'analytics' OR tablename = 'analytics_users' OR tablename = 'identity_mappings')
            AND schemaname = 'public'
            ORDER BY tablename, indexname
        `);
        
        console.log(`\n🔗 Indexes created (${indexesResult.rows.length} total):`);
        indexesResult.rows.forEach(row => {
            console.log(`   ✓ ${row.tablename}.${row.indexname}`);
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