# Analytics API

Open-source analytics API that provides a drop-in replacement for Mixpanel, storing events in your own PostgreSQL database for improved querying, data ownership, and cost optimization.

## 🚀 Quick Start

1. **Clone and install**: `git clone && npm install`
2. **Follow setup instructions**: See [setup/README.md](./setup/README.md) for complete setup guide
3. **Start the API**: `npm run dev`
4. **Update your client**: Point Mixpanel endpoints to your API

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

## Database Architecture

This API uses an optimized PostgreSQL schema with advanced identity stitching capabilities:

- **3 tables**: `analytics` (events), `analytics_users` (profiles), `identity_mappings` (user journeys)
- **24 optimized indexes** for fast querying across all analytics dimensions
- **Industry-grade identity resolution** with retroactive event linking
- **Device persistence** and cross-platform user tracking

For complete database schema, setup instructions, and migration tools, see:

**📋 [Setup Guide](./setup/README.md)** - Complete technical documentation

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

## How It Works

The API provides a seamless drop-in replacement for Mixpanel:

1. **Receives events** in Mixpanel's base64-encoded format
2. **Processes and optimizes** data structure for PostgreSQL
3. **Performs identity stitching** to link anonymous and identified users
4. **Stores in optimized schema** with proper indexing for fast queries

For detailed data processing and field mapping documentation, see the [Setup Guide](./setup/README.md).

## Configuration

Configure your PostgreSQL database connection and update your mixpanel-lite client to point to your API endpoints.

See the [Setup Guide](./setup/README.md) for complete configuration instructions including:
- Database connection setup
- Environment variables
- Client integration
- SSL certificate configuration

## Development

```bash
npm install
npm run dev  # Development with nodemon
npm start    # Production
```

For testing, database setup, and deployment instructions, see the [Setup Guide](./setup/README.md).

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