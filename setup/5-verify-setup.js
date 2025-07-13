#!/usr/bin/env node
/**
 * Verify Setup
 * 
 * Validates that the analytics setup is working correctly and provides data insights.
 */

require('dotenv').config();
const { Pool } = require('pg');

function showUsage() {
    console.log(`
🔍 Setup Verification Tool

Usage:
  node verify-setup.js [options]

Options:
  --start-date YYYY-MM-DD  Start date for analysis
  --end-date YYYY-MM-DD    End date for analysis  
  --help                   Show this help

Examples:
  node verify-setup.js
  node verify-setup.js --start-date 2024-01-01 --end-date 2024-12-31
`);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--help':
                showUsage();
                process.exit(0);
                break;
            case '--start-date':
                options.startDate = args[++i];
                break;
            case '--end-date':
                options.endDate = args[++i];
                break;
            default:
                console.error(`Unknown option: ${arg}`);
                showUsage();
                process.exit(1);
        }
    }
    
    return options;
}

async function verifySetup(options) {
    console.log('🔍 Verifying Analytics Setup...\n');
    
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
        
        // 1. Check database connection
        console.log('🔌 Database Connection...');
        const versionResult = await client.query('SELECT version()');
        console.log(`   ✅ PostgreSQL ${versionResult.rows[0].version.split(' ')[1]}`);
        
        // 2. Check analytics table exists
        console.log('\\n📊 Analytics Table...');
        const tableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'analytics'
            )
        `);
        
        if (!tableExists.rows[0].exists) {
            console.log('   ❌ Analytics table not found');
            console.log('   💡 Run: node 2-create-table.js');
            client.release();
            process.exit(1);
        }
        console.log('   ✅ Analytics table exists');
        
        // 3. Check table structure
        const columnsResult = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'analytics'
            ORDER BY ordinal_position
        `);
        console.log(`   ✅ ${columnsResult.rows.length} columns configured`);
        
        // 4. Check indexes
        const indexesResult = await client.query(`
            SELECT COUNT(*) as index_count
            FROM pg_indexes
            WHERE tablename = 'analytics'
            AND schemaname = 'public'
        `);
        console.log(`   ✅ ${indexesResult.rows[0].index_count} indexes created`);
        
        // 5. Data overview
        console.log('\\n📈 Data Overview...');
        
        let whereClause = '';
        let params = [];
        
        if (options.startDate || options.endDate) {
            const conditions = [];
            let paramIndex = 1;
            
            if (options.startDate) {
                conditions.push(`timestamp >= $${paramIndex++}`);
                params.push(options.startDate);
            }
            if (options.endDate) {
                conditions.push(`timestamp <= $${paramIndex++}`);
                params.push(options.endDate + ' 23:59:59');
            }
            
            whereClause = 'WHERE ' + conditions.join(' AND ');
        }
        
        // Total events
        const totalResult = await client.query(`SELECT COUNT(*) FROM analytics ${whereClause}`, params);
        const totalEvents = parseInt(totalResult.rows[0].count);
        console.log(`   📊 Total events: ${totalEvents.toLocaleString()}`);
        
        if (totalEvents === 0) {
            console.log('   ⚠️  No data found');
            console.log('   💡 Import data with: node 4-import-mixpanel.js');
            console.log('   💡 Or start tracking with the API');
        } else {
            // Date range
            const dateRangeResult = await client.query(`
                SELECT 
                    MIN(timestamp)::date as earliest_date,
                    MAX(timestamp)::date as latest_date
                FROM analytics ${whereClause}
            `, params);
            const dateRange = dateRangeResult.rows[0];
            console.log(`   📅 Date range: ${dateRange.earliest_date} to ${dateRange.latest_date}`);
            
            // Unique users
            const usersResult = await client.query(`
                SELECT 
                    COUNT(DISTINCT distinct_id) as total_users,
                    COUNT(DISTINCT user_id) as authenticated_users
                FROM analytics ${whereClause}
            `, params);
            const users = usersResult.rows[0];
            console.log(`   👥 Unique users: ${parseInt(users.total_users).toLocaleString()} total, ${parseInt(users.authenticated_users).toLocaleString()} authenticated`);
            
            // Top events
            const topEventsResult = await client.query(`
                SELECT event_name, COUNT(*) as count
                FROM analytics ${whereClause}
                GROUP BY event_name
                ORDER BY count DESC
                LIMIT 5
            `, params);
            console.log('\\n🏆 Top Events:');
            topEventsResult.rows.forEach((row, index) => {
                console.log(`   ${index + 1}. ${row.event_name}: ${parseInt(row.count).toLocaleString()}`);
            });
            
            // Platform breakdown
            const platformResult = await client.query(`
                SELECT 
                    platform,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percentage
                FROM analytics ${whereClause}
                WHERE platform IS NOT NULL
                GROUP BY platform
                ORDER BY count DESC
            `, params);
            
            if (platformResult.rows.length > 0) {
                console.log('\\n📱 Platform Breakdown:');
                platformResult.rows.forEach(row => {
                    console.log(`   ${row.platform}: ${parseInt(row.count).toLocaleString()} (${row.percentage}%)`);
                });
            }
            
            // Geographic distribution
            const countryResult = await client.query(`
                SELECT 
                    country_code,
                    COUNT(*) as count
                FROM analytics ${whereClause}
                WHERE country_code IS NOT NULL
                GROUP BY country_code
                ORDER BY count DESC
                LIMIT 5
            `, params);
            
            if (countryResult.rows.length > 0) {
                console.log('\\n🌍 Top Countries:');
                countryResult.rows.forEach((row, index) => {
                    console.log(`   ${index + 1}. ${row.country_code}: ${parseInt(row.count).toLocaleString()}`);
                });
            }
            
            // Recent activity
            const recentResult = await client.query(`
                SELECT 
                    event_name,
                    event_detail,
                    platform,
                    timestamp
                FROM analytics ${whereClause}
                ORDER BY timestamp DESC
                LIMIT 3
            `, params);
            
            console.log('\\n🕐 Recent Activity:');
            recentResult.rows.forEach(row => {
                const detail = row.event_detail ? ` (${row.event_detail})` : '';
                console.log(`   ${row.timestamp.toISOString().split('T')[0]} ${row.timestamp.toTimeString().split(' ')[0]} - ${row.event_name}${detail}`);
            });
        }
        
        client.release();
        
        console.log('\\n🎉 Setup verification completed successfully!');
        
        if (totalEvents > 0) {
            console.log('\\n✅ Your analytics system is ready!');
            console.log('💡 Start the API with: npm run dev');
        } else {
            console.log('\\n⚠️  Ready for data collection');
            console.log('💡 Import historical data: node 4-import-mixpanel.js');
            console.log('💡 Or start the API: npm run dev');
        }
        
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        
        if (error.code === 'ENOTFOUND') {
            console.log('💡 Check your DB_HOST in .env file');
        } else if (error.code === 'ECONNREFUSED') {
            console.log('💡 Check your DB_PORT and ensure PostgreSQL is running');
        } else if (error.message.includes('authentication failed')) {
            console.log('💡 Check your DB_USERNAME and DB_PASSWORD in .env file');
        }
        
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    const options = parseArgs();
    verifySetup(options).catch(console.error);
}

module.exports = { verifySetup };