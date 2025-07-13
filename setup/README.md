# Setup Scripts

Complete your analytics setup in 4 sequential steps. Each script handles one specific task to make the process clear and debuggable.

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

## Script Details

| Script | Purpose | Language |
|--------|---------|----------|
| `test-db-connection.py` | Test PostgreSQL connectivity | Python |
| `test-db-connection.js` | Test PostgreSQL connectivity | Node.js |
| `create-analytics-table.js` | Create analytics table with indexes | Node.js |
| `mixpanel-exporter.py` | Download data from Mixpanel API | Python |
| `import-mixpanel-data.js` | Transform and load Mixpanel JSON | Node.js |
| `verify-migration.js` | Validate migration completeness | Node.js |
| `compare-counts.js` | Compare event counts by date | Node.js |

## Configuration

### Database SSL Certificate

If your PostgreSQL instance requires an SSL certificate:

1. Download your certificate file (usually `ca-certificate.crt`)
2. Place it in the project root
3. Update your `.env`:
   ```
   DB_SSLROOTCERT=ca-certificate.crt
   ```

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

**Rate Limiting**: Mixpanel limits to 60 queries/hour. The exporter automatically handles this.

**Large Datasets**: For projects with millions of events, consider:
- Using date ranges to split the export
- Increasing batch size for imports
- Running imports during off-peak hours

**Memory Issues**: If Node.js runs out of memory:
```bash
node --max-old-space-size=4096 scripts/import-mixpanel-data.js
```