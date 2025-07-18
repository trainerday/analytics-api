const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const router = express.Router();

// Generate a UUID v4 for device IDs
function generateUUID() {
    return crypto.randomUUID();
}

// Extract or generate device ID from request
function getOrCreateDeviceId(req) {
    // Priority: URL param -> Cookie -> Generate new
    const deviceId = req.query.device_id || 
                    req.cookies.mp_device_id || 
                    generateUUID();
    
    return deviceId;
}

// Database connection pool
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false
});

// Helper function to extract common event data
function extractEventData(eventData, isIdentify = false) {
    const { event, properties } = eventData;
    
    // For identify events, use the provided distinct_id, otherwise use the one from properties
    const distinctId = isIdentify ? properties.distinct_id : properties.distinct_id;
    
    return {
        event_name: event,
        event_category: categorizeEvent(event),
        event_detail: null, // Can be enhanced later
        distinct_id: distinctId,
        user_id: properties.$user_id || properties.distinct_id,
        session_id: properties.$session_id || null,
        platform: detectPlatform(properties),
        country_code: extractCountryCode(properties),
        timestamp: new Date(properties.time * 1000), // Convert Unix timestamp to Date
        properties: sanitizeProperties(properties)
    };
}

// Helper function to categorize events
function categorizeEvent(eventName) {
    const eventLower = eventName.toLowerCase();
    
    if (eventLower.includes('workout') || eventLower.includes('training') || eventLower.includes('exercise')) {
        return 'fitness';
    } else if (eventLower.includes('purchase') || eventLower.includes('payment') || eventLower.includes('subscription')) {
        return 'ecommerce';
    } else if (eventLower.includes('page') || eventLower.includes('view') || eventLower.includes('navigate')) {
        return 'navigation';
    } else if (eventLower.includes('error') || eventLower.includes('crash') || eventLower.includes('fail')) {
        return 'error';
    } else if (eventLower.includes('identify') || eventLower.includes('login') || eventLower.includes('signup')) {
        return 'user';
    } else {
        return 'general';
    }
}

// Helper function to detect platform
function detectPlatform(properties) {
    if (properties.$os) {
        const os = properties.$os.toLowerCase();
        if (os.includes('ios') || os.includes('android')) {
            return 'mobile';
        } else if (os.includes('mac') || os.includes('windows') || os.includes('linux')) {
            return properties.$browser ? 'web' : 'desktop';
        }
    }
    
    if (properties.$browser) {
        return 'web';
    }
    
    if (properties.Source === 'SERVER' || properties.source === 'server') {
        return 'server';
    }
    
    return 'unknown';
}

// Helper function to extract country code
function extractCountryCode(properties) {
    return properties.$country_code || 
           properties.country_code || 
           properties.country || 
           null;
}

// Helper function to sanitize properties (remove system fields we store separately)
function sanitizeProperties(properties) {
    const systemFields = [
        'token', 'distinct_id', '$user_id', '$session_id', 'time',
        '$os', '$browser', '$browser_version', '$device', '$country_code',
        'country_code', 'country', '$anon_distinct_id'
    ];
    
    const sanitized = { ...properties };
    systemFields.forEach(field => delete sanitized[field]);
    
    return sanitized;
}

// Helper function to extract device ID from properties
function extractDeviceId(properties) {
    return properties.$device_id || 
           properties.device_id || 
           properties.$insert_id ||  // Fallback to insert_id if no device_id
           null;
}

// Helper function to upsert user data
async function upsertUser(client, distinctId, userData = {}) {
    const now = new Date();
    const deviceId = extractDeviceId(userData);
    const deviceIds = deviceId ? [deviceId] : [];
    
    // Use proper PostgreSQL upsert to avoid race conditions
    const upsertQuery = `
        INSERT INTO analytics_users (
            distinct_id, user_state, device_ids, 
            first_seen, last_seen, created_at, updated_at
        )
        VALUES ($1, 'anonymous', $2, $3, $3, $3, $3)
        ON CONFLICT (distinct_id) DO UPDATE SET
            last_seen = EXCLUDED.last_seen,
            device_ids = CASE 
                WHEN $2::jsonb != analytics_users.device_ids AND NOT (analytics_users.device_ids @> $2::jsonb)
                THEN (analytics_users.device_ids::jsonb || $2::jsonb)
                ELSE analytics_users.device_ids
            END,
            updated_at = EXCLUDED.updated_at
        RETURNING id
    `;
    
    return await client.query(upsertQuery, [distinctId, JSON.stringify(deviceIds), now]);
}

