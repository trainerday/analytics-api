#!/usr/bin/env node
/**
 * Step 3: Download Mixpanel Data
 * 
 * Downloads historical data from Mixpanel API for migration to PostgreSQL.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function showUsage() {
    console.log(`
📥 Mixpanel Data Downloader

Usage:
  node 3-download-mixpanel.js [options]

Options:
  --days-back <number>     Download last N days (default: 30)
  --start-date YYYY-MM-DD  Start date for download
  --end-date YYYY-MM-DD    End date for download  
  --incremental            Download from last file to yesterday
  --help                   Show this help

Examples:
  node 3-download-mixpanel.js --days-back 365
  node 3-download-mixpanel.js --start-date 2024-01-01 --end-date 2024-12-31
  node 3-download-mixpanel.js --incremental

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

function checkPythonDependencies() {
    try {
        execSync('python3 -c "import requests, json, base64"', { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

async function downloadMixpanelData(options) {
    console.log('📥 Downloading Mixpanel Data...\n');
    
    // Check required environment variables
    const required = ['MIXPANEL_USERNAME', 'MIXPANEL_PASSWORD', 'MIXPANEL_PROJECT_ID'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(key => console.error(`   ${key}`));
        console.log('\n💡 Add these to your .env file');
        process.exit(1);
    }
    
    // Check if Python dependencies are available
    if (!checkPythonDependencies()) {
        console.log('⚠️  Python dependencies not found');
        console.log('Installing required packages...\n');
        
        try {
            execSync('pip3 install requests python-dotenv', { stdio: 'inherit' });
            console.log('✅ Dependencies installed successfully\n');
        } catch (error) {
            console.error('❌ Failed to install Python dependencies');
            console.log('Please install manually: pip3 install requests python-dotenv');
            process.exit(1);
        }
    }
    
    // Create output directory
    const outputDir = path.join(process.cwd(), 'mixpanel_data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
        console.log(`📁 Created output directory: ${outputDir}`);
    }
    
    // Build command for Python exporter
    const pythonScript = path.join(__dirname, 'mixpanel-exporter.py');
    let command = `python3 "${pythonScript}"`;
    
    if (options.incremental) {
        command += ' --mode incremental';
    } else {
        command += ' --mode full';
        if (options.daysBack) {
            command += ` --days-back ${options.daysBack}`;
        }
        if (options.startDate) {
            command += ` --start-date ${options.startDate}`;
        }
        if (options.endDate) {
            command += ` --end-date ${options.endDate}`;
        }
    }
    
    console.log(`🚀 Running: ${command}\n`);
    
    try {
        execSync(command, { 
            stdio: 'inherit',
            cwd: process.cwd(),
            env: { ...process.env }
        });
        
        // Count downloaded files
        const files = fs.readdirSync(outputDir).filter(f => f.startsWith('mixpanel_') && f.endsWith('.json'));
        
        console.log('\n🎉 Download completed successfully!');
        console.log(`📁 Files downloaded: ${files.length}`);
        console.log(`📁 Output directory: ${outputDir}`);
        
        if (files.length > 0) {
            console.log('\nNext step: node 4-import-mixpanel.js');
        } else {
            console.log('\n⚠️  No data files downloaded');
            console.log('This might mean:');
            console.log('- No events in the specified date range');
            console.log('- Incorrect Mixpanel credentials');
            console.log('- Network connectivity issues');
        }
        
    } catch (error) {
        console.error('\n❌ Download failed:', error.message);
        console.log('\n💡 Troubleshooting:');
        console.log('1. Check your Mixpanel credentials in .env');
        console.log('2. Verify your project ID is correct');
        console.log('3. Ensure you have export permissions');
        process.exit(1);
    }
}

if (require.main === module) {
    const options = parseArgs();
    downloadMixpanelData(options).catch(console.error);
}

module.exports = { downloadMixpanelData };