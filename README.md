# Analytics API

Open-source analytics API that provides a self-hosted alternative to popular analytics services, storing events in your own PostgreSQL database for improved querying, data ownership, and cost optimization.

## 🚀 Quick Start

1. **Clone and install**: `git clone && npm install`
2. **Follow setup instructions**: See [setup/README.md](./setup/README.md) for complete setup guide
3. **Start the API**: `npm start`
4. **Test with demo**: Visit http://localhost:3000/demo/index.html
5. **Integrate client**: Use [analytics-client](https://github.com/trainerday/analytics-client) library

## ✨ Features

- 🔄 **Drop-in compatibility** - Works with [analytics-client](https://github.com/trainerday/analytics-client) library
- 🎯 **Interactive demo** - Complete testing interface at `/demo/index.html`
- 📊 **Optimized PostgreSQL schema** - Better performance than external analytics services
- 🏠 **Data ownership** - Your data stays in your infrastructure
- 💰 **Cost savings** - Eliminate per-event pricing from SaaS analytics
- 🛠️ **Complete migration tools** - Export historical data from existing analytics providers
- 🔍 **Better querying** - Direct SQL access instead of limited dashboard interfaces

## Purpose

This API acts as a self-hosted alternative to external analytics services, allowing TrainerDay to:
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

Handles event tracking calls from analytics-client library.

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

Handles user profile updates from analytics-client library.

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

The API provides a seamless self-hosted analytics solution:

1. **Receives events** in standard base64-encoded format
2. **Processes and optimizes** data structure for PostgreSQL
3. **Performs identity stitching** to link anonymous and identified users
4. **Stores in optimized schema** with proper indexing for fast queries

For detailed data processing and field mapping documentation, see the [Setup Guide](./setup/README.md).

## Configuration

Configure your PostgreSQL database connection and update your analytics-client to point to your API endpoints.

See the [Setup Guide](./setup/README.md) for complete configuration instructions including:
- Database connection setup
- Environment variables
- Client integration
- SSL certificate configuration

## Client Integration

Use the [analytics-client](https://github.com/trainerday/analytics-client) library to connect to your self-hosted API:

### Installation

**Option 1: NPM (Recommended)**
```bash
npm install @trainerday/analytics-client
```

**Option 2: CDN**
```html
<script src="https://unpkg.com/@trainerday/analytics-client@latest/dist/analytics-client.min.js"></script>
```

### Configuration  
```javascript
// Alias for cleaner code
var analytics = mixpanel;

// Point to your self-hosted API
analytics.init('your-analytics-token', {
    trackingUrl: 'https://your-domain.com/track?data=',
    engageUrl: 'https://your-domain.com/engage?data='
});

// Use standard analytics methods
analytics.track('Event Name', { property: 'value' });
analytics.identify('user@email.com');
analytics.people.set({ $email: 'user@email.com' });
```

**Demo**: Test the complete integration at `/demo/index.html` when your API is running.

## Testing & Development

### Demo Page
A comprehensive demo page is available at `/demo/index.html` when the server is running:

```bash
npm start
# Open http://localhost:3000/demo/index.html
```

The demo page includes:
- 🎯 **Event tracking tests** (Page View, Button Click, Custom Events)
- 👤 **User identification** and profile management
- ⚙️ **Analytics controls** (mute/unmute, reset)
- 📊 **API health monitoring** with real-time metrics
- 📝 **Debug console** showing all client-server communication

### Development Commands

```bash
npm install
npm run dev  # Development with nodemon
npm start    # Production
```

For complete database setup, migration tools, and deployment instructions, see the [Setup Guide](./setup/README.md).

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