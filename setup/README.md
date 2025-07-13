# Analytics API Setup Guide

Complete guide to set up your analytics infrastructure and migrate from Mixpanel.

## Overview

This setup process will:
1. ✅ Configure your PostgreSQL database
2. ✅ Create optimized analytics table
3. ✅ Verify everything works
4. ✅ Optionally migrate historical data from Mixpanel
5. ✅ Update your client-side tracking

## Prerequisites

1. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database and Mixpanel credentials
   ```

2. **Install dependencies:**
   ```bash
   npm install  # For Node.js scripts
   pip install requests python-dotenv psycopg2-binary  # For Python utilities
   ```

## Step-by-Step Setup

### Step 1: Test Database Connection
```bash
node 1-test-database.js
```
**Purpose**: Verify your PostgreSQL credentials and connectivity before proceeding.

### Step 2: Create Analytics Table
```bash
node 2-create-table.js
```
**Purpose**: Create the optimized analytics table with proper indexes.

### Step 3: Verify Database Setup
```bash
# Verify database connection and table creation
node 3-verify-setup.js
```
**Purpose**: Check that database setup is working correctly before proceeding.

### Step 4: Download Mixpanel Data (Optional)
```bash
# Download last 365 days
node 4-download-mixpanel.js --days-back 365

# Download specific date range
node 4-download-mixpanel.js --start-date 2024-01-01 --end-date 2024-12-31

# Incremental download (from last file to yesterday)
node 4-download-mixpanel.js --incremental
```
**Purpose**: Export your historical data from Mixpanel. Skip if starting fresh.

### Step 5: Import Mixpanel Data (Optional)
```bash
# Import all downloaded data
node 5-import-mixpanel.js

# Import with custom options
node 5-import-mixpanel.js --batch-size 1000 --input-dir ./mixpanel_data
```
**Purpose**: Transform and load your Mixpanel data into PostgreSQL.

## Client-Side Integration

Once your analytics API is running, update your client-side tracking:

### Before (Standard Mixpanel)
```javascript
mixpanel.init('your-mixpanel-token');
mixpanel.track('Event Name', { property: 'value' });
```

### After (Your Analytics API)
```javascript
mixpanel.init('your-analytics-token', {
    trackingUrl: 'https://your-domain.com/track?data=',
    engageUrl: 'https://your-domain.com/engage?data='
});
mixpanel.track('Event Name', { property: 'value' });
```

No other code changes needed! Your existing Mixpanel tracking code will work with your analytics API.

## Configuration Details

### Database SSL Certificate

Some managed PostgreSQL services (like DigitalOcean, AWS RDS) require SSL certificates:

1. **Download your certificate file** from your database provider
   - DigitalOcean: `ca-certificate.crt`
   - AWS RDS: `rds-ca-2019-root.pem`
   - Google Cloud: `server-ca.pem`

2. **Place certificate in project root** (same directory as package.json)

3. **Update your `.env`** to uncomment and set the certificate:
   ```env
   DB_SSLROOTCERT=ca-certificate.crt
   ```

4. **If you don't need SSL certificates** (local PostgreSQL, some cloud providers):
   - Keep the `DB_SSLROOTCERT` line commented out
   - Or set `DB_SSLMODE=disable` for completely local setups

### Mixpanel Export Credentials

Get your export credentials from Mixpanel:
1. Go to Project Settings → Service Accounts
2. Create a new service account with export permissions
3. Add credentials to `.env`:
   ```
   MIXPANEL_USERNAME=export.abc123.mp-service-account
   MIXPANEL_PASSWORD=your-export-password
   MIXPANEL_PROJECT_ID=your-project-id
   ```

## Data Processing

The migration preserves all your Mixpanel data while optimizing the structure:

- **Events**: `event` → `event_name`
- **User tracking**: `distinct_id` preserved, `user_id` extracted
- **Timestamps**: Unix timestamps → PostgreSQL TIMESTAMPTZ
- **Properties**: All properties preserved in JSONB
- **Platform detection**: Derived from `mp_lib` values
- **Geographic data**: Extracted from `mp_country_code`

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Check your DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD in `.env`
- Ensure PostgreSQL is running and accessible
- Verify SSL settings if required

**Mixpanel Export Issues**
- Verify your service account has export permissions
- Check project ID is correct
- Mixpanel rate limits to 60 queries/hour

**Memory Issues**
For large datasets, increase Node.js memory:
```bash
node --max-old-space-size=4096 setup/5-import-mixpanel.js
```

**Import Errors**
- Ensure analytics table exists (run step 2)
- Check JSON file format and permissions
- Verify batch size isn't too large

### Getting Help

1. Run `node setup/3-verify-setup.js` to check your configuration
2. Check the console output for specific error messages
3. Ensure all environment variables are set correctly
4. Verify database permissions and connectivity

## Database Schema

The analytics API uses a 3-table architecture optimized for analytics queries:

### `analytics` table (events)
```sql
CREATE TABLE analytics (
    id BIGSERIAL PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_category VARCHAR(100),
    event_detail TEXT,
    distinct_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    platform VARCHAR(50),
    country_code CHAR(2),
    timestamp TIMESTAMPTZ NOT NULL,
    properties JSONB
);
```

### `analytics_users` table (user profiles)
```sql
CREATE TABLE analytics_users (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    distinct_id VARCHAR(255) NOT NULL,
    user_state VARCHAR(20) NOT NULL DEFAULT 'anonymous',
    device_ids TEXT[],
    first_seen TIMESTAMPTZ NOT NULL,
    last_seen TIMESTAMPTZ NOT NULL,
    properties JSONB
);
```

### `identity_mappings` table (identity stitching)
```sql
CREATE TABLE identity_mappings (
    id BIGSERIAL PRIMARY KEY,
    anonymous_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    device_id VARCHAR(255),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    events_stitched INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL
);
```

**24 optimized indexes** are created automatically for fast querying across all analytics dimensions.

## Testing & Verification

### Demo Page
After setup, test the complete integration with the demo page:

```bash
npm start
# Open http://localhost:3000/demo/index.html
```

The demo page provides comprehensive testing of:
- Event tracking and identity stitching
- User profile management  
- API health monitoring
- Real-time debug output

### Database Monitoring
Check your data with the included monitoring script:

```bash
node check-events.js  # View recent events
```

## Next Steps

After completing setup:

1. **Start the API**: `npm run dev` (development) or `npm start` (production)
2. **Test with demo page**: Visit `/demo/index.html` for interactive testing
3. **Verify endpoints**: Use curl or Postman to check `/health`, `/track`, `/engage`
4. **Update your clients**: Point analytics tracking to your API endpoints (see [analytics-client](https://github.com/trainerday/analytics-client))
5. **Monitor data**: Use `node check-events.js` to verify data flow

Your analytics infrastructure is now independent of external services!