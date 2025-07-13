# Analytics API

Open-source analytics API that provides a drop-in replacement for Mixpanel, storing events in your own PostgreSQL database for improved querying, data ownership, and cost optimization.

## 🚀 Quick Start

Replace Mixpanel with your own analytics infrastructure in 3 steps:

1. **Deploy the API**: `git clone && npm install && npm start`
2. **Setup the database**: `node setup/create-analytics-table.js`
3. **Update your client**: Change Mixpanel endpoints to point to your API

## ✨ Features

- 🔄 **Drop-in Mixpanel replacement** - Works with existing mixpanel-lite/mixpanel-js code
- 📊 **Optimized PostgreSQL schema** - Better performance than Mixpanel's JSON structure
- 🏠 **Data ownership** - Your data stays in your infrastructure
- 💰 **Cost savings** - Eliminate per-event pricing
- 🛠️ **Complete migration tools** - Export historical data from Mixpanel
- 🔍 **Better querying** - SQL analytics instead of Mixpanel's limited interface

## Purpose

This API acts as a drop-in replacement for Mixpanel's tracking endpoints, allowing TrainerDay to:
- Store analytics data in our own PostgreSQL data warehouse
- Optimize data structure for better query performance
- Maintain full control over analytics data
- Integrate with existing data infrastructure

## Database Schema

### Analytics Table Structure

```sql
CREATE TABLE analytics (
    id BIGSERIAL PRIMARY KEY,
    
    -- Core Event Information
    event_name VARCHAR(255) NOT NULL,     -- What happened: "Workout Started", "Purchase Completed", "Error"
    event_category VARCHAR(100),          -- Event grouping: "fitness", "ecommerce", "navigation", "error"
    event_detail TEXT,                    -- Key human-readable context (see examples below)
    
    -- User Identification
    distinct_id VARCHAR(255) NOT NULL,    -- Mixpanel tracking ID: "user-123" or "$device:abc-123"
    user_id VARCHAR(255),                 -- Your app's user ID: "114317" (null for anonymous users)
    session_id VARCHAR(255),              -- Session tracking: "sess_abc123" (for funnel analysis)
    
    -- Context & Platform
    platform VARCHAR(20),                -- Source platform: "web", "mobile", "server"
    country_code CHAR(2),                 -- Geographic data: "US", "AU", "CA"
    timestamp TIMESTAMPTZ NOT NULL,       -- When it happened (converted from Unix timestamp)
    
    -- Flexible Storage
    properties JSONB                      -- All other event properties and custom data
);
```

#### Field Examples & Use Cases

**event_detail Examples:**
- **Errors**: `"Failed to load workout: Network timeout"`, `"Payment failed: Invalid card"`
- **Workouts**: `"5K Training Run - Week 3"`, `"HIIT Cycling - 45min"`
- **Purchases**: `"Premium Monthly - $9.99"`, `"Premium Yearly - $99.99"`
- **Search**: `"cycling workouts"`, `"beginner training plans"`
- **Navigation**: `"Dashboard -> Workout Library"`, `"Settings -> Subscription"`

**distinct_id vs user_id:**
- **Anonymous user**: `distinct_id="$device:193fdb44aca1daa"`, `user_id=null`
- **Logged-in user**: `distinct_id="114317"`, `user_id="114317"`
- **Cross-device tracking**: `distinct_id="$device:abc123"`, `user_id="114317"`

**platform Classification:**
- **"mobile"**: From `mp_lib="react-native"` (iOS/Android apps)
- **"web"**: From `mp_lib="web"` (browser-based)
- **"server"**: From `mp_lib="node"` (server-side events)

**event_category Groupings:**
- **"fitness"**: Workout events, training activities
- **"ecommerce"**: Purchases, subscriptions, billing
- **"navigation"**: Page views, menu clicks
- **"user_lifecycle"**: Registration, login, logout
- **"error"**: Crashes, failures, issues
- **"engagement"**: Searches, shares, favorites

