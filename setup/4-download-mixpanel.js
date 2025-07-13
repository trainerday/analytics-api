#!/usr/bin/env node
/**
 * Step 4: Download Mixpanel Data
 * 
 * Downloads historical data from Mixpanel API for migration to PostgreSQL.
 * Pure Node.js implementation - no Python dependencies required.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

function showUsage() {
    console.log(`
📥 Mixpanel Data Downloader

Usage:
  node 4-download-mixpanel.js [options]

Options:
  --days-back <number>     Download last N days (default: 30)
  --start-date YYYY-MM-DD  Start date for download
  --end-date YYYY-MM-DD    End date for download  
  --incremental            Download from last file to yesterday
  --help                   Show this help

Examples:
  node 4-download-mixpanel.js --days-back 365
  node 4-download-mixpanel.js --start-date 2024-01-01 --end-date 2024-12-31
  node 4-download-mixpanel.js --incremental

Environment variables required:
  MIXPANEL_USERNAME  - Your Mixpanel service account username
  MIXPANEL_PASSWORD  - Your Mixpanel service account password  
  MIXPANEL_PROJECT_ID - Your Mixpanel project ID
`);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        daysBack: 30,
        incremental: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--help':
                showUsage();
                process.exit(0);
                break;
            case '--days-back':
                options.daysBack = parseInt(args[++i]);
                break;
            case '--start-date':
                options.startDate = args[++i];
                break;
            case '--end-date':
                options.endDate = args[++i];
                break;
            case '--incremental':
                options.incremental = true;
                break;
            default:
                console.error(`Unknown option: ${arg}`);
                showUsage();
                process.exit(1);
        }
    }
    
    return options;
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function findLastFileDate(outputDir) {
    if (!fs.existsSync(outputDir)) {
        return null;
    }
    
    const files = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('mixpanel_') && f.endsWith('.json'));
    
    if (files.length === 0) {
        return null;
    }
    
    const dates = files.map(file => {
        try {
            const dateStr = file.replace('mixpanel_', '').replace('.json', '');
            return new Date(dateStr);
        } catch (error) {
            return null;
        }
    }).filter(date => date && !isNaN(date));
    
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
}

async function downloadDay(date, credentials, projectId, outputDir, forceDownload = false) {
    const dateStr = formatDate(date);
    const outputFile = path.join(outputDir, `mixpanel_${dateStr}.json`);
    
    // Skip if file exists and has content
    if (!forceDownload && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 2) {
        console.log(`✓ ${dateStr} (cached)`);
        return { success: true, hasData: fs.statSync(outputFile).size > 2 };
    }
    
    const authHeader = 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
    
    const params = new URLSearchParams({
        from_date: dateStr,
        to_date: dateStr,
        project_id: projectId
    });
    
    const url = `https://data.mixpanel.com/api/2.0/export?${params}`;
    
    return new Promise((resolve) => {
        const options = {
            method: 'GET',
            headers: {
                'Accept': 'text/plain',
                'Authorization': authHeader
            },
            timeout: 300000 // 5 minutes
        };
        
        const req = https.request(url, options, (res) => {
            let data = '';
            
            res.on('data', chunk => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        // Parse JSONL format (one JSON object per line)
                        const events = data.trim().split('\\n')
                            .filter(line => line.trim())
                            .map(line => JSON.parse(line));
                        
                        fs.writeFileSync(outputFile, JSON.stringify(events, null, 2));
                        
                        const hasData = events.length > 0;
                        const status = hasData ? "✅" : "⚪";
                        console.log(`${status} ${dateStr}: ${events.length} events`);
                        
                        resolve({ success: true, hasData });
                    } catch (error) {
                        console.log(`❌ ${dateStr}: Failed to parse response - ${error.message}`);
                        resolve({ success: false, hasData: false });
                    }
                } else if (res.statusCode === 429) {
                    console.log(`⏱️  ${dateStr}: Rate limited - skipping`);
                    resolve({ success: false, hasData: false });
                } else {
                    console.log(`❌ ${dateStr}: HTTP ${res.statusCode}`);
                    resolve({ success: false, hasData: false });
                }
            });
        });
        
        req.on('error', (error) => {
            console.log(`❌ ${dateStr}: ${error.message}`);
            resolve({ success: false, hasData: false });
        });
        
        req.on('timeout', () => {
            console.log(`❌ ${dateStr}: Request timeout`);
            req.destroy();
            resolve({ success: false, hasData: false });
        });
        
        req.end();
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadMixpanelData(options) {
    console.log('📥 Downloading Mixpanel Data...');
    console.log('🚀 Pure Node.js implementation - no Python required\\n');
    
    // Check required environment variables
    const required = ['MIXPANEL_USERNAME', 'MIXPANEL_PASSWORD', 'MIXPANEL_PROJECT_ID'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(key => console.error(`   ${key}`));
        console.log('\\n💡 Add these to your .env file');
        process.exit(1);
    }
    
    const credentials = {
        username: process.env.MIXPANEL_USERNAME,
        password: process.env.MIXPANEL_PASSWORD
    };
    const projectId = process.env.MIXPANEL_PROJECT_ID;
    
    console.log(`🔑 Using project ID: ${projectId}`);
    console.log(`👤 Using username: ${credentials.username}\\n`);
    
    // Create output directory
    const outputDir = path.join(process.cwd(), 'mixpanel_data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`📁 Created output directory: ${outputDir}`);
    }
    
    // Determine date range
    let startDate, endDate;
    
    if (options.incremental) {
        const lastFileDate = findLastFileDate(outputDir);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (lastFileDate) {
            startDate = new Date(lastFileDate);
            startDate.setDate(startDate.getDate() + 1); // Start from day after last file
            console.log(`📁 Last file: ${formatDate(lastFileDate)}`);
            console.log(`📅 Starting incremental from: ${formatDate(startDate)}`);
        } else {
            startDate = yesterday;
            console.log('📁 No existing files found. Starting from yesterday...');
        }
        endDate = yesterday;
    } else {
        endDate = options.endDate ? new Date(options.endDate) : new Date();
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        
        if (options.startDate) {
            startDate = new Date(options.startDate);
        } else {
            startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - options.daysBack);
        }
    }
    
    if (startDate > endDate) {
        console.log('✅ Already up to date!');
        return;
    }
    
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`🎯 Downloading from ${formatDate(startDate)} to ${formatDate(endDate)}`);
    console.log(`📊 Days to download: ${totalDays}`);
    console.log('⏱️  Using 60-second intervals to respect Mixpanel rate limits\\n');
    
    let successful = 0;
    let failed = 0;
    let consecutiveEmpty = 0;
    const maxConsecutiveEmpty = 30;
    
    // Download data day by day (working backwards from end date)
    let currentDate = new Date(endDate);
    
    while (currentDate >= startDate) {
        // Rate limiting: Mixpanel allows 60 queries/hour, so wait 1 minute between requests to be safe
        if (successful + failed > 0) {
            console.log('⏱️  Waiting 60 seconds for rate limiting...');
            await sleep(60000);
        }
        
        const result = await downloadDay(currentDate, credentials, projectId, outputDir);
        
        if (result.success) {
            successful++;
            if (result.hasData) {
                consecutiveEmpty = 0;
            } else {
                consecutiveEmpty++;
            }
        } else {
            failed++;
            consecutiveEmpty++;
        }
        
        // Stop if too many consecutive empty days (likely reached data retention limit)
        if (consecutiveEmpty >= maxConsecutiveEmpty) {
            console.log(`\\n🛑 Stopping: ${consecutiveEmpty} consecutive empty days`);
            console.log(`📊 Likely reached data retention limit around ${formatDate(currentDate)}`);
            break;
        }
        
        currentDate.setDate(currentDate.getDate() - 1);
        
        // Progress update every 10 days
        if ((successful + failed) % 10 === 0 && (successful + failed) > 0) {
            console.log(`📈 Progress: ${successful + failed} days processed, ${successful} successful`);
        }
    }
    
    // Count final results
    const files = fs.readdirSync(outputDir).filter(f => f.startsWith('mixpanel_') && f.endsWith('.json'));
    
    console.log('\\n' + '='.repeat(60));
    console.log('📊 DOWNLOAD COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Downloads attempted: ${successful + failed}`);
    console.log(`📁 Files created: ${files.length}`);
    console.log(`💾 Successful downloads: ${successful}`);
    console.log(`❌ Failed downloads: ${failed}`);
    
    if (files.length > 0) {
        console.log('\\n🎉 Download completed successfully!');
        console.log(`📁 Output directory: ${outputDir}`);
        console.log('Next step: node 5-import-mixpanel.js');
    } else {
        console.log('\\n⚠️  No data files downloaded');
        console.log('This might mean:');
        console.log('- No events in the specified date range');
        console.log('- Incorrect Mixpanel credentials');
        console.log('- Network connectivity issues');
    }
}

if (require.main === module) {
    const options = parseArgs();
    downloadMixpanelData(options).catch(console.error);
}

module.exports = { downloadMixpanelData };