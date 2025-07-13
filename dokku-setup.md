# Dokku Deployment Guide

## Prerequisites

1. **SSL Certificate**: Copy `postgres.crt` to Dokku server
2. **Database Password**: Set sensitive environment variables manually
3. **Dokku App**: Ensure `analytics-api` app exists on Dokku

## Manual Steps Before Deployment

### 1. Copy SSL Certificate
```bash
# Copy certificate to Dokku server
scp postgres.crt dokku@prod.trainerday.com:/home/dokku/analytics-api/

# Mount certificate in container
ssh dokku@prod.trainerday.com
dokku storage:mount analytics-api /home/dokku/analytics-api/postgres.crt:/app/postgres.crt
```

### 2. Set Sensitive Environment Variables
```bash
ssh dokku@prod.trainerday.com
dokku config:set analytics-api DB_PASSWORD=MafHqU5x4JwXcZu3
dokku config:set analytics-api MIXPANEL_PASSWORD=tdqaGOIYi8zNirzKTQBP3MbzqkKhItwK
```

### 3. Create App (if needed)
```bash
ssh dokku@prod.trainerday.com
dokku apps:create analytics-api
dokku domains:add analytics-api analytics-api.trainerday.com
```

## Deployment

Run the deployment script:
```bash
./deploy-to-dokku.sh
```

Or manually:
```bash
git remote add dokku-analytics-api dokku@prod.trainerday.com:analytics-api
git push dokku-analytics-api master
```

## Post-Deployment Testing

1. **Health Check**: https://analytics-api.trainerday.com/health
2. **Demo Page**: https://analytics-api.trainerday.com/demo/index.html
3. **API Endpoints**:
   - Track: `https://analytics-api.trainerday.com/track?data=...`
   - Engage: `https://analytics-api.trainerday.com/engage?data=...`

## Update Client Configuration

After deployment, update your analytics-client configuration:

```javascript
analytics.init('td-analytics-token', {
    trackingUrl: 'https://analytics-api.trainerday.com/track?data=',
    engageUrl: 'https://analytics-api.trainerday.com/engage?data='
});
```

## Environment Variables Summary

**Set by script:**
- `NODE_ENV=production`
- `PORT=5000`
- `ANALYTICS_TOKEN=td-analytics-token`
- `DB_HOST=postgress-dw-do-user-979029-0.b.db.ondigitalocean.com`
- `DB_PORT=25060`
- `DB_DATABASE=defaultdb`
- `DB_USERNAME=doadmin`
- `DB_SSLMODE=require`
- `DB_SSLROOTCERT=postgres.crt`

**Set manually (sensitive):**
- `DB_PASSWORD=MafHqU5x4JwXcZu3`
- `MIXPANEL_PASSWORD=tdqaGOIYi8zNirzKTQBP3MbzqkKhItwK`

## Troubleshooting

- **Database connection issues**: Check SSL certificate mount and environment variables
- **Permission errors**: Ensure Dokku user has access to certificate file
- **Port conflicts**: Dokku automatically handles port mapping (internal 5000 → external 80/443)