#!/bin/bash

# Deploy analytics-api to Dokku production
set -e

APP_NAME="analytics-api"
DOKKU_HOST="dokku@prod.trainerday.com"

echo "🚀 Deploying analytics-api to Dokku..."

# Add dokku remote if it doesn't exist
if ! git remote | grep -q "dokku-analytics-api"; then
    echo "📡 Adding Dokku remote..."
    git remote add dokku-analytics-api "$DOKKU_HOST:$APP_NAME"
fi

echo "⚙️  Setting up environment variables on Dokku..."

# Set environment variables (excluding sensitive ones that should be set manually)
dokku config:set analytics-api \
    NODE_ENV=production \
    PORT=5000 \
    ANALYTICS_TOKEN=td-analytics-token \
    DB_HOST=postgress-dw-do-user-979029-0.b.db.ondigitalocean.com \
    DB_PORT=25060 \
    DB_DATABASE=defaultdb \
    DB_USERNAME=doadmin \
    DB_SSLMODE=require \
    DB_SSLROOTCERT=postgres.crt

echo "🔐 You need to manually set the database password:"
echo "   dokku config:set analytics-api DB_PASSWORD=MafHqU5x4JwXcZu3"

echo "📄 You need to manually copy the SSL certificate:"
echo "   scp postgres.crt $DOKKU_HOST:/home/dokku/analytics-api/"
echo "   dokku storage:mount analytics-api /home/dokku/analytics-api/postgres.crt:/app/postgres.crt"

echo "🏗️  Deploying to Dokku..."
git push dokku-analytics-api master

echo "✅ Deployment complete!"
echo "🌐 Your analytics API should be available at: https://analytics-api.trainerday.com"
echo ""
echo "🧪 Test endpoints:"
echo "   https://analytics-api.trainerday.com/health"
echo "   https://analytics-api.trainerday.com/demo/index.html"