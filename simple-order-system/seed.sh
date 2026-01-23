#!/bin/bash

echo "🌱 Seeding database with example data..."

# Check if containers are running
if ! docker-compose ps | grep -q "order-system-postgres"; then
    echo "❌ Error: PostgreSQL container is not running"
    echo "Run 'docker-compose up -d' first"
    exit 1
fi

# Import seed data
docker-compose exec -T postgres psql -U orderuser -d orderdb < seed.sql

if [ $? -eq 0 ]; then
    echo "✅ Database seeded successfully!"
    echo ""
    echo "You can now:"
    echo "  - Open http://localhost:8080 to start ordering"
    echo "  - Open http://localhost:8081 for kitchen display"
else
    echo "❌ Failed to seed database"
    exit 1
fi