-- Essential indexes
CREATE INDEX idx_analytics_timestamp ON analytics (timestamp);
CREATE INDEX idx_analytics_event_name ON analytics (event_name);
CREATE INDEX idx_analytics_platform_time ON analytics (platform, timestamp);
CREATE INDEX idx_analytics_country_time ON analytics (country_code, timestamp);
CREATE INDEX idx_analytics_user_session ON analytics (user_id, session_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_analytics_properties_gin ON analytics USING GIN (properties);
```

## API Endpoints

### Track Events
```
GET /track?data={base64_encoded_data}&_={timestamp}
```

Handles `mixpanel.track()` calls from mixpanel-lite library.

**Expected Data Format:**
```json
{
    "event": "Workout Started",
    "properties": {
        "token": "td-analytics-token",
        "distinct_id": "user-123",
        "workout_type": "cycling",
        "duration": 45,
        "mp_lib": "mixpanel-lite"
    }
}
```

### User Profile Updates
```
GET /engage?data={base64_encoded_data}&_={timestamp}
```

Handles `mixpanel.people.set()` calls from mixpanel-lite library.

**Expected Data Format:**
```json
{
    "$token": "td-analytics-token",
    "$distinct_id": "user-123",
    "$set": {
        "$email": "athlete@example.com",
        "subscription": "premium"
    }
}
```

### Health Check
```
GET /health
```

Returns API status and database connectivity.

## Data Processing

### Input Processing
1. **Base64 Decode**: Decode incoming data parameter
2. **Validation**: Verify required fields and token
3. **Transformation**: Extract core fields from properties
4. **Storage**: Insert to PostgreSQL analytics table

### Field Mapping
- `event` → `event_name`
- `properties.distinct_id` → `distinct_id`
- Extract `user_id` from distinct_id or properties
- Extract `session_id` from properties
- Derive `platform` from `mp_lib` value
- Extract `country_code` from `mp_country_code`
- Convert Unix timestamp to PostgreSQL TIMESTAMPTZ
- Store remaining properties in `properties` JSONB

### Event Detail Extraction
- **Errors**: Extract from `error_message` or `error`
- **Workouts**: Extract from `workout_name` or `workout_type`
- **Purchases**: Extract from `product_name` or `subscription`
- **Search**: Extract from `search_term` or `query`
- **Navigation**: Extract from `page_name` or `section`

## Configuration

### Environment Variables
```bash
# Database connection
DB_HOST=postgress-dw-do-user-979029-0.b.db.ondigitalocean.com
DB_PORT=25060
DB_DATABASE=defaultdb
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_SSLMODE=require

# API configuration
ANALYTICS_TOKEN=td-analytics-token
PORT=3000
NODE_ENV=production
```

### mixpanel-lite Configuration
```javascript
mixpanel.init('td-analytics-token', {
    trackingUrl: 'https://analytics.trainerday.com/track?data=',
    engageUrl: 'https://analytics.trainerday.com/engage?data=',
    debug: true
});
```

## Development

### Setup
```bash
npm install
npm run dev  # Development with nodemon
npm start    # Production
```

### Testing
```bash
# Test database connection
node setup/test-db.js

# Test API endpoints
curl "http://localhost:3000/health"
```

## Deployment

Deploy as separate Dokku application for independent scaling:

```bash
# Add Dokku remote
git remote add dokku dokku@server:analytics-api

# Deploy
git push dokku main
```

## Setup & Migration

Complete your analytics setup in 4 easy steps:

### Step 1: Test Database Connection
```bash
# Verify PostgreSQL connectivity and credentials
node setup/1-test-database.js
```

### Step 2: Create Analytics Table
```bash
# Create the analytics table with optimized indexes
node setup/2-create-table.js
```

### Step 3: Download Mixpanel Data (Optional)
```bash
# Download historical data from Mixpanel
node setup/3-download-mixpanel.js --days-back 365

# Or for specific date range
node setup/3-download-mixpanel.js --start-date 2024-01-01 --end-date 2024-12-31

# For incremental updates
node setup/3-download-mixpanel.js --incremental
```

### Step 4: Import Mixpanel Data (Optional)
```bash
# Import downloaded Mixpanel data to PostgreSQL
node setup/4-import-mixpanel.js

# With custom options
node setup/4-import-mixpanel.js --batch-size 1000 --input-dir ./mixpanel_data
```

### Step 5: Switch Client-Side Tracking
```javascript
// Before: Standard Mixpanel
mixpanel.init('your-mixpanel-token');

// After: Your analytics API
mixpanel.init('your-analytics-token', {
    trackingUrl: 'https://your-domain.com/track?data=',
    engageUrl: 'https://your-domain.com/engage?data='
});
```

### Setup Scripts Included

**Core Setup (Required):**
- `1-test-database.js` - Test PostgreSQL connection and credentials
- `2-create-table.js` - Create analytics table with optimized indexes

**Migration Scripts (Optional):**
- `3-download-mixpanel.js` - Download historical data from Mixpanel API
- `4-import-mixpanel.js` - Transform and import Mixpanel data to PostgreSQL

**Verification:**
- `5-verify-setup.js` - Validate complete setup and data quality

### Step 5: Verify Setup
```bash
# Verify complete setup and data quality
node setup/5-verify-setup.js

# Check specific date ranges
node setup/5-verify-setup.js --start-date 2024-01-01 --end-date 2024-12-31
```

## Benefits

### Improved Query Performance
- **Time-based queries**: Native timestamp indexing vs JSON parsing
- **User analytics**: Direct user_id indexing vs string extraction
- **Platform analysis**: Structured platform field vs JSON scanning
- **Geographic analysis**: Dedicated country_code field
- **Error tracking**: Fast event_detail searching

### Data Ownership
- Full control over analytics data
- No vendor lock-in
- Integration with existing data warehouse
- Custom retention policies

### Cost Optimization
- Eliminate Mixpanel usage-based pricing
- Leverage existing PostgreSQL infrastructure
- Unlimited event volume