// Helper function to stitch identity - retroactively update events
async function stitchIdentity(client, anonymousId, userId, deviceId = null) {
    const now = new Date();
    
    // 1. Count events that will be stitched
    const eventCountResult = await client.query(`
        SELECT COUNT(*) FROM analytics 
        WHERE distinct_id = $1 AND (user_id IS NULL OR user_id != $2)
    `, [anonymousId, userId]);
    
    const eventsToStitch = parseInt(eventCountResult.rows[0].count);
    
    // 2. Update all historical anonymous events with the new user_id
    await client.query(`
        UPDATE analytics 
        SET user_id = $1
        WHERE distinct_id = $2 AND (user_id IS NULL OR user_id != $1)
    `, [userId, anonymousId]);
    
    // 3. Create identity mapping record
    await client.query(`
        INSERT INTO identity_mappings 
        (canonical_user_id, mapped_id, mapping_type, source, events_stitched, first_seen, last_seen)
        VALUES ($1, $2, 'device_id', 'identify_call', $3, $4, $4)
        ON CONFLICT (canonical_user_id, mapped_id, mapping_type) 
        DO UPDATE SET 
            last_seen = $4,
            events_stitched = identity_mappings.events_stitched + $3,
            updated_at = $4
    `, [userId, anonymousId, eventsToStitch, now]);
    
    // 4. If we have a device ID, create that mapping too
    if (deviceId && deviceId !== anonymousId) {
        await client.query(`
            INSERT INTO identity_mappings 
            (canonical_user_id, mapped_id, mapping_type, source, first_seen, last_seen)
            VALUES ($1, $2, 'device_id', 'identify_call', $3, $3)
            ON CONFLICT (canonical_user_id, mapped_id, mapping_type) 
            DO UPDATE SET 
                last_seen = $3,
                updated_at = $3
        `, [userId, deviceId, now]);
    }
    
    return eventsToStitch;
}

// Helper function to handle identify calls
async function handleIdentify(client, eventData) {
    const { properties } = eventData;
    const newDistinctId = properties.distinct_id;
    const anonymousId = properties.$anon_distinct_id;
    const userId = properties.$user_id;
    const deviceId = properties.$device_id;
    
    // Check for existing identity conflicts
    const existingMapping = await client.query(`
        SELECT canonical_user_id, confidence_score 
        FROM identity_mappings 
        WHERE mapped_id = $1 AND mapping_type = 'device_id'
        ORDER BY confidence_score DESC
        LIMIT 1
    `, [anonymousId]);
    
    let identityConflict = false;
    if (existingMapping.rows.length > 0 && existingMapping.rows[0].canonical_user_id !== userId) {
        identityConflict = true;
        console.warn(`Identity conflict detected: Device ${anonymousId} was previously mapped to ${existingMapping.rows[0].canonical_user_id}, now being mapped to ${userId}`);
    }
    
    // Perform identity stitching
    const eventsStitched = await stitchIdentity(client, anonymousId, userId, deviceId);
    
    // Check if anonymous user exists in analytics_users table
    const anonymousUser = await client.query(
        'SELECT * FROM analytics_users WHERE distinct_id = $1',
        [anonymousId]
    );
    
    const now = new Date();
    
    if (anonymousUser.rows.length > 0) {
        // Update the anonymous user to be identified
        const deviceIds = anonymousUser.rows[0].device_ids || [];
        if (deviceId && !deviceIds.includes(deviceId)) {
            deviceIds.push(deviceId);
        }
        
        const updateQuery = `
            UPDATE analytics_users 
            SET distinct_id = $1, 
                user_id = $2, 
                identified_at = $3, 
                user_state = 'identified',
                device_ids = $4,
                updated_at = $3
            WHERE distinct_id = $5
            RETURNING id
        `;
        await client.query(updateQuery, [newDistinctId, userId, now, JSON.stringify(deviceIds), anonymousId]);
    } else {
        // Create new identified user
        const deviceIds = deviceId ? [deviceId] : [];
        
        const insertQuery = `
            INSERT INTO analytics_users (
                distinct_id, user_id, anonymous_id, identified_at, 
                user_state, device_ids, first_seen, last_seen, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, 'identified', $5, $6, $6, $6, $6)
            RETURNING id
        `;
        await client.query(insertQuery, [newDistinctId, userId, anonymousId, now, JSON.stringify(deviceIds), now]);
    }
    
    return {
        eventsStitched,
        identityConflict,
        message: `Identity stitched: ${eventsStitched} events linked to user ${userId}`
    };
}

