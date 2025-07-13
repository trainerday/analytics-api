# Migration Scripts

Complete toolset for migrating from Mixpanel to your own PostgreSQL analytics infrastructure.

## Setup

1. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your database and Mixpanel credentials
   ```

2. **Install Python dependencies (for Mixpanel export):**
   ```bash
   pip install requests python-dotenv psycopg2-binary
   ```

## Migration Process

### 1. Test Database Connection
```bash
# Test with Python
python3 scripts/test-db-connection.py

# Test with Node.js (once implemented)
node scripts/test-db-connection.js
```

### 2. Create Analytics Table
```bash
node scripts/create-analytics-table.js
```

### 3. Export Mixpanel Data
```bash
# Incremental download (recommended for ongoing sync)
python3 scripts/mixpanel-exporter.py --mode incremental

# Full historical download
python3 scripts/mixpanel-exporter.py --mode full --days-back 730

# Specific date range
python3 scripts/mixpanel-exporter.py \
  --mode full \
  --start-date 2024-01-01 \
  --end-date 2024-12-31
```

### 4. Import to PostgreSQL
```bash
# Import all downloaded data
node scripts/import-mixpanel-data.js --input-dir ./mixpanel_data

# Import specific files
node scripts/import-mixpanel-data.js \
  --input-dir ./mixpanel_data \
  --start-date 2024-01-01 \
  --batch-size 1000
```

### 5. Verify Migration
```bash
# Check data quality and counts
node scripts/verify-migration.js

# Compare with original Mixpanel data
node scripts/compare-counts.js --date 2024-07-12
```

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