#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    user: process.env.DB_USERNAME,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync('postgres.crt')
    }
});

async function showRecentEvents() {
    const client = await pool.connect();
    try {
        console.log('\n=== ANALYTICS EVENTS (Last 10) ===');
        const result = await client.query(`
            SELECT event_name, timestamp, distinct_id, properties 
            FROM analytics 
            ORDER BY timestamp DESC 
            LIMIT 10
        `);
        
        result.rows.forEach((row, i) => {
            const props = row.properties || {};
            const time = row.timestamp.toLocaleString();
            console.log(`${i+1}. [${time}] ${row.event_name}`);
            console.log(`   User: ${row.distinct_id}`);
            if (props.page) console.log(`   Page: ${props.page}`);
            if (props.button_name) console.log(`   Button: ${props.button_name}`);
            if (props.demo_property) console.log(`   Demo: ${props.demo_property}`);
            console.log('');
        });
    } finally {
        client.release();
        pool.end();
    }
}

showRecentEvents().catch(console.error);