// Track endpoint - handles events and identify calls
router.get('/track', async (req, res) => {
    try {
        // Decode base64 data
        const encodedData = req.query.data;
        if (!encodedData) {
            return res.status(400).json({ error: 'Missing data parameter' });
        }

        const decodedData = Buffer.from(encodedData, 'base64').toString('utf8');
        const eventData = JSON.parse(decodedData);

        // Get or create persistent device ID
        const deviceId = getOrCreateDeviceId(req);
        
        // Enhance event data with device ID if not present
        if (!eventData.properties.$device_id) {
            eventData.properties.$device_id = deviceId;
        }

        // Check if this is an identify call
        const isIdentify = eventData.event === '$identify';
        
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            if (isIdentify) {
                // Handle identify call - update users table and stitch identity
                const identityResult = await handleIdentify(client, eventData);
                console.log(`Identity stitching completed: ${identityResult.message}`);
            } else {
                // For regular events, ensure user exists and track device
                await upsertUser(client, eventData.properties.distinct_id, eventData.properties);
            }
            
            // Extract and transform data for analytics table
            const transformedData = extractEventData(eventData, isIdentify);

            // Insert event into analytics table
            const insertQuery = `
                INSERT INTO analytics (
                    event_name, event_category, event_detail, distinct_id, user_id, 
                    session_id, platform, country_code, timestamp, properties
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `;
            
            const values = [
                transformedData.event_name,
                transformedData.event_category,
                transformedData.event_detail,
                transformedData.distinct_id,
                transformedData.user_id,
                transformedData.session_id,
                transformedData.platform,
                transformedData.country_code,
                transformedData.timestamp,
                JSON.stringify(transformedData.properties)
            ];

            const result = await client.query(insertQuery, values);
            
            await client.query('COMMIT');
            
            // Set persistent device ID cookie (30 days expiry)
            if (!req.cookies.mp_device_id) {
                res.cookie('mp_device_id', deviceId, {
                    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                    httpOnly: false, // Allow JavaScript access
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax'
                });
            }
            
            // Return success response (Mixpanel-compatible format)
            res.json({ 
                status: 1,
                error: null,
                id: result.rows[0].id,
                device_id: deviceId // Include device ID in response
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Track endpoint error:', error);
        res.status(500).json({ 
            status: 0,
            error: 'Internal server error'
        });
    }
});

// Engage endpoint - handles user profile updates
router.get('/engage', async (req, res) => {
    try {
        // Decode base64 data
        const encodedData = req.query.data;
        if (!encodedData) {
            return res.status(400).json({ error: 'Missing data parameter' });
        }

        const decodedData = Buffer.from(encodedData, 'base64').toString('utf8');
        const profileData = JSON.parse(decodedData);

        // Extract profile update data
        const distinctId = profileData.$distinct_id;
        const setData = profileData.$set || {};

        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Extract common profile fields
            const email = setData.$email || setData.email;
            const firstName = setData.$first_name || setData.first_name;
            const lastName = setData.$last_name || setData.last_name;
            
            // Remove standard fields from properties
            const customProperties = { ...setData };
            delete customProperties.$email;
            delete customProperties.email;
            delete customProperties.$first_name;
            delete customProperties.first_name;
            delete customProperties.$last_name;
            delete customProperties.last_name;

            // Check if user exists
            const existingUser = await client.query(
                'SELECT * FROM analytics_users WHERE distinct_id = $1',
                [distinctId]
            );
            
            if (existingUser.rows.length > 0) {
                // Update existing user profile
                const updateQuery = `
                    UPDATE analytics_users 
                    SET email = COALESCE($1, email),
                        first_name = COALESCE($2, first_name),
                        last_name = COALESCE($3, last_name),
                        properties = COALESCE($4, properties),
                        last_seen = $5,
                        updated_at = $5
                    WHERE distinct_id = $6
                    RETURNING id
                `;
                
                const result = await client.query(updateQuery, [
                    email, firstName, lastName, 
                    Object.keys(customProperties).length > 0 ? JSON.stringify(customProperties) : null,
                    new Date(), distinctId
                ]);
                
                // Also record this as a profile update event in analytics
                const analyticsQuery = `
                    INSERT INTO analytics (
                        event_name, event_category, event_detail, distinct_id, user_id,
                        session_id, platform, country_code, timestamp, properties
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `;
                
                await client.query(analyticsQuery, [
                    '$profile_set', 'user', 'Profile update',
                    distinctId, distinctId, null, 'api', null,
                    new Date(), JSON.stringify(setData)
                ]);
                
                await client.query('COMMIT');
                
                res.json({ 
                    status: 1,
                    error: null,
                    user_id: result.rows[0].id
                });
                
            } else {
                // Create new user with profile data
                const now = new Date();
                const insertQuery = `
                    INSERT INTO analytics_users (
                        distinct_id, email, first_name, last_name, properties,
                        first_seen, last_seen, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id
                `;
                
                const result = await client.query(insertQuery, [
                    distinctId, email, firstName, lastName,
                    Object.keys(customProperties).length > 0 ? JSON.stringify(customProperties) : null,
                    now, now, now, now
                ]);
                
                // Also record this as a profile creation event in analytics
                const analyticsQuery = `
                    INSERT INTO analytics (
                        event_name, event_category, event_detail, distinct_id, user_id,
                        session_id, platform, country_code, timestamp, properties
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `;
                
                await client.query(analyticsQuery, [
                    '$profile_set', 'user', 'Profile created',
                    distinctId, distinctId, null, 'api', null,
                    now, JSON.stringify(setData)
                ]);
                
                await client.query('COMMIT');
                
                res.json({ 
                    status: 1,
                    error: null,
                    user_id: result.rows[0].id
                });
            }
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Engage endpoint error:', error);
        res.status(500).json({ 
            status: 0,
            error: 'Internal server error'
        });
    }
});

// Health check endpoint with enhanced user journey analytics
router.get('/health', async (req, res) => {
    try {
        const client = await pool.connect();
        
        // Get analytics count
        const analyticsResult = await client.query('SELECT COUNT(*) FROM analytics');
        
        // Get users count by state
        const usersStateResult = await client.query(`
            SELECT user_state, COUNT(*) as count 
            FROM analytics_users 
            GROUP BY user_state
        `);
        
        // Get identity mappings count
        const mappingsResult = await client.query('SELECT COUNT(*) FROM identity_mappings');
        
        // Get recent activity (last 24 hours)
        const recentEventsResult = await client.query(`
            SELECT COUNT(*) FROM analytics 
            WHERE timestamp > NOW() - INTERVAL '24 hours'
        `);
        
        // Get recent identifications
        const recentIdentificationsResult = await client.query(`
            SELECT COUNT(*) FROM analytics 
            WHERE event_name = '$identify' AND timestamp > NOW() - INTERVAL '24 hours'
        `);
        
        // Get events stitched count
        const eventsStitchedResult = await client.query(`
            SELECT SUM(events_stitched) as total_stitched 
            FROM identity_mappings
        `);
        
        client.release();

        // Format user states for response
        const userStates = {};
        usersStateResult.rows.forEach(row => {
            userStates[row.user_state] = parseInt(row.count);
        });

        res.json({
            status: 'healthy',
            database: 'connected',
            analytics: {
                total_events: parseInt(analyticsResult.rows[0].count),
                events_24h: parseInt(recentEventsResult.rows[0].count),
                events_stitched: parseInt(eventsStitchedResult.rows[0].total_stitched) || 0
            },
            users: {
                total_users: Object.values(userStates).reduce((sum, count) => sum + count, 0),
                by_state: userStates,
                identifications_24h: parseInt(recentIdentificationsResult.rows[0].count)
            },
            identity: {
                total_mappings: parseInt(mappingsResult.rows[0].count)
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error.message
        });
    }
});

module.exports = router;