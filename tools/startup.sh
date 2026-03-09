docker compose -f docker-compose.prod.yml pull
docker compose down
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
