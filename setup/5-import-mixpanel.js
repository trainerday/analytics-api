#!/usr/bin/env node
/**
 * Step 4: Import Mixpanel Data
 * 
 * Transforms and imports downloaded Mixpanel JSON files into PostgreSQL analytics table.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function showUsage() {
    console.log(`
📤 Mixpanel Data Importer

Usage:
  node 4-import-mixpanel.js [options]

Options:
  --input-dir <path>       Directory containing Mixpanel JSON files (default: ./mixpanel_data)
  --batch-size <number>    Number of events per batch (default: 1000)
  --start-date YYYY-MM-DD  Only import files from this date onwards
  --end-date YYYY-MM-DD    Only import files up to this date
  --dry-run               Show what would be imported without actually importing
  --help                  Show this help

Examples:
  node 4-import-mixpanel.js
  node 4-import-mixpanel.js --batch-size 500 --start-date 2024-01-01
  node 4-import-mixpanel.js --dry-run
`);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        inputDir: './mixpanel_data',
        batchSize: 1000,
        dryRun: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--help':
                showUsage();
                process.exit(0);
                break;
            case '--input-dir':
                options.inputDir = args[++i];
                break;
            case '--batch-size':
                options.batchSize = parseInt(args[++i]);
                break;
            case '--start-date':
                options.startDate = args[++i];
                break;
            case '--end-date':
                options.endDate = args[++i];
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            default:
                console.error(`Unknown option: ${arg}`);
                showUsage();
                process.exit(1);
        }
    }
    
    return options;
}

function transformMixpanelEvent(event) {
    const props = event.properties || {};
    
    // Extract core fields
    const transformed = {
        event_name: event.event,
        event_category: categorizeEvent(event.event),
        distinct_id: props.distinct_id || props.$distinct_id,
        user_id: extractUserId(props.distinct_id || props.$distinct_id, props),
        session_id: props.session_id || props.$session_id,
        platform: derivePlatform(props.mp_lib),
        country_code: props.mp_country_code,
        timestamp: new Date(props.time * 1000).toISOString(),
        event_detail: extractEventDetail(event.event, props),
        properties: cleanProperties(props)
    };
    
    return transformed;
}

function categorizeEvent(eventName) {
    const categories = {
        fitness: ['workout', 'training', 'exercise', 'activity', 'session'],
        ecommerce: ['purchase', 'subscription', 'payment', 'billing', 'checkout'],
        navigation: ['page', 'view', 'visit', 'navigate', 'click'],
        user_lifecycle: ['register', 'login', 'logout', 'install', 'signup'],
        error: ['error', 'issue', 'failed', 'crash'],
        engagement: ['search', 'share', 'save', 'like', 'favorite']
    };
    
    const lowerEvent = eventName.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => lowerEvent.includes(keyword))) {
            return category;
        }
    }
    
    return null;
}

function extractUserId(distinctId, props) {
    // If distinct_id is numeric, it's likely a user ID
    if (distinctId && /^\\d+$/.test(distinctId)) {
        return distinctId;
    }
    
    // Check for explicit user_id properties
    return props.$user_id || props.user_id || null;
}

function derivePlatform(mpLib) {
    if (!mpLib) return null;
    
    const lib = mpLib.toLowerCase();
    if (lib.includes('react-native')) return 'mobile';
    if (lib.includes('web') || lib.includes('javascript')) return 'web';
    if (lib.includes('node')) return 'server';
    
    return null;
}

function extractEventDetail(eventName, props) {
    // Extract meaningful details based on event type
    if (eventName.toLowerCase().includes('error') || eventName.toLowerCase().includes('issue')) {
        return props.error_message || props.error || props.message;
    }
    
    if (eventName.toLowerCase().includes('workout') || eventName.toLowerCase().includes('training')) {
        return props.workout_name || props.workout_type || props.activity_type;
    }
    
    if (eventName.toLowerCase().includes('search')) {
        return props.search_term || props.query || props.search_query;
    }
    
    if (eventName.toLowerCase().includes('purchase') || eventName.toLowerCase().includes('subscription')) {
        return props.product_name || props.subscription_type || props.plan_name;
    }
    
    return null;
}

function cleanProperties(props) {
    // Remove core fields that are stored in dedicated columns
    const coreFields = [
        'distinct_id', '$distinct_id', 'user_id', '$user_id',
        'session_id', '$session_id', 'time', 'mp_lib',
        'mp_country_code', 'token', '$token'
    ];
    
    const cleaned = { ...props };
    coreFields.forEach(field => delete cleaned[field]);
    
    return cleaned;
}

async function importMixpanelData(options) {
    console.log('📤 Importing Mixpanel Data to PostgreSQL...\n');
    
    // Check if input directory exists
    if (!fs.existsSync(options.inputDir)) {
        console.error(`❌ Input directory not found: ${options.inputDir}`);
        console.log('Run step 3 first: node 3-download-mixpanel.js');
        process.exit(1);
    }
    
    // Get list of JSON files
    const files = fs.readdirSync(options.inputDir)
        .filter(f => f.startsWith('mixpanel_') && f.endsWith('.json'))
        .sort();
    
    if (files.length === 0) {
        console.error(`❌ No Mixpanel JSON files found in ${options.inputDir}`);
        console.log('Run step 3 first: node 3-download-mixpanel.js');
        process.exit(1);
    }
    
    // Filter files by date range if specified
    let filteredFiles = files;
    if (options.startDate || options.endDate) {
        filteredFiles = files.filter(file => {
            const match = file.match(/mixpanel_([0-9]{4}-[0-9]{2}-[0-9]{2})\\.json/);
            if (!match) return false;
            
            const fileDate = match[1];
            if (options.startDate && fileDate < options.startDate) return false;
            if (options.endDate && fileDate > options.endDate) return false;
            
            return true;
        });
    }
    
    console.log(`📁 Found ${files.length} total files, processing ${filteredFiles.length}`);
    
    if (options.dryRun) {
        console.log('\\n🔍 DRY RUN - Files that would be processed:');
        filteredFiles.forEach(file => console.log(`   ${file}`));
        return;
    }
    
    // Setup database connection
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
        
        // Check if analytics table exists
        const tableExists = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'analytics'
            )
        `);
        
        if (!tableExists.rows[0].exists) {
            console.error('❌ Analytics table not found');
            console.log('Run step 2 first: node 2-create-table.js');
            process.exit(1);
        }
        
        let totalImported = 0;
        let totalSkipped = 0;
        
        // Process each file
        for (const file of filteredFiles) {
            const filePath = path.join(options.inputDir, file);
            console.log(`\\n📄 Processing ${file}...`);
            
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                if (!Array.isArray(data)) {
                    console.log(`   ⚠️  Skipping ${file}: Invalid format`);
                    continue;
                }
                
                console.log(`   📊 ${data.length} events found`);
                
                if (data.length === 0) {
                    console.log(`   ✓ Skipped (empty file)`);
                    continue;
                }
                
                // Process in batches
                let imported = 0;
                let skipped = 0;
                
                for (let i = 0; i < data.length; i += options.batchSize) {
                    const batch = data.slice(i, i + options.batchSize);
                    const values = [];
                    const params = [];
                    
                    batch.forEach((event, index) => {
                        try {
                            const transformed = transformMixpanelEvent(event);
                            const baseIndex = index * 10;
                            
                            values.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10})`);
                            params.push(
                                transformed.event_name,
                                transformed.event_category,
                                transformed.event_detail,
                                transformed.distinct_id,
                                transformed.user_id,
                                transformed.session_id,
                                transformed.platform,
                                transformed.country_code,
                                transformed.timestamp,
                                JSON.stringify(transformed.properties)
                            );
                            imported++;
                        } catch (error) {
                            console.log(`   ⚠️  Skipped invalid event: ${error.message}`);
                            skipped++;
                        }
                    });
                    
                    if (values.length > 0) {
                        const insertSQL = `
                            INSERT INTO analytics (
                                event_name, event_category, event_detail, distinct_id, user_id,
                                session_id, platform, country_code, timestamp, properties
                            ) VALUES ${values.join(', ')}
                            ON CONFLICT DO NOTHING
                        `;
                        
                        await client.query(insertSQL, params);
                    }
                }
                
                console.log(`   ✅ Imported ${imported} events (${skipped} skipped)`);
                totalImported += imported;
                totalSkipped += skipped;
                
            } catch (error) {
                console.log(`   ❌ Failed to process ${file}: ${error.message}`);
            }
        }
        
        client.release();
        
        console.log('\\n🎉 Import completed successfully!');
        console.log(`📊 Total events imported: ${totalImported.toLocaleString()}`);
        console.log(`⚠️  Total events skipped: ${totalSkipped.toLocaleString()}`);
        
        // Get final count
        const client2 = await pool.connect();
        const countResult = await client2.query('SELECT COUNT(*) FROM analytics');
        console.log(`📈 Total analytics table rows: ${parseInt(countResult.rows[0].count).toLocaleString()}`);
        client2.release();
        
        console.log('\\nNext step: Start the API with npm run dev');
        
    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    const options = parseArgs();
    importMixpanelData(options).catch(console.error);
}

module.exports = { importMixpanelData };