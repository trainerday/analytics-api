#!/usr/bin/env node
/**
 * Step 1: Test Database Connection
 * 
 * Verifies PostgreSQL connectivity and credentials before proceeding with setup.
 */

require('dotenv').config();
const { Pool } = require('pg');

async function testDatabaseConnection() {
    console.log('🔌 Testing PostgreSQL Connection...\n');
    
    // Database configuration from environment
    const config = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false
    };
    
    console.log(`Host: ${config.host}`);
    console.log(`Port: ${config.port}`);
    console.log(`Database: ${config.database}`);
    console.log(`User: ${config.user}`);
    console.log(`SSL: ${config.ssl ? 'enabled' : 'disabled'}`);
    console.log('-'.repeat(50));
    
    const pool = new Pool(config);
    
    try {
        // Test basic connection
        const client = await pool.connect();
        
        // Test basic query
        const versionResult = await client.query('SELECT version()');
        console.log('✅ Connection successful!');
        console.log(`PostgreSQL version: ${versionResult.rows[0].version.split(' ')[1]}`);
        
        // Test current database info
        const dbInfoResult = await client.query('SELECT current_database(), current_user');
        console.log(`Current database: ${dbInfoResult.rows[0].current_database}`);
        console.log(`Current user: ${dbInfoResult.rows[0].current_user}`);
        
        // List existing tables
        const tablesResult = await client.query(`
            SELECT schemaname, tablename 
            FROM pg_tables 
            WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
            ORDER BY schemaname, tablename
        `);
        
        if (tablesResult.rows.length > 0) {
            console.log(`\nFound ${tablesResult.rows.length} existing tables:`);
            tablesResult.rows.forEach(row => {
                console.log(`  ${row.schemaname}.${row.tablename}`);
            });
        } else {
            console.log('\nNo user tables found (this is normal for new databases)');
        }
        
        // Check if analytics table already exists
        const analyticsCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'analytics'
            )
        `);
        
        if (analyticsCheck.rows[0].exists) {
            console.log('\n⚠️  Analytics table already exists');
            console.log('   Run step 2 only if you want to recreate it');
        } else {
            console.log('\n✅ Ready for step 2: Create analytics table');
        }
        
        client.release();
        
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        
        // Provide helpful error guidance
        if (error.code === 'ENOTFOUND') {
            console.log('\n💡 Check your DB_HOST in .env file');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Check your DB_PORT and ensure PostgreSQL is running');
        } else if (error.message.includes('authentication failed')) {
            console.log('\n💡 Check your DB_USERNAME and DB_PASSWORD in .env file');
        } else if (error.message.includes('database') && error.message.includes('does not exist')) {
            console.log('\n💡 Check your DB_DATABASE name in .env file');
        }
        
        process.exit(1);
    } finally {
        await pool.end();
    }
    
    console.log('\n🎉 Database test completed successfully!');
    console.log('Next step: node 2-create-table.js');
}

if (require.main === module) {
    testDatabaseConnection().catch(console.error);
}

module.exports = { testDatabaseConnection };